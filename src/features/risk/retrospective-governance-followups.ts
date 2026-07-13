import { getAuthSupabase, isAuthStorageConfigured, type AppUser } from "../auth/server.ts";
import type {
  RiskRetrospectiveGovernanceActionItem,
  RiskRetrospectiveGovernanceActionItemPriority,
} from "./retrospective-governance.ts";
import { resolveRequestedRiskProjectIds, type RiskDataScope } from "./scope.ts";

export type RiskRetrospectiveGovernanceFollowupStatus = "待复核" | "处理中" | "待验收" | "已关闭";
export type RiskRetrospectiveGovernanceFollowupFeishuSyncStatus = "未同步" | "待确认" | "同步中" | "已同步" | "同步失败";

export interface RiskRetrospectiveGovernanceFollowupRecord {
  id: string;
  projectId?: string;
  actionKey: string;
  sourceLogId: string | null;
  assetTitle: string;
  reason: string;
  actionRequired: string;
  ownerName: string;
  dueDate: string;
  priority: RiskRetrospectiveGovernanceActionItemPriority;
  status: RiskRetrospectiveGovernanceFollowupStatus;
  closingCriteria: string;
  reminderText: string;
  closureNote: string | null;
  reviewResult: string | null;
  feishuSyncStatus: RiskRetrospectiveGovernanceFollowupFeishuSyncStatus;
  feishuTaskGuid: string | null;
  feishuTaskUrl: string | null;
  feishuSyncError: string | null;
  feishuSyncedAt: string | null;
  feishuSyncRequestId: string | null;
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
}

export interface SaveRiskRetrospectiveGovernanceFollowupsInput {
  actionItems: RiskRetrospectiveGovernanceActionItem[];
}

export interface TransitionRiskRetrospectiveGovernanceFollowupInput {
  id: string;
  status: RiskRetrospectiveGovernanceFollowupStatus;
  closureNote?: string | null;
  reviewResult?: string | null;
}

export interface UpdateRiskRetrospectiveGovernanceFollowupFeishuSyncInput {
  id: string;
  status: RiskRetrospectiveGovernanceFollowupFeishuSyncStatus;
  taskGuid?: string | null;
  taskUrl?: string | null;
  error?: string | null;
  requestId?: string | null;
}

export interface UpdateRiskRetrospectiveGovernanceFollowupFromReminderInput {
  id: string;
  status: Extract<RiskRetrospectiveGovernanceFollowupStatus, "处理中" | "待验收">;
  closureNote?: string | null;
  reviewResult?: string | null;
}

export type RiskRetrospectiveGovernanceFollowupListResult =
  | { status: "succeeded"; followups: RiskRetrospectiveGovernanceFollowupRecord[] }
  | { status: "not_configured"; followups: RiskRetrospectiveGovernanceFollowupRecord[]; warning: string }
  | { status: "failed"; followups: RiskRetrospectiveGovernanceFollowupRecord[]; warning: string };

export type RiskRetrospectiveGovernanceFollowupSaveResult =
  | { status: "succeeded"; followups: RiskRetrospectiveGovernanceFollowupRecord[]; created: number; skipped: number }
  | { status: "not_configured"; warning: string }
  | { status: "failed"; warning: string };

export type RiskRetrospectiveGovernanceFollowupGetResult =
  | { status: "succeeded"; followup: RiskRetrospectiveGovernanceFollowupRecord }
  | { status: "not_configured"; warning: string }
  | { status: "not_found"; warning: string }
  | { status: "failed"; warning: string };

export type RiskRetrospectiveGovernanceFollowupUpdateResult =
  | { status: "succeeded"; followup: RiskRetrospectiveGovernanceFollowupRecord }
  | { status: "not_configured"; warning: string }
  | { status: "not_found"; warning: string }
  | { status: "failed"; warning: string };

