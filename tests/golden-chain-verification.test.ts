import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";

import {
  GOLDEN_CHAIN_DEFINITIONS,
  buildGoldenChainReadiness,
  parseGoldenChainArtifactReferences,
  validateGoldenChainParticipantBindings,
  transitionGoldenChainRun,
  transitionGoldenChainStep,
  validateGoldenChainArtifactReferences,
} from "../src/features/operating-model/golden-chains.ts";

test("P25 defines five executable golden chains with role, artifact and failure-path contracts", () => {
  assert.deepEqual(Object.keys(GOLDEN_CHAIN_DEFINITIONS), ["A", "B", "C", "D", "E"]);
  for (const definition of Object.values(GOLDEN_CHAIN_DEFINITIONS)) {
    assert.ok(definition.roles.length >= 2);
    assert.ok(definition.steps.length >= 4);
    assert.ok(definition.failurePaths.length >= 3);
    assert.ok(definition.steps.every(step => step.requiredArtifactTypes.length > 0));
  }
  assert.deepEqual(GOLDEN_CHAIN_DEFINITIONS.A.roles, ["pm", "operations", "pmo", "ceo"]);
  assert.ok(GOLDEN_CHAIN_DEFINITIONS.E.steps.some(step => step.requiredArtifactTypes.includes("knowledge_reuse_event")));
});

test("P25 golden chain cannot pass with free text, non-production data or unverified failure paths", () => {
  const definition = GOLDEN_CHAIN_DEFINITIONS.A;
  const base = {
    dataClass: "production",
    sourceSnapshotAt: "2026-07-10T08:00:00.000Z",
    participantRoles: definition.roles,
    steps: definition.steps.map(step => ({
      key: step.key,
      status: "verified",
      artifactReferences: step.requiredArtifactTypes.map((objectType, index) => ({
        objectType,
        objectId: `${step.key}-${index}`,
        sourceType: "supabase" as const,
        dataClass: "production",
        verifiedAt: "2026-07-10T09:00:00.000Z",
      })),
    })),
    failurePathResults: definition.failurePaths.map(path => ({ key: path.key, status: "passed", evidence: [{ type: "audit", id: path.key }] })),
  } as const;

  assert.equal(buildGoldenChainReadiness("A", base).canPass, true);
  assert.equal(buildGoldenChainReadiness("A", { ...base, dataClass: "sample" }).canPass, false);
  assert.equal(buildGoldenChainReadiness("A", { ...base, failurePathResults: [] }).canPass, false);
  assert.equal(buildGoldenChainReadiness("A", { ...base, steps: base.steps.map((step, index) => index === 0 ? { ...step, artifactReferences: [] } : step) }).canPass, false);
});

test("P25 golden chain validates structured references and rejects secrets or mismatched data classes", () => {
  assert.deepEqual(validateGoldenChainArtifactReferences([
    { objectType: "management_signal", objectId: "sig-1", sourceType: "supabase", dataClass: "production", verifiedAt: "2026-07-10T09:00:00Z" },
  ], "production"), []);
  const errors = validateGoldenChainArtifactReferences([
    { objectType: "management_signal", objectId: "", sourceType: "supabase", dataClass: "sample", verifiedAt: "bad", metadata: { api_key: "secret" } },
  ], "production");
  assert.ok(errors.includes("ARTIFACT_ID_REQUIRED"));
  assert.ok(errors.includes("ARTIFACT_DATA_CLASS_MISMATCH"));
  assert.ok(errors.includes("ARTIFACT_VERIFICATION_TIME_INVALID"));
  assert.ok(errors.includes("ARTIFACT_SECRET_METADATA_FORBIDDEN"));
});

test("P25 golden chain uses guarded run and step state machines", () => {
  assert.equal(transitionGoldenChainRun("draft", "prepare"), "ready");
  assert.equal(transitionGoldenChainRun("ready", "start"), "running");
  assert.equal(transitionGoldenChainRun("running", "submit_verification"), "verification");
  assert.equal(transitionGoldenChainRun("verification", "pass"), "passed");
  assert.equal(transitionGoldenChainRun("verification", "fail"), "failed");
  assert.equal(transitionGoldenChainStep("pending", "start"), "in_progress");
  assert.equal(transitionGoldenChainStep("in_progress", "submit"), "submitted");
  assert.equal(transitionGoldenChainStep("submitted", "verify"), "verified");
  assert.equal(transitionGoldenChainStep("submitted", "reject"), "failed");
  assert.throws(() => transitionGoldenChainRun("draft", "pass"), /GOLDEN_CHAIN_RUN_TRANSITION_FORBIDDEN/);
  assert.throws(() => transitionGoldenChainStep("pending", "verify"), /GOLDEN_CHAIN_STEP_TRANSITION_FORBIDDEN/);
});

