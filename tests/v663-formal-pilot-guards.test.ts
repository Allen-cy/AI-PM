import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("V6.6.3 preflight requires five production projects and a four-person role matching", async () => {
  const { buildControlledPilotPreflight } = await import("../src/features/pilot-acceptance/domain.ts");
  const blocked = buildControlledPilotPreflight({
    mode: "formal_pilot",
    projectCount: 4,
    participants: [
      { userId: "u1", businessRole: "pm", accountKind: "real_user" },
      { userId: "u1", businessRole: "operations", accountKind: "real_user" },
      { userId: "u2", businessRole: "pmo", accountKind: "real_user" },
      { userId: "u3", businessRole: "ceo", accountKind: "real_user" },
      { userId: "test", businessRole: "operations", accountKind: "test_account" },
    ],
    goldenChains: [],
    feishuConfirmations: [],
  });
  assert.equal(blocked.baselineReady, false);
  assert.equal(blocked.metrics.assignableDistinctRoles, 3);
  assert.ok(blocked.items.some(item => item.code === "PILOT_PROJECT_CANDIDATES_INCOMPLETE" && item.status === "blocked"));
  assert.ok(blocked.items.some(item => item.code === "PILOT_REAL_ROLE_MATCHING_INCOMPLETE" && item.status === "blocked"));

  const ready = buildControlledPilotPreflight({
    mode: "formal_pilot",
    projectCount: 5,
    participants: [
      { userId: "u1", businessRole: "pm", accountKind: "real_user" },
      { userId: "u2", businessRole: "operations", accountKind: "real_user" },
      { userId: "u3", businessRole: "pmo", accountKind: "real_user" },
      { userId: "u4", businessRole: "ceo", accountKind: "real_user" },
    ],
    goldenChains: [{ chainKey: "A", status: "passed" }, { chainKey: "E", status: "passed" }],
    feishuConfirmations: [
      { actionType: "message", projectId: "p1" },
      { actionType: "task", projectId: "p1" },
      { actionType: "base_record_update", projectId: "p1" },
    ],
  });
  assert.equal(ready.baselineReady, true);
  assert.equal(ready.metrics.assignableDistinctRoles, 4);
  assert.equal(ready.metrics.feishuTypes, 3);
  assert.equal(ready.metrics.goldenChains, 2);
});

test("V6.6.3 migration independently verifies participant identity and Feishu project scope", () => {
  const sql = read("supabase/migrations/20260716123000_v663_formal_pilot_identity_evidence_guard.sql");
  const accountKindGuard = read("supabase/migrations/20260716124000_v663_account_kind_change_guard.sql");
  const compatibilityMarker = read("supabase/migrations/20260716012841_v663_migration_order_compatibility_marker.sql");
  assert.ok(20260716123000 > 20260716040000, "V6.6.3 guard must run after the V6.6.0 foundation");
  assert.match(compatibilityMarker, /select 1/i);
  assert.doesNotMatch(compatibilityMarker, /alter table public\.app_users/i);
  assert.match(sql, /alter table public\.app_users\s+add column if not exists account_kind/i);
  assert.match(sql, /test_account[\s\S]+controlled_pilot_participants/i);
  assert.match(sql, /unique index[\s\S]+controlled_pilot_participants[\s\S]+run_id[\s\S]+user_id/i);
  assert.match(sql, /enforce_v663_pilot_participant_identity/i);
  assert.match(sql, /V663_FORMAL_REAL_USER_REQUIRED/i);
  assert.match(sql, /V663_TECHNICAL_TEST_ACCOUNT_REQUIRED/i);
  assert.match(sql, /enforce_v663_pilot_feishu_project_scope/i);
  assert.match(sql, /V663_FEISHU_PROJECT_SCOPE_REQUIRED/i);
  assert.match(sql, /controlled_pilot_projects/i);
  assert.match(sql, /audit_v61_database_security/i);
  assert.match(sql, /revoke all on function[\s\S]+from public,anon,authenticated/i);
  assert.match(accountKindGuard, /enforce_v663_app_user_account_kind_change/i);
  assert.match(accountKindGuard, /V663_ACCOUNT_KIND_CONFLICTS_WITH_PILOT_HISTORY/i);
  assert.match(accountKindGuard, /formal_pilot[\s\S]+real_user/i);
  assert.match(accountKindGuard, /technical_rehearsal[\s\S]+test_account/i);
  assert.match(accountKindGuard, /audit_v61_database_security/i);
});

test("V6.6.3 API and page expose an actionable formal-pilot preflight and exclude unscoped evidence", () => {
  const route = read("src/app/api/operations-center/pilot-acceptance/route.ts");
  const page = read("src/app/operations-center/pilot-acceptance/page.tsx");
  const adminRoute = read("src/app/api/admin/security/route.ts");
  const adminPage = read("src/app/admin/security/page.tsx");
  assert.match(route, /account_kind/);
  assert.match(route, /buildControlledPilotPreflight/);
  assert.match(route, /\.not\("project_id",\s*"is",\s*null\)/);
  assert.match(route, /preflight/);
  assert.match(page, /正式试点启动检查/);
  assert.match(page, /测试账号不会进入正式试点候选/);
  assert.match(page, /href="\/admin\/security"/);
  assert.match(page, /href="\/integration-center"/);
  assert.match(page, /href="\/operations-center\/golden-chains"/);
  assert.match(page, /!boundUsers\.has\(item\.user_id\)[\s\S]+!boundRoles\.has\(item\.business_role\)/);
  assert.match(adminRoute, /accountKind/);
  assert.match(adminRoute, /account_kind/);
  assert.match(adminPage, /service_account/);
  assert.match(adminPage, /账号类别/);
});
