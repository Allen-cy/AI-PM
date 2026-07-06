import { governanceWorkflows } from "../pmo-operating-system.ts";

export type GovernanceAction = "submit" | "approve" | "conditional_approve" | "reject" | "return" | "close";

export interface GovernanceActionItemInput {
  title: string;
  owner?: string;
  dueDate?: string;
}

export interface GovernanceInstanceRecord {
  id: string;
  workflowId: string;
  workflowName: string;
  stage: string;
  projectId?: string | null;
  projectName: string;
  title: string;
  triggerSummary?: string | null;
  inputSummary?: string | null;
  outputSummary?: string | null;
  owner: string;
  approver: string;
  state: string;
  priority: "high" | "medium" | "low";
  deadline?: string | null;
  source: string;
  feishuRecordId?: string | null;
  createdByName?: string | null;
  metadata?: Record<string, unknown>;
  sourceType?: string | null;
  sourceId?: string | null;
  sourceLinkId?: string | null;
  sourceSummary?: string | null;
  createdAt: string;
  updatedAt: string;
  closedAt?: string | null;
}

export interface GovernanceEventRecord {
  id: string;
  instanceId: string;
  eventType: string;
  fromState?: string | null;
  toState: string;
  comment?: string | null;
  actorName?: string | null;
  actorRole?: string | null;
  decision?: string | null;
  outputs?: Record<string, unknown>;
  createdAt: string;
}

export interface GovernanceActionRecord {
  id: string;
  instanceId: string;
  title: string;
  owner?: string | null;
  dueDate?: string | null;
  status: "open" | "done" | "cancelled" | "overdue";
  closeEvidence?: string | null;
  createdAt: string;
  updatedAt: string;
}

export function workflowById(workflowId: string) {
  return governanceWorkflows.find(workflow => workflow.id === workflowId) ?? null;
}

export function initialGovernanceState(workflowId: string): string {
  return workflowById(workflowId)?.states[0] ?? "待提交";
}

export function isTerminalGovernanceState(state: string): boolean {
  return ["已通过", "已驳回", "暂停", "已批准", "已拒绝", "已实施", "已关闭", "已验收", "已归档"].includes(state);
}

export function deriveGovernanceNextState(workflowId: string, currentState: string, action: GovernanceAction): string {
  const workflow = workflowById(workflowId);
  const states = workflow?.states ?? ["待提交", "待评审", "需补充", "已通过", "已驳回"];
  const currentIndex = Math.max(0, states.indexOf(currentState));

  if (action === "submit") {
    return states[Math.min(currentIndex + 1, states.length - 1)] ?? currentState;
  }

  if (action === "return") {
    if (states.includes("需补充")) return "需补充";
    if (states.includes("需整改")) return "需整改";
    if (states.includes("影响分析中")) return "影响分析中";
    if (states.includes("应对中")) return "应对中";
    return states[Math.max(0, currentIndex - 1)] ?? currentState;
  }

  if (action === "reject") {
    if (states.includes("已驳回")) return "已驳回";
    if (states.includes("已拒绝")) return "已拒绝";
    if (states.includes("暂停")) return "暂停";
    return states[states.length - 1] ?? currentState;
  }

  if (action === "conditional_approve") {
    if (states.includes("有条件通过")) return "有条件通过";
    if (states.includes("需补充")) return "需补充";
    if (states.includes("需整改")) return "需整改";
    return deriveGovernanceNextState(workflowId, currentState, "approve");
  }

  if (action === "approve") {
    if (workflowId === "change-control" && states.includes("已批准")) return "已批准";
    if (workflowId === "risk-escalation" && states.includes("已升级")) return "已升级";
    if (workflowId === "project-closure" && states.includes("已验收")) return "已验收";
    if (states.includes("已通过")) return "已通过";
    return states[Math.min(currentIndex + 1, states.length - 1)] ?? currentState;
  }

  if (action === "close") {
    if (workflowId === "change-control" && states.includes("已实施")) return "已实施";
    if (workflowId === "project-closure" && states.includes("已归档")) return "已归档";
    if (states.includes("已关闭")) return "已关闭";
    return states[states.length - 1] ?? currentState;
  }

  return currentState;
}

