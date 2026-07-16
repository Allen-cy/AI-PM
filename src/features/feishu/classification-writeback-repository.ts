import { getAuthSupabase, isAuthStorageConfigured, type AppUser } from "../auth/server.ts";
import { buildFeishuActionPreview } from "./action-payload.ts";
import {
  buildDataClassificationWritebackPayload,
  currentChineseDataClass,
  type DataClassificationDraftIdentity,
  type GovernedClassification,
} from "./classification-writeback.ts";
import type { FeishuTableKey } from "./config.ts";

export type DataClassificationDraftStatus = "queued" | "writing" | "succeeded" | "failed" | "cancelled";

export type DataClassificationDraftRecord = DataClassificationDraftIdentity & {
  decisionReason: string;
  status: DataClassificationDraftStatus;
  requestedBy: string;
  feishuConfirmationId: string | null;
  writebackAttemptCount: number;
  writebackLeaseExpiresAt: string | null;
  errorCode: string | null;
  resource: Record<string, unknown> | null;
};

type Result<T> =
  | { status: "succeeded"; data: T }
  | { status: "not_found" | "not_configured" | "conflict" | "forbidden" | "failed"; warning: string; data?: T };

function missing(message?: string): boolean {
  return Boolean(message?.includes("feishu_data_classification_drafts") || message?.includes("create_v666_") || message?.includes("claim_v666_") || message?.includes("finalize_v666_") || message?.includes("cancel_v666_") || message?.includes("does not exist"));
}

function mapDraft(row: Record<string, unknown>): DataClassificationDraftRecord {
  return {
    id: String(row.id),
    orgId: String(row.org_id),
    quarantineId: String(row.quarantine_id),
    domain: String(row.domain) as FeishuTableKey,
    sourceRecordId: String(row.source_record_id),
    targetDataClass: String(row.target_data_class) as GovernedClassification,
    targetChineseValue: String(row.target_chinese_value) as DataClassificationDraftIdentity["targetChineseValue"],
    expectedChineseValue: row.expected_chinese_value ?? null,
    version: Number(row.version || 1),
    decisionReason: String(row.decision_reason || ""),
    status: String(row.status || "queued") as DataClassificationDraftStatus,
    requestedBy: String(row.requested_by),
    feishuConfirmationId: typeof row.feishu_confirmation_id === "string" ? row.feishu_confirmation_id : null,
    writebackAttemptCount: Number(row.writeback_attempt_count || 0),
    writebackLeaseExpiresAt: typeof row.writeback_lease_expires_at === "string" ? row.writeback_lease_expires_at : null,
    errorCode: typeof row.error_code === "string" ? row.error_code : null,
    resource: row.resource && typeof row.resource === "object" && !Array.isArray(row.resource) ? row.resource as Record<string, unknown> : null,
  };
}

export async function listActiveDataClassificationDrafts(quarantineIds: string[]): Promise<Result<DataClassificationDraftRecord[]>> {
  if (!isAuthStorageConfigured()) return { status: "not_configured", warning: "Supabase未配置。" };
  if (quarantineIds.length === 0) return { status: "succeeded", data: [] };
  const { data, error } = await getAuthSupabase().from("feishu_data_classification_drafts").select("*")
    .in("quarantine_id", quarantineIds.slice(0, 1000)).in("status", ["queued", "writing", "failed"])
    .order("created_at", { ascending: false });
  if (error) return { status: missing(error.message) ? "not_configured" : "failed", warning: error.message };
  return { status: "succeeded", data: (data ?? []).map(row => mapDraft(row as Record<string, unknown>)) };
}

export async function createDataClassificationDraft(input: {
  quarantine: {
    id: string;
    orgId: string;
    domain: FeishuTableKey;
    sourceRecordId: string;
    occurrenceCount: number;
    sourcePayload: Record<string, unknown>;
  };
  targetDataClass: GovernedClassification;
  targetChineseValue: DataClassificationDraftIdentity["targetChineseValue"];
  reason: string;
  user: AppUser;
  idempotencyKey: string;
  requestId: string;
}): Promise<Result<{ draft: DataClassificationDraftRecord; confirmationId: string; duplicate: boolean }>> {
  if (!isAuthStorageConfigured()) return { status: "not_configured", warning: "Supabase未配置。" };
  const id = crypto.randomUUID();
  const identity: DataClassificationDraftIdentity = {
    id,
    orgId: input.quarantine.orgId,
    quarantineId: input.quarantine.id,
    domain: input.quarantine.domain,
    sourceRecordId: input.quarantine.sourceRecordId,
    targetDataClass: input.targetDataClass,
    targetChineseValue: input.targetChineseValue,
    expectedChineseValue: currentChineseDataClass(input.quarantine.sourcePayload),
    version: 1,
  };
  const payload = buildDataClassificationWritebackPayload(identity);
  const preview = buildFeishuActionPreview(payload);
  const created = await getAuthSupabase().rpc("create_v666_data_classification_draft_tx", {
    p_draft_id: id,
    p_quarantine_id: input.quarantine.id,
    p_target_data_class: input.targetDataClass,
    p_reason: input.reason,
    p_actor_user_id: input.user.id,
    p_expected_occurrence_count: input.quarantine.occurrenceCount,
    p_idempotency_key: input.idempotencyKey,
    p_payload: payload,
    p_preview: preview,
    p_request_id: input.requestId,
  });
  if (created.error) {
    const message = created.error.message;
    return { status: missing(message) ? "not_configured" : /FORBIDDEN|PMO_REQUIRED|EXPIRED/i.test(message) ? "forbidden" : /CONFLICT|ALREADY|SAMPLE_TO_PRODUCTION|MISMATCH|ACTIONABLE/i.test(message) ? "conflict" : "failed", warning: message };
  }
  const receipt = created.data && typeof created.data === "object" ? created.data as Record<string, unknown> : {};
  const draftId = String(receipt.draft_id || id);
  const confirmationId = String(receipt.confirmation_id || "");
  const loaded = await getAuthSupabase().from("feishu_data_classification_drafts").select("*").eq("id", draftId).maybeSingle();
  if (loaded.error || !loaded.data || !confirmationId) return { status: "failed", warning: loaded.error?.message || "分类草稿回执不完整。" };
  return { status: "succeeded", data: { draft: mapDraft(loaded.data as Record<string, unknown>), confirmationId, duplicate: receipt.duplicate === true } };
}

