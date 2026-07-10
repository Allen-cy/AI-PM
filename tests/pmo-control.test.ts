import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";

import {
  buildCapacityPlan,
  buildPmoControlCenter,
  canTransitionCapacityConflict,
  canTransitionCadence,
  canTransitionDataQuality,
  canTransitionDependency,
  canTransitionGovernanceAction,
  resolveMilestoneDelayRuleFromMatrix,
  validateProjectLevelRuleMatrix,
} from "../src/features/operating-model/pmo-control.ts";
import { applySignalSla, evaluateSourceFreshness } from "../src/features/operating-model/signals.ts";

test("PMO control center prioritizes exceptions dependencies capacity and data quality", () => {
  const center = buildPmoControlCenter({
    projects: [{ id: "p1", name: "项目一", projectLevel: "S", progress: 55, status: "active" }, { id: "p2", name: "已完成项目", projectLevel: "A", progress: 100, status: "completed" }],
    signals: [
      { id: "s1", projectId: "p1", title: "现金影响", severity: "critical", status: "pending_decision_brief", dueAt: "2026-07-09T10:00:00Z" },
      { id: "s2", projectId: "p1", title: "轻微延期", severity: "medium", status: "action_required", dueAt: "2026-07-15T10:00:00Z" },
    ],
    dependencies: [{ id: "d1", fromProjectId: "p1", toProjectId: "p2", status: "blocked", dueDate: "2026-07-09" }],
    capacities: [{ id: "c1", ownerName: "架构师", capacityHours: 40, demandHours: 60, periodStart: "2026-07-06" }],
    dataQualityIssues: [{ id: "q1", projectId: "p1", severity: "high", status: "open", dueAt: "2026-07-09T12:00:00Z" }],
    cadences: [{ id: "cad1", cadenceType: "weekly_portfolio", status: "preparing", periodStart: "2026-07-06", periodEnd: "2026-07-12" }, { id: "cad2", cadenceType: "monthly_operating", status: "effect_review", periodStart: "2026-07-01", periodEnd: "2026-07-31" }],
    stageGateEvidence: { total: 2, complete: 2 },
    now: new Date("2026-07-10T00:00:00Z"),
  });
  assert.equal(center.summary.redSignals, 1);
  assert.equal(center.summary.activeProjects, 1);
  assert.equal(center.portfolioHealth.length, 1);
  assert.equal(center.summary.preparingCadences, 2);
  assert.equal(center.summary.stageGateEvidenceCompletenessRate, 100);
  assert.equal(center.summary.blockedDependencies, 1);
  assert.equal(center.summary.overAllocatedResources, 1);
  assert.equal(center.summary.overdueDataQuality, 1);
  assert.equal(center.exceptionInbox[0].id, "s1");
  assert.equal(center.portfolioHealth[0].health, "red");
});

