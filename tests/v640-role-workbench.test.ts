import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("V6.4 role workbench exposes a distinct operating lens for PM operations PMO and CEO", async () => {
  const { buildRoleWorkbench } = await import("../src/features/role-workbench/domain.ts");
  const common = {
    generatedAt: "2026-07-15T12:00:00.000Z",
    projects: [{ id: "p1", name: "重点项目A", projectLevel: "S", progress: 60, status: "执行中", health: "red", benefitForecast: 120, cashForecast: 80 }],
    tasks: [{ id: "t1", projectId: "p1", title: "完成联调", status: "进行中", dueAt: "2026-07-16", ownerUserId: "u-pm", critical: true }],
    milestones: [{ id: "m1", projectId: "p1", title: "上线", status: "未完成", dueAt: "2026-07-20" }],
    risks: [{ id: "r1", projectId: "p1", title: "进度风险", status: "monitoring", severity: "high", ownerUserId: "u-pm", dueAt: "2026-07-16" }],
    actions: [{ id: "a1", projectId: "p1", title: "恢复计划", status: "assigned", priority: "P0", ownerUserId: "u-pm", reviewerUserId: "u-pmo", dueAt: "2026-07-16" }],
    commercial: [{ id: "c1", projectId: "p1", type: "receivable" as const, status: "overdue", amount: 50, dueAt: "2026-07-14" }],
    quality: [{ id: "q1", projectId: "p1", title: "验收缺口", status: "open", severity: "high", dueAt: "2026-07-16" }],
    governance: [{ id: "g1", projectId: "p1", type: "management_signal" as const, title: "重大延期信号", status: "open", severity: "critical", dueAt: "2026-07-16" }],
    decisions: [{ id: "d1", projectId: "p1", title: "是否追加资源", status: "submitted", requestedDecisionAt: "2026-07-16" }],
    formalOutputs: [{ id: "o1", projectId: "p1", title: "项目周报", outputType: "weekly_report", status: "submitted", generatedAt: "2026-07-15" }],
  };

  const pm = buildRoleWorkbench({ ...common, role: "pm", actorUserId: "u-pm" });
  const operations = buildRoleWorkbench({ ...common, role: "operations", actorUserId: "u-ops" });
  const pmo = buildRoleWorkbench({ ...common, role: "pmo", actorUserId: "u-pmo" });
  const ceo = buildRoleWorkbench({ ...common, role: "ceo", actorUserId: "u-ceo" });

  assert.equal(pm.role, "pm");
  assert.deepEqual(pm.focus, ["今日行动", "关键路径", "里程碑", "重大风险", "正式汇报"]);
  assert.equal(pm.sections.todayActions.length, 3);
  assert.equal(operations.sections.commercialFlow.length, 1);
  assert.equal(pmo.sections.exceptionPool.length, 3);
  assert.equal(ceo.sections.decisionInbox.length, 1);
  assert.equal(ceo.executiveSummary.strategicProjects, 1);
  assert.equal(ceo.executiveSummary.cashForecast, 80);
  assert.equal(ceo.executiveSummary.benefitForecast, 120);
  assert.notDeepEqual(pm.focus, ceo.focus);
});

test("V6.4 unified inbox contract covers every required source and keeps governed scope", async () => {
  const { REQUIRED_INBOX_SOURCES, sortAndSummarizeInbox } = await import("../src/features/collaboration-inbox/domain.ts");
  assert.deepEqual(REQUIRED_INBOX_SOURCES, [
    "risk", "joint_check", "operating_calendar", "governance_approval", "management_signal",
    "ai_recommendation", "decision_receipt", "feishu_confirmation", "formal_output",
    "cross_role_flow",
  ]);
  const result = sortAndSummarizeInbox([
    { id: "2", type: "formal_output", title: "周报", status: "submitted", projectId: "p1", projectName: "A", dueAt: null, priority: "medium", actionUrl: "/reports", sourceId: "o1", sourceType: "formal_business_outputs", sourceUpdatedAt: "2026-07-15", dataClass: "test" },
    { id: "1", type: "risk", title: "重大风险", status: "monitoring", projectId: "p1", projectName: "A", dueAt: "2026-07-14", priority: "critical", actionUrl: "/risk", sourceId: "r1", sourceType: "risks", sourceUpdatedAt: "2026-07-15", dataClass: "test" },
  ]);
  assert.equal(result.items[0].type, "risk");
  assert.equal(result.summary.critical, 1);
  assert.equal(result.summary.total, 2);
  assert.equal(result.items.every(item => item.dataClass === "test"), true);
});

