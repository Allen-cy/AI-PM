import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";

import {
  parseBusinessRoleAssignmentInput,
  resolveBusinessContext,
  resolveBusinessContextForResource,
  type BusinessRoleAssignment,
} from "../src/features/operating-model/context.ts";
import {
  canPerformBusinessAction,
  canReadBusinessField,
  filterBusinessRecordFields,
} from "../src/features/operating-model/authorization.ts";
import {
  findProjectIdentityMatch,
  type ProjectIdentity,
} from "../src/features/operating-model/identity.ts";
import {
  evaluateMilestoneDelay,
  parseMilestoneSignalRequest,
  transitionManagementSignal,
} from "../src/features/operating-model/signals.ts";
import {
  isPublicRequestPath,
  resolveRequestAccess,
} from "../src/features/auth/api-access.ts";
import { validateActionClosureEvidence } from "../src/features/operating-model/actions.ts";
import { normalizeFeishuProjectIdentityCandidate } from "../src/features/operating-model/feishu-project.ts";
import { parseVerifiedFeishuMilestone } from "../src/features/operating-model/milestone-source-parser.ts";
import { parseFeishuAmount } from "../src/features/operating-model/feishu-value.ts";
import { buildOperationalWorkbench } from "../src/features/operating-system/workbench.ts";
import { planProjectIdentityBackfill } from "../src/features/operating-model/project-identity-backfill.ts";
import { buildDashboardRowsFromFeishu } from "../src/features/dashboard/feishu.ts";
import {
  buildSignalActionInsert,
  buildSignalEscalationInsert,
  buildManagementSignalInsert,
  mapBusinessRoleAssignment,
} from "../src/features/operating-model/repository.ts";

test("system admin does not become CEO without an active scoped business assignment", () => {
  const assignments: BusinessRoleAssignment[] = [
    {
      id: "assignment-pmo",
      userId: "user-1",
      businessRole: "pmo",
      orgId: "org-1",
      subjectScope: "portfolio",
      subjectId: "portfolio-1",
      status: "active",
      validFrom: "2026-07-01T00:00:00.000Z",
      validUntil: null,
    },
  ];

  assert.equal(resolveBusinessContext({
    user: { id: "user-1", systemRole: "admin" },
    assignments,
    requestedRole: "ceo",
    requestedOrgId: "org-1",
    requestedSubjectScope: "portfolio",
    requestedSubjectId: "portfolio-1",
    now: new Date("2026-07-10T00:00:00.000Z"),
  }), null);

  assert.deepEqual(resolveBusinessContext({
    user: { id: "user-1", systemRole: "admin" },
    assignments,
    requestedRole: "pmo",
    requestedOrgId: "org-1",
    requestedSubjectScope: "portfolio",
    requestedSubjectId: "portfolio-1",
    now: new Date("2026-07-10T00:00:00.000Z"),
  }), {
    actorUserId: "user-1",
    systemRole: "admin",
    businessRole: "pmo",
    orgId: "org-1",
    subjectScope: "portfolio",
    subjectId: "portfolio-1",
    assignmentId: "assignment-pmo",
  });
});

test("business role assignment requires explicit user role organization subject and validity", () => {
  assert.deepEqual(parseBusinessRoleAssignmentInput({
    userId: "user-1",
    businessRole: "pmo",
    orgId: "org-1",
    subjectScope: "project",
    subjectId: "project-1",
    validFrom: "2026-07-10T00:00:00.000Z",
    validUntil: "2026-12-31T00:00:00.000Z",
  }), {
    userId: "user-1",
    businessRole: "pmo",
    orgId: "org-1",
    subjectScope: "project",
    subjectId: "project-1",
    validFrom: "2026-07-10T00:00:00.000Z",
    validUntil: "2026-12-31T00:00:00.000Z",
    delegatedFromUserId: null,
    assignmentReason: null,
  });
  assert.throws(() => parseBusinessRoleAssignmentInput({ businessRole: "ceo" }), /必填/);
});

