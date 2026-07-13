import { createHash } from "node:crypto";
import { getAuthSupabase, isAuthStorageConfigured, type AppUser } from "../auth/server.ts";
import type {
  RiskRetrospectiveGovernanceFollowupOperationReport,
  RiskRetrospectiveGovernanceFollowupReminderDraft,
} from "./retrospective-governance-followup-workbench.ts";
import { maskFeishuReceiveId, reminderLogKey } from "./retrospective-governance-operation-utils.ts";
import { resolveRequestedRiskProjectIds, type RiskDataScope } from "./scope.ts";

export type RiskRetrospectiveGovernanceReminderLogStatus = "draft" | "sent" | "processed" | "ignored" | "escalated" | "failed";
export type RiskRetrospectiveGovernanceReminderLogType = RiskRetrospectiveGovernanceFollowupReminderDraft["type"] | "weekly_summary";

export interface RiskRetrospectiveGovernanceOperationSnapshot {
  id: string;
  projectId: string;
  snapshotDate: string;
  snapshotWeekStart: string;
  total: number;
  open: number;
  closed: number;
  overdueOpen: number;
  dueSoonOpen: number;
  waitingAcceptance: number;
  evidenceGaps: number;
  reminderCount: number;
  p0ReminderCount: number;
  evidenceCompletenessRate: number;
  reportFacts: string[];
  reportMarkdownSha256: string | null;
  createdByName: string | null;
  requestId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RiskRetrospectiveGovernanceReminderLog {
  id: string;
  projectId?: string | null;
  reminderKey: string;
  reminderType: RiskRetrospectiveGovernanceReminderLogType;
  originalReminderId: string | null;
  sourceFollowupId: string | null;
  priority: "P0" | "P1" | "P2";
  title: string;
  assetTitle: string | null;
  ownerName: string | null;
  dueDate: string | null;
  actionRequired: string | null;
  status: RiskRetrospectiveGovernanceReminderLogStatus;
  feishuMessageId: string | null;
  feishuReceiveIdType: "chat_id" | "open_id" | null;
  feishuReceiveIdMasked: string | null;
  sentAt: string | null;
  closedAt: string | null;
  closureNote: string | null;
  error: string | null;
  createdByName: string | null;
  requestId: string | null;
  createdAt: string;
  updatedAt: string;
}

export type RiskRetrospectiveGovernanceOperationPersistResult =
  | { status: "succeeded"; snapshot: RiskRetrospectiveGovernanceOperationSnapshot }
  | { status: "skipped"; warning: string }
  | { status: "failed"; warning: string };

export type RiskRetrospectiveGovernanceReminderPersistResult =
  | { status: "succeeded"; logs: RiskRetrospectiveGovernanceReminderLog[] }
  | { status: "skipped"; warning: string }
  | { status: "failed"; warning: string };

export type RiskRetrospectiveGovernanceOperationHistoryResult =
  | { status: "succeeded"; snapshots: RiskRetrospectiveGovernanceOperationSnapshot[]; reminderLogs: RiskRetrospectiveGovernanceReminderLog[] }
  | { status: "not_configured"; snapshots: RiskRetrospectiveGovernanceOperationSnapshot[]; reminderLogs: RiskRetrospectiveGovernanceReminderLog[]; warning: string }
  | { status: "failed"; snapshots: RiskRetrospectiveGovernanceOperationSnapshot[]; reminderLogs: RiskRetrospectiveGovernanceReminderLog[]; warning: string };

export type RiskRetrospectiveGovernanceReminderUpdateResult =
  | { status: "succeeded"; log: RiskRetrospectiveGovernanceReminderLog }
  | { status: "not_configured"; warning: string }
  | { status: "not_found"; warning: string }
  | { status: "failed"; warning: string };

export type RiskRetrospectiveGovernanceReminderGetResult =
  | { status: "succeeded"; log: RiskRetrospectiveGovernanceReminderLog }
  | { status: "not_configured"; warning: string }
  | { status: "not_found"; warning: string }
  | { status: "failed"; warning: string };

const SQL_FILE = "supabase-v5344-risk-retrospective-governance-operations.sql";
const SNAPSHOT_TABLE = "risk_retrospective_governance_operation_snapshots";
const REMINDER_LOG_TABLE = "risk_retrospective_governance_reminder_logs";

function actorName(user: AppUser | null): string | null {
  return user?.name || user?.email || user?.phone || null;
}

function isMissingOperationTableError(message?: string): boolean {
  const normalized = (message ?? "").toLowerCase();
  return (
    normalized.includes(SNAPSHOT_TABLE)
    || normalized.includes(REMINDER_LOG_TABLE)
  ) && (
    normalized.includes("does not exist")
    || normalized.includes("relation")
    || normalized.includes("schema cache")
    || normalized.includes("could not find")
  );
}

function sqlWarning(message?: string): string {
  return isMissingOperationTableError(message)
    ? `知识治理运营历史 SQL 未执行：请在 Supabase SQL Editor 执行 ${SQL_FILE}。`
    : message || "知识治理运营历史处理失败。";
}

function sha256(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

function dateOnly(value = new Date()): string {
  return value.toLocaleDateString("sv-SE", { timeZone: "Asia/Shanghai" });
}

function weekStartFromTrend(report: RiskRetrospectiveGovernanceFollowupOperationReport): string {
  return report.weeklyTrend[report.weeklyTrend.length - 1]?.weekStart ?? dateOnly();
}

function mapSnapshot(row: Record<string, unknown>): RiskRetrospectiveGovernanceOperationSnapshot {
  return {
    id: String(row.id),
    projectId: String(row.project_id ?? ""),
    snapshotDate: String(row.snapshot_date ?? ""),
    snapshotWeekStart: String(row.snapshot_week_start ?? ""),
    total: Number(row.total_count ?? 0),
    open: Number(row.open_count ?? 0),
    closed: Number(row.closed_count ?? 0),
    overdueOpen: Number(row.overdue_open_count ?? 0),
    dueSoonOpen: Number(row.due_soon_open_count ?? 0),
    waitingAcceptance: Number(row.waiting_acceptance_count ?? 0),
    evidenceGaps: Number(row.evidence_gap_count ?? 0),
    reminderCount: Number(row.reminder_count ?? 0),
    p0ReminderCount: Number(row.p0_reminder_count ?? 0),
    evidenceCompletenessRate: Number(row.evidence_completeness_rate ?? 0),
    reportFacts: Array.isArray(row.report_facts) ? row.report_facts.map(String) : [],
    reportMarkdownSha256: typeof row.report_markdown_sha256 === "string" ? row.report_markdown_sha256 : null,
    createdByName: typeof row.created_by_name === "string" ? row.created_by_name : null,
    requestId: typeof row.request_id === "string" ? row.request_id : null,
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
  };
}

function mapReminderLog(row: Record<string, unknown>): RiskRetrospectiveGovernanceReminderLog {
  const metadata = typeof row.metadata === "object" && row.metadata !== null ? row.metadata as Record<string, unknown> : {};
  const originalReminderId = typeof metadata.original_reminder_id === "string"
    ? metadata.original_reminder_id
    : originalReminderIdFromReminderKey(String(row.reminder_key ?? ""));
  const reminderType = String(row.reminder_type ?? "weekly_summary") as RiskRetrospectiveGovernanceReminderLogType;
  return {
    id: String(row.id),
    projectId: typeof row.project_id === "string" ? row.project_id : null,
    reminderKey: String(row.reminder_key ?? ""),
    reminderType,
    originalReminderId,
    sourceFollowupId: sourceFollowupIdFromOriginalReminderId(originalReminderId, reminderType),
    priority: String(row.priority ?? "P1") as "P0" | "P1" | "P2",
    title: String(row.title ?? ""),
    assetTitle: typeof row.asset_title === "string" ? row.asset_title : null,
    ownerName: typeof row.owner_name === "string" ? row.owner_name : null,
    dueDate: typeof row.due_date === "string" ? row.due_date : null,
    actionRequired: typeof row.action_required === "string" ? row.action_required : null,
    status: String(row.status ?? "draft") as RiskRetrospectiveGovernanceReminderLogStatus,
    feishuMessageId: typeof row.feishu_message_id === "string" ? row.feishu_message_id : null,
    feishuReceiveIdType: row.feishu_receive_id_type === "chat_id" || row.feishu_receive_id_type === "open_id" ? row.feishu_receive_id_type : null,
    feishuReceiveIdMasked: typeof row.feishu_receive_id_masked === "string" ? row.feishu_receive_id_masked : null,
    sentAt: typeof row.sent_at === "string" ? row.sent_at : null,
    closedAt: typeof row.closed_at === "string" ? row.closed_at : null,
    closureNote: typeof row.closure_note === "string" ? row.closure_note : null,
    error: typeof row.error === "string" ? row.error : null,
    createdByName: typeof row.created_by_name === "string" ? row.created_by_name : null,
    requestId: typeof row.request_id === "string" ? row.request_id : null,
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
  };
}

function snapshotSelectColumns(): string {
  return [
    "id",
    "project_id",
    "snapshot_date",
    "snapshot_week_start",
    "total_count",
    "open_count",
    "closed_count",
    "overdue_open_count",
    "due_soon_open_count",
    "waiting_acceptance_count",
    "evidence_gap_count",
    "reminder_count",
    "p0_reminder_count",
    "evidence_completeness_rate",
    "report_facts",
    "report_markdown_sha256",
    "created_by_name",
    "request_id",
    "created_at",
    "updated_at",
  ].join(",");
}

function originalReminderIdFromReminderKey(reminderKey: string): string | null {
  const separatorIndex = reminderKey.indexOf(":");
  const candidate = separatorIndex >= 0 ? reminderKey.slice(separatorIndex + 1) : reminderKey;
  return candidate.trim() || null;
}

function sourceFollowupIdFromOriginalReminderId(originalReminderId: string | null, reminderType: RiskRetrospectiveGovernanceReminderLogType): string | null {
  if (!originalReminderId || reminderType === "weekly_summary") return null;
  const prefix = `${reminderType}-`;
  if (!originalReminderId.startsWith(prefix)) return null;
  const id = originalReminderId.slice(prefix.length).trim();
  return id || null;
}

function reminderLogSelectColumns(): string {
  return [
    "id",
    "project_id",
    "reminder_key",
    "reminder_type",
    "priority",
    "title",
    "asset_title",
    "owner_name",
    "due_date",
    "action_required",
    "status",
    "feishu_message_id",
    "feishu_receive_id_type",
    "feishu_receive_id_masked",
    "sent_at",
    "closed_at",
    "closure_note",
    "error",
    "created_by_name",
    "request_id",
    "metadata",
    "created_at",
    "updated_at",
  ].join(",");
}

function scopedOperationProjectIds(scope: RiskDataScope): string[] {
  return resolveRequestedRiskProjectIds(scope, scope.requestedProjectId);
}

function requiredOperationProjectId(scope: RiskDataScope): string {
  const projectIds = resolveRequestedRiskProjectIds(scope, scope.requestedProjectId);
  if (projectIds.length !== 1) throw new Error("PROJECT_ID_REQUIRED");
  return projectIds[0];
}

export async function persistRiskRetrospectiveGovernanceOperationSnapshot(input: {
  report: RiskRetrospectiveGovernanceFollowupOperationReport;
  user: AppUser | null;
  requestId?: string;
  scope?: RiskDataScope;
}): Promise<RiskRetrospectiveGovernanceOperationPersistResult> {
  if (!input.scope) return { status: "failed", warning: "RISK_DATA_SCOPE_REQUIRED" };
  if (!isAuthStorageConfigured()) {
    return { status: "skipped", warning: "Supabase 未配置，知识治理运营快照未持久化。" };
  }

  try {
    const snapshotDate = dateOnly();
    const projectId = requiredOperationProjectId(input.scope);
    const supabase = getAuthSupabase();
    const { data, error } = await supabase
      .from(SNAPSHOT_TABLE)
      .upsert({
        org_id: input.scope.orgId,
        project_id: projectId,
        data_class: input.scope.dataClass,
        snapshot_date: snapshotDate,
        snapshot_week_start: weekStartFromTrend(input.report),
        total_count: input.report.summary.total,
        open_count: input.report.summary.open,
        closed_count: input.report.summary.closed,
        overdue_open_count: input.report.summary.overdueOpen,
        due_soon_open_count: input.report.summary.dueSoonOpen,
        waiting_acceptance_count: input.report.summary.waitingAcceptance,
        evidence_gap_count: input.report.summary.evidenceGaps,
        reminder_count: input.report.reminderDrafts.length,
        p0_reminder_count: input.report.reminderDrafts.filter(item => item.priority === "P0").length,
        evidence_completeness_rate: input.report.summary.evidenceCompletenessRate,
        report_facts: input.report.reportFacts,
        report_markdown_sha256: sha256(input.report.reportMarkdown),
        created_by: input.user?.id ?? null,
        created_by_name: actorName(input.user),
        request_id: input.requestId ?? null,
        metadata: {
          source: "risk_retrospective_governance_operation_report",
          project_id: projectId,
          filtered: input.report.summary.filtered,
          warning: input.report.warning ?? null,
        },
        updated_at: new Date().toISOString(),
      }, { onConflict: "org_id,data_class,project_id,snapshot_date" })
      .select(snapshotSelectColumns())
      .single();

    if (error) {
      return {
        status: isMissingOperationTableError(error.message) ? "skipped" : "failed",
        warning: sqlWarning(error.message),
      };
    }
    return { status: "succeeded", snapshot: mapSnapshot(data as unknown as Record<string, unknown>) };
  } catch (error) {
    return {
      status: "failed",
      warning: error instanceof Error ? error.message : "知识治理运营快照写入失败。",
    };
  }
}

export async function persistRiskRetrospectiveGovernanceReminderLogs(input: {
  reminders: RiskRetrospectiveGovernanceFollowupReminderDraft[];
  status: RiskRetrospectiveGovernanceReminderLogStatus;
  user: AppUser | null;
  requestId?: string;
  receiveIdType?: "chat_id" | "open_id";
  receiveId?: string;
  feishuMessageId?: string | null;
  error?: string | null;
  scope?: RiskDataScope;
}): Promise<RiskRetrospectiveGovernanceReminderPersistResult> {
  if (!input.scope) return { status: "failed", warning: "RISK_DATA_SCOPE_REQUIRED" };
  if (input.reminders.length === 0) return { status: "succeeded", logs: [] };
  if (!isAuthStorageConfigured()) {
    return { status: "skipped", warning: "Supabase 未配置，知识治理运营提醒日志未持久化。" };
  }

  try {
    const snapshotDate = dateOnly();
    const now = new Date().toISOString();
    const projectId = requiredOperationProjectId(input.scope);
    const payload = input.reminders.map(reminder => ({
      org_id: input.scope!.orgId,
      project_id: projectId,
      data_class: input.scope!.dataClass,
      reminder_key: reminderLogKey(reminder.id, snapshotDate),
      reminder_type: reminder.type,
      priority: reminder.priority,
      title: reminder.title,
      asset_title: reminder.assetTitle,
      owner_name: reminder.ownerName,
      due_date: /^\d{4}-\d{2}-\d{2}$/.test(reminder.dueDate) ? reminder.dueDate : null,
      action_required: reminder.actionRequired,
      status: input.status,
      feishu_message_id: input.feishuMessageId ?? null,
      feishu_receive_id_type: input.receiveIdType ?? null,
      feishu_receive_id_masked: input.receiveId ? maskFeishuReceiveId(input.receiveId) : null,
      sent_at: input.status === "sent" ? now : null,
      error: input.error ?? null,
      created_by: input.user?.id ?? null,
      created_by_name: actorName(input.user),
      request_id: input.requestId ?? null,
      metadata: {
        source: "risk_retrospective_governance_weekly_reminder",
        project_id: projectId,
        original_reminder_id: reminder.id,
        confirmation_required: reminder.confirmationRequired,
      },
      updated_at: now,
    }));
    const supabase = getAuthSupabase();
    const { data, error } = await supabase
      .from(REMINDER_LOG_TABLE)
      .upsert(payload, { onConflict: "org_id,data_class,project_id,reminder_key" })
      .select(reminderLogSelectColumns());

    if (error) {
      return {
        status: isMissingOperationTableError(error.message) ? "skipped" : "failed",
        warning: sqlWarning(error.message),
      };
    }
    return { status: "succeeded", logs: (data ?? []).map(row => mapReminderLog(row as unknown as Record<string, unknown>)) };
  } catch (error) {
    return {
      status: "failed",
      warning: error instanceof Error ? error.message : "知识治理运营提醒日志写入失败。",
    };
  }
}

export async function listRiskRetrospectiveGovernanceOperationHistory(input: {
  scope?: RiskDataScope;
  snapshotLimit?: number;
  reminderLimit?: number;
} = {}): Promise<RiskRetrospectiveGovernanceOperationHistoryResult> {
  if (!input.scope) return { status: "failed", snapshots: [], reminderLogs: [], warning: "RISK_DATA_SCOPE_REQUIRED" };
  if (!isAuthStorageConfigured()) {
    return { status: "not_configured", snapshots: [], reminderLogs: [], warning: "Supabase 未配置，无法读取知识治理运营历史。" };
  }

  try {
    const supabase = getAuthSupabase();
    const projectIds = scopedOperationProjectIds(input.scope);
    if (projectIds.length === 0) return { status: "succeeded", snapshots: [], reminderLogs: [] };
    const snapshotQuery = supabase
      .from(SNAPSHOT_TABLE)
      .select(snapshotSelectColumns())
      .eq("org_id", input.scope.orgId)
      .eq("data_class", input.scope.dataClass)
      .in("project_id", projectIds);
    const reminderQuery = supabase
      .from(REMINDER_LOG_TABLE)
      .select(reminderLogSelectColumns())
      .eq("org_id", input.scope.orgId)
      .eq("data_class", input.scope.dataClass)
      .in("project_id", projectIds);
    const [snapshots, reminderLogs] = await Promise.all([
      snapshotQuery
        .order("snapshot_date", { ascending: false })
        .limit(input.snapshotLimit ?? 12),
      reminderQuery
        .order("created_at", { ascending: false })
        .limit(input.reminderLimit ?? 50),
    ]);

    if (snapshots.error || reminderLogs.error) {
      const error = snapshots.error ?? reminderLogs.error;
      return {
        status: error && isMissingOperationTableError(error.message) ? "not_configured" : "failed",
        snapshots: [],
        reminderLogs: [],
        warning: sqlWarning(error?.message),
      };
    }

    return {
      status: "succeeded",
      snapshots: (snapshots.data ?? []).map(row => mapSnapshot(row as unknown as Record<string, unknown>)),
      reminderLogs: (reminderLogs.data ?? []).map(row => mapReminderLog(row as unknown as Record<string, unknown>)),
    };
  } catch (error) {
    return {
      status: "failed",
      snapshots: [],
      reminderLogs: [],
      warning: error instanceof Error ? error.message : "知识治理运营历史读取失败。",
    };
  }
}

export async function getRiskRetrospectiveGovernanceReminderLog(id: string, scope?: RiskDataScope): Promise<RiskRetrospectiveGovernanceReminderGetResult> {
  if (!scope) return { status: "failed", warning: "RISK_DATA_SCOPE_REQUIRED" };
  if (!isAuthStorageConfigured()) {
    return { status: "not_configured", warning: "Supabase 未配置，无法读取知识治理运营提醒。" };
  }

  try {
    const supabase = getAuthSupabase();
    const projectIds = scopedOperationProjectIds(scope);
    if (projectIds.length === 0) return { status: "not_found", warning: "未找到知识治理运营提醒日志。" };
    const query = supabase
      .from(REMINDER_LOG_TABLE)
      .select(reminderLogSelectColumns())
      .eq("id", id)
      .eq("org_id", scope.orgId)
      .eq("data_class", scope.dataClass)
      .in("project_id", projectIds);
    const { data, error } = await query.maybeSingle();

    if (error) {
      return {
        status: isMissingOperationTableError(error.message) ? "not_configured" : "failed",
        warning: sqlWarning(error.message),
      };
    }
    if (!data) return { status: "not_found", warning: "未找到知识治理运营提醒日志。" };
    return { status: "succeeded", log: mapReminderLog(data as unknown as Record<string, unknown>) };
  } catch (error) {
    return {
      status: "failed",
      warning: error instanceof Error ? error.message : "知识治理运营提醒读取失败。",
    };
  }
}

export async function updateRiskRetrospectiveGovernanceReminderLogStatus(input: {
  id: string;
  status: Exclude<RiskRetrospectiveGovernanceReminderLogStatus, "draft" | "sent" | "failed">;
  closureNote?: string | null;
  user: AppUser | null;
  requestId?: string;
  scope?: RiskDataScope;
}): Promise<RiskRetrospectiveGovernanceReminderUpdateResult> {
  if (!input.scope) return { status: "failed", warning: "RISK_DATA_SCOPE_REQUIRED" };
  if (!isAuthStorageConfigured()) {
    return { status: "not_configured", warning: "Supabase 未配置，无法更新知识治理运营提醒状态。" };
  }

  try {
    const supabase = getAuthSupabase();
    const projectIds = scopedOperationProjectIds(input.scope);
    if (projectIds.length === 0) return { status: "not_found", warning: "未找到知识治理运营提醒日志。" };
    const query = supabase
      .from(REMINDER_LOG_TABLE)
      .update({
        status: input.status,
        closure_note: input.closureNote ?? null,
        closed_at: new Date().toISOString(),
        request_id: input.requestId ?? null,
        updated_at: new Date().toISOString(),
        metadata: {
          closed_by_name: actorName(input.user),
          close_action: input.status,
        },
      })
      .eq("id", input.id)
      .eq("org_id", input.scope.orgId)
      .eq("data_class", input.scope.dataClass)
      .in("project_id", projectIds);
    const { data, error } = await query.select(reminderLogSelectColumns()).maybeSingle();

    if (error) {
      return {
        status: isMissingOperationTableError(error.message) ? "not_configured" : "failed",
        warning: sqlWarning(error.message),
      };
    }
    if (!data) return { status: "not_found", warning: "未找到知识治理运营提醒日志。" };
    return { status: "succeeded", log: mapReminderLog(data as unknown as Record<string, unknown>) };
  } catch (error) {
    return {
      status: "failed",
      warning: error instanceof Error ? error.message : "知识治理运营提醒状态更新失败。",
    };
  }
}
