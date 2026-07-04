import type { DashboardData, DashboardProjectRecord, HealthMatrixProject } from "../dashboard/types.ts";
import {
  calculateSensitivity,
  type SensitivityFactor,
  type SensitivityResult,
} from "../../lib/risk-analytics.ts";

export type RiskSensitivityImpactLevel = "high" | "medium" | "low";
export type RiskSensitivityHealthStatus = HealthMatrixProject["status"];

export interface RiskSensitivityProjectImpact {
  projectId: string;
  projectName: string;
  owner: string;
  currentHealthStatus: RiskSensitivityHealthStatus;
  suggestedHealthStatus: RiskSensitivityHealthStatus;
  level: RiskSensitivityImpactLevel;
  topFactor: string;
  topSwing: number;
  healthMatrixNote: string;
  nextAction: string;
  reportFact: string;
  requiresConfirmation: boolean;
}

export interface RiskSensitivityImpactDashboard {
  generatedAt: string;
  source: "dashboard" | "template";
  summary: {
    analyzedProjects: number;
    highSensitivity: number;
    mediumSensitivity: number;
    healthMatrixSuggestions: number;
    pendingConfirmation: number;
  };
  projectImpacts: RiskSensitivityProjectImpact[];
  resultsByProject: Array<{
    projectName: string;
    factors: SensitivityFactor[];
    results: SensitivityResult[];
  }>;
  reportFacts: string[];
  boundary: string;
}

function round(value: number, digits = 1): number {
  if (!Number.isFinite(value)) return 0;
  const base = 10 ** digits;
  return Math.round(value * base) / base;
}

function numberOrFallback(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) ? Number(value) : fallback;
}

function healthStatusFromRecord(record: DashboardProjectRecord): RiskSensitivityHealthStatus {
  if (record.成本健康度 < 60 || record.进度偏差 < -15) return "red";
  if (record.成本健康度 < 75 || record.进度偏差 < -5) return "yellow";
  return "green";
}

function sensitivityLevel(result: SensitivityResult | undefined): RiskSensitivityImpactLevel {
  if (!result) return "low";
  if (result.swing >= 40) return "high";
  if (result.swing >= 20) return "medium";
  return "low";
}

function suggestHealthStatus(
  current: RiskSensitivityHealthStatus,
  level: RiskSensitivityImpactLevel,
): RiskSensitivityHealthStatus {
  if (level === "high" && current !== "red") return "red";
  if (level === "medium" && current === "green") return "yellow";
  return current;
}

function levelLabel(level: RiskSensitivityImpactLevel): string {
  if (level === "high") return "高度敏感";
  if (level === "medium") return "中度敏感";
  return "低度敏感";
}

function healthStatusLabel(status: RiskSensitivityHealthStatus): string {
  if (status === "red") return "红区";
  if (status === "yellow") return "黄区";
  return "绿区";
}

function findHealthMatrixProject(
  dashboard: DashboardData,
  record: DashboardProjectRecord,
): HealthMatrixProject | undefined {
  return dashboard.healthMatrix.find(item => item.name === record.项目名称);
}

export function deriveSensitivityFactors(record: DashboardProjectRecord): SensitivityFactor[] {
  const contract = Math.max(1, numberOrFallback(record.合同金额, 100));
  const fallbackCost = contract * 0.65;
  const cost = Math.max(
    1,
    numberOrFallback(record.实际成本, numberOrFallback(record.预计成本, numberOrFallback(record.计划成本, fallbackCost))),
  );
  const delayPressure = Math.max(0, -numberOrFallback(record.进度偏差, 0));
  const receivablePressure = Math.max(0, numberOrFallback(record.应收金额, 0));
  const receivableRatio = receivablePressure / Math.max(contract, 1);
  const collectionDelayHigh = Math.max(15, Math.min(90, Math.round(15 + receivableRatio * 45)));
  const deliveryDelayHigh = Math.max(15, Math.min(90, Math.round(15 + delayPressure * 2)));

  return [
    {
      id: "contract-amount",
      name: "合同金额/收入",
      baseline: round(contract),
      low: round(contract * 0.8),
      high: round(contract * 1.2),
      unit: "万元",
      direction: "positive",
      note: "来自项目台账合同金额，按±20%场景推导。",
    },
    {
      id: "implementation-cost",
      name: "实施成本",
      baseline: round(cost),
      low: round(cost * 0.85),
      high: round(cost * 1.15),
      unit: "万元",
      direction: "negative",
      note: "优先使用实际成本/预计成本/计划成本，缺失时按合同额65%估算。",
    },
    {
      id: "delivery-delay",
      name: "交付延期",
      baseline: 0,
      low: -10,
      high: deliveryDelayHigh,
      unit: "天",
      direction: "negative",
      note: "由项目台账进度偏差推导，偏差越大，高值场景越高。",
    },
    {
      id: "collection-delay",
      name: "回款延迟",
      baseline: 0,
      low: -15,
      high: collectionDelayHigh,
      unit: "天",
      direction: "negative",
      note: "由项目台账应收金额/合同金额推导，回款压力越大，高值场景越高。",
    },
  ];
}