test("repository mapping preserves scoped role validity and signal subject identity", () => {
  assert.deepEqual(mapBusinessRoleAssignment({
    id: "role-1",
    user_id: "user-1",
    business_role: "pm",
    org_id: "org-1",
    subject_scope: "project",
    subject_id: "project-1",
    status: "active",
    valid_from: "2026-07-01T00:00:00.000Z",
    valid_until: null,
    delegated_from_user_id: null,
  }), {
    id: "role-1",
    userId: "user-1",
    businessRole: "pm",
    orgId: "org-1",
    subjectScope: "project",
    subjectId: "project-1",
    status: "active",
    validFrom: "2026-07-01T00:00:00.000Z",
    validUntil: null,
    delegatedFromUserId: null,
  });

  const payload = buildManagementSignalInsert({
    evaluation: {
      ruleVersion: "S1-MILESTONE-DELAY-v1",
      triggered: true,
      deviationWorkdays: 4,
      route: "escalation",
      nextStatus: "pending_verification",
      dedupKey: "dedup-1",
      impactReasons: ["cash"],
      slaDueAt: "2026-07-11T00:00:00.000Z",
    },
    orgId: "org-1",
    projectId: "project-1",
    milestoneId: "milestone-1",
    baselineVersion: "baseline-v1",
    dataClass: "test",
    ownerUserId: "user-pm",
    sourceId: "record-milestone-1",
  });
  assert.equal(payload.subject_scope, "project");
  assert.equal(payload.subject_id, "project-1");
  assert.equal(payload.project_id, "project-1");
  assert.equal(payload.status, "pending_verification");
  assert.equal(payload.data_class, "test");
  assert.equal(payload.due_at, "2026-07-11T00:00:00.000Z");
});

test("signal routing reuses one action ledger and stops escalation at pending decision brief", () => {
  const signal = {
    id: "signal-1",
    orgId: "org-1",
    subjectScope: "project" as const,
    subjectId: "project-1",
    projectId: "project-1",
    title: "里程碑延期",
    ownerUserId: "pm-1",
    impact: { reasons: ["cash"] },
  };
  const action = buildSignalActionInsert(signal);
  assert.equal(action.source_type, "signal");
  assert.equal(action.project_id, "project-1");
  assert.equal(action.owner_user_id, "pm-1");
  assert.equal(action.idempotency_key, "signal:signal-1:corrective-action");

  const escalation = buildSignalEscalationInsert(signal, "现金影响超出PMO授权", "request-1");
  assert.equal(escalation.status, "pending_decision_brief");
  assert.equal(escalation.signal_id, "signal-1");
  assert.equal(escalation.request_id, "request-1");
});

test("API access defaults to authenticated and only explicit bootstrap or webhook paths are public", () => {
  assert.equal(isPublicRequestPath("/auth/login"), true);
  assert.equal(isPublicRequestPath("/api/auth/login"), true);
  assert.equal(isPublicRequestPath("/api/integrations/feishu/events"), true);
  assert.equal(isPublicRequestPath("/api/rag/health"), true);
  assert.equal(isPublicRequestPath("/api/dashboard/feishu"), false);
  assert.equal(isPublicRequestPath("/api/operating-system/sync-logs"), false);
  assert.equal(isPublicRequestPath("/api/knowledge"), false);
});

test("proxy access decision rejects anonymous private API reads while preserving public endpoints", () => {
  assert.equal(resolveRequestAccess({
    authRequired: true,
    pathname: "/api/operating-system/sync-logs",
    hasSessionCookie: false,
  }), "unauthorized");
  assert.equal(resolveRequestAccess({
    authRequired: true,
    pathname: "/api/integrations/feishu/events",
    hasSessionCookie: false,
  }), "next");
  assert.equal(resolveRequestAccess({
    authRequired: true,
    pathname: "/api/knowledge",
    hasSessionCookie: true,
  }), "next");
  assert.equal(resolveRequestAccess({
    authRequired: true,
    pathname: "/workbench",
    hasSessionCookie: false,
  }), "login");
});

