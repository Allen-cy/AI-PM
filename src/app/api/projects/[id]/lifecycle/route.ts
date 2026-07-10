import { getCurrentUser } from "@/features/auth/server";
import { projectAccessHttpStatus, resolveProjectLifecycleAccess } from "@/features/lifecycle-loop/access";
import { initializeLifecycleObject, initializeProjectLifecycle, loadProjectLifecycle } from "@/features/lifecycle-loop/persistence";
import type { BusinessRole } from "@/features/operating-model/context";

export const runtime = "nodejs";

function json(body: unknown, status: number, requestId: string) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store", "X-Request-Id": requestId } });
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const requestId = crypto.randomUUID();
  const user = await getCurrentUser();
  if (!user) return json({ error: "UNAUTHORIZED", request_id: requestId, source: { type: "supabase", fallback_used: false } }, 401, requestId);
  const { id: projectId } = await params;
  const url = new URL(request.url);
  const businessRole = String(url.searchParams.get("business_role") || "") as BusinessRole;
  const dataClass = String(url.searchParams.get("data_class") || "");
  if (!businessRole || !dataClass) return json({ error: "BUSINESS_ROLE_AND_DATA_CLASS_REQUIRED", request_id: requestId, source: { type: "supabase", fallback_used: false } }, 400, requestId);
  const access = await resolveProjectLifecycleAccess({ user, projectId, businessRole });
  if (access.status !== "succeeded" || !access.scope || !access.context) {
    return json({ error: access.status.toUpperCase(), detail: access.warning, request_id: requestId, source: { type: "supabase", fallback_used: false } }, projectAccessHttpStatus(access.status), requestId);
  }
  if (access.scope.dataClass !== dataClass) {
    return json({ error: "DATA_CLASS_MISMATCH", detail: "项目数据空间与当前上下文不一致。", request_id: requestId, source: { type: "supabase", fallback_used: false } }, 409, requestId);
  }
  const result = await loadProjectLifecycle(projectId);
  if (result.status !== "succeeded" || !result.data) {
    const status = result.status === "not_found" ? 404 : result.status === "not_configured" ? 503 : 500;
    return json({ error: result.status.toUpperCase(), detail: result.warning, request_id: requestId, source: { type: "supabase", fallback_used: false } }, status, requestId);
  }
  return json({
    request_id: requestId,
    context: access.context,
    data_class: dataClass,
    lifecycle_initialized: result.data.states.some(item => item.objectType === "project"),
    ...result.data,
    source: { type: "supabase", fallback_used: false },
  }, 200, requestId);
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const requestId = crypto.randomUUID();
  const user = await getCurrentUser();
  if (!user) return json({ error: "UNAUTHORIZED", request_id: requestId, source: { type: "supabase", fallback_used: false } }, 401, requestId);
  const { id: projectId } = await params;
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; } catch {
    return json({ error: "INVALID_JSON", request_id: requestId, source: { type: "supabase", fallback_used: false } }, 400, requestId);
  }
  const businessRole = String(body.business_role || "") as BusinessRole;
  const dataClass = String(body.data_class || "");
  const idempotencyKey = String(body.idempotency_key || "").trim();
  if (!businessRole || !dataClass || !idempotencyKey) return json({ error: "ROLE_DATA_CLASS_AND_IDEMPOTENCY_REQUIRED", request_id: requestId, source: { type: "supabase", fallback_used: false } }, 400, requestId);
  if (!(["pm", "operations", "pmo"] as string[]).includes(businessRole)) return json({ error: "LIFECYCLE_INITIALIZE_FORBIDDEN", request_id: requestId, source: { type: "supabase", fallback_used: false } }, 403, requestId);
  const access = await resolveProjectLifecycleAccess({ user, projectId, businessRole });
  if (access.status !== "succeeded" || !access.scope) return json({ error: access.status.toUpperCase(), detail: access.warning, request_id: requestId, source: { type: "supabase", fallback_used: false } }, projectAccessHttpStatus(access.status), requestId);
  if (access.scope.dataClass !== dataClass) return json({ error: "DATA_CLASS_MISMATCH", request_id: requestId, source: { type: "supabase", fallback_used: false } }, 409, requestId);
  const objectType = String(body.object_type || "project");
  const objectTypes = ["plan_baseline", "deliverable", "change", "reporting", "closure"] as const;
  if (objectType !== "project") {
    if (!objectTypes.includes(objectType as typeof objectTypes[number])) return json({ error: "LIFECYCLE_OBJECT_TYPE_INVALID", request_id: requestId, source: { type: "supabase", fallback_used: false } }, 400, requestId);
    const objectId = String(body.object_id || "").trim();
    if (!objectId) return json({ error: "LIFECYCLE_OBJECT_ID_REQUIRED", request_id: requestId, source: { type: "supabase", fallback_used: false } }, 400, requestId);
    const result = await initializeLifecycleObject({ orgId: access.scope.orgId, projectId, objectType: objectType as typeof objectTypes[number], objectId, ownerUserId: String(body.owner_user_id || "") || null, dueAt: String(body.due_at || "") || null, dataClass: access.scope.dataClass, sourceType: String(body.source_type || "") || null, sourceId: String(body.source_id || "") || null, title: String(body.title || "") || null, actor: user, actorBusinessRole: businessRole, idempotencyKey, requestId, comment: String(body.comment || "").trim() || undefined });
    const status = result.status === "succeeded" ? 201 : result.status === "conflict" ? 409 : result.status === "not_configured" ? 503 : 500;
    return json({ request_id: requestId, status: result.status, ...result.data, detail: result.warning, source: { type: "supabase", fallback_used: false } }, status, requestId);
  }
  const result = await initializeProjectLifecycle({
    orgId: access.scope.orgId,
    projectId,
    dataClass: access.scope.dataClass,
    actor: user,
    actorBusinessRole: businessRole,
    idempotencyKey,
    requestId,
    comment: String(body.comment || "").trim() || undefined,
  });
  const status = result.status === "succeeded" ? 201 : result.status === "conflict" ? 409 : result.status === "not_configured" ? 503 : 500;
  return json({ request_id: requestId, status: result.status, ...result.data, detail: result.warning, source: { type: "supabase", fallback_used: false } }, status, requestId);
}
