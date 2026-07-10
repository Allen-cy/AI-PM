import { getCurrentUser } from "@/features/auth/server";
import { projectAccessHttpStatus, resolveProjectLifecycleAccess } from "@/features/lifecycle-loop/access";
import { parseLifecycleTransitionRequest } from "@/features/lifecycle-loop/domain";
import { transitionProjectLifecycle } from "@/features/lifecycle-loop/persistence";

export const runtime = "nodejs";

function json(body: unknown, status: number, requestId: string) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store", "X-Request-Id": requestId } });
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
  let transition;
  try { transition = parseLifecycleTransitionRequest(body); } catch (error) {
    return json({ error: "INVALID_TRANSITION", detail: error instanceof Error ? error.message : "请求不合法", request_id: requestId, source: { type: "supabase", fallback_used: false } }, 400, requestId);
  }
  const stateId = String(body.state_id || "").trim();
  const dataClass = String(body.data_class || "").trim();
  if (!stateId || !dataClass) return json({ error: "STATE_AND_DATA_CLASS_REQUIRED", request_id: requestId, source: { type: "supabase", fallback_used: false } }, 400, requestId);
  const access = await resolveProjectLifecycleAccess({ user, projectId, businessRole: transition.businessRole });
  if (access.status !== "succeeded" || !access.scope) return json({ error: access.status.toUpperCase(), detail: access.warning, request_id: requestId, source: { type: "supabase", fallback_used: false } }, projectAccessHttpStatus(access.status), requestId);
  if (access.scope.dataClass !== dataClass) return json({ error: "DATA_CLASS_MISMATCH", request_id: requestId, source: { type: "supabase", fallback_used: false } }, 409, requestId);
  const result = await transitionProjectLifecycle({ stateId, expectedProjectId: projectId, transition, actor: user, requestId });
  const status = result.status === "succeeded" ? 200 : result.status === "not_found" ? 404 : result.status === "conflict" ? 409 : result.status === "not_configured" ? 503 : 500;
  return json({ request_id: requestId, status: result.status, ...result.data, detail: result.warning, source: { type: "supabase", fallback_used: false } }, status, requestId);
}