test("P17/S1 migration creates service-only scoped objects with RLS and stable subject keys", () => {
  const migrationsDirectory = new URL("../supabase/migrations/", import.meta.url);
  const migrationName = readdirSync(migrationsDirectory).find(name => name.endsWith("_p17_s1_operating_foundation.sql"));
  assert.ok(migrationName);
  const sql = readFileSync(new URL(migrationName, migrationsDirectory), "utf8");

  for (const table of [
    "project_identity_mappings",
    "user_business_roles",
    "business_subject_links",
    "management_signals",
    "management_signal_events",
    "management_escalations",
    "evidence_links",
  ]) {
    assert.match(sql, new RegExp(`create table if not exists (?:public\\.)?${table}`, "i"));
    assert.match(sql, new RegExp(`alter table (?:public\\.)?${table} enable row level security`, "i"));
    assert.match(sql, new RegExp(`grant .* on (?:table )?(?:public\\.)?${table} to service_role`, "i"));
  }
  assert.match(sql, /alter table (?:public\.)?unified_action_items[\s\S]*add column if not exists project_id uuid/i);
  assert.match(sql, /alter table (?:public\.)?project_issues[\s\S]*add column if not exists project_id uuid/i);
  assert.match(sql, /alter table (?:public\.)?project_changes[\s\S]*add column if not exists project_id uuid/i);
  assert.match(sql, /alter table (?:public\.)?governance_process_instances[\s\S]*add column if not exists canonical_project_id uuid/i);
  assert.match(sql, /subject_scope[\s\S]*subject_id/i);
  assert.match(sql, /mapping_status in \('conflict', 'orphan'\) or project_id is not null/i);
  assert.match(sql, /revoke all on[\s\S]*from anon, authenticated/i);
  assert.match(sql, /create or replace function public\.transition_management_signal_tx/i);
  assert.match(sql, /create or replace function public\.route_management_signal_tx/i);
  assert.match(sql, /create or replace function public\.transition_signal_action_tx/i);
  assert.match(sql, /p_operation='verify_evidence'/i);
  assert.match(sql, /SIGNAL_ACTION_EVIDENCE_NOT_VERIFIED/i);
  assert.match(sql, /P17_DATA_CLASS_MISMATCH/i);
  assert.match(sql, /organization_working_days/i);
  assert.doesNotMatch(sql, /create policy\s+"?public (read|insert|update|write)/i);
});

test("formal reports fail closed instead of labeling sample fallback as live data", () => {
  const source = readFileSync(new URL("../src/app/api/reports/route.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /DEFAULT_DASHBOARD_DATA/);
  assert.doesNotMatch(source, /initialRisks/);
  assert.match(source, /REPORT_DATA_SOURCE_UNAVAILABLE/);
});

test("sensitive API routes validate the session instead of trusting cookie presence", () => {
  const proxy = readFileSync(new URL("../src/proxy.ts", import.meta.url), "utf8");
  assert.match(proxy, /export async function proxy/);
  assert.match(proxy, /await validateSessionToken/);
  const routes = [
    "../src/app/api/issue-change/route.ts",
    "../src/app/api/governance/workflows/route.ts",
    "../src/app/api/operating-system/sync-logs/route.ts",
    "../src/app/api/pmo/route.ts",
    "../src/app/api/governance/route.ts",
    "../src/app/api/monitoring/route.ts",
    "../src/app/api/rag/query/route.ts",
    "../src/app/api/knowledge/route.ts",
  ];
  for (const route of routes) {
    const source = readFileSync(new URL(route, import.meta.url), "utf8");
    assert.match(source, /requireAuthenticatedApiUser/);
    assert.match(source, /401/);
  }
});

test("management signal state machine closes with evidence or stops at pending decision brief", () => {
  assert.equal(transitionManagementSignal("pending_verification", "verify"), "verified");
  assert.equal(transitionManagementSignal("verified", "start_review"), "under_review");
  assert.equal(transitionManagementSignal("under_review", "route_action"), "action_required");
  assert.equal(transitionManagementSignal("under_review", "escalate"), "pending_decision_brief");
  assert.equal(transitionManagementSignal("evidence_submitted", "close"), "closed");
  assert.throws(() => transitionManagementSignal("closed", "verify"), /不允许/);
});

test("action closure requires current verifiable evidence", () => {
  assert.deepEqual(validateActionClosureEvidence([], new Date("2026-07-10T00:00:00.000Z")), {
    valid: false,
    errors: ["至少需要一项关闭证据。"],
  });
  assert.deepEqual(validateActionClosureEvidence([42], new Date("2026-07-10T00:00:00.000Z")), {
    valid: false,
    errors: ["第1项证据格式错误。"],
  });
  assert.equal(validateActionClosureEvidence([{
    sourceType: "feishu",
    sourceId: "record-1",
    title: "更新后的里程碑",
    validUntil: "2026-07-09T00:00:00.000Z",
  }], new Date("2026-07-10T00:00:00.000Z")).valid, false);
  assert.deepEqual(validateActionClosureEvidence([{
    sourceType: "feishu",
    sourceId: "record-1",
    title: "更新后的里程碑",
    validUntil: "2026-07-31T00:00:00.000Z",
  }], new Date("2026-07-10T00:00:00.000Z")), { valid: true, errors: [] });
  assert.equal(validateActionClosureEvidence([{
    sourceType: "free_text",
    sourceId: "invented-1",
    title: "不可验证文本",
  }]).valid, false);
  assert.equal(validateActionClosureEvidence([
    { sourceType: "feishu_record", sourceId: "record-1", title: "证据1" },
    { sourceType: "feishu_record", sourceId: "record-1", title: "证据1重复" },
  ]).valid, false);
});

test("S1 milestone delay rule routes tolerance breaches without inventing a CEO decision", () => {
  const common = {
    orgId: "org-1",
    projectId: "project-1",
    milestoneId: "milestone-1",
    baselineVersion: "baseline-v1",
    baselineDueDate: "2026-07-06",
    status: "in_progress" as const,
    approvedBaselineChange: false,
    impacts: {
      criticalPath: false,
      stageGate: false,
      customerCommitment: false,
      acceptance: false,
      cash: false,
      majorRisk: false,
      crossProjectResource: false,
    },
  };

  assert.deepEqual(evaluateMilestoneDelay({ ...common, forecastDueDate: "2026-07-09" }), {
    ruleVersion: "S1-MILESTONE-DELAY-v1",
    triggered: true,
    deviationWorkdays: 3,
    route: "action",
    nextStatus: "pending_verification",
    dedupKey: "org-1:project-1:milestone-1:S1-MILESTONE-DELAY-v1:baseline-v1",
    impactReasons: [],
  });

  assert.equal(evaluateMilestoneDelay({ ...common, forecastDueDate: "2026-07-10" })?.route, "escalation");
  assert.equal(evaluateMilestoneDelay({
    ...common,
    forecastDueDate: "2026-07-07",
    impacts: { ...common.impacts, cash: true },
  })?.route, "escalation");
  assert.equal(evaluateMilestoneDelay({ ...common, forecastDueDate: "2026-07-06" }), null);
});

test("milestone signal request requires explicit source and data classification", () => {
  const parsed = parseMilestoneSignalRequest({
    org_id: "org-1",
    project_id: "project-1",
    milestone_id: "milestone-1",
    baseline_version: "baseline-v1",
    baseline_due_date: "2026-07-06",
    forecast_due_date: "2026-07-10",
    status: "in_progress",
    approved_baseline_change: false,
    data_class: "test",
    source_id: "record-1",
    impacts: { cash: true },
  });
  assert.equal(parsed.dataClass, "test");
  assert.equal(parsed.sourceId, "record-1");
  assert.equal(parsed.impacts.cash, true);
  assert.throws(() => parseMilestoneSignalRequest({
    org_id: "org-1",
    project_id: "project-1",
  }), /必填/);
});

test("S1 derives organization data class baseline and impacts from the verified Feishu record", () => {
  const parsed = parseVerifiedFeishuMilestone({
    record: {
      recordId: "rec-m1",
      fields: {
        项目编号: "P-001",
        里程碑编号: "M-01",
        基线版本: "B1",
        基线完成日期: "2026-07-06",
        预测完成日期: "2026-07-10",
        里程碑状态: "进行中",
        影响回款: "是",
      },
    },
    project: { id: "project-uuid", orgId: "org-1", code: "P-001", dataClass: "test" },
  });
  assert.equal(parsed.orgId, "org-1");
  assert.equal(parsed.dataClass, "test");
  assert.equal(parsed.sourceId, "rec-m1");
  assert.equal(parsed.impacts.cash, true);
  assert.throws(() => parseVerifiedFeishuMilestone({
    record: { recordId: "rec-cross", fields: { 项目编号: "P-999", 基线版本: "B1", 基线完成日期: "2026-07-06", 预测完成日期: "2026-07-10" } },
    project: { id: "project-uuid", orgId: "org-1", code: "P-001", dataClass: "production" },
  }), /不属于当前项目/);
});

test("project identity matches stable source or code and never merges by name alone", () => {
  const identities: ProjectIdentity[] = [
    {
      projectId: "project-1",
      orgId: "org-1",
      projectCode: "P-001",
      projectName: "同名项目",
      status: "active",
      externalMappings: [{ sourceType: "feishu", sourceId: "record-1" }],
    },
    {
      projectId: "project-2",
      orgId: "org-1",
      projectCode: "P-002",
      projectName: "同名项目",
      status: "active",
      externalMappings: [{ sourceType: "feishu", sourceId: "record-2" }],
    },
  ];

  assert.equal(findProjectIdentityMatch(identities, {
    orgId: "org-1",
    sourceType: "feishu",
    sourceId: "record-2",
    projectName: "同名项目",
  })?.projectId, "project-2");
  assert.equal(findProjectIdentityMatch(identities, {
    orgId: "org-1",
    sourceType: "import",
    sourceId: "row-99",
    projectName: "同名项目",
  }), null);
});

test("Feishu project identity import never promotes unclassified or sample records to production", () => {
  const sample = normalizeFeishuProjectIdentityCandidate({
    recordId: "rec-1",
    fields: { 项目名称: "样例项目", project_id: "P-001", 样例来源: "导入模板" },
  }, "container-hash");
  assert.equal(sample.dataClass, "sample");
  assert.equal(sample.projectCode, "P-001");
  assert.equal(sample.sourceRecordId, "rec-1");

  const unclassified = normalizeFeishuProjectIdentityCandidate({
    recordId: "rec-2",
    fields: { 项目名称: "待确认项目" },
  }, "container-hash");
  assert.equal(unclassified.dataClass, "unclassified");
  assert.equal(unclassified.projectCode, null);
});

test("Feishu dashboard links risks by stable project key and never falls back to sample rows", () => {
  const rows = buildDashboardRowsFromFeishu([
    { recordId: "project-rec-1", fields: { project_id: "P-001", 项目名称: "项目一" } },
    { recordId: "project-rec-2", fields: { project_id: "P-002", 项目名称: "项目二" } },
  ], [
    { recordId: "risk-rec-2", fields: { project_id: "P-002", 风险类型: "资源", 风险值: 15 } },
    { recordId: "risk-rec-1", fields: { project_id: "P-001", 风险类型: "进度", 风险值: 5 } },
  ]);
  assert.equal(rows[0]["风险类型"], "进度");
  assert.equal(rows[1]["风险类型"], "资源");
  assert.deepEqual(buildDashboardRowsFromFeishu([], []), []);
});

test("Feishu dashboard aggregates all risks by stable project key and ignores same-name fallbacks", () => {
  const rows = buildDashboardRowsFromFeishu([
    { recordId: "project-rec", fields: { project_id: "P-001", 项目名称: "同名项目" } },
  ], [
    { recordId: "r1", fields: { project_id: "P-001", 风险类型: "进度", 风险值: 5 } },
    { recordId: "r2", fields: { project_id: "P-001", 风险类型: "现金", 风险值: 15 } },
    { recordId: "r3", fields: { 项目名称: "同名项目", 风险类型: "不应关联", 风险值: 25 } },
  ]);
  assert.equal(rows[0]["风险数量"], 2);
  assert.equal(rows[0]["最高风险值"], 15);
  assert.equal(rows[0]["风险等级"], "高");
  assert.equal(rows[0]["风险类型"], "进度、现金");
});

test("project identity backfill is idempotent and quarantines duplicate business codes", () => {
  const first = normalizeFeishuProjectIdentityCandidate({
    recordId: "rec-1",
    fields: { 项目名称: "项目一", project_id: "P-001", 数据分类: "测试" },
  }, "container");
  const duplicate = normalizeFeishuProjectIdentityCandidate({
    recordId: "rec-2",
    fields: { 项目名称: "项目二", project_id: "P-001", 数据分类: "测试" },
  }, "container");
  const existing = normalizeFeishuProjectIdentityCandidate({
    recordId: "rec-3",
    fields: { 项目名称: "项目三", project_id: "P-003", 数据分类: "测试" },
  }, "container");
  const plan = planProjectIdentityBackfill([first, duplicate, existing], [{
    projectId: "project-3",
    orgId: "org-1",
    sourceType: "feishu",
    sourceContainerId: "container",
    sourceRecordId: "rec-3",
    externalProjectCode: "P-003",
  }]);
  assert.equal(plan.summary.conflict, 2);
  assert.equal(plan.summary.reuse, 1);
  assert.equal(plan.entries.find(item => item.sourceRecordId === "rec-3")?.projectId, "project-3");
});

test("P17 project identity migration has preview apply dual-read verification cutover and non-destructive rollback", () => {
  const sql = readFileSync("supabase/migrations/20260710135000_p17_project_identity_cutover.sql", "utf8");
  for (const table of ["project_identity_migration_runs", "project_identity_migration_entries", "project_identity_cutover_configs", "project_identity_migration_events"]) {
    assert.match(sql, new RegExp(`create table if not exists public\\.${table}`, "i"));
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`, "i"));
  }
  assert.match(sql, /apply_project_identity_backfill_run_tx/i);
  assert.match(sql, /verify_project_identity_dual_read_tx/i);
  assert.match(sql, /cutover_project_identity_read_tx/i);
  assert.match(sql, /rollback_project_identity_run_tx/i);
  assert.match(sql, /mapping_status='revoked'/i);
  assert.doesNotMatch(sql, /delete\s+from\s+public\.projects/i);
  const route = readFileSync("src/app/api/admin/operating-model/project-identities/route.ts", "utf8");
  const page = readFileSync("src/app/admin/operating-model/project-identities/page.tsx", "utf8");
  for (const operation of ["create_preview", "apply", "verify", "cutover", "rollback"]) assert.match(route, new RegExp(operation));
  assert.match(page, /稳定项目身份迁移/);
  assert.match(page, /双读验证/);
  assert.match(page, /非破坏回滚/);
});

test("Feishu money parsing preserves Chinese units and empty values", () => {
  assert.equal(parseFeishuAmount("100万"), 1_000_000);
  assert.equal(parseFeishuAmount("1.2亿元"), 120_000_000);
  assert.equal(parseFeishuAmount("￥12,345.67"), 12_345.67);
  assert.equal(parseFeishuAmount(""), null);
});

test("sensitive financial fields are filtered by business role and subject scope", () => {
  const resource = { orgId: "org-1", subjectScope: "project" as const, subjectId: "project-1" };
  const context = {
    actorUserId: "user-1",
    systemRole: "admin" as const,
    orgId: "org-1",
    subjectScope: "project" as const,
    subjectId: "project-1",
    assignmentId: "assignment-1",
  };

  assert.equal(canReadBusinessField({ ...context, businessRole: "pm" }, "finance.actual_cost", resource), false);
  assert.equal(canReadBusinessField({ ...context, businessRole: "operations" }, "finance.receivable", resource), true);
  assert.equal(canReadBusinessField({ ...context, businessRole: "operations" }, "finance.actual_cost", resource), false);
  assert.equal(canReadBusinessField({ ...context, businessRole: "pmo" }, "finance.actual_cost", resource), true);
  assert.equal(canReadBusinessField({ ...context, businessRole: "ceo" }, "finance.actual_cost", {
    ...resource,
    subjectId: "project-2",
  }), false);
});

test("field filtering removes unauthorized values instead of returning masked business facts", () => {
  const context = {
    actorUserId: "user-1",
    systemRole: "user" as const,
    businessRole: "operations" as const,
    orgId: "org-1",
    subjectScope: "project" as const,
    subjectId: "project-1",
    assignmentId: "assignment-1",
  };
  const resource = { orgId: "org-1", subjectScope: "project" as const, subjectId: "project-1" };
  assert.deepEqual(filterBusinessRecordFields(context, {
    name: "项目一",
    receivable: 120000,
    actual_cost: 80000,
  }, resource, {
    name: "project.name",
    receivable: "finance.receivable",
    actual_cost: "finance.actual_cost",
  }), {
    name: "项目一",
    receivable: 120000,
  });
});

test("business permissions come from the scoped business role rather than the system role", () => {
  const base = {
    actorUserId: "user-1",
    systemRole: "admin" as const,
    orgId: "org-1",
    subjectScope: "portfolio" as const,
    subjectId: "portfolio-1",
    assignmentId: "assignment-1",
  };

  assert.equal(canPerformBusinessAction({ ...base, businessRole: "pmo" }, "decision.decide", {
    orgId: "org-1",
    subjectScope: "portfolio",
    subjectId: "portfolio-1",
  }), false);
  assert.equal(canPerformBusinessAction({ ...base, businessRole: "ceo" }, "decision.decide", {
    orgId: "org-1",
    subjectScope: "portfolio",
    subjectId: "portfolio-1",
  }), true);
  assert.equal(canPerformBusinessAction({ ...base, businessRole: "ceo" }, "decision.decide", {
    orgId: "org-2",
    subjectScope: "portfolio",
    subjectId: "portfolio-2",
  }), false);
});

test("organization and portfolio roles inherit project read scope without granting business authority globally", () => {
  const assignments: BusinessRoleAssignment[] = [
    { id: "pmo-org", userId: "u1", businessRole: "pmo", orgId: "org-1", subjectScope: "organization", subjectId: "org-1", status: "active", validFrom: "2026-01-01T00:00:00.000Z", validUntil: null },
    { id: "ceo-portfolio", userId: "u1", businessRole: "ceo", orgId: "org-1", subjectScope: "portfolio", subjectId: "portfolio-1", status: "active", validFrom: "2026-01-01T00:00:00.000Z", validUntil: null },
  ];
  const projectResource = { orgId: "org-1", subjectScope: "project" as const, subjectId: "project-1", ancestorSubjectIds: { portfolio: ["portfolio-1"] } };
  const pmo = resolveBusinessContextForResource({ user: { id: "u1", systemRole: "admin" }, assignments, requestedRole: "pmo", resource: projectResource, now: new Date("2026-07-10") });
  const ceo = resolveBusinessContextForResource({ user: { id: "u1", systemRole: "admin" }, assignments, requestedRole: "ceo", resource: projectResource, now: new Date("2026-07-10") });
  assert.ok(pmo);
  assert.ok(ceo);
  assert.equal(canPerformBusinessAction(pmo, "project.read", projectResource), true);
  assert.equal(canPerformBusinessAction(pmo, "decision.decide", projectResource), false);
  assert.equal(canPerformBusinessAction(ceo, "project.read", { ...projectResource, orgId: "org-2" }), false);
});

test("closed management signals can be reopened atomically with their action", () => {
  assert.equal(transitionManagementSignal("closed", "reopen"), "action_in_progress");
});

test("P17 exposes a usable role context switcher admin assignment form and project 360 page", () => {
  const contextBar = readFileSync("src/components/BusinessContextBar.tsx", "utf8");
  const clientContext = readFileSync("src/features/operating-model/client-context.ts", "utf8");
  const layout = readFileSync("src/app/layout.tsx", "utf8");
  const adminPage = readFileSync("src/app/admin/security/page.tsx", "utf8");
  const project360Page = readFileSync("src/app/projects/[id]/page.tsx", "utf8");

  assert.match(contextBar, /\/api\/context\/current/);
  assert.match(clientContext, /ai-pmo-business-context-v1/);
  assert.match(clientContext, /ai-pmo-current-project-v1/);
  assert.match(clientContext, /ai-pmo-reporting-period-v1/);
  assert.match(contextBar, /当前业务身份/);
  assert.match(contextBar, /当前项目/);
  assert.match(contextBar, /当前统计周期/);
  assert.match(layout, /BusinessContextBar/);
  assert.match(adminPage, /assign_business_role/);
  assert.match(adminPage, /撤销业务角色/);
  assert.match(project360Page, /\/api\/projects\/\$\{projectId\}\/360/);
  assert.match(project360Page, /项目360/);
  assert.match(project360Page, /管理信号/);
});

test("project 360 uses canonical UUID joins and filters every lifecycle collection", () => {
  const persistence = readFileSync("src/features/operating-model/persistence.ts", "utf8");
  const route = readFileSync("src/app/api/projects/[id]/360/route.ts", "utf8");
  assert.doesNotMatch(persistence, /project_name\.eq/);
  assert.match(persistence, /project_issues[\s\S]*?\.eq\("project_id", projectId\)/);
  assert.match(route, /LIFECYCLE_FIELD_MAPS/);
  assert.match(route, /filterBusinessRecordFields\([\s\S]*?rows\.map/);
  assert.match(route, /resolveBusinessContextForResource/);
  for (const source of [
    "project_lifecycle_states", "feedback_correction_events", "reporting_snapshots", "decision_briefs",
    "cost_records", "contracts", "payment_milestones", "project_benefit_baselines",
    "project_closure_assessments", "knowledge_items", "knowledge_reuse_events",
  ]) assert.match(persistence, new RegExp(source), `项目360必须聚合 ${source}`);
  for (const section of ["生命周期对象", "汇报快照", "决策事项", "回款里程碑", "收益基线", "正式收尾门禁", "知识复用效果"])
    assert.match(readFileSync("src/app/projects/[id]/page.tsx", "utf8"), new RegExp(section));
});

test("workbench obeys the selected business context even when the account is a system admin", () => {
  const workbench = buildOperationalWorkbench({
    user: { id: "admin-1", role: "admin", name: "管理员" },
    projects: [
      { __record_id: "rec-1", __canonical_project_id: "project-1", project_id: "P-001", 项目名称: "范围内项目", 项目状态: "进行中" },
      { __record_id: "rec-2", __canonical_project_id: "project-2", project_id: "P-002", 项目名称: "范围外项目", 项目状态: "进行中" },
    ],
    risks: [], tasks: [], milestones: [], payments: [],
    businessScope: { businessRole: "pm", canonicalProjectIds: ["project-1"], sourceRecordIds: ["rec-1"], externalProjectCodes: ["P-001"], dataClass: "production" },
  });
  assert.equal(workbench.evidence.userScope, "business-context");
  assert.deepEqual(workbench.myProjects.map(item => item.canonicalProjectId), ["project-1"]);
});
