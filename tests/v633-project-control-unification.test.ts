import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("V6.3.3 project-control writes require governed context idempotency and optimistic version", async () => {
  const { parseProjectControlWriteContract } = await import("../src/features/project-control/contracts.ts");
  assert.deepEqual(parseProjectControlWriteContract({
    project_id: "11111111-1111-4111-8111-111111111111",
    business_role: "pm",
    data_class: "production",
    idempotency_key: "v633:test:1",
    expected_version: 4,
  }), {
    projectId: "11111111-1111-4111-8111-111111111111",
    businessRole: "pm",
    dataClass: "production",
    idempotencyKey: "v633:test:1",
    expectedVersion: 4,
  });
  assert.throws(() => parseProjectControlWriteContract({ project_id: "按项目名称关联" }), /稳定项目UUID/);
  assert.throws(() => parseProjectControlWriteContract({
    project_id: "11111111-1111-4111-8111-111111111111",
    business_role: "pm",
    data_class: "production",
    idempotency_key: "v633:test:bad",
    expected_version: -1,
  }), /期望版本/);
});

test("V6.3.3 deterministic project snapshot connects execution monitoring governance and closure facts", async () => {
  const { buildProjectControlSnapshot } = await import("../src/features/project-control/snapshot.ts");
  const snapshot = buildProjectControlSnapshot({
    project: { id: "p1", name: "真实项目", data_class: "production", updated_at: "2026-07-15T01:00:00Z" },
    tasks: [{ id: "t1", name: "接口联调", status: "blocked", percent_complete: 40, assignee: "张三", plan_end: "2026-07-14", source_system: "feishu", source_record_id: "rec-task", source_updated_at: "2026-07-15T00:00:00Z" }],
    milestones: [{ id: "m1", milestone_name: "UAT", status: "delayed", progress: 60, owner: "李四", forecast_date: "2026-07-20", source_system: "feishu", source_record_id: "rec-ms", source_updated_at: "2026-07-15T00:10:00Z" }],
    risks: [{ id: "r1", description: "供应延期", status: "tracking", pi_score: 16, owner: "王五", due_date: "2026-07-18", source: "manual" }],
    issues: [{ id: "i1", title: "环境不可用", status: "resolving", severity: "high", owner: "赵六", due_date: "2026-07-16", version: 2 }],
    changes: [{ id: "c1", title: "范围调整", status: "proposed", owner: "项目经理", due_date: "2026-07-17", version: 1 }],
    actions: [{ id: "a1", title: "恢复环境", status: "open", priority: "P0", owner: "赵六", due_date: "2026-07-16", version: 1 }],
    defects: [{ id: "d1", title: "阻断缺陷", status: "open", severity: "critical", owner_name: "质量负责人", due_at: "2026-07-16" }],
    acceptances: [{ id: "ac1", title: "阶段验收", status: "submitted", owner_name: "业务负责人", planned_at: "2026-07-20" }],
    closureAssessments: [{ id: "cl1", status: "evidence_pending", ready: false, blockers: [{ code: "OPEN_ISSUE" }], created_at: "2026-07-15T01:00:00Z" }],
  });
  assert.equal(snapshot.project.id, "p1");
  assert.equal(snapshot.health.overall, "red");
  assert.equal(snapshot.execution.blocked_tasks, 1);
  assert.equal(snapshot.governance.open_high_risks, 1);
  assert.equal(snapshot.closure.ready, false);
  assert.ok(snapshot.exceptions.length >= 5);
  for (const item of snapshot.exceptions) {
    assert.ok("source" in item && "owner" in item && "deadline" in item && "action_id" in item);
  }
});

test("V6.3.3 migration hardens issue change action state and idempotent receipts", () => {
  const sql = read("supabase/migrations/20260715181000_v633_project_control_unification.sql");
  for (const table of ["project_issues", "project_changes", "unified_action_items"]) {
    assert.match(sql, new RegExp(`alter table public\\.${table}[\\s\\S]+version bigint`, "i"));
    assert.match(sql, new RegExp(`alter table public\\.${table}[\\s\\S]+last_idempotency_key text`, "i"));
  }
  assert.match(sql, /create table if not exists public\.project_control_operation_receipts/i);
  assert.match(sql, /alter table public\.project_control_operation_receipts enable row level security/i);
  assert.match(sql, /revoke all on table public\.project_control_operation_receipts from public, anon, authenticated/i);
  assert.match(sql, /function public\.apply_project_issue_change_action_tx/i);
  assert.match(sql, /IDEMPOTENCY_PAYLOAD_CONFLICT/i);
  assert.match(sql, /VERSION_CONFLICT/i);
  assert.match(sql, /prevent_v633_issue_change_event_mutation/i);
  assert.match(sql, /grant execute on function public\.apply_project_issue_change_action_tx[\s\S]+to service_role/i);
});

