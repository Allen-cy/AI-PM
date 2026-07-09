import type { Risk } from "../../lib/risk.ts";
import { getRiskLevel, statusLabels } from "../../lib/risk.ts";
import type { RiskIntegrationDashboard } from "./integration.ts";

export interface RiskOrganizationalGovernanceOwnerStat {
  owner: string;
  openRisks: number;
  highRisks: number;
  overdueRisks: number;
  missingEvidence: number;
  governanceEscalations: number;
}

export interface RiskOrganizationalGovernanceRule {
  id: string;
  title: string;
  status: "通过" | "待补充" | "阻断";
  owner: string;
  evidence: string;
  nextAction: string;
}

export interface RiskOrganizationalGovernanceDashboard {
  generatedAt: string;
  summary: {
    totalRisks: number;
    openRisks: number;
    highRisks: number;
    overdueRisks: number;
    missingOwnerOrDeadline: number;
    governanceEscalations: number;
    evidenceGaps: number;
    reportFacts: number;
  };
  ownerStats: RiskOrganizationalGovernanceOwnerStat[];
  rules: RiskOrganizationalGovernanceRule[];
  reportFacts: string[];
  nextActions: string[];
  boundary: string;
}

function isOpen(risk: Risk): boolean {
  return !["resolved", "closed"].includes(risk.status);
}

function isHigh(risk: Risk): boolean {
  return getRiskLevel(risk.piScore) === "high" || risk.priorityScore >= 48;
}

function dueDate(risk: Risk): string {
  return risk.actionDeadline || risk.dueDate || risk.nextReviewDate || "";
}

function isOverdue(risk: Risk, now: Date): boolean {
  const value = dueDate(risk);
  if (!value) return false;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return false;
  return parsed < Date.parse(now.toISOString().slice(0, 10));
}

function evidenceGap(risk: Risk): boolean {
  if (!isOpen(risk)) return false;
  return !risk.evidence?.trim() || !risk.responseStrategy?.trim() || !risk.actionOwner && !risk.owner;
}

function ownerName(risk: Risk): string {
  return risk.actionOwner || risk.owner || "未指定责任人";
}

function status(status: boolean, warning: boolean): RiskOrganizationalGovernanceRule["status"] {
  if (status) return "通过";
  if (warning) return "待补充";
  return "阻断";
}

export function buildRiskOrganizationalGovernanceDashboard(input: {
  risks: Risk[];
  integration?: RiskIntegrationDashboard | null;
  now?: Date;
}): RiskOrganizationalGovernanceDashboard {
  const now = input.now ?? new Date();
  const openRisks = input.risks.filter(isOpen);
  const highRisks = openRisks.filter(isHigh);
  const overdueRisks = openRisks.filter(risk => isOverdue(risk, now));
  const evidenceGaps = openRisks.filter(evidenceGap);
  const missingOwnerOrDeadline = openRisks.filter(risk => !ownerName(risk) || ownerName(risk) === "未指定责任人" || !dueDate(risk));
  const governanceEscalations = input.integration?.summary.governanceEscalations ?? highRisks.filter(risk => risk.responseStrategyType === "上报").length;

  const ownerMap = new Map<string, RiskOrganizationalGovernanceOwnerStat>();
  for (const risk of openRisks) {
    const owner = ownerName(risk);
    const current = ownerMap.get(owner) ?? {
      owner,
      openRisks: 0,
      highRisks: 0,
      overdueRisks: 0,
      missingEvidence: 0,
      governanceEscalations: 0,
    };
    current.openRisks += 1;
    if (isHigh(risk)) current.highRisks += 1;
    if (isOverdue(risk, now)) current.overdueRisks += 1;
    if (evidenceGap(risk)) current.missingEvidence += 1;
    if (risk.responseStrategyType === "上报" || isHigh(risk)) current.governanceEscalations += 1;
    ownerMap.set(owner, current);
  }

  const ownerStats = [...ownerMap.values()]
    .sort((a, b) => b.highRisks - a.highRisks || b.overdueRisks - a.overdueRisks || b.openRisks - a.openRisks)
    .slice(0, 12);

  const reportFacts = [
    `组织级风险：开放 ${openRisks.length} 条，高风险 ${highRisks.length} 条，逾期 ${overdueRisks.length} 条，证据缺口 ${evidenceGaps.length} 条。`,
    ...(input.integration?.reportFacts ?? []),
    ...highRisks.slice(0, 5).map(risk => `${risk.projectName}：${risk.description}；状态${statusLabels[risk.status] ?? risk.status}；责任人${ownerName(risk)}；deadline ${dueDate(risk) || "未设置"}。`),
  ].slice(0, 12);

  const rules: RiskOrganizationalGovernanceRule[] = [
    {
      id: "risk-owner-deadline",
      title: "开放风险必须有责任人和 deadline",
      status: status(missingOwnerOrDeadline.length === 0, missingOwnerOrDeadline.length <= 2),
      owner: "项目经理",
      evidence: `缺口 ${missingOwnerOrDeadline.length} 条。`,
      nextAction: "补齐风险责任人、应对责任人、复核日期和行动 deadline。",
    },
    {
      id: "high-risk-escalation",
      title: "高风险必须有升级或明确应对策略",
      status: status(highRisks.every(risk => risk.responseStrategy?.trim() || risk.responseStrategyType === "上报"), highRisks.length <= 2),
      owner: "PMO",
      evidence: `高风险 ${highRisks.length} 条，治理升级候选 ${governanceEscalations} 条。`,
      nextAction: "对 P0/高风险发起风险升级治理流程或统一行动项。",
    },
    {
      id: "risk-evidence",
      title: "风险应对必须留下执行证据",
      status: status(evidenceGaps.length === 0, evidenceGaps.length <= 3),
      owner: "风险责任人",
      evidence: `证据缺口 ${evidenceGaps.length} 条。`,
      nextAction: "补充应对进展、触发条件变化、剩余风险和复核结论。",
    },
    {
      id: "risk-report-linkage",
      title: "风险影响必须进入报告工厂和项目健康判断",
      status: status((input.integration?.reportFacts.length ?? 0) > 0, openRisks.length > 0),
      owner: "PMO",
      evidence: `报告事实 ${input.integration?.reportFacts.length ?? reportFacts.length} 条。`,
      nextAction: "将高风险、逾期、回款/里程碑影响写入周报、月报和例外报告。",
    },
  ];

  const nextActions = [
    ...rules.filter(rule => rule.status !== "通过").map(rule => `${rule.title}：${rule.nextAction}`),
    ...ownerStats.filter(item => item.highRisks > 0 || item.overdueRisks > 0).slice(0, 4).map(item => `${item.owner}：关闭 ${item.highRisks} 条高风险和 ${item.overdueRisks} 条逾期风险。`),
  ].slice(0, 8);

  return {
    generatedAt: now.toISOString(),
    summary: {
      totalRisks: input.risks.length,
      openRisks: openRisks.length,
      highRisks: highRisks.length,
      overdueRisks: overdueRisks.length,
      missingOwnerOrDeadline: missingOwnerOrDeadline.length,
      governanceEscalations,
      evidenceGaps: evidenceGaps.length,
      reportFacts: reportFacts.length,
    },
    ownerStats,
    rules,
    reportFacts,
    nextActions,
    boundary: "组织级风险治理视图只生成治理规则、责任人统计、报告事实和下一步动作；不会自动关闭风险、删除风险或直接写回飞书主数据。",
  };
}
