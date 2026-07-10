import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";

import {
  buildOperationsAssistantSnapshot,
  buildPmAssistantSnapshot,
  matchFeishuRecordToProject,
  type AssistantProjectIdentity,
} from "../src/features/operating-assistant/snapshot.ts";
import {
  buildBusinessUpdateFeishuPayload,
  buildAssistantChangeDraftInsert,
  parseAssistantChangeDraftInput,
  validateDraftChangesAgainstSnapshot,
} from "../src/features/operating-assistant/change-draft.ts";
import {
  buildFeishuActionPreview,
  validateFeishuActionBody,
} from "../src/features/feishu/action-payload.ts";
import {
  businessWritebackFactsMatch,
  businessWritebackPayloadMatchesDraft,
  decideBusinessWritebackLedgerAction,
  isBusinessWritebackLeaseLive,
  normalizeBusinessWritebackFields,
} from "../src/features/operating-assistant/writeback-values.ts";
import { executeFeishuAction } from "../src/features/feishu/action-payload.ts";
import type { FeishuConfig } from "../src/features/feishu/config.ts";
import {
  buildFeishuConfirmationRiskReview,
  type FeishuActionConfirmationRecord,
} from "../src/features/feishu/action-confirmations.ts";

const identities: AssistantProjectIdentity[] = [
  {
    projectId: "project-1",
    projectName: "客户交付一期",
    sourceRecordId: "rec-project-1",
    externalProjectCode: "P-001",
    dataClass: "production",
  },
  {
    projectId: "project-2",
    projectName: "同名项目",
    sourceRecordId: "rec-project-2",
    externalProjectCode: "P-002",
    dataClass: "production",
  },
];

test("assistant links Feishu facts by stable record ID or project code and never by project name alone", () => {
  assert.equal(matchFeishuRecordToProject({ recordId: "rec-project-1", fields: { 项目名称: "错误名称" } }, identities)?.projectId, "project-1");
  assert.equal(matchFeishuRecordToProject({ recordId: "milestone-2", fields: { 关联项目ID: "rec-project-1" } }, identities)?.projectId, "project-1");
  assert.equal(matchFeishuRecordToProject({ recordId: "risk-1", fields: { 项目编号: "P-002", 项目名称: "客户交付一期" } }, identities)?.projectId, "project-2");
  assert.equal(matchFeishuRecordToProject({ recordId: "risk-2", fields: { 项目名称: "客户交付一期" } }, identities), null);
});

test("PM assistant exposes commitments milestones risks and persisted actions without demo fallback", () => {
  const snapshot = buildPmAssistantSnapshot({
    identities,
    projects: [{
      recordId: "rec-project-1",
      fields: {
        项目编号: "P-001",
        项目名称: "客户交付一期",
        客户承诺日期: "2026-08-31",
        预测完成日期: "2026-09-03",
        当前进度: 65,
        项目状态: "执行中",
      },
    }],
    milestones: [{
      recordId: "milestone-1",
      fields: { 项目编号: "P-001", 里程碑名称: "上线验收", 基线日期: "2026-08-31", 预测日期: "2026-09-03", 状态: "进行中", 责任人: "张三" },
    }],
    risks: [{
      recordId: "risk-1",
      fields: { 项目编号: "P-001", 风险描述: "客户验收窗口可能推迟", 风险等级: "高", 状态: "应对中", 风险责任人: "李四", 截止日期: "2026-07-20" },
    }],
    actions: [{
      id: "action-1", project_id: "project-1", title: "确认验收窗口", status: "accepted", priority: "P0", due_date: "2026-07-18", owner_name: "张三",
    }],
    sourceWarnings: [],
  });

  assert.equal(snapshot.role, "pm");
  assert.equal(snapshot.projects.length, 1);
  assert.deepEqual(snapshot.projects[0].commitment, {
    customerDueDate: "2026-08-31",
    forecastDueDate: "2026-09-03",
    status: "执行中",
    progress: 65,
    sourceRecordId: "rec-project-1",
  });
  assert.equal(snapshot.milestones[0].sourceRecordId, "milestone-1");
  assert.equal(snapshot.risks[0].sourceRecordId, "risk-1");
  assert.equal(snapshot.actions[0].id, "action-1");
  assert.equal(snapshot.source.fallbackUsed, false);
});

