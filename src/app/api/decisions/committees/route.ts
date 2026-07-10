import { requireAuthenticatedApiUser } from "@/features/auth/server";
import { resolveRequestedDecisionContext } from "@/features/decisions/access";
import { canPerformDecisionOperation, type DecisionLevel } from "@/features/decisions/domain";
import { createDecisionCommittee, type DecisionBriefRecord } from "@/features/decisions/persistence";
import { type BusinessRole, type SubjectScope } from "@/features/operating-model/context";
import { listBusinessRoleAssignments } from "@/features/operating-model/persistence";
import { getAuthSupabase } from "@/features/auth/server";

export const runtime = "nodejs";

function json(body: unknown, status = 200, requestId = crypto.randomUUID()) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store", "X-Request-Id": requestId } });
}

function context(record: Record<string, unknown>) {
  const orgId = String(record.org_id || "");
  const subjectScope = String(record.subject_scope || "") as Extract<SubjectScope, "project" | "portfolio" | "organization">;
  const subjectId = String(record.subject_id || "");
  const role = String(record.business_role || "") as BusinessRole;
  const dataClass = String(record.data_class || "production") as DecisionBriefRecord["dataClass"];
  if (!orgId || !subjectId || !["project", "portfolio", "organization"].includes(subjectScope) || !["production", "sample", "test", "diagnostic", "unclassified"].includes(dataClass)) return null;
  return { orgId, subjectScope, subjectId, role, dataClass };
}

async function authorize(user: NonNullable<Awaited<ReturnType<typeof requireAuthenticatedApiUser>>>, requested: NonNullable<ReturnType<typeof context>>, operation: "view" | "create_committee") {
  const assignments = await listBusinessRoleAssignments(user.id);
  if (assignments.status !== "succeeded") return null;
  const resolved = await resolveRequestedDecisionContext({ user, assignments: assignments.data ?? [], role: requested.role, orgId: requested.orgId, subjectScope: requested.subjectScope, subjectId: requested.subjectId });
  return resolved && canPerformDecisionOperation(requested.role, operation) ? resolved : null;
}

export async function GET(request: Request) {
  const requestId = crypto.randomUUID(); const user = await requireAuthenticatedApiUser();
  if (!user) return json({ error: "UNAUTHORIZED", request_id: requestId }, 401, requestId);
  const requested = context(Object.fromEntries(new URL(request.url).searchParams.entries()));
  if (!requested) return json({ error: "DECISION_COMMITTEE_CONTEXT_REQUIRED", request_id: requestId }, 400, requestId);
  if (!await authorize(user, requested, "view")) return json({ error: "DECISION_COMMITTEE_SCOPE_FORBIDDEN", request_id: requestId }, 403, requestId);
  const result = await getAuthSupabase().from("decision_committees").select("*,decision_committee_members(*)")
    .eq("org_id", requested.orgId).eq("subject_scope", requested.subjectScope).eq("subject_id", requested.subjectId).eq("data_class", requested.dataClass).order("updated_at", { ascending: false });
  if (result.error) return json({ error: "DECISION_COMMITTEE_LOAD_FAILED", detail: result.error.message, request_id: requestId }, 503, requestId);
  return json({ status: "succeeded", committees: result.data ?? [], request_id: requestId, source: { type: "supabase", fallback_used: false } }, 200, requestId);
}

export async function POST(request: Request) {
  const requestId = crypto.randomUUID(); const user = await requireAuthenticatedApiUser();
  if (!user) return json({ error: "UNAUTHORIZED", request_id: requestId }, 401, requestId);
  let body: Record<string, unknown>; try { body = await request.json() as Record<string, unknown>; } catch { return json({ error: "INVALID_JSON", request_id: requestId }, 400, requestId); }
  const requested = context(body); if (!requested) return json({ error: "DECISION_COMMITTEE_CONTEXT_REQUIRED", request_id: requestId }, 400, requestId);
  if (!await authorize(user, requested, "create_committee")) return json({ error: "DECISION_COMMITTEE_CREATE_FORBIDDEN", request_id: requestId }, 403, requestId);
  const members = Array.isArray(body.members) ? body.members.filter(item => item && typeof item === "object") as Array<{ user_id: string; business_role: "ceo" | "sponsor"; member_role: "chair" | "voter" | "observer"; delegated_from_user_id?: string | null }> : [];
  const result = await createDecisionCommittee({ ...requested, name: String(body.name || ""), decisionLevels: (Array.isArray(body.decision_levels) ? body.decision_levels.map(String) : []) as DecisionLevel[], chairUserId: String(body.chair_user_id || ""), quorum: Number(body.quorum), minApprovals: Number(body.min_approvals), members, validUntil: body.valid_until ? String(body.valid_until) : null, actor: user, actorBusinessRole: requested.role, requestId });
  return json({ status: result.status, committee: result.data, warning: result.warning, request_id: requestId }, result.status === "succeeded" ? 201 : result.status === "conflict" ? 409 : 503, requestId);
}
