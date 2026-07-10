import {
  buildFeishuActionPreview,
  validateFeishuActionBody,
  type FeishuActionBody,
  type FeishuActionPreview,
  type FeishuActionType,
} from "./action-payload.ts";

export interface AppUser {
  id: string;
  email: string;
  phone: string;
  name: string | null;
  role: "admin" | "user";
  status: "active" | "disabled";
}

export type FeishuActionConfirmationStatus =
  | "pending_confirmation"
  | "confirmed"
  | "writing"
  | "succeeded"
  | "failed"
  | "cancelled";

export interface FeishuActionConfirmationRecord {
  id: string;
  requesterId: string | null;
  requesterName: string | null;
  requesterEmail: string | null;
  source: "api_token" | "user_center" | "integration_center" | "system";
  sourcePage: string | null;
  actionType: FeishuActionType;
  idempotencyKey: string;
  targetSummary: string;
  riskLevel: "low" | "medium" | "high";
  status: FeishuActionConfirmationStatus;
  payload: FeishuActionBody;
  preview: FeishuActionPreview;
  resource: Record<string, unknown> | null;
  errorCode: string | null;
  cancelReason: string | null;
  requestId: string | null;
  createdAt: string;
  updatedAt?: string;
  confirmedAt: string | null;
  executedAt: string | null;
  cancelledAt: string | null;
  writebackAttemptCount?: number;
  writebackLastAttemptAt?: string | null;
  writebackLeaseExpiresAt?: string | null;
  writebackLastError?: string | null;
}

export type FeishuActionConfirmationRiskReviewLevel = "low" | "medium" | "high";
export type FeishuActionConfirmationRiskReviewCheckStatus = "pass" | "warning" | "block";

export interface FeishuActionConfirmationRiskReview {
  confirmationId: string;
  riskLevel: FeishuActionConfirmationRiskReviewLevel;
  baseRiskLevel: FeishuActionConfirmationRiskReviewLevel;
  canConfirm: boolean;
  canCancel: boolean;
  requiresSecondConfirm: boolean;
  ageDays: number | null;
  blockingIssues: string[];
  warnings: string[];
  checklist: Array<{
    id: string;
    label: string;
    status: FeishuActionConfirmationRiskReviewCheckStatus;
    detail: string;
  }>;
  suggestedAction: "confirm" | "review" | "cancel";
}

export interface FeishuActionConfirmationBatchRiskReview {
  selectedCount: number;
  confirmableCount: number;
  blockedCount: number;
  highRiskCount: number;
  requiresSecondConfirmCount: number;
  confirmableIds: string[];
  blockedIds: string[];
  warnings: string[];
  blockingIssues: string[];
  reviews: FeishuActionConfirmationRiskReview[];
  decisionText: string;
}

export interface FeishuActionConfirmationQueueSummary {
  basis: "current_page";
  totalCount: number;
  pendingCount: number;
  failedCount: number;
  highRiskPendingCount: number;
  overduePendingCount: number;
  requiresSecondConfirmCount: number;
  reminderDrafts: Array<{
    id: string;
    priority: "P0" | "P1" | "P2";
    title: string;
    detail: string;
    nextAction: string;
    targetSummary: string;
  }>;
}

export type FeishuActionConfirmationWriteResult =
  | { status: "succeeded"; confirmation: FeishuActionConfirmationRecord }
  | { status: "not_configured"; warning: string; migration?: string }
  | { status: "failed"; warning: string };

export type FeishuActionConfirmationListResult =
  | { status: "succeeded"; confirmations: FeishuActionConfirmationRecord[] }
  | { status: "not_configured"; confirmations: []; warning: string; migration?: string }
  | { status: "failed"; confirmations: []; warning: string };

function isMissingTableError(message?: string): boolean {
  return Boolean(
    message?.includes("feishu_action_confirmations")
    || message?.includes("relation")
    || message?.includes("does not exist"),
  );
}

function requesterName(user: AppUser | null): string | null {
  return user?.name || user?.email || user?.phone || null;
}

