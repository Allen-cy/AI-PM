import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import {
  parseRoleAssistantOutput,
  recommendationExecutionPolicy,
  validateRecommendationPayload,
} from "../src/features/operating-model/role-assistant.ts";
import { scanRoleAssistantFacts } from "../src/features/operating-model/role-assistant-scanner.ts";

test("role assistant output separates facts inferences recommendations and pending confirmation", () => {
  const output = parseRoleAssistantOutput(JSON.stringify({
    facts: [{ statement: "项目P1有一个逾期红色信号", evidence_ids: ["signal:s1"] }],
    inferences: [{ statement: "可能影响月度回款", confidence: 0.72, evidence_ids: ["signal:s1", "project:p1"] }],
    recommendations: [{ title: "发起现金影响复核", type: "action", reason: "信号已逾期", proposed_payload: { project_id: "p1", evidence_ids: ["signal:s1"], priority: "P1", due_date: "2026-07-15", acceptance_criteria: "完成现金影响复核并提交证据" }, confirmation_required: true }],
    pending_confirmation: ["请运营确认最新回款日期"],
  }), new Set(["signal:s1", "project:p1"]));
  assert.equal(output.facts.length, 1);
  assert.equal(output.inferences[0].confidence, 0.72);
  assert.equal(output.recommendations[0].confirmation_required, true);
});

test("role assistant rejects invented citations and silent actions", () => {
  assert.throws(() => parseRoleAssistantOutput(JSON.stringify({ facts: [{ statement: "虚构事实", evidence_ids: ["unknown:1"] }], inferences: [], recommendations: [], pending_confirmation: [] }), new Set(["project:p1"])), /未知证据/);
  assert.throws(() => parseRoleAssistantOutput(JSON.stringify({ facts: [], inferences: [], recommendations: [{ title: "静默改写", type: "action", reason: "", proposed_payload: {}, confirmation_required: false }], pending_confirmation: [] }), new Set()), /人工确认/);
});

test("P23 persists runs recommendations and evaluations with a role-scoped page", () => {
  const migrations = new URL("../supabase/migrations/", import.meta.url);
  const name = readdirSync(migrations).find(item => item.endsWith("_p23_role_ai_assistant.sql")); assert.ok(name);
  const sql = readFileSync(new URL(name, migrations), "utf8");
  for (const table of ["ai_assistant_runs", "ai_recommendations", "ai_assistant_evaluations"]) assert.match(sql, new RegExp(`create table if not exists public\\.${table}`, "i"));
  const route = readFileSync("src/app/api/role-assistant/route.ts", "utf8"); const page = readFileSync("src/app/role-assistant/page.tsx", "utf8");
  assert.match(route, /llmComplete/); assert.match(route, /loadContextProjectIdentityMappings/); assert.doesNotMatch(route, /mock|demo|DEFAULT_/i);
  assert.match(page, /角色AI业务助理/); assert.match(page, /事实/); assert.match(page, /待人工确认/);
});

test("P23 recommendation execution maps every supported type to a real domain draft boundary", () => {
  assert.deepEqual(recommendationExecutionPolicy("action"), {
    supported: true, resourceType: "unified_action_item", initialStatus: "assigned", confirmationRequired: true,
  });
  const expected = new Map([
    ["risk", "risk"], ["issue", "project_issue"], ["change", "project_change"],
    ["governance", "governance_process_instance"], ["decision_brief", "decision_brief"],
    ["report", "reporting_snapshot"], ["feishu_draft", "feishu_action_confirmation"],
  ]);
  for (const [type, resourceType] of expected) {
    const policy = recommendationExecutionPolicy(type);
    assert.equal(policy.supported, true);
    if (policy.supported) assert.equal(policy.resourceType, resourceType);
  }
  assert.equal(recommendationExecutionPolicy("invented").supported, false);
});

test("P23 validates type-specific preview payloads before they can enter confirmation", () => {
  assert.equal(validateRecommendationPayload("risk", {
    project_id: "11111111-1111-4111-8111-111111111111", evidence_ids: ["project:p1"], description: "供应商交付存在不确定性",
    probability: 3, impact: 4, urgency: 3, owner: "项目经理", due_date: "2026-07-15",
  }).project_id, "11111111-1111-4111-8111-111111111111");
  assert.throws(() => validateRecommendationPayload("decision_brief", {
    project_id: "11111111-1111-4111-8111-111111111111", evidence_ids: ["project:p1"], decision_question: "是否继续？", options: [{ key: "a", label: "继续", consequences: "保持投入" }],
  }), /至少需要两个备选方案/);
  assert.throws(() => validateRecommendationPayload("feishu_draft", {
    project_id: "11111111-1111-4111-8111-111111111111", evidence_ids: ["project:p1"], type: "base_record_update", idempotency_key: "x",
  }), /业务变化草稿/);
});

