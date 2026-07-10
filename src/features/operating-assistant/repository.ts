import { getAuthSupabase, isAuthStorageConfigured, type AppUser } from "../auth/server.ts";
import type { BusinessContext, SubjectScope } from "../operating-model/context.ts";
import {
  loadContextProjectIdentityMappings,
  type PersistenceResult,
} from "../operating-model/persistence.ts";
import {
  buildAssistantChangeDraftInsert,
  buildBusinessUpdateFeishuPayload,
  type BusinessUpdateFeishuPayload,
  type AssistantChangeDraftInput,
  type AssistantFieldChange,
} from "./change-draft.ts";
import { buildFeishuActionPreview, validateFeishuActionBody } from "../feishu/action-payload.ts";
import type {
  AssistantDataClass,
  AssistantProjectIdentity,
  AssistantRole,
} from "./snapshot.ts";

export interface BusinessUpdateDraftRecord {
  id: string;
  orgId: string;
  subjectScope: SubjectScope;
  subjectId: string;
  projectId: string;
  businessRole: AssistantRole;
  sourceType: AssistantChangeDraftInput["sourceType"];
  sourceRecordId: string;
  dataClass: AssistantDataClass;
  changes: AssistantFieldChange[];
  status: "pending_confirmation" | "confirmed" | "cancelled" | "superseded";
  writebackStatus: "not_requested" | "queued" | "writing" | "succeeded" | "failed" | "cancelled";
  feishuConfirmationId: string | null;
  requestedBy: string;
  confirmedBy: string | null;
  confirmedAt: string | null;
  cancelledBy: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  requestId: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

function missing(message: string): boolean {
  return /business_update_drafts|project_identity_mappings|schema cache|relation .* does not exist|Could not find the table/i.test(message);
}

function mapDraft(row: Record<string, unknown>): BusinessUpdateDraftRecord {
  return {
    id: String(row.id),
    orgId: String(row.org_id),
    subjectScope: String(row.subject_scope) as SubjectScope,
    subjectId: String(row.subject_id),
    projectId: String(row.project_id),
    businessRole: String(row.business_role) as AssistantRole,
    sourceType: String(row.source_type) as BusinessUpdateDraftRecord["sourceType"],
    sourceRecordId: String(row.source_record_id),
    dataClass: String(row.data_class) as AssistantDataClass,
    changes: Array.isArray(row.changes) ? row.changes as AssistantFieldChange[] : [],
    status: String(row.status) as BusinessUpdateDraftRecord["status"],
    writebackStatus: String(row.writeback_status) as BusinessUpdateDraftRecord["writebackStatus"],
    feishuConfirmationId: row.feishu_confirmation_id ? String(row.feishu_confirmation_id) : null,
    requestedBy: String(row.requested_by),
    confirmedBy: row.confirmed_by ? String(row.confirmed_by) : null,
    confirmedAt: row.confirmed_at ? String(row.confirmed_at) : null,
    cancelledBy: row.cancelled_by ? String(row.cancelled_by) : null,
    cancelledAt: row.cancelled_at ? String(row.cancelled_at) : null,
    cancelReason: row.cancel_reason ? String(row.cancel_reason) : null,
    requestId: String(row.request_id),
    version: Number(row.version ?? 1),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export async function loadAssistantProjectIdentities(input: {
  context: Pick<BusinessContext, "orgId" | "subjectScope" | "subjectId">;
  dataClass: AssistantDataClass;
}): Promise<PersistenceResult<AssistantProjectIdentity[]>> {
  const mappings = await loadContextProjectIdentityMappings({ context: input.context, dataClass: input.dataClass });
  if (mappings.status !== "succeeded") return { status: mappings.status, warning: mappings.warning };
  const projectIds = [...new Set((mappings.data ?? []).map(item => item.projectId))];
  if (projectIds.length === 0) return { status: "succeeded", data: [] };
  if (!isAuthStorageConfigured()) return { status: "not_configured", warning: "AUTH_STORAGE_NOT_CONFIGURED" };
  const { data, error } = await getAuthSupabase().from("projects")
    .select("id,name,data_class")
    .in("id", projectIds)
    .eq("org_id", input.context.orgId)
    .eq("data_class", input.dataClass);
  if (error) return { status: missing(error.message) ? "not_configured" : "failed", warning: error.message };
  const names = new Map((data ?? []).map(row => [String(row.id), String(row.name || "未命名项目")]));
  return {
    status: "succeeded",
    data: (mappings.data ?? []).flatMap(mapping => {
      const projectName = names.get(mapping.projectId);
      if (!projectName) return [];
      return [{
        projectId: mapping.projectId,
        projectName,
        sourceRecordId: mapping.sourceRecordId,
        externalProjectCode: mapping.externalProjectCode,
        dataClass: mapping.dataClass,
      }];
    }),
  };
}

export async function loadAssistantActions(projectIds: string[]): Promise<PersistenceResult<Array<Record<string, unknown>>>> {
  if (!isAuthStorageConfigured()) return { status: "not_configured", warning: "AUTH_STORAGE_NOT_CONFIGURED" };
  if (projectIds.length === 0) return { status: "succeeded", data: [] };
  const { data, error } = await getAuthSupabase().from("unified_action_items")
    .select("id,project_id,title,status,priority,due_date,owner,owner_user_id,close_evidence,updated_at")
    .in("project_id", projectIds)
    .not("status", "in", "(closed,cancelled)")
    .order("due_date", { ascending: true, nullsFirst: false })
    .limit(300);
  if (error) return { status: missing(error.message) ? "not_configured" : "failed", warning: error.message };
  return { status: "succeeded", data: (data ?? []) as Array<Record<string, unknown>> };
}

export async function loadAssistantActionFacts(input: {
  actionId: string;
  projectId: string;
}): Promise<PersistenceResult<Record<string, unknown>>> {
  if (!isAuthStorageConfigured()) return { status: "not_configured", warning: "AUTH_STORAGE_NOT_CONFIGURED" };
  const { data, error } = await getAuthSupabase().from("unified_action_items")
    .select("id,project_id,status,due_date,owner,owner_user_id,close_evidence")
    .eq("id", input.actionId)
    .eq("project_id", input.projectId)
    .maybeSingle();
  if (error) return { status: missing(error.message) ? "not_configured" : "failed", warning: error.message };
  if (!data) return { status: "not_found", warning: "行动项不存在或不属于当前项目。" };
  return {
    status: "succeeded",
    data: {
      状态: data.status ?? null,
      截止日期: data.due_date ? String(data.due_date).slice(0, 10) : null,
      责任人: data.owner ?? data.owner_user_id ?? null,
      完成证据: data.close_evidence ?? null,
    },
  };
}

export async function createBusinessUpdateDraft(input: {
  draft: AssistantChangeDraftInput;
  context: BusinessContext;
  dataClass: AssistantDataClass;
  user: AppUser;
  requestId: string;
}): Promise<PersistenceResult<BusinessUpdateDraftRecord>> {
  if (!isAuthStorageConfigured()) return { status: "not_configured", warning: "AUTH_STORAGE_NOT_CONFIGURED" };
  const payload = buildAssistantChangeDraftInsert({
    input: input.draft,
    actorUserId: input.user.id,
    orgId: input.context.orgId,
    subjectScope: input.context.subjectScope,
    subjectId: input.context.subjectId,
    dataClass: input.dataClass,
    requestId: input.requestId,
  });
  const supabase = getAuthSupabase();
  const { data, error } = await supabase.from("business_update_drafts").insert(payload).select("*").single();
  if (!error && data) return { status: "succeeded", data: mapDraft(data as Record<string, unknown>) };
  if (error?.code === "23505") {
    const existing = await supabase.from("business_update_drafts").select("*")
      .eq("requested_by", input.user.id).eq("request_id", input.requestId).maybeSingle();
    if (!existing.error && existing.data) return { status: "succeeded", data: mapDraft(existing.data as Record<string, unknown>) };
  }
  return { status: error && missing(error.message) ? "not_configured" : "failed", warning: error?.message ?? "创建变更草稿失败。" };
}

export async function listBusinessUpdateDrafts(input: {
  context: Pick<BusinessContext, "orgId" | "subjectScope" | "subjectId" | "businessRole">;
  dataClass: AssistantDataClass;
  user: AppUser;
  limit?: number;
}): Promise<PersistenceResult<BusinessUpdateDraftRecord[]>> {
  if (!isAuthStorageConfigured()) return { status: "not_configured", warning: "AUTH_STORAGE_NOT_CONFIGURED" };
  let query = getAuthSupabase().from("business_update_drafts").select("*")
    .eq("org_id", input.context.orgId)
    .eq("subject_scope", input.context.subjectScope)
    .eq("subject_id", input.context.subjectId)
    .eq("business_role", input.context.businessRole)
    .eq("data_class", input.dataClass)
    .order("created_at", { ascending: false })
    .limit(Math.max(1, Math.min(input.limit ?? 50, 100)));
  if (input.user.role !== "admin") query = query.eq("requested_by", input.user.id);
  const { data, error } = await query;
  if (error) return { status: missing(error.message) ? "not_configured" : "failed", warning: error.message };
  return { status: "succeeded", data: (data ?? []).map(row => mapDraft(row as Record<string, unknown>)) };
}

export async function getBusinessUpdateDraft(input: {
  id: string;
  context: Pick<BusinessContext, "orgId" | "subjectScope" | "subjectId" | "businessRole">;
  dataClass: AssistantDataClass;
  user: AppUser;
}): Promise<PersistenceResult<BusinessUpdateDraftRecord>> {
  if (!isAuthStorageConfigured()) return { status: "not_configured", warning: "AUTH_STORAGE_NOT_CONFIGURED" };
  let query = getAuthSupabase().from("business_update_drafts").select("*")
    .eq("id", input.id)
    .eq("org_id", input.context.orgId)
    .eq("subject_scope", input.context.subjectScope)
    .eq("subject_id", input.context.subjectId)
    .eq("business_role", input.context.businessRole)
    .eq("data_class", input.dataClass);
  if (input.user.role !== "admin") query = query.eq("requested_by", input.user.id);
  const { data, error } = await query.maybeSingle();
  if (error) return { status: missing(error.message) ? "not_configured" : "failed", warning: error.message };
  if (!data) return { status: "not_found", warning: "变更草稿不存在或不属于当前业务范围。" };
  return { status: "succeeded", data: mapDraft(data as Record<string, unknown>) };
}

export async function decideBusinessUpdateDraft(input: {
  id: string;
  decision: "confirm" | "cancel";
  cancelReason?: string | null;
  user: AppUser;
  context: Pick<BusinessContext, "orgId" | "subjectScope" | "subjectId" | "businessRole">;
  dataClass: AssistantDataClass;
}): Promise<PersistenceResult<BusinessUpdateDraftRecord>> {
  if (!isAuthStorageConfigured()) return { status: "not_configured", warning: "AUTH_STORAGE_NOT_CONFIGURED" };
  const supabase = getAuthSupabase();
  let select = supabase.from("business_update_drafts").select("*")
    .eq("id", input.id)
    .eq("org_id", input.context.orgId)
    .eq("subject_scope", input.context.subjectScope)
    .eq("subject_id", input.context.subjectId)
    .eq("business_role", input.context.businessRole)
    .eq("data_class", input.dataClass);
  if (input.user.role !== "admin") select = select.eq("requested_by", input.user.id);
  const loaded = await select.maybeSingle();
  if (loaded.error) return { status: missing(loaded.error.message) ? "not_configured" : "failed", warning: loaded.error.message };
  if (!loaded.data) return { status: "not_found", warning: "变更草稿不存在或不属于当前业务范围。" };
  if (loaded.data.status !== "pending_confirmation") return { status: "conflict", data: mapDraft(loaded.data as Record<string, unknown>), warning: `当前状态为${loaded.data.status}，不能重复处理。` };
  const now = new Date().toISOString();
  const update = input.decision === "confirm"
    ? { status: "confirmed", confirmed_by: input.user.id, confirmed_at: now, updated_at: now, version: Number(loaded.data.version ?? 1) + 1 }
    : { status: "cancelled", cancelled_by: input.user.id, cancelled_at: now, cancel_reason: input.cancelReason?.trim() || "用户取消", updated_at: now, version: Number(loaded.data.version ?? 1) + 1 };
  const changed = await supabase.from("business_update_drafts").update(update)
    .eq("id", input.id).eq("status", "pending_confirmation").eq("version", loaded.data.version ?? 1).select("*").maybeSingle();
  if (changed.error) return { status: missing(changed.error.message) ? "not_configured" : "failed", warning: changed.error.message };
  if (!changed.data) return { status: "conflict", warning: "草稿已被其他操作处理，请刷新。" };
  return { status: "succeeded", data: mapDraft(changed.data as Record<string, unknown>) };
}

export interface QueuedBusinessUpdateWriteback {
  draft: BusinessUpdateDraftRecord;
  confirmationId: string;
  payload: BusinessUpdateFeishuPayload;
  duplicate: boolean;
}

export async function queueBusinessUpdateDraftWriteback(input: {
  draft: BusinessUpdateDraftRecord;
  user: AppUser;
  requestId: string;
}): Promise<PersistenceResult<QueuedBusinessUpdateWriteback>> {
  if (!isAuthStorageConfigured()) return { status: "not_configured", warning: "AUTH_STORAGE_NOT_CONFIGURED" };
  let payload: BusinessUpdateFeishuPayload;
  try {
    payload = buildBusinessUpdateFeishuPayload({
      draftId: input.draft.id,
      orgId: input.draft.orgId,
      projectId: input.draft.projectId,
      dataClass: input.draft.dataClass,
      sourceType: input.draft.sourceType,
      sourceRecordId: input.draft.sourceRecordId,
      // Queueing is a state transition and increments the draft version in the
      // same transaction. Bind the immutable payload to that post-transition version.
      version: input.draft.status === "pending_confirmation" ? input.draft.version + 1 : input.draft.version,
      changes: input.draft.changes,
    });
    validateFeishuActionBody(payload);
  } catch (error) {
    return { status: "conflict", warning: error instanceof Error ? error.message : "写回载荷不合法。" };
  }
  const preview = buildFeishuActionPreview(payload);
  const supabase = getAuthSupabase();
  const queued = await supabase.rpc("queue_business_update_draft_writeback_tx", {
    p_draft_id: input.draft.id,
    p_actor_user_id: input.user.id,
    p_expected_version: input.draft.version,
    p_payload: payload,
    p_preview: preview,
    p_request_id: input.requestId,
  });
  if (queued.error) {
    const message = queued.error.message;
    if (missing(message) || /queue_business_update_draft_writeback_tx/i.test(message)) {
      return { status: "not_configured", warning: "请先执行P19受控写回数据库迁移。" };
    }
    return { status: /CONFLICT|NOT_EXECUTABLE|MISMATCH|FORBIDDEN/i.test(message) ? "conflict" : "failed", warning: message };
  }
  const result = (queued.data && typeof queued.data === "object" ? queued.data : {}) as Record<string, unknown>;
  const confirmationId = String(result.confirmation_id || "");
  const saved = await supabase.from("business_update_drafts").select("*")
    .eq("id", input.draft.id).eq("feishu_confirmation_id", confirmationId).maybeSingle();
  if (saved.error || !saved.data || !confirmationId) return { status: "failed", warning: saved.error?.message ?? "写回队列已创建，但草稿链接校验失败。" };
  return {
    status: "succeeded",
    data: {
      draft: mapDraft(saved.data as Record<string, unknown>),
      confirmationId,
      payload,
      duplicate: result.duplicate === true,
    },
  };
}

export async function getBusinessUpdateDraftByConfirmation(
  confirmationId: string,
): Promise<PersistenceResult<BusinessUpdateDraftRecord>> {
  if (!isAuthStorageConfigured()) return { status: "not_configured", warning: "AUTH_STORAGE_NOT_CONFIGURED" };
  const { data, error } = await getAuthSupabase().from("business_update_drafts").select("*")
    .eq("feishu_confirmation_id", confirmationId).maybeSingle();
  if (error) return { status: missing(error.message) ? "not_configured" : "failed", warning: error.message };
  if (!data) return { status: "not_found", warning: "飞书确认队列未关联业务变化草稿。" };
  return { status: "succeeded", data: mapDraft(data as Record<string, unknown>) };
}

export interface ClaimedBusinessUpdateWriteback {
  draft: BusinessUpdateDraftRecord;
  attempt: number;
  leaseExpiresAt: string;
}

export async function claimBusinessUpdateWriteback(input: {
  confirmationId: string;
  actorUserId: string;
}): Promise<PersistenceResult<ClaimedBusinessUpdateWriteback>> {
  if (!isAuthStorageConfigured()) return { status: "not_configured", warning: "AUTH_STORAGE_NOT_CONFIGURED" };
  const claimed = await getAuthSupabase().rpc("claim_business_update_writeback_tx", {
    p_confirmation_id: input.confirmationId,
    p_actor_user_id: input.actorUserId,
  });
  if (claimed.error) {
    const message = claimed.error.message;
    if (missing(message) || /claim_business_update_writeback_tx/i.test(message)) return { status: "not_configured", warning: "请先执行P19受控写回数据库迁移。" };
    return { status: /CONFLICT|FORBIDDEN|MISMATCH/i.test(message) ? "conflict" : "failed", warning: message };
  }
  const result = claimed.data && typeof claimed.data === "object" ? claimed.data as Record<string, unknown> : {};
  const attempt = Number(result.attempt);
  const leaseExpiresAt = typeof result.lease_expires_at === "string" ? result.lease_expires_at : "";
  if (!Number.isInteger(attempt) || attempt < 1 || !Number.isFinite(Date.parse(leaseExpiresAt))) {
    return { status: "failed", warning: "写回租约回执不完整，系统未调用飞书。" };
  }
  const loaded = await getBusinessUpdateDraftByConfirmation(input.confirmationId);
  if (loaded.status !== "succeeded" || !loaded.data) return { status: loaded.status, warning: loaded.warning };
  return { status: "succeeded", data: { draft: loaded.data, attempt, leaseExpiresAt } };
}

export async function finalizeBusinessUpdateWriteback(input: {
  confirmationId: string;
  expectedAttempt: number;
  status: "succeeded" | "failed";
  resource?: Record<string, unknown> | null;
  errorCode?: string | null;
}): Promise<PersistenceResult<BusinessUpdateDraftRecord>> {
  if (!isAuthStorageConfigured()) return { status: "not_configured", warning: "AUTH_STORAGE_NOT_CONFIGURED" };
  const finalized = await getAuthSupabase().rpc("finalize_business_update_writeback_tx", {
    p_confirmation_id: input.confirmationId,
    p_expected_attempt: input.expectedAttempt,
    p_status: input.status,
    p_resource: input.resource ?? null,
    p_error_code: input.errorCode ?? null,
  });
  if (finalized.error) {
    const message = finalized.error.message;
    if (missing(message) || /finalize_business_update_writeback_tx/i.test(message)) return { status: "not_configured", warning: "请先执行P19受控写回数据库迁移。" };
    return { status: /CONFLICT|MISMATCH/i.test(message) ? "conflict" : "failed", warning: message };
  }
  return getBusinessUpdateDraftByConfirmation(input.confirmationId);
}

export async function cancelBusinessUpdateWriteback(input: {
  confirmationId: string;
  actorUserId: string;
  reason: string;
}): Promise<PersistenceResult<BusinessUpdateDraftRecord>> {
  if (!isAuthStorageConfigured()) return { status: "not_configured", warning: "AUTH_STORAGE_NOT_CONFIGURED" };
  const cancelled = await getAuthSupabase().rpc("cancel_business_update_writeback_tx", {
    p_confirmation_id: input.confirmationId,
    p_actor_user_id: input.actorUserId,
    p_reason: input.reason,
  });
  if (cancelled.error) {
    const message = cancelled.error.message;
    if (missing(message) || /cancel_business_update_writeback_tx/i.test(message)) return { status: "not_configured", warning: "请先执行P19受控写回数据库迁移。" };
    return { status: /CONFLICT|FORBIDDEN|MISMATCH/i.test(message) ? "conflict" : "failed", warning: message };
  }
  return getBusinessUpdateDraftByConfirmation(input.confirmationId);
}
