import { getAuthSupabase, getCurrentUser } from "@/features/auth/server";
import {
  buildBusinessFinanceView,
  buildScenarioFactReadiness,
  buildStrategicBenefitCoverage,
  evaluatePortfolioScenario,
} from "@/features/operating-model/business-finance";
import {
  resolveBusinessContext,
  type BusinessContext,
  type BusinessRole,
  type SubjectScope,
} from "@/features/operating-model/context";
import {
  listBusinessRoleAssignments,
  loadContextProjectIdentityMappings,
  type ManagementSignalRecord,
} from "@/features/operating-model/persistence";
import { writeOperationAudit } from "@/features/security/repository";

export const runtime = "nodejs";

const ALLOWED = new Set<BusinessRole>([
  "operations",
  "pmo",
  "ceo",
  "finance",
  "business_owner",
  "sponsor",
]);
const BASELINE_CREATORS = new Set<BusinessRole>([
  "operations",
  "pmo",
  "business_owner",
]);
const HUMAN_REVIEWERS = new Set<BusinessRole>([
  "pmo",
  "finance",
  "business_owner",
]);
const REVIEW_SUBMITTERS = new Set<BusinessRole>([
  "operations",
  "pmo",
  "finance",
  "business_owner",
]);
const SCENARIO_CREATORS = new Set<BusinessRole>(["pmo", "finance", "ceo"]);
const DATA_CLASSES = new Set<DataClass>([
  "production",
  "sample",
  "test",
  "diagnostic",
  "unclassified",
]);
const BENEFIT_OWNER_ROLES = new Set<BusinessRole>([
  "operations",
  "business_owner",
  "pmo",
]);
const HANDOVER_OWNER_ROLES = new Set<BusinessRole>([
  "operations",
  "business_owner",
  "pmo",
]);
const ACTION_OWNER_ROLES = new Set<BusinessRole>([
  "operations",
  "business_owner",
  "finance",
  "pmo",
]);

type DataClass = ManagementSignalRecord["dataClass"];
type CurrentUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;
type FinanceScope = {
  user: CurrentUser;
  context: BusinessContext;
  role: BusinessRole;
  dataClass: DataClass;
  projectIds: string[];
};

function json(body: unknown, status = 200, requestId = crypto.randomUUID()) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store", "X-Request-Id": requestId },
  });
}

function text(value: unknown, field: string): string {
  const result = String(value ?? "").trim();
  if (!result) throw new Error(`${field}_REQUIRED`);
  return result;
}

function numberValue(value: unknown, field: string): number {
  const result = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(result)) throw new Error(`${field}_INVALID`);
  return result;
}

function optionalDate(value: unknown, field: string): string | null {
  if (!value) return null;
  const result = String(value);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(result) ||
    !Number.isFinite(new Date(`${result}T00:00:00Z`).getTime())
  )
    throw new Error(`${field}_INVALID`);
  return result;
}

function evidenceValue(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (typeof item === "string" && item.trim())
      return [{ type: "note", content: item.trim() }];
    if (item && typeof item === "object" && !Array.isArray(item))
      return [item as Record<string, unknown>];
    return [];
  });
}

function requireRole(
  scope: FinanceScope,
  roles: ReadonlySet<BusinessRole>,
  error: string,
): Response | null {
  return roles.has(scope.role) ? null : json({ error }, 403);
}

async function contextFor(
  request: Request,
): Promise<FinanceScope | { error: string; detail?: string; status: number }> {
  const user = await getCurrentUser();
  if (!user) return { error: "UNAUTHORIZED", status: 401 };
  const url = new URL(request.url);
  const role = (url.searchParams.get("role") || "") as BusinessRole;
  const orgId = url.searchParams.get("org_id") || "";
  const subjectScope = (url.searchParams.get("subject_scope") ||
    "") as SubjectScope;
  const subjectId = url.searchParams.get("subject_id") || "";
  const dataClass = (url.searchParams.get("data_class") ||
    "production") as DataClass;
  if (
    !role ||
    !orgId ||
    !subjectScope ||
    !subjectId ||
    !ALLOWED.has(role) ||
    !DATA_CLASSES.has(dataClass)
  )
    return { error: "BUSINESS_FINANCE_CONTEXT_REQUIRED", status: 403 };
  const assignments = await listBusinessRoleAssignments(user.id);
  if (assignments.status !== "succeeded")
    return {
      error: "P17_STORAGE_NOT_CONFIGURED",
      detail: assignments.warning,
      status: 503,
    };
  const context = resolveBusinessContext({
    user: { id: user.id, systemRole: user.role },
    assignments: assignments.data ?? [],
    requestedRole: role,
    requestedOrgId: orgId,
    requestedSubjectScope: subjectScope,
    requestedSubjectId: subjectId,
  });
  if (!context) return { error: "BUSINESS_CONTEXT_FORBIDDEN", status: 403 };
  const mappings = await loadContextProjectIdentityMappings({
    context,
    dataClass,
  });
  if (mappings.status !== "succeeded")
    return {
      error: "PROJECT_SCOPE_MAPPING_FAILED",
      detail: mappings.warning,
      status: mappings.status === "not_configured" ? 503 : 500,
    };
  return {
    user,
    context,
    role,
    dataClass,
    projectIds: [
      ...new Set((mappings.data ?? []).map((item) => item.projectId)),
    ],
  };
}

