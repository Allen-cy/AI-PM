import { getAuthSupabase, getCurrentUser } from "@/features/auth/server";
import { resolveBusinessContext, type BusinessRole, type SubjectScope } from "@/features/operating-model/context";
import { listBusinessRoleAssignments, loadContextProjectIdentityMappings, type ManagementSignalRecord } from "@/features/operating-model/persistence";
import {
  canMaterializeRecommendation,
  parseRoleAssistantOutput,
  recommendationExecutionPolicy,
  validateRecommendationPayload,
  type RecommendationType,
} from "@/features/operating-model/role-assistant";
import { scanRoleAssistantFacts } from "@/features/operating-model/role-assistant-scanner";
import { writeOperationAudit } from "@/features/security/repository";
import { llmComplete } from "@/lib/llm";

export const runtime = "nodejs";

type AuthorizedScope = Exclude<Awaited<ReturnType<typeof contextFor>>, { error: string }>;
type AuthorizedRun = { id: string } & Record<string, unknown>;
type AuthorizedRecommendation = {
  id: string;
  run_id: string;
  recommendation_type: string;
  title: string;
  reason: string;
  proposed_payload: Record<string, unknown>;
  status: string;
} & Record<string, unknown>;

const DATA_CLASSES = new Set(["production", "sample", "test", "diagnostic", "unclassified"]);
const SIGNAL_OWNER_ROLES: Record<string, BusinessRole[]> = {
  progress: ["pm", "operations"],
  risk: ["pm", "operations"],
  data_quality: ["pmo"],
};

function json(body: unknown, status = 200, requestId = crypto.randomUUID()) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store", "X-Request-Id": requestId } });
}

async function contextFor(request: Request) {
  const user = await getCurrentUser();
  if (!user) return { error: "UNAUTHORIZED", status: 401 } as const;
  const url = new URL(request.url);
  const role = (url.searchParams.get("role") || "") as BusinessRole;
  const orgId = url.searchParams.get("org_id") || "";
  const subjectScope = (url.searchParams.get("subject_scope") || "") as SubjectScope;
  const subjectId = url.searchParams.get("subject_id") || "";
  const dataClass = (url.searchParams.get("data_class") || "production") as ManagementSignalRecord["dataClass"];
  if (!role || !orgId || !subjectScope || !subjectId || !DATA_CLASSES.has(dataClass)) return { error: "BUSINESS_CONTEXT_REQUIRED", status: 400 } as const;
  const assignments = await listBusinessRoleAssignments(user.id);
  if (assignments.status !== "succeeded") return { error: "P17_STORAGE_NOT_CONFIGURED", detail: assignments.warning, status: 503 } as const;
  const context = resolveBusinessContext({
    user: { id: user.id, systemRole: user.role }, assignments: assignments.data ?? [], requestedRole: role,
    requestedOrgId: orgId, requestedSubjectScope: subjectScope, requestedSubjectId: subjectId,
  });
  if (!context) return { error: "BUSINESS_CONTEXT_FORBIDDEN", status: 403 } as const;
  const mappings = await loadContextProjectIdentityMappings({ context, dataClass });
  if (mappings.status !== "succeeded") return { error: "PROJECT_SCOPE_MAPPING_FAILED", detail: mappings.warning, status: mappings.status === "not_configured" ? 503 : 500 } as const;
  return { user, context, role, dataClass, projectIds: [...new Set((mappings.data ?? []).map(item => item.projectId))] } as const;
}

async function evidenceSnapshot(scope: AuthorizedScope) {
  const supabase = getAuthSupabase();
  if (scope.projectIds.length === 0) return { facts: [], allowed: new Set<string>() };
  const [projects, signals, actions, risks, issues, changes, reportingSnapshots] = await Promise.all([
    supabase.from("projects").select("id,name,status,progress,project_level,updated_at").in("id", scope.projectIds).eq("org_id", scope.context.orgId).eq("data_class", scope.dataClass),
    supabase.from("management_signals").select("id,project_id,title,summary,severity,status,due_at,rule_version,snapshot_at").in("project_id", scope.projectIds).eq("org_id", scope.context.orgId).eq("data_class", scope.dataClass),
    supabase.from("unified_action_items").select("id,project_id,title,status,priority,due_date,owner_user_id,source_type,source_id,updated_at").in("project_id", scope.projectIds).eq("org_id", scope.context.orgId),
    supabase.from("risks").select("id,project_id,risk_code,description,category,probability,impact,urgency,status,owner,due_date,next_review_date,updated_at").in("project_id", scope.projectIds),
    supabase.from("project_issues").select("id,project_id,issue_code,title,description,severity,status,owner,due_date,impact_scope,updated_at").in("project_id", scope.projectIds),
    supabase.from("project_changes").select("id,project_id,change_code,title,reason,change_type,impact_scope,status,owner,approver,due_date,updated_at").in("project_id", scope.projectIds),
    supabase.from("reporting_snapshots").select("id,subject_id,snapshot_type,period_start,period_end,status,metrics,exceptions,narrative,source_snapshot_at").eq("org_id", scope.context.orgId).eq("data_class", scope.dataClass).in("subject_id", scope.projectIds),
  ]);
  const error = [projects, signals, actions, risks, issues, changes, reportingSnapshots].find(item => item.error)?.error;
  if (error) throw new Error(error.message);
  const facts = [
    ...(projects.data ?? []).map(item => ({ evidence_id: `project:${item.id}`, type: "project", ...item })),
    ...(signals.data ?? []).map(item => ({ evidence_id: `signal:${item.id}`, type: "management_signal", ...item })),
    ...(actions.data ?? []).map(item => ({ evidence_id: `action:${item.id}`, type: "action", ...item })),
    ...(risks.data ?? []).map(item => ({ evidence_id: `risk:${item.id}`, type: "risk", ...item })),
    ...(issues.data ?? []).map(item => ({ evidence_id: `issue:${item.id}`, type: "issue", ...item })),
    ...(changes.data ?? []).map(item => ({ evidence_id: `change:${item.id}`, type: "change", ...item })),
    ...(reportingSnapshots.data ?? []).map(item => ({ evidence_id: `reporting_snapshot:${item.id}`, type: "reporting_snapshot", ...item })),
  ];
  return { facts, allowed: new Set(facts.map(item => item.evidence_id)) };
}

