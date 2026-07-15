import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("V6.5 cross-role workflow enforces the PM or operations to PMO to CEO receipt and effect chain", async () => {
  const { allowedCrossRoleOperations, nextCrossRoleState } = await import("../src/features/cross-role-flow/domain.ts");
  assert.equal(nextCrossRoleState("submitted_to_pmo", "pmo_review", "pmo"), "pmo_reviewed");
  assert.equal(nextCrossRoleState("pmo_reviewed", "freeze_report", "pmo"), "report_frozen");
  assert.equal(nextCrossRoleState("report_frozen", "submit_decision", "pmo"), "decision_submitted");
  assert.equal(nextCrossRoleState("decision_submitted", "record_decision", "ceo"), "decision_made");
  assert.equal(nextCrossRoleState("decision_made", "dispatch_action", "pmo"), "action_dispatched");
  assert.equal(nextCrossRoleState("action_dispatched", "acknowledge_receipt", "pm"), "receipt_acknowledged");
  assert.equal(nextCrossRoleState("receipt_acknowledged", "review_effect", "pmo"), "effect_reviewed");
  assert.equal(nextCrossRoleState("effect_reviewed", "close", "ceo"), "closed");
  assert.equal(nextCrossRoleState("decision_submitted", "record_decision", "pm"), null);
  assert.deepEqual(allowedCrossRoleOperations("submitted_to_pmo", "pm"), []);
});

test("V6.5 migration makes business events append-only and transitions domain state with the event in one transaction", () => {
  const sql = read("supabase/migrations/20260716010000_v650_cross_role_feishu_ai_knowledge.sql");
  for (const table of ["business_events", "cross_role_flows", "cross_role_flow_actions", "role_ai_scan_schedules", "organization_feishu_connections"]) {
    assert.match(sql, new RegExp(`create table if not exists public\\.${table}`, "i"));
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`, "i"));
  }
  assert.match(sql, /prevent_v650_business_event_mutation/i);
  assert.match(sql, /before update or delete on public\.business_events/i);
  assert.match(sql, /transition_v650_cross_role_flow_tx/i);
  assert.match(sql, /insert into public\.business_events/i);
  assert.match(sql, /p_expected_version/i);
  assert.match(sql, /V650_VERSION_CONFLICT/i);
  assert.match(sql, /revoke all on table[\s\S]+from public, anon, authenticated/i);
  const fix = read("supabase/migrations/20260716012000_v650_security_audit_fix.sql");
  assert.match(fix, /grant update,delete on table public\.business_events to service_role/i);
  assert.match(fix, /revoke all on function public\.prevent_v650_business_event_mutation\(\) from public,anon,authenticated/i);
});

test("V6.5 Feishu identity boundary separates organization reads from personal writes without global fallback", () => {
  const config = read("src/features/feishu/user-config.ts");
  const confirmation = read("src/app/api/integrations/feishu/actions/confirmations/[id]/confirm/route.ts");
  const writeback = read("src/features/operating-assistant/writeback.ts");
  const draft = read("src/app/api/business-assistant/change-drafts/[id]/route.ts");
  assert.match(config, /getOrganizationFeishuConfig/);
  assert.match(config, /getPersonalFeishuConfigForCurrentUser/);
  assert.doesNotMatch(config, /globalFeishuFallbackHint/);
  assert.match(confirmation, /getUserFeishuConfig\(executor_user_id\)/);
  assert.doesNotMatch(confirmation, /getEffectiveFeishuConfig\(\)/);
  assert.doesNotMatch(writeback, /readFeishuConfig/);
  assert.doesNotMatch(draft, /getUserFeishuConfig\(draft\.requestedBy\)\s*\?\?\s*readFeishuConfig/);
  const organizationRoute = read("src/app/api/integrations/feishu/organization-connection/route.ts");
  const cron = read("src/app/api/cron/feishu-reconcile/route.ts");
  assert.match(organizationRoute, /encryptCredential/);
  assert.match(organizationRoute, /organizationFeishuAppSecretCredentialContext/);
  assert.doesNotMatch(organizationRoute, /app_secret:\s*appSecret/);
  assert.match(cron, /getOrganizationFeishuConfig\(organization\.id\)/);
});

test("V6.5 role AI schedules retain evidence confidence human decision and effect evaluation", () => {
  const route = read("src/app/api/cron/role-ai-scan/route.ts");
  const sql = read("supabase/migrations/20260716010000_v650_cross_role_feishu_ai_knowledge.sql");
  const assistant = read("src/app/api/role-assistant/route.ts");
  assert.match(route, /role_ai_scan_schedules/);
  assert.match(route, /allowed_evidence_ids/);
  assert.match(route, /confidence/);
  assert.match(sql, /confidence numeric/i);
  assert.match(sql, /next_run_at/i);
  assert.match(assistant, /accepted|rejected/);
  assert.match(assistant, /evaluation|effect/i);
});

test("V6.5 dynamic published knowledge is loaded into scoped RAG and release has a vault sync gate", () => {
  const dynamic = read("src/features/knowledge/dynamic-rag.ts");
  const rag = read("src/app/api/rag/query/route.ts");
  const sync = read("scripts/sync-ai-pmo-vault-release.mjs");
  assert.match(dynamic, /knowledge_items/);
  assert.match(dynamic, /status[^\n]+published/);
  assert.match(dynamic, /org_id|source_project_id/);
  assert.match(rag, /listPublishedDynamicKnowledgeDocuments/);
  assert.match(sync, /STATE\.yaml/);
  assert.match(sync, /Task_Log\.md/);
  assert.match(sync, /--check|checkOnly/);
});

test("V6.5 exposes the governed flow page and daily AI cron", () => {
  const page = read("src/app/cross-role-flow/page.tsx");
  const api = read("src/app/api/cross-role-flows/route.ts");
  const vercel = read("vercel.json");
  assert.match(page, /PM|运营/);
  assert.match(page, /PMO/);
  assert.match(page, /CEO/);
  assert.match(page, /截止|证据/);
  assert.match(api, /idempotency_key/);
  assert.match(api, /expected_version/);
  assert.match(vercel, /api\/cron\/role-ai-scan/);
});

test("V6.5 configuration writes require idempotency keys and optimistic versions", () => {
  const schedule = read("src/app/api/role-assistant/route.ts");
  const organizationFeishu = read("src/app/api/integrations/feishu/organization-connection/route.ts");
  const migration = read("supabase/migrations/20260716020000_v650_configuration_idempotency.sql");
  assert.match(schedule, /SCHEDULE_IDEMPOTENCY_KEY_REQUIRED/);
  assert.match(schedule, /last_idempotency_key/);
  assert.match(organizationFeishu, /ORGANIZATION_FEISHU_IDEMPOTENCY_KEY_REQUIRED/);
  assert.match(organizationFeishu, /last_idempotency_key/);
  assert.match(migration, /role_ai_scan_schedules add column if not exists last_idempotency_key/i);
  assert.match(migration, /organization_feishu_connections add column if not exists last_idempotency_key/i);
});