function mapRow(row: Record<string, unknown>): FeishuActionConfirmationRecord {
  return {
    id: String(row.id),
    requesterId: typeof row.requester_id === "string" ? row.requester_id : null,
    requesterName: typeof row.requester_name === "string" ? row.requester_name : null,
    requesterEmail: typeof row.requester_email === "string" ? row.requester_email : null,
    source: String(row.source || "system") as FeishuActionConfirmationRecord["source"],
    sourcePage: typeof row.source_page === "string" ? row.source_page : null,
    actionType: String(row.action_type || "message") as FeishuActionType,
    idempotencyKey: String(row.idempotency_key || ""),
    targetSummary: String(row.target_summary || ""),
    riskLevel: String(row.risk_level || "medium") as FeishuActionConfirmationRecord["riskLevel"],
    status: String(row.status || "pending_confirmation") as FeishuActionConfirmationStatus,
    payload: (row.payload && typeof row.payload === "object" ? row.payload : {}) as FeishuActionBody,
    preview: (row.preview && typeof row.preview === "object" ? row.preview : buildFeishuActionPreview((row.payload ?? {}) as FeishuActionBody)) as FeishuActionPreview,
    resource: row.resource && typeof row.resource === "object" ? row.resource as Record<string, unknown> : null,
    errorCode: typeof row.error_code === "string" ? row.error_code : null,
    cancelReason: typeof row.cancel_reason === "string" ? row.cancel_reason : null,
    requestId: typeof row.request_id === "string" ? row.request_id : null,
    createdAt: String(row.created_at || ""),
    updatedAt: String(row.updated_at || ""),
    confirmedAt: typeof row.confirmed_at === "string" ? row.confirmed_at : null,
    executedAt: typeof row.executed_at === "string" ? row.executed_at : null,
    cancelledAt: typeof row.cancelled_at === "string" ? row.cancelled_at : null,
    writebackAttemptCount: Number(row.writeback_attempt_count ?? 0),
    writebackLastAttemptAt: typeof row.writeback_last_attempt_at === "string" ? row.writeback_last_attempt_at : null,
    writebackLeaseExpiresAt: typeof row.writeback_lease_expires_at === "string" ? row.writeback_lease_expires_at : null,
    writebackLastError: typeof row.writeback_last_error === "string" ? row.writeback_last_error : null,
  };
}

function notConfigured(): { status: "not_configured"; warning: string; migration: string } {
  return {
    status: "not_configured",
    warning: "Supabase 尚未创建 feishu_action_confirmations 表。",
    migration: "supabase-v5349-feishu-action-confirmations.sql",
  };
}

function hasAuthStorageEnvironment(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export function canManageFeishuActionConfirmation(user: AppUser, confirmation: FeishuActionConfirmationRecord): boolean {
  if (user.role === "admin") return true;
  return confirmation.requesterId === user.id;
}

export function isFeishuActionConfirmationConfirmable(status: FeishuActionConfirmationStatus): boolean {
  return status === "pending_confirmation" || status === "failed";
}

export function isFeishuActionConfirmationCancellable(status: FeishuActionConfirmationStatus): boolean {
  return !["succeeded", "writing", "cancelled"].includes(status);
}

function riskRank(level: FeishuActionConfirmationRiskReviewLevel): number {
  return level === "high" ? 3 : level === "medium" ? 2 : 1;
}

function elevateRisk(
  current: FeishuActionConfirmationRiskReviewLevel,
  next: FeishuActionConfirmationRiskReviewLevel,
): FeishuActionConfirmationRiskReviewLevel {
  return riskRank(next) > riskRank(current) ? next : current;
}

function ageInDays(createdAt: string, now: Date): number | null {
  const parsed = Date.parse(createdAt);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Math.floor((now.getTime() - parsed) / 86_400_000));
}

function isRecoverableBaseWriteback(confirmation: FeishuActionConfirmationRecord, now: Date): boolean {
  if (confirmation.actionType !== "base_record_update" || confirmation.status !== "writing") return false;
  if (!confirmation.writebackLeaseExpiresAt) return true;
  const leaseExpiresAt = Date.parse(confirmation.writebackLeaseExpiresAt);
  return Number.isFinite(leaseExpiresAt) && leaseExpiresAt <= now.getTime();
}

function addUnique(target: string[], value: string) {
  if (!target.includes(value)) target.push(value);
}

function payloadString(payload: FeishuActionBody, field: string): string {
  const value = payload[field];
  return typeof value === "string" ? value.trim() : "";
}

