import { getAuthSupabase } from "@/features/auth/server";
import { buildProjectControlSnapshot, type ProjectControlSnapshot } from "./snapshot";
import type { ProjectControlDataClass } from "./contracts";

type LoadInput = {
  orgId: string;
  projectId: string;
  dataClass: ProjectControlDataClass;
};

type Row = Record<string, unknown>;

export async function loadProjectControlSnapshot(input: LoadInput): Promise<ProjectControlSnapshot> {
  const projectQuery = await getAuthSupabase()
    .from("projects")
    .select("*")
    .eq("org_id", input.orgId)
    .eq("id", input.projectId)
    .eq("data_class", input.dataClass)
    .eq("is_source_deleted", false)
    .maybeSingle();
  if (projectQuery.error) throw new Error(`PROJECT_CONTROL_PROJECT_LOAD_FAILED:${projectQuery.error.message}`);
  if (!projectQuery.data) throw new Error("PROJECT_CONTROL_PROJECT_NOT_FOUND");

  const tableNames = ["tasks", "project_milestones", "project_delivery_actuals", "project_schedule_snapshots", "project_evm_snapshots", "risks", "project_issues", "project_changes", "unified_action_items", "project_quality_check_items", "project_defect_records", "project_acceptance_records", "project_signoff_records", "project_closure_assessments"];
  const results = await Promise.all([
    getAuthSupabase().from("tasks").select("*").eq("org_id", input.orgId).eq("project_id", input.projectId).eq("data_class", input.dataClass).eq("is_source_deleted", false),
    getAuthSupabase().from("project_milestones").select("*").eq("org_id", input.orgId).eq("project_id", input.projectId).eq("data_class", input.dataClass).eq("is_source_deleted", false),
    getAuthSupabase().from("project_delivery_actuals").select("*").eq("org_id", input.orgId).eq("project_id", input.projectId).eq("data_class", input.dataClass),
    getAuthSupabase().from("project_schedule_snapshots").select("*").eq("org_id", input.orgId).eq("project_id", input.projectId).eq("data_class", input.dataClass),
    getAuthSupabase().from("project_evm_snapshots").select("*").eq("org_id", input.orgId).eq("project_id", input.projectId).eq("data_class", input.dataClass),
    getAuthSupabase().from("risks").select("*").eq("org_id", input.orgId).eq("project_id", input.projectId).eq("data_class", input.dataClass).eq("is_source_deleted", false),
    getAuthSupabase().from("project_issues").select("*").eq("org_id", input.orgId).eq("project_id", input.projectId).eq("data_class", input.dataClass),
    getAuthSupabase().from("project_changes").select("*").eq("org_id", input.orgId).eq("project_id", input.projectId).eq("data_class", input.dataClass),
    getAuthSupabase().from("unified_action_items").select("*").eq("org_id", input.orgId).eq("project_id", input.projectId).eq("data_class", input.dataClass),
    getAuthSupabase().from("project_quality_check_items").select("*").eq("org_id", input.orgId).eq("project_id", input.projectId).eq("data_class", input.dataClass),
    getAuthSupabase().from("project_defect_records").select("*").eq("org_id", input.orgId).eq("project_id", input.projectId).eq("data_class", input.dataClass),
    getAuthSupabase().from("project_acceptance_records").select("*").eq("org_id", input.orgId).eq("project_id", input.projectId).eq("data_class", input.dataClass),
    getAuthSupabase().from("project_signoff_records").select("*").eq("org_id", input.orgId).eq("project_id", input.projectId).eq("data_class", input.dataClass),
    getAuthSupabase().from("project_closure_assessments").select("*").eq("org_id", input.orgId).eq("project_id", input.projectId).eq("data_class", input.dataClass),
  ]);
  results.forEach((result, index) => {
    if (result.error) throw new Error(`PROJECT_CONTROL_${tableNames[index].toUpperCase()}_LOAD_FAILED:${result.error.message}`);
  });
  const [tasks, milestones, deliveryActuals, scheduleSnapshots, evmSnapshots, risks, issues, changes, actions, qualityChecks, defects, acceptances, signoffs, closureAssessments] = results.map(result => (result.data ?? []) as Row[]);

  return buildProjectControlSnapshot({
    project: projectQuery.data as Row & { id: string; name: string; data_class: string },
    tasks,
    milestones,
    deliveryActuals,
    scheduleSnapshots,
    evmSnapshots,
    risks,
    issues,
    changes,
    actions,
    qualityChecks,
    defects,
    acceptances,
    signoffs,
    closureAssessments,
  });
}
