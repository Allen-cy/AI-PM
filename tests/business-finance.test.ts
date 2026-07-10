import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import {
  BENEFIT_REQUIRED_REVIEW_ROLES,
  buildScenarioFactReadiness,
  buildStrategicBenefitCoverage,
  buildBusinessFinanceView,
  canSubmitBenefitExitReview,
  deriveBenefitStatusAfterReview,
  evaluatePortfolioScenario,
  isBenefitReviewUnderTarget,
  transitionBenefitAction,
  transitionBenefitHandover,
  transitionScenarioImpactAction,
} from "../src/features/operating-model/business-finance.ts";

test("business finance view connects contract cost collection cash and benefits", () => {
  const view = buildBusinessFinanceView({
    projects: [
      { id: "p1", name: "项目一", contractAmount: 1_000_000, progress: 60 },
    ],
    costs: [
      {
        projectId: "p1",
        plannedValue: 600_000,
        actualCost: 550_000,
        earnedValue: 580_000,
      },
    ],
    payments: [
      {
        projectId: "p1",
        amount: 400_000,
        dueDate: "2026-08-01",
        status: "unpaid",
      },
      {
        projectId: "p1",
        amount: 300_000,
        dueDate: "2026-06-01",
        status: "paid",
      },
    ],
    benefits: [
      {
        projectId: "p1",
        targetValue: 200_000,
        forecastValue: 150_000,
        actualValue: 50_000,
      },
    ],
    now: new Date("2026-07-10T00:00:00Z"),
  });
  assert.equal(view.summary.contractAmount, 1_000_000);
  assert.equal(view.summary.actualCost, 550_000);
  assert.equal(view.summary.collected, 300_000);
  assert.equal(view.summary.cashNext90Days, 400_000);
  assert.equal(view.projects[0].forecastMargin, 450_000);
  assert.equal(view.projects[0].benefitGap, 50_000);
});

test("portfolio scenarios quantify delay resource and pause effects instead of returning prose only", () => {
  const result = evaluatePortfolioScenario({
    baselineRevenue: 2_000_000,
    baselineCost: 1_200_000,
    baselineCash90Days: 700_000,
    delayDays: 30,
    addedMonthlyCost: 100_000,
    scopeRevenueChange: -200_000,
    paused: false,
  });
  assert.equal(result.scenarioRevenue, 1_800_000);
  assert.equal(result.scenarioCost, 1_300_000);
  assert.equal(result.scenarioMargin, 500_000);
  assert.ok(result.scenarioCash90Days < 700_000);
});

test("portfolio scenarios fail closed when their real contract cost or cash facts are missing", () => {
  const readiness = buildScenarioFactReadiness([
    {
      projectId: "p1",
      projectName: "项目一",
      hasContractFact: true,
      hasCostFact: true,
      hasPaymentSchedule: true,
    },
    {
      projectId: "p2",
      projectName: "项目二",
      hasContractFact: true,
      hasCostFact: false,
      hasPaymentSchedule: false,
    },
  ]);
  assert.equal(readiness.ready, false);
  assert.deepEqual(readiness.gaps, [
    {
      projectId: "p2",
      projectName: "项目二",
      missing: ["成本事实", "回款计划"],
    },
  ]);
});

test("benefit review lifecycle is driven by gate and approved measured facts", () => {
  assert.equal(
    isBenefitReviewUnderTarget({
      gate: "monthly",
      targetValue: 100,
      forecastValue: 90,
      actualValue: 40,
    }),
    true,
  );
  assert.equal(
    isBenefitReviewUnderTarget({
      gate: "G6",
      targetValue: 100,
      forecastValue: 120,
      actualValue: 90,
    }),
    true,
  );
  assert.equal(
    deriveBenefitStatusAfterReview({
      currentStatus: "tracking",
      gate: "monthly",
      underTarget: true,
    }),
    "at_risk",
  );
  assert.equal(
    deriveBenefitStatusAfterReview({
      currentStatus: "at_risk",
      gate: "quarterly",
      underTarget: false,
    }),
    "tracking",
  );
  assert.equal(
    deriveBenefitStatusAfterReview({
      currentStatus: "tracking",
      gate: "G6",
      underTarget: false,
    }),
    "realized",
  );
  assert.equal(
    deriveBenefitStatusAfterReview({
      currentStatus: "tracking",
      gate: "G6",
      underTarget: true,
    }),
    "not_realized",
  );
  assert.equal(
    deriveBenefitStatusAfterReview({
      currentStatus: "not_realized",
      gate: "exit",
      underTarget: true,
    }),
    "exit_pending",
  );
  assert.deepEqual(BENEFIT_REQUIRED_REVIEW_ROLES, [
    "business_owner",
    "finance",
    "pmo",
  ]);
});