function payloadArrayLength(payload: FeishuActionBody, field: string): number {
  const value = payload[field];
  return Array.isArray(value) ? value.length : 0;
}

export function buildFeishuConfirmationRiskReview(
  confirmation: FeishuActionConfirmationRecord,
  input: { user?: AppUser | null; now?: Date } = {},
): FeishuActionConfirmationRiskReview {
  const now = input.now ?? new Date();
  const checklist: FeishuActionConfirmationRiskReview["checklist"] = [];
  const warnings: string[] = [];
  const blockingIssues: string[] = [];
  const currentAgeDays = ageInDays(confirmation.createdAt, now);
  const recoverableBaseWriteback = isRecoverableBaseWriteback(confirmation, now);
  let riskLevel = confirmation.riskLevel;

  function pushCheck(
    id: string,
    label: string,
    status: FeishuActionConfirmationRiskReviewCheckStatus,
    detail: string,
  ) {
    checklist.push({ id, label, status, detail });
    if (status === "warning") addUnique(warnings, detail);
    if (status === "block") addUnique(blockingIssues, detail);
  }

  if (isFeishuActionConfirmationConfirmable(confirmation.status) || recoverableBaseWriteback) {
    pushCheck("status", "状态可执行", "pass", `当前状态为 ${confirmation.status}，允许进入确认前复核。`);
  } else {
    pushCheck("status", "状态可执行", "block", `当前状态为 ${confirmation.status}，不能批量确认。`);
  }

  if (input.user && !canManageFeishuActionConfirmation(input.user, confirmation)) {
    pushCheck("permission", "确认权限", "block", "当前用户不是申请人，也不是管理员，不能确认该写入。");
  } else {
    pushCheck("permission", "确认权限", "pass", "当前用户具备确认或复核权限。");
  }

  if (confirmation.source === "api_token" || !confirmation.requesterId) {
    riskLevel = elevateRisk(riskLevel, "high");
    pushCheck("requester", "申请来源", "warning", "该动作来自 API token 或系统入队，缺少明确业务申请人，确认前应核对来源。");
  } else {
    pushCheck("requester", "申请来源", "pass", `申请人：${confirmation.requesterName || confirmation.requesterEmail || confirmation.requesterId}`);
  }

  if (currentAgeDays !== null && currentAgeDays >= 14) {
    riskLevel = elevateRisk(riskLevel, "high");
    pushCheck("freshness", "时效性", "warning", `该写入已等待 ${currentAgeDays} 天，业务上下文可能变化，确认前必须重新核对。`);
  } else if (currentAgeDays !== null && currentAgeDays >= 7) {
    riskLevel = elevateRisk(riskLevel, "medium");
    pushCheck("freshness", "时效性", "warning", `该写入已等待 ${currentAgeDays} 天，建议先核对目标和内容。`);
  } else {
    pushCheck("freshness", "时效性", "pass", currentAgeDays === null ? "创建时间无法解析，按实时复核处理。" : `创建于 ${currentAgeDays} 天内。`);
  }

  if (confirmation.status === "failed") {
    riskLevel = elevateRisk(riskLevel, "medium");
    pushCheck("retry", "失败重试", "warning", `该动作此前执行失败${confirmation.errorCode ? `：${confirmation.errorCode}` : ""}，重试前应核对配置和目标权限。`);
  }
  if (recoverableBaseWriteback) {
    riskLevel = elevateRisk(riskLevel, "high");
    pushCheck("recovery", "中断恢复", "warning", "上一次Base写回租约已过期；本次只会在重新核对权限、当前事实和同步流水后恢复。");
  }

  for (const reason of confirmation.preview.riskReasons) {
    addUnique(warnings, reason);
  }

  switch (confirmation.actionType) {
    case "message": {
      const receiveIdType = payloadString(confirmation.payload, "receive_id_type");
      if (receiveIdType === "chat_id") {
        riskLevel = elevateRisk(riskLevel, "high");
        pushCheck("target", "写入对象", "warning", "消息目标为群聊，发送后会被多人看见，需二次确认内容和接收群。");
      } else {
        pushCheck("target", "写入对象", "pass", "消息目标为单个用户，仍需核对接收对象。");
      }
      if (payloadString(confirmation.payload, "text").length > 1200) {
        riskLevel = elevateRisk(riskLevel, "medium");
        pushCheck("content-size", "内容长度", "warning", "消息内容较长，建议确认没有包含敏感信息或未脱敏客户数据。");
      }
      break;
    }
    case "task": {
      const assigneeCount = payloadArrayLength(confirmation.payload, "assignee_ids");
      if (assigneeCount === 0) {
        pushCheck("owner", "责任人", "warning", "飞书任务未指定责任人，创建后可能无人跟进。");
      } else {
        pushCheck("owner", "责任人", "pass", `已指定 ${assigneeCount} 个任务责任人。`);
      }
      if (!confirmation.payload.due_at) {
        pushCheck("deadline", "截止时间", "warning", "飞书任务未设置截止时间，建议补充 deadline 后再确认。");
      }
      break;
    }
    case "calendar": {
      const attendeeCount = payloadArrayLength(confirmation.payload, "attendee_ids");
      if (attendeeCount >= 10) {
        riskLevel = elevateRisk(riskLevel, "high");
        pushCheck("attendees", "参与人", "warning", `日程参与人 ${attendeeCount} 人，可能触发大范围通知。`);
      } else {
        pushCheck("attendees", "参与人", "pass", `日程参与人 ${attendeeCount} 人。`);
      }
      break;
    }
    case "document":
      if (!payloadString(confirmation.payload, "parent_token")) {
        pushCheck("location", "文档位置", "warning", "飞书文档未指定父目录，将使用默认目录或应用配置目录。");
      } else {
        pushCheck("location", "文档位置", "pass", "已指定飞书文档父目录。");
      }
      break;
    case "base_record_update": {
      riskLevel = elevateRisk(riskLevel, "high");
      const tableKey = payloadString(confirmation.payload, "table_key");
      const recordId = payloadString(confirmation.payload, "record_id");
      const draftId = payloadString(confirmation.payload, "business_update_draft_id");
      const dataClass = payloadString(confirmation.payload, "data_class");
      const fields = confirmation.payload.fields;
      if (!tableKey || !recordId || !draftId) {
        pushCheck("base-target", "Base稳定目标", "block", "写回载荷缺少 table_key、record_id 或业务草稿ID。");
      } else {
        pushCheck("base-target", "Base稳定目标", "pass", `目标为 ${tableKey} 表的稳定记录 ${recordId}。`);
      }
      if (!["production", "sample", "test", "diagnostic", "unclassified"].includes(dataClass)) {
        pushCheck("data-class", "数据空间", "block", "写回载荷缺少合法数据空间。");
      } else {
        pushCheck("data-class", "数据空间", "pass", `写回限定在 ${dataClass} 数据空间。`);
      }
      const fieldNames = fields && typeof fields === "object" && !Array.isArray(fields) ? Object.keys(fields as Record<string, unknown>) : [];
      if (fieldNames.length === 0 || fieldNames.some(field => !/[\u3400-\u9fff]/u.test(field))) {
        pushCheck("base-fields", "中文业务字段", "block", "Base更新字段为空或存在非中文业务字段。");
      } else {
        pushCheck("base-fields", "中文业务字段", "warning", `将改写 ${fieldNames.join("、")}，最终执行前会重新核对当前事实。`);
      }
      break;
    }
  }

  const requiresSecondConfirm = riskLevel === "high" || warnings.length >= 3 || (currentAgeDays ?? 0) >= 7;
  const canConfirm = blockingIssues.length === 0
    && (isFeishuActionConfirmationConfirmable(confirmation.status) || recoverableBaseWriteback);
  const canCancel = isFeishuActionConfirmationCancellable(confirmation.status);

  return {
    confirmationId: confirmation.id,
    riskLevel,
    baseRiskLevel: confirmation.riskLevel,
    canConfirm,
    canCancel,
    requiresSecondConfirm,
    ageDays: currentAgeDays,
    blockingIssues,
    warnings,
    checklist,
    suggestedAction: !canConfirm ? "review" : riskLevel === "high" ? "review" : "confirm",
  };
}

