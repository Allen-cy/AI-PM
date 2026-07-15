import { getAuthSupabase, getCurrentUser } from "@/features/auth/server";
import { nextCrossRoleState, type CrossRoleFlowOperation, type CrossRoleFlowState } from "@/features/cross-role-flow/domain";
import { resolveBusinessContext, type BusinessRole, type SubjectScope } from "@/features/operating-model/context";
import { listBusinessRoleAssignments, loadContextProjectIdentityMappings, type ManagementSignalRecord } from "@/features/operating-model/persistence";
import { writeOperationAudit } from "@/features/security/repository";

export const runtime = "nodejs";
const DATA_CLASSES = new Set(["production", "sample", "test", "diagnostic", "unclassified"]);

function json(body: unknown, status = 200, requestId = crypto.randomUUID()) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store", "X-Request-Id": requestId } });
}

async function authorize(request: Request) {
  const user = await getCurrentUser();
  if (!user) return { ok: false as const, status: 401, error: "UNAUTHORIZED" };
  const url = new URL(request.url); const role = String(url.searchParams.get("role") || "") as BusinessRole;
  const orgId = String(url.searchParams.get("org_id") || ""); const subjectScope = String(url.searchParams.get("subject_scope") || "") as SubjectScope;
  const subjectId = String(url.searchParams.get("subject_id") || ""); const dataClass = String(url.searchParams.get("data_class") || "production") as ManagementSignalRecord["dataClass"];
  if (!role || !orgId || !subjectScope || !subjectId || !DATA_CLASSES.has(dataClass)) return { ok: false as const, status: 400, error: "BUSINESS_CONTEXT_REQUIRED" };
  const assignments = await listBusinessRoleAssignments(user.id);
  if (assignments.status !== "succeeded") return { ok: false as const, status: 503, error: "ROLE_STORAGE_UNAVAILABLE", detail: assignments.warning };
  const context = resolveBusinessContext({ user: { id: user.id, systemRole: user.role }, assignments: assignments.data ?? [], requestedRole: role, requestedOrgId: orgId, requestedSubjectScope: subjectScope, requestedSubjectId: subjectId });
  if (!context) return { ok: false as const, status: 403, error: "BUSINESS_CONTEXT_FORBIDDEN" };
  const mappings = await loadContextProjectIdentityMappings({ context, dataClass });
  if (mappings.status !== "succeeded") return { ok: false as const, status: 503, error: "PROJECT_SCOPE_UNAVAILABLE", detail: mappings.warning };
  return { ok: true as const, user, context, role, orgId, subjectScope, subjectId, dataClass, projectIds: [...new Set((mappings.data ?? []).map(item => item.projectId))] };
}

export async function GET(request: Request) {
  const requestId = crypto.randomUUID(); const access = await authorize(request);
  if (!access.ok) return json({ error: access.error, detail: access.detail, request_id: requestId }, access.status, requestId);
  const supabase = getAuthSupabase();
  const flows = await supabase.from("cross_role_flows").select("*").eq("org_id", access.orgId).eq("data_class", access.dataClass).order("updated_at", { ascending: false }).limit(200);
  if (flows.error) return json({ error: "CROSS_ROLE_FLOW_STORAGE_UNAVAILABLE", detail: flows.error.message, request_id: requestId }, 503, requestId);
  const visible = (flows.data ?? []).filter(row => (row.project_id && access.projectIds.includes(String(row.project_id))) || (row.subject_scope === access.subjectScope && row.subject_id === access.subjectId));
  const ids = visible.map(row => row.id);
  const [actions, events] = ids.length ? await Promise.all([
    supabase.from("cross_role_flow_actions").select("*").in("flow_id", ids).order("created_at"),
    supabase.from("business_events").select("id,aggregate_id,event_type,from_state,to_state,actor_business_role,evidence_refs,payload,occurred_at").eq("aggregate_type", "cross_role_flow").in("aggregate_id", ids).order("occurred_at"),
  ]) : [{ data: [], error: null }, { data: [], error: null }];
  const error = actions.error || events.error;
  if (error) return json({ error: "CROSS_ROLE_FLOW_DETAIL_UNAVAILABLE", detail: error.message, request_id: requestId }, 503, requestId);
  return json({ status: "succeeded", request_id: requestId, context: access.context, data_class: access.dataClass, source: { type: "supabase", fallback_used: false }, flows: visible.map(flow => ({ ...flow, allowed_operations: ["pmo_review", "freeze_report", "submit_decision", "record_decision", "dispatch_action", "acknowledge_receipt", "review_effect", "close", "cancel"].filter(operation => nextCrossRoleState(flow.status as CrossRoleFlowState, operation as CrossRoleFlowOperation, access.role)), actions: (actions.data ?? []).filter(item => item.flow_id === flow.id), events: (events.data ?? []).filter(item => item.aggregate_id === flow.id) })) }, 200, requestId);
}

