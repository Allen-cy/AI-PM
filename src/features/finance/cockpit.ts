import type { DashboardData, DashboardProjectRecord } from "@/features/dashboard/types";

export type FinanceHealth = "green" | "yellow" | "red";
export type FinancePriority = "P0" | "P1" | "P2";
export type CostSource = "actual" | "forecast" | "budget" | "derived";

export interface FinanceKpis {
  totalProjects: number;
  totalContract: number;
  totalBudget: number;
  actualCost: number;
  estimatedCost: number;
  grossMargin: number;
  grossMarginRate: number;
  totalCollection: number;
  receivable: number;
  overdueReceivable: number;
  acceptanceBlockedReceivable: number;
  collectionRate: number;
}

export interface FinanceProject {
  id: string;
  name: string;
  customer: string;
  level: string;
  status: string;
  contractAmount: number;
  budgetAmount: number;
  actualCost: number;
  estimatedCost: number;
  costSource: CostSource;
  collectedAmount: number;
  receivableAmount: number;
  collectionRate: number;
  expectedCollectionRate: number;
  grossMargin: number;
  grossMarginRate: number;
  dueDate: string;
  daysUntilDue: number | null;
  daysOverdue: number;
  acceptanceStatus: "未到验收" | "待验收" | "验收中" | "已验收";
  acceptanceProgress: number;
  businessHealth: FinanceHealth;
  riskFlags: string[];
  nextAction: string;
}

export interface FinanceAlert {
  id: string;
  projectId: string;
  projectName: string;
  priority: FinancePriority;
  type: "overdue_payment" | "acceptance_block" | "low_margin" | "cost_overrun" | "collection_lag";
  title: string;
  reason: string;
  owner: string;
  dueDate: string;
  amount?: number;
}

export interface PaymentAcceptanceLink {
  projectId: string;
  projectName: string;
  customer: string;
  receivableAmount: number;
  dueDate: string;
  daysUntilDue: number | null;
  acceptanceStatus: FinanceProject["acceptanceStatus"];
  blockingReason: string;
  nextAction: string;
}

export interface FinancePortfolioGroup {
  name: string;
  count: number;
  contractAmount: number;
  receivableAmount: number;
  grossMargin: number;
  grossMarginRate: number;
}

export interface FinanceCockpit {
  source: {
    type: DashboardData["source"]["type"];
    name: string;
    note?: string;
    generatedAt: string;
    recordCount: number;
    costBasis: "actual-or-derived";
  };
  kpis: FinanceKpis;
  projects: FinanceProject[];
  alerts: FinanceAlert[];
  paymentAcceptanceLinks: PaymentAcceptanceLink[];
  portfolioByLevel: FinancePortfolioGroup[];
  portfolioByStatus: FinancePortfolioGroup[];
  methodology: {
    label: string;
    detail: string;
  }[];
}

interface BuildOptions {
  asOf?: Date;
}

function asRecord(record: DashboardProjectRecord): Record<string, unknown> {
  return record as unknown as Record<string, unknown>;
}

function value(row: Record<string, unknown>, names: string[]): unknown {
  for (const name of names) {
    const direct = row[name];
    if (direct !== undefined && direct !== null && direct !== "") return direct;
  }
  return undefined;
}

function text(row: Record<string, unknown>, names: string[], fallback = ""): string {
  const raw = value(row, names);
  if (raw === undefined || raw === null) return fallback;
  if (Array.isArray(raw)) return raw.map(String).join("、") || fallback;
  return String(raw).trim() || fallback;
}