const FOLLOWUP_SQL_FILE = "supabase-v5338-risk-retrospective-governance-followups.sql";
const VALID_STATUSES: RiskRetrospectiveGovernanceFollowupStatus[] = ["待复核", "处理中", "待验收", "已关闭"];
const VALID_FEISHU_SYNC_STATUSES: RiskRetrospectiveGovernanceFollowupFeishuSyncStatus[] = ["未同步", "待确认", "同步中", "已同步", "同步失败"];

function actorName(user: AppUser | null): string | null {
  return user?.name || user?.email || user?.phone || null;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(value);
}

function isMissingFollowupTableError(message?: string): boolean {
  const normalized = (message ?? "").toLowerCase();
  return normalized.includes("risk_retrospective_governance_followups")
    && (
      normalized.includes("does not exist")
      || normalized.includes("relation")
      || normalized.includes("schema cache")
      || normalized.includes("could not find")
    );
}

function sqlWarning(message?: string): string {
  return isMissingFollowupTableError(message)
    ? `风险复盘二次治理待办 SQL 未执行：请在 Supabase SQL Editor 执行 ${FOLLOWUP_SQL_FILE}。`
    : message || "风险复盘二次治理待办处理失败。";
}

function selectColumns(): string {
  return [
    "id",
    "project_id",
    "action_key",
    "source_log_id",
    "asset_title",
    "reason",
    "action_required",
    "owner_name",
    "due_date",
    "priority",
    "status",
    "closing_criteria",
    "reminder_text",
    "closure_note",
    "review_result",
    "feishu_sync_status",
    "feishu_task_guid",
    "feishu_task_url",
    "feishu_sync_error",
    "feishu_synced_at",
    "feishu_sync_request_id",
    "created_by_name",
    "created_at",
    "updated_at",
    "closed_at",
  ].join(",");
}

function mapFollowup(row: Record<string, unknown>): RiskRetrospectiveGovernanceFollowupRecord {
  return {
    id: String(row.id),
    projectId: String(row.project_id ?? ""),
    actionKey: String(row.action_key ?? ""),
    sourceLogId: typeof row.source_log_id === "string" ? row.source_log_id : null,
    assetTitle: String(row.asset_title ?? ""),
    reason: String(row.reason ?? ""),
    actionRequired: String(row.action_required ?? ""),
    ownerName: String(row.owner_name ?? ""),
    dueDate: typeof row.due_date === "string" ? row.due_date : "",
    priority: String(row.priority || "medium") as RiskRetrospectiveGovernanceActionItemPriority,
    status: String(row.status || "待复核") as RiskRetrospectiveGovernanceFollowupStatus,
    closingCriteria: String(row.closing_criteria ?? ""),
    reminderText: String(row.reminder_text ?? ""),
    closureNote: typeof row.closure_note === "string" ? row.closure_note : null,
    reviewResult: typeof row.review_result === "string" ? row.review_result : null,
    feishuSyncStatus: String(row.feishu_sync_status || "未同步") as RiskRetrospectiveGovernanceFollowupFeishuSyncStatus,
    feishuTaskGuid: typeof row.feishu_task_guid === "string" ? row.feishu_task_guid : null,
    feishuTaskUrl: typeof row.feishu_task_url === "string" ? row.feishu_task_url : null,
    feishuSyncError: typeof row.feishu_sync_error === "string" ? row.feishu_sync_error : null,
    feishuSyncedAt: typeof row.feishu_synced_at === "string" ? row.feishu_synced_at : null,
    feishuSyncRequestId: typeof row.feishu_sync_request_id === "string" ? row.feishu_sync_request_id : null,
    createdByName: typeof row.created_by_name === "string" ? row.created_by_name : null,
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
    closedAt: typeof row.closed_at === "string" ? row.closed_at : null,
  };
}

function scopedProjectIds(scope: RiskDataScope): string[] {
  return resolveRequestedRiskProjectIds(scope, scope.requestedProjectId);
}

function singleWritableProjectId(scope: RiskDataScope): string {
  const projectIds = scopedProjectIds(scope);
  if (projectIds.length !== 1) throw new Error("PROJECT_ID_REQUIRED");
  return projectIds[0];
}

