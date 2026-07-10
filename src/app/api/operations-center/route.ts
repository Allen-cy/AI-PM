import { getAuthSupabase, getCurrentUser } from "@/features/auth/server";
import { resolveBusinessContext, type BusinessRole, type SubjectScope } from "@/features/operating-model/context";
import {
  buildEnterpriseCapabilityGates,
  buildOperationalMetrics,
  buildRoleOnboardingGuide,
  type OperationsDataClass,
} from "@/features/operating-model/operations-center";
import { listBusinessRoleAssignments, loadContextProjectIdentityMappings } from "@/features/operating-model/persistence";
import { writeOperationAudit } from "@/features/security/repository";

export const runtime = "nodejs";

const DATA_CLASSES: OperationsDataClass[] = ["production", "sample", "test", "diagnostic", "unclassified"];
const OPERATOR_ROLES = new Set<BusinessRole>(["pmo", "ceo"]);
const CAPABILITY_KEYS = new Set(["sso", "attachment_storage", "electronic_signature", "retention_policy", "scheduled_archive", "online_policy_publish"]);
const CAPABILITY_STATUSES = new Set(["not_configured", "configured", "tested", "enabled", "blocked", "disabled"]);
const BUSINESS_ROLE_KEYS = new Set(["pm", "operations", "pmo", "ceo", "sponsor", "business_owner", "finance", "quality"]);
const INCIDENT_SEVERITIES = new Set(["low", "medium", "high", "critical"]);
const INCIDENT_SOURCES = new Set(["feishu", "supabase", "ai_model", "rag", "application", "security", "other"]);
const INCIDENT_TRANSITIONS: Record<string, string[]> = {
  detected: ["triaged"], triaged: ["mitigating"], mitigating: ["monitoring", "resolved"], monitoring: ["mitigating", "resolved"], resolved: ["closed", "mitigating"], closed: [],
};
const PILOT_TRANSITIONS: Record<string, string[]> = {
  planned: ["ready", "cancelled"], ready: ["running", "paused", "cancelled"], running: ["paused", "completed", "cancelled"], paused: ["running", "cancelled"], completed: [], cancelled: [],
};

function json(body: unknown, status = 200, requestId = crypto.randomUUID()) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store", "X-Request-Id": requestId } });
}

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function containsSecretKey(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(item => containsSecretKey(item));
  if (!value || typeof value !== "object") return false;
  return Object.entries(value as Record<string, unknown>).some(([key, nested]) => /secret|token|password|api.?key|credential/i.test(key) || containsSecretKey(nested));
}

function classified(value: unknown, dataClass: OperationsDataClass): boolean {
  const item = record(value);
  return text(item.data_class ?? item.dataClass) === dataClass;
}

async function contextFor(request: Request) {
  const user = await getCurrentUser();
  if (!user) return { error: "UNAUTHORIZED", status: 401 } as const;
  const url = new URL(request.url);
  const role = text(url.searchParams.get("role")) as BusinessRole;
  const orgId = text(url.searchParams.get("org_id"));
  const subjectScope = text(url.searchParams.get("subject_scope")) as SubjectScope;
  const subjectId = text(url.searchParams.get("subject_id"));
  const dataClass = text(url.searchParams.get("data_class") || "production") as OperationsDataClass;
  if (!role || !orgId || !subjectScope || !subjectId || !DATA_CLASSES.includes(dataClass)) return { error: "BUSINESS_CONTEXT_AND_DATA_CLASS_REQUIRED", status: 400 } as const;
  const assignments = await listBusinessRoleAssignments(user.id);
  if (assignments.status !== "succeeded") return { error: "P17_STORAGE_NOT_CONFIGURED", detail: assignments.warning, status: 503 } as const;
  const context = resolveBusinessContext({ user: { id: user.id, systemRole: user.role }, assignments: assignments.data ?? [], requestedRole: role, requestedOrgId: orgId, requestedSubjectScope: subjectScope, requestedSubjectId: subjectId });
  if (!context) return { error: "BUSINESS_CONTEXT_FORBIDDEN", status: 403 } as const;
  const mappings = await loadContextProjectIdentityMappings({ context, dataClass });
  if (mappings.status !== "succeeded") return { error: "PROJECT_SCOPE_MAPPING_FAILED", detail: mappings.warning, status: mappings.status === "not_configured" ? 503 : 500 } as const;
  return { user, context, role, dataClass, projectIds: [...new Set((mappings.data ?? []).map(item => item.projectId))] } as const;
}

type Scope = Exclude<Awaited<ReturnType<typeof contextFor>>, { error: string }>;
type QueryResult = { data: Array<Record<string, unknown>> | null; error: { message: string } | null };

function assertQueries(results: Array<{ source: string; result: QueryResult }>) {
  const failed = results.find(item => item.result.error);
  if (failed) throw new Error(`${failed.source}: ${failed.result.error?.message || "storage unavailable"}`);
}

