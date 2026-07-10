import { getCurrentUser } from "@/features/auth/server";
import { canPerformBusinessAction } from "@/features/operating-model/authorization";
import { type BusinessRole } from "@/features/operating-model/context";
import { resolveSignalBusinessAccess } from "@/features/operating-model/server-access";
import {
  getManagementSignal,
  listBusinessRoleAssignments,
  transitionSignalAction,
} from "@/features/operating-model/persistence";
import type { ActionClosureEvidence } from "@/features/operating-model/actions";

export const runtime = "nodejs";

function json(body: unknown, status = 200, requestId = crypto.randomUUID()) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store", "X-Request-Id": requestId } });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; actionId: string }> },
): Promise<Response> {
  const requestId = crypto.randomUUID();
  const user = await getCurrentUser();
  if (!user) return json({ error: "UNAUTHORIZED", request_id: requestId }, 401, requestId);
  const { id, actionId } = await params;
  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return json({ error: "INVALID_JSON", request_id: requestId }, 400, requestId);
  }
  const operation = String(body.operation || "") as "accept" | "reject" | "start" | "submit_evidence" | "verify_evidence" | "close" | "reopen";
  if (!["accept", "reject", "start", "submit_evidence", "verify_evidence", "close", "reopen"].includes(operation)) {
    return json({ error: "INVALID_ACTION_OPERATION", request_id: requestId }, 400, requestId);
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
  const reviewerOperation = operation === "verify_evidence" || operation === "close" || operation === "reopen";
  const allowed = context && resource && (reviewerOperation
    ? canPerformBusinessAction(context, "signal.review", resource)
    : canPerformBusinessAction(context, "action.execute", resource));
  if (!allowed) return json({ error: "SIGNAL_ACTION_FORBIDDEN", request_id: requestId }, 403, requestId);
  if (!reviewerOperation && signal.ownerUserId && signal.ownerUserId !== user.id) {
    return json({ error: "SIGNAL_ACTION_OWNER_MISMATCH", request_id: requestId }, 403, requestId);
  }
  const evidence = Array.isArray(body.evidence) ? body.evidence as ActionClosureEvidence[] : undefined;
  const effectReview = body.effect_review && typeof body.effect_review === "object" && !Array.isArray(body.effect_review)
    ? body.effect_review as Record<string, unknown>
    : undefined;
  const result = await transitionSignalAction({
    signalId: id,
    actionId,
    operation,
    actor: user,
    actorBusinessRole: role,
    comment: String(body.comment || "").trim() || undefined,
    evidence,
    effectReview,
    requestId,
  });
  return json({ request_id: requestId, status: result.status, signal: result.data?.signal, action: result.data?.action, warning: result.warning },
    result.status === "succeeded" ? 200 : result.status === "conflict" ? 409 : result.status === "not_found" ? 404 : result.status === "not_configured" ? 503 : 500,
    requestId);
}
