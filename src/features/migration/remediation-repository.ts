import { getAuthSupabase, isAuthStorageConfigured, type AppUser } from "../auth/server.ts";
import type { MigrationRemediationAction } from "./package.ts";

export type MigrationRemediationStatus = "待处理" | "处理中" | "待复检" | "已关闭";

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

const MIGRATION_REMEDIATION_SQL = "supabase-v5316-migration-remediation-actions.sql";
const VALID_STATUSES: MigrationRemediationStatus[] = ["待处理", "处理中", "待复检", "已关闭"];

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
    createdByName: typeof row.created_by_name === "string" ? row.created_by_name : null,
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
    closedAt: typeof row.closed_at === "string" ? row.closed_at : null,
  };
}

function selectColumns() {
  return "id,batch_id,batch_name,object_name,action_key,title,priority,owner_role,owner_name,due_date,status,source_issue,sample_refs,recommendation,acceptance_criteria,closure_note,review_result,created_by_name,created_at,updated_at,closed_at";
}

export function normalizeMigrationRemediationStatus(status: string): MigrationRemediationStatus | null {
  return VALID_STATUSES.includes(status as MigrationRemediationStatus)
    ? status as MigrationRemediationStatus
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
        status: isMissingRemediationTableError(error.message) ? "not_configured" : "failed",
        actions: [],
        warning: isMissingRemediationTableError(error.message)
          ? `迁移整改 SQL 未执行：请在 Supabase SQL Editor 执行 ${MIGRATION_REMEDIATION_SQL}。`
          : error.message,
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
        status: isMissingRemediationTableError(error.message) ? "not_configured" : "failed",
        warning: isMissingRemediationTableError(error.message)
          ? `迁移整改 SQL 未执行：请在 Supabase SQL Editor 执行 ${MIGRATION_REMEDIATION_SQL}。`
          : error.message,
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
        status: isMissingRemediationTableError(error.message) ? "not_configured" : "failed",
        warning: isMissingRemediationTableError(error.message)
          ? `迁移整改 SQL 未执行：请在 Supabase SQL Editor 执行 ${MIGRATION_REMEDIATION_SQL}。`
          : error.message,
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