function buildProjectImpact(input: {
  dashboard: DashboardData;
  record: DashboardProjectRecord;
  factors: SensitivityFactor[];
  results: SensitivityResult[];
}): RiskSensitivityProjectImpact {
  const { dashboard, record, factors, results } = input;
  const health = findHealthMatrixProject(dashboard, record);
  const currentHealthStatus = health?.status ?? healthStatusFromRecord(record);
  const top = results[0];
  const level = sensitivityLevel(top);
  const suggestedHealthStatus = suggestHealthStatus(currentHealthStatus, level);
  const topFactor = top?.name ?? factors[0]?.name ?? "未识别";
  const topSwing = round(top?.swing ?? 0);
  const owner = record.项目经理 || record.项目负责人 || record.责任人 || "项目经理";
  const projectName = record.项目名称;
  const healthMatrixNote = `${levelLabel(level)}：${topFactor}摆动值${topSwing}，建议健康矩阵从${healthStatusLabel(currentHealthStatus)}复核为${healthStatusLabel(suggestedHealthStatus)}。`;
  const nextAction = level === "high"
    ? `由${owner}在下次项目例会前补充${topFactor}触发阈值、应对动作和责任截止日期。`
    : level === "medium"
      ? `由${owner}建立${topFactor}监控阈值，并在周报中更新趋势。`
      : `由${owner}按常规周期复核${topFactor}变化。`;

  return {
    projectId: record.项目编号,
    projectName,
    owner,
    currentHealthStatus,
    suggestedHealthStatus,
    level,
    topFactor,
    topSwing,
    healthMatrixNote,
    nextAction,
    reportFact: `${projectName}敏感性${levelLabel(level)}，首要变量为${topFactor}，摆动值${topSwing}；健康矩阵建议${healthStatusLabel(currentHealthStatus)}→${healthStatusLabel(suggestedHealthStatus)}，需人工确认。`,
    requiresConfirmation: suggestedHealthStatus !== currentHealthStatus || level !== "low",
  };
}

export function buildRiskSensitivityImpactDashboard(dashboard: DashboardData): RiskSensitivityImpactDashboard {
  const records = dashboard.records.slice(0, 20);
  const resultsByProject = records.map(record => {
    const factors = deriveSensitivityFactors(record);
    return {
      projectName: record.项目名称,
      factors,
      results: calculateSensitivity(factors),
    };
  });
  const projectImpacts = resultsByProject
    .map(item => {
      const record = records.find(candidate => candidate.项目名称 === item.projectName);
      if (!record) return null;
      return buildProjectImpact({
        dashboard,
        record,
        factors: item.factors,
        results: item.results,
      });
    })
    .filter((item): item is RiskSensitivityProjectImpact => Boolean(item))
    .sort((a, b) => b.topSwing - a.topSwing);
  const reportFacts = projectImpacts
    .filter(item => item.level !== "low" || item.requiresConfirmation)
    .slice(0, 8)
    .map(item => item.reportFact);

  return {
    generatedAt: new Date().toISOString(),
    source: dashboard.records.length > 0 ? "dashboard" : "template",
    summary: {
      analyzedProjects: records.length,
      highSensitivity: projectImpacts.filter(item => item.level === "high").length,
      mediumSensitivity: projectImpacts.filter(item => item.level === "medium").length,
      healthMatrixSuggestions: projectImpacts.filter(item => item.suggestedHealthStatus !== item.currentHealthStatus).length,
      pendingConfirmation: projectImpacts.filter(item => item.requiresConfirmation).length,
    },
    projectImpacts,
    resultsByProject,
    reportFacts,
    boundary: "敏感性影响包只提供项目健康矩阵和报告工厂的分析建议，不自动写回飞书，不自动改变项目健康状态；所有红黄区调整必须由项目负责人或PMO人工确认。",
  };
}
