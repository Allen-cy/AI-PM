import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const moduleChecks = [
  "identity_access", "data_reconcile", "initiation_planning", "wbs_cpm_evm_resources",
  "commercial_finance", "stakeholders", "quality_acceptance", "execution_monitoring",
  "risk_issue_change", "closure", "formal_reporting_meetings", "role_workbenches_inbox",
  "cross_role_flow", "feishu_identity_boundary", "ai_rag", "security_recovery_mobile",
].map(moduleKey => ({ moduleKey, result: "passed" as const, evidenceCount: 1 }));

test("V6.6 separates technical rehearsal from formal controlled-pilot acceptance", async () => {
  const { evaluateControlledPilot } = await import("../src/features/pilot-acceptance/domain.ts");
  const common = {
    projectCount: 5,
    distinctParticipantUsers: 4,
    participantRoles: ["pm", "operations", "pmo", "ceo"],
    selfSignedRoles: ["pm", "operations", "pmo", "ceo"],
    participantKinds: ["real_user", "real_user", "real_user", "real_user"],
    moduleChecks,
    goldenChains: [
      { chainKey: "A", verificationLevel: "formal_passed" as const },
      { chainKey: "E", verificationLevel: "formal_passed" as const },
    ],
    feishuEvidence: [
      { actionType: "message", status: "succeeded", retryCount: 1 },
      { actionType: "task", status: "succeeded", retryCount: 1 },
      { actionType: "base_record_update", status: "succeeded", retryCount: 2, failureObservedAt: "2026-07-16T01:00:00Z", recoveredAt: "2026-07-16T01:05:00Z" },
    ],
  };
  const formal = evaluateControlledPilot({ ...common, mode: "formal_pilot", dataClass: "production" });
  assert.equal(formal.formalPassed, true);
  assert.equal(formal.blockers.length, 0);

  const testData = evaluateControlledPilot({ ...common, mode: "formal_pilot", dataClass: "test" });
  assert.equal(testData.formalPassed, false);
  assert.ok(testData.blockers.some(item => item.code === "FORMAL_PRODUCTION_DATA_REQUIRED"));

  const automated = evaluateControlledPilot({ ...common, mode: "formal_pilot", dataClass: "production", participantKinds: ["test_account", "real_user", "real_user", "real_user"] });
  assert.equal(automated.formalPassed, false);
  assert.ok(automated.blockers.some(item => item.code === "FOUR_REAL_USERS_REQUIRED"));
});

test("V6.6 technical readiness never becomes a formal pass and still exercises all contracts", async () => {
  const { evaluateControlledPilot } = await import("../src/features/pilot-acceptance/domain.ts");
  const result = evaluateControlledPilot({
    mode: "technical_rehearsal", dataClass: "test", projectCount: 5, distinctParticipantUsers: 4,
    participantRoles: ["pm", "operations", "pmo", "ceo"], selfSignedRoles: ["pm", "operations", "pmo", "ceo"],
    participantKinds: ["test_account", "test_account", "test_account", "test_account"], moduleChecks,
    goldenChains: [{ chainKey: "A", verificationLevel: "technical_exercised" }, { chainKey: "E", verificationLevel: "technical_exercised" }],
    feishuEvidence: [
      { actionType: "message", status: "succeeded", retryCount: 1 },
      { actionType: "task", status: "succeeded", retryCount: 1 },
      { actionType: "base_record_update", status: "succeeded", retryCount: 2, failureObservedAt: "2026-07-16T01:00:00Z", recoveredAt: "2026-07-16T01:05:00Z" },
    ],
  });
  assert.equal(result.technicalReady, true);
  assert.equal(result.formalPassed, false);
  assert.equal(result.blockers.length, 0);
});

