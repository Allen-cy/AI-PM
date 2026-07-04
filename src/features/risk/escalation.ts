import type { GovernanceCreateInput } from "../governance/repository.ts";
import type { UnifiedActionCreateInput, UnifiedActionPriority } from "../issue-change/model.ts";
import type { RiskIntegrationAction, RiskIntegrationDashboard, RiskIntegrationLink } from "./integration.ts";

export type RiskEscalationDraftType = "governance_workflow" | "unified_action";

export interface RiskEscalationDraftBase {
  id: string;
  type: RiskEscalationDraftType;
  riskLinkId: string;
  riskId: string;
  riskCode?: string;
  projectName: string;
  title: string;
  owner: string;
  deadline: string;
  priority: "P0" | "P1" | "P2";
  sourceReason: string;
  confirmationRequired: true;
  targetRoute: "/governance-workflows" | "/issue-change";
}

export interface RiskGovernanceEscalationDraft extends RiskEscalationDraftBase {
  type: "governance_workflow";
  workflowId: "risk-escalation";
  approver: string;
  createInput: GovernanceCreateInput;
}

export interface RiskUnifiedActionDraft extends RiskEscalationDraftBase {
  type: "unified_action";
  targetModule: RiskIntegrationAction["targetModule"];
  createInput: UnifiedActionCreateInput;
}

export interface RiskEscalationDraftDashboard {
  generatedAt: string;
  sourceIntegrationGeneratedAt: string;
  summary: {
    candidateRiskLinks: number;
    governanceDrafts: number;
    actionDrafts: number;
    highPriorityDrafts: number;
    pendingConfirmation: number;
  };
  governanceDrafts: RiskGovernanceEscalationDraft[];
  actionDrafts: RiskUnifiedActionDraft[];
  boundary: string;
}

function truncate(value: string, max = 36): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

function priorityFromSeverity(severity: RiskIntegrationLink["severity"]): GovernanceCreateInput["priority"] {
  if (severity === "高") return "high";
  if (severity === "中") return "medium";
  return "low";
}

function normalizePriority(value: RiskIntegrationAction["priority"]): UnifiedActionPriority {
  if (value === "P0" || value === "P2") return value;
  return "P1";
}

function needsEscalation(link: RiskIntegrationLink): boolean {
  return link.impactedTargets.includes("governance")
    || link.severity === "高"
    || link.actions.some(action => action.priority === "P0" || action.targetModule === "治理工作流");
}

function governanceInputSummary(link: RiskIntegrationLink): string {
  return [
    `来源：风险联动包 ${link.id}`,
    `风险编号：${link.riskCode || link.riskId}`,
    `风险描述：${link.riskDescription}`,
    `风险等级：${link.severity}`,
    `当前状态：${link.status}`,
    `影响对象：${link.impactedTargets.join("、")}`,
    `依赖依据：${link.dependencies.length > 0 ? link.dependencies.join("；") : "暂无项目台账依赖"}`,
    `报告事实：${link.reportFact}`,
  ].join("\n");
}

function actionRows(link: RiskIntegrationLink): string {
  return link.actions
    .slice(0, 5)
    .map(action => `${action.title} | ${action.owner} | ${action.dueDate}`)
    .join("\n");
}