export function parseGovernanceActionItems(value: unknown): GovernanceActionItemInput[] {
  if (Array.isArray(value)) {
    return value
      .map(item => {
        if (typeof item === "string") return { title: item.trim() };
        if (typeof item === "object" && item !== null) {
          const record = item as Record<string, unknown>;
          return {
            title: String(record.title ?? "").trim(),
            owner: typeof record.owner === "string" ? record.owner.trim() : undefined,
            dueDate: typeof record.dueDate === "string" ? record.dueDate.trim() : undefined,
          };
        }
        return { title: "" };
      })
      .filter(item => item.title);
  }

  if (typeof value !== "string") return [];
  return value
    .split(/\n+/)
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      const [title, owner, dueDate] = line.split("|").map(part => part?.trim());
      return { title, owner, dueDate };
    })
    .filter(item => item.title);
}

export function buildGovernanceReport(input: {
  instance: GovernanceInstanceRecord;
  events: GovernanceEventRecord[];
  actions: GovernanceActionRecord[];
  businessImpact?: {
    summary: string;
    nextAction: string;
    writebackMode: string;
    updates: Array<{
      targetType: string;
      targetName: string;
      field: string;
      suggestedValue: string;
      reason: string;
      requiresConfirmation: boolean;
    }>;
    reportFacts: string[];
  };
}): string {
  const { instance, events, actions, businessImpact } = input;
  const eventRows = events.length === 0
    ? "- 暂无审计事件"
    : events.map(event => `- ${event.createdAt}｜${event.actorName || "系统"}｜${event.eventType}｜${event.fromState || "-"} → ${event.toState}｜${event.comment || event.decision || "无备注"}`).join("\n");
  const actionRows = actions.length === 0
    ? "- 暂无行动项"
    : actions.map(action => `- [${action.status}] ${action.title}｜责任人：${action.owner || "未指定"}｜deadline：${action.dueDate || "未设定"}｜证据：${action.closeEvidence || "待补充"}`).join("\n");
  const impactRows = businessImpact
    ? [
      `- 联动结论：${businessImpact.summary}`,
      `- 写回模式：${businessImpact.writebackMode === "manual_confirmation_required" ? "需人工确认" : "仅审计记录"}`,
      `- 下一步：${businessImpact.nextAction}`,
      ...(businessImpact.updates.length > 0
        ? businessImpact.updates.map(update => `- 写回建议：${update.targetType === "risk" ? "风险" : "项目"}｜${update.targetName}｜${update.field} → ${update.suggestedValue}｜依据：${update.reason}｜${update.requiresConfirmation ? "需确认" : "可自动"}`)
        : ["- 暂无项目/风险写回建议"]),
    ].join("\n")
    : "- 暂无业务联动建议";

  return [
    `# ${instance.workflowName}治理流程输出`,
    "",
    `- 流程标题：${instance.title}`,
    `- 项目名称：${instance.projectName}`,
    `- 当前状态：${instance.state}`,
    `- 责任人：${instance.owner}`,
    `- 审批/确认人：${instance.approver}`,
    `- 优先级：${instance.priority}`,
    `- 截止日期：${instance.deadline || "未设定"}`,
    `- 创建人：${instance.createdByName || "系统"}`,
    `- 创建时间：${instance.createdAt}`,
    "",
    "## 触发条件",
    instance.triggerSummary || "未填写",
    "",
    "## 输入材料",
    instance.inputSummary || "未填写",
    "",
    "## 输出成果",
    instance.outputSummary || "待审批或待补充",
    "",
    "## 业务联动建议",
    impactRows,
    "",
    "## 行动项",
    actionRows,
    "",
    "## 审计记录",
    eventRows,
    "",
  ].join("\n");
}