test("V6.3.3 security repair keeps later-wave objects behind the service role", () => {
  const sql = read("supabase/migrations/20260715190000_v633_security_posture_repair.sql");
  for (const table of [
    "project_delivery_events",
    "project_governance_events",
    "project_initiation_records",
    "project_plan_baselines",
  ]) {
    assert.match(sql, new RegExp(`revoke all on table[\\s\\S]+public\\.${table}[\\s\\S]+from public, anon, authenticated`, "i"));
    assert.match(sql, new RegExp(`grant select, insert, update, delete on table[\\s\\S]+public\\.${table}[\\s\\S]+to service_role`, "i"));
  }
  assert.match(sql, /grant usage, select, update on sequence[\s\S]+project_delivery_events_id_seq[\s\S]+to service_role/i);
  assert.match(sql, /revoke all on function public\.prevent_v633_issue_change_event_mutation\(\)[\s\S]+from public, anon, authenticated/i);
});

test("project-control repository reads all domains from one exact project scope", () => {
  const repository = read("src/features/project-control/repository.ts");
  for (const table of ["tasks", "project_milestones", "risks", "project_issues", "project_changes", "unified_action_items", "project_defect_records", "project_acceptance_records", "project_closure_assessments"]) {
    assert.match(repository, new RegExp(`from\\(["']${table}["']\\)`));
  }
  assert.match(repository, /eq\(["']org_id["'],\s*input\.orgId\)/);
  assert.match(repository, /eq\(["']project_id["'],\s*input\.projectId\)/);
  assert.match(repository, /eq\(["']data_class["'],\s*input\.dataClass\)/);
  assert.match(repository, /buildProjectControlSnapshot/);
});

test("execution API reads the governed snapshot instead of trusting client task arrays", () => {
  const route = read("src/app/api/execution/route.ts");
  assert.match(route, /loadProjectControlSnapshot/);
  assert.match(route, /parseProjectControlWriteContract/);
  assert.match(route, /begin_v633_project_control_operation/);
  assert.match(route, /finish_v633_project_control_operation/);
  assert.doesNotMatch(route, /Array\.isArray\(body\.tasks\)|Array\.isArray\(body\.deliverables\)/);
  assert.match(route, /dataClass === project\.dataClass/);
});

test("monitoring API derives insights from server-side project facts", () => {
  const route = read("src/app/api/monitoring/route.ts");
  assert.match(route, /export async function GET/);
  assert.match(route, /loadProjectControlSnapshot/);
  assert.match(route, /resolveProjectControlAccess/);
  assert.doesNotMatch(route, /const \{ projects, timeframe \} = body/);
  assert.doesNotMatch(route, /scopeChangeCount:\s*number/);
});

test("formal execution and monitoring pages use current project with no authoritative hardcoded facts", () => {
  const execution = read("src/app/execution/page.tsx");
  const monitoring = read("src/app/monitoring/page.tsx");
  for (const page of [execution, monitoring]) {
    assert.match(page, /readStoredCurrentProject/);
    assert.match(page, /loadCurrentBusinessContextSearchParams|readStoredBusinessContext/);
  }
  assert.doesNotMatch(monitoring, /需求分析与设计|核心模块开发|UAT测试|value=\{57\.5\}/);
  assert.match(monitoring, /异常池|统一行动项/);
  assert.match(execution, /飞书事实|Supabase镜像/);
});

test("risk issue change action and closing reuse the governed state machines", () => {
  const issueRoute = read("src/app/api/issue-change/route.ts");
  const closingRoute = read("src/app/api/closing/route.ts");
  const closingPage = read("src/app/closing/page.tsx");
  const sensitivity = read("src/app/risk/sensitivity/page.tsx");
  assert.match(issueRoute, /parseProjectControlWriteContract/);
  assert.match(issueRoute, /apply_project_issue_change_action_tx/);
  assert.match(closingRoute, /closure-knowledge\/route/);
  assert.match(closingPage, /redirect\(["']\/closure-knowledge["']\)/);
  assert.doesNotMatch(sensitivity, /useState\(["']示例项目["']\)/);
});
