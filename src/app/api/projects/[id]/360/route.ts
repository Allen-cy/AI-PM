import { getCurrentUser } from "@/features/auth/server";
import {
  canPerformBusinessAction,
  filterBusinessRecordFields,
} from "@/features/operating-model/authorization";
import { resolveBusinessContextForResource, type BusinessRole } from "@/features/operating-model/context";
import { authorizeBusinessOperation } from "@/features/operating-model/authorization-persistence";
import {
  listBusinessRoleAssignments,
  loadProjectAccessScope,
  loadProject360,
} from "@/features/operating-model/persistence";
import { writeOperationAudit } from "@/features/security/repository";

export const runtime = "nodejs";

const PROJECT_FIELD_MAP: Record<string, string> = {
  id: "project.id",
  org_id: "project.org_id",
  name: "project.name",
  province: "project.province",
  oa_no: "project.code",
  product_category: "project.product_category",
  project_type: "project.type",
  channel: "project.channel",
  sales_owner: "project.sales_owner",
  contract_date: "operations.contract_date",
  deadline: "delivery.deadline",
  plan_delivery_date: "delivery.plan_date",
  status: "delivery.status",
  progress: "delivery.progress",
  project_level: "project.level",
  is_key_project: "project.is_key",
  contract_amount: "finance.contract_amount",
  collection_amount: "finance.collection",
  collection_rate: "finance.collection_rate",
  receivable: "finance.receivable",
  payment_terms: "operations.payment_terms",
  data_class: "project.data_class",
  source_system: "project.source_system",
  source_record_id: "project.source_record_id",
  created_at: "project.created_at",
  updated_at: "project.updated_at",
};

