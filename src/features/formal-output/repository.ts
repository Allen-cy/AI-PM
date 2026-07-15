import { getAuthSupabase, isAuthStorageConfigured, type AppUser } from "../auth/server.ts";
import type { BusinessRole, SubjectScope } from "../operating-model/context.ts";
import type { FormalOutputDataClass, FormalOutputStatus, FormalOutputType } from "./contracts.ts";

export type FormalOutputRecord = {
  id: string;
  orgId: string;
  subjectScope: SubjectScope;
  subjectId: string;
  projectId: string | null;
  dataClass: FormalOutputDataClass;
  outputType: FormalOutputType;
  outputKey: string;
  title: string;
  contentType: string;
  content: string;
  structuredPayload: Record<string, unknown>;
  sourceDefinition: Record<string, unknown>;
  sourceSnapshotAt: string;
  status: FormalOutputStatus;
  version: number;
  stateVersion: number;
  contentHash: string;
  reportingSnapshotId: string | null;
  meetingId: string | null;
  migrationBatchId: string | null;
  knowledgeItemId: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type FormalOutputResult<T> = {
  status: "succeeded" | "not_configured" | "not_found" | "conflict" | "failed";
  data?: T;
  warning?: string;
};

export type SaveFormalOutputInput = {
  orgId: string;
  subjectScope: SubjectScope;
  subjectId: string;
  projectId: string | null;
  dataClass: FormalOutputDataClass;
  outputType: FormalOutputType;
  outputKey: string;
  title: string;
  contentType: string;
  content: string;
  structuredPayload: Record<string, unknown>;
  sourceDefinition: Record<string, unknown>;
  sourceSnapshotAt: string;
  reportingSnapshotId?: string | null;
  meetingId?: string | null;
  migrationBatchId?: string | null;
  knowledgeItemId?: string | null;
  actor: AppUser;
  actorBusinessRole: BusinessRole;
  idempotencyKey: string;
  expectedVersion: number;
};

export type SaveFormalReportInput = SaveFormalOutputInput & {
  snapshotType: "daily" | "weekly" | "monthly" | "quarterly" | "ad_hoc";
  periodStart: string;
  periodEnd: string;
  metrics: Record<string, unknown>;
  exceptions: Array<Record<string, unknown>>;
  narrative: string;
};

function missingStorage(message: string): boolean {
  return /formal_business_outputs|save_v634_|relation .* does not exist|schema cache|Could not find the table/i.test(message);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function mapOutput(row: Record<string, unknown>): FormalOutputRecord {
  return {
    id: String(row.id), orgId: String(row.org_id), subjectScope: String(row.subject_scope) as SubjectScope,
    subjectId: String(row.subject_id), projectId: row.project_id ? String(row.project_id) : null,
    dataClass: String(row.data_class) as FormalOutputDataClass, outputType: String(row.output_type) as FormalOutputType,
    outputKey: String(row.output_key), title: String(row.title), contentType: String(row.content_type), content: String(row.content),
    structuredPayload: asRecord(row.structured_payload), sourceDefinition: asRecord(row.source_definition),
    sourceSnapshotAt: String(row.source_snapshot_at), status: String(row.status) as FormalOutputStatus,
    version: Number(row.version || 1), stateVersion: Number(row.state_version || 1), contentHash: String(row.content_hash || ""),
    reportingSnapshotId: row.reporting_snapshot_id ? String(row.reporting_snapshot_id) : null,
    meetingId: row.meeting_id ? String(row.meeting_id) : null, migrationBatchId: row.migration_batch_id ? String(row.migration_batch_id) : null,
    knowledgeItemId: row.knowledge_item_id ? String(row.knowledge_item_id) : null, createdBy: row.created_by ? String(row.created_by) : null,
    createdAt: String(row.created_at), updatedAt: String(row.updated_at),
  };
}

export async function listFormalBusinessOutputs(input: {
  orgId: string; subjectScope: SubjectScope; subjectId: string; dataClass: FormalOutputDataClass;
  outputTypes?: FormalOutputType[]; projectId?: string | null; limit?: number;
}): Promise<FormalOutputResult<FormalOutputRecord[]>> {
  if (!isAuthStorageConfigured()) return { status: "not_configured", warning: "AUTH_STORAGE_NOT_CONFIGURED" };
  let query = getAuthSupabase().from("formal_business_outputs").select("*")
    .eq("org_id", input.orgId).eq("subject_scope", input.subjectScope).eq("subject_id", input.subjectId).eq("data_class", input.dataClass)
    .neq("status", "archived").order("created_at", { ascending: false }).limit(Math.min(Math.max(input.limit ?? 50, 1), 200));
  if (input.outputTypes?.length) query = query.in("output_type", input.outputTypes);
  if (input.projectId) query = query.eq("project_id", input.projectId);
  const { data, error } = await query;
  if (error) return { status: missingStorage(error.message) ? "not_configured" : "failed", warning: error.message };
  return { status: "succeeded", data: (data ?? []).map(row => mapOutput(row as Record<string, unknown>)) };
}

export async function getFormalBusinessOutput(id: string): Promise<FormalOutputResult<FormalOutputRecord>> {
  if (!isAuthStorageConfigured()) return { status: "not_configured", warning: "AUTH_STORAGE_NOT_CONFIGURED" };
  const { data, error } = await getAuthSupabase().from("formal_business_outputs").select("*").eq("id", id).maybeSingle();
  if (error) return { status: missingStorage(error.message) ? "not_configured" : "failed", warning: error.message };
  if (!data) return { status: "not_found", warning: "正式业务成果不存在。" };
  return { status: "succeeded", data: mapOutput(data as Record<string, unknown>) };
}

export async function getLatestFormalOutputVersion(input: {
  orgId: string; subjectScope: SubjectScope; subjectId: string; dataClass: FormalOutputDataClass; outputKey: string;
}): Promise<FormalOutputResult<number>> {
  if (!isAuthStorageConfigured()) return { status: "not_configured", warning: "AUTH_STORAGE_NOT_CONFIGURED" };
  const { data, error } = await getAuthSupabase().from("formal_business_outputs").select("version")
    .eq("org_id", input.orgId).eq("subject_scope", input.subjectScope).eq("subject_id", input.subjectId).eq("data_class", input.dataClass)
    .eq("output_key", input.outputKey).order("version", { ascending: false }).limit(1).maybeSingle();
  if (error) return { status: missingStorage(error.message) ? "not_configured" : "failed", warning: error.message };
  return { status: "succeeded", data: Number(data?.version || 0) };
}

function saveParams(input: SaveFormalOutputInput) {
  return {
    p_org_id: input.orgId, p_subject_scope: input.subjectScope, p_subject_id: input.subjectId, p_project_id: input.projectId,
    p_data_class: input.dataClass, p_output_type: input.outputType, p_output_key: input.outputKey, p_title: input.title,
    p_content_type: input.contentType, p_content: input.content, p_structured_payload: input.structuredPayload,
    p_source_definition: input.sourceDefinition, p_source_snapshot_at: input.sourceSnapshotAt,
    p_reporting_snapshot_id: input.reportingSnapshotId ?? null, p_meeting_id: input.meetingId ?? null,
    p_migration_batch_id: input.migrationBatchId ?? null, p_knowledge_item_id: input.knowledgeItemId ?? null,
    p_actor_user_id: input.actor.id, p_actor_business_role: input.actorBusinessRole,
    p_idempotency_key: input.idempotencyKey, p_expected_version: input.expectedVersion,
  };
}

export async function saveFormalBusinessOutput(input: SaveFormalOutputInput): Promise<FormalOutputResult<FormalOutputRecord>> {
  if (!isAuthStorageConfigured()) return { status: "not_configured", warning: "AUTH_STORAGE_NOT_CONFIGURED" };
  const { data, error } = await getAuthSupabase().rpc("save_v634_formal_output_tx", saveParams(input));
  if (error) return { status: /CONFLICT|VERSION|IDEMPOTENCY|REQUIRED|FORBIDDEN|MISMATCH/i.test(error.message) ? "conflict" : missingStorage(error.message) ? "not_configured" : "failed", warning: error.message };
  return { status: "succeeded", data: mapOutput(asRecord(data)) };
}

export async function saveFormalReportWithSnapshot(input: SaveFormalReportInput): Promise<FormalOutputResult<{ output: FormalOutputRecord; snapshot: Record<string, unknown> }>> {
  if (!isAuthStorageConfigured()) return { status: "not_configured", warning: "AUTH_STORAGE_NOT_CONFIGURED" };
  const { data, error } = await getAuthSupabase().rpc("save_v634_report_output_tx", {
    ...saveParams(input), p_snapshot_type: input.snapshotType, p_period_start: input.periodStart, p_period_end: input.periodEnd,
    p_metrics: input.metrics, p_exceptions: input.exceptions, p_narrative: input.narrative,
  });
  if (error) return { status: /CONFLICT|VERSION|IDEMPOTENCY|REQUIRED|FORBIDDEN|MISMATCH|INVALID/i.test(error.message) ? "conflict" : missingStorage(error.message) ? "not_configured" : "failed", warning: error.message };
  const record = asRecord(data);
  return { status: "succeeded", data: { output: mapOutput(asRecord(record.output)), snapshot: asRecord(record.snapshot) } };
}

export async function transitionFormalBusinessOutput(input: {
  output: FormalOutputRecord; operation: "submit" | "approve" | "publish" | "archive"; reason: string;
  actor: AppUser; actorBusinessRole: BusinessRole; expectedStateVersion: number; requestId: string;
}): Promise<FormalOutputResult<FormalOutputRecord>> {
  if (!isAuthStorageConfigured()) return { status: "not_configured", warning: "AUTH_STORAGE_NOT_CONFIGURED" };
  const { data, error } = await getAuthSupabase().rpc("transition_v634_formal_output_tx", {
    p_output_id: input.output.id, p_org_id: input.output.orgId, p_subject_scope: input.output.subjectScope,
    p_subject_id: input.output.subjectId, p_data_class: input.output.dataClass, p_operation: input.operation,
    p_expected_state_version: input.expectedStateVersion, p_reason: input.reason || null,
    p_actor_user_id: input.actor.id, p_actor_business_role: input.actorBusinessRole, p_request_id: input.requestId,
  });
  if (error) return { status: /CONFLICT|VERSION|FORBIDDEN|TRANSITION|REQUIRED/i.test(error.message) ? "conflict" : missingStorage(error.message) ? "not_configured" : "failed", warning: error.message };
  return { status: "succeeded", data: mapOutput(asRecord(data)) };
}
