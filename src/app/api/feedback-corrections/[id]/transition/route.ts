import { getCurrentUser } from "@/features/auth/server";
import { projectAccessHttpStatus, resolveProjectLifecycleAccess } from "@/features/lifecycle-loop/access";
import type { FeedbackCorrectionAction } from "@/features/lifecycle-loop/corrections";
import { getFeedbackCorrection, transitionFeedbackCorrectionRecord } from "@/features/lifecycle-loop/persistence";
import type { BusinessRole } from "@/features/operating-model/context";

export const runtime = "nodejs";
const ACTIONS: FeedbackCorrectionAction[] = ["accept", "reject", "submit_correction", "verify", "request_rework"];

function json(body: unknown, status: number, requestId: string) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store", "X-Request-Id": requestId } });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const requestId = crypto.randomUUID();
  const user = await getCurrentUser();
  if (!user) return json({ error: "UNAUTHORIZED", request_id: requestId, source: { type: "supabase", fallback_used: false } }, 401, requestId);
  const { id } = await params;
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; } catch {
    return json({ error: "INVALID_JSON", request_id: requestId, source: { type: "supabase", fallback_used: false } }, 400, requestId);
  }
  const action = String(body.action || "") as FeedbackCorrectionAction;
  const businessRole = String(body.business_role || "") as BusinessRole;
  const dataClass = String(body.data_class || "");
  if (!ACTIONS.includes(action) || !businessRole || !dataClass) return json({ error: "ACTION_ROLE_AND_DATA_CLASS_REQUIRED", request_id: requestId, source: { type: "supabase", fallback_used: false } }, 400, requestId);
  const current = await getFeedbackCorrection(id);
  if (current.status !== "succeeded" || !current.data) {
    const status = current.status === "not_found" ? 404 : current.status === "not_configured" ? 503 : 500;
    return json({ error: current.status.toUpperCase(), detail: current.warning, request_id: requestId, source: { type: "supabase", fallback_used: false } }, status, requestId);
  }
  const access = await resolveProjectLifecycleAccess({ user, projectId: current.data.projectId, businessRole });
  if (access.status !== "succeeded" || !access.scope) return json({ error: access.status.toUpperCase(), detail: access.warning, request_id: requestId, source: { type: "supabase", fallback_used: false } }, projectAccessHttpStatus(access.status), requestId);
  if (access.scope.dataClass !== dataClass) return json({ error: "DATA_CLASS_MISMATCH", request_id: requestId, source: { type: "supabase", fallback_used: false } }, 409, requestId);
  const result = await transitionFeedbackCorrectionRecord({
    correctionId: id,
    action,
    actor: user,
    actorBusinessRole: businessRole,
    comment: String(body.comment || "").trim() || undefined,
    reasonCode: String(body.reason_code || "").trim() || undefined,
    appliedCorrection: body.applied_correction && typeof body.applied_correction === "object" ? body.applied_correction as Record<string, unknown> : undefined,
    requestId,
  });
  const status = result.status === "succeeded" ? 200 : result.status === "not_found" ? 404 : result.status === "conflict" ? 409 : result.status === "not_configured" ? 503 : 500;
  return json({ request_id: requestId, status: result.status, correction: result.data, detail: result.warning, source: { type: "supabase", fallback_used: false } }, status, requestId);
}