export function normalizeRiskRetrospectiveGovernanceFollowupStatus(status: string): RiskRetrospectiveGovernanceFollowupStatus | null {
  return VALID_STATUSES.includes(status as RiskRetrospectiveGovernanceFollowupStatus)
    ? status as RiskRetrospectiveGovernanceFollowupStatus
    : null;
}

export function normalizeRiskRetrospectiveGovernanceFollowupFeishuSyncStatus(status: string): RiskRetrospectiveGovernanceFollowupFeishuSyncStatus | null {
  return VALID_FEISHU_SYNC_STATUSES.includes(status as RiskRetrospectiveGovernanceFollowupFeishuSyncStatus)
    ? status as RiskRetrospectiveGovernanceFollowupFeishuSyncStatus
    : null;
}

export async function listRiskRetrospectiveGovernanceFollowups(limit = 50, scope?: RiskDataScope): Promise<RiskRetrospectiveGovernanceFollowupListResult> {
  if (!scope) return { status: "failed", followups: [], warning: "RISK_DATA_SCOPE_REQUIRED" };
  const projectIds = scopedProjectIds(scope);
  if (projectIds.length === 0) return { status: "succeeded", followups: [] };
  if (!isAuthStorageConfigured()) {
    return { status: "not_configured", followups: [], warning: "Supabase 未配置，无法读取风险复盘二次治理待办。" };
  }

  try {
    const supabase = getAuthSupabase();
    const { data, error } = await supabase
      .from("risk_retrospective_governance_followups")
      .select(selectColumns())
      .eq("org_id", scope.orgId)
      .eq("data_class", scope.dataClass)
      .in("project_id", projectIds)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      return {
        status: isMissingFollowupTableError(error.message) ? "not_configured" : "failed",
        followups: [],
        warning: sqlWarning(error.message),
      };
    }
    return { status: "succeeded", followups: (data ?? []).map(row => mapFollowup(row as unknown as Record<string, unknown>)) };
  } catch (error) {
    return {
      status: "failed",
      followups: [],
      warning: error instanceof Error ? error.message : "读取风险复盘二次治理待办失败。",
    };
  }
}

export async function saveRiskRetrospectiveGovernanceFollowups(
  input: SaveRiskRetrospectiveGovernanceFollowupsInput,
  user: AppUser | null,
  scope?: RiskDataScope,
): Promise<RiskRetrospectiveGovernanceFollowupSaveResult> {
  if (!scope) return { status: "failed", warning: "RISK_DATA_SCOPE_REQUIRED" };
  if (!isAuthStorageConfigured()) {
    return { status: "not_configured", warning: "Supabase 未配置，无法保存风险复盘二次治理待办。" };
  }
  let projectId: string;
  try {
    projectId = singleWritableProjectId(scope);
  } catch (error) {
    return { status: "failed", warning: error instanceof Error ? error.message : "PROJECT_ID_REQUIRED" };
  }
  const payload = input.actionItems.map(item => ({
    org_id: scope.orgId,
    project_id: projectId,
    data_class: scope.dataClass,
    action_key: item.id,
    source_log_id: isUuid(item.sourceLogId) ? item.sourceLogId : null,
    asset_title: item.assetTitle,
    reason: item.reason,
    action_required: item.actionRequired,
    owner_name: item.owner,
    due_date: item.deadline,
    priority: item.priority,
    status: "待复核",
    closing_criteria: item.closingCriteria,
    reminder_text: item.reminderText,
    created_by: user?.id ?? null,
    created_by_name: actorName(user),
  }));

  try {
    const supabase = getAuthSupabase();
    const { data, error } = await supabase
      .from("risk_retrospective_governance_followups")
      .upsert(payload, { onConflict: "org_id,data_class,project_id,action_key", ignoreDuplicates: true })
      .select(selectColumns());

    if (error) {
      return {
        status: isMissingFollowupTableError(error.message) ? "not_configured" : "failed",
        warning: sqlWarning(error.message),
      };
    }
    return {
      status: "succeeded",
      followups: (data ?? []).map(row => mapFollowup(row as unknown as Record<string, unknown>)),
      created: data?.length ?? 0,
      skipped: Math.max(0, input.actionItems.length - (data?.length ?? 0)),
    };
  } catch (error) {
    return {
      status: "failed",
      warning: error instanceof Error ? error.message : "保存风险复盘二次治理待办失败。",
    };
  }
}

