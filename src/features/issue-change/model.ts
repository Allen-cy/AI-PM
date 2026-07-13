import type { Risk } from "@/lib/risk";

export type IssueSeverity = "high" | "medium" | "low";
export type IssueStatus = "open" | "analyzing" | "change-required" | "resolving" | "resolved" | "closed";
export type IssueAction = "analyze" | "require_change" | "resolve" | "close" | "reopen";

export type ChangeType = "scope" | "schedule" | "cost" | "quality" | "contract" | "collection" | "resource" | "other";
export type ChangeStatus = "proposed" | "analyzing" | "approved" | "rejected" | "implementing" | "implemented" | "closed";
export type ChangeAction = "analyze" | "approve" | "reject" | "implement" | "complete" | "close" | "reopen";

export type UnifiedActionSource = "risk" | "issue" | "change" | "governance" | "manual";
export type UnifiedActionStatus = "open" | "in_progress" | "done" | "cancelled" | "overdue";
export type UnifiedActionPriority = "P0" | "P1" | "P2";
export type IssueActionDataClass = "production" | "sample" | "test" | "diagnostic" | "unclassified";

export interface IssueRecord {
  id: string;
  orgId?: string | null;
  projectId?: string | null;
  dataClass?: IssueActionDataClass;
  issueCode?: string | null;
  projectName: string;
  sourceRiskId?: string | null;
  sourceRiskCode?: string | null;
  title: string;
  description?: string | null;
  severity: IssueSeverity;
  status: IssueStatus;
  owner?: string | null;
  dueDate?: string | null;
  impactScope?: string | null;
  evidence?: string | null;
  createdByName?: string | null;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  closedAt?: string | null;
}

export interface ChangeRecord {
  id: string;
  orgId?: string | null;
  projectId?: string | null;
  dataClass?: IssueActionDataClass;
  changeCode?: string | null;
  issueId?: string | null;
  projectName: string;
  title: string;
  reason?: string | null;
  changeType: ChangeType;
  impactScope?: string | null;
  impactCost?: number | null;
  impactScheduleDays?: number | null;
  impactRevenue?: number | null;
  impactCollection?: string | null;
  status: ChangeStatus;
  owner?: string | null;
  approver?: string | null;
  dueDate?: string | null;
  decisionSummary?: string | null;
  createdByName?: string | null;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  closedAt?: string | null;
}

export interface UnifiedActionRecord {
  id: string;
  orgId?: string | null;
  projectId?: string | null;
  dataClass?: IssueActionDataClass;
  sourceType: UnifiedActionSource;
  sourceId?: string | null;
  projectName?: string | null;
  title: string;
  owner?: string | null;
  dueDate?: string | null;
  status: UnifiedActionStatus;
  priority: UnifiedActionPriority;
  closeEvidence?: string | null;
  createdByName?: string | null;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  closedAt?: string | null;
}