export function buildFeishuConfirmationBatchRiskReview(
  confirmations: FeishuActionConfirmationRecord[],
  input: { user?: AppUser | null; now?: Date } = {},
): FeishuActionConfirmationBatchRiskReview {
  const reviews = confirmations.map(confirmation => buildFeishuConfirmationRiskReview(confirmation, input));
  const confirmableIds = reviews.filter(review => review.canConfirm).map(review => review.confirmationId);
  const blockedIds = reviews.filter(review => !review.canConfirm).map(review => review.confirmationId);
  const highRiskCount = reviews.filter(review => review.riskLevel === "high").length;
  const requiresSecondConfirmCount = reviews.filter(review => review.requiresSecondConfirm).length;
  const warnings = Array.from(new Set(reviews.flatMap(review => review.warnings))).slice(0, 12);
  const blockingIssues = Array.from(new Set(reviews.flatMap(review => review.blockingIssues))).slice(0, 12);

  return {
    selectedCount: confirmations.length,
    confirmableCount: confirmableIds.length,
    blockedCount: blockedIds.length,
    highRiskCount,
    requiresSecondConfirmCount,
    confirmableIds,
    blockedIds,
    warnings,
    blockingIssues,
    reviews,
    decisionText: `本次选择 ${confirmations.length} 条，允许确认 ${confirmableIds.length} 条，阻断 ${blockedIds.length} 条，高风险 ${highRiskCount} 条，需要二次确认 ${requiresSecondConfirmCount} 条。`,
  };
}

