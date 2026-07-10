import { getCurrentUser } from "@/features/auth/server";
import { projectAccessHttpStatus, resolveProjectLifecycleAccess } from "@/features/lifecycle-loop/access";
import { canVerifyLifecycleEvidence } from "@/features/lifecycle-loop/domain";
import { verifyLifecycleEvidence } from "@/features/lifecycle-loop/persistence";
import type { BusinessRole } from "@/features/operating-model/context";

export const runtime = "nodejs";

function json(body: unknown, status: number, requestId: string) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store", "X-Request-Id": requestId } });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string; evidenceId: string }> }): Promise<Response> {
  const requestId = crypto.randomUUID();
  const user = await getCurrentUser();
  if (!user) return json({ error: "UNAUTHORIZED", request_id: requestId, source: { type: "supabase", fallback_used: false } }, 401, requestId);
  const { id: projectId, evidenceId } = await params;
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; } catch {
    return json({ error: "INVALID_JSON", request_id: requestId, source: { type: "supabase", fallback_used: false } }, 400, requestId);
  }
  const businessRole = String(body.business_role || "") as BusinessRole;
  const dataClass = String(body.data_class || "");
  if (!businessRole || !dataClass) return json({ error: "ROLE_AND_DATA_CLASS_REQUIRED", request_id: requestId, source: { type: "supabase", fallback_used: false } }, 400, requestId);
  if (!canVerifyLifecycleEvidence(businessRole)) return json({ error: "EVIDENCE_VERIFY_FORBIDDEN", request_id: requestId, source: { type: "supabase", fallback_used: false } }, 403, requestId);
  const access = await resolveProjectLifecycleAccess({ user, projectId, businessRole });
  if (access.status !== "succeeded" || !access.scope) return json({ error: access.status.toUpperCase(), detail: access.warning, request_id: requestId, source: { type: "supabase", fallback_used: false } }, projectAccessHttpStatus(access.status), requestId);
  if (access.scope.dataClass !== dataClass) return json({ error: "DATA_CLASS_MISMATCH", request_id: requestId, source: { type: "supabase", fallback_used: false } }, 409, requestId);
  const result = await verifyLifecycleEvidence({ orgId: access.scope.orgId, projectId, evidenceId, actor: user, actorBusinessRole: businessRole, requestId });
  const status = result.status === "succeeded" ? 200 : result.status === "not_found" ? 404 : result.status === "conflict" ? 409 : result.status === "not_configured" ? 503 : 500;
  return json({ request_id: requestId, status: result.status, evidence: result.data, detail: result.warning, source: { type: "supabase", fallback_used: false } }, status, requestId);
}

