import { getAuthSupabase, isAuthStorageConfigured, type AppUser } from "../auth/server.ts";
import type { MigrationRemediationAction } from "./package.ts";

export type MigrationRemediationStatus = "待处理" | "处理中" | "待复检" | "已关闭";
export type MigrationRemediationFeishuSyncStatus = "未同步" | "待确认" | "同步中" | "已同步" | "同步失败";

export interface MigrationRemediationActionRecord extends Omit<MigrationRemediationAction, "id" | "status"> {
  id: string;
  actionKey: string;
  batchId: string | null;
  batchName: string | null;
  objectName: string;
  ownerName: string | null;
  status: MigrationRemediationStatus;
  closureNote: string | null;
  reviewResult: string | null;
  feishuSyncStatus: MigrationRemediationFeishuSyncStatus;
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

export interface SaveMigrationRemediationActionsInput {
  batchId?: string | null;
  batchName?: string | null;
  objectName: string;
  actions: MigrationRemediationAction[];
}

export interface TransitionMigrationRemediationActionInput {
  id: string;
  status: MigrationRemediationStatus;
  closureNote?: string | null;
  reviewResult?: string | null;
}

export interface UpdateMigrationRemediationFeishuSyncInput {
  id: string;
  status: MigrationRemediationFeishuSyncStatus;
  taskGuid?: string | null;
  taskUrl?: string | null;
  error?: string | null;
  requestId?: string | null;
}

export type MigrationRemediationListResult =
  | { status: "succeeded"; actions: MigrationRemediationActionRecord[] }
  | { status: "not_configured"; actions: MigrationRemediationActionRecord[]; warning: string }
  | { status: "failed"; actions: MigrationRemediationActionRecord[]; warning: string };

export type MigrationRemediationSaveResult =
  | { status: "succeeded"; actions: MigrationRemediationActionRecord[] }
  | { status: "not_configured"; warning: string }
  | { status: "failed"; warning: string };

export type MigrationRemediationTransitionResult =
  | { status: "succeeded"; action: MigrationRemediationActionRecord }
  | { status: "not_configured"; warning: string }
  | { status: "not_found"; warning: string }
  | { status: "failed"; warning: string };

export type MigrationRemediationGetResult =
  | { status: "succeeded"; action: MigrationRemediationActionRecord }
  | { status: "not_configured"; warning: string }
  | { status: "not_found"; warning: string }
  | { status: "failed"; warning: string };

export type MigrationRemediationFeishuSyncUpdateResult =
  | { status: "succeeded"; action: MigrationRemediationActionRecord }
  | { status: "not_configured"; warning: string }
  | { status: "not_found"; warning: string }
  | { status: "failed"; warning: string };

const MIGRATION_REMEDIATION_SQL = "supabase-v5316-migration-remediation-actions.sql";
const MIGRATION_REMEDIATION_FEISHU_SYNC_SQL = "supabase-v5317-migration-remediation-feishu-sync.sql";
const VALID_STATUSES: MigrationRemediationStatus[] = ["待处理", "处理中", "待复检", "已关闭"];
const VALID_FEISHU_SYNC_STATUSES: MigrationRemediationFeishuSyncStatus[] = ["未同步", "待确认", "同步中", "已同步", "同步失败"];

function isMissingRemediationTableError(message?: string): boolean {
  const normalized = (message ?? "").toLowerCase();
  return normalized.includes("migration_remediation_actions")
    && (
      normalized.includes("does not exist")
      || normalized.includes("relation")
      || normalized.includes("schema cache")
      || normalized.includes("could not find the table")
    );
}

function isMissingFeishuSyncColumnError(message?: string): boolean {
  const normalized = (message ?? "").toLowerCase();
  const mentionsFeishuSyncField = normalized.includes("feishu_sync") || normalized.includes("feishu_task");
  return mentionsFeishuSyncField
    && (
      normalized.includes("does not exist")
      || normalized.includes("column")
      || normalized.includes("schema cache")
      || normalized.includes("could not find")
    );
}

function sqlWarning(message?: string): string {
  if (isMissingRemediationTableError(message)) {
    return `迁移整改 SQL 未执行：请在 Supabase SQL Editor 先执行 ${MIGRATION_REMEDIATION_SQL}。`;
  }
  if (isMissingFeishuSyncColumnError(message)) {
    return `迁移整改飞书同步 SQL 未执行：请在 Supabase SQL Editor 执行 ${MIGRATION_REMEDIATION_FEISHU_SYNC_SQL}。`;
  }
  return message || "迁移整改行动项处理失败。";
}

function isRemediationSchemaError(message?: string): boolean {
  return isMissingRemediationTableError(message) || isMissingFeishuSyncColumnError(message);
}

function actorName(user: AppUser | null): string | null {
  return user?.name || user?.email || user?.phone || null;
}

function mapRemediationAction(row: Record<string, unknown>): MigrationRemediationActionRecord {
  return {
    id: String(row.id),
    actionKey: String(row.action_key ?? ""),
    batchId: typeof row.batch_id === "string" ? row.batch_id : null,
    batchName: typeof row.batch_name === "string" ? row.batch_name : null,
    objectName: String(row.object_name ?? ""),
    title: String(row.title ?? ""),
    priority: String(row.priority || "P2") as MigrationRemediationActionRecord["priority"],
    ownerRole: String(row.owner_role ?? ""),
    ownerName: typeof row.owner_name === "string" ? row.owner_name : null,
    dueDate: typeof row.due_date === "string" ? row.due_date : "",
    status: String(row.status || "待处理") as MigrationRemediationStatus,
    sourceIssue: String(row.source_issue ?? ""),
    sampleRefs: Array.isArray(row.sample_refs) ? row.sample_refs.map(String) : [],
    recommendation: String(row.recommendation ?? ""),
    acceptanceCriteria: String(row.acceptance_criteria ?? ""),
    closureNote: typeof row.closure_note === "string" ? row.closure_note : null,
    reviewResult: typeof row.review_result === "string" ? row.review_result : null,
    feishuSyncStatus: String(row.feishu_sync_status || "未同步") as MigrationRemediationFeishuSyncStatus,
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

function selectColumns() {
  return [
    "id",
    "batch_id",
    "batch_name",
    "object_name",
    "action_key",
    "title",
    "priority",
    "owner_role",
    "owner_name",
    "due_date",
    "status",
    "source_issue",
    "sample_refs",
    "recommendation",
    "acceptance_criteria",
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

export function normalizeMigrationRemediationStatus(status: string): MigrationRemediationStatus | null {
  return VALID_STATUSES.includes(status as MigrationRemediationStatus)
    ? status as MigrationRemediationStatus
    : null;
}

export function normalizeMigrationRemediationFeishuSyncStatus(status: string): MigrationRemediationFeishuSyncStatus | null {
  return VALID_FEISHU_SYNC_STATUSES.includes(status as MigrationRemediationFeishuSyncStatus)
    ? status as MigrationRemediationFeishuSyncStatus
    : null;
}

export async function listMigrationRemediationActions(limit = 50): Promise<MigrationRemediationListResult> {
  if (!isAuthStorageConfigured()) {
    return {
      status: "not_configured",
      actions: [],
      warning: "Supabase 未配置，无法读取迁移整改行动项。",
    };
  }

  try {
    const supabase = getAuthSupabase();
    const { data, error } = await supabase
      .from("migration_remediation_actions")
      .select(selectColumns())
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      return {
        status: isRemediationSchemaError(error.message) ? "not_configured" : "failed",
        actions: [],
        warning: sqlWarning(error.message),
      };
    }

    return { status: "succeeded", actions: (data ?? []).map(row => mapRemediationAction(row as unknown as Record<string, unknown>)) };
  } catch (error) {
    return {
      status: "failed",
      actions: [],
      warning: error instanceof Error ? error.message : "读取迁移整改行动项失败。",
    };
  }
}

export async function saveMigrationRemediationActions(
  input: SaveMigrationRemediationActionsInput,
  user: AppUser | null,
): Promise<MigrationRemediationSaveResult> {
  if (!isAuthStorageConfigured()) {
    return {
      status: "not_configured",
      warning: "Supabase 未配置，无法保存迁移整改行动项。",
    };
  }

  const payload = input.actions.map(action => ({
    batch_id: input.batchId ?? null,
    batch_name: input.batchName ?? null,
    object_name: input.objectName,
    action_key: action.id,
    title: action.title,
    priority: action.priority,
    owner_role: action.ownerRole,
    due_date: action.dueDate || null,
    status: "待处理",
    source_issue: action.sourceIssue,
    sample_refs: action.sampleRefs,
    recommendation: action.recommendation,
    acceptance_criteria: action.acceptanceCriteria,
    created_by: user?.id ?? null,
    created_by_name: actorName(user),
  }));

  try {
    const supabase = getAuthSupabase();
    const { data, error } = await supabase
      .from("migration_remediation_actions")
      .insert(payload)
      .select(selectColumns());

    if (error) {
      return {
        status: isRemediationSchemaError(error.message) ? "not_configured" : "failed",
        warning: sqlWarning(error.message),
      };
    }

    return { status: "succeeded", actions: (data ?? []).map(row => mapRemediationAction(row as unknown as Record<string, unknown>)) };
  } catch (error) {
    return {
      status: "failed",
      warning: error instanceof Error ? error.message : "保存迁移整改行动项失败。",
    };
  }
}

export async function transitionMigrationRemediationAction(
  input: TransitionMigrationRemediationActionInput,
): Promise<MigrationRemediationTransitionResult> {
  if (!isAuthStorageConfigured()) {
    return {
      status: "not_configured",
      warning: "Supabase 未配置，无法流转迁移整改行动项。",
    };
  }
  const status = normalizeMigrationRemediationStatus(input.status);
  if (!status) {
    return { status: "failed", warning: "整改行动项状态不合法。" };
  }

  const payload = {
    status,
    closure_note: input.closureNote ?? null,
    review_result: input.reviewResult ?? null,
    closed_at: status === "已关闭" ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  };

  try {
    const supabase = getAuthSupabase();
    const { data, error } = await supabase
      .from("migration_remediation_actions")
      .update(payload)
      .eq("id", input.id)
      .select(selectColumns())
      .maybeSingle();

    if (error) {
      return {
        status: isRemediationSchemaError(error.message) ? "not_configured" : "failed",
        warning: sqlWarning(error.message),
      };
    }
    if (!data) return { status: "not_found", warning: "整改行动项不存在。" };

    return { status: "succeeded", action: mapRemediationAction(data as unknown as Record<string, unknown>) };
  } catch (error) {
    return {
      status: "failed",
      warning: error instanceof Error ? error.message : "流转迁移整改行动项失败。",
    };
  }
}

export async function getMigrationRemediationAction(id: string): Promise<MigrationRemediationGetResult> {
  if (!isAuthStorageConfigured()) {
    return {
      status: "not_configured",
      warning: "Supabase 未配置，无法读取迁移整改行动项。",
    };
  }

  try {
    const supabase = getAuthSupabase();
    const { data, error } = await supabase
      .from("migration_remediation_actions")
      .select(selectColumns())
      .eq("id", id)
      .maybeSingle();

    if (error) {
      return {
        status: isRemediationSchemaError(error.message) ? "not_configured" : "failed",
        warning: sqlWarning(error.message),
      };
    }
    if (!data) return { status: "not_found", warning: "整改行动项不存在。" };

    return { status: "succeeded", action: mapRemediationAction(data as unknown as Record<string, unknown>) };
  } catch (error) {
    return {
      status: "failed",
      warning: error instanceof Error ? error.message : "读取迁移整改行动项失败。",
    };
  }
}

export async function updateMigrationRemediationFeishuSync(
  input: UpdateMigrationRemediationFeishuSyncInput,
): Promise<MigrationRemediationFeishuSyncUpdateResult> {
  if (!isAuthStorageConfigured()) {
    return {
      status: "not_configured",
      warning: "Supabase 未配置，无法更新迁移整改飞书同步状态。",
    };
  }
  const status = normalizeMigrationRemediationFeishuSyncStatus(input.status);
  if (!status) {
    return { status: "failed", warning: "飞书同步状态不合法。" };
  }

  const payload = {
    feishu_sync_status: status,
    feishu_task_guid: input.taskGuid ?? null,
    feishu_task_url: input.taskUrl ?? null,
    feishu_sync_error: input.error ?? null,
    feishu_synced_at: status === "已同步" ? new Date().toISOString() : null,
    feishu_sync_request_id: input.requestId ?? null,
    updated_at: new Date().toISOString(),
  };

  try {
    const supabase = getAuthSupabase();
    const { data, error } = await supabase
      .from("migration_remediation_actions")
      .update(payload)
      .eq("id", input.id)
      .select(selectColumns())
      .maybeSingle();

    if (error) {
      return {
        status: isRemediationSchemaError(error.message) ? "not_configured" : "failed",
        warning: sqlWarning(error.message),
      };
    }
    if (!data) return { status: "not_found", warning: "整改行动项不存在。" };

    return { status: "succeeded", action: mapRemediationAction(data as unknown as Record<string, unknown>) };
  } catch (error) {
    return {
      status: "failed",
      warning: error instanceof Error ? error.message : "更新迁移整改飞书同步状态失败。",
    };
  }
}
