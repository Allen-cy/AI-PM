import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("V6.3.1 delivery writes require governed context idempotency and optimistic version", async () => {
  const { parseDeliveryWriteContract } = await import("../src/features/delivery-control/contracts.ts");
  assert.deepEqual(parseDeliveryWriteContract({
    project_id: "11111111-1111-4111-8111-111111111111",
    business_role: "pm",
    data_class: "production",
    idempotency_key: "v631:test:1",
    expected_version: 3,
  }), {
    projectId: "11111111-1111-4111-8111-111111111111",
    businessRole: "pm",
    dataClass: "production",
    idempotencyKey: "v631:test:1",
    expectedVersion: 3,
  });
  assert.throws(() => parseDeliveryWriteContract({ project_id: "项目名称" }), /稳定项目UUID/);
  assert.throws(() => parseDeliveryWriteContract({
    project_id: "11111111-1111-4111-8111-111111111111",
    business_role: "pm",
    data_class: "production",
    idempotency_key: "same",
    expected_version: -1,
  }), /期望版本/);
});

test("V6.3.1 EVM is deterministic from an approved cost baseline and persisted actual facts", async () => {
  const { calculateGovernedEvm } = await import("../src/features/delivery-control/evm.ts");
  const result = calculateGovernedEvm({
    budgetAtCompletion: 100,
    periods: [
      { period: "2026-07", plannedValue: 40, earnedValue: 30, actualCost: 35 },
      { period: "2026-08", plannedValue: 20, earnedValue: 10, actualCost: 12 },
    ],
  });
  assert.deepEqual(result, {
    bac: 100,
    pv: 60,
    ev: 40,
    ac: 47,
    sv: -20,
    cv: -7,
    spi: 0.6667,
    cpi: 0.8511,
    eac: 117.5,
    etc: 70.5,
    vac: -17.5,
  });
  assert.throws(() => calculateGovernedEvm({ budgetAtCompletion: 0, periods: [] }), /批准的成本基准/);
});

test("V6.3.1 migration persists WBS CPM EVM resources receipts and append-only evidence", () => {
  const sql = read("supabase/migrations/20260714200000_v631_delivery_control_realization.sql");
  for (const table of [
    "project_wbs_versions",
    "project_wbs_items",
    "project_delivery_actuals",
    "project_schedule_snapshots",
    "project_evm_snapshots",
    "project_resource_plans",
    "project_resource_capacity_periods",
    "project_resource_assignments",
    "project_resource_conflict_actions",
    "project_delivery_operation_receipts",
  ]) {
    assert.match(sql, new RegExp(`create table if not exists public\\.${table}`));
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`));
  }
  for (const fn of [
    "save_project_wbs_version_tx",
    "transition_project_wbs_version_tx",
    "save_project_delivery_actual_tx",
    "save_project_schedule_snapshot_tx",
    "save_project_evm_snapshot_tx",
    "save_project_resource_plan_tx",
    "transition_project_resource_conflict_tx",
  ]) {
    assert.match(sql, new RegExp(`function public\\.${fn}`));
  }
  assert.match(sql, /revoke all on table[\s\S]+from public, anon, authenticated/i);
  assert.match(sql, /grant execute on function public\.save_project_wbs_version_tx[\s\S]+to service_role/i);
  assert.match(sql, /prevent_v631_delivery_event_mutation/);
});

test("WBS API owns versioned persistence instead of exposing an arbitrary LLM pass-through", () => {
  const route = read("src/app/api/wbs/route.ts");
  const server = read("src/features/delivery-control/server.ts");
  assert.match(route, /resolveDeliveryProject/);
  assert.match(server, /requireAuthenticatedApiUser/);
  assert.match(server, /resolveProjectLifecycleAccess/);
  assert.match(route, /save_project_wbs_version_tx/);
  assert.match(route, /transition_project_wbs_version_tx/);
  assert.doesNotMatch(route, /const \{ scene, systemPrompt, userMessage/);
});

test("CPM and EVM APIs calculate only from the selected project's persisted facts", () => {
  const cpm = read("src/app/api/cpm/route.ts");
  const evm = read("src/app/api/evm/route.ts");
  assert.match(cpm, /project_wbs_versions/);
  assert.match(cpm, /project_wbs_items/);
  assert.match(cpm, /save_project_schedule_snapshot_tx/);
  assert.doesNotMatch(cpm, /body\.tasks\s*\?\?/);
  assert.match(evm, /project_plan_baselines/);
  assert.match(evm, /status["']?,\s*["']approved/);
  assert.match(evm, /project_delivery_actuals/);
  assert.match(evm, /cost_records/);
  assert.match(evm, /save_project_evm_snapshot_tx/);
});

test("resource API persists 8 to 12 week capacity plans and conflict closure", () => {
  const route = read("src/app/api/resource/route.ts");
  assert.match(route, /project_resource_plans/);
  assert.match(route, /project_resource_capacity_periods/);
  assert.match(route, /project_resource_assignments/);
  assert.match(route, /save_project_resource_plan_tx/);
  assert.match(route, /transition_project_resource_conflict_tx/);
  assert.doesNotMatch(route, /members:\s*TeamMember\[\]/);
});

test("delivery pages load current project context and contain no authoritative demo dataset", () => {
  const wbs = read("src/app/wbs/page.tsx");
  const cpm = read("src/app/cpm/page.tsx");
  const evm = read("src/app/evm/page.tsx");
  const resource = read("src/app/resource/page.tsx");
  for (const page of [wbs, cpm, evm, resource]) {
    assert.match(page, /loadCurrentBusinessContextSearchParams/);
    assert.match(page, /readStoredCurrentProject/);
  }
  assert.doesNotMatch(cpm, /项目启动与规划/);
  assert.doesNotMatch(evm, /TEST_DATA|智慧校园系统开发/);
  assert.doesNotMatch(resource, /TEST_TEAM_MEMBERS|ACTIVE_PROJECTS/);
  assert.match(wbs, /保存WBS版本/);
  assert.match(resource, /8–12周|8-12周/);
});