export async function getRiskRetrospectiveGovernanceFollowup(id: string, scope?: RiskDataScope): Promise<RiskRetrospectiveGovernanceFollowupGetResult> {
  if (!scope) return { status: "failed", warning: "RISK_DATA_SCOPE_REQUIRED" };
  const projectIds = scopedProjectIds(scope);
  if (projectIds.length === 0) return { status: "not_found", warning: "风险复盘二次治理待办不存在。" };
  if (!isAuthStorageConfigured()) {
    return { status: "not_configured", warning: "Supabase 未配置，无法读取风险复盘二次治理待办。" };
  }
  try {
    const supabase = getAuthSupabase();
    const { data, error } = await supabase
      .from("risk_retrospective_governance_followups")
      .select(selectColumns())
      .eq("id", id)
      .eq("org_id", scope.orgId)
      .eq("data_class", scope.dataClass)
      .in("project_id", projectIds)
      .maybeSingle();

    if (error) {
      return {
        status: isMissingFollowupTableError(error.message) ? "not_configured" : "failed",
        warning: sqlWarning(error.message),
      };
    }
    if (!data) return { status: "not_found", warning: "风险复盘二次治理待办不存在。" };
    return { status: "succeeded", followup: mapFollowup(data as unknown as Record<string, unknown>) };
  } catch (error) {
    return {
      status: "failed",
      warning: error instanceof Error ? error.message : "读取风险复盘二次治理待办失败。",
    };
  }
}