async function loadAssigneeOptions(scope: FinanceScope) {
  const supabase = getAuthSupabase();
  const roles = await supabase
    .from("user_business_roles")
    .select("user_id,business_role,subject_scope,subject_id")
    .eq("org_id", scope.context.orgId)
    .eq("status", "active")
    .in("business_role", ["operations", "pmo", "finance", "business_owner"]);
  if (roles.error) throw roles.error;
  const visible = (roles.data ?? []).filter(
    (item) =>
      (item.subject_scope === "organization" &&
        item.subject_id === scope.context.orgId) ||
      (item.subject_scope === "portfolio" &&
        (scope.context.subjectScope === "organization" ||
          (scope.context.subjectScope === "portfolio" &&
            item.subject_id === scope.context.subjectId))) ||
      (item.subject_scope === "project" &&
        scope.projectIds.includes(String(item.subject_id))),
  );
  const userIds = [
    ...new Set(visible.map((item) => String(item.user_id)).filter(Boolean)),
  ];
  const users = userIds.length
    ? await supabase.from("app_users").select("id,name").in("id", userIds)
    : { data: [], error: null };
  if (users.error) throw users.error;
  const nameById = new Map(
    (users.data ?? []).map((item) => [
      String(item.id),
      String(item.name || "未命名用户"),
    ]),
  );
  return visible
    .map((item) => ({
      user_id: item.user_id,
      name: nameById.get(String(item.user_id)) || "未命名用户",
      business_role: item.business_role,
    }))
    .filter(
      (item, index, all) =>
        all.findIndex(
          (candidate) =>
            candidate.user_id === item.user_id &&
            candidate.business_role === item.business_role,
        ) === index,
    );
}

async function assertAssignableUser(
  scope: FinanceScope,
  userId: string,
  allowedRoles: ReadonlySet<BusinessRole>,
) {
  const options = await loadAssigneeOptions(scope);
  const matches = options.filter((item) => String(item.user_id) === userId);
  if (matches.length === 0) throw new Error("ASSIGNEE_OUTSIDE_CONTEXT");
  if (
    !matches.some((item) =>
      allowedRoles.has(item.business_role as BusinessRole),
    )
  )
    throw new Error("ASSIGNEE_ROLE_FORBIDDEN");
}

