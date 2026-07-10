import { requireAuthenticatedApiUser } from "@/features/auth/server";
import { resolveRequestedDecisionContext } from "@/features/decisions/access";
import { canPerformDecisionOperation } from "@/features/decisions/domain";
import { createReportingSnapshot, getReportingSnapshot, listReportingSnapshots, transitionReportingSnapshotState, type DecisionBriefRecord, type ReportingSnapshotInput } from "@/features/decisions/persistence";
import { type BusinessRole, type SubjectScope } from "@/features/operating-model/context";
import { listBusinessRoleAssignments } from "@/features/operating-model/persistence";

export const runtime = "nodejs";

function json(body: unknown, status = 200, requestId = crypto.randomUUID()) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store", "X-Request-Id": requestId } });
}

function statusCode(status: string) {
  return status === "succeeded" ? 200 : status === "conflict" ? 409 : status === "not_configured" ? 503 : 500;
}

function contextFrom(record: Record<string, unknown>) {
  const orgId = String(record.org_id ?? "").trim();
  const subjectScope = String(record.subject_scope ?? "") as SubjectScope;
  const subjectId = String(record.subject_id ?? "").trim();
  const role = String(record.business_role ?? record.role ?? "") as BusinessRole;
  const dataClass = String(record.data_class ?? "production") as DecisionBriefRecord["dataClass"];
  if (!orgId || !subjectId || !["project", "portfolio", "organization", "customer", "contract"].includes(subjectScope)) return null;
  return { orgId, subjectScope, subjectId, role, dataClass };
}

export async function GET(request: Request): Promise<Response> {
  const requestId = crypto.randomUUID();
  const user = await requireAuthenticatedApiUser();
  if (!user) return json({ error: "UNAUTHORIZED", request_id: requestId }, 401, requestId);
  const requested = contextFrom(Object.fromEntries(new URL(request.url).searchParams.entries()));
  if (!requested) return json({ error: "REPORTING_CONTEXT_REQUIRED", request_id: requestId }, 400, requestId);
  const assignments = await listBusinessRoleAssignments(user.id);
  if (assignments.status !== "succeeded") return json({ error: "P17_STORAGE_NOT_CONFIGURED", detail: assignments.warning, request_id: requestId }, 503, requestId);
  const context = await resolveRequestedDecisionContext({ user, assignments: assignments.data ?? [], ...requested });
  if (!context || !canPerformDecisionOperation(requested.role, "view")) return json({ error: "REPORTING_SCOPE_FORBIDDEN", request_id: requestId }, 403, requestId);
  const result = await listReportingSnapshots(requested);
  return json({ request_id: requestId, status: result.status, snapshots: result.data ?? [], warning: result.warning, source: { type: "supabase", fallback_used: false } }, statusCode(result.status), requestId);
}

export async function POST(request: Request): Promise<Response> {
  const requestId = crypto.randomUUID();
  const user = await requireAuthenticatedApiUser();
  if (!user) return json({ error: "UNAUTHORIZED", request_id: requestId }, 401, requestId);
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; }
  catch { return json({ error: "INVALID_JSON", request_id: requestId }, 400, requestId); }
  const action = String(body.action || "create");
  if (!["create", "submit", "return", "resubmit", "freeze", "accept", "supersede"].includes(action)) return json({ error: "REPORTING_ACTION_INVALID", request_id: requestId }, 400, requestId);
  let requested = contextFrom(body);
  let existingSnapshot: Record<string, unknown> | null = null;
  if (action !== "create") {
    const snapshotResult = await getReportingSnapshot(String(body.snapshot_id || ""));
    if (snapshotResult.status !== "succeeded" || !snapshotResult.data) return json({ error: "REPORTING_SNAPSHOT_UNAVAILABLE", detail: snapshotResult.warning, request_id: requestId }, statusCode(snapshotResult.status), requestId);
    existingSnapshot = snapshotResult.data;
    requested = contextFrom({ org_id: existingSnapshot.org_id, subject_scope: existingSnapshot.subject_scope, subject_id: existingSnapshot.subject_id, business_role: body.business_role, data_class: existingSnapshot.data_class });
  }
  if (!requested) return json({ error: "REPORTING_CONTEXT_REQUIRED", request_id: requestId }, 400, requestId);
  const assignments = await listBusinessRoleAssignments(user.id);
  if (assignments.status !== "succeeded") return json({ error: "P17_STORAGE_NOT_CONFIGURED", detail: assignments.warning, request_id: requestId }, 503, requestId);
  const context = await resolveRequestedDecisionContext({ user, assignments: assignments.data ?? [], ...requested });
  const operation = action === "create" ? "create_report" : action === "return" ? "return_report" : action === "submit" || action === "resubmit" ? "resubmit_report" : action === "supersede" ? "supersede_report" : "freeze_report";
  if (!context || !canPerformDecisionOperation(requested.role, operation)) return json({ error: "REPORTING_ACTION_FORBIDDEN", request_id: requestId }, 403, requestId);
  if (action !== "create") {
    const result = await transitionReportingSnapshotState({ snapshot: existingSnapshot ?? {}, operation: action === "accept" ? "freeze" : action as "submit" | "return" | "resubmit" | "freeze" | "supersede", reason: String(body.reason || (action === "accept" ? "PMO已接收并冻结" : "")), dueAt: body.due_at ? String(body.due_at) : null, actor: user, actorBusinessRole: requested.role, requestId });
    return json({ request_id: requestId, action, status: result.status, snapshot: result.data, warning: result.warning }, statusCode(result.status), requestId);
  }
  const snapshot: ReportingSnapshotInput = {
    ...requested,
    snapshotType: String(body.snapshot_type || "") as ReportingSnapshotInput["snapshotType"],
    periodStart: String(body.period_start || ""), periodEnd: String(body.period_end || ""),
    metrics: body.metrics && typeof body.metrics === "object" ? body.metrics as Record<string, unknown> : {},
    exceptions: Array.isArray(body.exceptions) ? body.exceptions.filter(item => item && typeof item === "object") as Array<Record<string, unknown>> : [],
    narrative: String(body.narrative || ""), sourceSnapshotAt: String(body.source_snapshot_at || ""),
    sourceDefinition: body.source_definition && typeof body.source_definition === "object" ? body.source_definition as Record<string, unknown> : {},
    submittedToUserId: body.submitted_to_user_id ? String(body.submitted_to_user_id) : null,
  };
  const result = await createReportingSnapshot({ snapshot, actor: user, actorBusinessRole: requested.role, requestId });
  return json({ request_id: requestId, action, status: result.status, snapshot: result.data, warning: result.warning }, result.status === "succeeded" ? 201 : statusCode(result.status), requestId);
}