export async function POST(request: Request) {
  const requestId = crypto.randomUUID(); const access = await authorize(request);
  if (!access.ok) return json({ error: access.error, detail: access.detail, request_id: requestId }, access.status, requestId);
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return json({ error: "INVALID_JSON", request_id: requestId }, 400, requestId);
  const operation = String(body.operation || ""); const idempotencyKey = String(body.idempotency_key || "").trim();
  if (!idempotencyKey) return json({ error: "IDEMPOTENCY_KEY_REQUIRED", request_id: requestId }, 400, requestId);
  const supabase = getAuthSupabase();
  if (operation === "create") {
    if (!["pm", "operations", "business_owner", "finance", "quality"].includes(access.role)) return json({ error: "FLOW_SUBMIT_ROLE_FORBIDDEN", request_id: requestId }, 403, requestId);
    const projectId = String(body.project_id || ""); const evidence = Array.isArray(body.evidence_refs) ? body.evidence_refs.map(String).filter(Boolean) : [];
    if (!access.projectIds.includes(projectId)) return json({ error: "PROJECT_OUTSIDE_CONTEXT", request_id: requestId }, 403, requestId);
    const result = await supabase.rpc("create_v650_cross_role_flow_tx", {
      p_org_id: access.orgId, p_subject_scope: "project", p_subject_id: projectId, p_project_id: projectId, p_data_class: access.dataClass,
      p_flow_type: String(body.flow_type || "exception_to_decision"), p_title: String(body.title || ""), p_summary: String(body.summary || ""),
      p_business_impact: String(body.business_impact || ""), p_source_type: String(body.source_type || "manual_exception"), p_source_id: String(body.source_id || evidence[0] || idempotencyKey),
      p_pmo_owner_user_id: body.pmo_owner_user_id || null, p_deadline: body.deadline, p_evidence_refs: evidence,
      p_actor_user_id: access.user.id, p_actor_business_role: access.role, p_idempotency_key: idempotencyKey,
    });
    if (result.error) return json({ error: "FLOW_CREATE_FAILED", detail: result.error.message, request_id: requestId }, /VERSION|CONFLICT/.test(result.error.message) ? 409 : 422, requestId);
    await writeOperationAudit({ user: access.user, action: "cross_role_flow_create", resourceType: "cross_role_flow", resourceId: String((result.data as { id?: string } | null)?.id || ""), status: "succeeded", severity: "high", summary: "PM/运营已将业务例外提交PMO", detail: { project_id: projectId, data_class: access.dataClass }, requestId });
    return json({ status: "succeeded", request_id: requestId, data: result.data }, 201, requestId);
  }

  const flowId = String(body.flow_id || ""); const expectedVersion = Number(body.expected_version);
  const current = await supabase.from("cross_role_flows").select("*").eq("id", flowId).eq("org_id", access.orgId).eq("data_class", access.dataClass).maybeSingle();
  if (current.error) return json({ error: "FLOW_LOAD_FAILED", detail: current.error.message, request_id: requestId }, 503, requestId);
  if (!current.data || (current.data.project_id && !access.projectIds.includes(String(current.data.project_id)))) return json({ error: "FLOW_NOT_FOUND_IN_CONTEXT", request_id: requestId }, 404, requestId);
  const next = nextCrossRoleState(current.data.status as CrossRoleFlowState, operation as CrossRoleFlowOperation, access.role);
  if (!next) return json({ error: "FLOW_TRANSITION_FORBIDDEN", request_id: requestId }, 403, requestId);
  let reportingSnapshotId = body.reporting_snapshot_id || null; let decisionBriefId = body.decision_brief_id || null; let decisionId = body.decision_id || null;
  if (operation === "freeze_report" && !reportingSnapshotId && body.formal_output_id) {
    const output = await supabase.from("formal_business_outputs").select("reporting_snapshot_id").eq("id", body.formal_output_id).eq("org_id", access.orgId).eq("data_class", access.dataClass).maybeSingle(); reportingSnapshotId = output.data?.reporting_snapshot_id || null;
  }
  if (operation === "submit_decision" && !decisionBriefId) {
    const brief = await supabase.from("decision_briefs").select("id").eq("org_id", access.orgId).eq("subject_scope", current.data.subject_scope).eq("subject_id", current.data.subject_id).eq("data_class", access.dataClass).eq("status", "submitted").order("submitted_at", { ascending: false }).limit(1).maybeSingle(); decisionBriefId = brief.data?.id || null;
  }
  if (operation === "record_decision" && !decisionId) {
    const decision = await supabase.from("decisions").select("id").eq("brief_id", current.data.decision_brief_id).order("decided_at", { ascending: false }).limit(1).maybeSingle(); decisionId = decision.data?.id || null;
  }
  const evidence = Array.isArray(body.evidence_refs) ? body.evidence_refs.map(String).filter(Boolean) : [];
  const result = await supabase.rpc("transition_v650_cross_role_flow_tx", {
    p_flow_id: flowId, p_org_id: access.orgId, p_subject_scope: current.data.subject_scope, p_subject_id: current.data.subject_id, p_data_class: access.dataClass,
    p_operation: operation, p_expected_version: expectedVersion, p_actor_user_id: access.user.id, p_actor_business_role: access.role,
    p_output_summary: String(body.output_summary || ""), p_evidence_refs: evidence, p_reporting_snapshot_id: reportingSnapshotId, p_decision_brief_id: decisionBriefId, p_decision_id: decisionId,
    p_action_title: String(body.action_title || ""), p_action_owner_user_id: body.action_owner_user_id || null, p_action_deadline: body.action_deadline || null,
    p_acceptance_criteria: String(body.acceptance_criteria || ""), p_idempotency_key: idempotencyKey,
  });
  if (result.error) return json({ error: "FLOW_TRANSITION_FAILED", detail: result.error.message, request_id: requestId }, /VERSION|CONFLICT/.test(result.error.message) ? 409 : 422, requestId);
  await writeOperationAudit({ user: access.user, action: `cross_role_flow_${operation}`, resourceType: "cross_role_flow", resourceId: flowId, status: "succeeded", severity: "high", summary: `跨角色闭环已流转到 ${next}`, detail: { from: current.data.status, to: next, data_class: access.dataClass }, requestId });
  return json({ status: "succeeded", request_id: requestId, data: result.data }, 200, requestId);
}