async function loadView(scope: FinanceScope) {
  const supabase = getAuthSupabase();
  const ids = scope.projectIds;
  const emptyView = buildBusinessFinanceView({
    projects: [],
    costs: [],
    payments: [],
    benefits: [],
  });
  const scenariosQuery =
    scope.context.subjectScope === "project"
      ? Promise.resolve({ data: [], error: null })
      : (() => {
          let query = supabase
            .from("portfolio_scenarios")
            .select("*")
            .eq("org_id", scope.context.orgId)
            .eq("data_class", scope.dataClass);
          if (scope.context.subjectScope === "portfolio")
            query = query.eq("portfolio_id", scope.context.subjectId);
          return query.order("created_at", { ascending: false }).limit(100);
        })();
  if (ids.length === 0) {
    const [scenarios, assigneeOptions] = await Promise.all([
      scenariosQuery,
      loadAssigneeOptions(scope),
    ]);
    if (scenarios.error) throw scenarios.error;
    const scenarioIds = (scenarios.data ?? []).map((item) => String(item.id));
    const impactPackages = scenarioIds.length
      ? await supabase
          .from("scenario_impact_packages")
          .select("*")
          .in("scenario_id", scenarioIds)
          .eq("org_id", scope.context.orgId)
          .eq("data_class", scope.dataClass)
      : { data: [], error: null };
    if (impactPackages.error) throw impactPackages.error;
    const scenarioActionIds = (impactPackages.data ?? [])
      .map((item) => String(item.action_item_id || ""))
      .filter(Boolean);
    const scenarioActions = scenarioActionIds.length
      ? await supabase
          .from("unified_action_items")
          .select(
            "id,source_type,source_id,title,owner_user_id,owner,due_date,status,priority,acceptance_criteria,evidence,reviewer_user_id,close_evidence,updated_at",
          )
          .in("id", scenarioActionIds)
          .eq("org_id", scope.context.orgId)
          .eq("data_class", scope.dataClass)
          .eq("subject_scope", scope.context.subjectScope)
          .eq("subject_id", scope.context.subjectId)
      : { data: [], error: null };
    if (scenarioActions.error) throw scenarioActions.error;
    return {
      view: emptyView,
      benefits: [],
      baselineDecisions: [],
      reviews: [],
      reviewDecisions: [],
      benefitActions: [],
      handovers: [],
      handoverActions: [],
      scenarios: scenarios.data ?? [],
      impactPackages: impactPackages.data ?? [],
      scenarioActions: scenarioActions.data ?? [],
      assigneeOptions,
      benefitCoverage: buildStrategicBenefitCoverage({
        projects: [],
        baselines: [],
      }),
      scenarioReadiness: buildScenarioFactReadiness([]),
    };
  }
  const [
    projects,
    costs,
    contracts,
    benefits,
    reviews,
    scenarios,
    assigneeOptions,
  ] = await Promise.all([
    supabase
      .from("projects")
      .select("id,name,contract_amount,progress,project_level")
      .in("id", ids)
      .eq("org_id", scope.context.orgId)
      .eq("data_class", scope.dataClass),
    supabase
      .from("cost_records")
      .select("project_id,planned_value,actual_cost,earned_value")
      .in("project_id", ids),
    supabase
      .from("contracts")
      .select("id,project_id,total_amount")
      .in("project_id", ids),
    supabase
      .from("project_benefit_baselines")
      .select("*")
      .in("project_id", ids)
      .eq("org_id", scope.context.orgId)
      .eq("data_class", scope.dataClass)
      .order("updated_at", { ascending: false }),
    supabase
      .from("benefit_realization_reviews")
      .select("*")
      .in("project_id", ids)
      .eq("org_id", scope.context.orgId)
      .eq("data_class", scope.dataClass)
      .order("snapshot_at", { ascending: false })
      .limit(200),
    scenariosQuery,
    loadAssigneeOptions(scope),
  ]);
  const firstError = [
    projects,
    costs,
    contracts,
    benefits,
    reviews,
    scenarios,
  ].find((item) => item.error)?.error;
  if (firstError) throw firstError;
  const contractIds = (contracts.data ?? []).map((item) => String(item.id));
  const baselineIds = (benefits.data ?? []).map((item) => String(item.id));
  const reviewIds = (reviews.data ?? []).map((item) => String(item.id));
  const scenarioIds = (scenarios.data ?? []).map((item) => String(item.id));
  const [
    payments,
    baselineDecisions,
    reviewDecisions,
    handovers,
    impactPackages,
  ] = await Promise.all([
    contractIds.length
      ? supabase
          .from("payment_milestones")
          .select("contract_id,amount,due_date,status")
          .in("contract_id", contractIds)
      : Promise.resolve({ data: [], error: null }),
    baselineIds.length
      ? supabase
          .from("benefit_baseline_decisions")
          .select("*")
          .in("benefit_baseline_id", baselineIds)
      : Promise.resolve({ data: [], error: null }),
    reviewIds.length
      ? supabase
          .from("benefit_review_decisions")
          .select("*")
          .in("benefit_review_id", reviewIds)
      : Promise.resolve({ data: [], error: null }),
    reviewIds.length
      ? supabase
          .from("benefit_realization_handovers")
          .select("*")
          .in("exit_review_id", reviewIds)
          .eq("org_id", scope.context.orgId)
          .eq("data_class", scope.dataClass)
          .in("project_id", ids)
      : Promise.resolve({ data: [], error: null }),
    scenarioIds.length
      ? supabase
          .from("scenario_impact_packages")
          .select("*")
          .in("scenario_id", scenarioIds)
          .eq("org_id", scope.context.orgId)
          .eq("data_class", scope.dataClass)
      : Promise.resolve({ data: [], error: null }),
  ]);
  const relatedError = [
    payments,
    baselineDecisions,
    reviewDecisions,
    handovers,
    impactPackages,
  ].find((item) => item.error)?.error;
  if (relatedError) throw relatedError;
  const benefitActionIds = (reviews.data ?? [])
    .map((item) => String(item.action_item_id || ""))
    .filter(Boolean);
  const handoverActionIds = (handovers.data ?? [])
    .map((item) => String(item.action_item_id || ""))
    .filter(Boolean);
  const scenarioActionIds = (impactPackages.data ?? [])
    .map((item) => String(item.action_item_id || ""))
    .filter(Boolean);
  const actionIds = [
    ...new Set([
      ...benefitActionIds,
      ...handoverActionIds,
      ...scenarioActionIds,
    ]),
  ];
  const actionResult = actionIds.length
    ? await supabase
        .from("unified_action_items")
        .select(
          "id,source_type,source_id,title,owner_user_id,owner,due_date,status,priority,acceptance_criteria,evidence,reviewer_user_id,close_evidence,updated_at",
        )
        .in("id", actionIds)
        .eq("org_id", scope.context.orgId)
        .eq("data_class", scope.dataClass)
    : { data: [], error: null };
  if (actionResult.error) throw actionResult.error;
  const actions = actionResult.data ?? [];
  const projectByContract = new Map(
    (contracts.data ?? []).map((item) => [
      String(item.id),
      String(item.project_id),
    ]),
  );
  const contractAmounts = new Map<string, number>();
  for (const item of contracts.data ?? []) {
    const projectId = String(item.project_id);
    contractAmounts.set(
      projectId,
      (contractAmounts.get(projectId) || 0) + Number(item.total_amount || 0),
    );
  }
  const costProjectIds = new Set(
    (costs.data ?? []).map((item) => String(item.project_id)),
  );
  const paymentProjectIds = new Set(
    (payments.data ?? [])
      .map((item) => projectByContract.get(String(item.contract_id)) || "")
      .filter(Boolean),
  );
  const projectRows = (projects.data ?? []).map((item) => {
    const projectId = String(item.id);
    const contractAmount =
      item.contract_amount == null
        ? contractAmounts.get(projectId)
        : Number(item.contract_amount);
    return {
      id: item.id,
      name: item.name,
      projectLevel: item.project_level,
      contractAmount: contractAmount ?? 0,
      progress: Number(item.progress || 0),
    };
  });
  const baselineRows = benefits.data ?? [];
  return {
    view: buildBusinessFinanceView({
      projects: projectRows,
      costs: (costs.data ?? []).map((item) => ({
        projectId: item.project_id,
        plannedValue: Number(item.planned_value || 0),
        actualCost: Number(item.actual_cost || 0),
        earnedValue: Number(item.earned_value || 0),
      })),
      payments: (payments.data ?? []).map((item) => ({
        projectId: projectByContract.get(String(item.contract_id)) || "",
        amount: Number(item.amount || 0),
        dueDate: item.due_date,
        status: item.status,
      })),
      benefits: (benefits.data ?? []).map((item) => ({
        projectId: item.project_id,
        targetValue: Number(item.target_value || 0),
        forecastValue: Number(item.forecast_value || 0),
        actualValue: Number(item.actual_value || 0),
      })),
    }),
    benefits: baselineRows,
    baselineDecisions: baselineDecisions.data ?? [],
    reviews: reviews.data ?? [],
    reviewDecisions: reviewDecisions.data ?? [],
    benefitActions: actions.filter((item) => item.source_type === "benefit"),
    handovers: handovers.data ?? [],
    handoverActions: actions.filter(
      (item) => item.source_type === "benefit_handover",
    ),
    scenarios: scenarios.data ?? [],
    impactPackages: impactPackages.data ?? [],
    scenarioActions: actions.filter((item) => item.source_type === "scenario"),
    assigneeOptions,
    benefitCoverage: buildStrategicBenefitCoverage({
      projects: projectRows.map((item) => ({
        id: String(item.id),
        name: String(item.name),
        projectLevel: item.projectLevel ? String(item.projectLevel) : null,
      })),
      baselines: baselineRows.map((item) => ({
        projectId: String(item.project_id),
        ownerUserId: item.benefit_owner_user_id
          ? String(item.benefit_owner_user_id)
          : null,
        g6ReviewDueDate: item.g6_review_due_date
          ? String(item.g6_review_due_date)
          : null,
        exitCriteria: item.exit_criteria ? String(item.exit_criteria) : null,
        status: item.status ? String(item.status) : undefined,
      })),
    }),
    scenarioReadiness: buildScenarioFactReadiness(
      (projects.data ?? []).map((item) => {
        const projectId = String(item.id);
        return {
          projectId,
          projectName: String(item.name),
          hasContractFact:
            item.contract_amount != null || contractAmounts.has(projectId),
          hasCostFact: costProjectIds.has(projectId),
          hasPaymentSchedule: paymentProjectIds.has(projectId),
        };
      }),
    ),
  };
}