function buildGovernanceDraft(link: RiskIntegrationLink): RiskGovernanceEscalationDraft {
  const title = `${link.projectName}-风险升级评审：${truncate(link.riskDescription)}`;
  const owner = link.owner === "未指定" ? "风险责任人" : link.owner;
  const createInput: GovernanceCreateInput = {
    workflowId: "risk-escalation",
    projectName: link.projectName,
    title,
    triggerSummary: `风险联动包判定需要升级：${link.riskDescription}`,
    inputSummary: governanceInputSummary(link),
    owner,
    approver: "PMO/项目负责人",
    priority: priorityFromSeverity(link.severity),
    deadline: link.deadline,
    actionItems: actionRows(link),
    strategyVersion: "RISK-ESCALATION-2026.07.04",
    strategyRuleId: "risk_linkage_governance_escalation",
    strategySummary: "由风险联动包触发，确认前只生成治理流程草稿，用户确认后才创建流程实例。",
    sourceType: "risk_integration",
    sourceId: link.riskId,
    sourceLinkId: link.id,
    sourceSummary: link.reportFact,
  };

  return {
    id: `${link.id}-governance-draft`,
    type: "governance_workflow",
    riskLinkId: link.id,
    riskId: link.riskId,
    riskCode: link.riskCode,
    projectName: link.projectName,
    title,
    owner,
    approver: "PMO/项目负责人",
    deadline: link.deadline,
    priority: link.severity === "高" ? "P0" : link.severity === "中" ? "P1" : "P2",
    sourceReason: "高风险、上报策略或项目健康/回款/里程碑影响超过项目经理授权容差。",
    confirmationRequired: true,
    targetRoute: "/governance-workflows",
    workflowId: "risk-escalation",
    createInput,
  };
}

function buildActionDrafts(link: RiskIntegrationLink, actionsPerRisk: number): RiskUnifiedActionDraft[] {
  const sourceActions = link.actions
    .filter(action => action.targetModule !== "治理工作流")
    .filter(action => action.priority === "P0" || action.priority === "P1");
  const selected = (sourceActions.length > 0 ? sourceActions : link.actions.filter(action => action.targetModule !== "治理工作流")).slice(0, actionsPerRisk);

  return selected.map(action => {
    const sourceReason = `${action.sourceReason}；来源风险联动包：${link.riskDescription}`;
    const createInput: UnifiedActionCreateInput = {
      title: action.title,
      owner: action.owner,
      dueDate: action.dueDate,
      priority: normalizePriority(action.priority),
      projectName: link.projectName,
      sourceType: "risk",
      sourceId: link.riskId,
      sourceReason,
    };
    return {
      id: `${link.id}-${action.id}-action-draft`,
      type: "unified_action",
      riskLinkId: link.id,
      riskId: link.riskId,
      riskCode: link.riskCode,
      projectName: link.projectName,
      title: action.title,
      owner: action.owner,
      deadline: action.dueDate,
      priority: action.priority,
      sourceReason,
      confirmationRequired: true,
      targetRoute: "/issue-change",
      targetModule: action.targetModule,
      createInput,
    };
  });
}

export function buildRiskEscalationDraftDashboard(input: {
  riskIntegration: RiskIntegrationDashboard;
  limit?: number;
  actionsPerRisk?: number;
}): RiskEscalationDraftDashboard {
  const limit = input.limit ?? 12;
  const actionsPerRisk = input.actionsPerRisk ?? 2;
  const candidateLinks = input.riskIntegration.links
    .filter(needsEscalation)
    .slice(0, limit);
  const governanceDrafts = candidateLinks
    .filter(link => link.impactedTargets.includes("governance") || link.severity === "高")
    .map(buildGovernanceDraft);
  const actionDrafts = candidateLinks.flatMap(link => buildActionDrafts(link, actionsPerRisk)).slice(0, limit * actionsPerRisk);
  const allDrafts = [...governanceDrafts, ...actionDrafts];

  return {
    generatedAt: new Date().toISOString(),
    sourceIntegrationGeneratedAt: input.riskIntegration.generatedAt,
    summary: {
      candidateRiskLinks: candidateLinks.length,
      governanceDrafts: governanceDrafts.length,
      actionDrafts: actionDrafts.length,
      highPriorityDrafts: allDrafts.filter(draft => draft.priority === "P0").length,
      pendingConfirmation: allDrafts.length,
    },
    governanceDrafts,
    actionDrafts,
    boundary: "风险升级草稿只做创建建议；用户点击确认前不写 Supabase、不写飞书、不改变风险或项目主数据。确认后复用现有治理流程和统一行动项表，并保留审计日志。",
  };
}