test("G6 is a hard exit gate and exit waits for an accepted evidence-backed handover", () => {
  assert.equal(
    canSubmitBenefitExitReview({ g6ReviewedAt: null, status: "tracking" }),
    false,
  );
  assert.equal(
    canSubmitBenefitExitReview({
      g6ReviewedAt: "2026-07-01T08:00:00Z",
      status: "realized",
    }),
    true,
  );
  assert.equal(transitionBenefitHandover("proposed", "accept"), "accepted");
  assert.equal(transitionBenefitHandover("accepted", "start"), "in_progress");
  assert.equal(
    transitionBenefitHandover("in_progress", "submit_evidence"),
    "evidence_submitted",
  );
  assert.equal(
    transitionBenefitHandover("evidence_submitted", "review_reject"),
    "rejected",
  );
  assert.equal(transitionBenefitHandover("rejected", "accept"), "accepted");
  assert.equal(
    transitionBenefitHandover("evidence_submitted", "close"),
    "completed",
  );
  assert.throws(
    () => transitionBenefitHandover("proposed", "close"),
    /BENEFIT_HANDOVER_TRANSITION_NOT_ALLOWED/,
  );
});

test("strategic benefit coverage reports every S and A project gap without inventing a baseline", () => {
  const coverage = buildStrategicBenefitCoverage({
    projects: [
      { id: "s1", name: "战略项目", projectLevel: "S" },
      { id: "a1", name: "重点项目", projectLevel: "A" },
      { id: "b1", name: "普通项目", projectLevel: "B" },
    ],
    baselines: [
      {
        projectId: "s1",
        ownerUserId: "u1",
        g6ReviewDueDate: "2026-09-01",
        exitCriteria: "收益低于目标80%时退出",
      },
    ],
  });
  assert.equal(coverage.requiredProjects, 2);
  assert.equal(coverage.coveredProjects, 1);
  assert.equal(coverage.coverageRate, 50);
  assert.deepEqual(coverage.gaps, [
    {
      projectId: "a1",
      projectName: "重点项目",
      projectLevel: "A",
      missing: ["收益基线"],
    },
  ]);
});

test("a retired benefit does not satisfy an active strategic project's coverage gate", () => {
  const coverage = buildStrategicBenefitCoverage({
    projects: [{ id: "s1", name: "战略项目", projectLevel: "S" }],
    baselines: [
      {
        projectId: "s1",
        ownerUserId: "u1",
        g6ReviewDueDate: "2026-09-01",
        exitCriteria: "已完成退出",
        status: "retired",
      },
    ],
  });
  assert.equal(coverage.coveredProjects, 0);
  assert.deepEqual(coverage.gaps[0]?.missing, ["有效收益基线"]);
});

test("benefit corrective actions require owner execution and reviewer closure", () => {
  assert.equal(transitionBenefitAction("assigned", "accept"), "accepted");
  assert.equal(transitionBenefitAction("accepted", "start"), "in_progress");
  assert.equal(
    transitionBenefitAction("in_progress", "submit_evidence"),
    "evidence_submitted",
  );
  assert.equal(
    transitionBenefitAction("evidence_submitted", "review_reject"),
    "rejected",
  );
  assert.equal(
    transitionBenefitAction("evidence_submitted", "close"),
    "closed",
  );
  assert.throws(
    () => transitionBenefitAction("assigned", "close"),
    /BENEFIT_ACTION_TRANSITION_NOT_ALLOWED/,
  );
});

test("scenario impact packages require owner evidence and human acceptance before applied", () => {
  assert.equal(
    transitionScenarioImpactAction("assigned", "pending_application", "accept"),
    "accepted",
  );
  assert.equal(
    transitionScenarioImpactAction("accepted", "under_review", "start"),
    "in_progress",
  );
  assert.equal(
    transitionScenarioImpactAction(
      "in_progress",
      "under_review",
      "submit_evidence",
    ),
    "evidence_submitted",
  );
  assert.equal(
    transitionScenarioImpactAction(
      "evidence_submitted",
      "under_review",
      "review_reject",
    ),
    "rejected",
  );
  assert.equal(
    transitionScenarioImpactAction(
      "evidence_submitted",
      "under_review",
      "close",
    ),
    "closed",
  );
  assert.throws(
    () =>
      transitionScenarioImpactAction(
        "assigned",
        "pending_application",
        "close",
      ),
    /SCENARIO_IMPACT_TRANSITION_NOT_ALLOWED/,
  );
});