async function scopedBaseline(scope: FinanceScope, id: string) {
  if (!id || !scope.projectIds.length) return null;
  const result = await getAuthSupabase()
    .from("project_benefit_baselines")
    .select("id,project_id,status,target_value,g6_reviewed_at")
    .eq("id", id)
    .eq("org_id", scope.context.orgId)
    .eq("data_class", scope.dataClass)
    .in("project_id", scope.projectIds)
    .maybeSingle();
  if (result.error) throw result.error;
  return result.data;
}

async function scopedHandover(scope: FinanceScope, id: string) {
  if (!id || !scope.projectIds.length) return null;
  const result = await getAuthSupabase()
    .from("benefit_realization_handovers")
    .select(
      "id,project_id,status,action_item_id,to_owner_user_id,exit_review_id",
    )
    .eq("id", id)
    .eq("org_id", scope.context.orgId)
    .eq("data_class", scope.dataClass)
    .in("project_id", scope.projectIds)
    .maybeSingle();
  if (result.error) throw result.error;
  return result.data;
}

async function scopedReview(scope: FinanceScope, id: string) {
  if (!id || !scope.projectIds.length) return null;
  const result = await getAuthSupabase()
    .from("benefit_realization_reviews")
    .select("id,project_id,status,action_item_id")
    .eq("id", id)
    .eq("org_id", scope.context.orgId)
    .eq("data_class", scope.dataClass)
    .in("project_id", scope.projectIds)
    .maybeSingle();
  if (result.error) throw result.error;
  return result.data;
}