async function loadAuthorizedRun(scope: AuthorizedScope, runId: string): Promise<{ data: AuthorizedRun | null; error: Error | null }> {
  if (!runId) return { data: null, error: null };
  const result = await getAuthSupabase().from("ai_assistant_runs").select("*")
    .eq("id", runId).eq("actor_user_id", scope.user.id).eq("business_role", scope.role)
    .eq("org_id", scope.context.orgId).eq("subject_scope", scope.context.subjectScope)
    .eq("subject_id", scope.context.subjectId).eq("data_class", scope.dataClass).maybeSingle();
  return { data: result.data as AuthorizedRun | null, error: result.error ? new Error(result.error.message) : null };
}

async function loadAuthorizedRecommendation(scope: AuthorizedScope, recommendationId: string): Promise<{ data: AuthorizedRecommendation | null; error: Error | null }> {
  if (!recommendationId) return { data: null, error: null };
  const supabase = getAuthSupabase();
  const recommendation = await supabase.from("ai_recommendations").select("*")
    .eq("id", recommendationId).eq("actor_user_id", scope.user.id).eq("business_role", scope.role)
    .eq("org_id", scope.context.orgId).eq("subject_scope", scope.context.subjectScope)
    .eq("subject_id", scope.context.subjectId).eq("data_class", scope.dataClass).maybeSingle();
  if (recommendation.error) return { data: null, error: new Error(recommendation.error.message) };
  if (!recommendation.data) return { data: null, error: null };
  const run = await loadAuthorizedRun(scope, String(recommendation.data.run_id));
  if (run.error) return { data: null, error: run.error };
  if (!run.data) return { data: null, error: null };
  return { data: recommendation.data as AuthorizedRecommendation, error: null };
}

function recommendationContext(scope: AuthorizedScope, runId: string) {
  return {
    run_id: runId, org_id: scope.context.orgId, actor_user_id: scope.user.id, business_role: scope.role,
    subject_scope: scope.context.subjectScope, subject_id: scope.context.subjectId, data_class: scope.dataClass,
  };
}

function evaluationMetrics(rows: Array<Record<string, unknown>>) {
  const accuracy = rows.map(item => Number(item.accuracy_score)).filter(Number.isFinite);
  const refusalRows = rows.filter(item => String(item.refusal_outcome || "not_applicable") !== "not_applicable");
  const adoptionRows = rows.filter(item => typeof item.adopted === "boolean");
  const effects = rows.filter(item => String(item.closure_effect || "not_evaluated") !== "not_evaluated");
  return {
    evaluation_count: rows.length,
    accuracy_rate: accuracy.length ? accuracy.reduce((sum, item) => sum + item, 0) / accuracy.length : null,
    refusal_count: refusalRows.length,
    correct_refusal_rate: refusalRows.length ? refusalRows.filter(item => item.refusal_outcome === "correct").length / refusalRows.length : null,
    false_positive_rate: rows.length ? rows.filter(item => item.false_positive === true).length / rows.length : null,
    false_negative_rate: rows.length ? rows.filter(item => item.false_negative === true).length / rows.length : null,
    adoption_rate: adoptionRows.length ? adoptionRows.filter(item => item.adopted === true).length / adoptionRows.length : null,
    human_modification_rate: rows.length ? rows.filter(item => item.human_modified === true).length / rows.length : null,
    closure_effect_count: effects.length,
    closure_effect_achieved_rate: effects.length ? effects.filter(item => item.closure_effect === "achieved").length / effects.length : null,
  };
}

