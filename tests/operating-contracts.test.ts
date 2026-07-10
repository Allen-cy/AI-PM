import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  assessMetricTrust,
  buildImpactPackageDraft,
  buildManagementSignalDedupKey,
  evaluateBusinessAuthorization,
  resolveEvidenceExpiry,
  type BusinessAuthorizationPolicy,
} from "../src/features/operating-model/operating-contracts.ts";

const allowPolicy: BusinessAuthorizationPolicy = {
  id: "policy-1",
  effect: "allow",
  businessRole: "pmo",
  objectType: "decision_brief",
  action: "submit",
  allowedStates: ["draft"],
  projectLevels: ["S", "A"],
  decisionLevels: ["project", "portfolio"],
  maxAmount: 1_000_000,
  priority: 100,
};

test("P17 authorization is deny-first across role state grade decision level amount and recusal", () => {
  assert.deepEqual(evaluateBusinessAuthorization({
    businessRole: "pmo", objectType: "decision_brief", action: "submit", objectState: "draft",
    projectLevel: "S", decisionLevel: "portfolio", amount: 900_000, recused: false,
  }, [allowPolicy]), { allowed: true, policyId: "policy-1", code: "POLICY_ALLOWED" });
  assert.equal(evaluateBusinessAuthorization({
    businessRole: "pmo", objectType: "decision_brief", action: "submit", objectState: "draft",
    projectLevel: "S", decisionLevel: "portfolio", amount: 1_000_001, recused: false,
  }, [allowPolicy]).code, "AMOUNT_LIMIT_EXCEEDED");
  assert.equal(evaluateBusinessAuthorization({
    businessRole: "pmo", objectType: "decision_brief", action: "submit", objectState: "draft",
    projectLevel: "S", decisionLevel: "portfolio", amount: 1, recused: true,
  }, [allowPolicy]).code, "ACTOR_RECUSED");
  assert.equal(evaluateBusinessAuthorization({
    businessRole: "ceo", objectType: "decision_brief", action: "submit", objectState: "draft",
    projectLevel: "S", decisionLevel: "portfolio", amount: 1, recused: false,
  }, [allowPolicy]).code, "NO_MATCHING_ALLOW_POLICY");
});

test("P17 metric trust blocks stale or unapproved facts from formal decisions", () => {
  const trusted = assessMetricTrust({
    observedAt: "2026-07-10T08:30:00+08:00", evaluatedAt: "2026-07-10T09:00:00+08:00",
    freshnessSlaMinutes: 60, definitionStatus: "active", sourceStatus: "verified", dataClass: "production",
  });
  assert.equal(trusted.decisionUsable, true);
  assert.equal(trusted.freshnessStatus, "fresh");
  assert.equal(assessMetricTrust({
    observedAt: "2026-07-10T06:00:00+08:00", evaluatedAt: "2026-07-10T09:00:00+08:00",
    freshnessSlaMinutes: 60, definitionStatus: "active", sourceStatus: "verified", dataClass: "production",
  }).decisionUsable, false);
  assert.equal(assessMetricTrust({
    observedAt: "2026-07-10T08:50:00+08:00", evaluatedAt: "2026-07-10T09:00:00+08:00",
    freshnessSlaMinutes: 60, definitionStatus: "draft", sourceStatus: "verified", dataClass: "production",
  }).trustStatus, "untrusted");
});

test("P18 signal de-duplicates by type subject and reporting window", () => {
  assert.equal(
    buildManagementSignalDedupKey({ signalType: "cash", subjectScope: "project", subjectId: "p-1", window: "2026-W28" }),
    "cash:project:p-1:2026-W28",
  );
  assert.throws(() => buildManagementSignalDedupKey({ signalType: "unknown", subjectScope: "project", subjectId: "p-1", window: "2026-W28" }));
});