const LIFECYCLE_FIELD_MAPS: Record<string, Record<string, string>> = {
  risks: {
    id: "risk.id", project_id: "project.id", risk_code: "risk.code", category: "risk.category", risk_type: "risk.type",
    description: "risk.description", risk_description: "risk.description", probability: "risk.probability", impact: "risk.impact",
    score: "risk.score", risk_level: "risk.level", severity: "risk.severity", status: "risk.status", owner: "risk.owner",
    owner_user_id: "risk.owner", deadline: "risk.deadline", due_date: "risk.deadline", response_strategy: "risk.response",
    response_plan: "risk.response", next_action: "risk.next_action", created_at: "risk.created_at", updated_at: "risk.updated_at",
  },
  issues: {
    id: "delivery.issue", project_id: "project.id", issue_code: "delivery.issue", title: "delivery.issue", description: "delivery.issue",
    severity: "risk.severity", status: "delivery.status", owner: "delivery.owner", owner_user_id: "delivery.owner",
    due_date: "delivery.deadline", deadline: "delivery.deadline", resolution: "delivery.resolution", financial_impact: "finance.issue_impact",
    created_at: "delivery.created_at", updated_at: "delivery.updated_at",
  },
  changes: {
    id: "delivery.change", project_id: "project.id", change_code: "delivery.change", title: "delivery.change", description: "delivery.change",
    change_type: "delivery.change", status: "delivery.status", owner: "delivery.owner", owner_user_id: "delivery.owner",
    scope_impact: "delivery.scope_impact", schedule_impact: "delivery.schedule_impact", cost_impact: "finance.change_impact",
    decision: "decision.change", created_at: "delivery.created_at", updated_at: "delivery.updated_at",
  },
  actions: {
    id: "action.id", project_id: "project.id", title: "action.title", description: "action.description", owner: "action.owner",
    owner_user_id: "action.owner", reviewer_user_id: "action.reviewer", status: "action.status", priority: "action.priority",
    due_date: "action.deadline", acceptance_criteria: "action.acceptance", evidence: "evidence.action", effect_review: "evidence.effect_review",
    source_type: "action.source", source_id: "action.source", created_at: "action.created_at", updated_at: "action.updated_at",
  },
  governance: {
    id: "governance.id", canonical_project_id: "project.id", workflow_key: "governance.workflow", workflow_name: "governance.workflow",
    title: "governance.title", state: "governance.state", status: "governance.state", owner: "governance.owner",
    current_owner: "governance.owner", deadline: "governance.deadline", inputs: "governance.inputs", outputs: "governance.outputs",
    decision: "decision.governance", created_at: "governance.created_at", updated_at: "governance.updated_at",
  },
  signals: {
    id: "risk.signal", projectId: "project.id", signalType: "risk.signal", ruleVersion: "risk.signal", baselineVersion: "delivery.baseline",
    severity: "risk.severity", route: "risk.signal", status: "risk.status", title: "risk.signal", summary: "risk.signal",
    ownerUserId: "risk.owner", reviewerUserId: "risk.reviewer", dueAt: "risk.deadline", sourceType: "risk.source",
    sourceId: "risk.source", snapshotAt: "risk.snapshot", impact: "decision.financial_impact", createdAt: "risk.created_at", updatedAt: "risk.updated_at",
  },
  evidence: {
    id: "evidence.id", subject_type: "evidence.subject", subject_id: "evidence.subject", evidence_type: "evidence.type",
    source_type: "evidence.source", source_id: "evidence.source", source_url: "evidence.url", title: "evidence.title",
    version: "evidence.version", visibility: "evidence.visibility", valid_until: "evidence.validity", verified_at: "evidence.verified",
    created_at: "evidence.created_at",
  },
  lifecycleStates: {
    id: "delivery.lifecycle", object_type: "delivery.lifecycle", object_id: "delivery.lifecycle", status: "delivery.status",
    owner_user_id: "delivery.owner", due_at: "delivery.deadline", version: "delivery.baseline", metadata: "delivery.lifecycle",
    created_at: "delivery.created_at", updated_at: "delivery.updated_at",
  },
  lifecycleEvents: {
    id: "delivery.lifecycle", lifecycle_state_id: "delivery.lifecycle", object_type: "delivery.lifecycle", object_id: "delivery.lifecycle",
    event_type: "delivery.lifecycle", from_status: "delivery.status", to_status: "delivery.status", actor_business_role: "governance.actor",
    comment: "delivery.lifecycle", accepted_evidence_ids: "evidence.lifecycle", created_at: "delivery.updated_at",
  },
  corrections: {
    id: "risk.correction", target_type: "risk.correction", target_id: "risk.correction", correction_type: "risk.correction",
    status: "risk.status", reason_code: "risk.correction", reason_detail: "risk.correction", correction_owner_user_id: "risk.owner",
    due_at: "risk.deadline", resubmission_path: "governance.correction", created_at: "risk.created_at", updated_at: "risk.updated_at",
  },
  reportingSnapshots: {
    id: "governance.reporting", snapshot_type: "governance.reporting", period_start: "governance.reporting",
    period_end: "governance.reporting", status: "governance.state", metrics: "governance.reporting",
    exceptions: "risk.signal", narrative: "governance.reporting", source_snapshot_at: "governance.reporting",
    submitted_at: "governance.reporting", accepted_at: "governance.reporting", version: "governance.reporting",
  },
  metricObservations: {
    id: "governance.metric", metric_definition_id: "governance.metric", period_key: "governance.metric",
    current_value: "finance.metric", baseline_value: "finance.metric", previous_forecast_value: "finance.metric",
    latest_forecast_value: "finance.metric", currency: "finance.metric", unit: "finance.metric",
    source_type: "evidence.source", source_id: "evidence.source", source_status: "evidence.verified",
    observed_at: "governance.metric", freshness_status: "governance.metric", trust_status: "governance.metric",
    data_owner_user_id: "governance.owner", evidence_ids: "evidence.metric", risk_acceptance_note: "decision.rationale",
  },
  decisionBriefs: {
    id: "decision.id", status: "decision.status", title: "decision.title", decision_question: "decision.question",
    options: "decision.options", recommendation: "decision.recommendation", evidence: "evidence.decision",
    impact_summary: "decision.financial_impact", requested_decision_at: "decision.deadline", execution_due_at: "action.deadline",
    acceptance_criteria: "action.acceptance", submitted_at: "decision.submitted", decided_at: "decision.decided", updated_at: "decision.updated_at",
  },
  decisions: {
    id: "decision.id", brief_id: "decision.id", outcome: "decision.outcome", selected_option_key: "decision.outcome",
    rationale: "decision.rationale", conditions: "decision.conditions", effective_at: "decision.effective_at",
    decided_business_role: "decision.actor", decided_at: "decision.decided",
  },
  costs: {
    id: "finance.cost", period: "finance.cost", planned_value: "finance.planned_value", actual_cost: "finance.actual_cost",
    earned_value: "finance.earned_value", created_at: "finance.updated_at",
  },
  contracts: {
    id: "finance.contract", name: "finance.contract", party_a: "finance.contract_party", party_b: "finance.contract_party",
    total_amount: "finance.contract_amount", signed_date: "operations.contract_date", created_at: "finance.updated_at", updated_at: "finance.updated_at",
  },
  payments: {
    id: "finance.payment", contract_id: "finance.contract", name: "finance.payment", amount: "finance.receivable",
    due_date: "finance.payment_due", status: "finance.payment_status", actual_paid_date: "finance.collection", updated_at: "finance.updated_at",
  },
  benefitBaselines: {
    id: "finance.benefit", baseline_version: "finance.benefit", benefit_name: "finance.benefit", benefit_type: "finance.benefit",
    metric_key: "finance.benefit", baseline_value: "finance.benefit", target_value: "finance.benefit",
    forecast_value: "finance.margin_forecast", actual_value: "finance.benefit", currency: "finance.benefit", unit: "finance.benefit",
    benefit_owner_user_id: "action.owner", realization_due_date: "action.deadline", status: "finance.benefit_status", updated_at: "finance.updated_at",
  },
  benefitReviews: {
    id: "finance.benefit", benefit_baseline_id: "finance.benefit", review_gate: "governance.gate", snapshot_at: "finance.updated_at",
    forecast_value: "finance.margin_forecast", actual_value: "finance.benefit", variance: "finance.benefit",
    conclusion: "finance.benefit", review_outcome: "finance.benefit_status", action_required: "action.status",
    action_item_id: "action.id", status: "finance.benefit_status", evidence: "evidence.benefit", updated_at: "finance.updated_at",
  },
  closureAssessments: {
    id: "governance.closure", assessment_version: "governance.closure", fact_snapshot: "governance.closure",
    blockers: "risk.closure", ready: "governance.closure", status: "governance.state", review_note: "governance.closure",
    reviewed_at: "governance.closure", lifecycle_state_id: "delivery.lifecycle", created_at: "governance.created_at",
  },
  knowledgeCandidates: {
    id: "evidence.knowledge", page_id: "evidence.knowledge", title: "evidence.title", knowledge_type: "evidence.knowledge",
    status: "governance.state", owner_name: "governance.owner", confidentiality: "evidence.visibility",
    current_version_label: "evidence.version", applicable_scenarios: "evidence.knowledge", metadata: "evidence.knowledge", updated_at: "evidence.updated_at",
  },
  knowledgeReuse: {
    id: "evidence.knowledge", knowledge_item_id: "evidence.knowledge", source_project_id: "project.id",
    target_project_id: "project.id", recommendation_reason: "evidence.knowledge", applicability: "evidence.knowledge",
    status: "governance.state", rejection_reason: "evidence.knowledge", usage_note: "evidence.knowledge",
    outcome: "evidence.effect_review", effect_score: "evidence.effect_review", updated_at: "evidence.updated_at",
  },
  retrospectives: {
    id: "evidence.knowledge", status: "governance.state", objectives: "evidence.knowledge", outcomes: "evidence.knowledge",
    deviations: "risk.retrospective", root_causes: "risk.retrospective", key_decisions: "decision.rationale",
    action_effects: "evidence.effect_review", lessons: "evidence.knowledge", applicability_conditions: "evidence.knowledge",
    evidence_ids: "evidence.id", review_note: "governance.review", reviewed_at: "governance.updated_at", created_at: "evidence.created_at",
  },
  knowledgeRecommendations: {
    id: "evidence.knowledge", trigger_type: "risk.signal", trigger_source_id: "risk.source", scenario: "evidence.knowledge",
    criteria: "evidence.knowledge", recommendations: "evidence.knowledge", status: "governance.state", created_at: "evidence.created_at",
  },
};

