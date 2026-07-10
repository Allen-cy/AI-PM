import { getAuthSupabase, getCurrentUser } from "@/features/auth/server";
import { resolveBusinessContext, type BusinessRole, type BusinessContext, type SubjectScope } from "@/features/operating-model/context";
import { listBusinessRoleAssignments, loadContextProjectIdentityMappings, type ManagementSignalRecord } from "@/features/operating-model/persistence";
import { buildCapacityPlan, buildPmoControlCenter, validateProjectLevelRuleMatrix, type ProjectLevelRule } from "@/features/operating-model/pmo-control";
import { writeOperationAudit } from "@/features/security/repository";

export const runtime = "nodejs";

type DataClass = ManagementSignalRecord["dataClass"];
type ScopedRequest = {
  user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;
  context: BusinessContext;
  dataClass: DataClass;
  scopeProjectIds: string[];
  scopePortfolioIds: string[] | null;
};

const DATA_CLASSES: DataClass[] = ["production", "sample", "test", "diagnostic", "unclassified"];
const PMO_ONLY_OPERATIONS = new Set([
  "create_cadence", "transition_cadence", "create_dependency", "scan_data_quality",
  "save_capacity_plan", "save_rule_matrix", "save_metric_definition",
]);

function json(body: unknown, status = 200, requestId = crypto.randomUUID()) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store", "X-Request-Id": requestId } });
}

function emptyRows() {
  return Promise.resolve({ data: [] as Array<Record<string, unknown>>, error: null });
}

