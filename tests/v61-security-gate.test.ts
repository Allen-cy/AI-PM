import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  SECURITY_GATE_TABLES,
  auditMigrationText,
  runDatabaseSecurityAudit,
} from "../scripts/audit-database-security.mjs";

const ROOT = process.cwd();
const EXPECTED_TABLES = [
  "cost_records",
  "knowledge_documents",
  "lessons_learned",
  "okr_key_results",
  "project_stages",
  "qa_sessions",
  "quality_checklists",
  "risk_retrospective_asset_governance_logs",
  "risk_retrospective_asset_sync_logs",
  "risk_retrospective_asset_usage_logs",
  "risk_retrospective_assets",
  "sign_offs",
  "wbs_items",
].sort();

function loadSecurityMigration() {
  const migrationDir = path.join(ROOT, "supabase/migrations");
  const matches = fs.readdirSync(migrationDir)
    .filter((name) => name.endsWith("_v61_security_gate.sql"));
  assert.equal(matches.length, 1, "V6.1 must have exactly one dedicated security migration");
  return fs.readFileSync(path.join(migrationDir, matches[0]), "utf8");
}

test("V6.1 security gate owns the exact audited table inventory", () => {
  assert.deepEqual([...SECURITY_GATE_TABLES].sort(), EXPECTED_TABLES);
});

test("V6.1 migration enables RLS, revokes client grants and preserves service CRUD on all 13 tables", () => {
  const migration = loadSecurityMigration();
  const audit = auditMigrationText(migration);

  assert.deepEqual(audit.violations, []);
  for (const table of EXPECTED_TABLES) {
    assert.match(
      migration,
      new RegExp(`alter\\s+table\\s+(?:if\\s+exists\\s+)?public\\.${table}\\s+enable\\s+row\\s+level\\s+security`, "i"),
      `${table} must have RLS enabled explicitly`,
    );
  }
  assert.match(migration, /revoke\s+all[\s\S]+from\s+public\s*,\s*anon\s*,\s*authenticated/i);
  assert.match(migration, /grant\s+select\s*,\s*insert\s*,\s*update\s*,\s*delete[\s\S]+to\s+service_role/i);
});

test("V6.1 security migration is additive and safe to execute repeatedly", () => {
  const migration = loadSecurityMigration();

  assert.doesNotMatch(migration, /\bdrop\s+(?:table|schema|column)\b/i);
  assert.doesNotMatch(migration, /\btruncate\b/i);
  assert.doesNotMatch(migration, /\bdelete\s+from\b/i);
  assert.doesNotMatch(migration, /\bupdate\s+public\./i);
  assert.doesNotMatch(migration, /\binsert\s+into\b/i);
});

test("database audit RPC is service-only and covers tables policies functions sequences and service grants", () => {
  const migration = loadSecurityMigration();

  assert.match(migration, /create\s+or\s+replace\s+function\s+public\.audit_v61_database_security\(\)/i);
  assert.match(migration, /security\s+definer/i);
  assert.match(migration, /set\s+search_path\s*=\s*pg_catalog\s*,\s*public/i);
  assert.match(migration, /revoke\s+all\s+on\s+function\s+public\.audit_v61_database_security\(\)\s+from\s+public\s*,\s*anon\s*,\s*authenticated/i);
  assert.match(migration, /grant\s+execute\s+on\s+function\s+public\.audit_v61_database_security\(\)\s+to\s+service_role/i);
  assert.match(migration, /relrowsecurity/i);
  assert.match(migration, /from\s+pg_policies/i);
  assert.match(migration, /from\s+pg_proc/i);
  assert.match(migration, /has_function_privilege/i);
  assert.match(migration, /relkind\s*=\s*'S'/i);
  assert.match(migration, /has_sequence_privilege/i);
  assert.match(migration, /SERVICE_ROLE_CRUD_MISSING/i);
  assert.match(migration, /SERVICE_ROLE_EXECUTE_MISSING/i);
  assert.match(migration, /SERVICE_ROLE_SEQUENCE_PRIVILEGE_MISSING/i);
});

test("V6.1 adopts explicit grants for future public objects", () => {
  const migration = loadSecurityMigration();
  assert.match(migration, /alter default privileges[\s\S]*revoke select, insert, update, delete on tables from public, anon, authenticated, service_role/i);
  assert.match(migration, /alter default privileges[\s\S]*revoke usage, select, update on sequences from public, anon, authenticated, service_role/i);
  assert.match(migration, /alter default privileges[\s\S]*revoke execute on functions from public, anon, authenticated, service_role/i);
  assert.match(migration, /revoke all on function %s from public, anon, authenticated/i);
  assert.match(migration, /grant execute on function %s to service_role/i);
  assert.match(migration, /revoke all on table %I\.%I from public, anon, authenticated/i);
  assert.match(migration, /grant select, insert, update, delete on table %I\.%I to service_role/i);
  assert.match(migration, /revoke all on sequence %I\.%I from public, anon, authenticated/i);
});

test("database audit covers every application-owned public table, including tables added later", () => {
  const migration = loadSecurityMigration();

  assert.match(migration, /from\s+pg_class[\s\S]+join\s+pg_namespace/i);
  assert.match(migration, /not\s+exists\s*\([\s\S]+pg_depend[\s\S]+deptype\s*=\s*'e'/i);
  assert.doesNotMatch(migration, /with\s+target_tables\s*\(/i);
});

test("automated database audit fails closed when the RPC reports a violation", async () => {
  const requests: Array<{ input: string; init?: RequestInit }> = [];
  const result = await runDatabaseSecurityAudit({
    supabaseUrl: "https://project.supabase.co/",
    serviceRoleKey: "test-service-role-key",
    fetchImpl: async (input, init) => {
      requests.push({ input: String(input), init });
      return new Response(JSON.stringify([
        {
          table_name: "cost_records",
          table_exists: true,
          rls_enabled: false,
          forbidden_grantees: ["anon"],
        },
      ]), { status: 200, headers: { "content-type": "application/json" } });
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.violations.length, 1);
  assert.equal(requests[0]?.input, "https://project.supabase.co/rest/v1/rpc/audit_v61_database_security");
  assert.equal(requests[0]?.init?.method, "POST");
  assert.equal((requests[0]?.init?.headers as Record<string, string>).Authorization, "Bearer test-service-role-key");
});

test("automated database audit passes only when the RPC returns no violations", async () => {
  const result = await runDatabaseSecurityAudit({
    supabaseUrl: "https://project.supabase.co",
    serviceRoleKey: "test-service-role-key",
    fetchImpl: async () => new Response("[]", {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  });

  assert.deepEqual(result, { ok: true, violations: [] });
});

test("automated database audit rejects missing credentials and non-success RPC responses", async () => {
  await assert.rejects(
    () => runDatabaseSecurityAudit({ supabaseUrl: "", serviceRoleKey: "", fetchImpl: fetch }),
    /SUPABASE_URL.*SUPABASE_SERVICE_ROLE_KEY/,
  );
  await assert.rejects(
    () => runDatabaseSecurityAudit({
      supabaseUrl: "https://project.supabase.co",
      serviceRoleKey: "test-service-role-key",
      fetchImpl: async () => new Response("forbidden", { status: 403 }),
    }),
    /403/,
  );
});
