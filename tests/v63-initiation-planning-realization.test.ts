import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  nextGovernanceArtifactStatus,
  parseGovernanceWriteContract,
  type GovernanceArtifactStatus,
} from "../src/features/project-governance/contracts.ts";

const ROOT = new URL("../", import.meta.url);
const read = (path: string) => readFileSync(new URL(path, ROOT), "utf8");

test("V6.3 governance writes require stable project context, idempotency and optimistic version", () => {
  const parsed = parseGovernanceWriteContract({
    project_id: "3bf3193b-9d6a-4774-99a8-476f75554be5",
    business_role: "pm",
    data_class: "production",
    idempotency_key: "v63:test:save-business-case",
    expected_version: 2,
  });
  assert.equal(parsed.projectId, "3bf3193b-9d6a-4774-99a8-476f75554be5");
  assert.equal(parsed.businessRole, "pm");
  assert.equal(parsed.dataClass, "production");
  assert.equal(parsed.expectedVersion, 2);
  assert.throws(() => parseGovernanceWriteContract({
    project_id: parsed.projectId,
    business_role: "pm",
    data_class: "production",
    expected_version: 0,
  }), /idempotency_key/);
});

test("human workflow owns submission and approval transitions", () => {
  const transition = (status: GovernanceArtifactStatus, operation: string, role: string) => (
    nextGovernanceArtifactStatus({ status, operation, businessRole: role })
  );
  assert.equal(transition("draft", "submit", "pm"), "submitted");
  assert.equal(transition("submitted", "approve", "sponsor"), "approved");
  assert.equal(transition("submitted", "request_changes", "pmo"), "changes_requested");
  assert.equal(transition("changes_requested", "revise", "pm"), "draft");
  assert.equal(transition("approved", "supersede", "pmo"), "superseded");
  assert.throws(() => transition("submitted", "approve", "pm"), /ROLE_FORBIDDEN/);
  assert.throws(() => transition("draft", "approve", "sponsor"), /STATUS_CONFLICT/);
});

test("V6.3 migration persists initiation, artifacts, baselines, decisions and append-only events", () => {
  const sql = read("supabase/migrations/20260713223000_v63_initiation_planning_realization.sql");
  for (const table of [
    "project_initiation_records",
    "project_governance_artifacts",
    "project_plan_baselines",
    "project_governance_decisions",
    "project_governance_events",
  ]) {
    assert.match(sql, new RegExp(`create table if not exists public\\.${table}`, "i"));
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`, "i"));
    assert.match(sql, new RegExp(`revoke all on table public\\.${table} from public, anon, authenticated`, "i"));
  }
  for (const fn of [
    "save_project_initiation_tx",
    "save_project_governance_artifact_tx",
    "transition_project_governance_artifact_tx",
    "save_project_plan_baseline_tx",
    "transition_project_plan_baseline_tx",
  ]) {
    assert.match(sql, new RegExp(`create or replace function public\\.${fn}`, "i"));
    assert.match(sql, new RegExp(`grant execute on function public\\.${fn}`, "i"));
  }
  assert.match(sql, /expected_version/i);
  assert.match(sql, /idempotency_key/i);
  assert.match(sql, /VERSION_CONFLICT/i);
  assert.match(sql, /project_governance_events/i);
  assert.doesNotMatch(sql, /delete\s+from\s+public\.(project_initiation_records|project_governance_artifacts|project_plan_baselines)/i);
});

test("initiation and planning APIs use scoped Supabase transactions and return source metadata", () => {
  const initiation = read("src/app/api/initiation/route.ts");
  const planning = read("src/app/api/planning/route.ts");
  for (const source of [initiation, planning]) {
    assert.match(source, /resolveProjectLifecycleAccess/);
    assert.match(source, /project_id/);
    assert.match(source, /business_role/);
    assert.match(source, /data_class/);
    assert.match(source, /idempotency_key/);
    assert.match(source, /expected_version/);
    assert.match(source, /source:\s*\{[\s\S]*?type:\s*["']supabase["']/);
    assert.match(source, /data_class:/);
    assert.match(source, /data:/);
  }
  assert.match(initiation, /save_project_initiation_tx/);
  assert.match(initiation, /save_project_governance_artifact_tx/);
  assert.match(initiation, /transition_project_governance_artifact_tx/);
  assert.match(planning, /save_project_governance_artifact_tx/);
  assert.match(planning, /save_project_plan_baseline_tx/);
  assert.match(planning, /transition_project_plan_baseline_tx/);
});

test("formal initiation and planning pages reload persisted outputs instead of pretending local completion", () => {
  const initiation = read("src/app/initiation/page.tsx");
  const planning = read("src/app/planning/page.tsx");
  assert.match(initiation, /save_initiation/);
  assert.match(initiation, /save_business_case/);
  assert.match(initiation, /save_charter/);
  assert.match(initiation, /transition_artifact/);
  assert.match(initiation, /supersede/);
  assert.doesNotMatch(initiation, /disabled\s*\n\s*title="章程审批流尚未接入/);
  assert.match(planning, /loadCurrentBusinessContextSearchParams/);
  assert.match(planning, /save_management_plan/);
  assert.match(planning, /save_baseline/);
  assert.match(planning, /transition_baseline/);
  assert.match(planning, /supersede/);
  assert.doesNotMatch(planning, /项目名称:\s*['"]示例项目['"]/);
  assert.doesNotMatch(planning, /后续可接入飞书或Supabase保存正式基准版本/);
});
