import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  DECISION_TYPE_DEFINITIONS,
  parseDecisionBriefInput,
  transitionDecisionWorkflow,
  transitionGovernanceMeeting,
  transitionReportingSnapshot,
  validateMeetingConclusions,
} from "../src/features/decisions/domain.ts";

const ROOT = process.cwd();

function completeBrief(overrides: Record<string, unknown> = {}) {
  return {
    title: "关键项目资源冲突处理",
    decisionQuestion: "是否调整关键资源并重排里程碑？",
    decisionType: "resource_adjustment",
    decisionMode: "routine",
    decisionLevel: "portfolio",
    authorityMode: "individual",
    structuredInput: {
      resource_gap: "架构师缺口 1 人月",
      candidate_plan: "从非战略项目调配 1 名架构师",
      milestone_budget_impact: "重点项目提前 10 天，预算增加 8 万元",
    },
    options: [
      { key: "A", label: "调配资源", consequences: "非战略项目延后 5 天" },
      { key: "B", label: "保持现状", consequences: "重点项目延期 10 天" },
    ],
    recommendation: "A",
    evidence: [{ source_type: "reporting_snapshot", source_id: "snapshot-1", title: "已冻结组合快照" }],
    requestedDecisionAt: "2026-07-12T10:00:00+08:00",
    executionDueAt: "2026-07-20T18:00:00+08:00",
    acceptanceCriteria: "资源到岗且里程碑基线完成更新",
    impactSummary: "影响重点项目里程碑、预算与另一项目资源",
    reportingSnapshotId: "snapshot-1",
    reviewPlan: { review_at: "2026-08-10T10:00:00+08:00", owner_role: "pmo" },
    ...overrides,
  };
}

test("P21 exact decision workflow rejects skips and supports evidence/reopen loops", () => {
  assert.equal(transitionDecisionWorkflow("draft", "submit"), "pending_decision");
  assert.equal(transitionDecisionWorkflow("pending_decision", "request_evidence"), "evidence_required");
  assert.equal(transitionDecisionWorkflow("evidence_required", "resubmit_evidence"), "pending_decision");
  assert.equal(transitionDecisionWorkflow("pending_decision", "decide"), "decided");
  assert.equal(transitionDecisionWorkflow("decided", "translate"), "translated");
  assert.equal(transitionDecisionWorkflow("translated", "start_execution"), "executing");
  assert.equal(transitionDecisionWorkflow("executing", "submit_effect_review"), "effect_review");
  assert.equal(transitionDecisionWorkflow("effect_review", "close"), "closed");
  assert.equal(transitionDecisionWorkflow("closed", "reopen"), "reopened");
  assert.equal(transitionDecisionWorkflow("reopened", "submit"), "pending_decision");
  assert.throws(() => transitionDecisionWorkflow("draft", "decide"), /draft/);
});

test("all eight standard decision types carry schema, authorization, actions, review metrics and revocation gates", () => {
  const expected = ["continue", "accelerate", "downgrade", "pause", "terminate", "resource_adjustment", "risk_acceptance", "evidence_request"];
  assert.deepEqual(Object.keys(DECISION_TYPE_DEFINITIONS).sort(), expected.sort());
  for (const key of expected) {
    const definition = DECISION_TYPE_DEFINITIONS[key as keyof typeof DECISION_TYPE_DEFINITIONS];
    assert.ok(definition.requiredInputFields.length > 0, `${key}: required input`);
    assert.ok(definition.allowedDecisionRoles.length > 0, `${key}: authorization`);
    assert.ok(definition.downstreamActionTemplates.length > 0, `${key}: downstream actions`);
    assert.ok(definition.reviewMetrics.length > 0, `${key}: review metrics`);
    assert.ok(definition.revocationConditions.length > 0, `${key}: revocation conditions`);
  }
});

test("standard decision parser enforces typed input and emergency/routine frozen-source rules", () => {
  const parsed = parseDecisionBriefInput(completeBrief());
  assert.equal(parsed.decisionType, "resource_adjustment");
  assert.equal(parsed.decisionMode, "routine");
  assert.ok(parsed.downstreamActionTemplates.length > 0);
  assert.ok(parsed.reviewMetrics.length > 0);
  assert.throws(() => parseDecisionBriefInput(completeBrief({ structuredInput: { resource_gap: "缺口" } })), /candidate_plan/);
  assert.throws(() => parseDecisionBriefInput(completeBrief({ reportingSnapshotId: null, meetingId: null })), /冻结汇报快照或治理会议/);
  assert.throws(() => parseDecisionBriefInput(completeBrief({ decisionMode: "emergency", reportingSnapshotId: null })), /紧急决策触发事件/);
  assert.doesNotThrow(() => parseDecisionBriefInput(completeBrief({
    decisionMode: "emergency", reportingSnapshotId: null, meetingId: null,
    emergencyTrigger: "重大客户生产事故", responseSlaMinutes: 120,
  })));
});

