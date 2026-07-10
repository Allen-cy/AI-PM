import { getAuthSupabase, getCurrentUser } from "@/features/auth/server";
import { projectAccessHttpStatus, resolveProjectLifecycleAccess } from "@/features/lifecycle-loop/access";
import type { BusinessRole } from "@/features/operating-model/context";
import { authorizeBusinessOperation } from "@/features/operating-model/authorization-persistence";
import { buildImpactPackageDraft, type ImpactTargetType } from "@/features/operating-model/operating-contracts";
import { writeOperationAudit } from "@/features/security/repository";

export const runtime = "nodejs";

function json(body: unknown, status: number, requestId: string) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store", "X-Request-Id": requestId } });
}

async function accessFor(request: Request, projectId: string, role: BusinessRole, dataClass: string) {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "UNAUTHORIZED", status: 401 } as const;
  const access = await resolveProjectLifecycleAccess({ user, projectId, businessRole: role });
  if (access.status !== "succeeded" || !access.scope) return { ok: false, error: access.status.toUpperCase(), detail: access.warning, status: projectAccessHttpStatus(access.status) } as const;
  if (access.scope.dataClass !== dataClass) return { ok: false, error: "DATA_CLASS_MISMATCH", status: 409 } as const;
  return { ok: true, user, access } as const;
}

async function sourceStatus(projectId: string, sourceType: "risk" | "issue" | "change", sourceId: string): Promise<string | null> {
  const supabase = getAuthSupabase();
  const table = sourceType === "risk" ? "risks" : sourceType === "issue" ? "project_issues" : "project_changes";
  const result = await supabase.from(table).select("id,status").eq("id", sourceId).eq("project_id", projectId).maybeSingle();
  if (result.error) throw result.error;
  return result.data ? String(result.data.status || "") : null;
}

