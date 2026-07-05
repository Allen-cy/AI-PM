import type {
  RiskRetrospectiveGovernanceFollowupFeishuSyncStatus,
  RiskRetrospectiveGovernanceFollowupRecord,
  RiskRetrospectiveGovernanceFollowupStatus,
} from "./retrospective-governance-followups.ts";
import type { RiskRetrospectiveGovernanceActionItemPriority } from "./retrospective-governance.ts";

export type { RiskRetrospectiveGovernanceFollowupRecord };

export interface RiskRetrospectiveGovernanceFollowupWorkbenchUser {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  role?: "admin" | "user";
}

export interface RiskRetrospectiveGovernanceFollowupWorkbenchItem {
  id: string;
  assetTitle: string;
  reason: string;
  actionRequired: string;
  ownerName: string;
  dueDate: string;
  daysLeft: number | null;
  priority: "P0" | "P1" | "P2";
  status: RiskRetrospectiveGovernanceFollowupStatus;
  closingCriteria: string;
  feishuSyncStatus: RiskRetrospectiveGovernanceFollowupFeishuSyncStatus;
  feishuTaskUrl: string | null;
  source: string;
  action: string;
  actionDraft: {
    title: string;
    owner: string;
    dueDate: string;
    priority: "P0" | "P1" | "P2";
    projectName: string;
    sourceType: "governance";
    sourceId: string;
    sourceReason: string;
  };
}

export interface RiskRetrospectiveGovernanceFollowupWorkbench {
  summary: {
    totalOpen: number;
    myPending: number;
    overdue: number;
    dueSoon: number;
    highPriority: number;
    waitingFeishuConfirmation: number;
  };
  workItems: RiskRetrospectiveGovernanceFollowupWorkbenchItem[];
  warning?: string;
  boundary: string;
}

export interface RiskRetrospectiveGovernanceFollowupClosureDashboard {
  summary: {
    total: number;
    open: number;
    closed: number;
    closureRate: number;
    closedWithEvidence: number;
    overdueOpen: number;
    highPriorityOpen: number;
    waitingFeishuConfirmation: number;
  };
  reportFacts: string[];
  recentClosed: Array<{
    id: string;
    assetTitle: string;
    ownerName: string;
    dueDate: string;
    closedAt: string | null;
    closureNote: string | null;
    reviewResult: string | null;
  }>;
  openWorkItems: RiskRetrospectiveGovernanceFollowupWorkbenchItem[];
  warning?: string;
  boundary: string;
}

export type RiskRetrospectiveGovernanceFollowupDueFilter = "all" | "overdue" | "due_soon" | "normal" | "waiting_acceptance" | "evidence_gap" | "closed_this_week";

export interface RiskRetrospectiveGovernanceFollowupOperationFilters {
  owner?: string;
  status?: RiskRetrospectiveGovernanceFollowupStatus | "all";
  priority?: RiskRetrospectiveGovernanceActionItemPriority | "all";
  feishuSyncStatus?: RiskRetrospectiveGovernanceFollowupFeishuSyncStatus | "all";
  due?: RiskRetrospectiveGovernanceFollowupDueFilter;
}

export interface RiskRetrospectiveGovernanceFollowupOperationItem {
  id: string;
  assetTitle: string;
  reason: string;
  ownerName: string;
  status: RiskRetrospectiveGovernanceFollowupStatus;
  priority: RiskRetrospectiveGovernanceActionItemPriority;
  priorityLabel: "P0" | "P1" | "P2";
  dueDate: string;
  daysLeft: number | null;
  dueState: "overdue" | "due_soon" | "normal" | "closed";
  feishuSyncStatus: RiskRetrospectiveGovernanceFollowupFeishuSyncStatus;
  actionRequired: string;
  closingCriteria: string;
  closureNote: string | null;
  reviewResult: string | null;
  closedAt: string | null;
  evidenceGap: boolean;
}

export interface RiskRetrospectiveGovernanceFollowupOwnerStat {
  ownerName: string;
  total: number;
  open: number;
  closed: number;
  overdue: number;
  highPriorityOpen: number;
  evidenceGaps: number;
}