test("V6.6 blocks incomplete modules, missing Feishu recovery and non-independent roles", async () => {
  const { evaluateControlledPilot } = await import("../src/features/pilot-acceptance/domain.ts");
  const result = evaluateControlledPilot({
    mode: "formal_pilot", dataClass: "production", projectCount: 5, distinctParticipantUsers: 1,
    participantRoles: ["pm", "operations", "pmo", "ceo"], selfSignedRoles: ["pm"], participantKinds: ["real_user"],
    moduleChecks: moduleChecks.slice(0, -1), goldenChains: [{ chainKey: "A", verificationLevel: "formal_passed" }],
    feishuEvidence: [{ actionType: "message", status: "succeeded", retryCount: 1 }],
  });
  assert.equal(result.formalPassed, false);
  for (const code of ["FOUR_DISTINCT_USERS_REQUIRED", "FOUR_SELF_SIGNOFFS_REQUIRED", "MODULE_COVERAGE_INCOMPLETE", "GOLDEN_CHAIN_E_REQUIRED", "FEISHU_THREE_TYPES_REQUIRED", "FEISHU_FAILURE_RETRY_REQUIRED"]) {
    assert.ok(result.blockers.some(item => item.code === code), code);
  }
});

test("V6.6 migration persists scoped pilot evidence with append-only events and service-only access", () => {
  const sql = read("supabase/migrations/20260716040000_v660_controlled_pilot_acceptance.sql");
  for (const table of [
    "controlled_pilot_runs", "controlled_pilot_projects", "controlled_pilot_participants",
    "controlled_pilot_module_checks", "controlled_pilot_golden_chains",
    "controlled_pilot_feishu_evidence", "controlled_pilot_events",
  ]) {
    assert.match(sql, new RegExp(`create table if not exists public\\.${table}`, "i"));
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`, "i"));
  }
  assert.match(sql, /prevent_v660_pilot_event_mutation/i);
  assert.match(sql, /before update or delete on public\.controlled_pilot_events/i);
  assert.match(sql, /create_v660_controlled_pilot_tx/i);
  assert.match(sql, /mutate_v660_controlled_pilot_tx/i);
  assert.match(sql, /evaluate_v660_controlled_pilot/i);
  assert.match(sql, /V660_VERSION_CONFLICT/i);
  assert.match(sql, /V660_SELF_SIGNOFF_ACTOR_REQUIRED/i);
  assert.match(sql, /revoke all on table[\s\S]+from public,anon,authenticated/i);
});

test("V6.6 API and page use governed selectors, versioning, report download and human gates", () => {
  const route = read("src/app/api/operations-center/pilot-acceptance/route.ts");
  const page = read("src/app/operations-center/pilot-acceptance/page.tsx");
  const center = read("src/app/operations-center/page.tsx");
  assert.match(route, /idempotency_key/);
  assert.match(route, /expected_version/);
  assert.match(route, /self_signoff/);
  assert.match(route, /format[^\n]+markdown/);
  assert.match(route, /loadContextProjectIdentityMappings/);
  assert.match(route, /PILOT_PROJECT_OUTSIDE_CONTEXT/);
  assert.match(route, /PILOT_SIGNED_CEO_REQUIRED/);
  assert.match(page, /BusinessEntitySelect/);
  assert.match(page, /loadCurrentBusinessContextSearchParams/);
  assert.match(page, /正在读取当前业务身份和受控试点数据/);
  assert.match(page, /workspace && currentRole === "pmo" && !selected/);
  assert.match(page, /技术演练/);
  assert.match(page, /正式试点/);
  assert.match(page, /本人签署/);
  assert.match(page, /下载验收报告/);
  assert.doesNotMatch(page, /placeholder=["'][^"']*(?:UUID|JSON|用户\s*ID|记录\s*ID)/i);
  assert.match(center, /href="\/operations-center\/pilot-acceptance"/);
  const confirmation = read("src/app/api/integrations/feishu/actions/confirmations/route.ts");
  const storage = read("src/features/feishu/action-confirmations.ts");
  assert.match(confirmation, /loadContextProjectIdentityMappings/);
  assert.match(confirmation, /operations-center\/pilot-acceptance/);
  assert.match(storage, /org_id:\s*input\.scope\?\.orgId/);
});
