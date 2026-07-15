import { buildBusinessDirectory } from "@/features/business-directory/domain";
import { getAuthSupabase } from "@/features/auth/server";
import { loadContextProjectIdentityMappings } from "@/features/operating-model/persistence";
import { resolveFormalOutputAccess } from "@/features/formal-output/access";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  const access = await resolveFormalOutputAccess(request);
  if (!access.ok) return Response.json({ error: access.error, detail: access.detail, request_id: requestId }, { status: access.status, headers: { "Cache-Control": "no-store", "X-Request-Id": requestId } });
  const mappings = await loadContextProjectIdentityMappings({ context: access.context, dataClass: access.dataClass });
  if (mappings.status !== "succeeded") return Response.json({ error: "PROJECT_SCOPE_MAPPING_FAILED", detail: mappings.warning, request_id: requestId }, { status: mappings.status === "not_configured" ? 503 : 500 });
  const projectIds = [...new Set((mappings.data ?? []).map(item => item.projectId))];
  const supabase = getAuthSupabase();
  const [projects, assignments, evidence, outputs, risks, issues, changes, tasks, milestones, contracts, receivables, lifecycle, signals, baselines, actions] = await Promise.all([
    projectIds.length ? supabase.from("projects").select("id,name,oa_no,data_class").eq("org_id", access.orgId).eq("data_class", access.dataClass).in("id", projectIds).order("name") : Promise.resolve({ data: [], error: null }),
    supabase.from("user_business_roles").select("user_id,business_role,subject_scope,subject_id,status,valid_until").eq("org_id", access.orgId).eq("status", "active"),
    projectIds.length ? supabase.from("evidence_links").select("id,subject_id,title,evidence_type,verified_at").eq("org_id", access.orgId).eq("subject_type", "project").in("subject_id", projectIds).order("created_at", { ascending: false }).limit(300) : Promise.resolve({ data: [], error: null }),
    supabase.from("formal_business_outputs").select("id,project_id,title,output_type,status,subject_scope,subject_id").eq("org_id", access.orgId).eq("data_class", access.dataClass).order("created_at", { ascending: false }).limit(300),
    projectIds.length ? supabase.from("risks").select("id,project_id,risk_code,description,status").eq("org_id", access.orgId).eq("data_class", access.dataClass).in("project_id", projectIds).order("updated_at", { ascending: false }).limit(300) : Promise.resolve({ data: [], error: null }),
    projectIds.length ? supabase.from("project_issues").select("id,project_id,issue_code,title,status").eq("org_id", access.orgId).eq("data_class", access.dataClass).in("project_id", projectIds).order("updated_at", { ascending: false }).limit(300) : Promise.resolve({ data: [], error: null }),
    projectIds.length ? supabase.from("project_changes").select("id,project_id,change_code,title,status").eq("org_id", access.orgId).eq("data_class", access.dataClass).in("project_id", projectIds).order("updated_at", { ascending: false }).limit(300) : Promise.resolve({ data: [], error: null }),
    projectIds.length ? supabase.from("tasks").select("id,project_id,task_code,name,status").eq("org_id", access.orgId).eq("data_class", access.dataClass).in("project_id", projectIds).eq("is_source_deleted", false).order("updated_at", { ascending: false }).limit(300) : Promise.resolve({ data: [], error: null }),
    projectIds.length ? supabase.from("project_milestones").select("id,project_id,milestone_name,status").eq("org_id", access.orgId).eq("data_class", access.dataClass).in("project_id", projectIds).eq("is_source_deleted", false).order("updated_at", { ascending: false }).limit(300) : Promise.resolve({ data: [], error: null }),
    projectIds.length ? supabase.from("project_contract_records").select("id,project_id,contract_code,name,status").eq("org_id", access.orgId).eq("data_class", access.dataClass).in("project_id", projectIds).order("updated_at", { ascending: false }).limit(300) : Promise.resolve({ data: [], error: null }),
    projectIds.length ? supabase.from("project_receivable_records").select("id,project_id,receivable_code,title,status").eq("org_id", access.orgId).eq("data_class", access.dataClass).in("project_id", projectIds).order("updated_at", { ascending: false }).limit(300) : Promise.resolve({ data: [], error: null }),
    projectIds.length ? supabase.from("project_lifecycle_states").select("id,project_id,object_type,object_id,status,metadata").eq("org_id", access.orgId).eq("data_class", access.dataClass).in("project_id", projectIds).order("updated_at", { ascending: false }).limit(300) : Promise.resolve({ data: [], error: null }),
    projectIds.length ? supabase.from("management_signals").select("id,project_id,signal_type,title,status").eq("org_id", access.orgId).eq("data_class", access.dataClass).in("project_id", projectIds).order("updated_at", { ascending: false }).limit(300) : Promise.resolve({ data: [], error: null }),
    projectIds.length ? supabase.from("project_plan_baselines").select("id,project_id,baseline_type,title,status").eq("org_id", access.orgId).eq("data_class", access.dataClass).in("project_id", projectIds).order("updated_at", { ascending: false }).limit(300) : Promise.resolve({ data: [], error: null }),
    projectIds.length ? supabase.from("unified_action_items").select("id,project_id,title,status,priority").eq("org_id", access.orgId).eq("data_class", access.dataClass).in("project_id", projectIds).order("updated_at", { ascending: false }).limit(300) : Promise.resolve({ data: [], error: null }),
  ]);
  const failed = [
    { source: "projects", error: projects.error }, { source: "user_business_roles", error: assignments.error },
    { source: "evidence_links", error: evidence.error }, { source: "formal_business_outputs", error: outputs.error },
    { source: "risks", error: risks.error }, { source: "project_issues", error: issues.error }, { source: "project_changes", error: changes.error },
    { source: "tasks", error: tasks.error }, { source: "project_milestones", error: milestones.error },
    { source: "project_contract_records", error: contracts.error }, { source: "project_receivable_records", error: receivables.error },
    { source: "project_lifecycle_states", error: lifecycle.error }, { source: "management_signals", error: signals.error }, { source: "project_plan_baselines", error: baselines.error }, { source: "unified_action_items", error: actions.error },
  ].find(item => item.error);
  if (failed) return Response.json({ error: "BUSINESS_DIRECTORY_SOURCE_UNAVAILABLE", detail: `${failed.source}:${failed.error?.message}`, request_id: requestId }, { status: 503, headers: { "Cache-Control": "no-store", "X-Request-Id": requestId } });
  const now = Date.now();
  const activeAssignments = (assignments.data ?? []).filter(item => !item.valid_until || new Date(item.valid_until).getTime() >= now);
  const userIds = [...new Set(activeAssignments.map(item => item.user_id))];
  const users = userIds.length ? await supabase.from("app_users").select("id,name,status").in("id", userIds).eq("status", "active") : { data: [], error: null };
  if (users.error) return Response.json({ error: "BUSINESS_DIRECTORY_USER_SOURCE_UNAVAILABLE", detail: users.error.message, request_id: requestId }, { status: 503 });
  const rolesByUser = new Map<string, string[]>();
  for (const assignment of activeAssignments) rolesByUser.set(assignment.user_id, [...new Set([...(rolesByUser.get(assignment.user_id) ?? []), assignment.business_role])]);
  const visibleOutputs = (outputs.data ?? []).filter(item => item.project_id ? projectIds.includes(item.project_id) : item.subject_scope === access.subjectScope && item.subject_id === access.subjectId);
  const directory = buildBusinessDirectory({
    projects: (projects.data ?? []).map(item => ({ id: item.id, name: item.name, code: item.oa_no, dataClass: item.data_class })),
    people: (users.data ?? []).map(item => ({ id: item.id, name: item.name || "未命名成员", email: null, phone: null, roles: (rolesByUser.get(item.id) ?? []) as Parameters<typeof buildBusinessDirectory>[0]["people"][number]["roles"] })),
    evidence: (evidence.data ?? []).map(item => ({ id: item.id, projectId: item.subject_id, title: item.title, evidenceType: item.evidence_type, verifiedAt: item.verified_at })),
    formalOutputs: visibleOutputs.map(item => ({ id: item.id, projectId: item.project_id, title: item.title, outputType: item.output_type, status: item.status })),
    businessObjects: [
      ...(risks.data ?? []).map(item => ({ id: item.id, projectId: item.project_id, objectType: "risk", code: item.risk_code, title: item.description, status: item.status })),
      ...(issues.data ?? []).map(item => ({ id: item.id, projectId: item.project_id, objectType: "issue", code: item.issue_code, title: item.title, status: item.status })),
      ...(changes.data ?? []).map(item => ({ id: item.id, projectId: item.project_id, objectType: "change", code: item.change_code, title: item.title, status: item.status })),
      ...(tasks.data ?? []).map(item => ({ id: item.id, projectId: item.project_id, objectType: "task", code: item.task_code, title: item.name, status: item.status })),
      ...(milestones.data ?? []).map(item => ({ id: item.id, projectId: item.project_id, objectType: "milestone", code: null, title: item.milestone_name, status: item.status })),
      ...(contracts.data ?? []).map(item => ({ id: item.id, projectId: item.project_id, objectType: "contract", code: item.contract_code, title: item.name, status: item.status })),
      ...(receivables.data ?? []).map(item => ({ id: item.id, projectId: item.project_id, objectType: "payment", code: item.receivable_code, title: item.title, status: item.status })),
      ...(lifecycle.data ?? []).map(item => ({ id: item.object_id, projectId: item.project_id, objectType: item.object_type, code: null, title: String((item.metadata as Record<string, unknown> | null)?.title || item.object_id), status: item.status })),
      ...(lifecycle.data ?? []).map(item => ({ id: item.id, projectId: item.project_id, objectType: "lifecycle_state", code: item.object_type, title: String((item.metadata as Record<string, unknown> | null)?.title || item.object_id), status: item.status })),
      ...(signals.data ?? []).map(item => ({ id: item.id, projectId: item.project_id, objectType: "management_signal", code: item.signal_type, title: item.title, status: item.status })),
      ...(baselines.data ?? []).map(item => ({ id: item.id, projectId: item.project_id, objectType: item.baseline_type === "cost" ? "budget" : "plan", code: item.baseline_type, title: item.title, status: item.status })),
      ...(actions.data ?? []).map(item => ({ id: item.id, projectId: item.project_id, objectType: "action", code: item.priority, title: item.title, status: item.status })),
      ...visibleOutputs.filter(item => item.project_id).map(item => ({ id: item.id, projectId: item.project_id!, objectType: "reporting", code: item.output_type, title: item.title, status: item.status })),
    ],
  });
  return Response.json({ status: "succeeded", request_id: requestId, context: access.context, data_class: access.dataClass, source: { type: "supabase", fallback_used: false }, directory }, { headers: { "Cache-Control": "no-store", "X-Request-Id": requestId } });
}