export interface RiskRetrospectiveGovernanceFollowupWeeklyTrend {
  weekStart: string;
  weekLabel: string;
  created: number;
  closed: number;
  overdueOpen: number;
  closedWithEvidence: number;
  evidenceCompletenessRate: number;
}

export interface RiskRetrospectiveGovernanceFollowupReminderDraft {
  id: string;
  type: "overdue" | "waiting_acceptance" | "evidence_gap";
  priority: "P0" | "P1" | "P2";
  title: string;
  ownerName: string;
  dueDate: string;
  assetTitle: string;
  reason: string;
  actionRequired: string;
  confirmationRequired: true;
  feishuMessage: string;
}

export interface RiskRetrospectiveGovernanceFollowupFeishuReminderDraft {
  title: string;
  message: string;
  confirmationRequired: true;
  target: "feishu_message";
}

export interface RiskRetrospectiveGovernanceFollowupOperationReport {
  filters: RiskRetrospectiveGovernanceFollowupOperationFilters;
  summary: {
    total: number;
    filtered: number;
    open: number;
    inProgress: number;
    waitingAcceptance: number;
    closed: number;
    closedThisWeek: number;
    closureRate: number;
    closedWithEvidence: number;
    evidenceCompletenessRate: number;
    evidenceGaps: number;
    overdueOpen: number;
    dueSoonOpen: number;
    highPriorityOpen: number;
    waitingFeishuConfirmation: number;
  };
  ownerStats: RiskRetrospectiveGovernanceFollowupOwnerStat[];
  statusStats: Array<{ status: RiskRetrospectiveGovernanceFollowupStatus; count: number }>;
  priorityStats: Array<{ priority: RiskRetrospectiveGovernanceActionItemPriority; label: "P0" | "P1" | "P2"; count: number }>;
  feishuStats: Array<{ status: RiskRetrospectiveGovernanceFollowupFeishuSyncStatus; count: number }>;
  items: RiskRetrospectiveGovernanceFollowupOperationItem[];
  weeklyTrend: RiskRetrospectiveGovernanceFollowupWeeklyTrend[];
  reminderDrafts: RiskRetrospectiveGovernanceFollowupReminderDraft[];
  feishuReminderDraft: RiskRetrospectiveGovernanceFollowupFeishuReminderDraft | null;
  reportFacts: string[];
  reportMarkdown: string;
  warning?: string;
  boundary: string;
}

const PRIORITY_MAP: Record<RiskRetrospectiveGovernanceActionItemPriority, "P0" | "P1" | "P2"> = {
  high: "P0",
  medium: "P1",
  low: "P2",
};
const WORKBENCH_PRIORITY_SCORE: Record<"P0" | "P1" | "P2", number> = { P0: 3, P1: 2, P2: 1 };

