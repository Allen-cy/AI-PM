import type { RiskRetrospectiveGovernanceFollowupReminderDraft } from "./retrospective-governance-followup-workbench.ts";

export type RiskRetrospectiveGovernanceReminderAnalyticsStatus = "draft" | "sent" | "processed" | "ignored" | "escalated" | "failed";

export interface RiskRetrospectiveGovernanceReminderAnalyticsLog {
  id: string;
  originalReminderId: string | null;
  status: RiskRetrospectiveGovernanceReminderAnalyticsStatus;
  ownerName: string | null;
  createdAt: string;
}

export interface RiskRetrospectiveGovernanceOperationAnalyticsSnapshot {
  snapshotDate: string;
  open: number;
  overdueOpen: number;
  reminderCount: number;
  evidenceCompletenessRate: number;
}

export interface RiskRetrospectiveGovernanceReminderSuppressionResult {
  reminders: RiskRetrospectiveGovernanceFollowupReminderDraft[];
  suppressedReminders: RiskRetrospectiveGovernanceFollowupReminderDraft[];
  suppressedReminderIds: string[];
  summary: {
    total: number;
    sendable: number;
    suppressedThisWeek: number;
  };
  boundary: string;
}

export interface RiskRetrospectiveGovernanceOperationHistorySummary {
  summary: {
    snapshotCount: number;
    latestSnapshotDate: string | null;
    latestOpen: number;
    latestOverdueOpen: number;
    latestReminderCount: number;
    sentReminderLogs: number;
    closedReminderLogs: number;
    processedReminderLogs: number;
    ignoredReminderLogs: number;
    escalatedReminderLogs: number;
    handlingRate: number;
  };
  snapshotTrend: Array<{
    snapshotDate: string;
    open: number;
    overdueOpen: number;
    reminderCount: number;
    evidenceCompletenessRate: number;
  }>;
  reminderStatusStats: Array<{ status: RiskRetrospectiveGovernanceReminderAnalyticsStatus; label: string; count: number }>;
  reminderOwnerStats: Array<{ ownerName: string; sent: number; closed: number; escalated: number }>;
  warning?: string;
  boundary: string;
}

