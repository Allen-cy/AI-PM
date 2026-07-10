import { getCurrentUser } from "@/features/auth/server";
import { projectAccessHttpStatus, resolveProjectLifecycleAccess } from "@/features/lifecycle-loop/access";
import { parseFeedbackCorrectionRequest, type FeedbackCorrectionStatus } from "@/features/lifecycle-loop/corrections";
import { createFeedbackCorrection, listFeedbackCorrections } from "@/features/lifecycle-loop/persistence";
import type { BusinessRole } from "@/features/operating-model/context";

export const runtime = "nodejs";

function json(body: unknown, status: number, requestId: string) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store", "X-Request-Id": requestId } });
}

export async function GET(request: Request): Promise<Response> {
  const requestId = crypto.randomUUID();
  const user = await getCurrentUser();
  if (!user) return json({ error: "UNAUTHORIZED", request_id: requestId, source: { type: "supabase", fallback_used: false } }, 401, requestId);
  const url = new URL(request.url);
  const projectId = String(url.searchParams.get("project_id") || "");
  const businessRole = String(url.searchParams.get("business_role") || "") as BusinessRole;
  const dataClass = String(url.searchParams.get("data_class") || "");
  if (!projectId || !businessRole || !dataClass) return json({ error: "PROJECT_ROLE_AND_DATA_CLASS_REQUIRED", request_id: requestId, source: { type: "supabase", fallback_used: false } }, 400, requestId);
  const access = await resolveProjectLifecycleAccess({ user, projectId, businessRole });
  if (access.status !== "succeeded" || !access.scope) return json({ error: access.status.toUpperCase(), detail: access.warning, request_id: requestId, source: { type: "supabase", fallback_used: false } }, projectAccessHttpStatus(access.status), requestId);
  if (access.scope.dataClass !== dataClass) return json({ error: "DATA_CLASS_MISMATCH", request_id: requestId, source: { type: "supabase", fallback_used: false } }, 409, requestId);
  const statusFilter = String(url.searchParams.get("status") || "") as FeedbackCorrectionStatus;
  const result = await listFeedbackCorrections({ projectId, status: statusFilter || undefined });
  const status = result.status === "succeeded" ? 200 : result.status === "not_configured" ? 503 : 500;
  return json({ request_id: requestId, status: result.status, corrections: result.data ?? [], detail: result.warning, source: { type: "supabase", fallback_used: false } }, status, requestId);
}

export async function POST(request: Request): Promise<Response> {
  const requestId = crypto.randomUUID();
  const user = await getCurrentUser();
  if (!user) return json({ error: "UNAUTHORIZED", request_id: requestId, source: { type: "supabase", fallback_used: false } }, 401, requestId);
  let raw: unknown;
  try { raw = await request.json(); } catch {
    return json({ error: "INVALID_JSON", request_id: requestId, source: { type: "supabase", fallback_used: false } }, 400, requestId);
  }
  let correction;
  try { correction = parseFeedbackCorrectionRequest(raw); } catch (error) {
    return json({ error: "INVALID_CORRECTION", detail: error instanceof Error ? error.message : "请求不合法", request_id: requestId, source: { type: "supabase", fallback_used: false } }, 400, requestId);
  }
  const dataClass = String((raw as Record<string, unknown>).data_class || "");
  if (!dataClass) return json({ error: "DATA_CLASS_REQUIRED", request_id: requestId, source: { type: "supabase", fallback_used: false } }, 400, requestId);
  const access = await resolveProjectLifecycleAccess({ user, projectId: correction.projectId, businessRole: correction.businessRole });
  if (access.status !== "succeeded" || !access.scope) return json({ error: access.status.toUpperCase(), detail: access.warning, request_id: requestId, source: { type: "supabase", fallback_used: false } }, projectAccessHttpStatus(access.status), requestId);
  if (access.scope.dataClass !== dataClass) return json({ error: "DATA_CLASS_MISMATCH", request_id: requestId, source: { type: "supabase", fallback_used: false } }, 409, requestId);
  const result = await createFeedbackCorrection({ correction, orgId: access.scope.orgId, actor: user, requestId });
  const status = result.status === "succeeded" ? 201 : result.status === "not_found" ? 404 : result.status === "conflict" ? 409 : result.status === "not_configured" ? 503 : 500;
  return json({ request_id: requestId, status: result.status, correction: result.data, detail: result.warning, source: { type: "supabase", fallback_used: false } }, status, requestId);
}

