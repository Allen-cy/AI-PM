import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("V6.3.4 formal output contract requires governed scope idempotency and optimistic version", async () => {
  const { parseFormalOutputWriteContract } = await import("../src/features/formal-output/contracts.ts");
  const parsed = parseFormalOutputWriteContract({
    org_id: "11111111-1111-4111-8111-111111111111",
    subject_scope: "project",
    subject_id: "22222222-2222-4222-8222-222222222222",
    project_id: "22222222-2222-4222-8222-222222222222",
    business_role: "pm",
    data_class: "production",
    idempotency_key: "v634:report:1",
    expected_version: 0,
  });
  assert.equal(parsed.subjectScope, "project");
  assert.equal(parsed.projectId, "22222222-2222-4222-8222-222222222222");
  assert.equal(parsed.expectedVersion, 0);
  assert.throws(() => parseFormalOutputWriteContract({ subject_scope: "project" }), /组织与业务对象/);
  assert.throws(() => parseFormalOutputWriteContract({
    org_id: "11111111-1111-4111-8111-111111111111",
    subject_scope: "project",
    subject_id: "22222222-2222-4222-8222-222222222222",
    business_role: "ceo",
    data_class: "production",
    idempotency_key: "v634:bad",
    expected_version: 0,
  }), /业务角色无权创建正式成果/);
});

test("V6.3.4 migration creates server-only versioned outputs and append-only events", () => {
  const sql = read("supabase/migrations/20260715201000_v634_formal_business_outputs.sql");
  for (const table of ["formal_business_outputs", "formal_business_output_events"]) {
    assert.match(sql, new RegExp(`create table if not exists public\\.${table}`, "i"));
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`, "i"));
  }
  assert.match(sql, /revoke all on table[\s\S]+formal_business_outputs[\s\S]+from public, anon, authenticated/i);
  assert.match(sql, /save_v634_formal_output_tx/i);
  assert.match(sql, /save_v634_report_output_tx/i);
  assert.match(sql, /transition_v634_formal_output_tx/i);
  assert.match(sql, /V634_IDEMPOTENCY_PAYLOAD_CONFLICT/i);
  assert.match(sql, /V634_VERSION_CONFLICT/i);
  assert.match(sql, /prevent_v634_output_event_mutation/i);
  assert.match(sql, /materialize_v634_meeting_minutes_output/i);
  assert.match(sql, /materialize_v634_knowledge_output/i);
});

test("V6.3.4 security repair satisfies the shared service-role posture without weakening append-only guards", () => {
  const sql = read("supabase/migrations/20260715203000_v634_security_posture_repair.sql");
  assert.match(sql, /grant select,insert,update,delete on table public\.formal_business_output_events to service_role/i);
  for (const fn of ["prevent_v634_output_event_mutation", "materialize_v634_meeting_minutes_output", "materialize_v634_knowledge_output"]) {
    assert.match(sql, new RegExp(`grant execute on function public\\.${fn}\\(\\) to service_role`, "i"));
  }
  assert.match(read("supabase/migrations/20260715201000_v634_formal_business_outputs.sql"), /V634_OUTPUT_EVENTS_APPEND_ONLY/);
});

test("V6.3.4 knowledge outputs never promote missing or conflicting data classes to production", () => {
  const sql = read("supabase/migrations/20260715204000_v634_knowledge_data_class_guard.sql");
  assert.match(sql, /select p\.data_class into v_project_data_class from public\.projects p/i);
  assert.match(sql, /V634_KNOWLEDGE_DATA_CLASS_MISMATCH/i);
  assert.match(sql, /v_data_class := v_project_data_class/i);
  assert.doesNotMatch(sql, /coalesce\([^;]*'production'/i);
  assert.match(sql, /grant execute on function public\.materialize_v634_knowledge_output\(\) to service_role/i);
});

test("formal output repository scopes every read and uses transactional writes", () => {
  const source = read("src/features/formal-output/repository.ts");
  assert.match(source, /from\(["']formal_business_outputs["']\)/);
  assert.match(source, /eq\(["']org_id["'],\s*input\.orgId\)/);
  assert.match(source, /eq\(["']subject_scope["'],\s*input\.subjectScope\)/);
  assert.match(source, /eq\(["']subject_id["'],\s*input\.subjectId\)/);
  assert.match(source, /eq\(["']data_class["'],\s*input\.dataClass\)/);
  assert.match(source, /rpc\(["']save_v634_formal_output_tx["']/);
  assert.match(source, /rpc\(["']save_v634_report_output_tx["']/);
});

test("report factory persists full output and reporting snapshot while history comes from API", () => {
  const route = read("src/app/api/reports/route.ts");
  const page = read("src/app/reports/page.tsx");
  const reportLib = read("src/lib/reports.ts");
  assert.match(route, /export async function GET/);
  assert.match(route, /saveFormalReportWithSnapshot/);
  assert.match(route, /formal_output_id/);
  assert.match(route, /reporting_snapshot_id/);
  assert.match(route, /REPORT_SCOPE_EMPTY/);
  assert.match(page, /fetch\(`\/api\/reports\?/);
  assert.match(page, /正式成果台账|正式历史/);
  assert.doesNotMatch(page, /fillTestData|loadTestData|PROJECTS\s*=/);
  assert.doesNotMatch(page, /saveReportToHistory|getReportHistory|report_history/);
  assert.doesNotMatch(reportLib, /localStorage|getReportHistory|saveReportToHistory|report_history/);
  assert.match(read("src/features/risk/access.ts"), /filter\(item => !requestedProjectId \|\| item\.projectId === requestedProjectId\)/);
});

test("migration downloads persist review comparison and cutover artifacts in production", () => {
  for (const path of [
    "src/app/api/migration/report/route.ts",
    "src/app/api/migration/batch-comparison/report/route.ts",
    "src/app/api/migration/cutover-decision/report/route.ts",
  ]) {
    const route = read(path);
    assert.match(route, /persistFormalMigrationOutput/);
    assert.match(route, /X-Formal-Output-Id/);
    assert.match(route, /AUTH_REQUIRED/);
  }
  const page = read("src/app/migration-center/page.tsx");
  assert.match(page, /loadCurrentBusinessContextSearchParams/);
  assert.match(page, /project_id/);
});

test("meeting minutes and published knowledge are materialized by database triggers in the same transaction", () => {
  const sql = read("supabase/migrations/20260715201000_v634_formal_business_outputs.sql");
  assert.match(sql, /after update of minutes on public\.governance_meetings/i);
  assert.match(sql, /after update of status on public\.knowledge_items/i);
  assert.match(sql, /meeting_minutes/i);
  assert.match(sql, /knowledge_asset/i);
});
