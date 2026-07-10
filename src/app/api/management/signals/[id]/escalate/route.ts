import { getCurrentUser } from "@/features/auth/server";
import { canPerformBusinessAction } from "@/features/operating-model/authorization";
import { type BusinessRole } from "@/features/operating-model/context";
import { resolveSignalBusinessAccess } from "@/features/operating-model/server-access";
import {
  getManagementSignal,
  listBusinessRoleAssignments,
  reviewAndRouteManagementSignal,
} from "@/features/operating-model/persistence";

export const runtime = "nodejs";

function json(body: unknown, status = 200, requestId = crypto.randomUUID()) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store", "X-Request-Id": requestId } });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = crypto.randomUUID();
  const user = await getCurrentUser();
  if (!user) return json({ error: "UNAUTHORIZED", request_id: requestId }, 401, requestId);
  const { id } = await params;
  let body: Record<string, unknown> = {};
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return json({ error: "INVALID_JSON", request_id: requestId }, 400, requestId);
  }
  const signalResult = await getManagementSignal(id);
  if (signalResult.status !== "succeeded" || !signalResult.data) {
    return json({ error: signalResult.status.toUpperCase(), detail: signalResult.warning, request_id: requestId },
      signalResult.status === "not_found" ? 404 : signalResult.status === "not_configured" ? 503 : 500, requestId);
  }
  const signal = signalResult.data;
  const role = String(body.business_role || "") as BusinessRole;
  const assignments = await listBusinessRoleAssignments(user.id);
  if (assignments.status !== "succeeded") return json({ error: "P17_STORAGE_NOT_CONFIGURED", detail: assignments.warning, request_id: requestId }, 503, requestId);
  const { context, resource } = await resolveSignalBusinessAccess({ user, assignments: assignments.data ?? [], role, signal });
  if (!context || !resource || !(canPerformBusinessAction(context, "signal.review", resource) && canPerformBusinessAction(context, "signal.escalate", resource))) {
    return json({ error: "SIGNAL_REVIEW_FORBIDDEN", request_id: requestId }, 403, requestId);
  }
  const result = await reviewAndRouteManagementSignal({
    signalId: id,
    actor: user,
    actorBusinessRole: role,
    comment: String(body.comment || "").trim() || undefined,
    requestId,
  });
  return json({
    request_id: requestId,
    status: result.status,
    signal: result.data?.signal,
    action_id: result.data?.actionId,
    escalation_id: result.data?.escalationId,
    warning: result.warning,
  }, result.status === "succeeded" ? 200 : result.status === "conflict" ? 409 : result.status === "not_found" ? 404 : result.status === "not_configured" ? 503 : 500, requestId);
}