function numeric(row: Record<string, unknown>, names: string[], fallback = 0): number {
  const raw = value(row, names);
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string") {
    const parsed = Number(raw.replace(/[,%￥¥万\s]/g, ""));
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function round(value: number, digits = 2): number {
  const base = 10 ** digits;
  return Math.round(value * base) / base;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function parseDate(raw?: string): Date | null {
  if (!raw || raw === "未定") return null;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function daysUntil(date: string | undefined, asOf: Date): number | null {
  const parsed = parseDate(date);
  if (!parsed) return null;
  const base = Date.UTC(asOf.getFullYear(), asOf.getMonth(), asOf.getDate());
  const target = Date.UTC(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
  return Math.ceil((target - base) / 86_400_000);
}

function dateByOffset(asOf: Date, days: number): string {
  const date = new Date(asOf);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function acceptanceStatus(record: DashboardProjectRecord): FinanceProject["acceptanceStatus"] {
  const row = asRecord(record);
  const explicit = text(row, ["验收状态", "客户验收状态", "交付验收状态"]);
  const status = `${explicit}${record.项目状态}`;
  const progress = record.当前进度 > 1 ? record.当前进度 : record.当前进度 * 100;
  const closingProgress = numeric(row, ["收尾阶段进度", "验收收尾进度"], record.收尾阶段进度 ?? 0);
  if (/已验收|验收完成|已结项|已关闭|完成/.test(status)) return "已验收";
  if (/验收中|待客户验收|验收/.test(status)) return "验收中";
  if (progress >= 90 || closingProgress >= 40) return "待验收";
  return "未到验收";
}

function acceptanceProgress(record: DashboardProjectRecord, status: FinanceProject["acceptanceStatus"]): number {
  const row = asRecord(record);
  const explicit = numeric(row, ["验收进度", "收尾阶段进度", "验收收尾进度"], Number.NaN);
  if (Number.isFinite(explicit)) return clamp(explicit > 1 ? explicit : explicit * 100, 0, 100);
  if (status === "已验收") return 100;
  if (status === "验收中") return 75;
  if (status === "待验收") return 45;
  return clamp(Math.round((record.当前进度 > 1 ? record.当前进度 : record.当前进度 * 100) * 0.35), 0, 40);
}

function deriveCosts(record: DashboardProjectRecord): Pick<FinanceProject, "budgetAmount" | "actualCost" | "estimatedCost" | "costSource"> {
  const row = asRecord(record);
  const contract = record.合同金额;
  const budget = numeric(row, ["预算金额", "项目预算", "预算", "计划成本", "成本预算"], Number.NaN);
  const plannedCost = Number.isFinite(budget) ? budget : round(contract * 0.72);
  const actualCost = numeric(row, ["实际成本", "已发生成本", "累计成本", "AC"], Number.NaN);
  const forecastCost = numeric(row, ["预计成本", "预测成本", "EAC"], Number.NaN);
  const margin = numeric(row, ["毛利", "项目毛利"], Number.NaN);
  const marginRate = numeric(row, ["毛利率"], Number.NaN);
  const costHealth = clamp(record.成本健康度 || 75, 45, 110);
  const progress = clamp(record.当前进度 > 1 ? record.当前进度 / 100 : record.当前进度, 0, 1);

  if (Number.isFinite(actualCost) || Number.isFinite(forecastCost)) {
    const estimated = Number.isFinite(forecastCost) ? forecastCost : Math.max(actualCost, plannedCost);
    return {
      budgetAmount: round(plannedCost),
      actualCost: round(Number.isFinite(actualCost) ? actualCost : estimated * progress),
      estimatedCost: round(estimated),
      costSource: Number.isFinite(forecastCost) ? "forecast" : "actual",
    };
  }
  if (Number.isFinite(margin)) {
    const estimated = Math.max(0, contract - margin);
    return {
      budgetAmount: round(plannedCost),
      actualCost: round(estimated * progress),
      estimatedCost: round(estimated),
      costSource: "forecast",
    };
  }
  if (Number.isFinite(marginRate)) {
    const estimated = Math.max(0, contract * (1 - marginRate / 100));
    return {
      budgetAmount: round(plannedCost),
      actualCost: round(estimated * progress),
      estimatedCost: round(estimated),
      costSource: "forecast",
    };
  }

  const overrunRate = Math.max(0, 80 - costHealth) / 100;
  const estimated = plannedCost * (1 + overrunRate);
  return {
    budgetAmount: round(plannedCost),
    actualCost: round(estimated * Math.max(0.2, progress)),
    estimatedCost: round(estimated),
    costSource: Number.isFinite(budget) ? "budget" : "derived",
  };
}

function expectedCollectionRate(progress: number, acceptance: FinanceProject["acceptanceStatus"]): number {
  if (acceptance === "已验收") return 85;
  if (acceptance === "验收中") return 70;
  if (progress >= 0.8) return 65;
  if (progress >= 0.5) return 45;
  if (progress >= 0.2) return 25;
  return 10;
}

function projectHealth(input: {
  marginRate: number;
  daysOverdue: number;
  receivableAmount: number;
  collectionRate: number;
  expectedCollectionRate: number;
  acceptance: FinanceProject["acceptanceStatus"];
  estimatedCost: number;
  budgetAmount: number;
}): FinanceHealth {
  if (
    input.marginRate < 10
    || input.daysOverdue > 30
    || input.estimatedCost > input.budgetAmount * 1.12
    || (input.acceptance !== "已验收" && input.receivableAmount > 0 && input.daysOverdue > 0)
  ) return "red";
  if (
    input.marginRate < 18
    || input.daysOverdue > 0
    || input.collectionRate + 15 < input.expectedCollectionRate
    || input.estimatedCost > input.budgetAmount * 1.03
  ) return "yellow";
  return "green";
}

function nextAction(project: FinanceProject): string {
  if (project.daysOverdue > 0 && project.acceptanceStatus !== "已验收") return "优先推进验收确认，并同步商务催收。";
  if (project.daysOverdue > 0) return "商务负责人发起逾期回款跟进，补齐付款计划。";
  if (project.grossMarginRate < 18) return "项目经理复核成本消耗和剩余工作量，提交经营风险说明。";
  if (project.collectionRate + 15 < project.expectedCollectionRate) return "按项目进度校准回款节点，更新客户付款承诺。";
  if (project.acceptanceStatus !== "已验收" && project.receivableAmount > 0) return "确认验收材料、发票和付款条件是否齐备。";
  return "维持周度经营复核，确保合同、成本、回款口径同步。";
}

function normalizeProject(record: DashboardProjectRecord, asOf: Date): FinanceProject {
  const costs = deriveCosts(record);
  const contractAmount = round(record.合同金额);
  const collectedAmount = round(record.已回款金额);
  const receivableAmount = round(record.应收金额 || Math.max(0, contractAmount - collectedAmount));
  const collectionRate = contractAmount > 0 ? round((collectedAmount / contractAmount) * 100, 1) : 0;
  const acceptance = acceptanceStatus(record);
  const progress = clamp(record.当前进度 > 1 ? record.当前进度 / 100 : record.当前进度, 0, 1);
  const due = record.到期日期 || record.计划完成 || "未定";
  const days = daysUntil(due, asOf);
  const daysOverdue = days !== null && days < 0 ? Math.abs(days) : 0;
  const grossMargin = round(contractAmount - costs.estimatedCost);
  const grossMarginRate = contractAmount > 0 ? round((grossMargin / contractAmount) * 100, 1) : 0;
  const expectedRate = expectedCollectionRate(progress, acceptance);
  const businessHealth = projectHealth({
    marginRate: grossMarginRate,
    daysOverdue,
    receivableAmount,
    collectionRate,
    expectedCollectionRate: expectedRate,
    acceptance,
    estimatedCost: costs.estimatedCost,
    budgetAmount: costs.budgetAmount,
  });
  const riskFlags = [
    daysOverdue > 0 ? `应收逾期${daysOverdue}天` : "",
    acceptance !== "已验收" && receivableAmount > 0 && (days === null || days <= 30) ? "回款依赖验收/收尾" : "",
    grossMarginRate < 18 ? "毛利率低于18%" : "",
    costs.estimatedCost > costs.budgetAmount * 1.03 ? "预计成本高于预算" : "",
    collectionRate + 15 < expectedRate ? "回款进度低于交付进度" : "",
  ].filter(Boolean);

  const project: FinanceProject = {
    id: record.项目编号,
    name: record.项目名称,
    customer: record.客户名称,
    level: record.项目等级,
    status: record.项目状态,
    contractAmount,
    ...costs,
    collectedAmount,
    receivableAmount,
    collectionRate,
    expectedCollectionRate: expectedRate,
    grossMargin,
    grossMarginRate,
    dueDate: due,
    daysUntilDue: days,
    daysOverdue,
    acceptanceStatus: acceptance,
    acceptanceProgress: acceptanceProgress(record, acceptance),
    businessHealth,
    riskFlags,
    nextAction: "",
  };
  return { ...project, nextAction: nextAction(project) };
}

function alertDueDate(asOf: Date, priority: FinancePriority): string {
  if (priority === "P0") return dateByOffset(asOf, 1);
  if (priority === "P1") return dateByOffset(asOf, 3);
  return dateByOffset(asOf, 7);
}

function alertsFromProject(project: FinanceProject, asOf: Date): FinanceAlert[] {
  const alerts: FinanceAlert[] = [];
  if (project.daysOverdue > 0 && project.receivableAmount > 0) {
    const priority: FinancePriority = project.daysOverdue > 30 || project.receivableAmount >= 100 ? "P0" : "P1";
    alerts.push({
      id: `${project.id}-overdue-payment`,
      projectId: project.id,
      projectName: project.name,
      priority,
      type: "overdue_payment",
      title: "逾期应收需要回款跟进",
      reason: `${project.name} 应收 ${project.receivableAmount} 万，已逾期 ${project.daysOverdue} 天。`,
      owner: "商务负责人/项目经理",
      dueDate: alertDueDate(asOf, priority),
      amount: project.receivableAmount,
    });
  }
  if (project.acceptanceStatus !== "已验收" && project.receivableAmount > 0 && (project.daysUntilDue === null || project.daysUntilDue <= 30)) {
    const priority: FinancePriority = project.daysOverdue > 0 ? "P0" : "P1";
    alerts.push({
      id: `${project.id}-acceptance-block`,
      projectId: project.id,
      projectName: project.name,
      priority,
      type: "acceptance_block",
      title: "回款节点依赖验收/收尾确认",
      reason: `${project.name} 当前为「${project.acceptanceStatus}」，仍有应收 ${project.receivableAmount} 万。`,
      owner: "项目经理/交付负责人",
      dueDate: alertDueDate(asOf, priority),
      amount: project.receivableAmount,
    });
  }
  if (project.grossMarginRate < 18 && project.contractAmount > 0) {
    const priority: FinancePriority = project.grossMarginRate < 10 ? "P0" : "P1";
    alerts.push({
      id: `${project.id}-low-margin`,
      projectId: project.id,
      projectName: project.name,
      priority,
      type: "low_margin",
      title: "项目毛利率低于经营阈值",
      reason: `${project.name} 预计毛利率 ${project.grossMarginRate}%，需复核成本和剩余工作量。`,
      owner: "项目经理/财务BP",
      dueDate: alertDueDate(asOf, priority),
      amount: project.grossMargin,
    });
  }
  if (project.estimatedCost > project.budgetAmount * 1.03 && project.budgetAmount > 0) {
    const priority: FinancePriority = project.estimatedCost > project.budgetAmount * 1.12 ? "P0" : "P1";
    alerts.push({
      id: `${project.id}-cost-overrun`,
      projectId: project.id,
      projectName: project.name,
      priority,
      type: "cost_overrun",
      title: "预计成本超过预算",
      reason: `${project.name} 预算 ${project.budgetAmount} 万，预计成本 ${project.estimatedCost} 万。`,
      owner: "项目经理/资源负责人",
      dueDate: alertDueDate(asOf, priority),
      amount: round(project.estimatedCost - project.budgetAmount),
    });
  }
  if (project.collectionRate + 15 < project.expectedCollectionRate && project.receivableAmount > 0) {
    alerts.push({
      id: `${project.id}-collection-lag`,
      projectId: project.id,
      projectName: project.name,
      priority: "P2",
      type: "collection_lag",
      title: "回款进度低于交付进度",
      reason: `${project.name} 当前回款率 ${project.collectionRate}%，按交付/验收状态期望至少 ${project.expectedCollectionRate}%。`,
      owner: "项目经理/商务负责人",
      dueDate: alertDueDate(asOf, "P2"),
      amount: project.receivableAmount,
    });
  }
  return alerts;
}

function buildGroup(projects: FinanceProject[], key: (project: FinanceProject) => string): FinancePortfolioGroup[] {
  const map = new Map<string, FinancePortfolioGroup>();
  for (const project of projects) {
    const name = key(project) || "未分类";
    const current = map.get(name) ?? {
      name,
      count: 0,
      contractAmount: 0,
      receivableAmount: 0,
      grossMargin: 0,
      grossMarginRate: 0,
    };
    current.count += 1;
    current.contractAmount += project.contractAmount;
    current.receivableAmount += project.receivableAmount;
    current.grossMargin += project.grossMargin;
    current.grossMarginRate = current.contractAmount > 0 ? (current.grossMargin / current.contractAmount) * 100 : 0;
    map.set(name, current);
  }
  return [...map.values()]
    .map(item => ({
      ...item,
      contractAmount: round(item.contractAmount),
      receivableAmount: round(item.receivableAmount),
      grossMargin: round(item.grossMargin),
      grossMarginRate: round(item.grossMarginRate, 1),
    }))
    .sort((a, b) => b.contractAmount - a.contractAmount);
}

function paymentAcceptanceLinks(projects: FinanceProject[]): PaymentAcceptanceLink[] {
  return projects
    .filter(project => project.receivableAmount > 0)
    .sort((a, b) => {
      const aDue = a.daysUntilDue ?? 999;
      const bDue = b.daysUntilDue ?? 999;
      return aDue - bDue || b.receivableAmount - a.receivableAmount;
    })
    .slice(0, 12)
    .map(project => ({
      projectId: project.id,
      projectName: project.name,
      customer: project.customer,
      receivableAmount: project.receivableAmount,
      dueDate: project.dueDate,
      daysUntilDue: project.daysUntilDue,
      acceptanceStatus: project.acceptanceStatus,
      blockingReason: project.acceptanceStatus === "已验收"
        ? "验收已完成，重点跟进付款承诺。"
        : "回款需要验收、收尾或付款条件确认。",
      nextAction: project.nextAction,
    }));
}

export function buildFinanceCockpit(dashboard: DashboardData, options: BuildOptions = {}): FinanceCockpit {
  const asOf = options.asOf ?? new Date();
  const projects = dashboard.records.map(record => normalizeProject(record, asOf));
  const totalContract = projects.reduce((sum, item) => sum + item.contractAmount, 0);
  const totalBudget = projects.reduce((sum, item) => sum + item.budgetAmount, 0);
  const actualCost = projects.reduce((sum, item) => sum + item.actualCost, 0);
  const estimatedCost = projects.reduce((sum, item) => sum + item.estimatedCost, 0);
  const totalCollection = projects.reduce((sum, item) => sum + item.collectedAmount, 0);
  const receivable = projects.reduce((sum, item) => sum + item.receivableAmount, 0);
  const overdueReceivable = projects.filter(item => item.daysOverdue > 0).reduce((sum, item) => sum + item.receivableAmount, 0);
  const acceptanceBlockedReceivable = projects
    .filter(item => item.acceptanceStatus !== "已验收" && item.receivableAmount > 0 && (item.daysUntilDue === null || item.daysUntilDue <= 30))
    .reduce((sum, item) => sum + item.receivableAmount, 0);
  const grossMargin = totalContract - estimatedCost;
  const alerts = projects
    .flatMap(project => alertsFromProject(project, asOf))
    .sort((a, b) => {
      const score = { P0: 3, P1: 2, P2: 1 };
      return score[b.priority] - score[a.priority] || (b.amount ?? 0) - (a.amount ?? 0);
    })
    .slice(0, 20);

  return {
    source: {
      type: dashboard.source.type,
      name: dashboard.source.name,
      note: dashboard.source.note,
      generatedAt: new Date().toISOString(),
      recordCount: projects.length,
      costBasis: "actual-or-derived",
    },
    kpis: {
      totalProjects: projects.length,
      totalContract: round(totalContract),
      totalBudget: round(totalBudget),
      actualCost: round(actualCost),
      estimatedCost: round(estimatedCost),
      grossMargin: round(grossMargin),
      grossMarginRate: totalContract > 0 ? round((grossMargin / totalContract) * 100, 1) : 0,
      totalCollection: round(totalCollection),
      receivable: round(receivable),
      overdueReceivable: round(overdueReceivable),
      acceptanceBlockedReceivable: round(acceptanceBlockedReceivable),
      collectionRate: totalContract > 0 ? round((totalCollection / totalContract) * 100, 1) : 0,
    },
    projects: projects.sort((a, b) => {
      const healthScore = { red: 3, yellow: 2, green: 1 };
      return healthScore[b.businessHealth] - healthScore[a.businessHealth] || b.receivableAmount - a.receivableAmount;
    }),
    alerts,
    paymentAcceptanceLinks: paymentAcceptanceLinks(projects),
    portfolioByLevel: buildGroup(projects, project => `${project.level}级`),
    portfolioByStatus: buildGroup(projects, project => project.status),
    methodology: [
      { label: "合同口径", detail: "合同额优先取飞书项目台账「合同金额」，没有合同明细表时不反向均摊回款计划。" },
      { label: "回款口径", detail: "已回款取「已回款金额/实收金额」，应收取「应收金额」，缺失时按合同额-已回款估算。" },
      { label: "成本口径", detail: "优先取实际成本/预计成本/预算金额；缺失时基于合同额、成本健康度和进度生成估算，并标记成本来源。" },
      { label: "毛利口径", detail: "预计毛利=合同额-预计成本；毛利率=预计毛利/合同额。估算口径仅用于预警，不替代财务系统。" },
      { label: "回款验收联动", detail: "将应收、到期日期、项目状态、验收状态和收尾进度关联，识别因验收/收尾阻塞导致的回款风险。" },
    ],
  };
}