test("P20 migration and page expose persistent cadence and governance actions without mock fallback", () => {
  const migrations = new URL("../supabase/migrations/", import.meta.url);
  const name = readdirSync(migrations).find(item => item.endsWith("_p20_pmo_control_center.sql"));
  assert.ok(name);
  const sql = readFileSync(new URL(name, migrations), "utf8");
  for (const table of [
    "operating_cadences",
    "governance_cadence_actions",
    "project_dependencies",
    "resource_capacity_snapshots",
    "resource_capacity_allocations",
    "capacity_conflict_actions",
    "data_quality_issues",
    "data_quality_issue_events",
    "project_level_rule_matrices",
    "project_dependency_events",
    "pmo_control_operation_receipts",
  ]) {
    assert.match(sql, new RegExp(`create table if not exists public\\.${table}`, "i"));
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`, "i"));
  }
  for (const fn of [
    "transition_data_quality_issue_tx",
    "transition_operating_cadence_tx",
    "transition_governance_action_tx",
    "transition_capacity_conflict_action_tx",
    "transition_project_dependency_tx",
    "save_capacity_plan_tx",
    "save_project_level_rule_matrix_tx",
    "save_metric_definition_tx",
    "create_operating_cadence_tx",
    "create_project_dependency_tx",
    "save_data_quality_scan_tx",
  ]) assert.match(sql, new RegExp(`create or replace function public\\.${fn}`, "i"));
  assert.match(sql, /idempotency_key/i);
  assert.match(sql, /data_class/i);
  assert.match(sql, /pmo_control_events/i);
  assert.match(sql, /MEETING_DISPOSITION_REQUIRED/);
  assert.match(sql, /DECISION_BRIEF_REQUIRED/);
  const route = readFileSync("src/app/api/pmo/control-center/route.ts", "utf8");
  const page = readFileSync("src/app/pmo/control-center/page.tsx", "utf8");
  const inboxRoute = readFileSync("src/app/api/collaboration-inbox/route.ts", "utf8");
  assert.match(route, /resolveBusinessContext/);
  assert.match(route, /loadContextProjectIdentityMappings/);
  assert.match(route, /scope\.context\.subjectScope === "portfolio"/);
  assert.match(route, /PORTFOLIO_OR_ORGANIZATION_CONTEXT_REQUIRED/);
  assert.match(route, /Idempotency-Key/);
  assert.match(route, /transition_data_quality_issue_tx/);
  assert.match(route, /transition_operating_cadence_tx/);
  assert.match(route, /transition_governance_action_tx/);
  assert.match(route, /transition_capacity_conflict_action_tx/);
  assert.match(route, /transition_project_dependency_tx/);
  assert.match(route, /create_operating_cadence_tx/);
  assert.match(route, /create_project_dependency_tx/);
  assert.match(route, /save_data_quality_scan_tx/);
  assert.match(route, /save_capacity_plan_tx/);
  assert.match(route, /save_project_level_rule_matrix_tx/);
  assert.match(route, /save_metric_definition_tx/);
  assert.match(route, /metric_definitions/);
  assert.match(route, /project_level_rule_matrices/);
  assert.match(route, /governance_cadence_actions/);
  assert.match(route, /capacity_conflict_actions/);
  assert.match(route, /scopeProjectIds/);
  assert.match(route, /canonical_project_id/);
  assert.match(route, /ownerOnly/);
  assert.match(route, /owner_user_id/);
  assert.doesNotMatch(route, /\.from\("operating_cadences"\)\.insert/);
  assert.doesNotMatch(route, /\.from\("resource_capacity_snapshots"\)\.upsert/);
  assert.doesNotMatch(route, /mock|demo|DEFAULT_/i);
  assert.match(page, /PMO组合治理与运营控制中心/);
  assert.match(page, /治理会议闭环/);
  assert.match(page, /8–12 周资源计划/);
  assert.match(page, /S\/A\/B\/C分级规则矩阵/);
  assert.match(page, /版本化指标字典/);
  assert.match(page, /数据质量纠偏闭环/);
  assert.match(page, /会议结论与行动/);
  assert.match(page, /资源冲突处置/);
  assert.match(page, /依赖确认与解除/);
  assert.match(page, /升级或纠偏/);
  for (const source of ["data_quality_issues", "governance_cadence_actions", "capacity_conflict_actions", "project_dependencies", "resource_capacity_allocations"]) assert.match(inboxRoute, new RegExp(source));
  assert.match(inboxRoute, /\/pmo\/control-center\?owner_mode=1/);
});

test("data quality and governance cadence state machines reject skipped business steps", () => {
  assert.equal(canTransitionDataQuality("assigned", "in_progress"), true);
  assert.equal(canTransitionDataQuality("in_progress", "evidence_submitted"), true);
  assert.equal(canTransitionDataQuality("evidence_submitted", "closed"), true);
  assert.equal(canTransitionDataQuality("assigned", "closed"), false);
  assert.equal(canTransitionDataQuality("closed", "reopened"), true);

  assert.equal(canTransitionCadence("preparing", "ready"), true);
  assert.equal(canTransitionCadence("ready", "in_meeting"), true);
  assert.equal(canTransitionCadence("in_meeting", "minutes_pending"), true);
  assert.equal(canTransitionCadence("minutes_pending", "actions_pending"), true);
  assert.equal(canTransitionCadence("actions_pending", "effect_review"), true);
  assert.equal(canTransitionCadence("effect_review", "closed"), true);
  assert.equal(canTransitionCadence("preparing", "closed"), false);
  assert.equal(canTransitionCadence("ready", "cancelled"), true);

  assert.equal(canTransitionGovernanceAction("assigned", "accepted"), true);
  assert.equal(canTransitionGovernanceAction("accepted", "closed"), false);
  assert.equal(canTransitionGovernanceAction("evidence_submitted", "effect_review"), true);
  assert.equal(canTransitionCapacityConflict("assigned", "accepted"), true);
  assert.equal(canTransitionCapacityConflict("evidence_submitted", "verified"), true);
  assert.equal(canTransitionCapacityConflict("assigned", "closed"), false);
  assert.equal(canTransitionDependency("identified", "confirmed"), true);
  assert.equal(canTransitionDependency("monitoring", "evidence_submitted"), true);
  assert.equal(canTransitionDependency("evidence_submitted", "verified"), true);
  assert.equal(canTransitionDependency("verified", "resolved"), true);
  assert.equal(canTransitionDependency("identified", "resolved"), false);
});

test("8 to 12 week capacity plan keeps project allocation and creates accountable conflicts", () => {
  const weeks = Array.from({ length: 8 }, (_, index) => ({
    periodStart: `2026-07-${String(6 + index * 7).padStart(2, "0")}`,
    periodEnd: `2026-07-${String(12 + index * 7).padStart(2, "0")}`,
    capacityHours: 40,
    allocations: [
      { projectId: "p1", hours: index === 0 ? 30 : 20 },
      { projectId: "p2", hours: index === 0 ? 20 : 10 },
    ],
  }));
  const plan = buildCapacityPlan({ ownerName: "架构师", roleName: "解决方案架构", ownerUserId: "u1", weeks });
  assert.equal(plan.weeks.length, 8);
  assert.equal(plan.weeks[0].demandHours, 50);
  assert.equal(plan.conflicts.length, 1);
  assert.equal(plan.conflicts[0].ownerUserId, "u1");
  assert.equal(plan.conflicts[0].overloadHours, 10);
  assert.throws(() => buildCapacityPlan({ ownerName: "架构师", roleName: "解决方案架构", ownerUserId: "u1", weeks: weeks.slice(0, 7) }), /8–12/);
});

test("versioned project rule matrix requires exactly S A B C governance levels", () => {
  const valid = validateProjectLevelRuleMatrix({
    S: { maxOpenCriticalSignals: 0, cadence: "weekly", escalationHours: 4, evidenceRequired: true, signalRules: [{ signalType: "milestone_delay", metricKey: "milestone_schedule_variance", metricVersion: "v1", yellowThreshold: 1, redThreshold: 3, unit: "workday", impactDimensions: ["schedule", "cash"], dataFreshnessHours: 24, handlingRole: "pmo", slaStartEvent: "signal_verified", slaEndEvent: "effect_verified", escalationLevel: "L3", decisionAuthority: "ceo", closureEvidence: ["飞书里程碑记录", "PMO效果复核"] }] },
    A: { maxOpenCriticalSignals: 0, cadence: "biweekly", escalationHours: 8, evidenceRequired: true, signalRules: [{ signalType: "milestone_delay", metricKey: "milestone_schedule_variance", metricVersion: "v1", yellowThreshold: 2, redThreshold: 5, unit: "workday", impactDimensions: ["schedule"], dataFreshnessHours: 48, handlingRole: "pmo", slaStartEvent: "signal_verified", slaEndEvent: "effect_verified", escalationLevel: "L2", decisionAuthority: "pmo", closureEvidence: ["飞书里程碑记录"] }] },
    B: { maxOpenCriticalSignals: 1, cadence: "monthly", escalationHours: 24, evidenceRequired: true, signalRules: [{ signalType: "milestone_delay", metricKey: "milestone_schedule_variance", metricVersion: "v1", yellowThreshold: 3, redThreshold: 7, unit: "workday", impactDimensions: ["schedule"], dataFreshnessHours: 72, handlingRole: "pm", slaStartEvent: "signal_verified", slaEndEvent: "effect_verified", escalationLevel: "L2", decisionAuthority: "pmo", closureEvidence: ["里程碑记录"] }] },
    C: { maxOpenCriticalSignals: 2, cadence: "monthly", escalationHours: 48, evidenceRequired: false, signalRules: [{ signalType: "milestone_delay", metricKey: "milestone_schedule_variance", metricVersion: "v1", yellowThreshold: 5, redThreshold: 10, unit: "workday", impactDimensions: ["schedule"], dataFreshnessHours: 120, handlingRole: "pm", slaStartEvent: "signal_verified", slaEndEvent: "action_closed", escalationLevel: "L1", decisionAuthority: "sponsor", closureEvidence: ["里程碑记录"] }] },
  });
  assert.equal(valid.ok, true);
  assert.equal(validateProjectLevelRuleMatrix({ S: {}, A: {}, B: {} }).ok, false);
  assert.equal(validateProjectLevelRuleMatrix({
    S: { maxOpenCriticalSignals: 0, cadence: "weekly", escalationHours: 4, evidenceRequired: true, signalRules: [{ signalType: "milestone_delay", metricKey: "metric", metricVersion: "v1", yellowThreshold: 5, redThreshold: 2, unit: "day", impactDimensions: [], dataFreshnessHours: 0, handlingRole: "", slaStartEvent: "", slaEndEvent: "", escalationLevel: "", decisionAuthority: "", closureEvidence: [] }] },
    A: { maxOpenCriticalSignals: 0, cadence: "weekly", escalationHours: 4, evidenceRequired: true, signalRules: [] },
    B: { maxOpenCriticalSignals: 0, cadence: "weekly", escalationHours: 4, evidenceRequired: true, signalRules: [] },
    C: { maxOpenCriticalSignals: 0, cadence: "weekly", escalationHours: 4, evidenceRequired: true, signalRules: [] },
  }).ok, false);
});

test("active P20 project-level matrix drives the milestone signal thresholds", () => {
  const rule = resolveMilestoneDelayRuleFromMatrix({
    projectLevel: "S",
    matrixVersion: "portfolio-rules-v3",
    rules: {
      S: { maxOpenCriticalSignals: 0, cadence: "weekly", escalationHours: 4, evidenceRequired: true, signalRules: [{ signalType: "milestone_delay", metricKey: "milestone_schedule_variance", metricVersion: "v2", yellowThreshold: 2, redThreshold: 6, unit: "workday", impactDimensions: ["criticalPath", "cash"], dataFreshnessHours: 24, handlingRole: "pmo", slaStartEvent: "signal_verified", slaEndEvent: "effect_verified", escalationLevel: "L3", decisionAuthority: "ceo", closureEvidence: ["飞书里程碑"] }] },
    },
  });
  assert.deepEqual(rule, { version: "portfolio-rules-v3:S:milestone_delay", warningWorkdays: 2, pmoToleranceWorkdays: 6, majorImpacts: ["criticalPath", "cash"], dataFreshnessHours: 24, escalationHours: 4 });
  assert.equal(resolveMilestoneDelayRuleFromMatrix({ projectLevel: "A", matrixVersion: "v1", rules: {} }), null);
  assert.deepEqual(evaluateSourceFreshness("2026-07-09T23:00:00.000Z", 24, new Date("2026-07-10T00:00:00.000Z")), { valid: true, ageHours: 1 });
  assert.equal(evaluateSourceFreshness("2026-07-08T00:00:00.000Z", 24, new Date("2026-07-10T00:00:00.000Z")).valid, false);
  assert.equal(evaluateSourceFreshness(null, 24).valid, false);
  assert.equal(applySignalSla({ ruleVersion: "v", triggered: true, deviationWorkdays: 2, route: "action", nextStatus: "pending_verification", dedupKey: "d", impactReasons: [] }, rule!, new Date("2026-07-10T00:00:00.000Z")).slaDueAt, "2026-07-10T04:00:00.000Z");
});