test("operations assistant derives acceptance invoice receivable collection and cash forecast only from actual facts", () => {
  const snapshot = buildOperationsAssistantSnapshot({
    identities,
    projects: [{
      recordId: "rec-project-1",
      fields: { 项目编号: "P-001", 项目名称: "客户交付一期", 验收状态: "验收中", 预计验收日期: "2026-07-25" },
    }],
    contracts: [{
      recordId: "contract-1",
      fields: { 项目编号: "P-001", 合同编号: "C-001", 合同金额: 100, 合同状态: "生效", 付款条件: "验收后30天" },
    }],
    payments: [
      { recordId: "payment-1", fields: { 项目编号: "P-001", 合同编号: "C-001", 应收金额: 60, 已回款金额: 20, 计划回款日期: "2026-08-15", 开票金额: 60, 开票日期: "2026-07-10", 发票状态: "已开票" } },
      { recordId: "payment-2", fields: { 项目编号: "P-001", 合同编号: "C-001", 应收金额: 40, 已回款金额: 0, 计划回款日期: "2026-09-15" } },
    ],
    sourceWarnings: [],
  });

  assert.equal(snapshot.role, "operations");
  assert.equal(snapshot.contracts[0].amount, 100);
  assert.equal(snapshot.acceptances[0].status, "验收中");
  assert.equal(snapshot.invoices[0].amount, 60);
  assert.equal(snapshot.receivables[0].outstandingAmount, 40);
  assert.deepEqual(snapshot.cashForecast.map(item => ({ month: item.month, amount: item.amount })), [
    { month: "2026-08", amount: 40 },
    { month: "2026-09", amount: 40 },
  ]);
  assert.equal(snapshot.source.fallbackUsed, false);
});

test("change draft accepts only changed allowlisted fields and preserves expected current value", () => {
  const parsed = parseAssistantChangeDraftInput({
    role: "pm",
    projectId: "project-1",
    sourceType: "milestone",
    sourceRecordId: "milestone-1",
    changes: [{ field: "预测日期", currentValue: "2026-09-03", proposedValue: "2026-09-05", reason: "客户验收窗口调整" }],
  });
  assert.equal(parsed.changes.length, 1);
  assert.equal(parsed.changes[0].field, "预测日期");
  assert.throws(() => parseAssistantChangeDraftInput({
    role: "pm", projectId: "project-1", sourceType: "milestone", sourceRecordId: "milestone-1",
    changes: [{ field: "预测日期", currentValue: "2026-09-03", proposedValue: "2026-09-03", reason: "无变化" }],
  }), /没有发生变化/);
  assert.throws(() => parseAssistantChangeDraftInput({
    role: "operations", projectId: "project-1", sourceType: "payment", sourceRecordId: "payment-1",
    changes: [{ field: "项目名称", currentValue: "A", proposedValue: "B", reason: "越权修改" }],
  }), /不允许/);
});

test("draft validation rejects stale current values before creating a confirmation", () => {
  const parsed = parseAssistantChangeDraftInput({
    role: "operations",
    projectId: "project-1",
    sourceType: "payment",
    sourceRecordId: "payment-1",
    changes: [{ field: "计划回款日期", currentValue: "2026-08-15", proposedValue: "2026-08-20", reason: "客户付款批次调整" }],
  });
  assert.throws(() => validateDraftChangesAgainstSnapshot(parsed, { 计划回款日期: "2026-08-16" }), /事实已发生变化/);
  assert.doesNotThrow(() => validateDraftChangesAgainstSnapshot(parsed, { 计划回款日期: "2026-08-15" }));
});

test("draft insert is pending confirmation and never marks itself as written back", () => {
  const payload = buildAssistantChangeDraftInsert({
    input: parseAssistantChangeDraftInput({
      role: "operations",
      projectId: "project-1",
      sourceType: "payment",
      sourceRecordId: "payment-1",
      changes: [{ field: "计划回款日期", currentValue: "2026-08-15", proposedValue: "2026-08-20", reason: "客户付款批次调整" }],
    }),
    actorUserId: "user-1",
    orgId: "org-1",
    subjectScope: "project",
    subjectId: "project-1",
    dataClass: "production",
    requestId: "request-1",
  });
  assert.equal(payload.status, "pending_confirmation");
  assert.equal(payload.writeback_status, "not_requested");
  assert.equal(payload.requested_by, "user-1");
});

