import { getAuthSupabase, isAuthStorageConfigured, type AppUser } from "../auth/server.ts";
import { summarizeMigrationBatch, type MigrationAnalysisResult } from "./package.ts";

export interface MigrationBatchRecord {
  id: string;
  batchName: string;
  objectName: string;
  fileName: string | null;
  totalRows: number;
  fieldCoverageRate: number;
  missingRequiredFields: number;
  qualityIssueCount: number;
  highIssueCount: number;
  canTrialImport: boolean;
  analysis: MigrationAnalysisResult;
  nextActions: string[];
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MigrationBatchSaveInput {
  batchName?: string;
  fileName?: string | null;
  analysis: MigrationAnalysisResult;
}

export type MigrationBatchResult =
  | { status: "succeeded"; batch: MigrationBatchRecord }
  | { status: "not_configured"; warning: string }
  | { status: "failed"; warning: string };

export type MigrationBatchListResult =
  | { status: "succeeded"; batches: MigrationBatchRecord[] }
  | { status: "not_configured"; batches: MigrationBatchRecord[]; warning: string }
  | { status: "failed"; batches: MigrationBatchRecord[]; warning: string };

const MIGRATION_BATCH_SQL = "supabase-v5313-migration-batches.sql";

function isMissingMigrationBatchTableError(message?: string): boolean {
  const normalized = (message ?? "").toLowerCase();
  return normalized.includes("migration_trial_batches")
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

function defaultBatchName(analysis: MigrationAnalysisResult): string {
  const stamp = analysis.generatedAt
    .replace(/\D/g, "")
    .slice(0, 12);
  return `${analysis.objectName}-试迁移批次-${stamp || "待命名"}`;
}

function mapMigrationBatch(row: Record<string, unknown>): MigrationBatchRecord {
  return {
    id: String(row.id),
    batchName: String(row.batch_name ?? ""),
    objectName: String(row.object_name ?? ""),
    fileName: typeof row.file_name === "string" ? row.file_name : null,
    totalRows: Number(row.total_rows ?? 0),
    fieldCoverageRate: Number(row.field_coverage_rate ?? 0),
    missingRequiredFields: Number(row.missing_required_fields ?? 0),
    qualityIssueCount: Number(row.quality_issue_count ?? 0),
    highIssueCount: Number(row.high_issue_count ?? 0),
    canTrialImport: Boolean(row.can_trial_import),
    analysis: row.analysis as MigrationAnalysisResult,
    nextActions: Array.isArray(row.next_actions) ? row.next_actions.map(String) : [],
    createdByName: typeof row.created_by_name === "string" ? row.created_by_name : null,
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
  };
}

export async function listMigrationBatches(limit = 20): Promise<MigrationBatchListResult> {
  if (!isAuthStorageConfigured()) {
    return {
      status: "not_configured",
      batches: [],
      warning: "Supabase 未配置，无法读取迁移批次历史。",
    };
  }

  try {
    const supabase = getAuthSupabase();
    const { data, error } = await supabase
      .from("migration_trial_batches")
      .select("id,batch_name,object_name,file_name,total_rows,field_coverage_rate,missing_required_fields,quality_issue_count,high_issue_count,can_trial_import,analysis,next_actions,created_by_name,created_at,updated_at")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      return {
        status: isMissingMigrationBatchTableError(error.message) ? "not_configured" : "failed",
        batches: [],
        warning: isMissingMigrationBatchTableError(error.message)
          ? `迁移批次 SQL 未执行：请在 Supabase SQL Editor 执行 ${MIGRATION_BATCH_SQL}。`
          : error.message,
      };
    }

    return {
      status: "succeeded",
      batches: (data ?? []).map(row => mapMigrationBatch(row as Record<string, unknown>)),
    };
  } catch (error) {
    return {
      status: "failed",
      batches: [],
      warning: error instanceof Error ? error.message : "读取迁移批次失败。",
    };
  }
}

export async function saveMigrationBatch(
  input: MigrationBatchSaveInput,
  user: AppUser | null,
): Promise<MigrationBatchResult> {
  if (!isAuthStorageConfigured()) {
    return {
      status: "not_configured",
      warning: "Supabase 未配置，无法保存迁移批次。",
    };
  }

  const metrics = summarizeMigrationBatch(input.analysis);
  const payload = {
    batch_name: (input.batchName || defaultBatchName(input.analysis)).trim(),
    object_name: input.analysis.objectName,
    file_name: input.fileName || null,
    total_rows: metrics.totalRows,
    field_coverage_rate: metrics.fieldCoverageRate,
    missing_required_fields: metrics.missingRequiredFields,
    quality_issue_count: metrics.qualityIssueCount,
    high_issue_count: metrics.highIssueCount,
    can_trial_import: metrics.canTrialImport,
    analysis: input.analysis,
    next_actions: metrics.nextActions,
    created_by: user?.id ?? null,
    created_by_name: actorName(user),
  };

  try {
    const supabase = getAuthSupabase();
    const { data, error } = await supabase
      .from("migration_trial_batches")
      .insert(payload)
      .select("id,batch_name,object_name,file_name,total_rows,field_coverage_rate,missing_required_fields,quality_issue_count,high_issue_count,can_trial_import,analysis,next_actions,created_by_name,created_at,updated_at")
      .single();

    if (error) {
      return {
        status: isMissingMigrationBatchTableError(error.message) ? "not_configured" : "failed",
        warning: isMissingMigrationBatchTableError(error.message)
          ? `迁移批次 SQL 未执行：请在 Supabase SQL Editor 执行 ${MIGRATION_BATCH_SQL}。`
          : error.message,
      };
    }

    return { status: "succeeded", batch: mapMigrationBatch(data as Record<string, unknown>) };
  } catch (error) {
    return {
      status: "failed",
      warning: error instanceof Error ? error.message : "保存迁移批次失败。",
    };
  }
}
