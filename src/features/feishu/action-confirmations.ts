import {
  buildFeishuActionPreview,
  validateFeishuActionBody,
  type FeishuActionBody,
  type FeishuActionPreview,
  type FeishuActionType,
} from "./action-payload.ts";

interface AppUser {
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
  confirmedAt: string | null;
  executedAt: string | null;
  cancelledAt: string | null;
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
    confirmedAt: typeof row.confirmed_at === "string" ? row.confirmed_at : null,
    executedAt: typeof row.executed_at === "string" ? row.executed_at : null,
    cancelledAt: typeof row.cancelled_at === "string" ? row.cancelled_at : null,
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
