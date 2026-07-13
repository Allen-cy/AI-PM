import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";

import {
  normalizeRiskDataClass,
  filterRiskScopedProjectRecords,
  resolveRequestedRiskProjectIds,
  type RiskAccessScope,
} from "../src/features/risk/scope.ts";

const repoSource = readFileSync(new URL("../src/lib/risk-repository.ts", import.meta.url), "utf8");
const routeSource = readFileSync(new URL("../src/app/api/risk/route.ts", import.meta.url), "utf8");
const accessSource = readFileSync(new URL("../src/features/risk/access.ts", import.meta.url), "utf8");
const quarantineRouteSource = readFileSync(new URL("../src/app/api/risk/quarantine/route.ts", import.meta.url), "utf8");
const clientContextSource = readFileSync(new URL("../src/features/operating-model/client-context.ts", import.meta.url), "utf8");
const riskPageSource = readFileSync(new URL("../src/app/risk/page.tsx", import.meta.url), "utf8");

test("V6.1 risk scope accepts only governed data classes", () => {
  assert.equal(normalizeRiskDataClass("production"), "production");
  assert.equal(normalizeRiskDataClass("sample"), "sample");
  assert.equal(normalizeRiskDataClass("unclassified"), "unclassified");
  assert.throws(() => normalizeRiskDataClass("prod"), /DATA_CLASS_INVALID/);
});

test("V6.1 risk project scope rejects cross-project access and never widens an empty scope", () => {
  const scope: RiskAccessScope = {
    actorUserId: "user-1",
    systemRole: "user",
    businessRole: "pm",
    orgId: "org-1",
    subjectScope: "portfolio",
    subjectId: "portfolio-1",
    dataClass: "production",
    projectIds: ["project-a", "project-b"],
    sourceRecordIds: ["rec-a", "rec-b"],
    externalProjectCodes: ["PA", "PB"],
  };

  assert.deepEqual(resolveRequestedRiskProjectIds(scope), ["project-a", "project-b"]);
  assert.deepEqual(resolveRequestedRiskProjectIds(scope, "project-b"), ["project-b"]);
  assert.throws(() => resolveRequestedRiskProjectIds(scope, "project-z"), /PROJECT_OUTSIDE_CONTEXT/);
  assert.deepEqual(resolveRequestedRiskProjectIds({ ...scope, projectIds: [] }), []);
});

test("V6.1 Feishu facts are reduced to stable external project identities", () => {
  const scope: RiskAccessScope = {
    actorUserId: "user-1", systemRole: "user", businessRole: "pm",
    orgId: "org-1", subjectScope: "portfolio", subjectId: "portfolio-1",
    dataClass: "production", projectIds: ["project-a"], requestedProjectId: "project-a",
    sourceRecordIds: ["rec-a"], externalProjectCodes: ["OA-A"],
  };
  const rows = [{ 项目编号: "OA-A" }, { 项目编号: "rec-a" }, { 项目编号: "OA-Z" }];
  assert.deepEqual(filterRiskScopedProjectRecords(rows, scope), rows.slice(0, 2));
  assert.deepEqual(filterRiskScopedProjectRecords(rows, { ...scope, sourceRecordIds: [], externalProjectCodes: [] }), []);
});

test("V6.1 client context loads project options from the selected data class", () => {
  assert.match(clientContextSource, /const dataClass\s*=\s*readStoredDataClass\(\)/);
  assert.match(clientContextSource, /\/api\/context\/current\?data_class=\$\{encodeURIComponent\(dataClass\)\}/);
  assert.match(riskPageSource, /\/api\/context\/current\?data_class=\$\{encodeURIComponent\(dataClass\)\}/);
});

test("V6.1 Feishu and template risk imports cannot collapse multiple projects into the selected project", () => {
  const templatePage = readFileSync(new URL("../src/app/templates/page.tsx", import.meta.url), "utf8");
  assert.match(riskPageSource, /record\.\u9879\u76ee\u7f16\u53f7[^\n]*selectedProject\.code/);
  assert.match(riskPageSource, /dashboardRecordToRisk\(record,\s*index,\s*selectedProject\.id\)/);
  assert.match(riskPageSource, /FEISHU_PROJECT_CODE_REQUIRED/);
  assert.match(templatePage, /TEMPLATE_PROJECT_MISMATCH/);
  assert.match(templatePage, /projectId:\s*selectedProject\.id/);
});