export interface IssueChangeEventRecord {
  id: string;
  orgId?: string | null;
  projectId?: string | null;
  dataClass?: IssueActionDataClass;
  subjectType: "issue" | "change" | "action";
  subjectId: string;
  eventType: string;
  fromStatus?: string | null;
  toStatus?: string | null;
  actorName?: string | null;
  comment?: string | null;
  evidence?: string | null;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface UnifiedActionItemInput {
  title: string;
  owner?: string;
  dueDate?: string;
  priority?: UnifiedActionPriority;
}

export interface IssueCreateInput {
  projectName: string;
  title: string;
  description?: string;
  severity?: IssueSeverity;
  owner?: string;
  dueDate?: string;
  impactScope?: string;
  evidence?: string;
  sourceRiskId?: string;
  sourceRiskCode?: string;
  actionItems?: unknown;
  orgId?: string;
  projectId?: string;
  dataClass?: IssueActionDataClass;
}

export interface ChangeCreateInput {
  issueId?: string;
  projectName: string;
  title: string;
  reason?: string;
  changeType?: ChangeType;
  impactScope?: string;
  impactCost?: number;
  impactScheduleDays?: number;
  impactRevenue?: number;
  impactCollection?: string;
  owner?: string;
  approver?: string;
  dueDate?: string;
  actionItems?: unknown;
}

export interface UnifiedActionCreateInput {
  title: string;
  owner?: string;
  dueDate?: string;
  priority?: UnifiedActionPriority;
  projectName?: string;
  sourceType?: UnifiedActionSource;
  sourceId?: string;
  sourceReason?: string;
  orgId?: string;
  projectId?: string;
  dataClass?: IssueActionDataClass;
}

export const issueSeverityLabels: Record<IssueSeverity, string> = {
  high: "高",
  medium: "中",
  low: "低",
};

export const issueStatusLabels: Record<IssueStatus, string> = {
  open: "待处理",
  analyzing: "分析中",
  "change-required": "需变更",
  resolving: "解决中",
  resolved: "已解决",
  closed: "已关闭",
};

export const changeTypeLabels: Record<ChangeType, string> = {
  scope: "范围",
  schedule: "进度",
  cost: "成本",
  quality: "质量",
  contract: "合同",
  collection: "回款",
  resource: "资源",
  other: "其他",
};

export const changeStatusLabels: Record<ChangeStatus, string> = {
  proposed: "已提出",
  analyzing: "影响分析中",
  approved: "已批准",
  rejected: "已拒绝",
  implementing: "实施中",
  implemented: "已实施",
  closed: "已关闭",
};

export const unifiedActionStatusLabels: Record<UnifiedActionStatus, string> = {
  open: "待办",
  in_progress: "进行中",
  done: "已完成",
  cancelled: "已取消",
  overdue: "已逾期",
};

export function deriveIssueNextStatus(current: IssueStatus, action: IssueAction): IssueStatus {
  if (action === "reopen") return "open";
  if (action === "analyze") return "analyzing";
  if (action === "require_change") return "change-required";
  if (action === "resolve") return current === "change-required" ? "resolving" : "resolved";
  if (action === "close") return "closed";
  return current;
}

export function deriveChangeNextStatus(current: ChangeStatus, action: ChangeAction): ChangeStatus {
  if (action === "reopen") return "proposed";
  if (action === "analyze") return "analyzing";
  if (action === "approve") return "approved";
  if (action === "reject") return "rejected";
  if (action === "implement") return "implementing";
  if (action === "complete") return "implemented";
  if (action === "close") return "closed";
  return current;
}

export function isTerminalIssueStatus(status: IssueStatus): boolean {
  return status === "closed";
}

export function isTerminalChangeStatus(status: ChangeStatus): boolean {
  return status === "closed" || status === "rejected";
}

export function severityFromRisk(risk: Pick<Risk, "piScore" | "priorityScore">): IssueSeverity {
  if (risk.priorityScore >= 50 || risk.piScore >= 16) return "high";
  if (risk.piScore >= 6) return "medium";
  return "low";
}

export function riskToIssueDraft(risk: Risk): IssueCreateInput {
  return {
    projectName: risk.projectName,
    title: risk.description.slice(0, 80),
    description: [
      `来源风险：${risk.riskCode || risk.id}`,
      `风险描述：${risk.description}`,
      `影响领域：${risk.impactArea}`,
      `触发条件：${risk.trigger || "未填写"}`,
      `当前输出：${risk.currentOutput || "未填写"}`,
    ].join("\n"),
    severity: severityFromRisk(risk),
    owner: risk.actionOwner || risk.owner || "项目经理",
    dueDate: risk.actionDeadline || risk.dueDate || risk.nextReviewDate,
    impactScope: risk.impactArea,
    evidence: risk.evidence || `从风险登记册升级：${risk.riskCode || risk.id}`,
    sourceRiskId: risk.id,
    sourceRiskCode: risk.riskCode || risk.id,
    actionItems: [{
      title: "确认风险是否已经转化为实际问题，并补充影响范围、责任人和处理时限",
      owner: risk.actionOwner || risk.owner || "项目经理",
      dueDate: risk.actionDeadline || risk.dueDate || risk.nextReviewDate,
      priority: severityFromRisk(risk) === "high" ? "P0" : "P1",
    }],
  };
}

export function normalizeActionPriority(value: unknown): UnifiedActionPriority {
  return value === "P0" || value === "P2" ? value : "P1";
}

export function parseUnifiedActionItems(value: unknown, fallback?: UnifiedActionItemInput): UnifiedActionItemInput[] {
  const parsed = (() => {
    if (Array.isArray(value)) {
      return value.map(item => {
        if (typeof item === "string") return { title: item.trim() };
        if (typeof item === "object" && item !== null) {
          const record = item as Record<string, unknown>;
          return {
            title: String(record.title ?? "").trim(),
            owner: typeof record.owner === "string" ? record.owner.trim() : undefined,
            dueDate: typeof record.dueDate === "string" ? record.dueDate.trim() : undefined,
            priority: normalizeActionPriority(record.priority),
          };
        }
        return { title: "" };
      });
    }

    if (typeof value === "string") {
      return value
        .split(/\n+/)
        .map(line => line.trim())
        .filter(Boolean)
        .map(line => {
          const [title, owner, dueDate, priority] = line.split("|").map(part => part?.trim());
          return { title, owner, dueDate, priority: normalizeActionPriority(priority) };
        });
    }

    return [];
  })().filter(item => item.title);

  if (parsed.length > 0) return parsed;
  return fallback?.title ? [fallback] : [];
}

export function buildIssueChangeChainReport(input: {
  issues: IssueRecord[];
  changes: ChangeRecord[];
  actions: UnifiedActionRecord[];
  events: IssueChangeEventRecord[];
}): string {
  const { issues, changes, actions, events } = input;
  const issueRows = issues.length === 0
    ? "- 暂无问题记录"
    : issues.map(issue => `- [${issueStatusLabels[issue.status]}] ${issue.title}｜项目：${issue.projectName}｜严重度：${issueSeverityLabels[issue.severity]}｜责任人：${issue.owner || "未指定"}｜deadline：${issue.dueDate || "未设定"}｜来源风险：${issue.sourceRiskCode || "无"}`).join("\n");
  const changeRows = changes.length === 0
    ? "- 暂无变更记录"
    : changes.map(change => `- [${changeStatusLabels[change.status]}] ${change.title}｜项目：${change.projectName}｜类型：${changeTypeLabels[change.changeType]}｜成本影响：${change.impactCost ?? 0}｜进度影响：${change.impactScheduleDays ?? 0}天｜回款影响：${change.impactCollection || "未填写"}`).join("\n");
  const actionRows = actions.length === 0
    ? "- 暂无行动项"
    : actions.map(action => `- [${unifiedActionStatusLabels[action.status]}] ${action.priority}｜${action.title}｜责任人：${action.owner || "未指定"}｜deadline：${action.dueDate || "未设定"}｜证据：${action.closeEvidence || "待补充"}`).join("\n");
  const eventRows = events.length === 0
    ? "- 暂无审计事件"
    : events.map(event => `- ${event.createdAt}｜${event.actorName || "系统"}｜${event.subjectType}/${event.eventType}｜${event.fromStatus || "-"} → ${event.toStatus || "-"}｜${event.comment || event.evidence || "无备注"}`).join("\n");

  return [
    "# 风险-问题-变更-行动项链路报告",
    "",
    `- 问题数量：${issues.length}`,
    `- 变更数量：${changes.length}`,
    `- 未关闭行动项：${actions.filter(action => action.status !== "done" && action.status !== "cancelled").length}`,
    `- 生成时间：${new Date().toISOString()}`,
    "",
    "## 问题清单",
    issueRows,
    "",
    "## 变更清单",
    changeRows,
    "",
    "## 统一行动项",
    actionRows,
    "",
    "## 审计记录",
    eventRows,
    "",
  ].join("\n");
}