async function authorizeImpact(input: {
  scope: Extract<Awaited<ReturnType<typeof accessFor>>, { ok: true }>;
  projectId: string;
  action: "create" | "execute" | "review";
  objectState: string;
  requestId: string;
}) {
  const project = await getAuthSupabase().from("projects").select("project_level").eq("id", input.projectId).maybeSingle();
  if (project.error) return { status: "failed" as const, warning: project.error.message };
  return authorizeBusinessOperation({
    user: input.scope.user,
    context: input.scope.access.context!,
    request: { objectType: "impact_package", action: input.action, objectState: input.objectState, projectLevel: String(project.data?.project_level || "*"), decisionLevel: "project", amount: null },
    resourceId: input.projectId,
    requestId: input.requestId,
  });
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const requestId = crypto.randomUUID();
  const { id: projectId } = await params;
  const url = new URL(request.url);
  const role = String(url.searchParams.get("business_role") || "") as BusinessRole;
  const dataClass = String(url.searchParams.get("data_class") || "");
  if (!role || !dataClass) return json({ error: "ROLE_AND_DATA_CLASS_REQUIRED", request_id: requestId }, 400, requestId);
  const scope = await accessFor(request, projectId, role, dataClass);
  if (!scope.ok) return json({ error: scope.error, detail: "detail" in scope ? scope.detail : undefined, request_id: requestId }, scope.status, requestId);
  const supabase = getAuthSupabase();
  const packages = await supabase.from("object_impact_packages").select("*").eq("org_id", scope.access.scope!.orgId).eq("project_id", projectId).eq("data_class", dataClass).order("updated_at", { ascending: false }).limit(200);
  const packageIds = (packages.data ?? []).map(item => String(item.id));
  const events = packageIds.length > 0
    ? await supabase.from("object_impact_package_events").select("*").in("impact_package_id", packageIds).order("created_at", { ascending: false }).limit(500)
    : { data: [], error: null };
  const error = packages.error || events.error;
  if (error) return json({ error: "IMPACT_PACKAGE_LOAD_FAILED", detail: error.message, request_id: requestId }, /does not exist|schema cache/i.test(error.message) ? 503 : 500, requestId);
  return json({ status: "succeeded", packages: packages.data ?? [], events: events.data ?? [], source: { type: "supabase", fallback_used: false }, request_id: requestId }, 200, requestId);
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const requestId = crypto.randomUUID();
  const { id: projectId } = await params;
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; } catch { return json({ error: "INVALID_JSON", request_id: requestId }, 400, requestId); }
  const role = String(body.business_role || "") as BusinessRole;
  const dataClass = String(body.data_class || "");
  const operation = String(body.operation || "");
  if (!role || !dataClass || !operation) return json({ error: "OPERATION_ROLE_AND_DATA_CLASS_REQUIRED", request_id: requestId }, 400, requestId);
  const scope = await accessFor(request, projectId, role, dataClass);
  if (!scope.ok) return json({ error: scope.error, detail: "detail" in scope ? scope.detail : undefined, request_id: requestId }, scope.status, requestId);
  const supabase = getAuthSupabase();
  try {
    let resource: Record<string, unknown>;
    if (operation === "create") {
      if (!["pm", "operations", "pmo"].includes(role)) return json({ error: "IMPACT_PACKAGE_CREATE_FORBIDDEN", request_id: requestId }, 403, requestId);
      const policy = await authorizeImpact({ scope, projectId, action: "create", objectState: "source_confirmed", requestId });
      if (policy.status !== "succeeded") return json({ error: "AUTHORIZATION_POLICY_UNAVAILABLE", detail: policy.warning, request_id: requestId }, policy.status === "not_configured" ? 503 : 500, requestId);
      if (!policy.decision.allowed) return json({ error: "IMPACT_PACKAGE_CREATE_FORBIDDEN", denial_code: policy.decision.code, request_id: requestId }, 403, requestId);
      const sourceType = String(body.source_type || "") as "risk" | "issue" | "change";
      const sourceId = String(body.source_id || "").trim();
      if (!["risk", "issue", "change"].includes(sourceType) || !sourceId) return json({ error: "IMPACT_PACKAGE_SOURCE_REQUIRED", request_id: requestId }, 400, requestId);
      const status = await sourceStatus(projectId, sourceType, sourceId);
      if (!status) return json({ error: "IMPACT_PACKAGE_SOURCE_NOT_FOUND", request_id: requestId }, 404, requestId);
      const rawTargets = Array.isArray(body.targets) ? body.targets : [];
      const targets = rawTargets.map(item => {
        const row = item && typeof item === "object" && !Array.isArray(item) ? item as Record<string, unknown> : {};
        return { targetType: String(row.target_type || "") as ImpactTargetType, targetId: String(row.target_id || ""), proposedChange: row.proposed_change && typeof row.proposed_change === "object" && !Array.isArray(row.proposed_change) ? row.proposed_change as Record<string, unknown> : {} };
      });
      const draft = buildImpactPackageDraft({ orgId: scope.access.scope!.orgId, projectId, sourceType, sourceId, sourceStatus: status, targets, ownerUserId: String(body.owner_user_id || ""), reviewerUserId: String(body.reviewer_user_id || ""), dueAt: String(body.due_at || "") });
      const idempotencyKey = String(body.idempotency_key || `${sourceType}:${sourceId}:${JSON.stringify(targets)}`).trim();
      const inserted = await supabase.from("object_impact_packages").upsert({ org_id: draft.orgId, project_id: projectId, source_type: draft.sourceType, source_id: draft.sourceId, source_status: draft.sourceStatus, targets: draft.targets.map(item => ({ target_type: item.targetType, target_id: item.targetId, proposed_change: item.proposedChange })), status: draft.status, owner_user_id: draft.ownerUserId, reviewer_user_id: draft.reviewerUserId, due_at: draft.dueAt, idempotency_key: idempotencyKey, data_class: dataClass, created_by: scope.user.id }, { onConflict: "org_id,idempotency_key", ignoreDuplicates: true }).select("*").maybeSingle();
      if (inserted.error) throw inserted.error;
      if (inserted.data) resource = inserted.data as Record<string, unknown>;
      else {
        const existing = await supabase.from("object_impact_packages").select("*").eq("org_id", draft.orgId).eq("idempotency_key", idempotencyKey).single();
        if (existing.error) throw existing.error;
        resource = existing.data as Record<string, unknown>;
      }
    } else {
      const packageId = String(body.package_id || "");
      const current = await supabase.from("object_impact_packages").select("*").eq("id", packageId).eq("org_id", scope.access.scope!.orgId).eq("project_id", projectId).eq("data_class", dataClass).maybeSingle();
      if (current.error) throw current.error;
      if (!current.data) return json({ error: "IMPACT_PACKAGE_NOT_FOUND", request_id: requestId }, 404, requestId);
      const actionMap: Record<string, string> = { confirm: "confirm", reject: "reject", submit_application: "submit_application", review_effect: "review_effect", close: "close" };
      const action = actionMap[operation];
      if (!action) return json({ error: "UNSUPPORTED_OPERATION", request_id: requestId }, 400, requestId);
      const policyAction = operation === "submit_application" ? "execute" : "review";
      const policy = await authorizeImpact({ scope, projectId, action: policyAction, objectState: String(current.data.status), requestId });
      if (policy.status !== "succeeded") return json({ error: "AUTHORIZATION_POLICY_UNAVAILABLE", detail: policy.warning, request_id: requestId }, policy.status === "not_configured" ? 503 : 500, requestId);
      if (!policy.decision.allowed) return json({ error: "IMPACT_PACKAGE_TRANSITION_FORBIDDEN", denial_code: policy.decision.code, request_id: requestId }, 403, requestId);
      const transitioned = await supabase.rpc("transition_object_impact_package_tx", { p_package_id: packageId, p_expected_status: current.data.status, p_expected_version: current.data.version, p_action: action, p_actor_user_id: scope.user.id, p_actor_business_role: role, p_comment: String(body.comment || "") || null, p_evidence: Array.isArray(body.evidence) ? body.evidence : [], p_effect_review: body.effect_review && typeof body.effect_review === "object" ? body.effect_review : {}, p_request_id: requestId });
      if (transitioned.error) throw transitioned.error;
      resource = transitioned.data as Record<string, unknown>;
    }
    await writeOperationAudit({ user: scope.user, action: `impact_package_${operation}`, resourceType: "object_impact_package", resourceId: String(resource.id || ""), status: "succeeded", severity: "medium", summary: `影响包动作：${operation}`, detail: { projectId, role, status: resource.status }, requestId });
    return json({ status: "succeeded", package: resource, source: { type: "supabase", fallback_used: false }, request_id: requestId }, operation === "create" ? 201 : 200, requestId);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "unknown";
    const status = /FORBIDDEN|REQUIRED/.test(detail) ? 403 : /CONFLICT|TRANSITION/.test(detail) ? 409 : /does not exist|schema cache/i.test(detail) ? 503 : 500;
    return json({ error: "IMPACT_PACKAGE_OPERATION_FAILED", detail, request_id: requestId }, status, requestId);
  }
}
