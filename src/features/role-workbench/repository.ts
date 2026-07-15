import { getAuthSupabase } from "../auth/server.ts";
import { buildRoleWorkbench, type PrimaryWorkbenchRole, type RoleWorkbench, type WorkbenchDataClass } from "./domain.ts";

type Row = Record<string, unknown>;
type QueryResult = { data: unknown; error: { message: string } | null };

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function number(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function object(value: unknown): Row {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Row : {};
}

function rows(result: QueryResult): Row[] {
  return result.error ? [] : (Array.isArray(result.data) ? result.data as Row[] : []);
}

function missing(message: string): boolean {
  return /schema cache|relation .* does not exist|Could not find the table|column .* does not exist/i.test(message);
}

function ownerMatches(row: Row, user: { id: string; name?: string | null; email?: string | null; phone?: string | null }): boolean {
  const owner = text(row.owner_user_id || row.reviewer_user_id || row.assignee || row.owner || row.owner_name).toLowerCase().replace(/\s/g, "");
  return [user.id, user.name, user.email, user.phone].filter(Boolean).some(value => owner.includes(text(value).toLowerCase().replace(/\s/g, "")));
}

function rowDate(row: Row, ...keys: string[]): string | null {
  for (const key of keys) if (row[key]) return text(row[key]);
  return null;
}

async function settle(source: string, promise: PromiseLike<QueryResult> | null) {
  if (!promise) return { source, data: [] as Row[], warning: null as string | null };
  const result = await promise;
  return {
    source,
    data: rows(result),
    warning: result.error ? `${source}:${missing(result.error.message) ? "migration_not_applied" : "query_failed"}` : null,
  };
}

function projectQuery(table: string, projectIds: string[], orgId: string, dataClass: WorkbenchDataClass) {
  if (projectIds.length === 0) return null;
  return getAuthSupabase().from(table).select("*").eq("org_id", orgId).eq("data_class", dataClass).in("project_id", projectIds).limit(500) as unknown as PromiseLike<QueryResult>;
}

export async function loadRoleWorkbench(input: {
  user: { id: string; name?: string | null; email?: string | null; phone?: string | null };
  role: PrimaryWorkbenchRole;
  orgId: string;
  subjectScope: string;
  subjectId: string;
  dataClass: WorkbenchDataClass;
  projectIds: string[];
}): Promise<{ workbench: RoleWorkbench; warnings: string[]; sourceLineage: Record<string, number> }> {
  const supabase = getAuthSupabase();
  const projectPromise = input.projectIds.length
    ? supabase.from("projects").select("*").eq("org_id", input.orgId).eq("data_class", input.dataClass).in("id", input.projectIds).limit(300) as unknown as PromiseLike<QueryResult>
    : null;
  const orgQuery = (table: string) => supabase.from(table).select("*").eq("org_id", input.orgId).eq("data_class", input.dataClass).limit(500) as unknown as PromiseLike<QueryResult>;
  const scopeQuery = (table: string) => supabase.from(table).select("*").eq("org_id", input.orgId).eq("data_class", input.dataClass).eq("subject_scope", input.subjectScope).eq("subject_id", input.subjectId).limit(500) as unknown as PromiseLike<QueryResult>;

  const settled = await Promise.all([
    settle("projects", projectPromise),
    settle("tasks", projectQuery("tasks", input.projectIds, input.orgId, input.dataClass)),
    settle("project_milestones", projectQuery("project_milestones", input.projectIds, input.orgId, input.dataClass)),
    settle("risks", projectQuery("risks", input.projectIds, input.orgId, input.dataClass)),
    settle("unified_action_items", projectQuery("unified_action_items", input.projectIds, input.orgId, input.dataClass)),
    settle("project_contract_records", projectQuery("project_contract_records", input.projectIds, input.orgId, input.dataClass)),
    settle("project_receivable_records", projectQuery("project_receivable_records", input.projectIds, input.orgId, input.dataClass)),
    settle("project_collection_records", projectQuery("project_collection_records", input.projectIds, input.orgId, input.dataClass)),
    settle("project_acceptance_records", projectQuery("project_acceptance_records", input.projectIds, input.orgId, input.dataClass)),
    settle("cost_records", projectQuery("cost_records", input.projectIds, input.orgId, input.dataClass)),
    settle("project_quality_check_items", projectQuery("project_quality_check_items", input.projectIds, input.orgId, input.dataClass)),
    settle("project_defect_records", projectQuery("project_defect_records", input.projectIds, input.orgId, input.dataClass)),
    settle("management_signals", orgQuery("management_signals")),
    settle("data_quality_issues", orgQuery("data_quality_issues")),
    settle("capacity_conflict_actions", orgQuery("capacity_conflict_actions")),
    settle("project_dependencies", orgQuery("project_dependencies")),
    settle("governance_cadence_actions", orgQuery("governance_cadence_actions")),
    settle("business_joint_check_items", orgQuery("business_joint_check_items")),
    settle("business_operating_occurrences", orgQuery("business_operating_occurrences")),
    settle("decision_briefs", orgQuery("decision_briefs")),
    settle("formal_business_outputs", orgQuery("formal_business_outputs")),
    settle("reporting_snapshots", scopeQuery("reporting_snapshots")),
  ]);
  const bySource = new Map(settled.map(item => [item.source, item.data]));
  const warnings = settled.flatMap(item => item.warning ? [item.warning] : []);
  const projectIdSet = new Set(input.projectIds);
  const projectScoped = (source: string, key = "project_id") => (bySource.get(source) ?? []).filter(row => projectIdSet.has(text(row[key])));
  const subjectRelevant = (row: Row) => {
    const projectId = text(row.project_id);
    return (projectId && projectIdSet.has(projectId)) || (text(row.subject_scope) === input.subjectScope && text(row.subject_id) === input.subjectId) || input.subjectScope === "organization";
  };

  const riskRows = projectScoped("risks");
  const risks = riskRows.map(row => ({
    id: text(row.id), projectId: text(row.project_id), title: text(row.description || row.risk_code || "未命名风险"),
    status: text(row.status), severity: number(row.priority_score || row.pi_score) >= 12 ? "high" : text(row.severity || row.risk_level || "medium"),
    ownerUserId: ownerMatches(row, input.user) ? input.user.id : text(row.owner_user_id) || null,
    dueAt: rowDate(row, "due_date", "action_deadline", "next_review_date"),
  }));
  const projectRisk = new Map<string, boolean>();
  for (const risk of risks) if (["high", "critical", "高", "重大"].includes(risk.severity) && !["closed", "已关闭"].includes(risk.status)) projectRisk.set(risk.projectId, true);

  const projects = (bySource.get("projects") ?? []).map(row => {
    const raw = object(row.raw_payload);
    const explicitHealth = text(raw["健康状态"] || raw.health || row.health_status).toLowerCase();
    return {
      id: text(row.id), name: text(row.name || "未命名项目"), projectLevel: text(row.project_level) || (row.is_key_project ? "重点" : null),
      progress: number(row.progress), status: text(row.status), health: explicitHealth || (projectRisk.get(text(row.id)) ? "red" : "unknown"),
      benefitForecast: number(row.contract_amount || raw["预计收益"] || raw.benefit_forecast),
      cashForecast: number(row.collection_amount || raw["预计回款"] || raw.cash_forecast),
    };
  });
  const tasks = projectScoped("tasks").map(row => {
    const raw = object(row.raw_payload);
    const critical = row.status === "blocked" || [true, "是", "true", "关键"].includes(raw["是否关键路径"] as boolean | string) || Boolean(raw.critical_path);
    return { id: text(row.id), projectId: text(row.project_id), title: text(row.name || row.task_code || "未命名任务"), status: text(row.status), dueAt: rowDate(row, "plan_end", "end_date"), ownerUserId: ownerMatches(row, input.user) ? input.user.id : text(row.owner_user_id) || null, critical };
  });
  const milestones = projectScoped("project_milestones").map(row => ({ id: text(row.id), projectId: text(row.project_id), title: text(row.milestone_name || "未命名里程碑"), status: text(row.status), dueAt: rowDate(row, "forecast_date", "baseline_date") }));
  const actions = projectScoped("unified_action_items").map(row => ({ id: text(row.id), projectId: text(row.project_id), title: text(row.title || "未命名行动"), status: text(row.status), priority: text(row.priority || "P1"), ownerUserId: text(row.owner_user_id) || (ownerMatches(row, input.user) ? input.user.id : null), reviewerUserId: text(row.reviewer_user_id) || null, dueAt: rowDate(row, "due_date") }));
  const commercial = [
    ...projectScoped("project_contract_records").map(row => ({ id: text(row.id), projectId: text(row.project_id), type: "contract" as const, status: text(row.status), amount: number(row.total_amount), dueAt: rowDate(row, "expiry_date") })),
    ...projectScoped("project_receivable_records").map(row => ({ id: text(row.id), projectId: text(row.project_id), type: "receivable" as const, status: text(row.status), amount: number(row.amount), dueAt: rowDate(row, "due_date") })),
    ...projectScoped("project_receivable_records").filter(row => number(row.invoice_amount) > 0).map(row => ({ id: `${text(row.id)}:invoice`, projectId: text(row.project_id), type: "invoice" as const, status: text(row.status), amount: number(row.invoice_amount), dueAt: rowDate(row, "invoice_date") })),
    ...projectScoped("project_collection_records").map(row => ({ id: text(row.id), projectId: text(row.project_id), type: "payment" as const, status: text(row.status), amount: number(row.amount), dueAt: rowDate(row, "collected_date") })),
    ...projectScoped("project_acceptance_records").map(row => ({ id: text(row.id), projectId: text(row.project_id), type: "acceptance" as const, status: text(row.status), amount: 0, dueAt: rowDate(row, "planned_date") })),
    ...projectScoped("cost_records").map(row => ({ id: text(row.id), projectId: text(row.project_id), type: "cost" as const, status: "recorded", amount: number(row.actual_cost), dueAt: rowDate(row, "period") })),
  ];
  const quality = [
    ...projectScoped("project_quality_check_items").filter(row => text(row.result) !== "passed").map(row => ({ id: text(row.id), projectId: text(row.project_id), title: text(row.item_text || "质量检查"), status: text(row.result), severity: row.required ? "high" : "medium", dueAt: rowDate(row, "due_date") })),
    ...projectScoped("project_defect_records").map(row => ({ id: text(row.id), projectId: text(row.project_id), title: text(row.title || "缺陷"), status: text(row.status), severity: text(row.severity || "medium"), dueAt: rowDate(row, "due_at") })),
  ];
  const governance = [
    ...(bySource.get("management_signals") ?? []).filter(subjectRelevant).map(row => ({ id: text(row.id), projectId: text(row.project_id) || null, type: "management_signal" as const, title: text(row.title || "管理信号"), status: text(row.status), severity: text(row.severity), dueAt: rowDate(row, "due_at") })),
    ...(bySource.get("data_quality_issues") ?? []).filter(subjectRelevant).map(row => ({ id: text(row.id), projectId: text(row.project_id) || null, type: "data_quality" as const, title: text(row.description || row.field_name || "数据质量问题"), status: text(row.status), severity: text(row.severity), dueAt: rowDate(row, "due_at") })),
    ...(bySource.get("capacity_conflict_actions") ?? []).filter(() => input.subjectScope === "organization" || ["pmo", "ceo"].includes(input.role)).map(row => ({ id: text(row.id), projectId: null, type: "capacity_conflict" as const, title: text(row.action_title || "资源冲突"), status: text(row.status), severity: number(row.overload_hours) >= 16 ? "critical" : "high", dueAt: rowDate(row, "due_at") })),
    ...(bySource.get("project_dependencies") ?? []).filter(row => projectIdSet.has(text(row.from_project_id)) || projectIdSet.has(text(row.to_project_id))).map(row => ({ id: text(row.id), projectId: text(row.from_project_id) || null, type: "project_dependency" as const, title: text(row.description || "项目依赖"), status: text(row.status), severity: row.status === "blocked" ? "critical" : "high", dueAt: rowDate(row, "due_date") })),
    ...(bySource.get("governance_cadence_actions") ?? []).filter(subjectRelevant).map(row => ({ id: text(row.id), projectId: text(row.project_id) || null, type: "governance_action" as const, title: text(row.title || "治理行动"), status: text(row.status), severity: "high", dueAt: rowDate(row, "due_at") })),
    ...(bySource.get("business_joint_check_items") ?? []).filter(row => projectIdSet.has(text(row.project_id))).map(row => ({ id: text(row.id), projectId: text(row.project_id), type: "joint_check" as const, title: text(row.title || "联合检查"), status: text(row.status), severity: text(row.severity), dueAt: rowDate(row, "due_at") })),
  ];
  const decisions = (bySource.get("decision_briefs") ?? []).filter(subjectRelevant).map(row => ({ id: text(row.id), projectId: text(row.project_id) || null, title: text(row.title || row.decision_question || "待决策事项"), status: text(row.status), requestedDecisionAt: rowDate(row, "requested_decision_at") }));
  const formalOutputs = (bySource.get("formal_business_outputs") ?? []).filter(subjectRelevant).map(row => ({ id: text(row.id), projectId: text(row.project_id) || null, title: text(row.title || "正式成果"), outputType: text(row.output_type), status: text(row.status), generatedAt: text(row.created_at || row.updated_at) }));

  const workbench = buildRoleWorkbench({ role: input.role, actorUserId: input.user.id, generatedAt: new Date().toISOString(), projects, tasks, milestones, risks, actions, commercial, quality, governance, decisions, formalOutputs });
  return { workbench, warnings, sourceLineage: Object.fromEntries(settled.map(item => [item.source, item.data.length])) };
}
