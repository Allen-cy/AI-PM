import { getCurrentUser } from "@/features/auth/server";
import { projectAccessHttpStatus, resolveProjectLifecycleAccess } from "@/features/lifecycle-loop/access";
import { parseLifecycleEvidenceRegistration } from "@/features/lifecycle-loop/domain";
import { registerLifecycleEvidence } from "@/features/lifecycle-loop/persistence";
import type { BusinessRole } from "@/features/operating-model/context";

export const runtime = "nodejs";

function json(body: unknown, status: number, requestId: string) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store", "X-Request-Id": requestId } });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const requestId = crypto.randomUUID();
  const user = await getCurrentUser();
  if (!user) return json({ error: "UNAUTHORIZED", request_id: requestId, source: { type: "supabase", fallback_used: false } }, 401, requestId);
  const { id: projectId } = await params;
  let raw: Record<string, unknown>;
  try { raw = await request.json() as Record<string, unknown>; } catch {
    return json({ error: "INVALID_JSON", request_id: requestId, source: { type: "supabase", fallback_used: false } }, 400, requestId);
  }
  let registration;
  try { registration = parseLifecycleEvidenceRegistration(raw); } catch (error) {
    return json({ error: "INVALID_EVIDENCE", detail: error instanceof Error ? error.message : "请求不合法", request_id: requestId, source: { type: "supabase", fallback_used: false } }, 400, requestId);
  }
  const businessRole = String(raw.business_role || "") as BusinessRole;
  const dataClass = String(raw.data_class || "");
  if (!businessRole || !dataClass) return json({ error: "ROLE_AND_DATA_CLASS_REQUIRED", request_id: requestId, source: { type: "supabase", fallback_used: false } }, 400, requestId);
  const access = await resolveProjectLifecycleAccess({ user, projectId, businessRole });
  if (access.status !== "succeeded" || !access.scope) return json({ error: access.status.toUpperCase(), detail: access.warning, request_id: requestId, source: { type: "supabase", fallback_used: false } }, projectAccessHttpStatus(access.status), requestId);
  if (access.scope.dataClass !== dataClass) return json({ error: "DATA_CLASS_MISMATCH", request_id: requestId, source: { type: "supabase", fallback_used: false } }, 409, requestId);
  const result = await registerLifecycleEvidence({ orgId: access.scope.orgId, projectId, registration, actor: user, actorBusinessRole: businessRole, requestId });
  const status = result.status === "succeeded" ? 201 : result.status === "not_configured" ? 503 : 500;
  return json({ request_id: requestId, status: result.status, evidence: result.data, detail: result.warning, source: { type: "supabase", fallback_used: false } }, status, requestId);
}

