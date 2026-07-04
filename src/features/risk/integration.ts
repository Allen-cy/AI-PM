import type { DashboardData, DashboardProjectRecord, UpcomingPayment } from "../dashboard/types.ts";
import { getRiskLevel, statusLabels, type Risk, type RiskImpactArea } from "../../lib/risk.ts";

export type RiskIntegrationTarget = "project_health" | "task" | "milestone" | "payment" | "governance" | "report";
export type RiskIntegrationWritebackMode = "manual_confirmation_required" | "audit_only";

export interface RiskIntegrationWriteback {
  target: RiskIntegrationTarget;
  field: string;
  suggestedValue: string;
  reason: string;
  requiresConfirmation: boolean;
}

export interface RiskIntegrationAction {
  id: string;
  title: string;
  owner: string;
  dueDate: string;
  priority: "P0" | "P1" | "P2";
  targetModule: "项目台账" | "任务" | "里程碑" | "回款" | "治理工作流" | "报告工厂";
  sourceReason: string;
  confirmationRequired: boolean;
}

export interface RiskIntegrationLink {
  id: string;
  riskId: string;
  riskCode?: string;
  projectName: string;
  riskDescription: string;
  severity: "高" | "中" | "低";
  status: string;
  owner: string;
  deadline: string;
  source: "risk_register" | "project_ledger";
  impactedTargets: RiskIntegrationTarget[];
  dependencies: string[];
  suggestedWritebacks: RiskIntegrationWriteback[];
  actions: RiskIntegrationAction[];
  reportFact: string;
  evidence: string[];
  writebackMode: RiskIntegrationWritebackMode;
}

export interface RiskIntegrationDashboard {
  generatedAt: string;
  source: "risk_register" | "dashboard" | "combined";
  summary: {
    openRiskLinks: number;
    highSeverity: number;
    projectHealthImpacts: number;
    taskImpacts: number;
    milestoneImpacts: number;
    paymentImpacts: number;
    governanceEscalations: number;
    pendingConfirmation: number;
  };
  links: RiskIntegrationLink[];
  reportFacts: string[];
  boundary: string;
}