test("P22 persists benefit baselines reviews scenarios and transactional action closure behind business context", () => {
  const migrations = new URL("../supabase/migrations/", import.meta.url);
  const names = readdirSync(migrations).filter((item) =>
    /_p22_(business_finance_benefits|benefit_exit_scenario_hardening)\.sql$/.test(
      item,
    ),
  );
  assert.equal(names.length, 2);
  const sql = names
    .sort()
    .map((name) => readFileSync(new URL(name, migrations), "utf8"))
    .join("\n");
  for (const table of [
    "project_benefit_baselines",
    "benefit_baseline_decisions",
    "benefit_realization_reviews",
    "benefit_review_decisions",
    "benefit_realization_handovers",
    "benefit_realization_events",
    "portfolio_scenarios",
    "scenario_impact_packages",
  ])
    assert.match(
      sql,
      new RegExp(`create table if not exists public\\.${table}`, "i"),
    );
  assert.match(
    sql,
    /create or replace function public\.submit_benefit_review_tx/i,
  );
  assert.match(
    sql,
    /create or replace function public\.decide_benefit_review_tx/i,
  );
  assert.match(
    sql,
    /create or replace function public\.transition_benefit_action_tx/i,
  );
  assert.match(
    sql,
    /create or replace function public\.transition_benefit_handover_tx/i,
  );
  assert.match(
    sql,
    /v_review\.status<>'approved'[\s\S]*BENEFIT_REVIEW_APPROVAL_REQUIRED/i,
  );
  assert.match(
    sql,
    /v_review_status<>'approved'[\s\S]*BENEFIT_HANDOVER_REVIEW_APPROVAL_REQUIRED/i,
  );
  assert.match(
    sql,
    /create or replace function public\.confirm_portfolio_scenario_tx/i,
  );
  assert.match(
    sql,
    /create or replace function public\.transition_scenario_impact_action_tx/i,
  );
  assert.match(sql, /insert into public\.unified_action_items/i);
  assert.match(
    sql,
    /status in \('draft','approved','tracking','at_risk','realized','not_realized','exit_pending','retired'\)/i,
  );
  assert.match(sql, /g6_review_due_date date not null/i);
  assert.match(sql, /exit_criteria text not null/i);
  assert.match(sql, /g6_reviewed_at is null[\s\S]*BENEFIT_G6_REVIEW_REQUIRED/i);
  assert.match(sql, /data_class text not null default 'unclassified'/i);
  assert.match(
    sql,
    /create or replace function public\.derive_unified_action_data_class/i,
  );
  assert.match(
    sql,
    /before insert or update of project_id,metadata,source_type,data_class on public\.unified_action_items/i,
  );
  assert.match(sql, /BUSINESS_FACTS_REQUIRE_SEPARATE_CONFIRMED_WRITEBACK/i);
  assert.doesNotMatch(
    sql,
    /update public\.(projects|contracts|cost_records|payment_milestones)\b/i,
  );
  const route = readFileSync("src/app/api/business-finance/route.ts", "utf8");
  const page = readFileSync("src/app/business-finance/page.tsx", "utf8");
  assert.match(route, /loadContextProjectIdentityMappings/);
  assert.match(route, /scope\.context\.subjectScope === "portfolio"/);
  assert.match(route, /PORTFOLIO_OR_ORGANIZATION_CONTEXT_REQUIRED/);
  assert.match(route, /review_benefit_baseline/);
  assert.match(route, /submit_benefit_review/);
  assert.match(route, /decide_benefit_review/);
  assert.match(route, /transition_benefit_action/);
  assert.match(route, /transition_benefit_handover/);
  assert.match(route, /confirm_portfolio_scenario_tx/);
  assert.match(route, /transition_scenario_impact_action/);
  assert.match(route, /scope\.projectIds\.includes/);
  assert.match(route, /assertAssignableUser/);
  assert.match(route, /\.eq\("data_class", scope\.dataClass\)/);
  assert.doesNotMatch(route, /mock|demo|DEFAULT_/i);
  assert.match(page, /业财一体化与收益实现中心/);
  assert.match(page, /月度复核/);
  assert.match(page, /G6价值复核/);
  assert.match(page, /三方人工复核/);
  assert.match(page, /S\/A项目收益覆盖/);
  assert.match(page, /退出移交/);
  assert.match(page, /待应用影响包/);
  assert.match(page, /提交应用证据/);
  assert.match(page, /情景分析/);
});
