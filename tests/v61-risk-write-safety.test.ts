import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const repositorySource = readFileSync(new URL("../src/lib/risk-repository.ts", import.meta.url), "utf8");
const routeSource = readFileSync(new URL("../src/app/api/risk/route.ts", import.meta.url), "utf8");
const migrationSource = readFileSync(
  new URL("../supabase/migrations/20260711150000_v61_risk_scope_quarantine.sql", import.meta.url),
  "utf8",
);
const contractMigrationSource = readFileSync(
  new URL("../supabase/migrations/20260713115433_v61_risk_uniqueness_contract.sql", import.meta.url),
  "utf8",
);

test("V6.1 risk uniqueness is project scoped and UUID misses fail closed", () => {
  assert.match(
    migrationSource,
    /unique\s*\(\s*org_id\s*,\s*data_class\s*,\s*project_id\s*,\s*risk_code\s*\)/i,
  );
  assert.match(
    migrationSource,
    /on conflict\s*\(\s*org_id\s*,\s*data_class\s*,\s*project_id\s*,\s*risk_code\s*\)\s*do nothing/i,
  );
  assert.doesNotMatch(repositorySource, /onConflict:\s*"org_id,data_class,risk_code"/);
  assert.match(repositorySource, /RISK_NOT_FOUND_OR_OUTSIDE_SCOPE/);
  assert.match(repositorySource, /p_risk_id:\s*uuidPattern\.test\(normalizedRisk\.id\)\s*\?\s*normalizedRisk\.id\s*:\s*null/);
});

test("V6.1 risk writes require optimistic concurrency and idempotency", () => {
  assert.match(repositorySource, /expectedVersion:\s*number/);
  assert.match(repositorySource, /idempotencyKey:\s*string/);
  assert.match(repositorySource, /\.rpc\("upsert_risk_v61"/);
  assert.match(repositorySource, /\.rpc\("transition_risk_v61"/);
  assert.match(repositorySource, /p_request_payload:\s*\{[\s\S]*?toStatus:\s*input\.toStatus/);
  assert.match(routeSource, /VERSION_CONFLICT[\s\S]*?409/);
  assert.match(routeSource, /IDEMPOTENCY_KEY_REUSED[\s\S]*?409/);
  assert.match(routeSource, /23505[\s\S]*?409/);

  assert.match(migrationSource, /create table if not exists public\.risk_operation_receipts/i);
  assert.match(migrationSource, /create or replace function public\.upsert_risk_v61/i);
  assert.match(migrationSource, /create or replace function public\.transition_risk_v61/i);
  assert.match(migrationSource, /transition_risk_v61\([\s\S]*?p_request_payload jsonb/i);
  assert.match(migrationSource, /select[\s\S]*?from public\.risks[\s\S]*?for update/i);
  assert.match(migrationSource, /insert into public\.risk_workflow_events/i);
  assert.match(migrationSource, /insert into public\.risk_operation_receipts/i);
  assert.match(migrationSource, /safe_payload[\s\S]*?['"]updated_at['"][\s\S]*?['"]closed_at['"]/i);
  assert.doesNotMatch(repositorySource, /updated_at:\s*new Date\(\)\.toISOString\(\)/);
});

test("V6.1 risk deletion is a soft archive operation", () => {
  assert.match(repositorySource, /\.rpc\("archive_risk_v61"/);
  assert.doesNotMatch(repositorySource, /from\("risks"\)\.delete\(\)/);
  assert.match(migrationSource, /create or replace function public\.archive_risk_v61/i);
  assert.match(migrationSource, /set archived_at\s*=\s*now\(\)/i);
  assert.match(repositorySource, /\.is\("archived_at",\s*null\)/);
});

test("V6.1 risk list and batch operations have enforced upper bounds", () => {
  assert.match(repositorySource, /export const MAX_RISK_LIST_LIMIT\s*=\s*500/);
  assert.match(repositorySource, /export const MAX_RISK_BATCH_SIZE\s*=\s*100/);
  assert.match(repositorySource, /export function normalizeRiskListLimit/);
  assert.match(repositorySource, /Math\.min\(MAX_RISK_LIST_LIMIT,\s*Math\.max\(1,/);
  assert.match(repositorySource, /BATCH_LIMIT_EXCEEDED/);
  assert.match(repositorySource, /\.limit\(limit\)/);
  assert.match(repositorySource, /\.rpc\("upsert_risk_batch_v61"/);
  assert.match(migrationSource, /create or replace function public\.upsert_risk_batch_v61/i);
  assert.match(migrationSource, /jsonb_array_length\(p_items\)\s*>\s*100/i);
  assert.match(migrationSource, /perform public\.upsert_risk_v61|select public\.upsert_risk_v61/i);
});

test("V6.1 rolling release has an explicit contract migration for project-scoped uniqueness", () => {
  for (const constraint of [
    "risks_risk_code_key",
    "risk_retrospective_assets_asset_key_key",
    "risk_retrospective_governance_followups_action_key_key",
    "risk_retrospective_governance_operation_snaps_snapshot_date_key",
    "risk_retrospective_governance_reminder_logs_reminder_key_key",
  ]) {
    assert.match(
      contractMigrationSource,
      new RegExp(`drop constraint if exists ${constraint}`, "i"),
      `${constraint} must be removed only in the post-deploy contract migration`,
    );
  }
  for (const replacement of [
    "risks_org_data_project_risk_code_key",
    "risk_retrospective_assets_org_data_asset_key",
    "risk_retro_followups_org_data_action_key",
    "risk_retro_snapshots_org_data_date_key",
    "risk_retro_reminders_org_data_key",
  ]) {
    assert.match(contractMigrationSource, new RegExp(replacement, "i"));
  }
  assert.doesNotMatch(contractMigrationSource, /delete\s+from|truncate\s+table|drop\s+table/i);
  assert.match(contractMigrationSource, /notify pgrst, 'reload schema'/i);
});