export async function transitionRiskRetrospectiveGovernanceFollowup(
  input: TransitionRiskRetrospectiveGovernanceFollowupInput,
  scope?: RiskDataScope,
): Promise<RiskRetrospectiveGovernanceFollowupUpdateResult> {
  if (!scope) return { status: "failed", warning: "RISK_DATA_SCOPE_REQUIRED" };
  const projectIds = scopedProjectIds(scope);
  if (projectIds.length === 0) return { status: "not_found", warning: "风险复盘二次治理待办不存在。" };
  if (!isAuthStorageConfigured()) {
    return { status: "not_configured", warning: "Supabase 未配置，无法流转风险复盘二次治理待办。" };
  }
  const status = normalizeRiskRetrospectiveGovernanceFollowupStatus(input.status);
  if (!status) return { status: "failed", warning: "风险复盘二次治理待办状态不合法。" };

  try {
    const supabase = getAuthSupabase();
    const { data, error } = await supabase
      .from("risk_retrospective_governance_followups")
      .update({
        status,
        closure_note: input.closureNote ?? null,
        review_result: input.reviewResult ?? null,
        closed_at: status === "已关闭" ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.id)
      .eq("org_id", scope.orgId)
      .eq("data_class", scope.dataClass)
      .in("project_id", projectIds)
      .select(selectColumns())
      .maybeSingle();

    if (error) {
      return {
        status: isMissingFollowupTableError(error.message) ? "not_configured" : "failed",
        warning: sqlWarning(error.message),
      };
    }
    if (!data) return { status: "not_found", warning: "风险复盘二次治理待办不存在。" };
    return { status: "succeeded", followup: mapFollowup(data as unknown as Record<string, unknown>) };
  } catch (error) {
    return {
      status: "failed",
      warning: error instanceof Error ? error.message : "流转风险复盘二次治理待办失败。",
    };
  }
}

export async function updateRiskRetrospectiveGovernanceFollowupFromReminder(
  input: UpdateRiskRetrospectiveGovernanceFollowupFromReminderInput,
  scope?: RiskDataScope,
): Promise<RiskRetrospectiveGovernanceFollowupUpdateResult> {
  if (!scope) return { status: "failed", warning: "RISK_DATA_SCOPE_REQUIRED" };
  const projectIds = scopedProjectIds(scope);
  if (projectIds.length === 0) return { status: "not_found", warning: "风险复盘二次治理待办不存在。" };
  if (!isAuthStorageConfigured()) {
    return { status: "not_configured", warning: "Supabase 未配置，无法联动更新风险复盘二次治理待办。" };
  }
  const status = normalizeRiskRetrospectiveGovernanceFollowupStatus(input.status);
  if (!status || (status !== "处理中" && status !== "待验收")) {
    return { status: "failed", warning: "风险复盘二次治理待办提醒联动状态不合法。" };
  }

  try {
    const supabase = getAuthSupabase();
    const updatePayload: Record<string, unknown> = {
      status,
      updated_at: new Date().toISOString(),
    };
    if (input.closureNote?.trim()) updatePayload.closure_note = input.closureNote.trim();
    if (input.reviewResult?.trim()) updatePayload.review_result = input.reviewResult.trim();

    const { data, error } = await supabase
      .from("risk_retrospective_governance_followups")
      .update(updatePayload)
      .eq("id", input.id)
      .eq("org_id", scope.orgId)
      .eq("data_class", scope.dataClass)
      .in("project_id", projectIds)
      .select(selectColumns())
      .maybeSingle();

    if (error) {
      return {
        status: isMissingFollowupTableError(error.message) ? "not_configured" : "failed",
        warning: sqlWarning(error.message),
      };
    }
    if (!data) return { status: "not_found", warning: "风险复盘二次治理待办不存在。" };
    return { status: "succeeded", followup: mapFollowup(data as unknown as Record<string, unknown>) };
  } catch (error) {
    return {
      status: "failed",
      warning: error instanceof Error ? error.message : "提醒日志联动更新风险复盘二次治理待办失败。",
    };
  }
}

export async function updateRiskRetrospectiveGovernanceFollowupFeishuSync(
  input: UpdateRiskRetrospectiveGovernanceFollowupFeishuSyncInput,
  scope?: RiskDataScope,
): Promise<RiskRetrospectiveGovernanceFollowupUpdateResult> {
  if (!scope) return { status: "failed", warning: "RISK_DATA_SCOPE_REQUIRED" };
  const projectIds = scopedProjectIds(scope);
  if (projectIds.length === 0) return { status: "not_found", warning: "风险复盘二次治理待办不存在。" };
  if (!isAuthStorageConfigured()) {
    return { status: "not_configured", warning: "Supabase 未配置，无法更新风险复盘二次治理飞书同步状态。" };
  }
  const status = normalizeRiskRetrospectiveGovernanceFollowupFeishuSyncStatus(input.status);
  if (!status) return { status: "failed", warning: "飞书同步状态不合法。" };

  try {
    const supabase = getAuthSupabase();
    const { data, error } = await supabase
      .from("risk_retrospective_governance_followups")
      .update({
        feishu_sync_status: status,
        feishu_task_guid: input.taskGuid ?? null,
        feishu_task_url: input.taskUrl ?? null,
        feishu_sync_error: input.error ?? null,
        feishu_synced_at: status === "已同步" ? new Date().toISOString() : null,
        feishu_sync_request_id: input.requestId ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.id)
      .eq("org_id", scope.orgId)
      .eq("data_class", scope.dataClass)
      .in("project_id", projectIds)
      .select(selectColumns())
      .maybeSingle();

    if (error) {
      return {
        status: isMissingFollowupTableError(error.message) ? "not_configured" : "failed",
        warning: sqlWarning(error.message),
      };
    }
    if (!data) return { status: "not_found", warning: "风险复盘二次治理待办不存在。" };
    return { status: "succeeded", followup: mapFollowup(data as unknown as Record<string, unknown>) };
  } catch (error) {
    return {
      status: "failed",
      warning: error instanceof Error ? error.message : "更新风险复盘二次治理飞书同步状态失败。",
    };
  }
}