test("P25 golden chain only accepts complete structured artifact references", () => {
  assert.deepEqual(parseGoldenChainArtifactReferences([
    {
      objectType: "management_signal",
      objectId: "signal-1",
      sourceType: "supabase",
      dataClass: "production",
      verifiedAt: "2026-07-10T09:00:00.000Z",
      evidenceId: "evidence-1",
    },
  ]), [{
    objectType: "management_signal",
    objectId: "signal-1",
    sourceType: "supabase",
    dataClass: "production",
    verifiedAt: "2026-07-10T09:00:00.000Z",
    evidenceId: "evidence-1",
  }]);
  assert.throws(() => parseGoldenChainArtifactReferences(["done"]), /ARTIFACT_REFERENCE_OBJECT_REQUIRED/);
  assert.throws(() => parseGoldenChainArtifactReferences([{ objectType: "management_signal", objectId: "signal-1" }]), /ARTIFACT_REFERENCE_FIELDS_REQUIRED/);
  assert.throws(() => parseGoldenChainArtifactReferences([{ objectType: "unknown", objectId: "x", sourceType: "supabase", dataClass: "production", verifiedAt: "2026-07-10T09:00:00Z" }]), /ARTIFACT_TYPE_INVALID/);
});

test("P25 golden chain participant bindings cover required roles with real users", () => {
  const roles = GOLDEN_CHAIN_DEFINITIONS.A.roles;
  assert.deepEqual(validateGoldenChainParticipantBindings("A", roles.map((businessRole, index) => ({
    businessRole,
    userId: `user-${index + 1}`,
    assignmentId: `assignment-${index + 1}`,
  }))), []);
  assert.ok(validateGoldenChainParticipantBindings("A", [{ businessRole: "pm", userId: "", assignmentId: "" }]).includes("PARTICIPANT_IDENTITY_REQUIRED"));
  assert.ok(validateGoldenChainParticipantBindings("A", [
    { businessRole: "pm", userId: "u1", assignmentId: "a1" },
    { businessRole: "pm", userId: "u2", assignmentId: "a2" },
  ]).includes("PARTICIPANT_ROLE_DUPLICATED"));
  assert.ok(validateGoldenChainParticipantBindings("A", []).includes("PARTICIPANT_ROLE_MISSING"));
});

test("P25 golden chain persistence exposes isolated state-machine transactions", () => {
  const migrations = new URL("../supabase/migrations/", import.meta.url);
  const name = readdirSync(migrations).find(item => item.endsWith("_p25_golden_chain_execution.sql"));
  assert.ok(name, "P25 golden chain execution migration is required");
  const sql = readFileSync(new URL(name!, migrations), "utf8");
  for (const table of [
    "golden_chain_runs",
    "golden_chain_run_participants",
    "golden_chain_steps",
    "golden_chain_failure_paths",
    "golden_chain_events",
  ]) {
    assert.match(sql, new RegExp(`create table if not exists public\\.${table}`, "i"));
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`, "i"));
  }
  assert.match(sql, /unique\s*\(org_id,idempotency_key\)/i);
  assert.match(sql, /create or replace function public\.create_golden_chain_run_tx/i);
  assert.match(sql, /create or replace function public\.transition_golden_chain_step_tx/i);
  assert.match(sql, /create or replace function public\.golden_chain_artifacts_exist/i);
  assert.match(sql, /ARTIFACT_REFERENCE_NOT_FOUND_OR_OUTSIDE_SCOPE/i);
  assert.match(sql, /create or replace function public\.verify_golden_chain_failure_path_tx/i);
  assert.match(sql, /create or replace function public\.transition_golden_chain_run_tx/i);
  assert.match(sql, /P25_INDEPENDENT_VERIFIER_REQUIRED/i);
  assert.match(sql, /ARTIFACT_REFERENCE_FIELDS_REQUIRED/i);
  assert.match(sql, /FAILURE_PATH_STRUCTURED_EVIDENCE_REQUIRED/i);
  assert.match(sql, /revoke all on function[\s\S]*from public,anon,authenticated/i);
  assert.match(sql, /grant execute on function[\s\S]*to service_role/i);
});

test("P25 golden chain API and role page execute real persistent acceptance", () => {
  const route = readFileSync("src/app/api/operations-center/golden-chains/route.ts", "utf8");
  const page = readFileSync("src/app/operations-center/golden-chains/page.tsx", "utf8");
  const center = readFileSync("src/app/operations-center/page.tsx", "utf8");
  assert.match(route, /buildGoldenChainReadiness/);
  assert.match(route, /loadContextProjectIdentityMappings/);
  assert.match(route, /create_golden_chain_run_tx/);
  assert.match(route, /transition_golden_chain_step_tx/);
  assert.match(route, /verify_golden_chain_failure_path_tx/);
  assert.match(route, /transition_golden_chain_run_tx/);
  assert.match(route, /source:\s*\{\s*type:\s*"supabase",\s*fallback_used:\s*false/);
  assert.doesNotMatch(route, /mock|demo|fake/i);
  assert.match(page, /五条黄金链路验收台/);
  for (const role of ["项目经理", "运营", "PMO", "CEO", "业务Owner", "财务", "质量"]) assert.match(page, new RegExp(role, "i"));
  assert.match(page, /开始步骤/);
  assert.match(page, /提交成果/);
  assert.match(page, /独立验证/);
  assert.match(page, /失败路径/);
  assert.match(center, /href="\/operations-center\/golden-chains"/);
});
