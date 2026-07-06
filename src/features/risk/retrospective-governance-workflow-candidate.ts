import { governanceWorkflows } from "../pmo-operating-system.ts";
import type { RiskRetrospectiveGovernanceReminderLog } from "./retrospective-governance-operations.ts";

export type KnowledgeGovernanceWorkflowPriority = "high" | "medium" | "low";

export interface KnowledgeGovernanceWorkflowCandidate {
  workflowId: string;
  workflowName: string;
  projectName: string;
  title: string;
  triggerSummary: string;
  inputSummary: string;
  owner: string;
  approver: string;
  priority: KnowledgeGovernanceWorkflowPriority;
  deadline: string;
  actionItems: Array<{ title: string; owner: string; dueDate: string }>;
  sourceType: "risk_retrospective_governance_reminder";
  sourceId: string;
  sourceLinkId: string | null;
  sourceSummary: string;
  strategyVersion: string;
  strategyRuleId: string;
  strategySummary: string;
  boundary: string;
}

export interface KnowledgeGovernanceWorkflowCandidateOverride {
  workflowId?: string;
  projectName?: string;
  title?: string;
  owner?: string;
  approver?: string;
  priority?: KnowledgeGovernanceWorkflowPriority;
  deadline?: string;
  inputSummary?: string;
  actionItems?: Array<{ title?: string; owner?: string; dueDate?: string }>;
}

function priorityFromReminder(priority: RiskRetrospectiveGovernanceReminderLog["priority"]): KnowledgeGovernanceWorkflowPriority {
  if (priority === "P0") return "high";
  if (priority === "P2") return "low";
  return "medium";
}

function defaultDeadline(log: RiskRetrospectiveGovernanceReminderLog): string {
  if (log.dueDate && /^\d{4}-\d{2}-\d{2}$/.test(log.dueDate)) return log.dueDate;
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return tomorrow.toLocaleDateString("sv-SE", { timeZone: "Asia/Shanghai" });
}

function workflowName(workflowId: string): string {
  return governanceWorkflows.find(workflow => workflow.id === workflowId)?.name ?? "风险升级评审";
}

function validWorkflowId(workflowId: string | undefined): string {
  return governanceWorkflows.some(workflow => workflow.id === workflowId) ? workflowId! : "risk-escalation";
}

function normalizeActionItems(
  fallback: KnowledgeGovernanceWorkflowCandidate["actionItems"],
  override?: KnowledgeGovernanceWorkflowCandidateOverride["actionItems"],
): KnowledgeGovernanceWorkflowCandidate["actionItems"] {
  if (!Array.isArray(override) || override.length === 0) return fallback;
  const normalized = override
    .map(item => ({
      title: item.title?.trim() || "",
      owner: item.owner?.trim() || fallback[0]?.owner || "PMO",
      dueDate: item.dueDate?.trim() || fallback[0]?.dueDate || "",
    }))
    .filter(item => item.title);
  return normalized.length > 0 ? normalized : fallback;
}

export function buildKnowledgeGovernanceWorkflowCandidate(
  log: RiskRetrospectiveGovernanceReminderLog,
  override: KnowledgeGovernanceWorkflowCandidateOverride = {},
): KnowledgeGovernanceWorkflowCandidate {
  const workflowId = validWorkflowId(override.workflowId);
  const owner = override.owner?.trim() || log.ownerName || "风险责任人";
  const deadline = override.deadline?.trim() || defaultDeadline(log);
  const assetTitle = log.assetTitle || log.title;
  const defaultTitle = `[知识治理升级] ${assetTitle}`;
  const triggerSummary = `知识治理运营提醒已升级：${log.title}`;
  const sourceSummary = [
    `提醒日志：${log.id}`,
    `提醒类型：${log.reminderType}`,
    `来源待办：${log.sourceFollowupId || "未关联"}`,
    `资产：${assetTitle}`,
    `责任人：${log.ownerName || "未指定"}`,
    `处理动作：${log.actionRequired || "未记录"}`,
    `升级说明：${log.closureNote || "未填写"}`,
  ].join("\n");
  const defaultInputSummary = [
    "【知识治理升级输入】",
    `资产/事项：${assetTitle}`,
    `提醒标题：${log.title}`,
    `责任人：${log.ownerName || "未指定"}`,
    `Deadline：${deadline}`,
    `建议动作：${log.actionRequired || "补充二次治理动作、关闭证据和PMO复核结论。"}`,
    `升级说明：${log.closureNote || "未填写"}`,
    "输入边界：该流程由提醒日志人工确认后创建，不自动改写项目台账、风险登记册或飞书数据。",
  ].join("\n");
  const fallbackActions = [
    {
      title: `完成知识治理升级处理：${assetTitle}`,
      owner,
      dueDate: deadline,
    },
  ];

  return {
    workflowId,
    workflowName: workflowName(workflowId),
    projectName: override.projectName?.trim() || "风险复盘资产治理",
    title: override.title?.trim() || defaultTitle,
    triggerSummary,
    inputSummary: override.inputSummary?.trim() || defaultInputSummary,
    owner,
    approver: override.approver?.trim() || "PMO/项目负责人",
    priority: override.priority || priorityFromReminder(log.priority),
    deadline,
    actionItems: normalizeActionItems(fallbackActions, override.actionItems),
    sourceType: "risk_retrospective_governance_reminder",
    sourceId: log.id,
    sourceLinkId: log.sourceFollowupId,
    sourceSummary,
    strategyVersion: "knowledge-governance-v5.3.46",
    strategyRuleId: "knowledge-governance-escalation-to-workflow",
    strategySummary: "知识治理提醒已升级时，可由 PMO 人工确认转入风险升级评审或其他治理流程；创建流程前必须确认输入材料和责任人。",
    boundary: "候选流程只预填字段；正式创建必须由用户显式确认，系统不会静默创建治理流程实例。",
  };
}