export function buildFeishuConfirmationQueueSummary(
  confirmations: FeishuActionConfirmationRecord[],
  now = new Date(),
): FeishuActionConfirmationQueueSummary {
  const reviews = confirmations
    .map(item => ({ confirmation: item, review: buildFeishuConfirmationRiskReview(item, { now }) }))
    .filter(({ confirmation, review }) => isFeishuActionConfirmationConfirmable(confirmation.status) || review.canConfirm);
  const reminderDrafts = reviews
    .filter(({ confirmation, review }) => confirmation.status === "failed" || review.riskLevel === "high" || (review.ageDays ?? 0) >= 7 || review.requiresSecondConfirm)
    .slice(0, 5)
    .map(({ confirmation, review }) => ({
      id: confirmation.id,
      priority: review.riskLevel === "high" || review.blockingIssues.length > 0 ? "P0" as const : (review.ageDays ?? 0) >= 7 || confirmation.status === "failed" ? "P1" as const : "P2" as const,
      title: `飞书写入待确认：${confirmation.targetSummary}`,
      detail: review.blockingIssues[0] || review.warnings[0] || "该写入需要人工确认后才会执行。",
      nextAction: review.canConfirm ? "请在集成中心完成风险复核后确认执行，或取消写入。" : "请先处理阻断项，再决定是否重新发起写入。",
      targetSummary: confirmation.targetSummary,
    }));

  return {
    basis: "current_page",
    totalCount: confirmations.length,
    pendingCount: confirmations.filter(item => item.status === "pending_confirmation").length,
    failedCount: confirmations.filter(item => item.status === "failed").length,
    highRiskPendingCount: reviews.filter(item => item.review.riskLevel === "high").length,
    overduePendingCount: reviews.filter(item => (item.review.ageDays ?? 0) >= 7).length,
    requiresSecondConfirmCount: reviews.filter(item => item.review.requiresSecondConfirm).length,
    reminderDrafts,
  };
}

export async function createFeishuActionConfirmation(input: {
  user: AppUser | null;
  source: FeishuActionConfirmationRecord["source"];
  sourcePage?: string | null;
  payload: FeishuActionBody;
  requestId: string;
}): Promise<FeishuActionConfirmationWriteResult> {
  if (!hasAuthStorageEnvironment()) {
    return { ...notConfigured(), warning: "Supabase 未配置，无法创建飞书写入确认队列。" };
  }
  const auth = await import("../auth/server.ts");
  const { getAuthSupabase, isAuthStorageConfigured } = auth;
  if (!isAuthStorageConfigured()) {
    return { ...notConfigured(), warning: "Supabase 未配置，无法创建飞书写入确认队列。" };
  }

  const validated = validateFeishuActionBody(input.payload);
  if (validated.actionType === "base_record_update") {
    return { status: "failed", warning: "Base记录更新只能由业务变化草稿在数据库事务中创建，不接受通用接口直接入队。" };
  }
  const preview = buildFeishuActionPreview(input.payload);
  const supabase = getAuthSupabase();
  const { data, error } = await supabase
    .from("feishu_action_confirmations")
    .insert({
      requester_id: input.user?.id ?? null,
      requester_name: requesterName(input.user),
      requester_email: input.user?.email ?? null,
      source: input.source,
      source_page: input.sourcePage ?? null,
      action_type: validated.actionType,
      idempotency_key: validated.idempotencyKey,
      target_summary: preview.targetSummary,
      risk_level: preview.riskLevel,
      status: "pending_confirmation",
      payload: input.payload,
      preview,
      request_id: input.requestId,
    })
    .select("*")
    .single();

  if (error) {
    return isMissingTableError(error.message)
      ? notConfigured()
      : { status: "failed", warning: error.message };
  }
  return { status: "succeeded", confirmation: mapRow(data as Record<string, unknown>) };
}