test("V6.4 directory exposes business labels instead of asking users for UUID or JSON", async () => {
  const { buildBusinessDirectory } = await import("../src/features/business-directory/domain.ts");
  const directory = buildBusinessDirectory({
    projects: [{ id: "p1", name: "项目A", code: "P-001", dataClass: "test" }],
    people: [{ id: "u1", name: "张三", email: "zhang@example.com", phone: null, roles: ["pm"] }],
    evidence: [{ id: "e1", projectId: "p1", title: "章程", evidenceType: "project_charter", verifiedAt: "2026-07-15" }],
    formalOutputs: [{ id: "o1", projectId: "p1", title: "周报", outputType: "weekly_report", status: "submitted" }],
    businessObjects: [{ id: "r1", projectId: "p1", objectType: "risk", code: "R-001", title: "进度风险", status: "monitoring" }],
  });
  assert.equal(directory.projects[0].label, "项目A · P-001");
  assert.equal(directory.people[0].label, "张三 · 项目经理");
  assert.equal(directory.evidence[0].label, "章程 · project_charter · 已核验");
  assert.equal(directory.formalOutputs[0].label, "周报 · weekly_report · submitted");
  assert.equal(directory.businessObjects[0].label, "进度风险 · R-001 · monitoring");
});

test("V6.4 business pages use governed selectors and structured editors instead of raw UUID or JSON inputs", () => {
  const pages = [
    "src/app/closure-knowledge/retrospective/page.tsx",
    "src/app/projects/[id]/impact-packages/page.tsx",
    "src/app/projects/[id]/lifecycle/page.tsx",
    "src/app/decision-center/page.tsx",
    "src/app/pmo/control-center/page.tsx",
    "src/app/operations-center/golden-chains/page.tsx",
    "src/components/KnowledgeReferenceAuditClient.tsx",
  ].map(read).join("\n");
  assert.match(pages, /BusinessEntitySelect/);
  assert.match(pages, /StructuredFieldsEditor/);
  assert.doesNotMatch(pages, /placeholder=["'][^"']*(?:UUID|JSON|用户\s*ID|记录\s*ID|稳定\s*ID|证据\s*ID|输出\s*ID)/i);
  assert.doesNotMatch(pages, /window\.prompt\(\s*["'`][^"'`\n]*(?:UUID|JSON|用户\s*ID|记录\s*ID|证据\s*ID)/i);
});

test("V6.4 migration stores workbench preferences receipts and four-account acceptance evidence in test space", () => {
  const sql = read("supabase/migrations/20260715220000_v640_role_workbench_inbox.sql");
  for (const table of ["role_workbench_preferences", "collaboration_inbox_receipts", "role_acceptance_runs", "role_acceptance_participants"]) {
    assert.match(sql, new RegExp(`create table if not exists public\\.${table}`, "i"));
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`, "i"));
  }
  assert.match(sql, /check \(data_class = 'test'\)/i);
  assert.match(sql, /count\(distinct user_id\)[\s\S]+4/i);
  assert.match(sql, /count\(distinct business_role\)[\s\S]+4/i);
  assert.match(sql, /prevent_v640_inbox_receipt_scope_change/i);
  assert.match(sql, /revoke all on table[\s\S]+from public, anon, authenticated/i);
});

test("V6.4 pages use the role workbench directory and expanded inbox rather than raw UUID inputs", () => {
  const workbench = read("src/app/workbench/page.tsx");
  const inbox = read("src/app/collaboration-inbox/page.tsx");
  const loop = read("src/app/business-assistant/operations-loop/page.tsx");
  assert.match(workbench, /api\/role-workbench/);
  assert.match(workbench, /CEO经营决策摘要|角色工作台/);
  assert.match(inbox, /management_signal|ai_recommendation|feishu_confirmation|formal_output/);
  assert.match(loop, /BusinessEntitySelect/);
  assert.doesNotMatch(loop, /placeholder="(?:执行责任人|复核人|Owner) UUID"/);
});