test("P18 approved risks issues and changes create human-confirmed impact packages", () => {
  const draft = buildImpactPackageDraft({
    orgId: "org-1", projectId: "project-1", sourceType: "change", sourceId: "change-1", sourceStatus: "approved",
    targets: [
      { targetType: "milestone", targetId: "m-1", proposedChange: { forecast_date: "2026-08-01" } },
      { targetType: "payment", targetId: "pay-1", proposedChange: { due_date: "2026-08-15" } },
    ], ownerUserId: "pm-1", reviewerUserId: "pmo-1", dueAt: "2026-07-12T09:00:00Z",
  });
  assert.equal(draft.status, "pending_confirmation");
  assert.equal(draft.targets.length, 2);
  assert.equal(draft.directWriteAllowed, false);
  assert.throws(() => buildImpactPackageDraft({ ...draft, sourceStatus: "draft" }));
});

test("P18 evidence expiry has deterministic block warn or reopen effects", () => {
  assert.deepEqual(resolveEvidenceExpiry("block_transition", "approved", "submitted"), { blockFutureTransition: true, nextStatus: "approved", createSignal: false });
  assert.deepEqual(resolveEvidenceExpiry("warn", "frozen", "submitted"), { blockFutureTransition: false, nextStatus: "frozen", createSignal: true });
  assert.deepEqual(resolveEvidenceExpiry("reopen_object", "accepted", "submitted"), { blockFutureTransition: false, nextStatus: "submitted", createSignal: true });
});

test("P17/P18 hardening migration persists policies metrics impact packages corrections and expiry jobs", () => {
  const sql = readFileSync("supabase/migrations/20260710130000_p17_p18_operating_contracts.sql", "utf8");
  for (const table of [
    "business_authorization_policies", "business_role_recusals", "business_role_coverage_gaps",
    "data_sync_contracts", "metric_observations", "business_forecast_versions",
    "object_impact_packages", "object_impact_package_events", "evidence_expiry_events",
  ]) assert.match(sql, new RegExp(`create table if not exists public\\.${table}`, "i"));
  assert.match(sql, /create or replace function public\.transition_feedback_correction_tx/i);
  assert.match(sql, /create or replace function public\.process_expired_lifecycle_evidence_tx/i);
  assert.match(sql, /create or replace function public\.transition_object_impact_package_tx/i);
  assert.match(sql, /enforce_p17_delegated_business_role/i);
  assert.match(sql, /scan_business_role_coverage_gaps_tx/i);
  assert.match(sql, /progress|cost|quality|risk|resource|acceptance|cash|benefit|data_quality/i);
  assert.match(sql, /revoke all[\s\S]+service_role/i);
});

test("P18 impact package workspace uses scoped persistence and never mutates target facts directly", () => {
  const route = readFileSync("src/app/api/projects/[id]/impact-packages/route.ts", "utf8");
  const page = readFileSync("src/app/projects/[id]/impact-packages/page.tsx", "utf8");
  assert.match(route, /resolveProjectLifecycleAccess/);
  assert.match(route, /object_impact_packages/);
  assert.match(route, /transition_object_impact_package_tx/);
  assert.doesNotMatch(route, /from\("(?:tasks|payment_milestones|contracts|cost_records)"\)\.update/);
  assert.match(page, /批准结果不会直接覆盖业务事实/);
  assert.match(page, /提交实施证据/);
  assert.match(page, /复核效果/);
});

test("P17 active authorization policies and recusals are enforced server-side and denied requests are audited", () => {
  const persistence = readFileSync("src/features/operating-model/authorization-persistence.ts", "utf8");
  const project360 = readFileSync("src/app/api/projects/[id]/360/route.ts", "utf8");
  const impacts = readFileSync("src/app/api/projects/[id]/impact-packages/route.ts", "utf8");
  assert.match(persistence, /business_authorization_policies/);
  assert.match(persistence, /business_role_recusals/);
  assert.match(persistence, /writeOperationAudit/);
  assert.match(project360, /authorizeBusinessOperation/);
  assert.match(impacts, /authorizeImpact/);
  const adminRoute = readFileSync("src/app/api/admin/operating-model/route.ts", "utf8");
  const adminPage = readFileSync("src/app/admin/operating-model/page.tsx", "utf8");
  assert.match(adminRoute, /requireAdmin/);
  assert.match(adminRoute, /activate_policy/);
  assert.match(adminRoute, /record_metric_observation/);
  assert.match(adminRoute, /create_sync_contract/);
  assert.match(adminPage, /权限、回避、指标口径和同步契约/);
});