async function runProactiveRoleAssistantScan(scope: AuthorizedScope, requestId: string) {
  const supabase = getAuthSupabase();
  if (scope.projectIds.length === 0) return { findings: [], signals: [], created: 0, refreshed: 0 };
  const [projects, actions, risks, issues, changes, reportingSnapshots, roleAssignments, portfolioLinks] = await Promise.all([
    supabase.from("projects").select("id,name,status,progress,updated_at").in("id", scope.projectIds).eq("org_id", scope.context.orgId).eq("data_class", scope.dataClass),
    supabase.from("unified_action_items").select("id,project_id,title,status,due_date,owner_user_id").in("project_id", scope.projectIds).eq("org_id", scope.context.orgId),
    supabase.from("risks").select("id,project_id,description,status,due_date,owner").in("project_id", scope.projectIds),
    supabase.from("project_issues").select("id,project_id,title,status,due_date,owner").in("project_id", scope.projectIds),
    supabase.from("project_changes").select("id,project_id,title,status,due_date,owner").in("project_id", scope.projectIds),
    supabase.from("reporting_snapshots").select("id,subject_id,snapshot_type,period_start,period_end,status").eq("org_id", scope.context.orgId).eq("data_class", scope.dataClass).in("subject_id", scope.projectIds),
    supabase.from("user_business_roles").select("user_id,business_role,subject_scope,subject_id,valid_from,valid_until,status").eq("org_id", scope.context.orgId).eq("status", "active").in("business_role", ["pm", "operations", "pmo"]),
    supabase.from("portfolio_project_links").select("portfolio_id,project_id").eq("org_id", scope.context.orgId).in("project_id", scope.projectIds),
  ]);
  const sourceError = [projects, actions, risks, issues, changes, reportingSnapshots, roleAssignments, portfolioLinks].find(item => item.error)?.error;
  if (sourceError) throw new Error(`P23_SCAN_SOURCE_FAILED:${sourceError.message}`);
  const now = new Date();
  const findings = scanRoleAssistantFacts({
    now,
    projects: projects.data ?? [], actions: actions.data ?? [], risks: risks.data ?? [], issues: issues.data ?? [],
    changes: changes.data ?? [], reportingSnapshots: reportingSnapshots.data ?? [],
  });
  const signals: Record<string, unknown>[] = [];
  const warnings: string[] = [];
  let created = 0;
  let refreshed = 0;
  const dueAt = new Date(now.getTime() + 86_400_000).toISOString();
  const portfoliosByProject = new Map<string, Set<string>>();
  for (const link of portfolioLinks.data ?? []) {
    const projectId = String(link.project_id);
    const values = portfoliosByProject.get(projectId) ?? new Set<string>();
    values.add(String(link.portfolio_id)); portfoliosByProject.set(projectId, values);
  }
  const activeRoles = roleAssignments.data ?? [];
  function responsibleOwner(finding: ReturnType<typeof scanRoleAssistantFacts>[number]): string | null {
    if (finding.ownerUserId) return finding.ownerUserId;
    const portfolioIds = portfoliosByProject.get(finding.projectId) ?? new Set<string>();
    for (const businessRole of SIGNAL_OWNER_ROLES[finding.signalType] ?? ["pmo"]) {
      const match = activeRoles.find(row => {
        if (row.business_role !== businessRole) return false;
        const start = Date.parse(String(row.valid_from || "")); const end = row.valid_until ? Date.parse(String(row.valid_until)) : null;
        if (!Number.isFinite(start) || start > now.getTime() || (end !== null && (!Number.isFinite(end) || end < now.getTime()))) return false;
        return (row.subject_scope === "project" && row.subject_id === finding.projectId)
          || (row.subject_scope === "portfolio" && portfolioIds.has(String(row.subject_id)))
          || (row.subject_scope === "organization" && row.subject_id === scope.context.orgId);
      });
      if (match) return String(match.user_id);
    }
    return null;
  }
  for (const finding of findings) {
    const ownerUserId = responsibleOwner(finding);
    if (!ownerUserId) {
      const requiredRole = (SIGNAL_OWNER_ROLES[finding.signalType] ?? ["pmo"])[0];
      const coverage = await supabase.from("business_role_coverage_gaps").upsert({
        org_id: scope.context.orgId, subject_scope: "project", subject_id: finding.projectId,
        required_business_role: requiredRole, source_type: "role_assistant_scan", source_id: finding.sourceId,
        status: "open", due_at: dueAt,
      }, { onConflict: "org_id,subject_scope,subject_id,required_business_role,source_type,source_id" });
      if (coverage.error) throw new Error(`P23_ROLE_COVERAGE_GAP_WRITE_FAILED:${coverage.error.message}`);
      warnings.push(`${finding.title}缺少有效${requiredRole}责任人，已进入无人承接清单，未生成无责任信号。`);
      continue;
    }
    const saved = await supabase.rpc("upsert_generic_management_signal_tx", {
      p_payload: {
        org_id: scope.context.orgId, project_id: finding.projectId, data_class: scope.dataClass,
        signal_type: finding.signalType, rule_version: `P23-${finding.ruleKey}-v1`, baseline_version: null,
        severity: finding.severity, route: finding.route, title: finding.title, summary: finding.summary,
        impact: finding.impact, payload: { period_key: finding.windowKey, scan_rule: finding.ruleKey },
        dedup_key: finding.dedupKey, owner_user_id: ownerUserId, due_at: dueAt, next_review_at: dueAt,
        metric_observation_ids: [], source_type: `role_assistant_scan:${finding.sourceType}`,
        source_id: finding.sourceId, snapshot_at: now.toISOString(), trust_status: "trusted",
      },
      p_actor_user_id: scope.user.id, p_actor_business_role: scope.role, p_request_id: `${requestId}:${finding.dedupKey}`,
    });
    if (saved.error) throw new Error(`P23_SIGNAL_UPSERT_FAILED:${saved.error.message}`);
    const result = saved.data as { signal?: Record<string, unknown>; created?: boolean } | null;
    if (result?.signal) signals.push(result.signal);
    if (result?.created) created += 1; else refreshed += 1;
  }
  await writeOperationAudit({
    user: scope.user, action: "role_assistant_proactive_scan", resourceType: "business_context", resourceId: scope.context.assignmentId,
    status: "succeeded", severity: "medium", summary: "角色AI助理已先扫描并登记异常、冲突、遗漏与到期信号",
    detail: { findingCount: findings.length, created, refreshed, ruleKeys: [...new Set(findings.map(item => item.ruleKey))], businessRole: scope.role, dataClass: scope.dataClass }, requestId,
  });
  return { findings, signals, created, refreshed, warnings };
}