test("reporting and meeting state machines preserve frozen evidence and explicit cancel/postpone states", () => {
  assert.equal(transitionReportingSnapshot("draft", "submit"), "submitted");
  assert.equal(transitionReportingSnapshot("submitted", "return"), "returned");
  assert.equal(transitionReportingSnapshot("returned", "resubmit"), "submitted");
  assert.equal(transitionReportingSnapshot("submitted", "freeze"), "frozen");
  assert.equal(transitionReportingSnapshot("frozen", "supersede"), "superseded");
  assert.throws(() => transitionReportingSnapshot("frozen", "return"), /frozen/);

  assert.equal(transitionGovernanceMeeting("scheduled", "freeze_agenda"), "agenda_frozen");
  assert.equal(transitionGovernanceMeeting("agenda_frozen", "start"), "in_progress");
  assert.equal(transitionGovernanceMeeting("in_progress", "record_minutes"), "minutes_pending");
  assert.equal(transitionGovernanceMeeting("minutes_pending", "materialize_outputs"), "actions_pending");
  assert.equal(transitionGovernanceMeeting("actions_pending", "start_effect_review"), "effect_review");
  assert.equal(transitionGovernanceMeeting("effect_review", "close"), "closed");
  assert.equal(transitionGovernanceMeeting("scheduled", "postpone"), "postponed");
  assert.equal(transitionGovernanceMeeting("scheduled", "cancel"), "cancelled");
});

test("every meeting conclusion is materialized as decision, action or explicit no-action", () => {
  const conclusions = validateMeetingConclusions([
    { type: "action", title: "修复预测口径", owner_user_id: "user-1", owner_business_role: "pm", due_at: "2026-07-15", acceptance_criteria: "口径复核通过", review_at: "2026-07-18" },
    { type: "no_action", title: "观察市场变化", rationale: "尚未达到升级阈值", review_at: "2026-07-31" },
  ]);
  assert.equal(conclusions.length, 2);
  assert.throws(() => validateMeetingConclusions([{ type: "action", title: "没有责任人" }]), /owner_user_id/);
  assert.throws(() => validateMeetingConclusions([{ type: "no_action", title: "没有理由" }]), /rationale/);
});