function relevantSubject(scope: Scope, item: Record<string, unknown>): boolean {
  if (scope.context.subjectScope === "organization") return true;
  if (text(item.subject_scope) === scope.context.subjectScope && text(item.subject_id) === scope.context.subjectId) return true;
  const projectId = text(item.project_id);
  return Boolean(projectId && scope.projectIds.includes(projectId));
}

async function loadOperationsDataset(scope: Scope) {
  const supabase = getAuthSupabase();
  const now = new Date();
  const windowStart = new Date(now.getTime() - 30 * 86_400_000);

  const [roleRows, onboarding, feishu, ai, pilots, gates, snapshots, incidents, reviews, decisions, actions, runs, projects] = await Promise.all([
    supabase.from("user_business_roles").select("user_id,business_role,status,valid_from,valid_until,subject_scope,subject_id").eq("org_id", scope.context.orgId),
    supabase.from("role_onboarding_states").select("id,status,acknowledgements,checklist_snapshot,started_at,completed_at,updated_at").eq("assignment_id", scope.context.assignmentId).eq("data_class", scope.dataClass).maybeSingle(),
    supabase.from("user_feishu_connections").select("status,app_id,app_secret,app_secret_encrypted,app_secret_last4,base_token,base_token_encrypted,base_token_last4,table_mapping,updated_at").eq("user_id", scope.user.id).maybeSingle(),
    supabase.from("user_ai_settings").select("enabled,provider,model,api_key,api_key_encrypted,api_key_last4,updated_at").eq("user_id", scope.user.id).maybeSingle(),
    supabase.from("pilot_programs").select("id,project_id,name,owner_user_id,status,target_roles,participant_user_ids,success_criteria,golden_chain_results,training_evidence,runbook_references,release_evidence,rollback_plan,start_date,target_end_date,completed_at,updated_at").eq("org_id", scope.context.orgId).eq("data_class", scope.dataClass).order("created_at", { ascending: false }).limit(50),
    supabase.from("enterprise_capability_gates").select("id,capability_key,provider,status,config_summary,evidence,blocker,last_tested_at,enabled_at,updated_at").eq("org_id", scope.context.orgId),
    supabase.from("operational_metric_snapshots").select("id,subject_scope,subject_id,window_start,window_end,metrics,source_lineage,unavailable_metrics,captured_at,captured_by").eq("org_id", scope.context.orgId).eq("data_class", scope.dataClass).order("captured_at", { ascending: false }).limit(12),
    supabase.from("operational_incidents").select("id,incident_key,title,severity,source,status,impact,user_visible_message,owner_user_id,remediation,recovery_action,evidence,detected_at,resolved_at,closed_at,updated_at").eq("org_id", scope.context.orgId).eq("data_class", scope.dataClass).order("detected_at", { ascending: false }).limit(100),
    supabase.from("quarterly_value_reviews").select("id,pilot_program_id,period_start,period_end,status,metric_snapshot_id,value_evidence,conclusions,threshold_changes,function_retirement_decisions,submitted_at,reviewed_at,review_comment,updated_at").eq("org_id", scope.context.orgId).eq("data_class", scope.dataClass).order("period_end", { ascending: false }).limit(20),
    supabase.from("decision_briefs").select("id,subject_scope,subject_id,project_id,status,requested_decision_at,decided_at,created_at").eq("org_id", scope.context.orgId).eq("data_class", scope.dataClass).gte("created_at", windowStart.toISOString()),
    scope.projectIds.length > 0
      ? supabase.from("unified_action_items").select("id,project_id,status,created_at,closed_at").in("project_id", scope.projectIds).gte("created_at", windowStart.toISOString())
      : supabase.from("unified_action_items").select("id,project_id,status,created_at,closed_at").eq("org_id", scope.context.orgId).not("project_id", "is", null).limit(0),
    supabase.from("ai_assistant_runs").select("id,actor_user_id,business_role,subject_scope,subject_id,status,created_at").eq("org_id", scope.context.orgId).eq("data_class", scope.dataClass).gte("created_at", windowStart.toISOString()),
    scope.projectIds.length > 0
      ? supabase.from("projects").select("id,name,oa_no,status,updated_at").in("id", scope.projectIds).eq("org_id", scope.context.orgId).eq("data_class", scope.dataClass)
      : supabase.from("projects").select("id,name,oa_no,status,updated_at").eq("org_id", scope.context.orgId).eq("data_class", scope.dataClass).limit(0),
  ]);

  const baseResults: Array<{ source: string; result: QueryResult }> = [
    { source: "user_business_roles", result: roleRows as QueryResult }, { source: "role_onboarding_states", result: onboarding as unknown as QueryResult },
    { source: "user_feishu_connections", result: feishu as unknown as QueryResult }, { source: "user_ai_settings", result: ai as unknown as QueryResult },
    { source: "pilot_programs", result: pilots as QueryResult }, { source: "enterprise_capability_gates", result: gates as QueryResult },
    { source: "operational_metric_snapshots", result: snapshots as QueryResult }, { source: "operational_incidents", result: incidents as QueryResult },
    { source: "quarterly_value_reviews", result: reviews as QueryResult }, { source: "decision_briefs", result: decisions as QueryResult },
    { source: "unified_action_items", result: actions as QueryResult }, { source: "ai_assistant_runs", result: runs as QueryResult },
    { source: "projects", result: projects as QueryResult },
  ];
  assertQueries(baseResults);

  const effectiveRoleRows = (roleRows.data ?? []).filter(item => {
    if (item.status !== "active") return false;
    const start = new Date(String(item.valid_from)).getTime();
    const end = item.valid_until ? new Date(String(item.valid_until)).getTime() : null;
    return Number.isFinite(start) && start <= now.getTime() && (end === null || (Number.isFinite(end) && end >= now.getTime()));
  });
  const orgUserIds = [...new Set(effectiveRoleRows.map(item => String(item.user_id)))];
  const runIds = (runs.data ?? []).filter(item => relevantSubject(scope, item)).map(item => String(item.id));

  const [syncLogs, confirmations, audits, evaluations] = await Promise.all([
    supabase.from("integration_sync_logs").select("id,user_id,source,status,detail,created_at").in("user_id", orgUserIds).gte("created_at", windowStart.toISOString()),
    supabase.from("feishu_action_confirmations").select("id,requester_id,status,payload,preview,created_at").in("requester_id", orgUserIds).gte("created_at", windowStart.toISOString()),
    supabase.from("operation_audit_logs").select("id,actor_id,detail,created_at").in("actor_id", orgUserIds).gte("created_at", windowStart.toISOString()),
    runIds.length > 0
      ? supabase.from("ai_assistant_evaluations").select("id,run_id,verdict,created_at").in("run_id", runIds).gte("created_at", windowStart.toISOString())
      : supabase.from("ai_assistant_evaluations").select("id,run_id,verdict,created_at").limit(0),
  ]);
  assertQueries([
    { source: "integration_sync_logs", result: syncLogs as QueryResult },
    { source: "feishu_action_confirmations", result: confirmations as QueryResult },
    { source: "operation_audit_logs", result: audits as QueryResult },
    { source: "ai_assistant_evaluations", result: evaluations as QueryResult },
  ]);

  const classifiedSyncLogs = (syncLogs.data ?? []).filter(item => classified(item.detail, scope.dataClass));
  const classifiedConfirmations = (confirmations.data ?? []).filter(item => classified(item.payload, scope.dataClass) || classified(item.preview, scope.dataClass));
  const classifiedAudits = (audits.data ?? []).filter(item => classified(item.detail, scope.dataClass));
  const metrics = buildOperationalMetrics({
    now,
    syncLogs: classifiedSyncLogs.map(item => ({ status: String(item.status), source: String(item.source), createdAt: String(item.created_at) })),
    confirmations: classifiedConfirmations.map(item => ({ status: String(item.status), createdAt: String(item.created_at) })),
    decisions: (decisions.data ?? []).filter(item => relevantSubject(scope, item)).map(item => ({ status: String(item.status), requestedDecisionAt: String(item.requested_decision_at), decidedAt: item.decided_at ? String(item.decided_at) : null })),
    actions: (actions.data ?? []).map(item => ({ status: String(item.status), createdAt: String(item.created_at), closedAt: item.closed_at ? String(item.closed_at) : null })),
    aiEvaluations: (evaluations.data ?? []).map(item => ({ verdict: String(item.verdict) })),
    roleAssignments: effectiveRoleRows.map(item => ({ userId: String(item.user_id), businessRole: String(item.business_role) })),
    roleActivities: classifiedAudits.flatMap(item => {
      const detail = record(item.detail); const context = record(detail.context); const businessRole = text(context.businessRole ?? detail.businessRole ?? detail.business_role);
      return businessRole ? [{ userId: String(item.actor_id), businessRole, occurredAt: String(item.created_at) }] : [];
    }),
  });

  const feishuRow = feishu.data ? record(feishu.data) : {};
  const feishuMapping = record(feishuRow.table_mapping);
  const feishuSecretConfigured = Boolean(text(feishuRow.app_secret_encrypted) || text(feishuRow.app_secret));
  const feishuTokenConfigured = Boolean(text(feishuRow.base_token_encrypted) || text(feishuRow.base_token));
  const feishuConfigured = feishuRow.status !== "disabled" && Boolean(text(feishuRow.app_id) && feishuSecretConfigured && feishuTokenConfigured && text(feishuMapping.project));
  const aiRow = ai.data ? record(ai.data) : {};
  const globalAiConfigured = Boolean(process.env.MINIMAX_API_KEY || process.env.DEEPSEEK_API_KEY || process.env.GLM_API_KEY || process.env.ANTHROPIC_API_KEY);
  const personalAiConfigured = aiRow.enabled !== false && Boolean(text(aiRow.api_key_encrypted) || text(aiRow.api_key));
  const aiConfigured = personalAiConfigured || globalAiConfigured;
  const onboardingRow = onboarding.data ? record(onboarding.data) : {};
  const guide = buildRoleOnboardingGuide({ businessRole: scope.role, dataClass: scope.dataClass, roleAssignmentActive: true, feishuConfigured, aiConfigured, projectMappingCount: scope.projectIds.length, acknowledgements: record(onboardingRow.acknowledgements) });
  const filteredPilots = (pilots.data ?? []).filter(item => scope.context.subjectScope === "organization" || scope.projectIds.includes(String(item.project_id)));
  const filteredSnapshots = (snapshots.data ?? []).filter(item => relevantSubject(scope, item));
  const filteredReviews = (reviews.data ?? []).filter(item => {
    const pilotId = text(item.pilot_program_id);
    return !pilotId || filteredPilots.some(pilot => String(pilot.id) === pilotId);
  });
  const sourceLineage = {
    window_start: windowStart.toISOString(), window_end: now.toISOString(), data_class: scope.dataClass,
    integration_sync_logs: { queried: (syncLogs.data ?? []).length, classified: classifiedSyncLogs.length },
    feishu_action_confirmations: { queried: (confirmations.data ?? []).length, classified: classifiedConfirmations.length },
    decision_briefs: (decisions.data ?? []).length, unified_action_items: (actions.data ?? []).length,
    ai_assistant_runs: runIds.length, ai_assistant_evaluations: (evaluations.data ?? []).length,
    role_assignments: effectiveRoleRows.length, classified_operation_audits: classifiedAudits.length,
  };

  return {
    guide,
    onboarding_state: onboarding.data ?? null,
    configuration: { feishu: { configured: feishuConfigured, source: feishuConfigured ? "personal" : "missing" }, ai: { configured: aiConfigured, source: personalAiConfigured ? "personal" : globalAiConfigured ? "global" : "missing" }, project_mapping_count: scope.projectIds.length, data_class: scope.dataClass },
    metrics,
    source_lineage: sourceLineage,
    pilots: filteredPilots,
    incidents: incidents.data ?? [],
    enterprise_capabilities: buildEnterpriseCapabilityGates((gates.data ?? []).map(item => ({ capabilityKey: String(item.capability_key), status: String(item.status), evidence: array(item.evidence), lastTestedAt: item.last_tested_at ? String(item.last_tested_at) : null }))).map(item => {
      const stored = (gates.data ?? []).find(row => row.capability_key === item.capabilityKey);
      return { ...item, provider: stored?.provider ? String(stored.provider) : null, blocker: stored?.blocker ? String(stored.blocker) : null, updatedAt: stored?.updated_at ? String(stored.updated_at) : null };
    }),
    metric_snapshots: filteredSnapshots,
    quarterly_value_reviews: filteredReviews,
    projects: projects.data ?? [],
  };
}