export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  const scope = await contextFor(request);
  if ("error" in scope) return json({ error: scope.error, detail: "detail" in scope ? scope.detail : undefined, request_id: requestId }, scope.status, requestId);
  const supabase = getAuthSupabase();
  const [runs, recommendations, evaluations, executionAttempts] = await Promise.all([
    supabase.from("ai_assistant_runs").select("id,business_role,scenario,prompt_version,model_provider,model_name,status,output,error_class,error_message,started_at,completed_at")
      .eq("actor_user_id", scope.user.id).eq("business_role", scope.role).eq("org_id", scope.context.orgId)
      .eq("subject_scope", scope.context.subjectScope).eq("subject_id", scope.context.subjectId).eq("data_class", scope.dataClass)
      .order("created_at", { ascending: false }).limit(30),
    supabase.from("ai_recommendations").select("id,run_id,recommendation_type,title,reason,proposed_payload,status,confirmed_at,executed_resource_type,executed_resource_id,created_at")
      .eq("actor_user_id", scope.user.id).eq("business_role", scope.role).eq("org_id", scope.context.orgId)
      .eq("subject_scope", scope.context.subjectScope).eq("subject_id", scope.context.subjectId).eq("data_class", scope.dataClass)
      .order("created_at", { ascending: false }).limit(100),
    supabase.from("ai_assistant_evaluations").select("id,run_id,recommendation_id,rating,verdict,correction,adopted,outcome,accuracy_score,refusal_outcome,false_positive,false_negative,human_modified,human_edit_summary,closure_effect,created_at")
      .eq("evaluator_user_id", scope.user.id).eq("business_role", scope.role).eq("org_id", scope.context.orgId)
      .eq("subject_scope", scope.context.subjectScope).eq("subject_id", scope.context.subjectId).eq("data_class", scope.dataClass)
      .order("created_at", { ascending: false }).limit(100),
    supabase.from("ai_recommendation_execution_attempts").select("id,recommendation_id,run_id,recommendation_type,status,resource_type,resource_id,error_code,created_at,completed_at")
      .eq("actor_user_id", scope.user.id).eq("business_role", scope.role).eq("org_id", scope.context.orgId)
      .eq("subject_scope", scope.context.subjectScope).eq("subject_id", scope.context.subjectId).eq("data_class", scope.dataClass)
      .order("created_at", { ascending: false }).limit(100),
  ]);
  const error = runs.error || recommendations.error || evaluations.error || executionAttempts.error;
  if (error) return json({ error: "ROLE_ASSISTANT_STORAGE_UNAVAILABLE", detail: error.message, request_id: requestId }, 503, requestId);
  const runIds = new Set((runs.data ?? []).map(item => String(item.id)));
  const safeRecommendations = (recommendations.data ?? []).filter(item => runIds.has(String(item.run_id)));
  const safeEvaluations = (evaluations.data ?? []).filter(item => runIds.has(String(item.run_id))) as Array<Record<string, unknown>>;
  const safeAttempts = (executionAttempts.data ?? []).filter(item => runIds.has(String(item.run_id)));
  return json({
    status: "succeeded", context: scope.context, data_class: scope.dataClass, runs: runs.data ?? [],
    recommendations: safeRecommendations, evaluations: safeEvaluations, evaluation_metrics: evaluationMetrics(safeEvaluations), execution_attempts: safeAttempts,
    source: { type: "supabase", fallback_used: false }, request_id: requestId,
  }, 200, requestId);
}

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  const scope = await contextFor(request);
  if ("error" in scope) return json({ error: scope.error, detail: "detail" in scope ? scope.detail : undefined, request_id: requestId }, scope.status, requestId);
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; }
  catch { return json({ error: "INVALID_JSON", request_id: requestId }, 400, requestId); }
  const operation = String(body.operation || "");
  const supabase = getAuthSupabase();

  if (operation === "scan") {
    try {
      const scan = await runProactiveRoleAssistantScan(scope, requestId);
      return json({ status: "succeeded", ...scan, source: { type: "supabase", fallback_used: false }, request_id: requestId }, 201, requestId);
    } catch (error) {
      return json({ error: "ROLE_ASSISTANT_SCAN_FAILED", detail: error instanceof Error ? error.message : "unknown", request_id: requestId }, 503, requestId);
    }
  }

  if (operation === "generate") {
    let runId = "";
    try {
      const scan = await runProactiveRoleAssistantScan(scope, `${requestId}:pre-generation`);
      const snapshot = await evidenceSnapshot(scope);
      if (snapshot.facts.length === 0) return json({ error: "NO_VERIFIED_FACTS_IN_CONTEXT", request_id: requestId }, 409, requestId);
      const scenario = String(body.scenario || "daily_business_assistant");
      const promptVersion = "role-assistant-v2-domain-drafts";
      const created = await supabase.from("ai_assistant_runs").insert({
        org_id: scope.context.orgId, actor_user_id: scope.user.id, business_role: scope.role,
        subject_scope: scope.context.subjectScope, subject_id: scope.context.subjectId, data_class: scope.dataClass,
        scenario, prompt_version: promptVersion, input_snapshot: snapshot.facts,
        allowed_evidence_ids: [...snapshot.allowed], status: "running",
      }).select("id").single();
      if (created.error) throw created.error;
      runId = created.data.id;
      const roleInstruction: Record<string, string> = {
        pm: "聚焦承诺、里程碑、风险问题变更、行动和升级", operations: "聚焦验收、开票、应收、实收、现金与交付联动",
        pmo: "聚焦组合例外、依赖、资源、治理SLA和上报", ceo: "聚焦战略价值、收益、现金、重大风险、资源取舍和待决策事项",
        finance: "聚焦成本、现金、应收与收益口径", quality: "聚焦质量门禁、缺陷与证据",
      };
      const allTypes: RecommendationType[] = ["action", "risk", "issue", "change", "governance", "decision_brief", "report", "feishu_draft"];
      const allowedTypes = allTypes.filter(type => canMaterializeRecommendation(scope.role, type));
      const system = `你是AI PMO角色业务助理。当前角色=${scope.role}。${roleInstruction[scope.role] || "聚焦当前授权范围"}。
只能使用提供的evidence_id，不得补造事实或将建议表述为已执行。如果信息不足，写入pending_confirmation，不得猜测责任人、时间、金额、收件人或审批结论。
只允许生成当前角色可创建草稿的类型：${allowedTypes.join(",")}。每条recommendation.proposed_payload必须包含project_id和evidence_ids，且evidence_ids至少一条。
各类载荷必填字段：
action={project_id,evidence_ids,priority:P0|P1|P2,due_date:YYYY-MM-DD,acceptance_criteria,owner_user_id?}；
risk={project_id,evidence_ids,description,probability:1-5,impact:1-5,urgency:1-5,owner,due_date,category?,stage?,impact_area?,trigger_condition?}；
issue={project_id,evidence_ids,description,severity:high|medium|low,owner,due_date,impact_scope}；
change={project_id,evidence_ids,reason,change_type:scope|schedule|cost|quality|contract|collection|resource|other,impact_scope,owner,approver,due_date,impact_cost?,impact_schedule_days?}；
governance={project_id,evidence_ids,workflow_id:project-initiation-review|stage-gate-review|change-control|risk-escalation|project-closure,input_summary,owner,approver,priority:high|medium|low,deadline}；
decision_brief={project_id,evidence_ids,decision_question,options:[{key,label,consequences}]至少2个,recommendation:方案key,impact_summary,requested_decision_at:ISO,execution_due_at:ISO,acceptance_criteria,decision_type?,decision_level?}；
report={project_id,evidence_ids,snapshot_type:daily|weekly|monthly|quarterly|ad_hoc,period_start,period_end,narrative,metrics:{},exceptions:[]}；
feishu_draft={project_id,evidence_ids,type:message|task|calendar|document,idempotency_key,并按飞书动作补齐目标字段}，禁止base_record_update。
输出严格JSON：facts[{statement,evidence_ids}],inferences[{statement,confidence,evidence_ids}],recommendations[{title,type,reason,proposed_payload,confirmation_required:true}],pending_confirmation[string]。事实、推断、建议必须分开；任何草稿都需两次人工确认。`;
      const completion = await llmComplete("summary", system, JSON.stringify({ scenario, facts: snapshot.facts }), { temperature: 0.1 });
      const output = parseRoleAssistantOutput(completion.content, snapshot.allowed);
      const updated = await supabase.from("ai_assistant_runs").update({
        status: "succeeded", output, model_name: completion.model, model_provider: completion.model.split("-")[0], completed_at: new Date().toISOString(),
      }).eq("id", runId).eq("actor_user_id", scope.user.id).eq("business_role", scope.role)
        .eq("org_id", scope.context.orgId).eq("subject_scope", scope.context.subjectScope)
        .eq("subject_id", scope.context.subjectId).eq("data_class", scope.dataClass);
      if (updated.error) throw updated.error;
      if (output.recommendations.length > 0) {
        const saved = await supabase.from("ai_recommendations").insert(output.recommendations.map((item, index) => ({
          ...recommendationContext(scope, runId), recommendation_type: item.type, title: item.title, reason: item.reason,
          proposed_payload: item.proposed_payload, status: "pending_confirmation", idempotency_key: `ai:${runId}:${index + 1}`,
        })));
        if (saved.error) throw saved.error;
      }
      await writeOperationAudit({ user: scope.user, action: "role_assistant_generate", resourceType: "ai_assistant_run", resourceId: runId, status: "succeeded", summary: `${scope.role}角色助理已生成有证据输出`, detail: { scenario, evidenceCount: snapshot.facts.length, recommendationCount: output.recommendations.length, businessRole: scope.role, dataClass: scope.dataClass }, requestId });
      return json({ status: "succeeded", run_id: runId, model: completion.model, output, proactive_scan: { finding_count: scan.findings.length, created: scan.created, refreshed: scan.refreshed }, request_id: requestId }, 201, requestId);
    } catch (error) {
      if (runId) await supabase.from("ai_assistant_runs").update({ status: "failed", error_class: "generation_or_validation", error_message: error instanceof Error ? error.message.slice(0, 500) : "unknown", completed_at: new Date().toISOString() })
        .eq("id", runId).eq("actor_user_id", scope.user.id).eq("business_role", scope.role).eq("org_id", scope.context.orgId)
        .eq("subject_scope", scope.context.subjectScope).eq("subject_id", scope.context.subjectId).eq("data_class", scope.dataClass);
      return json({ error: "ROLE_ASSISTANT_GENERATION_FAILED", detail: error instanceof Error ? error.message : "unknown", request_id: requestId }, 502, requestId);
    }
  }

  try {
    if (operation === "evaluate") {
      const runId = String(body.run_id || "");
      const verdict = String(body.verdict || "");
      const allowedVerdicts = new Set(["accurate", "partially_accurate", "false_positive", "missed_issue", "unsafe", "useful", "not_useful"]);
      const rating = body.rating == null || body.rating === "" ? null : Number(body.rating);
      const accuracyScore = body.accuracy_score == null || body.accuracy_score === "" ? null : Number(body.accuracy_score);
      const refusalOutcome = String(body.refusal_outcome || "not_applicable");
      const closureEffect = String(body.closure_effect || "not_evaluated");
      const humanModified = body.human_modified === true;
      const humanEditSummary = String(body.human_edit_summary || "").trim();
      if (!runId || !allowedVerdicts.has(verdict)) return json({ error: "RUN_AND_VALID_VERDICT_REQUIRED", request_id: requestId }, 400, requestId);
      if (rating !== null && (!Number.isInteger(rating) || rating < 1 || rating > 5)) return json({ error: "RATING_OUT_OF_RANGE", request_id: requestId }, 400, requestId);
      if (accuracyScore !== null && (!Number.isFinite(accuracyScore) || accuracyScore < 0 || accuracyScore > 1)) return json({ error: "ACCURACY_SCORE_OUT_OF_RANGE", request_id: requestId }, 400, requestId);
      if (!["not_applicable", "correct", "incorrect"].includes(refusalOutcome)) return json({ error: "REFUSAL_OUTCOME_INVALID", request_id: requestId }, 400, requestId);
      if (!["not_evaluated", "achieved", "partially_achieved", "not_achieved", "too_early"].includes(closureEffect)) return json({ error: "CLOSURE_EFFECT_INVALID", request_id: requestId }, 400, requestId);
      if (humanModified && !humanEditSummary) return json({ error: "HUMAN_EDIT_SUMMARY_REQUIRED", request_id: requestId }, 400, requestId);
      const run = await loadAuthorizedRun(scope, runId);
      if (run.error) throw run.error;
      if (!run.data) return json({ error: "RUN_NOT_FOUND_IN_CURRENT_CONTEXT", request_id: requestId }, 404, requestId);
      const recommendationId = String(body.recommendation_id || "");
      if (recommendationId) {
        const recommendation = await loadAuthorizedRecommendation(scope, recommendationId);
        if (recommendation.error) throw recommendation.error;
        if (!recommendation.data || recommendation.data.run_id !== runId) return json({ error: "RECOMMENDATION_NOT_FOUND_IN_RUN_CONTEXT", request_id: requestId }, 404, requestId);
      }
      const evaluation = await supabase.from("ai_assistant_evaluations").insert({
        run_id: runId, recommendation_id: recommendationId || null, evaluator_user_id: scope.user.id,
        org_id: scope.context.orgId, business_role: scope.role, subject_scope: scope.context.subjectScope,
        subject_id: scope.context.subjectId, data_class: scope.dataClass, rating, verdict,
        correction: String(body.correction || "").trim() || null, adopted: typeof body.adopted === "boolean" ? body.adopted : null,
        outcome: String(body.outcome || "").trim() || null, accuracy_score: accuracyScore, refusal_outcome: refusalOutcome,
        false_positive: body.false_positive === true, false_negative: body.false_negative === true,
        human_modified: humanModified, human_edit_summary: humanEditSummary || null, closure_effect: closureEffect,
      }).select("id").single();
      if (evaluation.error) throw evaluation.error;
      await writeOperationAudit({ user: scope.user, action: "role_assistant_evaluate", resourceType: "ai_assistant_run", resourceId: runId, status: "succeeded", summary: "当前用户已提交角色助理效果评测", detail: { businessRole: scope.role, dataClass: scope.dataClass, verdict, rating, accuracyScore, refusalOutcome, falsePositive: body.false_positive === true, falseNegative: body.false_negative === true, adopted: body.adopted, humanModified, closureEffect }, requestId });
      return json({ status: "succeeded", evaluation_id: evaluation.data.id, request_id: requestId }, 200, requestId);
    }

    const recommendationId = String(body.recommendation_id || "");
    const recommendation = await loadAuthorizedRecommendation(scope, recommendationId);
    if (recommendation.error) throw recommendation.error;
    if (!recommendation.data) return json({ error: "RECOMMENDATION_NOT_FOUND_IN_CURRENT_CONTEXT", request_id: requestId }, 404, requestId);
    const strict = recommendation.data;

    if (operation === "accept_recommendation") {
      if (body.confirm !== true || strict.status !== "pending_confirmation") return json({ error: "EXPLICIT_CONFIRMATION_REQUIRED", request_id: requestId }, 409, requestId);
      const saved = await supabase.from("ai_recommendations").update({ status: "accepted", confirmed_by: scope.user.id, confirmed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("id", recommendationId).eq("run_id", strict.run_id).eq("actor_user_id", scope.user.id).eq("business_role", scope.role)
        .eq("org_id", scope.context.orgId).eq("subject_scope", scope.context.subjectScope).eq("subject_id", scope.context.subjectId)
        .eq("data_class", scope.dataClass).eq("status", "pending_confirmation").select("id").maybeSingle();
      if (saved.error) throw saved.error;
      if (!saved.data) return json({ error: "RECOMMENDATION_ALREADY_HANDLED", request_id: requestId }, 409, requestId);
    } else if (operation === "reject_recommendation") {
      const reason = String(body.reason || "").trim();
      if (!reason) return json({ error: "REJECTION_REASON_REQUIRED", request_id: requestId }, 400, requestId);
      const saved = await supabase.from("ai_recommendations").update({ status: "rejected", confirmed_by: scope.user.id, confirmed_at: new Date().toISOString(), rejection_reason: reason, updated_at: new Date().toISOString() })
        .eq("id", recommendationId).eq("run_id", strict.run_id).eq("actor_user_id", scope.user.id).eq("business_role", scope.role)
        .eq("org_id", scope.context.orgId).eq("subject_scope", scope.context.subjectScope).eq("subject_id", scope.context.subjectId)
        .eq("data_class", scope.dataClass).eq("status", "pending_confirmation").select("id").maybeSingle();
      if (saved.error) throw saved.error;
      if (!saved.data) return json({ error: "RECOMMENDATION_ALREADY_HANDLED", request_id: requestId }, 409, requestId);
    } else if (operation === "materialize_recommendation" || operation === "execute_action") {
      if (strict.status !== "accepted") return json({ error: "ACCEPTED_RECOMMENDATION_REQUIRED", request_id: requestId }, 409, requestId);
      const policy = recommendationExecutionPolicy(strict.recommendation_type);
      if (!policy.supported) {
        const attempt = await supabase.from("ai_recommendation_execution_attempts").insert({
          recommendation_id: strict.id, ...recommendationContext(scope, strict.run_id), recommendation_type: strict.recommendation_type,
          request_id: requestId, confirmation_received: body.confirm_materialization === true, status: "unsupported",
          error_code: policy.errorCode, completed_at: new Date().toISOString(),
        });
        if (attempt.error) throw attempt.error;
        await writeOperationAudit({ user: scope.user, action: "role_assistant_materialize_unsupported", resourceType: "ai_recommendation", resourceId: recommendationId, status: "rejected", severity: "medium", summary: "建议类型没有安全的下游落地器，已拒绝执行", detail: { recommendationType: strict.recommendation_type, errorCode: policy.errorCode, businessRole: scope.role, dataClass: scope.dataClass }, requestId });
        return json({ error: policy.errorCode, recommendation_type: strict.recommendation_type, request_id: requestId }, 422, requestId);
      }
      if (body.confirm_materialization !== true) return json({ error: "DOWNSTREAM_MATERIALIZATION_CONFIRMATION_REQUIRED", request_id: requestId }, 409, requestId);
      const recommendationType = strict.recommendation_type as RecommendationType;
      if (!canMaterializeRecommendation(scope.role, recommendationType)) {
        await writeOperationAudit({ user: scope.user, action: "role_assistant_materialize_forbidden", resourceType: "ai_recommendation", resourceId: recommendationId, status: "rejected", severity: "high", summary: "当前业务角色不允许创建该类下游草稿", detail: { recommendationType, businessRole: scope.role, dataClass: scope.dataClass }, requestId });
        return json({ error: "RECOMMENDATION_DOMAIN_ROLE_FORBIDDEN", recommendation_type: recommendationType, request_id: requestId }, 403, requestId);
      }
      const payload = validateRecommendationPayload(recommendationType, strict.proposed_payload);
      const projectId = String(payload.project_id || "");
      if (!projectId || !scope.projectIds.includes(projectId)) return json({ error: "PROJECT_OUTSIDE_CONTEXT", request_id: requestId }, 403, requestId);
      const attempt = await supabase.from("ai_recommendation_execution_attempts").insert({
        recommendation_id: strict.id, ...recommendationContext(scope, strict.run_id), recommendation_type: strict.recommendation_type,
        request_id: requestId, confirmation_received: true, status: "requested",
      }).select("id").single();
      if (attempt.error) throw attempt.error;
      const materialized = await supabase.rpc("materialize_ai_recommendation_tx", {
        p_recommendation_id: recommendationId, p_attempt_id: attempt.data.id, p_actor_user_id: scope.user.id,
        p_actor_business_role: scope.role, p_org_id: scope.context.orgId, p_subject_scope: scope.context.subjectScope,
        p_subject_id: scope.context.subjectId, p_data_class: scope.dataClass, p_project_id: projectId,
        p_normalized_payload: payload, p_request_id: requestId,
      });
      if (materialized.error) {
        await supabase.from("ai_recommendation_execution_attempts").update({ status: "failed", error_code: "DOWNSTREAM_WRITE_FAILED", completed_at: new Date().toISOString() }).eq("id", attempt.data.id).eq("actor_user_id", scope.user.id);
        throw materialized.error;
      }
      const result = materialized.data as { resource_type?: string; resource_id?: string; initial_status?: string };
      const resourceId = String(result?.resource_id || "");
      const lifecycleBoundary = recommendationType === "action" ? "awaiting_owner_acceptance" : "awaiting_domain_workflow";
      await writeOperationAudit({ user: scope.user, action: "role_assistant_materialize_recommendation", resourceType: String(result?.resource_type || policy.resourceType), resourceId, status: "succeeded", severity: "medium", summary: "AI建议经预览、接受和二次人工确认后已生成所属领域草稿", detail: { recommendationId, runId: strict.run_id, recommendationType, initialStatus: result?.initial_status || policy.initialStatus, lifecycleBoundary, businessRole: scope.role, dataClass: scope.dataClass }, requestId });
      return json({ status: "succeeded", materialization: { status: "materialized", resource_type: result?.resource_type || policy.resourceType, resource_id: resourceId, initial_status: result?.initial_status || policy.initialStatus, lifecycle_boundary: lifecycleBoundary }, request_id: requestId }, 201, requestId);
    } else {
      return json({ error: "UNSUPPORTED_OPERATION", request_id: requestId }, 400, requestId);
    }
    await writeOperationAudit({ user: scope.user, action: `role_assistant_${operation}`, resourceType: "ai_recommendation", resourceId: recommendationId, status: "succeeded", summary: `角色助理人工动作：${operation}`, detail: { businessRole: scope.role, dataClass: scope.dataClass, runId: strict.run_id }, requestId });
    return json({ status: "succeeded", request_id: requestId }, 200, requestId);
  } catch (error) {
    return json({ error: "ROLE_ASSISTANT_OPERATION_FAILED", detail: error instanceof Error ? error.message : "unknown", request_id: requestId }, 503, requestId);
  }
}
