import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const SECURITY_GATE_TABLES = Object.freeze([
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
]);

const FORBIDDEN_ROLES = ["public", "anon", "authenticated"];

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function statementsMatching(sql, pattern) {
  return sql
    .split(";")
    .map((statement) => statement.replace(/--.*$/gm, " ").replace(/\s+/g, " ").trim())
    .filter((statement) => pattern.test(statement));
}

export function auditMigrationText(sql) {
  const violations = [];
  const revokeStatements = statementsMatching(sql, /^revoke all on table\b/i);
  const serviceGrantStatements = statementsMatching(
    sql,
    /^grant select\s*,\s*insert\s*,\s*update\s*,\s*delete on table\b/i,
  );

  for (const table of SECURITY_GATE_TABLES) {
    const qualifiedTable = `public.${table}`;
    const rlsPattern = new RegExp(
      `alter\\s+table\\s+(?:if\\s+exists\\s+)?${escapeRegExp(qualifiedTable)}\\s+enable\\s+row\\s+level\\s+security`,
      "i",
    );
    if (!rlsPattern.test(sql)) violations.push(`${qualifiedTable}: RLS_NOT_ENABLED`);

    const revoke = revokeStatements.find((statement) => statement.includes(qualifiedTable));
    if (!revoke) {
      violations.push(`${qualifiedTable}: CLIENT_GRANTS_NOT_REVOKED`);
    } else {
      const normalized = revoke.toLowerCase();
      for (const role of FORBIDDEN_ROLES) {
        if (!new RegExp(`(?:from|,)\\s*${role}(?:\\s*,|\\s*$)`, "i").test(normalized)) {
          violations.push(`${qualifiedTable}: ${role.toUpperCase()}_NOT_REVOKED`);
        }
      }
    }

    const serviceGrant = serviceGrantStatements.find((statement) => statement.includes(qualifiedTable));
    if (!serviceGrant || !/\bto\s+service_role\s*$/i.test(serviceGrant)) {
      violations.push(`${qualifiedTable}: SERVICE_ROLE_CRUD_MISSING`);
    }
  }

  if (/\bdrop\s+(?:table|schema|column)\b|\btruncate\b|\bdelete\s+from\b/i.test(sql)) {
    violations.push("MIGRATION_CONTAINS_DESTRUCTIVE_DML_OR_DDL");
  }
  if (!/create\s+or\s+replace\s+function\s+public\.audit_v61_database_security\(\)/i.test(sql)) {
    violations.push("DATABASE_AUDIT_FUNCTION_MISSING");
  }
  if (!/revoke\s+all\s+on\s+function\s+public\.audit_v61_database_security\(\)\s+from\s+public\s*,\s*anon\s*,\s*authenticated/i.test(sql)) {
    violations.push("DATABASE_AUDIT_FUNCTION_EXPOSED");
  }
  const requiredAuditContracts = [
    ["FUTURE_TABLE_DEFAULT_PRIVILEGES_NOT_REVOKED", /alter\s+default\s+privileges[\s\S]*?revoke\s+select\s*,\s*insert\s*,\s*update\s*,\s*delete\s+on\s+tables\s+from\s+public\s*,\s*anon\s*,\s*authenticated\s*,\s*service_role/i],
    ["FUTURE_SEQUENCE_DEFAULT_PRIVILEGES_NOT_REVOKED", /alter\s+default\s+privileges[\s\S]*?revoke\s+usage\s*,\s*select\s*,\s*update\s+on\s+sequences\s+from\s+public\s*,\s*anon\s*,\s*authenticated\s*,\s*service_role/i],
    ["FUTURE_FUNCTION_DEFAULT_PRIVILEGES_NOT_REVOKED", /alter\s+default\s+privileges[\s\S]*?revoke\s+execute\s+on\s+functions\s+from\s+public\s*,\s*anon\s*,\s*authenticated\s*,\s*service_role/i],
    ["EXISTING_TABLE_PRIVILEGES_NOT_HARDENED", /revoke\s+all\s+on\s+table\s+%I\.%I\s+from\s+public\s*,\s*anon\s*,\s*authenticated/i],
    ["EXISTING_FUNCTION_PRIVILEGES_NOT_HARDENED", /revoke\s+all\s+on\s+function\s+%s\s+from\s+public\s*,\s*anon\s*,\s*authenticated/i],
    ["EXISTING_SEQUENCE_PRIVILEGES_NOT_HARDENED", /revoke\s+all\s+on\s+sequence\s+%I\.%I\s+from\s+public\s*,\s*anon\s*,\s*authenticated/i],
    ["POLICY_AUDIT_MISSING", /from\s+pg_policies/i],
    ["FUNCTION_EXECUTE_AUDIT_MISSING", /has_function_privilege/i],
    ["SEQUENCE_PRIVILEGE_AUDIT_MISSING", /has_sequence_privilege/i],
    ["SERVICE_ROLE_TABLE_AUDIT_MISSING", /SERVICE_ROLE_CRUD_MISSING/i],
  ];
  for (const [code, pattern] of requiredAuditContracts) {
    if (!pattern.test(sql)) violations.push(code);
  }

  return { ok: violations.length === 0, violations };
}

export async function runDatabaseSecurityAudit({
  supabaseUrl,
  serviceRoleKey,
  fetchImpl = fetch,
}) {
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for database audit");
  }
  const endpoint = `${supabaseUrl.replace(/\/+$/, "")}/rest/v1/rpc/audit_v61_database_security`;
  const response = await fetchImpl(endpoint, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  if (!response.ok) {
    throw new Error(`Database security audit RPC failed with HTTP ${response.status}`);
  }
  const violations = await response.json();
  if (!Array.isArray(violations)) {
    throw new Error("Database security audit RPC returned an invalid payload");
  }
  return { ok: violations.length === 0, violations };
}

function findSecurityMigration(root) {
  const migrationDir = path.join(root, "supabase/migrations");
  const matches = fs.readdirSync(migrationDir)
    .filter((name) => name.endsWith("_v61_security_gate.sql"));
  if (matches.length !== 1) {
    throw new Error(`Expected exactly one V6.1 security migration, found ${matches.length}`);
  }
  return path.join(migrationDir, matches[0]);
}

async function main() {
  const migrationPath = findSecurityMigration(process.cwd());
  const staticAudit = auditMigrationText(fs.readFileSync(migrationPath, "utf8"));
  const output = { static: staticAudit };

  if (process.argv.includes("--database")) {
    output.database = await runDatabaseSecurityAudit({
      supabaseUrl: process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
      serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    });
  }

  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  if (!staticAudit.ok || (output.database && !output.database.ok)) process.exitCode = 1;
}

const isDirectInvocation = process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isDirectInvocation) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