export async function getDataClassificationDraftByConfirmation(confirmationId: string): Promise<Result<DataClassificationDraftRecord>> {
  if (!isAuthStorageConfigured()) return { status: "not_configured", warning: "Supabase未配置。" };
  const { data, error } = await getAuthSupabase().from("feishu_data_classification_drafts").select("*")
    .eq("feishu_confirmation_id", confirmationId).maybeSingle();
  if (error) return { status: missing(error.message) ? "not_configured" : "failed", warning: error.message };
  if (!data) return { status: "not_found", warning: "确认队列未关联数据分类草稿。" };
  return { status: "succeeded", data: mapDraft(data as Record<string, unknown>) };
}

export async function claimDataClassificationWriteback(input: { confirmationId: string; actorUserId: string }): Promise<Result<{ draft: DataClassificationDraftRecord; attempt: number; leaseExpiresAt: string }>> {
  if (!isAuthStorageConfigured()) return { status: "not_configured", warning: "Supabase未配置。" };
  const claimed = await getAuthSupabase().rpc("claim_v666_data_classification_writeback_tx", { p_confirmation_id: input.confirmationId, p_actor_user_id: input.actorUserId });
  if (claimed.error) return { status: missing(claimed.error.message) ? "not_configured" : /FORBIDDEN|EXPIRED/i.test(claimed.error.message) ? "forbidden" : /CONFLICT|MISMATCH|IN_PROGRESS/i.test(claimed.error.message) ? "conflict" : "failed", warning: claimed.error.message };
  const receipt = claimed.data && typeof claimed.data === "object" ? claimed.data as Record<string, unknown> : {};
  const loaded = await getDataClassificationDraftByConfirmation(input.confirmationId);
  if (loaded.status !== "succeeded") return { status: loaded.status, warning: loaded.warning };
  const attempt = Number(receipt.attempt);
  const leaseExpiresAt = String(receipt.lease_expires_at || "");
  if (!Number.isInteger(attempt) || attempt < 1 || !Number.isFinite(Date.parse(leaseExpiresAt))) return { status: "failed", warning: "分类写回租约回执不完整。" };
  return { status: "succeeded", data: { draft: loaded.data, attempt, leaseExpiresAt } };
}

export async function finalizeDataClassificationWriteback(input: { confirmationId: string; expectedAttempt: number; status: "succeeded" | "failed"; resource?: Record<string, unknown> | null; errorCode?: string | null; actorUserId: string }): Promise<Result<DataClassificationDraftRecord>> {
  const result = await getAuthSupabase().rpc("finalize_v666_data_classification_writeback_tx", {
    p_confirmation_id: input.confirmationId,
    p_expected_attempt: input.expectedAttempt,
    p_status: input.status,
    p_resource: input.resource ?? null,
    p_error_code: input.errorCode ?? null,
    p_actor_user_id: input.actorUserId,
  });
  if (result.error) return { status: missing(result.error.message) ? "not_configured" : /CONFLICT|MISMATCH|TOKEN/i.test(result.error.message) ? "conflict" : "failed", warning: result.error.message };
  return getDataClassificationDraftByConfirmation(input.confirmationId);
}

export async function cancelDataClassificationWriteback(input: { confirmationId: string; actorUserId: string; reason: string }): Promise<Result<DataClassificationDraftRecord>> {
  const result = await getAuthSupabase().rpc("cancel_v666_data_classification_writeback_tx", {
    p_confirmation_id: input.confirmationId,
    p_actor_user_id: input.actorUserId,
    p_reason: input.reason,
  });
  if (result.error) return { status: missing(result.error.message) ? "not_configured" : /FORBIDDEN/i.test(result.error.message) ? "forbidden" : /CONFLICT/i.test(result.error.message) ? "conflict" : "failed", warning: result.error.message };
  return getDataClassificationDraftByConfirmation(input.confirmationId);
}