test("confirmed business changes build a stable Chinese-field Base update payload", () => {
  const payload = buildBusinessUpdateFeishuPayload({
    draftId: "draft-1",
    orgId: "org-1",
    projectId: "project-1",
    dataClass: "production" as const,
    sourceType: "milestone" as const,
    sourceRecordId: "rec-milestone-1",
    version: 1,
    changes: [
      { field: "预测日期", currentValue: "2026-09-03", proposedValue: "2026-09-05", reason: "客户验收窗口调整" },
      { field: "影响验收", currentValue: false, proposedValue: true, reason: "验收路径发生变化" },
    ],
  });

  assert.equal(payload.type, "base_record_update");
  assert.equal(payload.table_key, "milestone");
  assert.equal(payload.record_id, "rec-milestone-1");
  assert.deepEqual(payload.fields, { 预测日期: "2026-09-05", 影响验收: true });
  assert.deepEqual(payload.expected_fields, { 预测日期: "2026-09-03", 影响验收: false });
  assert.equal(validateFeishuActionBody(payload).actionType, "base_record_update");
  const preview = buildFeishuActionPreview(payload);
  assert.equal(preview.targetType, "飞书多维表格记录");
  assert.match(preview.targetSummary, /milestone.*rec-milestone-1/);
  assert.equal(preview.riskLevel, "high");
});

test("Base update payload rejects non-Chinese business field names and action sources", () => {
  assert.throws(() => validateFeishuActionBody({
    type: "base_record_update",
    idempotency_key: "draft-1",
    business_update_draft_id: "draft-1",
    org_id: "org-1",
    project_id: "project-1",
    data_class: "production",
    table_key: "milestone",
    record_id: "rec-1",
    fields: { forecast_date: "2026-09-05" },
    expected_fields: { forecast_date: "2026-09-03" },
  }), /中文/);
  assert.throws(() => buildBusinessUpdateFeishuPayload({
    draftId: "draft-action",
    orgId: "org-1",
    projectId: "project-1",
    dataClass: "production",
    sourceType: "action",
    sourceRecordId: "action-1",
    version: 1,
    changes: [{ field: "状态", currentValue: "assigned", proposedValue: "done", reason: "已完成" }],
  }), /行动项.*不能进入飞书/);
});

test("writeback normalization preserves Feishu field types and supports idempotent fact comparison", () => {
  const fields = normalizeBusinessWritebackFields({
    proposed: { 预测日期: "2026-09-05", 完成进度: "72", 影响验收: "是" },
    current: { 预测日期: 1788537600000, 完成进度: 65, 影响验收: false },
  });
  assert.equal(typeof fields.预测日期, "number");
  assert.equal(fields.完成进度, 72);
  assert.equal(fields.影响验收, true);
  assert.equal(businessWritebackFactsMatch({ 预测日期: "2026-09-05" }, { 预测日期: fields.预测日期 }), true);
  assert.equal(businessWritebackFactsMatch({ 完成进度: "72" }, { 完成进度: 71 }), false);
});

test("writeback rejects a queue payload whose values no longer match the immutable draft", () => {
  const draft = {
    id: "draft-1",
    orgId: "org-1",
    projectId: "project-1",
    dataClass: "production" as const,
    sourceType: "milestone" as const,
    sourceRecordId: "rec-milestone-1",
    version: 2,
    changes: [{ field: "预测日期", currentValue: "2026-09-03", proposedValue: "2026-09-05", reason: "窗口调整" }],
  };
  const valid = buildBusinessUpdateFeishuPayload({ ...draft, draftId: draft.id });
  assert.equal(businessWritebackPayloadMatchesDraft(valid, draft), true);
  assert.equal(businessWritebackPayloadMatchesDraft({ ...valid, fields: { 预测日期: "2026-10-01" } }, draft), false);
  assert.equal(businessWritebackPayloadMatchesDraft({ ...valid, idempotency_key: "tampered" }, draft), false);
});

test("ledger recovery writes only pending or reclaimed attempts and blocks divergent completed events", () => {
  assert.equal(decideBusinessWritebackLedgerAction({ claimed: true, status: "pending", alreadyApplied: false }), "write");
  assert.equal(decideBusinessWritebackLedgerAction({ claimed: false, status: "pending", alreadyApplied: false }), "write");
  assert.equal(decideBusinessWritebackLedgerAction({ claimed: false, status: "succeeded", alreadyApplied: true }), "reconcile");
  assert.equal(decideBusinessWritebackLedgerAction({ claimed: false, status: "succeeded", alreadyApplied: false }), "conflict");
  assert.equal(decideBusinessWritebackLedgerAction({ claimed: false, status: "failed", alreadyApplied: false }), "retry_exhausted");
  assert.equal(decideBusinessWritebackLedgerAction({ claimed: false, status: "unknown", alreadyApplied: false }), "conflict");
  assert.equal(isBusinessWritebackLeaseLive("2026-07-10T08:10:00.000Z", Date.parse("2026-07-10T08:09:54.000Z")), true);
  assert.equal(isBusinessWritebackLeaseLive("2026-07-10T08:10:00.000Z", Date.parse("2026-07-10T08:09:56.000Z")), false);
});

