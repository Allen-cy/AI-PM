import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("V6.3.2 commercial and quality writes require governed project context", async () => {
  const { parseCommercialQualityWriteContract } = await import("../src/features/commercial-quality/contracts.ts");
  assert.deepEqual(parseCommercialQualityWriteContract({
    project_id: "11111111-1111-4111-8111-111111111111",
    business_role: "operations",
    data_class: "production",
    idempotency_key: "v632:test:1",
    expected_version: 2,
  }), {
    projectId: "11111111-1111-4111-8111-111111111111",
    businessRole: "operations",
    dataClass: "production",
    idempotencyKey: "v632:test:1",
    expectedVersion: 2,
  });
  assert.throws(() => parseCommercialQualityWriteContract({ project_id: "项目名称" }), /稳定项目UUID/);
  assert.throws(() => parseCommercialQualityWriteContract({
    project_id: "11111111-1111-4111-8111-111111111111",
    business_role: "operations",
    data_class: "production",
    idempotency_key: "same",
    expected_version: -1,
  }), /期望版本/);
});

test("V6.3.2 human workflow owns contract defect acceptance and signoff states", async () => {
  const { nextCommercialQualityStatus } = await import("../src/features/commercial-quality/contracts.ts");
  assert.equal(nextCommercialQualityStatus({ domain: "contract", status: "draft", operation: "submit", businessRole: "operations" }), "submitted");
  assert.equal(nextCommercialQualityStatus({ domain: "contract", status: "submitted", operation: "activate", businessRole: "finance" }), "active");
  assert.equal(nextCommercialQualityStatus({ domain: "defect", status: "open", operation: "start", businessRole: "quality" }), "in_progress");
  assert.equal(nextCommercialQualityStatus({ domain: "defect", status: "ready_for_verification", operation: "verify", businessRole: "quality" }), "closed");
  assert.equal(nextCommercialQualityStatus({ domain: "acceptance", status: "submitted", operation: "start_review", businessRole: "quality" }), "in_review");
  assert.equal(nextCommercialQualityStatus({ domain: "acceptance", status: "in_review", operation: "approve", businessRole: "business_owner" }), "approved");
  assert.throws(() => nextCommercialQualityStatus({ domain: "acceptance", status: "submitted", operation: "approve", businessRole: "pm" }), /ROLE_FORBIDDEN|STATUS_CONFLICT/);
});

test("V6.3.2 migration persists seven business domains receipts and append-only events", () => {
  const sql = read("supabase/migrations/20260714235000_v632_commercial_quality_acceptance_realization.sql");
  for (const table of [
    "project_contract_records",
    "project_receivable_records",
    "project_collection_records",
    "project_stakeholder_records",
    "project_stakeholder_engagement_actions",
    "project_quality_plans",
    "project_quality_check_items",
    "project_defect_records",
    "project_acceptance_records",
    "project_acceptance_items",
    "project_signoff_records",
    "project_commercial_quality_operation_receipts",
    "project_commercial_quality_events",
  ]) {
    assert.match(sql, new RegExp(`create table if not exists public\\.${table}`, "i"));
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`, "i"));
    assert.match(sql, new RegExp(`revoke all on table public\\.${table} from public, anon, authenticated`, "i"));
  }
  for (const fn of [
    "save_project_commercial_record_tx",
    "save_project_stakeholder_record_tx",
    "save_project_stakeholder_action_tx",
    "save_project_quality_plan_tx",
    "save_project_quality_check_result_tx",
    "save_project_defect_tx",
    "save_project_acceptance_tx",
    "save_project_acceptance_item_result_tx",
    "save_project_signoff_tx",
    "transition_project_commercial_quality_tx",
  ]) {
    assert.match(sql, new RegExp(`function public\\.${fn}`, "i"));
  }
  assert.match(sql, /prevent_v632_event_mutation/i);
  assert.match(sql, /IDEMPOTENCY_PAYLOAD_CONFLICT/i);
  assert.match(sql, /VERSION_CONFLICT/i);
  assert.match(sql, /grant execute on function public\.save_project_commercial_record_tx[\s\S]+to service_role/i);
});

test("V6.3.2 follow-up fixes the new append-only trigger search path warning", () => {
  const sql = read("supabase/migrations/20260715080700_v632_event_search_path_security_fix.sql");
  assert.match(sql, /function public\.prevent_v632_event_mutation/);
  assert.match(sql, /set search_path = public/i);
  assert.match(sql, /revoke all on function public\.prevent_v632_event_mutation\(\) from public, anon, authenticated/i);
});

test("contract API owns contract receivable collection persistence", () => {
  const route = read("src/app/api/contract/route.ts");
  assert.match(route, /resolveDeliveryProject/);
  assert.match(route, /project_contract_records/);
  assert.match(route, /project_receivable_records/);
  assert.match(route, /project_collection_records/);
  assert.match(route, /save_project_commercial_record_tx/);
  assert.match(route, /transition_project_commercial_quality_tx/);
  assert.doesNotMatch(route, /Invalid action/);
});

test("stakeholder API persists register and engagement actions while AI remains advisory", () => {
  const route = read("src/app/api/stakeholder/route.ts");
  assert.match(route, /resolveDeliveryProject/);
  assert.match(route, /project_stakeholder_records/);
  assert.match(route, /project_stakeholder_engagement_actions/);
  assert.match(route, /save_project_stakeholder_record_tx/);
  assert.match(route, /save_project_stakeholder_action_tx/);
  assert.match(route, /AI只生成候选|AI.*候选/);
});

test("quality API persists plan checklist defects acceptance and signoffs", () => {
  const route = read("src/app/api/quality/route.ts");
  for (const table of ["project_quality_plans", "project_quality_check_items", "project_defect_records", "project_acceptance_records", "project_acceptance_items", "project_signoff_records"]) {
    assert.match(route, new RegExp(table));
  }
  for (const fn of ["save_project_quality_plan_tx", "save_project_quality_check_result_tx", "save_project_defect_tx", "save_project_acceptance_tx", "save_project_acceptance_item_result_tx", "save_project_signoff_tx", "transition_project_commercial_quality_tx"]) {
    assert.match(route, new RegExp(fn));
  }
  assert.match(route, /resolveDeliveryProject/);
});

test("formal commercial quality and stakeholder pages use current project and no authoritative demo data", () => {
  const contract = read("src/app/contract/page.tsx");
  const stakeholder = read("src/app/stakeholder/page.tsx");
  const quality = read("src/app/quality/page.tsx");
  for (const page of [contract, stakeholder, quality]) {
    assert.match(page, /loadCurrentBusinessContextSearchParams/);
    assert.match(page, /readStoredCurrentProject/);
  }
  assert.doesNotMatch(contract, /TEST_CONTRACTS/);
  assert.doesNotMatch(stakeholder, /initialStakeholders/);
  assert.doesNotMatch(quality, /testDefects|testAcceptanceCriteria/);
  assert.match(contract, /合同[\s\S]*应收[\s\S]*回款|合同到现金/);
  assert.match(stakeholder, /参与行动|沟通行动/);
  assert.match(quality, /质量计划/);
  assert.match(quality, /缺陷/);
  assert.match(quality, /验收/);
  assert.match(quality, /签发/);
});