export async function listFeishuActionConfirmations(input: {
  user: AppUser;
  limit?: number;
  status?: FeishuActionConfirmationStatus | "all";
}): Promise<FeishuActionConfirmationListResult> {
  if (!hasAuthStorageEnvironment()) return { ...notConfigured(), confirmations: [] };
  const auth = await import("../auth/server.ts");
  const { getAuthSupabase, isAuthStorageConfigured } = auth;
  if (!isAuthStorageConfigured()) return { ...notConfigured(), confirmations: [] };

  const supabase = getAuthSupabase();
  let query = supabase
    .from("feishu_action_confirmations")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(input.limit ?? 50);

  if (input.user.role !== "admin") query = query.eq("requester_id", input.user.id);
  if (input.status && input.status !== "all") query = query.eq("status", input.status);

  const { data, error } = await query;
  if (error) {
    return isMissingTableError(error.message)
      ? { ...notConfigured(), confirmations: [] }
      : { status: "failed", confirmations: [], warning: error.message };
  }
  return { status: "succeeded", confirmations: (data ?? []).map(row => mapRow(row as Record<string, unknown>)) };
}

export async function getFeishuActionConfirmation(id: string): Promise<
  | { status: "succeeded"; confirmation: FeishuActionConfirmationRecord }
  | { status: "not_configured"; warning: string; migration?: string }
  | { status: "not_found"; warning: string }
  | { status: "failed"; warning: string }
> {
  if (!hasAuthStorageEnvironment()) return notConfigured();
  const auth = await import("../auth/server.ts");
  const { getAuthSupabase, isAuthStorageConfigured } = auth;
  if (!isAuthStorageConfigured()) return notConfigured();

  const supabase = getAuthSupabase();
  const { data, error } = await supabase
    .from("feishu_action_confirmations")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return isMissingTableError(error.message) ? notConfigured() : { status: "failed", warning: error.message };
  }
  if (!data) return { status: "not_found", warning: "飞书写入确认记录不存在。" };
  return { status: "succeeded", confirmation: mapRow(data as Record<string, unknown>) };
}

export async function updateFeishuActionConfirmationStatus(input: {
  id: string;
  status: FeishuActionConfirmationStatus;
  resource?: unknown;
  errorCode?: string | null;
  cancelReason?: string | null;
}): Promise<FeishuActionConfirmationWriteResult> {
  if (!hasAuthStorageEnvironment()) return notConfigured();
  const auth = await import("../auth/server.ts");
  const { getAuthSupabase, isAuthStorageConfigured } = auth;
  if (!isAuthStorageConfigured()) return notConfigured();

  const patch: Record<string, unknown> = {
    status: input.status,
    updated_at: new Date().toISOString(),
  };
  if (input.status === "confirmed") patch.confirmed_at = new Date().toISOString();
  if (input.status === "succeeded" || input.status === "failed") patch.executed_at = new Date().toISOString();
  if (input.status === "cancelled") patch.cancelled_at = new Date().toISOString();
  if (input.resource !== undefined) patch.resource = input.resource;
  if (input.errorCode !== undefined) patch.error_code = input.errorCode;
  if (input.cancelReason !== undefined) patch.cancel_reason = input.cancelReason;

  const supabase = getAuthSupabase();
  const { data, error } = await supabase
    .from("feishu_action_confirmations")
    .update(patch)
    .eq("id", input.id)
    .select("*")
    .single();

  if (error) {
    return isMissingTableError(error.message)
      ? notConfigured()
      : { status: "failed", warning: error.message };
  }
  return { status: "succeeded", confirmation: mapRow(data as Record<string, unknown>) };
}
