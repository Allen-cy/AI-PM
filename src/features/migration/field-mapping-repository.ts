import { getAuthSupabase, isAuthStorageConfigured, type AppUser } from "../auth/server.ts";
import type { MigrationAnalysisResult, MigrationFieldMapping, MigrationFieldMappingProfileSnapshot } from "./package.ts";

export interface MigrationFieldMappingProfileRecord extends MigrationFieldMappingProfileSnapshot {
  id: string;
  profileName: string;
  objectName: string;
  mappings: MigrationFieldMapping[];
  sourceFields: string[];
  requiredFields: string[];
  fieldCoverageRate: number;
  matchedFieldCount: number;
  missingFieldCount: number;
  notes: string | null;
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SaveMigrationFieldMappingProfileInput {
  profileName?: string;
  analysis: MigrationAnalysisResult;
  notes?: string | null;
}

export type MigrationFieldMappingProfileListResult =
  | { status: "succeeded"; profiles: MigrationFieldMappingProfileRecord[] }
  | { status: "not_configured"; profiles: MigrationFieldMappingProfileRecord[]; warning: string }
  | { status: "failed"; profiles: MigrationFieldMappingProfileRecord[]; warning: string };

export type MigrationFieldMappingProfileSaveResult =
  | { status: "succeeded"; profile: MigrationFieldMappingProfileRecord }
  | { status: "not_configured"; warning: string }
  | { status: "failed"; warning: string };

const MIGRATION_FIELD_MAPPING_SQL = "supabase-v5318-migration-field-mapping-profiles.sql";

function actorName(user: AppUser | null): string | null {
  return user?.name || user?.email || user?.phone || null;
}

function defaultProfileName(analysis: MigrationAnalysisResult): string {
  const stamp = analysis.generatedAt.replace(/\D/g, "").slice(0, 12);
  return `${analysis.objectName}-字段映射方案-${stamp || "待命名"}`;
}

function isMissingFieldMappingTableError(message?: string): boolean {
  const normalized = (message ?? "").toLowerCase();
  return normalized.includes("migration_field_mapping_profiles")
    && (
      normalized.includes("does not exist")
      || normalized.includes("relation")
      || normalized.includes("schema cache")
      || normalized.includes("could not find the table")
    );
}

function selectColumns(): string {
  return [
    "id",
    "profile_name",
    "object_name",
    "mappings",
    "source_fields",
    "required_fields",
    "field_coverage_rate",
    "matched_field_count",
    "missing_field_count",
    "notes",
    "created_by_name",
    "created_at",
    "updated_at",
  ].join(",");
}

function mapProfile(row: Record<string, unknown>): MigrationFieldMappingProfileRecord {
  return {
    id: String(row.id),
    profileName: String(row.profile_name ?? ""),
    objectName: String(row.object_name ?? ""),
    mappings: Array.isArray(row.mappings) ? row.mappings as MigrationFieldMapping[] : [],
    sourceFields: Array.isArray(row.source_fields) ? row.source_fields.map(String) : [],
    requiredFields: Array.isArray(row.required_fields) ? row.required_fields.map(String) : [],
    fieldCoverageRate: Number(row.field_coverage_rate ?? 0),
    matchedFieldCount: Number(row.matched_field_count ?? 0),
    missingFieldCount: Number(row.missing_field_count ?? 0),
    notes: typeof row.notes === "string" ? row.notes : null,
    createdByName: typeof row.created_by_name === "string" ? row.created_by_name : null,
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
  };
}

export async function listMigrationFieldMappingProfiles(
  objectName?: string | null,
  limit = 20,
): Promise<MigrationFieldMappingProfileListResult> {
  if (!isAuthStorageConfigured()) {
    return {
      status: "not_configured",
      profiles: [],
      warning: "Supabase 未配置，无法读取字段映射方案。",
    };
  }

  try {
    const supabase = getAuthSupabase();
    let query = supabase
      .from("migration_field_mapping_profiles")
      .select(selectColumns())
      .order("created_at", { ascending: false })
      .limit(limit);
    if (objectName) query = query.eq("object_name", objectName);
    const { data, error } = await query;

    if (error) {
      return {
        status: isMissingFieldMappingTableError(error.message) ? "not_configured" : "failed",
        profiles: [],
        warning: isMissingFieldMappingTableError(error.message)
          ? `字段映射方案 SQL 未执行：请在 Supabase SQL Editor 执行 ${MIGRATION_FIELD_MAPPING_SQL}。`
          : error.message,
      };
    }

    return {
      status: "succeeded",
      profiles: (data ?? []).map(row => mapProfile(row as unknown as Record<string, unknown>)),
    };
  } catch (error) {
    return {
      status: "failed",
      profiles: [],
      warning: error instanceof Error ? error.message : "读取字段映射方案失败。",
    };
  }
}

export async function saveMigrationFieldMappingProfile(
  input: SaveMigrationFieldMappingProfileInput,
  user: AppUser | null,
): Promise<MigrationFieldMappingProfileSaveResult> {
  if (!isAuthStorageConfigured()) {
    return {
      status: "not_configured",
      warning: "Supabase 未配置，无法保存字段映射方案。",
    };
  }

  const payload = {
    profile_name: (input.profileName || defaultProfileName(input.analysis)).trim(),
    object_name: input.analysis.objectName,
    mappings: input.analysis.mappings,
    source_fields: input.analysis.sourceFields ?? [],
    required_fields: input.analysis.mappings.map(mapping => mapping.targetField),
    field_coverage_rate: input.analysis.fieldCoverage.rate,
    matched_field_count: input.analysis.fieldCoverage.matched,
    missing_field_count: input.analysis.fieldCoverage.missing,
    notes: input.notes?.trim() || null,
    created_by: user?.id ?? null,
    created_by_name: actorName(user),
  };

  try {
    const supabase = getAuthSupabase();
    const { data, error } = await supabase
      .from("migration_field_mapping_profiles")
      .insert(payload)
      .select(selectColumns())
      .single();

    if (error) {
      return {
        status: isMissingFieldMappingTableError(error.message) ? "not_configured" : "failed",
        warning: isMissingFieldMappingTableError(error.message)
          ? `字段映射方案 SQL 未执行：请在 Supabase SQL Editor 执行 ${MIGRATION_FIELD_MAPPING_SQL}。`
          : error.message,
      };
    }

    return { status: "succeeded", profile: mapProfile(data as unknown as Record<string, unknown>) };
  } catch (error) {
    return {
      status: "failed",
      warning: error instanceof Error ? error.message : "保存字段映射方案失败。",
    };
  }
}