function parseDateOnly(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00+08:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseDateTime(value: string | null | undefined): Date | null {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return parseDateOnly(value);
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function dateOnly(value: Date): string {
  return value.toLocaleDateString("sv-SE", { timeZone: "Asia/Shanghai" });
}

function addDays(value: Date, days: number): Date {
  const copy = new Date(value.getTime());
  copy.setDate(copy.getDate() + days);
  return copy;
}

function startOfWeekShanghai(value: Date): Date {
  const local = new Date(`${dateOnly(value)}T00:00:00+08:00`);
  const offset = (local.getDay() + 6) % 7;
  local.setDate(local.getDate() - offset);
  return local;
}

function daysLeft(value: string): number | null {
  const parsed = parseDateOnly(value);
  if (!parsed) return null;
  const now = new Date();
  const today = new Date(`${now.toLocaleDateString("sv-SE", { timeZone: "Asia/Shanghai" })}T00:00:00+08:00`);
  return Math.ceil((parsed.getTime() - today.getTime()) / 86_400_000);
}

function normalizeToken(value?: string | null): string {
  return (value ?? "").replace(/\s/g, "").toLowerCase();
}

function userTokens(user?: RiskRetrospectiveGovernanceFollowupWorkbenchUser | null): string[] {
  return [user?.name, user?.email, user?.phone]
    .map(normalizeToken)
    .filter(Boolean);
}

function followupMatchesUser(item: RiskRetrospectiveGovernanceFollowupRecord, user?: RiskRetrospectiveGovernanceFollowupWorkbenchUser | null): boolean {
  if (!user) return false;
  if (user.role === "admin") return true;
  const tokens = userTokens(user);
  if (tokens.length === 0) return false;
  const owner = normalizeToken(item.ownerName);
  const creator = normalizeToken(item.createdByName);
  return tokens.some(token => owner.includes(token) || creator.includes(token));
}

function mapWorkbenchPriority(priority: RiskRetrospectiveGovernanceActionItemPriority): "P0" | "P1" | "P2" {
  return PRIORITY_MAP[priority] ?? "P1";
}

function todayShanghai(): Date {
  const now = new Date();
  return new Date(`${now.toLocaleDateString("sv-SE", { timeZone: "Asia/Shanghai" })}T00:00:00+08:00`);
}

function dateWithinLastDays(value: string | null | undefined, days: number): boolean {
  if (!value) return false;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return false;
  const start = todayShanghai();
  start.setDate(start.getDate() - Math.max(0, days - 1));
  return parsed.getTime() >= start.getTime();
}

function closureRate(closed: number, total: number): number {
  return total > 0 ? Math.round((closed / total) * 1000) / 10 : 0;
}

function evidenceCompletenessRate(closedWithEvidence: number, closed: number): number {
  return closed > 0 ? Math.round((closedWithEvidence / closed) * 1000) / 10 : 0;
}

function ownerNameOf(item: RiskRetrospectiveGovernanceFollowupRecord): string {
  return item.ownerName || "PMO知识管理员";
}

function mapOperationItem(item: RiskRetrospectiveGovernanceFollowupRecord): RiskRetrospectiveGovernanceFollowupOperationItem {
  const left = daysLeft(item.dueDate);
  const isClosed = item.status === "已关闭";
  return {
    id: item.id,
    assetTitle: item.assetTitle,
    reason: item.reason,
    ownerName: ownerNameOf(item),
    status: item.status,
    priority: item.priority,
    priorityLabel: mapWorkbenchPriority(item.priority),
    dueDate: item.dueDate || "未设定",
    daysLeft: left,
    dueState: isClosed ? "closed" : left !== null && left < 0 ? "overdue" : left !== null && left <= 7 ? "due_soon" : "normal",
    feishuSyncStatus: item.feishuSyncStatus,
    actionRequired: item.actionRequired,
    closingCriteria: item.closingCriteria,
    closureNote: item.closureNote,
    reviewResult: item.reviewResult,
    closedAt: item.closedAt,
    evidenceGap: isClosed && !item.closureNote?.trim(),
  };
}

function matchesOperationFilters(item: RiskRetrospectiveGovernanceFollowupOperationItem, filters: RiskRetrospectiveGovernanceFollowupOperationFilters): boolean {
  const owner = filters.owner?.trim();
  if (owner && !normalizeToken(item.ownerName).includes(normalizeToken(owner))) return false;
  if (filters.status && filters.status !== "all" && item.status !== filters.status) return false;
  if (filters.priority && filters.priority !== "all" && item.priority !== filters.priority) return false;
  if (filters.feishuSyncStatus && filters.feishuSyncStatus !== "all" && item.feishuSyncStatus !== filters.feishuSyncStatus) return false;
  if (filters.due && filters.due !== "all") {
    if (filters.due === "overdue" && item.dueState !== "overdue") return false;
    if (filters.due === "due_soon" && item.dueState !== "due_soon") return false;
    if (filters.due === "normal" && item.dueState !== "normal") return false;
    if (filters.due === "waiting_acceptance" && item.status !== "待验收") return false;
    if (filters.due === "evidence_gap" && !item.evidenceGap) return false;
    if (filters.due === "closed_this_week" && !dateWithinLastDays(item.closedAt, 7)) return false;
  }
  return true;
}

function countBy<T extends string>(items: RiskRetrospectiveGovernanceFollowupOperationItem[], values: readonly T[], pick: (item: RiskRetrospectiveGovernanceFollowupOperationItem) => T): Array<{ value: T; count: number }> {
  return values.map(value => ({ value, count: items.filter(item => pick(item) === value).length }));
}

function markdownTable(rows: string[][]): string[] {
  if (rows.length === 0) return [];
  const [header, ...body] = rows;
  return [
    `| ${header.join(" |")} |`,
    `| ${header.map(() => "---").join(" |")} |`,
    ...body.map(row => `| ${row.map(cell => String(cell || "暂无").replace(/\|/g, "｜")).join(" |")} |`),
  ];
}

function buildWeeklyTrend(followups: RiskRetrospectiveGovernanceFollowupRecord[]): RiskRetrospectiveGovernanceFollowupWeeklyTrend[] {
  const currentWeekStart = startOfWeekShanghai(todayShanghai());
  return Array.from({ length: 6 }).map((_, index) => {
    const weekStart = addDays(currentWeekStart, (index - 5) * 7);
    const weekEnd = addDays(weekStart, 6);
    const weekStartTime = weekStart.getTime();
    const weekEndTime = addDays(weekEnd, 1).getTime();
    const created = followups.filter(item => {
      const parsed = parseDateTime(item.createdAt);
      return parsed ? parsed.getTime() >= weekStartTime && parsed.getTime() < weekEndTime : false;
    }).length;
    const closedItems = followups.filter(item => {
      const parsed = parseDateTime(item.closedAt);
      return parsed ? parsed.getTime() >= weekStartTime && parsed.getTime() < weekEndTime : false;
    });
    const overdueOpen = followups.filter(item => {
      if (item.status === "已关闭") return false;
      const due = parseDateOnly(item.dueDate);
      return due ? due.getTime() < addDays(weekEnd, 1).getTime() : false;
    }).length;
    const closedWithEvidence = closedItems.filter(item => Boolean(item.closureNote?.trim())).length;
    return {
      weekStart: dateOnly(weekStart),
      weekLabel: `${dateOnly(weekStart).slice(5)}~${dateOnly(weekEnd).slice(5)}`,
      created,
      closed: closedItems.length,
      overdueOpen,
      closedWithEvidence,
      evidenceCompletenessRate: evidenceCompletenessRate(closedWithEvidence, closedItems.length),
    };
  });
}

function reminderTypeLabel(type: RiskRetrospectiveGovernanceFollowupReminderDraft["type"]): string {
  if (type === "overdue") return "逾期提醒";
  if (type === "waiting_acceptance") return "待验收提醒";
  return "证据缺口提醒";
}

function buildReminderDraft(
  item: RiskRetrospectiveGovernanceFollowupOperationItem,
  type: RiskRetrospectiveGovernanceFollowupReminderDraft["type"],
): RiskRetrospectiveGovernanceFollowupReminderDraft {
  const priority: "P0" | "P1" | "P2" = type === "overdue" || item.priorityLabel === "P0" ? "P0" : "P1";
  const title = `[${reminderTypeLabel(type)}] ${item.assetTitle}`;
  const feishuMessage = [
    `【AI-PMO知识治理${reminderTypeLabel(type)}】${item.assetTitle}`,
    `责任人：${item.ownerName}`,
    `优先级：${priority}`,
    `状态：${item.status}`,
    `Deadline：${item.dueDate}`,
    `原因：${item.reason}`,
    `处理动作：${item.actionRequired}`,
    `关闭标准：${item.closingCriteria}`,
    "说明：该提醒由知识治理运营报表生成，发送前必须由用户显式确认。",
  ].join("\n");
  return {
    id: `${type}-${item.id}`,
    type,
    priority,
    title,
    ownerName: item.ownerName,
    dueDate: item.dueDate,
    assetTitle: item.assetTitle,
    reason: item.reason,
    actionRequired: item.actionRequired,
    confirmationRequired: true,
    feishuMessage,
  };
}

function buildReminderDrafts(items: RiskRetrospectiveGovernanceFollowupOperationItem[]): RiskRetrospectiveGovernanceFollowupReminderDraft[] {
  const overdue = items
    .filter(item => item.status !== "已关闭" && item.dueState === "overdue")
    .map(item => buildReminderDraft(item, "overdue"));
  const waitingAcceptance = items
    .filter(item => item.status === "待验收" && item.dueState !== "overdue")
    .map(item => buildReminderDraft(item, "waiting_acceptance"));
  const evidenceGaps = items
    .filter(item => item.evidenceGap)
    .map(item => buildReminderDraft(item, "evidence_gap"));
  return [...overdue, ...waitingAcceptance, ...evidenceGaps]
    .sort((a, b) => WORKBENCH_PRIORITY_SCORE[b.priority] - WORKBENCH_PRIORITY_SCORE[a.priority] || a.dueDate.localeCompare(b.dueDate))
    .slice(0, 20);
}

function buildFeishuReminderDraft(reportFacts: string[], reminderDrafts: RiskRetrospectiveGovernanceFollowupReminderDraft[]): RiskRetrospectiveGovernanceFollowupFeishuReminderDraft | null {
  if (reminderDrafts.length === 0) return null;
  const topReminders = reminderDrafts.slice(0, 5).map((item, index) => `${index + 1}. ${item.title}｜${item.ownerName}｜${item.dueDate}｜${item.actionRequired}`);
  return {
    title: "AI-PMO知识治理周运营提醒",
    message: [
      "【AI-PMO知识治理周运营提醒】",
      ...reportFacts,
      "",
      "需处理提醒：",
      ...topReminders,
      "",
      "请责任人在系统内补齐处理动作、关闭证据和验收结论。该消息由用户在系统中显式确认后发送。",
    ].join("\n"),
    confirmationRequired: true,
    target: "feishu_message",
  };
}

export function buildRiskRetrospectiveGovernanceFollowupWorkbench(input: {
  followups: RiskRetrospectiveGovernanceFollowupRecord[];
  user?: RiskRetrospectiveGovernanceFollowupWorkbenchUser | null;
  warning?: string;
}): RiskRetrospectiveGovernanceFollowupWorkbench {
  const openFollowups = input.followups.filter(item => item.status !== "已关闭");
  const scopedFollowups = input.user?.role === "admin"
    ? openFollowups
    : openFollowups.filter(item => followupMatchesUser(item, input.user));
  const workItems = scopedFollowups
    .map(item => {
      const left = daysLeft(item.dueDate);
      const priority = mapWorkbenchPriority(item.priority);
      return {
        id: item.id,
        assetTitle: item.assetTitle,
        reason: item.reason,
        actionRequired: item.actionRequired,
        ownerName: item.ownerName || "PMO知识管理员",
        dueDate: item.dueDate || "未设定",
        daysLeft: left,
        priority,
        status: item.status,
        closingCriteria: item.closingCriteria,
        feishuSyncStatus: item.feishuSyncStatus,
        feishuTaskUrl: item.feishuTaskUrl,
        source: "风险复盘资产二次治理待办",
        action: item.status === "待复核"
          ? "先复核低效果原因，确认是否需要补充编辑、合并、撤回或重新发布。"
          : item.status === "待验收"
            ? "复核关闭标准，确认质量分、RAG引用或重复风险是否已经改善。"
            : "推进二次治理动作，补齐证据并准备验收。",
        actionDraft: {
          title: `[知识治理] ${item.assetTitle}`,
          owner: item.ownerName || "PMO知识管理员",
          dueDate: item.dueDate,
          priority,
          projectName: "风险复盘资产治理",
          sourceType: "governance" as const,
          sourceId: `risk-retro-governance-followup-${item.id}`,
          sourceReason: [
            `来源：风险复盘资产二次治理待办 ${item.id}`,
            `原因：${item.reason}`,
            `处理动作：${item.actionRequired}`,
            `关闭标准：${item.closingCriteria}`,
          ].join("\n"),
        },
      };
    })
    .sort((a, b) => WORKBENCH_PRIORITY_SCORE[b.priority] - WORKBENCH_PRIORITY_SCORE[a.priority] || (a.daysLeft ?? 99) - (b.daysLeft ?? 99))
    .slice(0, 12);

  return {
    summary: {
      totalOpen: openFollowups.length,
      myPending: workItems.length,
      overdue: workItems.filter(item => item.daysLeft !== null && item.daysLeft < 0).length,
      dueSoon: workItems.filter(item => item.daysLeft !== null && item.daysLeft >= 0 && item.daysLeft <= 7).length,
      highPriority: workItems.filter(item => item.priority === "P0").length,
      waitingFeishuConfirmation: workItems.filter(item => item.feishuSyncStatus === "待确认").length,
    },
    workItems,
    warning: input.warning,
    boundary: "工作台只展示已保存的二次治理待办；运行时派生但未保存的待办仍需先在风险管理页点击“保存待办”。转统一行动项和写入飞书任务均需人工确认。",
  };
}

export function buildRiskRetrospectiveGovernanceFollowupClosureDashboard(input: {
  followups: RiskRetrospectiveGovernanceFollowupRecord[];
  user?: RiskRetrospectiveGovernanceFollowupWorkbenchUser | null;
  warning?: string;
}): RiskRetrospectiveGovernanceFollowupClosureDashboard {
  const workbench = buildRiskRetrospectiveGovernanceFollowupWorkbench({
    ...input,
    user: input.user ?? { role: "admin" },
  });
  const closedFollowups = input.followups.filter(item => item.status === "已关闭");
  const openFollowups = input.followups.filter(item => item.status !== "已关闭");
  const overdueOpen = openFollowups.filter(item => {
    const left = daysLeft(item.dueDate);
    return left !== null && left < 0;
  }).length;
  const highPriorityOpen = openFollowups.filter(item => mapWorkbenchPriority(item.priority) === "P0").length;
  const closureRate = input.followups.length > 0
    ? Math.round((closedFollowups.length / input.followups.length) * 1000) / 10
    : 0;
  const recentClosed = closedFollowups
    .slice()
    .sort((a, b) => String(b.closedAt || b.updatedAt).localeCompare(String(a.closedAt || a.updatedAt)))
    .slice(0, 6)
    .map(item => ({
      id: item.id,
      assetTitle: item.assetTitle,
      ownerName: item.ownerName || "PMO知识管理员",
      dueDate: item.dueDate,
      closedAt: item.closedAt,
      closureNote: item.closureNote,
      reviewResult: item.reviewResult,
    }));

  const reportFacts = [
    `知识治理待办闭环：共${input.followups.length}项，未关闭${openFollowups.length}项，已关闭${closedFollowups.length}项，关闭率${closureRate.toFixed(1)}%。`,
    `知识治理待办证据：已关闭${closedFollowups.length}项中${closedFollowups.filter(item => Boolean(item.closureNote?.trim())).length}项补充关闭证据。`,
    `知识治理待办风险：逾期未关闭${overdueOpen}项，P0未关闭${highPriorityOpen}项，飞书待确认${input.followups.filter(item => item.feishuSyncStatus === "待确认").length}项。`,
    ...recentClosed.slice(0, 3).map(item => `最近关闭：${item.assetTitle}，责任人${item.ownerName}，证据=${item.closureNote || "未填写"}。`),
  ];

  return {
    summary: {
      total: input.followups.length,
      open: openFollowups.length,
      closed: closedFollowups.length,
      closureRate,
      closedWithEvidence: closedFollowups.filter(item => Boolean(item.closureNote?.trim())).length,
      overdueOpen,
      highPriorityOpen,
      waitingFeishuConfirmation: input.followups.filter(item => item.feishuSyncStatus === "待确认").length,
    },
    reportFacts,
    recentClosed,
    openWorkItems: workbench.workItems,
    warning: input.warning,
    boundary: "知识治理待办闭环只统计已保存的风险复盘资产二次治理待办；关闭证据来自统一行动项或风险管理页人工填写，不自动替代PMO验收。",
  };
}

export function buildRiskRetrospectiveGovernanceFollowupOperationReport(input: {
  followups: RiskRetrospectiveGovernanceFollowupRecord[];
  filters?: RiskRetrospectiveGovernanceFollowupOperationFilters;
  warning?: string;
}): RiskRetrospectiveGovernanceFollowupOperationReport {
  const filters = input.filters ?? {};
  const allItems = input.followups.map(mapOperationItem);
  const filteredItems = allItems
    .filter(item => matchesOperationFilters(item, filters))
    .sort((a, b) => {
      const priorityDelta = WORKBENCH_PRIORITY_SCORE[b.priorityLabel] - WORKBENCH_PRIORITY_SCORE[a.priorityLabel];
      if (priorityDelta !== 0) return priorityDelta;
      return (a.daysLeft ?? 99) - (b.daysLeft ?? 99);
    });
  const open = allItems.filter(item => item.status !== "已关闭");
  const closed = allItems.filter(item => item.status === "已关闭");
  const closedWithEvidence = closed.filter(item => Boolean(item.closureNote?.trim())).length;
  const owners = Array.from(new Set(allItems.map(item => item.ownerName))).sort((a, b) => a.localeCompare(b, "zh-CN"));
  const ownerStats = owners.map(owner => {
    const owned = allItems.filter(item => item.ownerName === owner);
    return {
      ownerName: owner,
      total: owned.length,
      open: owned.filter(item => item.status !== "已关闭").length,
      closed: owned.filter(item => item.status === "已关闭").length,
      overdue: owned.filter(item => item.status !== "已关闭" && item.dueState === "overdue").length,
      highPriorityOpen: owned.filter(item => item.status !== "已关闭" && item.priorityLabel === "P0").length,
      evidenceGaps: owned.filter(item => item.evidenceGap).length,
    };
  }).sort((a, b) => b.overdue - a.overdue || b.highPriorityOpen - a.highPriorityOpen || b.open - a.open);
  const summary = {
    total: allItems.length,
    filtered: filteredItems.length,
    open: open.length,
    inProgress: allItems.filter(item => item.status === "处理中").length,
    waitingAcceptance: allItems.filter(item => item.status === "待验收").length,
    closed: closed.length,
    closedThisWeek: closed.filter(item => dateWithinLastDays(item.closedAt, 7)).length,
    closureRate: closureRate(closed.length, allItems.length),
    closedWithEvidence,
    evidenceCompletenessRate: evidenceCompletenessRate(closedWithEvidence, closed.length),
    evidenceGaps: allItems.filter(item => item.evidenceGap).length,
    overdueOpen: open.filter(item => item.dueState === "overdue").length,
    dueSoonOpen: open.filter(item => item.dueState === "due_soon").length,
    highPriorityOpen: open.filter(item => item.priorityLabel === "P0").length,
    waitingFeishuConfirmation: allItems.filter(item => item.feishuSyncStatus === "待确认").length,
  };
  const statusStats = countBy(allItems, ["待复核", "处理中", "待验收", "已关闭"] as const, item => item.status)
    .map(item => ({ status: item.value, count: item.count }));
  const priorityStats = countBy(allItems, ["high", "medium", "low"] as const, item => item.priority)
    .map(item => ({ priority: item.value, label: mapWorkbenchPriority(item.value), count: item.count }));
  const feishuStats = countBy(allItems, ["未同步", "待确认", "同步中", "已同步", "同步失败"] as const, item => item.feishuSyncStatus)
    .map(item => ({ status: item.value, count: item.count }));
  const weeklyTrend = buildWeeklyTrend(input.followups);
  const reminderDrafts = buildReminderDrafts(allItems);
  const lastWeek = weeklyTrend[weeklyTrend.length - 1];
  const reportFacts = [
    `知识治理周运营：已保存${summary.total}项，未关闭${summary.open}项，已关闭${summary.closed}项，关闭率${summary.closureRate.toFixed(1)}%。`,
    `知识治理责任追踪：逾期未关闭${summary.overdueOpen}项，7天内到期${summary.dueSoonOpen}项，P0未关闭${summary.highPriorityOpen}项。`,
    `知识治理证据质量：已关闭${summary.closed}项中${summary.closedWithEvidence}项有关闭证据，证据完整率${summary.evidenceCompletenessRate.toFixed(1)}%，证据缺口${summary.evidenceGaps}项。`,
    `知识治理飞书联动：待确认写入飞书任务${summary.waitingFeishuConfirmation}项。`,
    `知识治理趋势：本周新增${lastWeek?.created ?? 0}项、关闭${lastWeek?.closed ?? 0}项、周末口径逾期未关闭${lastWeek?.overdueOpen ?? 0}项。`,
    `知识治理提醒：已生成${reminderDrafts.length}条需人工确认的自动提醒草稿，其中P0 ${reminderDrafts.filter(item => item.priority === "P0").length}条。`,
  ];
  const feishuReminderDraft = buildFeishuReminderDraft(reportFacts, reminderDrafts);
  const reportMarkdown = [
    "# 知识治理待办周运营清单",
    "",
    `生成时间：${new Date().toISOString()}`,
    "",
    "## 一、运营摘要",
    "",
    ...reportFacts.map(item => `- ${item}`),
    "",
    "## 二、负责人追踪",
    "",
    ...markdownTable([["负责人", "总数", "未关闭", "已关闭", "逾期", "P0未关闭", "证据缺口"], ...ownerStats.map(item => [
      item.ownerName,
      String(item.total),
      String(item.open),
      String(item.closed),
      String(item.overdue),
      String(item.highPriorityOpen),
      String(item.evidenceGaps),
    ])]),
    "",
    "## 三、筛选后的待办清单",
    "",
    ...markdownTable([["优先级", "状态", "资产", "责任人", "Deadline", "飞书", "关闭证据"], ...filteredItems.slice(0, 80).map(item => [
      item.priorityLabel,
      item.status,
      item.assetTitle,
      item.ownerName,
      item.dueDate,
      item.feishuSyncStatus,
      item.closureNote || (item.evidenceGap ? "缺证据" : "未关闭"),
    ])]),
    "",
    "## 四、趋势与自动提醒草稿",
    "",
    ...markdownTable([["周", "新增", "关闭", "周末逾期未关闭", "有证据关闭", "证据完整率"], ...weeklyTrend.map(item => [
      item.weekLabel,
      String(item.created),
      String(item.closed),
      String(item.overdueOpen),
      String(item.closedWithEvidence),
      `${item.evidenceCompletenessRate.toFixed(1)}%`,
    ])]),
    "",
    ...markdownTable([["优先级", "类型", "标题", "责任人", "Deadline", "需确认"], ...reminderDrafts.slice(0, 20).map(item => [
      item.priority,
      reminderTypeLabel(item.type),
      item.title,
      item.ownerName,
      item.dueDate,
      item.confirmationRequired ? "是" : "否",
    ])]),
    "",
    "## 五、使用边界",
    "",
    "- 本清单只统计已保存的风险复盘资产二次治理待办。",
    "- 逾期、证据缺口和飞书待确认均用于 PMO 周运营，不自动改变业务主数据。",
    "- 自动提醒草稿必须由用户显式确认后才能发送到飞书，不自动外发。",
    "- 正式关闭仍应由责任人补充证据，并由 PMO 或授权角色复核。",
  ].join("\n");

  return {
    filters,
    summary,
    ownerStats,
    statusStats,
    priorityStats,
    feishuStats,
    items: filteredItems,
    weeklyTrend,
    reminderDrafts,
    feishuReminderDraft,
    reportFacts,
    reportMarkdown,
    warning: input.warning,
    boundary: "知识治理待办运营报表用于 PMO 周运营和责任追踪；筛选和导出只读，不自动写回风险、行动项或飞书任务。",
  };
}