test("generic Feishu action executor cannot bypass the controlled Base writeback state machine", async () => {
  const config = {
    appId: "app",
    appSecret: "secret",
    baseToken: "base",
    tables: { milestone: "tbl-milestone" },
  } as FeishuConfig;
  await assert.rejects(() => executeFeishuAction(config, {
    type: "base_record_update",
    idempotency_key: "business-update-draft:draft-1:v2",
    business_update_draft_id: "draft-1",
    org_id: "org-1",
    project_id: "project-1",
    data_class: "production",
    table_key: "milestone",
    record_id: "rec-milestone-1",
    fields: { 预测日期: "2026-09-05" },
    expected_fields: { 预测日期: "2026-09-03" },
  }), /受控业务写回/);
});

test("an interrupted Base writeback is recoverable only after its database lease expires", () => {
  const confirmation: FeishuActionConfirmationRecord = {
    id: "confirmation-1",
    requesterId: "user-1",
    requesterName: "项目经理",
    requesterEmail: null,
    source: "integration_center",
    sourcePage: "/business-assistant",
    actionType: "base_record_update",
    idempotencyKey: "business-update-draft:draft-1:v2",
    targetSummary: "更新里程碑",
    riskLevel: "high",
    status: "writing",
    payload: {
      type: "base_record_update",
      idempotency_key: "business-update-draft:draft-1:v2",
      business_update_draft_id: "draft-1",
      org_id: "org-1",
      project_id: "project-1",
      data_class: "production",
      table_key: "milestone",
      record_id: "rec-milestone-1",
      fields: { 预测日期: "2026-09-05" },
      expected_fields: { 预测日期: "2026-09-03" },
    },
    preview: buildFeishuActionPreview({
      type: "base_record_update",
      idempotency_key: "business-update-draft:draft-1:v2",
      business_update_draft_id: "draft-1",
      org_id: "org-1",
      project_id: "project-1",
      data_class: "production",
      table_key: "milestone",
      record_id: "rec-milestone-1",
      fields: { 预测日期: "2026-09-05" },
      expected_fields: { 预测日期: "2026-09-03" },
    }),
    resource: null,
    errorCode: null,
    cancelReason: null,
    requestId: "request-1",
    createdAt: "2026-07-10T08:00:00.000Z",
    confirmedAt: "2026-07-10T08:01:00.000Z",
    executedAt: null,
    cancelledAt: null,
    writebackLeaseExpiresAt: "2026-07-10T08:10:00.000Z",
  };
  const actor = { id: "user-1", email: "pm@example.com", phone: "13800138000", name: "项目经理", role: "user", status: "active" } as const;
  assert.equal(buildFeishuConfirmationRiskReview(confirmation, { user: actor, now: new Date("2026-07-10T08:05:00.000Z") }).canConfirm, false);
  const expired = buildFeishuConfirmationRiskReview(confirmation, { user: actor, now: new Date("2026-07-10T08:11:00.000Z") });
  assert.equal(expired.canConfirm, true);
  assert.equal(expired.requiresSecondConfirm, true);
  assert.ok(expired.checklist.some(item => item.id === "recovery" && item.status === "warning"));
});

test("P19 migration stores service-only drafts with RLS and explicit lifecycle constraints", () => {
  const directory = new URL("../supabase/migrations/", import.meta.url);
  const name = readdirSync(directory).find(value => value.endsWith("_p19_business_assistant.sql"));
  assert.ok(name);
  const sql = readFileSync(new URL(name!, directory), "utf8");
  assert.match(sql, /create table if not exists public\.business_update_drafts/i);
  assert.match(sql, /pending_confirmation/i);
  assert.match(sql, /writeback_status/i);
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /revoke all on table public\.business_update_drafts from anon, authenticated/i);
  assert.match(sql, /grant select, insert, update, delete on table public\.business_update_drafts to service_role/i);
});