test("P21 hardening migration persists governance, committees, evidence, SLA and atomic meeting outputs", () => {
  const migration = fs.readdirSync(path.join(ROOT, "supabase/migrations"))
    .filter(name => name.includes("p21_reporting_meeting_decision_hardening"))
    .map(name => fs.readFileSync(path.join(ROOT, "supabase/migrations", name), "utf8"))
    .join("\n");
  for (const table of [
    "reporting_snapshot_events", "reporting_receipts", "governance_meeting_delegates",
    "meeting_conclusion_outputs", "meeting_review_plans", "decision_type_definitions",
    "decision_sla_policies", "decision_committees", "decision_committee_members",
    "decision_votes", "decision_evidence_requests", "decision_authority_responses",
    "decision_execution_actions", "decision_sla_escalations",
  ]) {
    assert.match(migration, new RegExp(`create table if not exists public\\.${table}`));
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`));
  }
  for (const fn of [
    "transition_reporting_snapshot_tx", "transition_governance_meeting_tx",
    "record_governance_meeting_outcome_tx", "request_decision_evidence_tx",
    "respond_decision_evidence_tx", "cast_decision_vote_tx", "reopen_decision_brief_tx",
    "process_decision_sla_escalations_tx",
  ]) assert.match(migration, new RegExp(`create or replace function public\\.${fn}`));
  assert.match(migration, /security invoker/gi);
  assert.match(migration, /revoke all on table[\s\S]*from public,anon,authenticated/i);
  assert.match(migration, /grant select,insert,update,delete[\s\S]*to service_role/i);
  assert.match(migration, /MEETING_CONCLUSION_OUTPUT_REQUIRED/);
  assert.match(migration, /DECISION_SCOPE_MISMATCH/);
  assert.match(migration, /DECISION_DATA_CLASS_MISMATCH/);
});

test("P21 database guards scope recovery committee capacity version lineage and idempotency", () => {
  const migration = fs.readFileSync(path.join(ROOT, "supabase/migrations/20260710191152_p21_reporting_meeting_decision_hardening.sql"), "utf8");
  for (const guard of [
    "MEETING_REPORTING_SNAPSHOT_SCOPE_INVALID",
    "MEETING_COMMITTEE_SCOPE_INVALID",
    "DECISION_COMMITTEE_LEVEL_FORBIDDEN",
    "DECISION_COMMITTEE_VOTER_CAPACITY_INVALID",
    "DECISION_EVIDENCE_EXPIRED_RECOVERABLE",
    "REPORTING_IDEMPOTENCY_CONFLICT",
    "DECISION_AUTHORITY_RESPONSE_IDEMPOTENCY_CONFLICT",
    "DECISION_COMMITTEE_IDEMPOTENCY_CONFLICT",
  ]) assert.match(migration, new RegExp(guard));
  assert.match(migration, /supersedes_snapshot_id/);
  assert.match(migration, /superseded_by_snapshot_id\s*=\s*v_snapshot\.id/);
  assert.match(migration, /workflow_status='pending_decision'[\s\S]*evidence_expired_recoverable/);
  assert.match(migration, /member_role[\s\S]*in \('chair','voter'\)[\s\S]*v_voter_count/i);
  assert.match(migration, /create or replace function public\.p21_sha256_hex/);
  assert.doesNotMatch(migration, /extensions\.digest/);
});

test("P21 SLA escalation creates only bound personal-Feishu confirmation drafts", () => {
  const migration = fs.readFileSync(path.join(ROOT, "supabase/migrations/20260710191152_p21_reporting_meeting_decision_hardening.sql"), "utf8");
  assert.match(migration, /feishu_confirmation_id/);
  assert.match(migration, /insert into public\.feishu_action_confirmations/);
  assert.match(migration, /join public\.user_feishu_connections/);
  assert.match(migration, /notification_receive_id_type/);
  assert.match(migration, /'pending_confirmation'/);
  assert.match(migration, /'require_personal_feishu',true/);
  assert.match(migration, /on conflict\(idempotency_key\)[\s\S]*do nothing/i);

  const cron = fs.readFileSync(path.join(ROOT, "src/app/api/cron/decision-sla/route.ts"), "utf8");
  assert.match(cron, /confirmation_queue/);
  assert.doesNotMatch(cron, /executeFeishuAction|sendTextMessage|notification_delivery:\s*"not_claimed"/);

  const confirm = fs.readFileSync(path.join(ROOT, "src/app/api/integrations/feishu/actions/confirmations/[id]/confirm/route.ts"), "utf8");
  assert.match(confirm, /executor_user_id/);
  assert.match(confirm, /require_personal_feishu/);
  assert.match(confirm, /getUserFeishuConfig/);

  const settings = fs.readFileSync(path.join(ROOT, "src/app/api/user/feishu-connection/route.ts"), "utf8");
  assert.match(settings, /notification_receive_id_type/);
  assert.match(settings, /notification_receive_id/);
});

test("P21 APIs keep auth, business scope and data classification at every boundary", () => {
  for (const routePath of [
    "src/app/api/decisions/[id]/route.ts",
    "src/app/api/decisions/committees/route.ts",
    "src/app/api/reporting/snapshots/route.ts",
    "src/app/api/governance/meetings/route.ts",
  ]) {
    const source = fs.readFileSync(path.join(ROOT, routePath), "utf8");
    assert.match(source, /requireAuthenticatedApiUser/);
    assert.match(source, /resolveRequestedDecisionContext/);
    assert.match(source, /data_class|dataClass/);
    assert.doesNotMatch(source, /mock|demo|fallback_used:\s*true/i);
  }
  const cron = fs.readFileSync(path.join(ROOT, "src/app/api/cron/decision-sla/route.ts"), "utf8");
  assert.match(cron, /timingSafeEqual/);
  assert.match(cron, /process_decision_sla_escalations_tx/);
});

test("decision center surfaces evidence, emergency, committee, refusal, abstention and reopen controls", () => {
  const page = fs.readFileSync(path.join(ROOT, "src/app/decision-center/page.tsx"), "utf8");
  for (const label of ["紧急决策", "例会决策", "待补证", "决策委员会", "拒绝承接", "弃权", "重新打开", "SLA 升级"])
    assert.match(page, new RegExp(label));
});
