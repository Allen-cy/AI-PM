export interface BusinessFinanceProject {
  id: string;
  name: string;
  contractAmount: number;
  progress: number;
  projectLevel?: string | null;
}
export interface BusinessFinanceCost {
  projectId: string;
  plannedValue: number;
  actualCost: number;
  earnedValue: number;
}
export interface BusinessFinancePayment {
  projectId: string;
  amount: number;
  dueDate: string | null;
  status: string;
}
export interface BusinessFinanceBenefit {
  projectId: string;
  targetValue: number;
  forecastValue: number;
  actualValue: number;
}

export type BenefitStatus =
  | "draft"
  | "approved"
  | "tracking"
  | "at_risk"
  | "realized"
  | "not_realized"
  | "exit_pending"
  | "retired";
export type BenefitReviewGate = "monthly" | "quarterly" | "G6" | "exit";
export type BenefitReviewRole = "business_owner" | "finance" | "pmo";
export type BenefitActionStatus =
  | "assigned"
  | "accepted"
  | "rejected"
  | "in_progress"
  | "evidence_submitted"
  | "closed";
export type BenefitActionTransition =
  | "accept"
  | "start"
  | "submit_evidence"
  | "review_reject"
  | "close";
export type BenefitHandoverStatus =
  | "proposed"
  | "accepted"
  | "rejected"
  | "in_progress"
  | "evidence_submitted"
  | "completed"
  | "cancelled";
export type BenefitHandoverTransition =
  | "accept"
  | "start"
  | "submit_evidence"
  | "review_reject"
  | "close";
export type ScenarioImpactPackageStatus =
  | "pending_application"
  | "under_review"
  | "approved_for_application"
  | "applied"
  | "rejected"
  | "retired";

export const BENEFIT_REQUIRED_REVIEW_ROLES: readonly BenefitReviewRole[] = [
  "business_owner",
  "finance",
  "pmo",
];

export function isBenefitReviewUnderTarget(input: {
  gate: BenefitReviewGate;
  targetValue: number;
  forecastValue: number;
  actualValue: number;
}): boolean {
  const measured =
    input.gate === "G6" || input.gate === "exit"
      ? input.actualValue
      : input.forecastValue;
  return (
    Number.isFinite(measured) &&
    Number.isFinite(input.targetValue) &&
    measured < input.targetValue
  );
}

export function deriveBenefitStatusAfterReview(input: {
  currentStatus: BenefitStatus;
  gate: BenefitReviewGate;
  underTarget: boolean;
}): BenefitStatus {
  if (input.gate === "exit") {
    if (
      !["approved", "tracking", "at_risk", "realized", "not_realized"].includes(
        input.currentStatus,
      )
    ) {
      throw new Error("BENEFIT_EXIT_REVIEW_NOT_ALLOWED");
    }
    return "exit_pending";
  }
  if (!["tracking", "at_risk"].includes(input.currentStatus))
    throw new Error("BENEFIT_REVIEW_NOT_TRACKING");
  if (input.gate === "G6")
    return input.underTarget ? "not_realized" : "realized";
  return input.underTarget ? "at_risk" : "tracking";
}

export function canSubmitBenefitExitReview(input: {
  g6ReviewedAt: string | null;
  status: BenefitStatus;
}): boolean {
  return (
    Boolean(input.g6ReviewedAt) &&
    ["realized", "not_realized"].includes(input.status)
  );
}

export function transitionBenefitAction(
  status: BenefitActionStatus,
  action: BenefitActionTransition,
): BenefitActionStatus {
  const transitions: Partial<
    Record<
      BenefitActionStatus,
      Partial<Record<BenefitActionTransition, BenefitActionStatus>>
    >
  > = {
    assigned: { accept: "accepted" },
    rejected: { accept: "accepted" },
    accepted: { start: "in_progress" },
    in_progress: { submit_evidence: "evidence_submitted" },
    evidence_submitted: { review_reject: "rejected", close: "closed" },
  };
  const next = transitions[status]?.[action];
  if (!next) throw new Error("BENEFIT_ACTION_TRANSITION_NOT_ALLOWED");
  return next;
}