test("V6.1 risk repository and HTTP route enforce organization, project and data-class scope", () => {
  assert.match(repoSource, /export (?:interface|type) RiskRepositoryScope/);
  assert.match(repoSource, /\.eq\("org_id",\s*scope\.orgId\)/);
  assert.match(repoSource, /\.eq\("data_class",\s*scope\.dataClass\)/);
  assert.match(repoSource, /\.in\("project_id",\s*projectIds\)/);
  assert.match(repoSource, /\.rpc\("upsert_risk_v61"[\s\S]*?p_org_id:\s*scope\.orgId[\s\S]*?p_project_id:\s*projectId[\s\S]*?p_data_class:\s*scope\.dataClass/);
  assert.doesNotMatch(repoSource, /\.upsert\(payload\)\s*;/);
  assert.doesNotMatch(repoSource, /export async function listRisks\(\s*\)/);
  assert.doesNotMatch(repoSource, /NEXT_PUBLIC_SUPABASE_ANON_KEY/);

  assert.match(routeSource, /authorizeRiskRequest/);
  assert.match(accessSource, /BUSINESS_CONTEXT_AND_DATA_CLASS_REQUIRED/);
  assert.match(accessSource, /PROJECT_OUTSIDE_CONTEXT/);
  assert.match(quarantineRouteSource, /authorizeRiskRequest\(request,\s*"govern_quarantine"\)/);
  assert.match(quarantineRouteSource, /resolve_risk_quarantine_v61/);
});

test("V6.1 migration preserves unlinked risks in an explicit quarantine queue", () => {
  const migrationsUrl = new URL("../supabase/migrations/", import.meta.url);
  const migrationName = readdirSync(migrationsUrl).find(name => /v61.*risk_scope/i.test(name));
  assert.ok(migrationName, "V6.1 risk scope migration must exist");
  const migration = readFileSync(new URL(migrationName, migrationsUrl), "utf8");
  assert.match(migration, /alter table public\.risks\s+add column if not exists org_id/i);
  assert.match(migration, /add column if not exists data_class/i);
  assert.match(migration, /create table if not exists public\.risk_scope_quarantine/i);
  assert.match(migration, /legacy_unlinked_project/i);
  assert.match(migration, /insert into public\.risk_scope_quarantine/i);
  assert.match(migration, /create or replace function public\.resolve_risk_quarantine_v61/i);
  assert.match(migration, /quarantine_owner_org_id\s+uuid/i);
  assert.match(migration, /resolved_queue\.quarantine_owner_org_id\s+is\s+distinct\s+from\s+p_org_id/i);
  assert.match(migration, /update public\.risk_workflow_events[\s\S]*?where risk_id\s*=\s*p_risk_id/i);
  assert.match(migration, /risk-quarantine-resolution:/i);
  assert.match(migration, /create or replace function public\.sync_risk_quarantine_v61/i);
  assert.match(migration, /after insert or update on public\.risks[\s\S]*sync_risk_quarantine_v61/i);
  assert.match(migration, /new\.org_id\s*:=\s*project_org_id/i);
  assert.match(migration, /new\.data_class\s*:=\s*project_data_class/i);
  assert.match(migration, /new\.project_name\s*:=\s*project_canonical_name/i);

  assert.match(quarantineRouteSource, /\.eq\("quarantine_owner_org_id",\s*access\.scope\.orgId\)/);
  assert.match(quarantineRouteSource, /\.in\("data_class",\s*\[access\.scope\.dataClass,\s*"unclassified"\]\)/);
  assert.doesNotMatch(quarantineRouteSource, /org_id\.is\.null/);
  assert.doesNotMatch(quarantineRouteSource, /\.or\(/, "组织PMO不得读取全局无归属隔离队列");
  assert.match(quarantineRouteSource, /idempotency_key/);
  assert.match(quarantineRouteSource, /RESOLUTION_NOTE_REQUIRED/);
  assert.match(accessSource, /RISK_QUARANTINE_ORG_SCOPE_REQUIRED/);

  for (const table of [
    "risk_retrospective_assets",
    "risk_retrospective_asset_sync_logs",
    "risk_retrospective_asset_usage_logs",
    "risk_retrospective_asset_governance_logs",
    "risk_retrospective_governance_followups",
    "risk_retrospective_governance_operation_snapshots",
    "risk_retrospective_governance_reminder_logs",
    "risk_retrospective_governance_evidence_links",
  ]) {
    assert.match(migration, new RegExp(`alter table public\\.${table} add column if not exists org_id`, "i"));
    assert.match(migration, new RegExp(`alter table public\\.${table} add column if not exists data_class`, "i"));
  }

  for (const scopedUnique of [
    /unique\s*\(org_id,\s*data_class,\s*project_id,\s*asset_key\)/i,
    /unique\s*\(org_id,\s*data_class,\s*project_id,\s*action_key\)/i,
    /unique\s*\(org_id,\s*data_class,\s*project_id,\s*snapshot_date\)/i,
    /unique\s*\(org_id,\s*data_class,\s*project_id,\s*reminder_key\)/i,
  ]) assert.match(migration, scopedUnique);
  assert.doesNotMatch(migration, /drop\s+constraint/i, "V6.1滚动发布期不得删除旧唯一约束");
});
