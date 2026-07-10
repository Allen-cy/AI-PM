import { getCurrentUser } from "@/features/auth/server";
import { canPerformBusinessAction } from "@/features/operating-model/authorization";
import { type BusinessRole } from "@/features/operating-model/context";
import { resolveSignalBusinessAccess } from "@/features/operating-model/server-access";
import {
  getManagementSignal,
  listBusinessRoleAssignments,
  transitionManagementSignalRecord,
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
  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return json({ error: "INVALID_JSON", request_id: requestId }, 400, requestId);
  }
  const action = body.action === "reject" ? "reject" : body.action === "verify" ? "verify" : null;
  if (!action) return json({ error: "ACTION_MUST_BE_VERIFY_OR_REJECT", request_id: requestId }, 400, requestId);
  if (action === "reject" && !String(body.comment || "").trim()) {
    return json({ error: "REJECTION_COMMENT_REQUIRED", request_id: requestId }, 400, requestId);
  }
  const signalResult = await getManagementSignal(id);
  if (signalResult.status !== "succeeded" || !signalResult.data) {
    return json({ error: signalResult.status.toUpperCase(), detail: signalResult.warning, request_id: requestId },
      signalResult.status === "not_found" ? 404 : signalResult.status === "not_configured" ? 503 : 500, requestId);
  }
  const signal = signalResult.data;
  const assignments = await listBusinessRoleAssignments(user.id);
  if (assignments.status !== "succeeded") return json({ error: "P17_STORAGE_NOT_CONFIGURED", detail: assignments.warning, request_id: requestId }, 503, requestId);
  const role = String(body.business_role || "") as BusinessRole;
  const { context, resource } = await resolveSignalBusinessAccess({ user, assignments: assignments.data ?? [], role, signal });
  if (!context || !resource || !canPerformBusinessAction(context, "signal.verify", resource)) {
    return json({ error: "SIGNAL_VERIFY_FORBIDDEN", request_id: requestId }, 403, requestId);
  }
  const result = await transitionManagementSignalRecord({
    signalId: id,
    action,
    actor: user,
    actorBusinessRole: role,
    comment: String(body.comment || "").trim() || undefined,
    reasonCode: String(body.reason_code || "").trim() || undefined,
    requestId,
  });
  return json({ request_id: requestId, status: result.status, signal: result.data, warning: result.warning },
    result.status === "succeeded" ? 200 : result.status === "conflict" ? 409 : result.status === "not_found" ? 404 : result.status === "not_configured" ? 503 : 500,
    requestId);
}