function json(body: unknown, status = 200, requestId = crypto.randomUUID()) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store", "X-Request-Id": requestId },
  });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = crypto.randomUUID();
  const user = await getCurrentUser();
  if (!user) return json({ error: "UNAUTHORIZED", request_id: requestId }, 401, requestId);

  const { id: projectId } = await params;
  const assignmentsResult = await listBusinessRoleAssignments(user.id);
  if (assignmentsResult.status !== "succeeded") {
    return json({ error: "P17_STORAGE_NOT_CONFIGURED", detail: assignmentsResult.warning, request_id: requestId }, 503, requestId);
  }
  const url = new URL(request.url);
  const requestedRole = url.searchParams.get("role") as BusinessRole | null;
  if (!requestedRole) return json({ error: "BUSINESS_ROLE_REQUIRED", request_id: requestId }, 400, requestId);
  const accessScopeResult = await loadProjectAccessScope(projectId);
  if (accessScopeResult.status !== "succeeded" || !accessScopeResult.data) {
    const status = accessScopeResult.status === "not_found" ? 404 : accessScopeResult.status === "not_configured" ? 503 : 500;
    return json({ error: accessScopeResult.status.toUpperCase(), detail: accessScopeResult.warning, request_id: requestId }, status, requestId);
  }
  const accessScope = accessScopeResult.data;
  const resource = {
    orgId: accessScope.orgId,
    subjectScope: "project" as const,
    subjectId: projectId,
    ancestorSubjectIds: { portfolio: accessScope.portfolioIds, organization: [accessScope.orgId] },
  };
  const context = resolveBusinessContextForResource({
    user: { id: user.id, systemRole: user.role },
    assignments: assignmentsResult.data ?? [],
    requestedRole,
    resource,
  });
  if (!context || !canPerformBusinessAction(context, "project.read", resource)) {
    return json({ error: "PROJECT_SCOPE_FORBIDDEN", request_id: requestId }, 403, requestId);
  }

  const result = await loadProject360(projectId);
  if (result.status !== "succeeded" || !result.data) {
    const status = result.status === "not_found" ? 404 : result.status === "not_configured" ? 503 : 500;
    return json({ error: result.status.toUpperCase(), detail: result.warning, request_id: requestId }, status, requestId);
  }
  const expectedDataClass = url.searchParams.get("data_class");
  if (!expectedDataClass) return json({ error: "DATA_CLASS_REQUIRED", request_id: requestId }, 400, requestId);
  const actualDataClass = accessScope.dataClass;
  if (actualDataClass !== expectedDataClass) {
    return json({
      error: "DATA_CLASS_MISMATCH",
      detail: `当前上下文要求 ${expectedDataClass}，项目数据分类为 ${actualDataClass}。`,
      request_id: requestId,
    }, 409, requestId);
  }
  const authorization = await authorizeBusinessOperation({
    user,
    context,
    request: {
      objectType: "project",
      action: "read",
      objectState: String(result.data.project.status || "*"),
      projectLevel: String(result.data.project.project_level || "*"),
      decisionLevel: "project",
      amount: null,
    },
    resourceId: projectId,
    requestId,
  });
  if (authorization.status !== "succeeded") {
    return json({ error: "AUTHORIZATION_POLICY_UNAVAILABLE", detail: authorization.warning, request_id: requestId }, authorization.status === "not_configured" ? 503 : 500, requestId);
  }
  if (!authorization.decision.allowed) {
    return json({ error: "BUSINESS_OPERATION_FORBIDDEN", denial_code: authorization.decision.code, request_id: requestId }, 403, requestId);
  }

  const project = filterBusinessRecordFields(context, result.data.project, resource, PROJECT_FIELD_MAP);
  const lifecycle = Object.fromEntries(Object.entries({
    risks: result.data.risks,
    issues: result.data.issues,
    changes: result.data.changes,
    actions: result.data.actions,
    governance: result.data.governance,
    signals: result.data.signals,
    evidence: result.data.evidence,
    lifecycleStates: result.data.lifecycleStates,
    lifecycleEvents: result.data.lifecycleEvents,
    corrections: result.data.corrections,
    reportingSnapshots: result.data.reportingSnapshots,
    metricObservations: result.data.metricObservations,
    decisionBriefs: result.data.decisionBriefs,
    decisions: result.data.decisions,
    costs: result.data.costs,
    contracts: result.data.contracts,
    payments: result.data.payments,
    benefitBaselines: result.data.benefitBaselines,
    benefitReviews: result.data.benefitReviews,
    closureAssessments: result.data.closureAssessments,
    knowledgeCandidates: result.data.knowledgeCandidates,
    knowledgeReuse: result.data.knowledgeReuse,
    retrospectives: result.data.retrospectives,
    knowledgeRecommendations: result.data.knowledgeRecommendations,
  }).map(([key, rows]) => [key, rows.map(row => filterBusinessRecordFields(
    context,
    row as unknown as Record<string, unknown>,
    resource,
    LIFECYCLE_FIELD_MAPS[key] ?? {},
  ))]));
  await writeOperationAudit({
    user,
    action: "project_360_read",
    resourceType: "project",
    resourceId: projectId,
    status: "succeeded",
    summary: `读取项目360：${String(result.data.project.name || projectId)}`,
    detail: { businessRole: context.businessRole, dataClass: actualDataClass },
    requestId,
  });
  return json({
    request_id: requestId,
    context,
    data_class: actualDataClass,
    project,
    lifecycle,
    source: { type: "supabase", fallback_used: false },
  }, 200, requestId);
}
