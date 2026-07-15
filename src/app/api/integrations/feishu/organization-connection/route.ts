import { getAuthSupabase, getCurrentUser } from "@/features/auth/server";
import { readFeishuConfig } from "@/features/feishu/config";
import { listBusinessRoleAssignments } from "@/features/operating-model/persistence";
import { encryptCredential, organizationFeishuAppSecretCredentialContext, organizationFeishuBaseTokenCredentialContext } from "@/features/security/credential-encryption";
import { writeOperationAudit } from "@/features/security/repository";

export const runtime = "nodejs";
const TABLE_KEYS = ["project", "milestone", "task", "risk", "contract", "payment", "cost", "syncLedger"] as const;
function json(body: unknown, status = 200, requestId = crypto.randomUUID()) { return Response.json(body, { status, headers: { "Cache-Control": "no-store", "X-Request-Id": requestId } }); }

async function access(request: Request) {
  const user = await getCurrentUser(); if (!user) return { ok: false as const, status: 401, error: "UNAUTHORIZED" };
  const orgId = new URL(request.url).searchParams.get("org_id") || ""; if (!orgId) return { ok: false as const, status: 400, error: "ORG_ID_REQUIRED" };
  const roles = await listBusinessRoleAssignments(user.id); if (roles.status !== "succeeded") return { ok: false as const, status: 503, error: "ROLE_STORAGE_UNAVAILABLE", detail: roles.warning };
  const authorized = user.role === "admin" || (roles.data ?? []).some(item => item.orgId === orgId && item.businessRole === "pmo" && item.status === "active");
  if (!authorized) return { ok: false as const, status: 403, error: "ORGANIZATION_FEISHU_ADMIN_REQUIRED" };
  return { ok: true as const, user, orgId };
}

export async function GET(request: Request) {
  const requestId = crypto.randomUUID(); const scope = await access(request); if (!scope.ok) return json({ error: scope.error, detail: scope.detail, request_id: requestId }, scope.status, requestId);
  const stored = await getAuthSupabase().from("organization_feishu_connections").select("org_id,app_id,table_mapping,status,last_verified_at,last_error_code,version,updated_at").eq("org_id", scope.orgId).maybeSingle();
  if (stored.error) return json({ error: "ORGANIZATION_FEISHU_STORAGE_UNAVAILABLE", detail: stored.error.message, request_id: requestId }, 503, requestId);
  if (stored.data) return json({ status: "succeeded", source: "organization", connection: { ...stored.data, credentials_configured: true }, request_id: requestId }, 200, requestId);
  const environment = readFeishuConfig();
  return json({ status: "succeeded", source: environment ? "organization_environment" : "missing", connection: environment ? { app_id: environment.appId, table_mapping: environment.tables, status: "configured", credentials_configured: true, version: 0 } : null, request_id: requestId }, 200, requestId);
}

export async function PATCH(request: Request) {
  const requestId = crypto.randomUUID(); const scope = await access(request); if (!scope.ok) return json({ error: scope.error, detail: scope.detail, request_id: requestId }, scope.status, requestId);
  const body = await request.json().catch(() => null) as Record<string, unknown> | null; if (!body) return json({ error: "INVALID_JSON", request_id: requestId }, 400, requestId);
  const appId = String(body.app_id || "").trim(); const appSecret = String(body.app_secret || "").trim(); const baseToken = String(body.base_token || "").trim(); const expectedVersion = Number(body.expected_version ?? 0); const idempotencyKey = String(body.idempotency_key || "").trim();
  if (!idempotencyKey) return json({ error: "ORGANIZATION_FEISHU_IDEMPOTENCY_KEY_REQUIRED", request_id: requestId }, 400, requestId);
  const mapping = body.table_mapping && typeof body.table_mapping === "object" && !Array.isArray(body.table_mapping) ? body.table_mapping as Record<string, unknown> : {};
  const missing = TABLE_KEYS.filter(key => !String(mapping[key] || "").trim());
  if (!appId || !appSecret || !baseToken || !Number.isSafeInteger(expectedVersion) || expectedVersion < 0 || missing.length) return json({ error: "COMPLETE_ORGANIZATION_FEISHU_CONFIG_REQUIRED", missing_tables: missing, request_id: requestId }, 400, requestId);
  const supabase = getAuthSupabase(); const current = await supabase.from("organization_feishu_connections").select("org_id,app_id,table_mapping,status,version,updated_at,last_idempotency_key").eq("org_id", scope.orgId).maybeSingle();
  if (current.error) return json({ error: "ORGANIZATION_FEISHU_STORAGE_UNAVAILABLE", detail: current.error.message, request_id: requestId }, 503, requestId);
  if (current.data?.last_idempotency_key === idempotencyKey) return json({ status: "succeeded", replayed: true, connection: { ...current.data, last_idempotency_key: undefined, credentials_configured: true }, request_id: requestId }, 200, requestId);
  if (Number(current.data?.version || 0) !== expectedVersion) return json({ error: "ORGANIZATION_FEISHU_VERSION_CONFLICT", current_version: Number(current.data?.version || 0), request_id: requestId }, 409, requestId);
  const secret = encryptCredential(appSecret, organizationFeishuAppSecretCredentialContext(scope.orgId)); const token = encryptCredential(baseToken, organizationFeishuBaseTokenCredentialContext(scope.orgId));
  const payload = { app_id: appId, app_secret_encrypted: secret.encrypted, app_secret_key_version: secret.keyVersion, base_token_encrypted: token.encrypted, base_token_key_version: token.keyVersion, table_mapping: Object.fromEntries(TABLE_KEYS.map(key => [key, String(mapping[key]).trim()])), status: "configured", last_error_code: null, updated_by: scope.user.id, last_idempotency_key: idempotencyKey, updated_at: new Date().toISOString(), version: expectedVersion + 1 };
  const saved = current.data ? await supabase.from("organization_feishu_connections").update(payload).eq("org_id", scope.orgId).eq("version", expectedVersion).select("org_id,app_id,table_mapping,status,version,updated_at").single() : await supabase.from("organization_feishu_connections").insert({ org_id: scope.orgId, ...payload }).select("org_id,app_id,table_mapping,status,version,updated_at").single();
  if (saved.error) return json({ error: "ORGANIZATION_FEISHU_SAVE_FAILED", detail: saved.error.message, request_id: requestId }, 503, requestId);
  await writeOperationAudit({ user: scope.user, action: "organization_feishu_connection_save", resourceType: "organization_feishu_connection", resourceId: scope.orgId, status: "succeeded", severity: "high", summary: "组织共享飞书项目台账配置已加密保存", detail: { configured_tables: TABLE_KEYS, version: saved.data.version }, requestId });
  return json({ status: "succeeded", connection: { ...saved.data, credentials_configured: true }, request_id: requestId }, current.data ? 200 : 201, requestId);
}