async function scopedScenario(scope: FinanceScope, id: string) {
  if (!id || scope.context.subjectScope === "project") return null;
  let query = getAuthSupabase()
    .from("portfolio_scenarios")
    .select("id,status,portfolio_id")
    .eq("id", id)
    .eq("org_id", scope.context.orgId)
    .eq("data_class", scope.dataClass);
  if (scope.context.subjectScope === "portfolio")
    query = query.eq("portfolio_id", scope.context.subjectId);
  const result = await query.maybeSingle();
  if (result.error) throw result.error;
  return result.data;
}

async function scopedScenarioAction(scope: FinanceScope, id: string) {
  if (!id || scope.context.subjectScope === "project") return null;
  const result = await getAuthSupabase()
    .from("unified_action_items")
    .select("id,source_id,status,owner_user_id")
    .eq("id", id)
    .eq("source_type", "scenario")
    .eq("org_id", scope.context.orgId)
    .eq("data_class", scope.dataClass)
    .eq("subject_scope", scope.context.subjectScope)
    .eq("subject_id", scope.context.subjectId)
    .maybeSingle();
  if (result.error) throw result.error;
  if (
    !result.data ||
    !(await scopedScenario(scope, String(result.data.source_id)))
  )
    return null;
  return result.data;
}

export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  const scope = await contextFor(request);
  if ("error" in scope)
    return json(
      { error: scope.error, detail: scope.detail, request_id: requestId },
      scope.status,
      requestId,
    );
  try {
    const data = await loadView(scope);
    return json(
      {
        status: "succeeded",
        context: scope.context,
        data_class: scope.dataClass,
        source: { type: "supabase", fallback_used: false },
        ...data,
        request_id: requestId,
      },
      200,
      requestId,
    );
  } catch (error) {
    return json(
      {
        error: "BUSINESS_FINANCE_DATA_UNAVAILABLE",
        detail: error instanceof Error ? error.message : "unknown",
        request_id: requestId,
      },
      503,
      requestId,
    );
  }
}

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  const scope = await contextFor(request);
  if ("error" in scope)
    return json(
      { error: scope.error, detail: scope.detail, request_id: requestId },
      scope.status,
      requestId,
    );
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json(
      { error: "INVALID_JSON", request_id: requestId },
      400,
      requestId,
    );
  }
  const operation = String(body.operation || "");
  const supabase = getAuthSupabase();
  try {
    let resourceId = "";
    let result: unknown = null;
    if (operation === "create_benefit_baseline") {
      const forbidden = requireRole(
        scope,
        BASELINE_CREATORS,
        "BENEFIT_BASELINE_CREATE_ROLE_FORBIDDEN",
      );
      if (forbidden) return forbidden;
      const projectId = text(body.project_id, "PROJECT_ID");
      if (!scope.projectIds.includes(projectId))
        return json(
          { error: "PROJECT_OUTSIDE_CONTEXT", request_id: requestId },
          403,
          requestId,
        );
      const targetValue = numberValue(body.target_value, "TARGET_VALUE");
      if (targetValue <= 0) throw new Error("TARGET_VALUE_MUST_BE_POSITIVE");
      const dueDate = optionalDate(
        body.realization_due_date,
        "REALIZATION_DUE_DATE",
      );
      if (!dueDate) throw new Error("REALIZATION_DUE_DATE_REQUIRED");
      const g6ReviewDueDate = optionalDate(
        body.g6_review_due_date,
        "G6_REVIEW_DUE_DATE",
      );
      if (!g6ReviewDueDate) throw new Error("G6_REVIEW_DUE_DATE_REQUIRED");
      const ownerId = text(
        body.benefit_owner_user_id || scope.user.id,
        "BENEFIT_OWNER_USER_ID",
      );
      await assertAssignableUser(scope, ownerId, BENEFIT_OWNER_ROLES);
      const rpc = await supabase.rpc("create_benefit_baseline_tx", {
        p_org_id: scope.context.orgId,
        p_project_id: projectId,
        p_data_class: scope.dataClass,
        p_baseline_version: text(
          body.baseline_version || "v1",
          "BASELINE_VERSION",
        ),
        p_benefit_name: text(body.benefit_name, "BENEFIT_NAME"),
        p_benefit_type: body.benefit_type || "strategic",
        p_metric_key: text(body.metric_key, "METRIC_KEY"),
        p_baseline_value: numberValue(
          body.baseline_value ?? 0,
          "BASELINE_VALUE",
        ),
        p_target_value: targetValue,
        p_forecast_value: numberValue(
          body.forecast_value ?? 0,
          "FORECAST_VALUE",
        ),
        p_actual_value: numberValue(body.actual_value ?? 0, "ACTUAL_VALUE"),
        p_currency: body.currency || "CNY",
        p_unit: body.unit || "元",
        p_benefit_owner_user_id: ownerId,
        p_realization_due_date: dueDate,
        p_g6_review_due_date: g6ReviewDueDate,
        p_exit_criteria: text(body.exit_criteria, "EXIT_CRITERIA"),
        p_exit_threshold:
          body.exit_threshold === "" || body.exit_threshold == null
            ? null
            : numberValue(body.exit_threshold, "EXIT_THRESHOLD"),
        p_actor_user_id: scope.user.id,
        p_actor_business_role: scope.role,
        p_request_id: requestId,
      });
      if (rpc.error) throw rpc.error;
      const payload = rpc.data as { id?: string } | null;
      resourceId = String(payload?.id || projectId);
      result = rpc.data;
    } else if (operation === "review_benefit_baseline") {
      const forbidden = requireRole(
        scope,
        HUMAN_REVIEWERS,
        "BENEFIT_REVIEW_ROLE_FORBIDDEN",
      );
      if (forbidden) return forbidden;
      const baselineId = text(body.baseline_id, "BASELINE_ID");
      const baseline = await scopedBaseline(scope, baselineId);
      if (!baseline)
        return json(
          { error: "BENEFIT_BASELINE_OUTSIDE_CONTEXT", request_id: requestId },
          403,
          requestId,
        );
      const rpc = await supabase.rpc("decide_benefit_baseline_tx", {
        p_baseline_id: baselineId,
        p_org_id: scope.context.orgId,
        p_project_id: baseline.project_id,
        p_data_class: scope.dataClass,
        p_decision: text(body.decision, "DECISION"),
        p_comment: text(body.comment, "COMMENT"),
        p_actor_user_id: scope.user.id,
        p_actor_business_role: scope.role,
        p_request_id: requestId,
      });
      if (rpc.error) throw rpc.error;
      resourceId = baselineId;
      result = rpc.data;
    } else if (operation === "start_benefit_tracking") {
      const forbidden = requireRole(
        scope,
        new Set<BusinessRole>(["pmo", "business_owner"]),
        "BENEFIT_TRACKING_ROLE_FORBIDDEN",
      );
      if (forbidden) return forbidden;
      const baselineId = text(body.baseline_id, "BASELINE_ID");
      const baseline = await scopedBaseline(scope, baselineId);
      if (!baseline)
        return json(
          { error: "BENEFIT_BASELINE_OUTSIDE_CONTEXT", request_id: requestId },
          403,
          requestId,
        );
      const rpc = await supabase.rpc("start_benefit_tracking_tx", {
        p_baseline_id: baselineId,
        p_org_id: scope.context.orgId,
        p_project_id: baseline.project_id,
        p_data_class: scope.dataClass,
        p_actor_user_id: scope.user.id,
        p_actor_business_role: scope.role,
        p_request_id: requestId,
      });
      if (rpc.error) throw rpc.error;
      resourceId = baselineId;
      result = rpc.data;
    } else if (operation === "submit_benefit_review") {
      const forbidden = requireRole(
        scope,
        REVIEW_SUBMITTERS,
        "BENEFIT_SUBMIT_ROLE_FORBIDDEN",
      );
      if (forbidden) return forbidden;
      const baselineId = text(body.baseline_id, "BASELINE_ID");
      const baseline = await scopedBaseline(scope, baselineId);
      if (!baseline)
        return json(
          { error: "BENEFIT_BASELINE_OUTSIDE_CONTEXT", request_id: requestId },
          403,
          requestId,
        );
      const actionOwnerId = String(body.action_owner_user_id || "").trim();
      if (actionOwnerId)
        await assertAssignableUser(scope, actionOwnerId, ACTION_OWNER_ROLES);
      const handoverOwnerId = String(body.handover_owner_user_id || "").trim();
      if (handoverOwnerId)
        await assertAssignableUser(
          scope,
          handoverOwnerId,
          HANDOVER_OWNER_ROLES,
        );
      const rpc = await supabase.rpc("submit_benefit_review_tx", {
        p_baseline_id: baselineId,
        p_org_id: scope.context.orgId,
        p_project_id: baseline.project_id,
        p_data_class: scope.dataClass,
        p_review_gate: text(body.review_gate, "REVIEW_GATE"),
        p_snapshot_at: body.snapshot_at || new Date().toISOString(),
        p_forecast_value: numberValue(body.forecast_value, "FORECAST_VALUE"),
        p_actual_value: numberValue(body.actual_value, "ACTUAL_VALUE"),
        p_conclusion: text(body.conclusion, "CONCLUSION"),
        p_evidence: evidenceValue(body.evidence),
        p_action_owner_user_id: actionOwnerId || null,
        p_action_due_date: optionalDate(
          body.action_due_date,
          "ACTION_DUE_DATE",
        ),
        p_action_acceptance_criteria:
          String(body.action_acceptance_criteria || "").trim() || null,
        p_handover_owner_user_id: handoverOwnerId || null,
        p_handover_due_date: optionalDate(
          body.handover_due_date,
          "HANDOVER_DUE_DATE",
        ),
        p_handover_acceptance_criteria:
          String(body.handover_acceptance_criteria || "").trim() || null,
        p_actor_user_id: scope.user.id,
        p_actor_business_role: scope.role,
        p_request_id: requestId,
      });
      if (rpc.error) throw rpc.error;
      const payload = rpc.data as { review?: { id?: string } } | null;
      resourceId = String(payload?.review?.id || baselineId);
      result = rpc.data;
    } else if (operation === "decide_benefit_review") {
      const forbidden = requireRole(
        scope,
        HUMAN_REVIEWERS,
        "BENEFIT_REVIEW_ROLE_FORBIDDEN",
      );
      if (forbidden) return forbidden;
      const reviewId = text(body.review_id, "REVIEW_ID");
      const review = await scopedReview(scope, reviewId);
      if (!review)
        return json(
          { error: "BENEFIT_REVIEW_OUTSIDE_CONTEXT", request_id: requestId },
          403,
          requestId,
        );
      const rpc = await supabase.rpc("decide_benefit_review_tx", {
        p_review_id: reviewId,
        p_org_id: scope.context.orgId,
        p_project_id: review.project_id,
        p_data_class: scope.dataClass,
        p_decision: text(body.decision, "DECISION"),
        p_comment: text(body.comment, "COMMENT"),
        p_actor_user_id: scope.user.id,
        p_actor_business_role: scope.role,
        p_request_id: requestId,
      });
      if (rpc.error) throw rpc.error;
      resourceId = reviewId;
      result = rpc.data;
    } else if (operation === "transition_benefit_action") {
      const actionId = text(body.action_id, "ACTION_ID");
      const action = await supabase
        .from("unified_action_items")
        .select("id,project_id,source_id")
        .eq("id", actionId)
        .eq("source_type", "benefit")
        .eq("org_id", scope.context.orgId)
        .eq("data_class", scope.dataClass)
        .in("project_id", scope.projectIds)
        .maybeSingle();
      if (action.error) throw action.error;
      if (
        !action.data ||
        !(await scopedReview(scope, String(action.data.source_id)))
      )
        return json(
          { error: "BENEFIT_ACTION_OUTSIDE_CONTEXT", request_id: requestId },
          403,
          requestId,
        );
      const rpc = await supabase.rpc("transition_benefit_action_tx", {
        p_action_id: actionId,
        p_org_id: scope.context.orgId,
        p_project_id: action.data.project_id,
        p_data_class: scope.dataClass,
        p_transition: text(body.transition, "TRANSITION"),
        p_comment: String(body.comment || "").trim(),
        p_evidence: evidenceValue(body.evidence),
        p_actor_user_id: scope.user.id,
        p_actor_business_role: scope.role,
        p_request_id: requestId,
      });
      if (rpc.error) throw rpc.error;
      resourceId = actionId;
      result = rpc.data;
    } else if (operation === "transition_benefit_handover") {
      const handoverId = text(body.handover_id, "HANDOVER_ID");
      const handover = await scopedHandover(scope, handoverId);
      if (!handover)
        return json(
          { error: "BENEFIT_HANDOVER_OUTSIDE_CONTEXT", request_id: requestId },
          403,
          requestId,
        );
      const rpc = await supabase.rpc("transition_benefit_handover_tx", {
        p_handover_id: handoverId,
        p_org_id: scope.context.orgId,
        p_project_id: handover.project_id,
        p_data_class: scope.dataClass,
        p_transition: text(body.transition, "TRANSITION"),
        p_comment: String(body.comment || "").trim(),
        p_evidence: evidenceValue(body.evidence),
        p_actor_user_id: scope.user.id,
        p_actor_business_role: scope.role,
        p_request_id: requestId,
      });
      if (rpc.error) throw rpc.error;
      resourceId = handoverId;
      result = rpc.data;
    } else if (operation === "create_scenario") {
      const forbidden = requireRole(
        scope,
        SCENARIO_CREATORS,
        "SCENARIO_ROLE_FORBIDDEN",
      );
      if (forbidden) return forbidden;
      if (scope.context.subjectScope === "project")
        return json(
          {
            error: "PORTFOLIO_OR_ORGANIZATION_CONTEXT_REQUIRED",
            request_id: requestId,
          },
          403,
          requestId,
        );
      const data = await loadView(scope);
      if (!data.scenarioReadiness.ready)
        throw new Error(
          `SCENARIO_BASELINE_FACTS_REQUIRED:${data.scenarioReadiness.gaps.map((item) => `${item.projectName}[${item.missing.join("、")}]`).join("；")}`,
        );
      const assumptions = {
        delayDays: numberValue(body.delay_days ?? 0, "DELAY_DAYS"),
        addedMonthlyCost: numberValue(
          body.added_monthly_cost ?? 0,
          "ADDED_MONTHLY_COST",
        ),
        scopeRevenueChange: numberValue(
          body.scope_revenue_change ?? 0,
          "SCOPE_REVENUE_CHANGE",
        ),
        paused: body.paused === true,
      };
      const results = evaluatePortfolioScenario({
        baselineRevenue: data.view.summary.contractAmount,
        baselineCost: data.view.summary.actualCost,
        baselineCash90Days: data.view.summary.cashNext90Days,
        ...assumptions,
      });
      const saved = await supabase
        .from("portfolio_scenarios")
        .insert({
          org_id: scope.context.orgId,
          portfolio_id:
            scope.context.subjectScope === "portfolio"
              ? scope.context.subjectId
              : null,
          name: text(body.name, "SCENARIO_NAME"),
          scenario_type: body.scenario_type || "combined",
          baseline_snapshot: data.view.summary,
          assumptions,
          results,
          status: "draft",
          owner_user_id: scope.user.id,
          data_class: scope.dataClass,
        })
        .select("id")
        .single();
      if (saved.error) throw saved.error;
      resourceId = String(saved.data.id);
      result = { scenario: saved.data, results };
    } else if (operation === "confirm_scenario") {
      if (scope.role !== "ceo")
        return json(
          { error: "CEO_CONTEXT_REQUIRED", request_id: requestId },
          403,
          requestId,
        );
      if (scope.context.subjectScope === "project")
        return json(
          {
            error: "PORTFOLIO_OR_ORGANIZATION_CONTEXT_REQUIRED",
            request_id: requestId,
          },
          403,
          requestId,
        );
      const scenarioId = text(body.scenario_id, "SCENARIO_ID");
      if (!(await scopedScenario(scope, scenarioId)))
        return json(
          { error: "SCENARIO_OUTSIDE_CONTEXT", request_id: requestId },
          403,
          requestId,
        );
      const dueDate = optionalDate(body.impact_due_date, "IMPACT_DUE_DATE");
      if (!dueDate) throw new Error("IMPACT_DUE_DATE_REQUIRED");
      const impactOwnerId = text(
        body.impact_owner_user_id,
        "IMPACT_OWNER_USER_ID",
      );
      await assertAssignableUser(scope, impactOwnerId, ACTION_OWNER_ROLES);
      const rpc = await supabase.rpc("confirm_portfolio_scenario_tx", {
        p_scenario_id: scenarioId,
        p_org_id: scope.context.orgId,
        p_subject_scope: scope.context.subjectScope,
        p_subject_id: scope.context.subjectId,
        p_data_class: scope.dataClass,
        p_impact_owner_user_id: impactOwnerId,
        p_impact_due_date: dueDate,
        p_acceptance_criteria: text(
          body.acceptance_criteria,
          "ACCEPTANCE_CRITERIA",
        ),
        p_impact_summary: text(body.impact_summary, "IMPACT_SUMMARY"),
        p_actor_user_id: scope.user.id,
        p_actor_business_role: scope.role,
        p_request_id: requestId,
      });
      if (rpc.error) throw rpc.error;
      resourceId = scenarioId;
      result = rpc.data;
    } else if (operation === "transition_scenario_impact_action") {
      const actionId = text(body.action_id, "ACTION_ID");
      if (!(await scopedScenarioAction(scope, actionId)))
        return json(
          { error: "SCENARIO_ACTION_OUTSIDE_CONTEXT", request_id: requestId },
          403,
          requestId,
        );
      const rpc = await supabase.rpc("transition_scenario_impact_action_tx", {
        p_action_id: actionId,
        p_org_id: scope.context.orgId,
        p_subject_scope: scope.context.subjectScope,
        p_subject_id: scope.context.subjectId,
        p_data_class: scope.dataClass,
        p_transition: text(body.transition, "TRANSITION"),
        p_comment: String(body.comment || "").trim(),
        p_evidence: evidenceValue(body.evidence),
        p_actor_user_id: scope.user.id,
        p_actor_business_role: scope.role,
        p_request_id: requestId,
      });
      if (rpc.error) throw rpc.error;
      resourceId = actionId;
      result = rpc.data;
    } else
      return json(
        { error: "UNSUPPORTED_OPERATION", request_id: requestId },
        400,
        requestId,
      );

    await writeOperationAudit({
      user: scope.user,
      action: `business_finance_${operation}`,
      resourceType: "business_finance",
      resourceId,
      status: "succeeded",
      severity: [
        "confirm_scenario",
        "transition_scenario_impact_action",
        "decide_benefit_review",
        "review_benefit_baseline",
        "transition_benefit_handover",
      ].includes(operation)
        ? "high"
        : "medium",
      summary: `业财动作已保存：${operation}`,
      detail: {
        role: scope.role,
        dataClass: scope.dataClass,
        context: scope.context,
      },
      requestId,
    });
    return json(
      { status: "succeeded", id: resourceId, result, request_id: requestId },
      201,
      requestId,
    );
  } catch (error) {
    return json(
      {
        error: "BUSINESS_FINANCE_WRITE_FAILED",
        detail: error instanceof Error ? error.message : "unknown",
        request_id: requestId,
      },
      503,
      requestId,
    );
  }
}
