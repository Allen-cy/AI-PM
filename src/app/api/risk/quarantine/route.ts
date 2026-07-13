import { getAuthSupabase } from "@/features/auth/server";
import { authorizeRiskRequest } from "@/features/risk/access";
import { resolveRequestedRiskProjectIds } from "@/features/risk/scope";

export const runtime = "nodejs";

function json(body: unknown, status = 200, requestId = crypto.randomUUID()) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store", "X-Request-Id": requestId },
  });
}

export async function GET(request: Request): Promise<Response> {
  const requestId = crypto.randomUUID();
  const access = await authorizeRiskRequest(request, "govern_quarantine");
  if (!access.ok) return json({ error: access.error, detail: access.detail, request_id: requestId }, access.status, requestId);
  const status = new URL(request.url).searchParams.get("quarantine_status") || "pending";
  if (!["pending", "resolved", "dismissed", "all"].includes(status)) {
    return json({ error: "QUARANTINE_STATUS_INVALID", request_id: requestId }, 400, requestId);
  }
  let query = getAuthSupabase()
    .from("risk_scope_quarantine")
    .select("id,risk_id,org_id,project_id,data_class,reason,status,detected_at,resolved_at,resolved_by,resolution_note,original_snapshot,updated_at")
    .eq("quarantine_owner_org_id", access.scope.orgId)
    .in("data_class", [access.scope.dataClass, "unclassified"])
    .order("detected_at", { ascending: false })
    .limit(200);
  if (status !== "all") query = query.eq("status", status);
  const { data, error } = await query;
  if (error) return json({ error: "RISK_QUARANTINE_LOAD_FAILED", detail: error.message, request_id: requestId }, 503, requestId);
  return json({ status: "succeeded", context: access.scope, data_class: access.scope.dataClass, quarantine: data ?? [], request_id: requestId }, 200, requestId);
}

export async function PATCH(request: Request): Promise<Response> {
  const requestId = crypto.randomUUID();
  const access = await authorizeRiskRequest(request, "govern_quarantine");
  if (!access.ok) return json({ error: access.error, detail: access.detail, request_id: requestId }, access.status, requestId);
  let body: { risk_id?: string; project_id?: string; expected_version?: number; idempotency_key?: string; resolution_note?: string };
  try {
    body = await request.json() as typeof body;
  } catch {
    return json({ error: "REQUEST_JSON_INVALID", request_id: requestId }, 400, requestId);
  }
  if (!body.risk_id || !body.project_id || !Number.isInteger(body.expected_version) || Number(body.expected_version) < 1 || !body.idempotency_key?.trim()) {
    return json({ error: "RISK_PROJECT_VERSION_IDEMPOTENCY_REQUIRED", request_id: requestId }, 400, requestId);
  }
  if (!body.resolution_note?.trim()) {
    return json({ error: "RESOLUTION_NOTE_REQUIRED", request_id: requestId }, 400, requestId);
  }
  try {
    resolveRequestedRiskProjectIds(access.scope, body.project_id);
  } catch {
    return json({ error: "PROJECT_OUTSIDE_CONTEXT", request_id: requestId }, 403, requestId);
  }
  const { data, error } = await getAuthSupabase().rpc("resolve_risk_quarantine_v61", {
    p_risk_id: body.risk_id,
    p_org_id: access.scope.orgId,
    p_project_id: body.project_id,
    p_data_class: access.scope.dataClass,
    p_actor_user_id: access.scope.actorUserId,
    p_expected_version: body.expected_version,
    p_idempotency_key: body.idempotency_key.trim(),
    p_resolution_note: body.resolution_note.trim(),
  });
  if (error) {
    const conflict = /VERSION_CONFLICT|IDEMPOTENCY_KEY_REUSED/i.test(error.message);
    return json({ error: conflict ? "VERSION_CONFLICT" : "RISK_QUARANTINE_RESOLVE_FAILED", detail: error.message, request_id: requestId }, conflict ? 409 : 400, requestId);
  }
  return json({ status: "succeeded", data, request_id: requestId }, 200, requestId);
}