function text(value: unknown) {
  return String(value ?? "").trim();
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

async function requestContext(request: Request): Promise<ScopedRequest | { error: string; detail?: string; status: number }> {
  const user = await getCurrentUser();
  if (!user) return { error: "UNAUTHORIZED", status: 401 };
  const url = new URL(request.url);
  const role = text(url.searchParams.get("role")) as BusinessRole;
  const orgId = text(url.searchParams.get("org_id"));
  const subjectScope = text(url.searchParams.get("subject_scope")) as SubjectScope;
  const subjectId = text(url.searchParams.get("subject_id"));
  const dataClass = (text(url.searchParams.get("data_class")) || "production") as DataClass;
  if (!role || !orgId || !subjectScope || !subjectId || !DATA_CLASSES.includes(dataClass)) {
    return { error: "BUSINESS_CONTEXT_AND_DATA_CLASS_REQUIRED", status: 400 };
  }
  const assignments = await listBusinessRoleAssignments(user.id);
  if (assignments.status !== "succeeded") return { error: "P17_STORAGE_NOT_CONFIGURED", detail: assignments.warning, status: 503 };
  const context = resolveBusinessContext({
    user: { id: user.id, systemRole: user.role },
    assignments: assignments.data ?? [],
    requestedRole: role,
    requestedOrgId: orgId,
    requestedSubjectScope: subjectScope,
    requestedSubjectId: subjectId,
  });
  if (!context) return { error: "BUSINESS_CONTEXT_FORBIDDEN", status: 403 };
  const mappings = await loadContextProjectIdentityMappings({ context, dataClass });
  if (mappings.status !== "succeeded") return { error: "PROJECT_SCOPE_MAPPING_FAILED", detail: mappings.warning, status: mappings.status === "not_configured" ? 503 : 500 };
  const scopeProjectIds = [...new Set((mappings.data ?? []).map(item => item.projectId))];
  let scopePortfolioIds: string[] | null = null;
  if (context.subjectScope === "portfolio") scopePortfolioIds = [context.subjectId];
  else if (context.subjectScope !== "organization") {
    if (scopeProjectIds.length === 0) scopePortfolioIds = [];
    else {
      const links = await getAuthSupabase().from("portfolio_project_links").select("portfolio_id").eq("org_id", context.orgId).in("project_id", scopeProjectIds);
      if (links.error) return { error: "PORTFOLIO_SCOPE_MAPPING_FAILED", detail: links.error.message, status: 503 };
      scopePortfolioIds = [...new Set((links.data ?? []).map(row => String(row.portfolio_id)))];
    }
  }
  return { user, context, dataClass, scopeProjectIds, scopePortfolioIds };
}

function scopedPortfolioQuery<T>(query: T, scope: ScopedRequest): T {
  const builder = query as T & { is: (column: string, value: null) => T; or: (filter: string) => T };
  if (scope.scopePortfolioIds === null) return query;
  if (scope.scopePortfolioIds.length === 0) return builder.is("portfolio_id", null);
  return builder.or(`portfolio_id.is.null,portfolio_id.in.(${scope.scopePortfolioIds.join(",")})`);
}

async function loadCenter(scope: ScopedRequest) {
  const supabase = getAuthSupabase();
  const ids = scope.scopeProjectIds;
  const ownerOnly = scope.context.businessRole !== "pmo";
  const nowIso = new Date().toISOString();

  let capacitySnapshotIds: string[] | null = null;
  let cadenceIds: string[] | null = null;
  if (scope.context.subjectScope !== "portfolio" && scope.context.subjectScope !== "organization") {
    if (ids.length === 0) {
      capacitySnapshotIds = [];
      cadenceIds = [];
    } else {
      let actionLinksQuery = supabase.from("governance_cadence_actions").select("cadence_id").eq("org_id", scope.context.orgId).eq("data_class", scope.dataClass).in("project_id", ids);
      if (ownerOnly) actionLinksQuery = actionLinksQuery.eq("owner_user_id", scope.user.id);
      const [allocations, actionLinks] = await Promise.all([
        supabase.from("resource_capacity_allocations").select("capacity_snapshot_id").eq("org_id", scope.context.orgId).eq("data_class", scope.dataClass).in("project_id", ids),
        actionLinksQuery,
      ]);
      if (allocations.error || actionLinks.error) throw new Error(allocations.error?.message || actionLinks.error?.message);
      capacitySnapshotIds = [...new Set((allocations.data ?? []).map(row => String(row.capacity_snapshot_id)))];
      cadenceIds = [...new Set((actionLinks.data ?? []).map(row => String(row.cadence_id)))];
    }
  }

  const capacitiesQuery = capacitySnapshotIds !== null
    ? capacitySnapshotIds.length === 0 ? emptyRows() : supabase.from("resource_capacity_snapshots").select("id,owner_user_id,owner_name,role_name,capacity_hours,demand_hours,period_start,period_end,allocation_detail").eq("org_id", scope.context.orgId).eq("data_class", scope.dataClass).in("id", capacitySnapshotIds).order("period_start", { ascending: false }).limit(300)
    : (() => {
      let query = supabase.from("resource_capacity_snapshots").select("id,owner_user_id,owner_name,role_name,capacity_hours,demand_hours,period_start,period_end,allocation_detail").eq("org_id", scope.context.orgId).eq("data_class", scope.dataClass);
      if (scope.context.subjectScope === "portfolio") query = query.eq("portfolio_id", scope.context.subjectId);
      return query.order("period_start", { ascending: false }).limit(300);
    })();

  const cadencesQuery = cadenceIds !== null
    ? cadenceIds.length === 0 ? emptyRows() : supabase.from("operating_cadences").select("id,cadence_type,status,period_start,period_end,conclusions,due_at,owner_user_id,frozen_at,effect_review").eq("org_id", scope.context.orgId).eq("data_class", scope.dataClass).in("id", cadenceIds).order("period_start", { ascending: false }).limit(100)
    : (() => {
      let query = supabase.from("operating_cadences").select("id,cadence_type,status,period_start,period_end,conclusions,due_at,owner_user_id,frozen_at,effect_review").eq("org_id", scope.context.orgId).eq("data_class", scope.dataClass);
      if (scope.context.subjectScope === "portfolio") query = query.eq("portfolio_id", scope.context.subjectId);
      return query.order("period_start", { ascending: false }).limit(100);
    })();

  let rulesQuery = supabase.from("project_level_rule_matrices").select("id,portfolio_id,version,status,rules,change_reason,effective_from").eq("org_id", scope.context.orgId).eq("data_class", scope.dataClass);
  rulesQuery = scopedPortfolioQuery(rulesQuery, scope);

  const signalsQuery = ids.length === 0 ? emptyRows() : (() => {
    let query = supabase.from("management_signals").select("id,project_id,title,severity,status,due_at,owner_user_id,route,rule_version").in("project_id", ids).eq("org_id", scope.context.orgId).eq("data_class", scope.dataClass);
    if (ownerOnly) query = query.eq("owner_user_id", scope.user.id);
    return query;
  })();
  const dependenciesQuery = ids.length === 0 ? emptyRows() : (() => {
    let query = supabase.from("project_dependencies").select("id,from_project_id,to_project_id,dependency_type,description,status,owner_user_id,due_date,resolution_criteria,evidence,review_comment").in("from_project_id", ids).in("to_project_id", ids).eq("org_id", scope.context.orgId).eq("data_class", scope.dataClass);
    if (ownerOnly) query = query.eq("owner_user_id", scope.user.id);
    return query;
  })();
  const qualityQuery = ids.length === 0 ? emptyRows() : (() => {
    let query = supabase.from("data_quality_issues").select("id,project_id,field_name,description,severity,status,owner_user_id,due_at,closure_evidence,correction_summary,review_comment").in("project_id", ids).eq("org_id", scope.context.orgId).eq("data_class", scope.dataClass);
    if (ownerOnly) query = query.eq("owner_user_id", scope.user.id);
    return query;
  })();
  const metricsQuery = ownerOnly ? emptyRows() : supabase.from("metric_definitions").select("id,metric_key,version,name,definition,freshness_sla_minutes,status,org_id").eq("status", "active").or(`org_id.eq.${scope.context.orgId},org_id.is.null`).order("created_at", { ascending: false }).limit(200);
  let roleOwnersQuery = supabase.from("user_business_roles").select("user_id,business_role").eq("org_id", scope.context.orgId).eq("status", "active").lte("valid_from", nowIso).or(`valid_until.is.null,valid_until.gte.${nowIso}`);
  if (ownerOnly) roleOwnersQuery = roleOwnersQuery.eq("user_id", scope.user.id);

  const [projects, signals, dependencies, capacities, quality, cadences, ruleMatrices, metrics, roleOwners, stageGateInstances] = await Promise.all([
    ids.length === 0 ? emptyRows() : supabase.from("projects").select("id,name,project_level,progress,status").in("id", ids).eq("org_id", scope.context.orgId).eq("data_class", scope.dataClass),
    signalsQuery,
    dependenciesQuery,
    capacitiesQuery,
    qualityQuery,
    cadencesQuery,
    ownerOnly ? emptyRows() : rulesQuery.order("created_at", { ascending: false }).limit(20),
    metricsQuery,
    roleOwnersQuery,
    ownerOnly || ids.length === 0 ? emptyRows() : supabase.from("governance_process_instances").select("id,canonical_project_id,input_summary,output_summary,state").eq("workflow_id", "stage-gate-review").eq("state", "已通过").in("canonical_project_id", ids).limit(500),
  ]);
  const firstError = [projects, signals, dependencies, capacities, quality, cadences, ruleMatrices, metrics, roleOwners, stageGateInstances].find(result => result.error)?.error;
  if (firstError) throw new Error(firstError.message);

  const scopedCadenceIds = (cadences.data ?? []).map(row => String(row.id));
  const scopedCapacityIds = (capacities.data ?? []).map(row => String(row.id));
  const stageGateIds = (stageGateInstances.data ?? []).map(row => String(row.id));
  const [governanceActions, capacityActions, stageGateActions, stageGateEvents] = await Promise.all([
    scopedCadenceIds.length === 0 ? emptyRows() : (() => {
      let query = supabase.from("governance_cadence_actions").select("id,cadence_id,project_id,title,description,owner_user_id,due_at,status,completion_evidence,effect_review,review_comment").eq("org_id", scope.context.orgId).eq("data_class", scope.dataClass).in("cadence_id", scopedCadenceIds);
      if (scope.context.subjectScope !== "portfolio" && scope.context.subjectScope !== "organization") query = query.in("project_id", ids);
      if (ownerOnly) query = query.eq("owner_user_id", scope.user.id);
      return query.order("due_at", { ascending: true }).limit(300);
    })(),
    scopedCapacityIds.length === 0 ? emptyRows() : (() => {
      let query = supabase.from("capacity_conflict_actions").select("id,capacity_snapshot_id,owner_user_id,overload_hours,action_title,action_plan,due_at,status,resolution_evidence,review_comment").eq("org_id", scope.context.orgId).eq("data_class", scope.dataClass).in("capacity_snapshot_id", scopedCapacityIds);
      if (ownerOnly) query = query.eq("owner_user_id", scope.user.id);
      return query.order("due_at", { ascending: true }).limit(300);
    })(),
    stageGateIds.length === 0 ? emptyRows() : supabase.from("governance_process_actions").select("instance_id,status,close_evidence").in("instance_id", stageGateIds).limit(1000),
    stageGateIds.length === 0 ? emptyRows() : supabase.from("governance_process_events").select("instance_id,to_state,decision,outputs,comment").in("instance_id", stageGateIds).eq("to_state", "已通过").limit(1000),
  ]);
  if (governanceActions.error || capacityActions.error || stageGateActions.error || stageGateEvents.error) throw new Error(governanceActions.error?.message || capacityActions.error?.message || stageGateActions.error?.message || stageGateEvents.error?.message);

  const ownerIds = [...new Set((roleOwners.data ?? []).map(row => String(row.user_id)))];
  const owners = ownerIds.length === 0 ? { data: [] as Array<Record<string, unknown>>, error: null } : await supabase.from("app_users").select("id,name").in("id", ownerIds).eq("status", "active");
  if (owners.error) throw new Error(owners.error.message);
  const roleMap = new Map<string, Set<string>>();
  for (const row of roleOwners.data ?? []) {
    const userId = String(row.user_id);
    const roles = roleMap.get(userId) ?? new Set<string>();
    roles.add(String(row.business_role));
    roleMap.set(userId, roles);
  }
  const capacityNameMap = new Map((capacities.data ?? []).map(row => [String(row.id), String(row.owner_name || "")]));
  const completeStageGates = (stageGateInstances.data ?? []).filter(instance => {
    const actions = (stageGateActions.data ?? []).filter(action => action.instance_id === instance.id);
    const approval = (stageGateEvents.data ?? []).some(event => event.instance_id === instance.id && event.to_state === "已通过" && (String(event.decision || "").trim() || String(event.comment || "").trim() || (event.outputs && typeof event.outputs === "object" && Object.keys(event.outputs as Record<string, unknown>).length > 0)));
    const actionsComplete = actions.every(action => action.status === "cancelled" || (action.status === "done" && String(action.close_evidence || "").trim().length > 0));
    return String(instance.input_summary || "").trim().length > 0 && String(instance.output_summary || "").trim().length > 0 && approval && actionsComplete;
  }).length;

  const center = buildPmoControlCenter({
    projects: (projects.data ?? []).map(row => ({ id: String(row.id), name: String(row.name), projectLevel: row.project_level ? String(row.project_level) : null, progress: Number(row.progress || 0), status: String(row.status) })),
    signals: (signals.data ?? []).map(row => ({ id: String(row.id), projectId: row.project_id ? String(row.project_id) : null, title: String(row.title), severity: String(row.severity), status: String(row.status), dueAt: row.due_at ? String(row.due_at) : null, ownerUserId: row.owner_user_id ? String(row.owner_user_id) : null, route: String(row.route || ""), ruleVersion: String(row.rule_version || "") })),
    dependencies: (dependencies.data ?? []).map(row => ({ id: String(row.id), fromProjectId: String(row.from_project_id), toProjectId: String(row.to_project_id), dependencyType: String(row.dependency_type), description: String(row.description || ""), status: String(row.status), ownerUserId: String(row.owner_user_id), dueDate: row.due_date ? String(row.due_date) : null, resolutionCriteria: String(row.resolution_criteria || ""), evidence: array(row.evidence), reviewComment: row.review_comment ? String(row.review_comment) : null })),
    capacities: (capacities.data ?? []).map(row => ({ id: String(row.id), ownerName: String(row.owner_name), ownerUserId: row.owner_user_id ? String(row.owner_user_id) : null, roleName: String(row.role_name || ""), capacityHours: Number(row.capacity_hours || 0), demandHours: Number(row.demand_hours || 0), periodStart: String(row.period_start), periodEnd: String(row.period_end), allocations: array(row.allocation_detail) as Array<{ projectId: string; hours: number }> })),
    dataQualityIssues: (quality.data ?? []).map(row => ({ id: String(row.id), projectId: row.project_id ? String(row.project_id) : null, fieldName: row.field_name ? String(row.field_name) : null, description: String(row.description || ""), severity: String(row.severity), status: String(row.status), ownerUserId: row.owner_user_id ? String(row.owner_user_id) : null, dueAt: row.due_at ? String(row.due_at) : null, closureEvidence: array(row.closure_evidence), correctionSummary: String(row.correction_summary || ""), reviewComment: String(row.review_comment || "") })),
    cadences: (cadences.data ?? []).map(row => ({ id: String(row.id), cadenceType: String(row.cadence_type), status: String(row.status), periodStart: String(row.period_start), periodEnd: String(row.period_end), conclusions: array(row.conclusions), actionCount: (governanceActions.data ?? []).filter(action => action.cadence_id === row.id).length, openActionCount: (governanceActions.data ?? []).filter(action => action.cadence_id === row.id && !["closed", "cancelled"].includes(String(action.status))).length })),
    governanceActions: (governanceActions.data ?? []).map(row => ({ id: String(row.id), cadenceId: String(row.cadence_id), projectId: row.project_id ? String(row.project_id) : null, title: String(row.title), ownerUserId: String(row.owner_user_id), dueAt: String(row.due_at), status: String(row.status), completionEvidence: array(row.completion_evidence), effectReview: (row.effect_review && typeof row.effect_review === "object" ? row.effect_review : {}) as Record<string, unknown> })),
    capacityConflictActions: (capacityActions.data ?? []).map(row => ({ id: String(row.id), capacitySnapshotId: String(row.capacity_snapshot_id), ownerUserId: String(row.owner_user_id), ownerName: capacityNameMap.get(String(row.capacity_snapshot_id)) || "", actionTitle: String(row.action_title), overloadHours: Number(row.overload_hours || 0), dueAt: String(row.due_at), status: String(row.status), resolutionEvidence: array(row.resolution_evidence) })),
    ruleMatrices: (ruleMatrices.data ?? []).map(row => ({ id: String(row.id), version: String(row.version), status: String(row.status), rules: (row.rules && typeof row.rules === "object" ? row.rules : {}) as Record<string, unknown>, changeReason: String(row.change_reason || ""), effectiveFrom: row.effective_from ? String(row.effective_from) : null })),
    metricDefinitions: (metrics.data ?? []).map(row => ({ id: String(row.id), metricKey: String(row.metric_key), version: String(row.version), name: String(row.name), definition: String(row.definition), freshnessSlaMinutes: row.freshness_sla_minutes === null ? null : Number(row.freshness_sla_minutes), status: String(row.status) })),
    stageGateEvidence: { total: (stageGateInstances.data ?? []).length, complete: completeStageGates },
  });
  const result = {
    ...center,
    eligibleOwners: (owners.data ?? []).map(row => ({ id: String(row.id), name: String(row.name || "未命名用户"), roles: [...(roleMap.get(String(row.id)) ?? [])] })),
  };
  if (!ownerOnly) return result;
  const ownedCadenceIds = new Set(result.governanceActions.map(item => item.cadenceId));
  const ownedCapacityIds = new Set(result.capacityConflictActions.map(item => item.capacitySnapshotId));
  return {
    ...result,
    cadences: result.cadences.filter(item => ownedCadenceIds.has(item.id)),
    capacityConflicts: result.capacityConflicts.filter(item => ownedCapacityIds.has(item.id)),
    ruleMatrices: [],
    metricDefinitions: [],
    projectsWithoutLevel: [],
  };
}

async function ensureCadenceScope(scope: ScopedRequest, id: string) {
  let query = getAuthSupabase().from("operating_cadences").select("id,portfolio_id").eq("id", id).eq("org_id", scope.context.orgId).eq("data_class", scope.dataClass);
  if (scope.context.subjectScope === "portfolio") query = query.eq("portfolio_id", scope.context.subjectId);
  else if (scope.context.subjectScope !== "organization") return false;
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

async function ensureDependencyScope(scope: ScopedRequest, id: string) {
  const { data, error } = await getAuthSupabase().from("project_dependencies").select("id,from_project_id,to_project_id").eq("id", id).eq("org_id", scope.context.orgId).eq("data_class", scope.dataClass).maybeSingle();
  if (error) throw error;
  return Boolean(data && scope.scopeProjectIds.includes(String(data.from_project_id)) && scope.scopeProjectIds.includes(String(data.to_project_id)));
}

async function ensureQualityScope(scope: ScopedRequest, id: string) {
  const { data, error } = await getAuthSupabase().from("data_quality_issues").select("id,project_id,owner_user_id").eq("id", id).eq("org_id", scope.context.orgId).eq("data_class", scope.dataClass).maybeSingle();
  if (error) throw error;
  return data && scope.scopeProjectIds.includes(String(data.project_id)) ? data : null;
}

async function ensureGovernanceActionScope(scope: ScopedRequest, id: string) {
  const { data, error } = await getAuthSupabase().from("governance_cadence_actions").select("id,cadence_id,project_id,owner_user_id").eq("id", id).eq("org_id", scope.context.orgId).eq("data_class", scope.dataClass).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  if (data.project_id && scope.scopeProjectIds.includes(String(data.project_id))) return data;
  return scope.context.businessRole === "pmo" && await ensureCadenceScope(scope, String(data.cadence_id)) ? data : null;
}

async function ensureCapacityActionScope(scope: ScopedRequest, id: string) {
  const { data, error } = await getAuthSupabase().from("capacity_conflict_actions").select("id,capacity_snapshot_id,owner_user_id").eq("id", id).eq("org_id", scope.context.orgId).eq("data_class", scope.dataClass).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  let snapshot = getAuthSupabase().from("resource_capacity_snapshots").select("id,portfolio_id").eq("id", data.capacity_snapshot_id).eq("org_id", scope.context.orgId).eq("data_class", scope.dataClass);
  if (scope.context.subjectScope === "portfolio") snapshot = snapshot.eq("portfolio_id", scope.context.subjectId);
  if (scope.context.subjectScope === "organization" || scope.context.subjectScope === "portfolio") {
    const found = await snapshot.maybeSingle();
    if (found.error) throw found.error;
    return found.data ? data : null;
  }
  if (scope.scopeProjectIds.length === 0) return null;
  const allocation = await getAuthSupabase().from("resource_capacity_allocations").select("id").eq("capacity_snapshot_id", data.capacity_snapshot_id).eq("org_id", scope.context.orgId).eq("data_class", scope.dataClass).in("project_id", scope.scopeProjectIds).limit(1).maybeSingle();
  if (allocation.error) throw allocation.error;
  return allocation.data ? data : null;
}

function operationStatus(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");
  if (/OUTSIDE_SCOPE|FORBIDDEN|OWNER_REQUIRED|PMO_REVIEW_REQUIRED/.test(message)) return 403;
  if (/INVALID_.*TRANSITION|IDEMPOTENCY_KEY_REUSED|COVERAGE_INCOMPLETE|NOT_READY|NOT_CLOSED/.test(message)) return 409;
  if (/REQUIRED|INVALID_|MUST_DIFFER/.test(message)) return 400;
  return 503;
}

export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  const scope = await requestContext(request);
  if ("error" in scope) return json({ error: scope.error, detail: scope.detail, request_id: requestId }, scope.status, requestId);
  try {
    const center = await loadCenter(scope);
    await writeOperationAudit({ user: scope.user, action: "pmo_control_center_read", resourceType: "pmo_control_center", status: "succeeded", summary: `PMO控制中心：${center.summary.activeProjects}个项目，${center.summary.redSignals}个红色信号`, detail: { context: scope.context, dataClass: scope.dataClass }, requestId });
    return json({ status: "succeeded", actor_user_id: scope.user.id, context: scope.context, data_class: scope.dataClass, source: { type: "supabase", fallback_used: false }, center, request_id: requestId }, 200, requestId);
  } catch (error) {
    return json({ error: "PMO_CONTROL_DATA_UNAVAILABLE", detail: error instanceof Error ? error.message : "unknown", request_id: requestId }, 503, requestId);
  }
}

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  const scope = await requestContext(request);
  if ("error" in scope) return json({ error: scope.error, detail: scope.detail, request_id: requestId }, scope.status, requestId);
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; } catch { return json({ error: "INVALID_JSON", request_id: requestId }, 400, requestId); }
  const operation = text(body.operation);
  if (PMO_ONLY_OPERATIONS.has(operation) && scope.context.businessRole !== "pmo") return json({ error: "PMO_CONTEXT_REQUIRED", request_id: requestId }, 403, requestId);
  const idempotencyKey = text(request.headers.get("Idempotency-Key"));
  if (!idempotencyKey) return json({ error: "IDEMPOTENCY_KEY_REQUIRED", request_id: requestId }, 400, requestId);
  const supabase = getAuthSupabase();
  try {
    let rpcName = "";
    let args: Record<string, unknown> = {};
    let status = 200;

    if (operation === "create_cadence") {
      if (!["portfolio", "organization"].includes(scope.context.subjectScope)) return json({ error: "PORTFOLIO_OR_ORGANIZATION_CONTEXT_REQUIRED", request_id: requestId }, 403, requestId);
      const periodStart = text(body.period_start); const periodEnd = text(body.period_end); const cadenceType = text(body.cadence_type);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(periodStart) || !/^\d{4}-\d{2}-\d{2}$/.test(periodEnd) || !cadenceType) return json({ error: "CADENCE_TYPE_AND_PERIOD_REQUIRED", request_id: requestId }, 400, requestId);
      rpcName = "create_operating_cadence_tx";
      args = { p_org_id: scope.context.orgId, p_portfolio_id: scope.context.subjectScope === "portfolio" ? scope.context.subjectId : null, p_data_class: scope.dataClass, p_actor_id: scope.user.id, p_cadence_type: cadenceType, p_period_start: periodStart, p_period_end: periodEnd, p_input_snapshot: await loadCenter(scope), p_idempotency_key: idempotencyKey };
      status = 201;
    } else if (operation === "transition_cadence") {
      const id = text(body.id);
      if (!id || !await ensureCadenceScope(scope, id)) return json({ error: "CADENCE_OUTSIDE_CONTEXT", request_id: requestId }, 403, requestId);
      rpcName = "transition_operating_cadence_tx";
      args = { p_cadence_id: id, p_org_id: scope.context.orgId, p_data_class: scope.dataClass, p_actor_id: scope.user.id, p_to_status: text(body.to_status), p_conclusions: array(body.conclusions), p_actions: array(body.actions), p_effect_review: body.effect_review && typeof body.effect_review === "object" ? body.effect_review : {}, p_comment: text(body.comment), p_idempotency_key: idempotencyKey };
    } else if (operation === "create_dependency") {
      const fromProjectId = text(body.from_project_id); const toProjectId = text(body.to_project_id);
      if (!scope.scopeProjectIds.includes(fromProjectId) || !scope.scopeProjectIds.includes(toProjectId)) return json({ error: "PROJECT_OUTSIDE_CONTEXT", request_id: requestId }, 403, requestId);
      rpcName = "create_project_dependency_tx";
      args = { p_org_id: scope.context.orgId, p_data_class: scope.dataClass, p_actor_id: scope.user.id, p_from_project_id: fromProjectId, p_to_project_id: toProjectId, p_dependency_type: text(body.dependency_type), p_description: text(body.description), p_owner_user_id: text(body.owner_user_id), p_due_date: text(body.due_date), p_resolution_criteria: text(body.resolution_criteria), p_idempotency_key: idempotencyKey };
      status = 201;
    } else if (operation === "transition_dependency") {
      const id = text(body.id);
      if (!id || !await ensureDependencyScope(scope, id)) return json({ error: "DEPENDENCY_OUTSIDE_CONTEXT", request_id: requestId }, 403, requestId);
      rpcName = "transition_project_dependency_tx";
      args = { p_dependency_id: id, p_org_id: scope.context.orgId, p_data_class: scope.dataClass, p_actor_id: scope.user.id, p_actor_role: scope.context.businessRole, p_to_status: text(body.to_status), p_evidence: array(body.evidence), p_comment: text(body.comment), p_idempotency_key: idempotencyKey };
    } else if (operation === "scan_data_quality") {
      const [projects, pmRoles, due] = await Promise.all([
        scope.scopeProjectIds.length === 0 ? emptyRows() : supabase.from("projects").select("id,name,sales_owner,deadline,project_level,source_record_id").in("id", scope.scopeProjectIds).eq("org_id", scope.context.orgId).eq("data_class", scope.dataClass),
        scope.scopeProjectIds.length === 0 ? emptyRows() : supabase.from("user_business_roles").select("user_id,subject_id").eq("org_id", scope.context.orgId).eq("business_role", "pm").eq("subject_scope", "project").eq("status", "active").lte("valid_from", new Date().toISOString()).or(`valid_until.is.null,valid_until.gte.${new Date().toISOString()}`).in("subject_id", scope.scopeProjectIds),
        supabase.rpc("add_org_workdays", { p_org_id: scope.context.orgId, p_start: new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Shanghai" }), p_days: 3 }),
      ]);
      if (projects.error || pmRoles.error || due.error) throw projects.error || pmRoles.error || due.error;
      const ownerByProject = new Map((pmRoles.data ?? []).map(row => [String(row.subject_id), String(row.user_id)]));
      const issues = (projects.data ?? []).flatMap(project => {
        const checks = [
          !project.sales_owner ? { rule: "project_owner_required", field: "项目经理/负责人", severity: "high", description: `${project.name}缺少明确项目负责人。` } : null,
          !project.deadline ? { rule: "project_deadline_required", field: "项目期限", severity: "high", description: `${project.name}缺少项目期限。` } : null,
          !project.project_level ? { rule: "project_level_required", field: "项目等级", severity: "medium", description: `${project.name}尚未完成S/A/B/C分级。` } : null,
          !project.source_record_id ? { rule: "stable_source_required", field: "飞书来源记录", severity: "critical", description: `${project.name}缺少稳定飞书来源映射。` } : null,
        ].filter((item): item is NonNullable<typeof item> => Boolean(item));
        return checks.map(check => ({ project_id: String(project.id), rule_key: check.rule, field_name: check.field, severity: check.severity, description: check.description, owner_user_id: ownerByProject.get(String(project.id)) || scope.user.id, due_at: `${due.data}T18:00:00+08:00`, dedup_key: `${project.id}:${check.rule}:${scope.dataClass}` }));
      });
      rpcName = "save_data_quality_scan_tx";
      args = { p_org_id: scope.context.orgId, p_data_class: scope.dataClass, p_actor_id: scope.user.id, p_issues: issues, p_idempotency_key: idempotencyKey };
      status = 201;
    } else if (operation === "transition_data_quality") {
      const id = text(body.id); const issue = id ? await ensureQualityScope(scope, id) : null;
      if (!issue) return json({ error: "DATA_QUALITY_ISSUE_OUTSIDE_CONTEXT", request_id: requestId }, 403, requestId);
      rpcName = "transition_data_quality_issue_tx";
      args = { p_issue_id: id, p_org_id: scope.context.orgId, p_data_class: scope.dataClass, p_actor_id: scope.user.id, p_actor_role: scope.context.businessRole, p_to_status: text(body.to_status), p_correction_summary: text(body.correction_summary), p_evidence: array(body.evidence), p_review_comment: text(body.comment), p_idempotency_key: idempotencyKey };
    } else if (operation === "transition_governance_action") {
      const id = text(body.id); const action = id ? await ensureGovernanceActionScope(scope, id) : null;
      if (!action) return json({ error: "GOVERNANCE_ACTION_OUTSIDE_CONTEXT", request_id: requestId }, 403, requestId);
      rpcName = "transition_governance_action_tx";
      args = { p_action_id: id, p_org_id: scope.context.orgId, p_data_class: scope.dataClass, p_actor_id: scope.user.id, p_actor_role: scope.context.businessRole, p_to_status: text(body.to_status), p_evidence: array(body.evidence), p_effect_review: body.effect_review && typeof body.effect_review === "object" ? body.effect_review : {}, p_comment: text(body.comment), p_idempotency_key: idempotencyKey };
    } else if (operation === "save_capacity_plan") {
      if (!["portfolio", "organization"].includes(scope.context.subjectScope)) return json({ error: "PORTFOLIO_OR_ORGANIZATION_CONTEXT_REQUIRED", request_id: requestId }, 403, requestId);
      const weeks = array(body.weeks).map(item => {
        const week = item && typeof item === "object" ? item as Record<string, unknown> : {};
        return { periodStart: text(week.period_start), periodEnd: text(week.period_end), capacityHours: Number(week.capacity_hours), allocations: array(week.allocations).map(entry => { const allocation = entry && typeof entry === "object" ? entry as Record<string, unknown> : {}; return { projectId: text(allocation.project_id), hours: Number(allocation.hours), note: text(allocation.note) }; }) };
      });
      const plan = buildCapacityPlan({ ownerName: text(body.owner_name), roleName: text(body.role_name), ownerUserId: text(body.owner_user_id) || null, weeks });
      if (plan.weeks.some(week => week.allocations.some(allocation => !scope.scopeProjectIds.includes(allocation.projectId)))) return json({ error: "ALLOCATION_PROJECT_OUTSIDE_CONTEXT", request_id: requestId }, 403, requestId);
      rpcName = "save_capacity_plan_tx";
      args = { p_org_id: scope.context.orgId, p_portfolio_id: scope.context.subjectScope === "portfolio" ? scope.context.subjectId : null, p_data_class: scope.dataClass, p_actor_id: scope.user.id, p_owner_user_id: plan.ownerUserId, p_owner_name: plan.ownerName, p_role_name: plan.roleName, p_plan: { weeks: plan.weeks.map(week => ({ period_start: week.periodStart, period_end: week.periodEnd, capacity_hours: week.capacityHours, allocations: week.allocations.map(allocation => ({ project_id: allocation.projectId, hours: allocation.hours, note: "note" in allocation ? allocation.note : "" })) })) }, p_idempotency_key: idempotencyKey };
      status = 201;
    } else if (operation === "transition_capacity_conflict") {
      const id = text(body.id); const action = id ? await ensureCapacityActionScope(scope, id) : null;
      if (!action) return json({ error: "CAPACITY_ACTION_OUTSIDE_CONTEXT", request_id: requestId }, 403, requestId);
      rpcName = "transition_capacity_conflict_action_tx";
      args = { p_action_id: id, p_org_id: scope.context.orgId, p_data_class: scope.dataClass, p_actor_id: scope.user.id, p_actor_role: scope.context.businessRole, p_to_status: text(body.to_status), p_action_plan: text(body.action_plan), p_evidence: array(body.evidence), p_comment: text(body.comment), p_idempotency_key: idempotencyKey };
    } else if (operation === "save_rule_matrix") {
      if (!["portfolio", "organization"].includes(scope.context.subjectScope)) return json({ error: "PORTFOLIO_OR_ORGANIZATION_CONTEXT_REQUIRED", request_id: requestId }, 403, requestId);
      const rules = body.rules && typeof body.rules === "object" && !Array.isArray(body.rules) ? body.rules as Partial<Record<"S" | "A" | "B" | "C", Partial<ProjectLevelRule>>> : {};
      const validation = validateProjectLevelRuleMatrix(rules);
      if (!validation.ok) return json({ error: "INVALID_RULE_MATRIX", detail: validation.errors, request_id: requestId }, 400, requestId);
      rpcName = "save_project_level_rule_matrix_tx";
      args = { p_org_id: scope.context.orgId, p_portfolio_id: scope.context.subjectScope === "portfolio" ? scope.context.subjectId : null, p_data_class: scope.dataClass, p_actor_id: scope.user.id, p_version: text(body.version), p_rules: rules, p_change_reason: text(body.change_reason), p_activate: body.activate === true, p_idempotency_key: idempotencyKey };
      status = 201;
    } else if (operation === "save_metric_definition") {
      if (!["portfolio", "organization"].includes(scope.context.subjectScope)) return json({ error: "PORTFOLIO_OR_ORGANIZATION_CONTEXT_REQUIRED", request_id: requestId }, 403, requestId);
      rpcName = "save_metric_definition_tx";
      args = { p_org_id: scope.context.orgId, p_data_class: scope.dataClass, p_actor_id: scope.user.id, p_metric_key: text(body.metric_key), p_version: text(body.version), p_name: text(body.name), p_definition: text(body.definition), p_numerator_definition: text(body.numerator_definition), p_denominator_definition: text(body.denominator_definition), p_source_definition: { source_type: text(body.source_type), field_or_formula: text(body.field_or_formula), unit: text(body.unit) }, p_freshness_sla_minutes: Number(body.freshness_sla_minutes), p_activate: body.activate === true, p_idempotency_key: idempotencyKey };
      status = 201;
    } else {
      return json({ error: "UNSUPPORTED_OPERATION", request_id: requestId }, 400, requestId);
    }

    const result = await supabase.rpc(rpcName, args);
    if (result.error) throw result.error;
    await writeOperationAudit({ user: scope.user, action: `pmo_${operation}`, resourceType: "pmo_control", resourceId: text((result.data as Record<string, unknown> | null)?.id || (result.data as Record<string, unknown> | null)?.plan_id), status: "succeeded", severity: "medium", summary: `PMO控制动作已保存：${operation}`, detail: { context: scope.context, dataClass: scope.dataClass, rpc: rpcName }, requestId });
    return json({ status: "succeeded", result: result.data, request_id: requestId }, status, requestId);
  } catch (error) {
    return json({ error: "PMO_CONTROL_WRITE_FAILED", detail: error instanceof Error ? error.message : "unknown", request_id: requestId }, operationStatus(error), requestId);
  }
}