test("P19 writeback migration atomically links drafts to Base confirmations and lifecycle status", () => {
  const directory = new URL("../supabase/migrations/", import.meta.url);
  const name = readdirSync(directory).find(value => value.endsWith("_p19_business_assistant_writeback.sql"));
  assert.ok(name);
  const sql = readFileSync(new URL(name!, directory), "utf8");
  assert.match(sql, /feishu_confirmation_id/i);
  assert.match(sql, /base_record_update/i);
  assert.match(sql, /queue_business_update_draft_writeback_tx/i);
  assert.match(sql, /claim_business_update_writeback_tx/i);
  assert.match(sql, /finalize_business_update_writeback_tx/i);
  assert.match(sql, /cancel_business_update_writeback_tx/i);
  assert.match(sql, /for update/i);
  assert.match(sql, /writeback_lease_expires_at/i);
  assert.match(sql, /writeback_attempt_count/i);
  assert.match(sql, /p_expected_attempt/i);
  assert.match(sql, /P19_WRITEBACK_FENCING_TOKEN_MISMATCH/i);
  assert.match(sql, /p_payload->'fields'\s+is distinct from\s+v_proposed_fields/i);
  assert.match(sql, /v_draft\.version\s*\+\s*1/i);
  assert.match(sql, /interval '5 minutes'/i);
  assert.match(sql, /grant execute on function public\.queue_business_update_draft_writeback_tx[\s\S]*service_role/i);
});

test("P19 Base queue cancellation keeps the linked draft lifecycle consistent", () => {
  const route = readFileSync(new URL("../src/app/api/integrations/feishu/actions/confirmations/[id]/cancel/route.ts", import.meta.url), "utf8");
  assert.match(route, /base_record_update/);
  assert.match(route, /cancelBusinessUpdateWriteback/);
});

test("P19 API queues drafts and contains no direct Feishu write call", () => {
  const route = readFileSync(new URL("../src/app/api/business-assistant/change-drafts/route.ts", import.meta.url), "utf8");
  assert.match(route, /requireAuthenticatedApiUser/);
  assert.match(route, /createBusinessUpdateDraft/);
  assert.doesNotMatch(route, /updateRecord|executeFeishuAction|createRecord/);
  assert.match(route, /confirmation_required/);
});

test("P19 draft decision requires explicit confirmation and atomically queues a Base update preview", () => {
  const route = readFileSync(new URL("../src/app/api/business-assistant/change-drafts/[id]/route.ts", import.meta.url), "utf8");
  assert.match(route, /confirm !== true/);
  assert.match(route, /queueBusinessUpdateDraftWriteback/);
  assert.match(route, /writeback_status: "queued"/);
  assert.match(route, /feishu_confirmation_id/);
  assert.doesNotMatch(route, /updateRecord|executeFeishuAction|createRecord/);
});

test("P19 final confirmation executes Base updates only through the guarded confirmation route", () => {
  const route = readFileSync(new URL("../src/app/api/integrations/feishu/actions/confirmations/[id]/confirm/route.ts", import.meta.url), "utf8");
  const writeback = readFileSync(new URL("../src/features/operating-assistant/writeback.ts", import.meta.url), "utf8");
  assert.match(route, /executeBusinessUpdateWriteback/);
  assert.match(route, /base_record_update/);
  assert.match(writeback, /current facts|CURRENT_FACT/i);
  assert.match(writeback, /getUserFeishuConfig/);
  assert.match(writeback, /claimBusinessUpdateWriteback/);
  assert.match(writeback, /finalizeBusinessUpdateWriteback/);
});

test("P19 role assistant page uses the selected context and auto-populates current facts for delta input", () => {
  const page = readFileSync(new URL("../src/app/business-assistant/page.tsx", import.meta.url), "utf8");
  assert.match(page, /businessContextSearchParams/);
  assert.match(page, /项目承诺与里程碑/);
  assert.match(page, /合同到现金/);
  assert.match(page, /editableFacts/);
  assert.match(page, /currentValue:/);
  assert.match(page, /待确认变化草稿/);
  assert.match(page, /\/integration-center/);
  assert.match(page, /写回状态/);
  assert.doesNotMatch(page, /DEFAULT_DASHBOARD_DATA|demoData|mockData/);
});

test("P19 confirmation center exposes an explicit recovery action for an expired writing lease", () => {
  const page = readFileSync(new URL("../src/app/integration-center/page.tsx", import.meta.url), "utf8");
  assert.match(page, /item\.status === "writing" && item\.riskReview\?\.canConfirm === true/);
  assert.match(page, /恢复并对账/);
  assert.match(page, /writebackAttemptCount/);
});