function dateToShanghaiTime(value: string | null | undefined): number | null {
  if (!value) return null;
  const dateOnlyValue = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00+08:00` : value;
  const parsed = new Date(dateOnlyValue);
  return Number.isNaN(parsed.getTime()) ? null : parsed.getTime();
}

function reminderStatusLabel(status: RiskRetrospectiveGovernanceReminderAnalyticsStatus): string {
  if (status === "draft") return "草稿";
  if (status === "sent") return "已发送";
  if (status === "processed") return "已处理";
  if (status === "ignored") return "无需处理";
  if (status === "escalated") return "已升级";
  return "发送失败";
}

function rate(part: number, total: number): number {
  return total > 0 ? Math.round((part / total) * 1000) / 10 : 0;
}

export function suppressRiskRetrospectiveGovernanceReminderDraftsForWeek(input: {
  reminders: RiskRetrospectiveGovernanceFollowupReminderDraft[];
  reminderLogs: RiskRetrospectiveGovernanceReminderAnalyticsLog[];
  weekStart: string;
}): RiskRetrospectiveGovernanceReminderSuppressionResult {
  const weekStartTime = dateToShanghaiTime(input.weekStart) ?? 0;
  const suppressingStatuses: RiskRetrospectiveGovernanceReminderAnalyticsStatus[] = ["sent", "processed", "ignored", "escalated"];
  const suppressedIds = new Set(
    input.reminderLogs
      .filter(log => suppressingStatuses.includes(log.status))
      .filter(log => (dateToShanghaiTime(log.createdAt) ?? 0) >= weekStartTime)
      .map(log => log.originalReminderId)
      .filter((value): value is string => Boolean(value)),
  );
  const reminders = input.reminders.filter(reminder => !suppressedIds.has(reminder.id));
  const suppressedReminders = input.reminders.filter(reminder => suppressedIds.has(reminder.id));
  return {
    reminders,
    suppressedReminders,
    suppressedReminderIds: suppressedReminders.map(reminder => reminder.id),
    summary: {
      total: input.reminders.length,
      sendable: reminders.length,
      suppressedThisWeek: suppressedReminders.length,
    },
    boundary: "同一知识治理提醒在同一周内已发送、已处理、无需处理或已升级后，不再重复外发；发送失败的提醒允许再次发送。",
  };
}

export function buildRiskRetrospectiveGovernanceOperationHistorySummary(input: {
  snapshots: RiskRetrospectiveGovernanceOperationAnalyticsSnapshot[];
  reminderLogs: RiskRetrospectiveGovernanceReminderAnalyticsLog[];
  warning?: string;
}): RiskRetrospectiveGovernanceOperationHistorySummary {
  const snapshotsDesc = input.snapshots.slice().sort((a, b) => b.snapshotDate.localeCompare(a.snapshotDate));
  const latest = snapshotsDesc[0];
  const sentLogs = input.reminderLogs.filter(log => log.status === "sent");
  const processedLogs = input.reminderLogs.filter(log => log.status === "processed");
  const ignoredLogs = input.reminderLogs.filter(log => log.status === "ignored");
  const escalatedLogs = input.reminderLogs.filter(log => log.status === "escalated");
  const closedLogs = [...processedLogs, ...ignoredLogs, ...escalatedLogs];
  const statusValues: RiskRetrospectiveGovernanceReminderAnalyticsStatus[] = ["sent", "processed", "ignored", "escalated", "failed"];
  const owners = Array.from(new Set(input.reminderLogs.map(log => log.ownerName || "未指定责任人"))).sort((a, b) => a.localeCompare(b, "zh-CN"));

  return {
    summary: {
      snapshotCount: input.snapshots.length,
      latestSnapshotDate: latest?.snapshotDate ?? null,
      latestOpen: latest?.open ?? 0,
      latestOverdueOpen: latest?.overdueOpen ?? 0,
      latestReminderCount: latest?.reminderCount ?? 0,
      sentReminderLogs: sentLogs.length,
      closedReminderLogs: closedLogs.length,
      processedReminderLogs: processedLogs.length,
      ignoredReminderLogs: ignoredLogs.length,
      escalatedReminderLogs: escalatedLogs.length,
      handlingRate: rate(closedLogs.length, sentLogs.length + closedLogs.length),
    },
    snapshotTrend: snapshotsDesc
      .slice(0, 8)
      .reverse()
      .map(snapshot => ({
        snapshotDate: snapshot.snapshotDate,
        open: snapshot.open,
        overdueOpen: snapshot.overdueOpen,
        reminderCount: snapshot.reminderCount,
        evidenceCompletenessRate: snapshot.evidenceCompletenessRate,
      })),
    reminderStatusStats: statusValues.map(status => ({
      status,
      label: reminderStatusLabel(status),
      count: input.reminderLogs.filter(log => log.status === status).length,
    })),
    reminderOwnerStats: owners.map(ownerName => {
      const owned = input.reminderLogs.filter(log => (log.ownerName || "未指定责任人") === ownerName);
      return {
        ownerName,
        sent: owned.filter(log => log.status === "sent").length,
        closed: owned.filter(log => log.status === "processed" || log.status === "ignored" || log.status === "escalated").length,
        escalated: owned.filter(log => log.status === "escalated").length,
      };
    }).sort((a, b) => b.escalated - a.escalated || b.closed - a.closed || b.sent - a.sent).slice(0, 6),
    warning: input.warning,
    boundary: "PMO治理中心的知识治理运营趋势来自已持久化快照和提醒日志；它用于管理追踪，不自动改写项目、风险或飞书数据。",
  };
}