export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  const scope = await contextFor(request);
  if ("error" in scope) return json({ error: scope.error, detail: "detail" in scope ? scope.detail : undefined, request_id: requestId }, scope.status, requestId);
  try {
    const center = await loadOperationsDataset(scope);
    await writeOperationAudit({ user: scope.user, action: "operations_center_read", resourceType: "operations_center", status: "succeeded", summary: `${scope.role}角色读取采用与可靠性运营中心`, detail: { context: scope.context, dataClass: scope.dataClass, unavailableMetrics: center.metrics.filter(item => item.availability === "unavailable").map(item => item.key) }, requestId });
    return json({ status: "succeeded", context: scope.context, data_class: scope.dataClass, source: { type: "supabase", fallback_used: false }, center, request_id: requestId }, 200, requestId);
  } catch (error) {
    return json({ error: "OPERATIONS_SOURCE_TABLE_UNAVAILABLE", detail: error instanceof Error ? error.message : "unknown", required_migrations: ["20260710071709_p25_encrypt_user_credentials.sql", "20260710110000_p25_operations_center.sql"], request_id: requestId }, 503, requestId);
  }
}

async function auditSuccess(scope: Scope, operation: string, resourceType: string, resourceId: string, requestId: string) {
  return writeOperationAudit({ user: scope.user, action: `operations_${operation}`, resourceType, resourceId, status: "succeeded", severity: "medium", summary: `P25运营动作已保存：${operation}`, detail: { context: scope.context, dataClass: scope.dataClass }, requestId });
}

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  const scope = await contextFor(request);
  if ("error" in scope) return json({ error: scope.error, detail: "detail" in scope ? scope.detail : undefined, request_id: requestId }, scope.status, requestId);
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; } catch { return json({ error: "INVALID_JSON", request_id: requestId }, 400, requestId); }
  const operation = text(body.operation);
  const supabase = getAuthSupabase();
  try {
    let resourceType = "operations_center"; let resourceId = ""; let responseStatus = 200;
    if (operation === "acknowledge_data_class") {
      if (body.confirm !== true || text(body.data_class) !== scope.dataClass) return json({ error: "EXPLICIT_DATA_CLASS_CONFIRMATION_REQUIRED", request_id: requestId }, 409, requestId);
      const current = await supabase.from("role_onboarding_states").select("acknowledgements").eq("assignment_id", scope.context.assignmentId).eq("data_class", scope.dataClass).maybeSingle();
      if (current.error) throw current.error;
      const acknowledgements = { ...record(current.data?.acknowledgements), data_class: scope.dataClass, data_class_confirmed_at: new Date().toISOString(), data_class_confirmed_by: scope.user.id };
      const saved = await supabase.from("role_onboarding_states").upsert({ user_id: scope.user.id, assignment_id: scope.context.assignmentId, org_id: scope.context.orgId, business_role: scope.role, subject_scope: scope.context.subjectScope, subject_id: scope.context.subjectId, data_class: scope.dataClass, status: "in_progress", acknowledgements, started_at: new Date().toISOString(), updated_by: scope.user.id, updated_at: new Date().toISOString() }, { onConflict: "assignment_id,data_class" }).select("id").single();
      if (saved.error) throw saved.error;
      const center = await loadOperationsDataset(scope);
      const finalized = await supabase.from("role_onboarding_states").update({ status: center.guide.status, checklist_snapshot: center.guide, completed_at: center.guide.status === "completed" ? new Date().toISOString() : null, updated_by: scope.user.id, updated_at: new Date().toISOString() }).eq("id", saved.data.id);
      if (finalized.error) throw finalized.error; resourceType = "role_onboarding_state"; resourceId = saved.data.id;
    } else if (operation === "capture_metrics") {
      if (!OPERATOR_ROLES.has(scope.role)) return json({ error: "PMO_OR_CEO_CONTEXT_REQUIRED", request_id: requestId }, 403, requestId);
      const center = await loadOperationsDataset(scope); const now = new Date(); const windowStart = new Date(now.getTime() - 30 * 86_400_000);
      const idempotencyKey = text(body.idempotency_key) || `metric:${scope.context.assignmentId}:${scope.dataClass}:${now.toISOString().slice(0, 16)}`;
      const saved = await supabase.from("operational_metric_snapshots").upsert({ org_id: scope.context.orgId, subject_scope: scope.context.subjectScope, subject_id: scope.context.subjectId, data_class: scope.dataClass, idempotency_key: idempotencyKey, window_start: windowStart.toISOString(), window_end: now.toISOString(), metrics: center.metrics, source_lineage: center.source_lineage, unavailable_metrics: center.metrics.filter(item => item.availability === "unavailable").map(item => ({ key: item.key, reason: item.reason })), captured_by: scope.user.id }, { onConflict: "org_id,idempotency_key" }).select("id").single();
      if (saved.error) throw saved.error; resourceType = "operational_metric_snapshot"; resourceId = saved.data.id; responseStatus = 201;
    } else if (operation === "create_pilot") {
      if (scope.role !== "pmo") return json({ error: "PMO_CONTEXT_REQUIRED", request_id: requestId }, 403, requestId);
      if (scope.dataClass !== "production") return json({ error: "PRODUCTION_PILOT_REQUIRED", request_id: requestId }, 409, requestId);
      const projectId = text(body.project_id); const name = text(body.name); const startDate = text(body.start_date); const endDate = text(body.target_end_date); const rollbackPlan = text(body.rollback_plan); const idempotencyKey = text(body.idempotency_key);
      const targetRoles = array(body.target_roles).map(item => text(item)).filter(Boolean); const successCriteria = array(body.success_criteria).map(item => text(item)).filter(Boolean);
      if (!scope.projectIds.includes(projectId)) return json({ error: "PROJECT_OUTSIDE_CONTEXT", request_id: requestId }, 403, requestId);
      if (!name || !/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate) || endDate < startDate || !rollbackPlan || !idempotencyKey || successCriteria.length === 0 || targetRoles.length === 0 || targetRoles.some(item => !BUSINESS_ROLE_KEYS.has(item))) return json({ error: "PILOT_INPUTS_REQUIRED", request_id: requestId }, 400, requestId);
      const saved = await supabase.from("pilot_programs").upsert({ org_id: scope.context.orgId, project_id: projectId, data_class: scope.dataClass, name, owner_user_id: text(body.owner_user_id) || scope.user.id, target_roles: targetRoles, participant_user_ids: array(body.participant_user_ids), success_criteria: successCriteria, rollback_plan: rollbackPlan, start_date: startDate, target_end_date: endDate, idempotency_key: idempotencyKey, created_by: scope.user.id, updated_at: new Date().toISOString() }, { onConflict: "org_id,idempotency_key" }).select("id").single();
      if (saved.error) throw saved.error; resourceType = "pilot_program"; resourceId = saved.data.id; responseStatus = 201;
    } else if (operation === "transition_pilot") {
      if (scope.role !== "pmo") return json({ error: "PMO_CONTEXT_REQUIRED", request_id: requestId }, 403, requestId);
      const id = text(body.id); const expectedStatus = text(body.expected_status); const nextStatus = text(body.next_status);
      if (!PILOT_TRANSITIONS[expectedStatus]?.includes(nextStatus)) return json({ error: "INVALID_PILOT_TRANSITION", request_id: requestId }, 409, requestId);
      const currentPilot = await supabase.from("pilot_programs").select("id,project_id,status,golden_chain_results,training_evidence,runbook_references,release_evidence").eq("id", id).eq("org_id", scope.context.orgId).eq("data_class", scope.dataClass).maybeSingle();
      if (currentPilot.error) throw currentPilot.error;
      if (!currentPilot.data || !scope.projectIds.includes(String(currentPilot.data.project_id))) return json({ error: "PILOT_OUTSIDE_CONTEXT_OR_NOT_FOUND", request_id: requestId }, 404, requestId);
      if (currentPilot.data.status !== expectedStatus) return json({ error: "PILOT_CONFLICT_OR_NOT_FOUND", request_id: requestId }, 409, requestId);
      const evidenceFields = {
        golden_chain_results: array(currentPilot.data.golden_chain_results),
        training_evidence: body.training_evidence === undefined ? array(currentPilot.data.training_evidence) : array(body.training_evidence),
        runbook_references: body.runbook_references === undefined ? array(currentPilot.data.runbook_references) : array(body.runbook_references),
        release_evidence: body.release_evidence === undefined ? array(currentPilot.data.release_evidence) : array(body.release_evidence),
      };
      if (["ready", "running", "completed"].includes(nextStatus) && (evidenceFields.training_evidence.length === 0 || evidenceFields.runbook_references.length === 0 || evidenceFields.release_evidence.length === 0)) return json({ error: "PILOT_EVIDENCE_GATE_NOT_MET", request_id: requestId }, 409, requestId);
      if (nextStatus === "completed") {
        const passed = await supabase.from("golden_chain_runs").select("id,chain_key,status,verified_at,verified_by,updated_at")
          .eq("org_id", scope.context.orgId).eq("project_id", currentPilot.data.project_id).eq("data_class", "production").eq("status", "passed")
          .order("verified_at", { ascending: false });
        if (passed.error) throw passed.error;
        const latest = new Map<string, Record<string, unknown>>();
        for (const run of passed.data ?? []) if (!latest.has(String(run.chain_key))) latest.set(String(run.chain_key), run as Record<string, unknown>);
        const missingChains = ["A", "B", "C", "D", "E"].filter(key => !latest.has(key));
        if (missingChains.length > 0) return json({ error: "PILOT_GOLDEN_CHAINS_NOT_PASSED", missing_chains: missingChains, request_id: requestId }, 409, requestId);
        evidenceFields.golden_chain_results = ["A", "B", "C", "D", "E"].map(chainKey => ({ chain_key: chainKey, run_id: latest.get(chainKey)?.id, verified_at: latest.get(chainKey)?.verified_at, verified_by: latest.get(chainKey)?.verified_by, status: "passed" }));
      }
      const saved = await supabase.from("pilot_programs").update({ status: nextStatus, ...evidenceFields, completed_at: nextStatus === "completed" ? new Date().toISOString() : null, updated_at: new Date().toISOString() }).eq("id", id).eq("org_id", scope.context.orgId).eq("data_class", scope.dataClass).eq("status", expectedStatus).select("id").maybeSingle();
      if (saved.error) throw saved.error; if (!saved.data) return json({ error: "PILOT_CONFLICT_OR_NOT_FOUND", request_id: requestId }, 409, requestId); resourceType = "pilot_program"; resourceId = id;
    } else if (operation === "report_incident") {
      const incidentKey = text(body.incident_key); const title = text(body.title); const impact = text(body.impact); const visible = text(body.user_visible_message); const recovery = text(body.recovery_action);
      const severity = text(body.severity) || "medium"; const source = text(body.source) || "application";
      if (!incidentKey || !title || !impact || !visible || !recovery || !INCIDENT_SEVERITIES.has(severity) || !INCIDENT_SOURCES.has(source)) return json({ error: "INCIDENT_INPUTS_REQUIRED", request_id: requestId }, 400, requestId);
      const saved = await supabase.from("operational_incidents").upsert({ org_id: scope.context.orgId, data_class: scope.dataClass, incident_key: incidentKey, title, severity, source, impact, user_visible_message: visible, owner_user_id: text(body.owner_user_id) || scope.user.id, recovery_action: recovery, evidence: array(body.evidence), created_by: scope.user.id, updated_at: new Date().toISOString() }, { onConflict: "org_id,incident_key" }).select("id").single();
      if (saved.error) throw saved.error; resourceType = "operational_incident"; resourceId = saved.data.id; responseStatus = 201;
    } else if (operation === "transition_incident") {
      if (!OPERATOR_ROLES.has(scope.role)) return json({ error: "PMO_OR_CEO_CONTEXT_REQUIRED", request_id: requestId }, 403, requestId);
      const id = text(body.id); const expectedStatus = text(body.expected_status); const nextStatus = text(body.next_status);
      if (!INCIDENT_TRANSITIONS[expectedStatus]?.includes(nextStatus)) return json({ error: "INVALID_INCIDENT_TRANSITION", request_id: requestId }, 409, requestId);
      const currentIncident = await supabase.from("operational_incidents").select("id,status,remediation,evidence,resolved_at").eq("id", id).eq("org_id", scope.context.orgId).eq("data_class", scope.dataClass).maybeSingle();
      if (currentIncident.error) throw currentIncident.error;
      if (!currentIncident.data || currentIncident.data.status !== expectedStatus) return json({ error: "INCIDENT_CONFLICT_OR_NOT_FOUND", request_id: requestId }, 409, requestId);
      const remediation = body.remediation === undefined ? text(currentIncident.data.remediation) : text(body.remediation); const evidence = body.evidence === undefined ? array(currentIncident.data.evidence) : array(body.evidence);
      if (["resolved", "closed"].includes(nextStatus) && (!remediation || evidence.length === 0)) return json({ error: "INCIDENT_RECOVERY_EVIDENCE_REQUIRED", request_id: requestId }, 409, requestId);
      const saved = await supabase.from("operational_incidents").update({ status: nextStatus, remediation: remediation || null, evidence, resolved_at: nextStatus === "resolved" ? new Date().toISOString() : nextStatus === "mitigating" ? null : currentIncident.data.resolved_at, closed_at: nextStatus === "closed" ? new Date().toISOString() : null, updated_at: new Date().toISOString() }).eq("id", id).eq("org_id", scope.context.orgId).eq("data_class", scope.dataClass).eq("status", expectedStatus).select("id").maybeSingle();
      if (saved.error) throw saved.error; if (!saved.data) return json({ error: "INCIDENT_CONFLICT_OR_NOT_FOUND", request_id: requestId }, 409, requestId); resourceType = "operational_incident"; resourceId = id;
    } else if (operation === "save_capability_gate") {
      if (scope.user.role !== "admin") return json({ error: "SYSTEM_ADMIN_REQUIRED", request_id: requestId }, 403, requestId);
      const capabilityKey = text(body.capability_key); const gateStatus = text(body.status); const configSummary = record(body.config_summary);
      if (!CAPABILITY_KEYS.has(capabilityKey) || !CAPABILITY_STATUSES.has(gateStatus)) return json({ error: "INVALID_CAPABILITY_GATE", request_id: requestId }, 400, requestId);
      if (containsSecretKey(configSummary)) return json({ error: "SECRETS_NOT_ALLOWED_IN_CAPABILITY_GATE", request_id: requestId }, 400, requestId);
      const currentGate = await supabase.from("enterprise_capability_gates").select("evidence,last_tested_at").eq("org_id", scope.context.orgId).eq("capability_key", capabilityKey).maybeSingle();
      if (currentGate.error) throw currentGate.error;
      const evidence = body.evidence === undefined ? array(currentGate.data?.evidence) : array(body.evidence); const lastTestedAt = body.last_tested_at === undefined ? text(currentGate.data?.last_tested_at) : text(body.last_tested_at);
      if (["tested", "enabled"].includes(gateStatus) && (evidence.length === 0 || !Number.isFinite(new Date(lastTestedAt).getTime()))) return json({ error: "CAPABILITY_TEST_EVIDENCE_REQUIRED", request_id: requestId }, 409, requestId);
      if (gateStatus === "enabled" && body.confirm !== true) return json({ error: "CAPABILITY_ENABLE_CONFIRMATION_REQUIRED", request_id: requestId }, 409, requestId);
      const saved = await supabase.from("enterprise_capability_gates").upsert({ org_id: scope.context.orgId, capability_key: capabilityKey, provider: text(body.provider) || null, status: gateStatus, config_summary: configSummary, evidence, blocker: text(body.blocker) || null, last_tested_at: lastTestedAt || null, enabled_at: gateStatus === "enabled" ? new Date().toISOString() : null, updated_by: scope.user.id, updated_at: new Date().toISOString() }, { onConflict: "org_id,capability_key" }).select("id").single();
      if (saved.error) throw saved.error; resourceType = "enterprise_capability_gate"; resourceId = saved.data.id;
    } else if (operation === "create_value_review") {
      if (scope.role !== "pmo") return json({ error: "PMO_CONTEXT_REQUIRED", request_id: requestId }, 403, requestId);
      const periodStart = text(body.period_start); const periodEnd = text(body.period_end); const conclusions = text(body.conclusions); const evidence = array(body.value_evidence);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(periodStart) || !/^\d{4}-\d{2}-\d{2}$/.test(periodEnd) || !conclusions || evidence.length === 0) return json({ error: "VALUE_REVIEW_INPUTS_REQUIRED", request_id: requestId }, 400, requestId);
      const pilotProgramId = text(body.pilot_program_id);
      if (pilotProgramId) {
        const pilotScope = await supabase.from("pilot_programs").select("project_id").eq("id", pilotProgramId).eq("org_id", scope.context.orgId).eq("data_class", scope.dataClass).maybeSingle();
        if (pilotScope.error) throw pilotScope.error;
        if (!pilotScope.data || !scope.projectIds.includes(String(pilotScope.data.project_id))) return json({ error: "PILOT_OUTSIDE_CONTEXT_OR_NOT_FOUND", request_id: requestId }, 403, requestId);
      }
      const metricSnapshotId = text(body.metric_snapshot_id);
      if (metricSnapshotId) {
        const snapshotScope = await supabase.from("operational_metric_snapshots").select("subject_scope,subject_id").eq("id", metricSnapshotId).eq("org_id", scope.context.orgId).eq("data_class", scope.dataClass).maybeSingle();
        if (snapshotScope.error) throw snapshotScope.error;
        if (!snapshotScope.data || !relevantSubject(scope, snapshotScope.data)) return json({ error: "METRIC_SNAPSHOT_OUTSIDE_CONTEXT_OR_NOT_FOUND", request_id: requestId }, 403, requestId);
      }
      const idempotencyKey = text(body.idempotency_key) || `value-review:${scope.context.subjectScope}:${scope.context.subjectId}:${scope.dataClass}:${periodStart}:${periodEnd}:${pilotProgramId || "organization"}`;
      const existingReview = await supabase.from("quarterly_value_reviews").select("id,conclusions,value_evidence").eq("org_id", scope.context.orgId).eq("idempotency_key", idempotencyKey).maybeSingle();
      if (existingReview.error) throw existingReview.error;
      if (existingReview.data) {
        if (String(existingReview.data.conclusions) !== conclusions || JSON.stringify(existingReview.data.value_evidence ?? []) !== JSON.stringify(evidence)) return json({ error: "IDEMPOTENCY_KEY_PAYLOAD_CONFLICT", request_id: requestId }, 409, requestId);
        resourceType = "quarterly_value_review"; resourceId = existingReview.data.id;
      } else {
        const saved = await supabase.from("quarterly_value_reviews").insert({ org_id: scope.context.orgId, pilot_program_id: pilotProgramId || null, data_class: scope.dataClass, idempotency_key: idempotencyKey, period_start: periodStart, period_end: periodEnd, status: "submitted", metric_snapshot_id: metricSnapshotId || null, value_evidence: evidence, conclusions, threshold_changes: array(body.threshold_changes), function_retirement_decisions: array(body.function_retirement_decisions), submitted_by: scope.user.id, submitted_at: new Date().toISOString() }).select("id").single();
        if (saved.error) throw saved.error; resourceType = "quarterly_value_review"; resourceId = saved.data.id; responseStatus = 201;
      }
    } else if (operation === "review_value_review") {
      if (scope.role !== "ceo") return json({ error: "CEO_CONTEXT_REQUIRED", request_id: requestId }, 403, requestId);
      const id = text(body.id); const status = text(body.status); const comment = text(body.review_comment);
      if (!id || !["accepted", "rework"].includes(status) || !comment || body.confirm !== true) return json({ error: "EXPLICIT_VALUE_REVIEW_DECISION_REQUIRED", request_id: requestId }, 409, requestId);
      const saved = await supabase.from("quarterly_value_reviews").update({ status, reviewed_by: scope.user.id, reviewed_at: new Date().toISOString(), review_comment: comment, updated_at: new Date().toISOString() }).eq("id", id).eq("org_id", scope.context.orgId).eq("data_class", scope.dataClass).eq("status", "submitted").select("id").maybeSingle();
      if (saved.error) throw saved.error; if (!saved.data) return json({ error: "VALUE_REVIEW_CONFLICT_OR_NOT_FOUND", request_id: requestId }, 409, requestId); resourceType = "quarterly_value_review"; resourceId = id;
    } else return json({ error: "UNSUPPORTED_OPERATION", request_id: requestId }, 400, requestId);

    await auditSuccess(scope, operation, resourceType, resourceId, requestId);
    return json({ status: "succeeded", id: resourceId, request_id: requestId }, responseStatus, requestId);
  } catch (error) {
    return json({ error: "OPERATIONS_WRITE_FAILED", detail: error instanceof Error ? error.message : "unknown", request_id: requestId }, 503, requestId);
  }
}