export function transitionBenefitHandover(
  status: BenefitHandoverStatus,
  action: BenefitHandoverTransition,
): BenefitHandoverStatus {
  const transitions: Partial<
    Record<
      BenefitHandoverStatus,
      Partial<Record<BenefitHandoverTransition, BenefitHandoverStatus>>
    >
  > = {
    proposed: { accept: "accepted" },
    rejected: { accept: "accepted" },
    accepted: { start: "in_progress" },
    in_progress: { submit_evidence: "evidence_submitted" },
    evidence_submitted: { review_reject: "rejected", close: "completed" },
  };
  const next = transitions[status]?.[action];
  if (!next) throw new Error("BENEFIT_HANDOVER_TRANSITION_NOT_ALLOWED");
  return next;
}

export function transitionScenarioImpactAction(
  actionStatus: BenefitActionStatus,
  packageStatus: ScenarioImpactPackageStatus,
  action: BenefitActionTransition,
): BenefitActionStatus {
  if (["applied", "retired"].includes(packageStatus))
    throw new Error("SCENARIO_IMPACT_TRANSITION_NOT_ALLOWED");
  try {
    return transitionBenefitAction(actionStatus, action);
  } catch {
    throw new Error("SCENARIO_IMPACT_TRANSITION_NOT_ALLOWED");
  }
}

export function buildStrategicBenefitCoverage(input: {
  projects: Array<{ id: string; name: string; projectLevel: string | null }>;
  baselines: Array<{
    projectId: string;
    ownerUserId: string | null;
    g6ReviewDueDate: string | null;
    exitCriteria: string | null;
    status?: BenefitStatus | string;
  }>;
}) {
  const strategic = input.projects.filter(
    (project) => project.projectLevel === "S" || project.projectLevel === "A",
  );
  const gaps = strategic.flatMap((project) => {
    const projectBaselines = input.baselines.filter(
      (item) => item.projectId === project.id,
    );
    const baselines = projectBaselines.filter(
      (item) => item.status !== "retired",
    );
    if (baselines.length === 0)
      return [
        {
          projectId: project.id,
          projectName: project.name,
          projectLevel: project.projectLevel,
          missing: [projectBaselines.length > 0 ? "有效收益基线" : "收益基线"],
        },
      ];
    const missing = [
      baselines.some((item) => Boolean(item.ownerUserId)) ? null : "收益Owner",
      baselines.some((item) => Boolean(item.g6ReviewDueDate))
        ? null
        : "G6复核日",
      baselines.some((item) => Boolean(item.exitCriteria?.trim()))
        ? null
        : "退出标准",
    ].filter((item): item is string => Boolean(item));
    return missing.length > 0
      ? [
          {
            projectId: project.id,
            projectName: project.name,
            projectLevel: project.projectLevel,
            missing,
          },
        ]
      : [];
  });
  const coveredProjects = strategic.length - gaps.length;
  return {
    requiredProjects: strategic.length,
    coveredProjects,
    coverageRate:
      strategic.length > 0
        ? Math.round((coveredProjects / strategic.length) * 10000) / 100
        : 100,
    gaps,
  };
}

function withinDays(value: string | null, now: Date, days: number): boolean {
  if (!value) return false;
  const timestamp = new Date(value).getTime();
  return (
    Number.isFinite(timestamp) &&
    timestamp >= now.getTime() &&
    timestamp <= now.getTime() + days * 86_400_000
  );
}