test("P23 proactive scan detects anomalies conflicts omissions and overdue work before AI generation", () => {
  const findings = scanRoleAssistantFacts({
    now: new Date("2026-07-10T08:00:00.000Z"),
    projects: [
      { id: "p1", name: "冲突项目", status: "completed", progress: 70, updated_at: "2026-06-20T00:00:00.000Z" },
      { id: "p2", name: "运行项目", status: "active", progress: 30, updated_at: "2026-06-20T00:00:00.000Z" },
    ],
    actions: [{ id: "a1", project_id: "p2", title: "逾期任务", status: "accepted", due_date: "2026-07-01", owner_user_id: null }],
    risks: [{ id: "r1", project_id: "p2", description: "无负责人风险", status: "identified", owner: null, due_date: null }],
    issues: [], changes: [], reportingSnapshots: [],
  });
  const keys = new Set(findings.map(item => item.ruleKey));
  for (const key of ["project_status_progress_conflict", "project_facts_stale", "action_overdue", "action_owner_missing", "risk_owner_missing", "risk_deadline_missing", "monthly_report_missing"] as const)
    assert.ok(keys.has(key), `missing ${key}`);
  assert.ok(findings.every(item => item.projectId && item.dedupKey && item.sourceId));
});

test("P23 proactive scan resolves a real accountable role and records coverage gaps instead of assigning the scanner", () => {
  const route = readFileSync("src/app/api/role-assistant/route.ts", "utf8");
  assert.match(route, /SIGNAL_OWNER_ROLES/);
  assert.match(route, /portfolio_project_links/);
  assert.match(route, /business_role_coverage_gaps/);
  assert.match(route, /owner_user_id:\s*ownerUserId/);
  assert.match(route, /未生成无责任信号/);
});

test("P23 hardening binds every read and mutation to actor role organization subject and data class", () => {
  const route = readFileSync("src/app/api/role-assistant/route.ts", "utf8");
  for (const boundary of [
    '.eq("actor_user_id", scope.user.id)', '.eq("business_role", scope.role)', '.eq("org_id", scope.context.orgId)',
    '.eq("subject_scope", scope.context.subjectScope)', '.eq("subject_id", scope.context.subjectId)', '.eq("data_class", scope.dataClass)',
  ]) assert.match(route, new RegExp(boundary.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(route, /loadAuthorizedRun\(scope, runId\)/);
  assert.match(route, /loadAuthorizedRecommendation\(scope, recommendationId\)/);
  assert.match(route, /RECOMMENDATION_NOT_FOUND_IN_CURRENT_CONTEXT/);
  assert.match(route, /recommendationExecutionPolicy/);
  assert.match(route, /DOWNSTREAM_MATERIALIZATION_CONFIRMATION_REQUIRED/);
  assert.match(route, /ai_recommendation_execution_attempts/);
  assert.match(route, /materialize_ai_recommendation_tx/);
  assert.match(route, /runProactiveRoleAssistantScan/);
  assert.match(route, /awaiting_owner_acceptance/);
  assert.doesNotMatch(route, /status: "executed"/);
});

test("P23 hardening migration backfills existing rows and enforces run-context consistency", () => {
  const migration = readFileSync("supabase/migrations/20260710113000_p23_role_ai_assistant_scope_hardening.sql", "utf8");
  for (const field of ["actor_user_id", "business_role", "data_class"]) assert.match(migration, new RegExp(`add column if not exists ${field}`, "i"));
  assert.match(migration, /update public\.ai_recommendations recommendation/i);
  assert.match(migration, /enforce_ai_recommendation_run_context/i);
  assert.match(migration, /create table if not exists public\.ai_recommendation_execution_attempts/i);
  assert.match(migration, /alter column actor_user_id set not null/i);
  assert.match(migration, /status in \('pending_confirmation','accepted','rejected','materialized','executed','expired'\)/i);
});

test("P23 page exposes evaluation and labels materialization as awaiting owner acceptance", () => {
  const page = readFileSync("src/app/role-assistant/page.tsx", "utf8");
  assert.match(page, /AI效果评测/);
  assert.match(page, /submitEvaluation/);
  assert.match(page, /主动扫描异常/);
  assert.match(page, /落地预览/);
  assert.match(page, /二次确认并生成业务草稿/);
  assert.match(page, /不代表行动已经执行或完成/);
  for (const label of ["准确度", "拒答", "误报", "漏报", "人工修改", "关闭效果"]) assert.match(page, new RegExp(label));
});

test("P23 completion migration atomically materializes every domain draft and extends evaluation evidence", () => {
  const migration = readFileSync("supabase/migrations/20260710213000_p23_proactive_scan_and_domain_drafts.sql", "utf8");
  assert.match(migration, /create or replace function public\.materialize_ai_recommendation_tx/i);
  for (const table of ["unified_action_items", "risks", "project_issues", "project_changes", "governance_process_instances", "decision_briefs", "reporting_snapshots", "feishu_action_confirmations"])
    assert.match(migration, new RegExp(`insert into public\\.${table}`, "i"));
  for (const field of ["accuracy_score", "refusal_outcome", "false_positive", "false_negative", "human_modified", "closure_effect"])
    assert.match(migration, new RegExp(`add column if not exists ${field}`, "i"));
});