function dateByOffset(days: number, baseDate = new Date()): string {
  const date = new Date(baseDate);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function money(value: number): string {
  return `${Number(value || 0).toLocaleString("zh-CN", { maximumFractionDigits: 1 })}万`;
}

function percent(value: number): string {
  const normalized = value > 1 ? value : value * 100;
  return `${Number(normalized || 0).toFixed(1)}%`;
}

function riskSeverity(risk: Risk): "高" | "中" | "低" {
  const level = getRiskLevel(risk.piScore);
  if (level === "high") return "高";
  if (level === "medium") return "中";
  return "低";
}

function projectSeverity(record?: DashboardProjectRecord): "高" | "中" | "低" {
  return record?.风险等级 ?? "低";
}

function isOpenRisk(risk: Risk): boolean {
  return !["resolved", "closed"].includes(risk.status);
}

function riskStatusLabel(risk: Risk): string {
  return statusLabels[risk.status] ?? risk.status;
}

function projectKey(projectName: string): string {
  return projectName.replace(/\s/g, "").toLowerCase();
}

function findProjectRecord(dashboard: DashboardData | null | undefined, projectName: string): DashboardProjectRecord | undefined {
  if (!dashboard) return undefined;
  const key = projectKey(projectName);
  return dashboard.records.find(record => projectKey(record.项目名称) === key)
    ?? dashboard.records.find(record => projectKey(record.项目名称).includes(key) || key.includes(projectKey(record.项目名称)));
}

function projectPayments(dashboard: DashboardData | null | undefined, projectName: string): UpcomingPayment[] {
  if (!dashboard) return [];
  const key = projectKey(projectName);
  return dashboard.upcomingPayments.filter(payment => projectKey(payment.project) === key || projectKey(payment.project).includes(key) || key.includes(projectKey(payment.project)));
}

function targetByImpactArea(area: RiskImpactArea): RiskIntegrationTarget[] {
  if (area === "回款" || area === "合同") return ["payment", "project_health"];
  if (area === "工期") return ["milestone", "task", "project_health"];
  if (area === "质量" || area === "范围") return ["milestone", "project_health"];
  if (area === "费用") return ["project_health", "report"];
  return ["project_health", "task"];
}

function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

function priorityFor(severity: "高" | "中" | "低", target: RiskIntegrationTarget, daysLeft?: number): "P0" | "P1" | "P2" {
  if (severity === "高" || target === "governance" || (typeof daysLeft === "number" && daysLeft < 0)) return "P0";
  if (severity === "中" || (typeof daysLeft === "number" && daysLeft <= 7)) return "P1";
  return "P2";
}

function buildLinkFromRisk(input: {
  risk: Risk;
  dashboard?: DashboardData | null;
  asOf?: Date;
}): RiskIntegrationLink {
  const { risk, dashboard } = input;
  const record = findProjectRecord(dashboard, risk.projectName);
  const payments = projectPayments(dashboard, risk.projectName);
  const severity = riskSeverity(risk);
  const targets = new Set<RiskIntegrationTarget>([
    ...targetByImpactArea(risk.impactArea),
    "report",
  ]);

  if (severity === "高" || risk.responseStrategyType === "上报" || risk.priorityScore >= 48) targets.add("governance");
  if (record?.应收金额 && record.应收金额 > 0) targets.add("payment");
  if (record?.进度偏差 && record.进度偏差 < -5) {
    targets.add("milestone");
    targets.add("task");
  }

  const impactedTargets = Array.from(targets);
  const deadline = risk.actionDeadline || risk.dueDate || dateByOffset(severity === "高" ? 1 : 3, input.asOf);
  const dependencies = unique([
    record ? `项目台账：${record.项目名称}，状态${record.项目状态}，进度${percent(record.当前进度)}，风险${record.风险等级}/${record.风险趋势}` : "",
    record && record.应收金额 > 0 ? `回款：项目台账应收${money(record.应收金额)}，到期${record.到期日期 || "未设定"}` : "",
    ...payments.map(payment => `回款：${payment.party} ${money(payment.amount)}，到期${payment.dueDate}，剩余${payment.daysLeft}天`),
    risk.linkedModule ? `关联模块：${risk.linkedModule}` : "",
  ].filter(Boolean));

  const suggestedWritebacks: RiskIntegrationWriteback[] = [
    {
      target: "project_health",
      field: "项目健康/风险说明",
      suggestedValue: `${severity}风险：${risk.description}`,
      reason: "风险登记册中的开放风险会影响项目组合看板和监控中心的健康判断。",
      requiresConfirmation: true,
    },
    ...impactedTargets.includes("payment") ? [{
      target: "payment" as const,
      field: "回款风险说明",
      suggestedValue: risk.contingencyPlan || risk.responseStrategy || "需确认验收、开票、付款条件和客户侧阻塞。",
      reason: "该风险影响合同/回款或项目存在未收款项。",
      requiresConfirmation: true,
    }] : [],
    ...impactedTargets.includes("milestone") ? [{
      target: "milestone" as const,
      field: "里程碑风险说明",
      suggestedValue: risk.trigger || "需复核阶段门证据、交付物和下一阶段授权。",
      reason: "该风险影响工期、质量、范围或阶段门。",
      requiresConfirmation: true,
    }] : [],
    ...impactedTargets.includes("governance") ? [{
      target: "governance" as const,
      field: "风险升级状态",
      suggestedValue: "建议发起风险升级评审",
      reason: "高风险、上报策略或优先级超过项目经理授权容差。",
      requiresConfirmation: true,
    }] : [],
  ];

  const actions: RiskIntegrationAction[] = [
    {
      id: `${risk.id}-risk-review`,
      title: `复核风险并更新应对证据：${risk.description}`,
      owner: risk.actionOwner || risk.owner || "项目经理",
      dueDate: deadline,
      priority: priorityFor(severity, "task"),
      targetModule: "任务",
      sourceReason: "开放风险必须有责任人、deadline和执行证据。",
      confirmationRequired: true,
    },
    ...impactedTargets.includes("payment") ? [{
      id: `${risk.id}-payment-check`,
      title: `确认${risk.projectName}回款阻塞和升级路径`,
      owner: risk.owner || "商务负责人/项目经理",
      dueDate: deadline,
      priority: priorityFor(severity, "payment", payments[0]?.daysLeft),
      targetModule: "回款" as const,
      sourceReason: "风险影响回款或项目存在应收金额。",
      confirmationRequired: true,
    }] : [],
    ...impactedTargets.includes("milestone") ? [{
      id: `${risk.id}-milestone-check`,
      title: `复核${risk.projectName}里程碑/阶段门证据`,
      owner: risk.owner || "项目经理",
      dueDate: deadline,
      priority: priorityFor(severity, "milestone"),
      targetModule: "里程碑" as const,
      sourceReason: "风险影响工期、质量、范围或下一阶段授权。",
      confirmationRequired: true,
    }] : [],
    ...impactedTargets.includes("governance") ? [{
      id: `${risk.id}-governance-escalation`,
      title: `发起${risk.projectName}风险升级治理评审`,
      owner: "PMO/项目负责人",
      dueDate: deadline,
      priority: "P0" as const,
      targetModule: "治理工作流" as const,
      sourceReason: "高风险或上报策略需要治理层确认资源、范围、回款或阶段门决策。",
      confirmationRequired: true,
    }] : [],
  ];

  const reportFact = `${risk.projectName}：${severity}风险「${risk.description}」影响${impactedTargets.map(targetLabel).join("、")}；责任人${risk.owner || "未指定"}，deadline ${deadline}，写回需人工确认。`;

  return {
    id: `risk-link-${risk.id}`,
    riskId: risk.id,
    riskCode: risk.riskCode,
    projectName: risk.projectName,
    riskDescription: risk.description,
    severity,
    status: riskStatusLabel(risk),
    owner: risk.owner || "未指定",
    deadline,
    source: "risk_register",
    impactedTargets,
    dependencies,
    suggestedWritebacks,
    actions,
    reportFact,
    evidence: [
      `风险登记册：${risk.riskCode || risk.id}`,
      risk.evidence || "",
      record ? `项目台账：${record.项目编号}` : "",
    ].filter(Boolean),
    writebackMode: "manual_confirmation_required",
  };
}

function targetLabel(target: RiskIntegrationTarget): string {
  const labels: Record<RiskIntegrationTarget, string> = {
    project_health: "项目健康",
    task: "任务",
    milestone: "里程碑",
    payment: "回款",
    governance: "治理",
    report: "报告",
  };
  return labels[target];
}

function buildRiskFromProjectRecord(record: DashboardProjectRecord, index: number): Risk | null {
  if (record.风险等级 === "低" && !(record.应收金额 > 0) && !(record.进度偏差 < -5) && !record.是否重点项目) return null;
  const severity = projectSeverity(record);
  const score = severity === "高" ? 20 : severity === "中" ? 12 : 4;
  const impactArea: RiskImpactArea = record.风险类型.includes("回款") || record.应收金额 > 0
    ? "回款"
    : record.风险类型.includes("进度") || record.进度偏差 < -5
      ? "工期"
      : "范围";
  return {
    id: `ledger-${record.项目编号 || index + 1}`,
    riskCode: `LEDGER-${record.项目编号 || index + 1}`,
    projectName: record.项目名称,
    description: `${record.风险类型 || "项目台账风险"}：${record.风险状态 || "待复核"}，趋势${record.风险趋势 || "未标注"}`,
    category: impactArea === "回款" ? "财务" : impactArea === "工期" ? "进度" : "管理",
    stage: "监控",
    source: "飞书项目台账",
    impactArea,
    probability: severity === "高" ? 4 : severity === "中" ? 3 : 2,
    impact: severity === "高" ? 5 : severity === "中" ? 4 : 2,
    urgency: severity === "高" ? 5 : severity === "中" ? 3 : 2,
    piScore: score,
    priorityScore: score * (severity === "高" ? 5 : severity === "中" ? 3 : 2),
    status: "identified",
    responseStrategyType: severity === "高" ? "上报" : "缓解",
    responseStrategy: "从项目台账生成风险联动建议，需人工确认是否写入风险登记册或治理流程。",
    preventiveAction: "复核项目进度、成本健康、应收、里程碑和风险趋势。",
    contingencyPlan: "必要时升级PMO治理例会，确认资源、范围、阶段门或回款路径。",
    trigger: "项目台账风险等级、进度偏差、应收或重点项目标记触发。",
    trackingMethod: "项目组合看板、工作台和报告工厂同步跟踪。",
    owner: record.项目经理 || record.项目负责人 || record.责任人 || "项目经理",
    dueDate: record.到期日期 || dateByOffset(severity === "高" ? 1 : 7),
    nextReviewDate: dateByOffset(7),
    closingCriteria: "项目台账风险指标恢复到可接受范围，或治理层确认应对完成。",
    linkedModule: impactArea === "回款" ? "合同回款" : "监控",
    evidence: `项目台账记录：${record.项目编号}`,
    createdAt: new Date().toISOString().slice(0, 10),
  };
}

export function buildRiskIntegrationDashboard(input: {
  risks?: Risk[];
  dashboard?: DashboardData | null;
  asOf?: Date;
  limit?: number;
}): RiskIntegrationDashboard {
  const registerRisks = (input.risks ?? []).filter(isOpenRisk);
  const riskKeys = new Set(registerRisks.map(risk => projectKey(risk.projectName)));
  const ledgerRisks = (input.dashboard?.records ?? [])
    .map(buildRiskFromProjectRecord)
    .filter((risk): risk is Risk => Boolean(risk))
    .filter(risk => !riskKeys.has(projectKey(risk.projectName)));
  const allRisks = [...registerRisks, ...ledgerRisks];
  const links = allRisks
    .map(risk => buildLinkFromRisk({ risk, dashboard: input.dashboard, asOf: input.asOf }))
    .sort((a, b) => ({ 高: 3, 中: 2, 低: 1 }[b.severity] - { 高: 3, 中: 2, 低: 1 }[a.severity] || b.actions.length - a.actions.length))
    .slice(0, input.limit ?? 30);
  const countTarget = (target: RiskIntegrationTarget) => links.filter(link => link.impactedTargets.includes(target)).length;

  return {
    generatedAt: new Date().toISOString(),
    source: registerRisks.length > 0 && ledgerRisks.length > 0 ? "combined" : registerRisks.length > 0 ? "risk_register" : "dashboard",
    summary: {
      openRiskLinks: links.length,
      highSeverity: links.filter(link => link.severity === "高").length,
      projectHealthImpacts: countTarget("project_health"),
      taskImpacts: countTarget("task"),
      milestoneImpacts: countTarget("milestone"),
      paymentImpacts: countTarget("payment"),
      governanceEscalations: countTarget("governance"),
      pendingConfirmation: links.reduce((sum, link) => sum + link.suggestedWritebacks.filter(item => item.requiresConfirmation).length, 0),
    },
    links,
    reportFacts: links.map(link => link.reportFact),
    boundary: "风险联动包只生成项目台账、任务、里程碑、回款、治理和报告工厂的建议；任何写回飞书或改变主数据的动作都必须由用户人工确认。",
  };
}