export function buildBusinessFinanceView(input: {
  projects: BusinessFinanceProject[];
  costs: BusinessFinanceCost[];
  payments: BusinessFinancePayment[];
  benefits: BusinessFinanceBenefit[];
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const projects = input.projects.map((project) => {
    const costs = input.costs.filter((item) => item.projectId === project.id);
    const payments = input.payments.filter(
      (item) => item.projectId === project.id,
    );
    const benefit = input.benefits.find(
      (item) => item.projectId === project.id,
    );
    const plannedValue = costs.reduce(
      (sum, item) => sum + item.plannedValue,
      0,
    );
    const actualCost = costs.reduce((sum, item) => sum + item.actualCost, 0);
    const earnedValue = costs.reduce((sum, item) => sum + item.earnedValue, 0);
    const collected = payments
      .filter((item) => item.status === "paid")
      .reduce((sum, item) => sum + item.amount, 0);
    const receivable = payments
      .filter((item) => item.status !== "paid")
      .reduce((sum, item) => sum + item.amount, 0);
    const cashNext90Days = payments
      .filter(
        (item) => item.status !== "paid" && withinDays(item.dueDate, now, 90),
      )
      .reduce((sum, item) => sum + item.amount, 0);
    return {
      ...project,
      plannedValue,
      actualCost,
      earnedValue,
      cpi: actualCost > 0 ? earnedValue / actualCost : null,
      spi: plannedValue > 0 ? earnedValue / plannedValue : null,
      forecastMargin: project.contractAmount - actualCost,
      collected,
      receivable,
      cashNext90Days,
      benefitTarget: benefit?.targetValue ?? 0,
      benefitForecast: benefit?.forecastValue ?? 0,
      benefitActual: benefit?.actualValue ?? 0,
      benefitGap: Math.max(
        0,
        (benefit?.targetValue ?? 0) - (benefit?.forecastValue ?? 0),
      ),
    };
  });
  return {
    summary: {
      contractAmount: projects.reduce(
        (sum, item) => sum + item.contractAmount,
        0,
      ),
      actualCost: projects.reduce((sum, item) => sum + item.actualCost, 0),
      forecastMargin: projects.reduce(
        (sum, item) => sum + item.forecastMargin,
        0,
      ),
      collected: projects.reduce((sum, item) => sum + item.collected, 0),
      receivable: projects.reduce((sum, item) => sum + item.receivable, 0),
      cashNext90Days: projects.reduce(
        (sum, item) => sum + item.cashNext90Days,
        0,
      ),
      benefitTarget: projects.reduce(
        (sum, item) => sum + item.benefitTarget,
        0,
      ),
      benefitForecast: projects.reduce(
        (sum, item) => sum + item.benefitForecast,
        0,
      ),
    },
    projects,
  };
}

export function evaluatePortfolioScenario(input: {
  baselineRevenue: number;
  baselineCost: number;
  baselineCash90Days: number;
  delayDays: number;
  addedMonthlyCost: number;
  scopeRevenueChange: number;
  paused: boolean;
}) {
  const scenarioRevenue = Math.max(
    0,
    input.baselineRevenue + input.scopeRevenueChange,
  );
  const delayMonths = Math.max(0, input.delayDays) / 30;
  const scenarioCost = input.paused
    ? input.baselineCost
    : input.baselineCost + input.addedMonthlyCost * delayMonths;
  const cashDelayFactor = input.paused
    ? 0
    : Math.max(0, 1 - Math.max(0, input.delayDays) / 180);
  const scopeCashFactor =
    input.baselineRevenue > 0
      ? Math.max(0, scenarioRevenue / input.baselineRevenue)
      : 1;
  return {
    scenarioRevenue,
    scenarioCost,
    scenarioMargin: scenarioRevenue - scenarioCost,
    scenarioCash90Days:
      input.baselineCash90Days * cashDelayFactor * scopeCashFactor,
    revenueDelta: scenarioRevenue - input.baselineRevenue,
    costDelta: scenarioCost - input.baselineCost,
    marginDelta:
      scenarioRevenue -
      scenarioCost -
      (input.baselineRevenue - input.baselineCost),
  };
}

export function buildScenarioFactReadiness(
  projects: Array<{
    projectId: string;
    projectName: string;
    hasContractFact: boolean;
    hasCostFact: boolean;
    hasPaymentSchedule: boolean;
  }>,
) {
  const gaps = projects.flatMap((project) => {
    const missing = [
      project.hasContractFact ? null : "合同事实",
      project.hasCostFact ? null : "成本事实",
      project.hasPaymentSchedule ? null : "回款计划",
    ].filter((item): item is string => Boolean(item));
    return missing.length > 0
      ? [
          {
            projectId: project.projectId,
            projectName: project.projectName,
            missing,
          },
        ]
      : [];
  });
  return {
    ready: projects.length > 0 && gaps.length === 0,
    projectCount: projects.length,
    gaps,
  };
}
