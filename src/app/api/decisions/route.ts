import { requireAuthenticatedApiUser } from "@/features/auth/server";
import { resolveRequestedDecisionContext } from "@/features/decisions/access";
import { canPerformDecisionOperation } from "@/features/decisions/domain";
import { createDecisionBrief, listDecisionWorkspace, type DecisionBriefRecord } from "@/features/decisions/persistence";
import { type BusinessRole, type SubjectScope } from "@/features/operating-model/context";
import { listBusinessRoleAssignments } from "@/features/operating-model/persistence";

export const runtime = "nodejs";

const ROLES = new Set<BusinessRole>(["pm", "operations", "pmo", "ceo", "sponsor", "business_owner", "finance", "quality"]);
const SCOPES = new Set<SubjectScope>(["project", "portfolio", "organization", "customer", "contract"]);
const DATA_CLASSES = new Set<DecisionBriefRecord["dataClass"]>(["production", "sample", "test", "diagnostic", "unclassified"]);

function json(body: unknown, status = 200, requestId = crypto.randomUUID()) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store", "X-Request-Id": requestId } });
}

function resultStatus(status: string): number {
  return status === "succeeded" ? 200 : status === "not_found" ? 404 : status === "conflict" ? 409 : status === "not_configured" ? 503 : 500;
}

function requestedContext(record: Record<string, unknown>) {
  const orgId = String(record.org_id ?? record.orgId ?? "").trim();
  const subjectScope = String(record.subject_scope ?? record.subjectScope ?? "") as SubjectScope;
  const subjectId = String(record.subject_id ?? record.subjectId ?? "").trim();
  const role = String(record.business_role ?? record.businessRole ?? record.role ?? "") as BusinessRole;
  const dataClass = String(record.data_class ?? record.dataClass ?? "production") as DecisionBriefRecord["dataClass"];
  if (!orgId || !subjectId || !SCOPES.has(subjectScope) || !ROLES.has(role) || !DATA_CLASSES.has(dataClass)) return null;
  return { orgId, subjectScope, subjectId, role, dataClass };
}

export async function GET(request: Request): Promise<Response> {
  const requestId = crypto.randomUUID();
  const user = await requireAuthenticatedApiUser();
  if (!user) return json({ error: "UNAUTHORIZED", request_id: requestId }, 401, requestId);
  const url = new URL(request.url);
  const requested = requestedContext(Object.fromEntries(url.searchParams.entries()));
  if (!requested) return json({ error: "DECISION_CONTEXT_REQUIRED", request_id: requestId }, 400, requestId);
  const assignments = await listBusinessRoleAssignments(user.id);
  if (assignments.status !== "succeeded") return json({ error: "P17_STORAGE_NOT_CONFIGURED", detail: assignments.warning, request_id: requestId }, 503, requestId);
  const context = await resolveRequestedDecisionContext({ user, assignments: assignments.data ?? [], ...requested });
  if (!context || !canPerformDecisionOperation(requested.role, "view")) return json({ error: "DECISION_SCOPE_FORBIDDEN", request_id: requestId }, 403, requestId);
  const result = await listDecisionWorkspace({ ...requested, actorUserId: user.id, actorBusinessRole: requested.role });
  return json({ request_id: requestId, actor_user_id: user.id, context, status: result.status, workspace: result.data, warning: result.warning, source: { type: "supabase", fallback_used: false } }, resultStatus(result.status), requestId);
}

export async function POST(request: Request): Promise<Response> {
  const requestId = crypto.randomUUID();
  const user = await requireAuthenticatedApiUser();
  if (!user) return json({ error: "UNAUTHORIZED", request_id: requestId }, 401, requestId);
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; }
  catch { return json({ error: "INVALID_JSON", request_id: requestId }, 400, requestId); }
  const requested = requestedContext(body);
  if (!requested) return json({ error: "DECISION_CONTEXT_REQUIRED", request_id: requestId }, 400, requestId);
  const assignments = await listBusinessRoleAssignments(user.id);
  if (assignments.status !== "succeeded") return json({ error: "P17_STORAGE_NOT_CONFIGURED", detail: assignments.warning, request_id: requestId }, 503, requestId);
  const context = await resolveRequestedDecisionContext({ user, assignments: assignments.data ?? [], ...requested });
  if (!context || !canPerformDecisionOperation(requested.role, "create")) return json({ error: "DECISION_CREATE_FORBIDDEN", request_id: requestId }, 403, requestId);
  const result = await createDecisionBrief({
    resource: { orgId: requested.orgId, subjectScope: requested.subjectScope, subjectId: requested.subjectId, projectId: requested.subjectScope === "project" ? requested.subjectId : null, dataClass: requested.dataClass },
    brief: body.brief,
    actor: user,
    actorBusinessRole: requested.role,
    requestId,
  });
  return json({ request_id: requestId, status: result.status, brief: result.data, warning: result.warning }, result.status === "succeeded" ? 201 : resultStatus(result.status), requestId);
}
