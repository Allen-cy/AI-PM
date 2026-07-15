import { getAuthSupabase, getCurrentUser } from "@/features/auth/server";
import { sortAndSummarizeInbox, type CollaborationInboxItem } from "@/features/collaboration-inbox/domain";
import { resolveBusinessContext, type BusinessRole, type SubjectScope } from "@/features/operating-model/context";
import { listBusinessRoleAssignments, loadContextProjectIdentityMappings, type ManagementSignalRecord } from "@/features/operating-model/persistence";

export const runtime = "nodejs";

type InboxItem = {
  id: string;
  type: "risk" | "joint_check" | "operating_calendar" | "governance_approval" | "management_signal" | "ai_recommendation" | "decision_receipt" | "feishu_confirmation" | "formal_output" | "cross_role_flow" | "action" | "closure_review" | "benefit_review" | "correction" | "report_receipt" | "evidence_review" | "data_quality" | "governance_action" | "capacity_conflict" | "project_dependency";
  title: string;
  status: string;
  projectId: string | null;
  dueAt: string | null;
  priority: "critical" | "high" | "medium" | "low";
  actionUrl: string;
  sourceId: string;
};

const ROLES = new Set<BusinessRole>(["pm", "operations", "pmo", "ceo", "sponsor", "business_owner", "finance", "quality"]);

function json(body: unknown, status = 200, requestId = crypto.randomUUID()) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store", "X-Request-Id": requestId } });
}

function missing(message: string): boolean {
  return /schema cache|relation .* does not exist|Could not find the table/i.test(message);
}

export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  const user = await getCurrentUser();
  if (!user) return json({ error: "UNAUTHORIZED", request_id: requestId }, 401, requestId);
  const url = new URL(request.url);
  const role = String(url.searchParams.get("role") || "") as BusinessRole;
  const orgId = String(url.searchParams.get("org_id") || "");
  const subjectScope = String(url.searchParams.get("subject_scope") || "") as SubjectScope;
  const subjectId = String(url.searchParams.get("subject_id") || "");
  const dataClass = String(url.searchParams.get("data_class") || "production") as ManagementSignalRecord["dataClass"];
  if (!ROLES.has(role) || !orgId || !subjectScope || !subjectId) return json({ error: "BUSINESS_CONTEXT_REQUIRED", request_id: requestId }, 400, requestId);
  const assignments = await listBusinessRoleAssignments(user.id);
  if (assignments.status !== "succeeded") return json({ error: "P17_STORAGE_NOT_CONFIGURED", detail: assignments.warning, request_id: requestId }, 503, requestId);
  const context = resolveBusinessContext({ user: { id: user.id, systemRole: user.role }, assignments: assignments.data ?? [], requestedRole: role, requestedOrgId: orgId, requestedSubjectScope: subjectScope, requestedSubjectId: subjectId });
  if (!context) return json({ error: "BUSINESS_CONTEXT_FORBIDDEN", request_id: requestId }, 403, requestId);
  const mappings = await loadContextProjectIdentityMappings({ context, dataClass });
  if (mappings.status !== "succeeded") return json({ error: "PROJECT_SCOPE_MAPPING_FAILED", detail: mappings.warning, request_id: requestId }, mappings.status === "not_configured" ? 503 : 500, requestId);
  const projectIds = [...new Set((mappings.data ?? []).map(item => item.projectId))];

  const supabase = getAuthSupabase();
  const empty = () => Promise.resolve({ data: [], error: null });
  const projectQuery = (table: string, columns: string) => projectIds.length
    ? supabase.from(table).select(columns).eq("org_id", orgId).eq("data_class", dataClass).in("project_id", projectIds)
    : empty();
  const queries: Array<{ source: string; promise: PromiseLike<{ data: unknown; error: { message: string } | null }> }> = [
    { source: "decision_receipts", promise: supabase.from("decision_receipts").select("id,brief_id,status,updated_at").eq("recipient_user_id", user.id).eq("recipient_business_role", role).in("status", ["pending", "disputed"]).limit(200) },
    { source: "unified_action_items", promise: projectIds.length ? supabase.from("unified_action_items").select("id,project_id,title,status,priority,due_date,source_type,source_id,updated_at").eq("org_id", orgId).eq("data_class", dataClass).in("project_id", projectIds).or(`owner_user_id.eq.${user.id},reviewer_user_id.eq.${user.id}`).not("status", "in", "(closed,cancelled,done)").limit(300) : empty() },
    { source: "feedback_correction_events", promise: projectIds.length ? supabase.from("feedback_correction_events").select("id,project_id,status,due_at,reason_detail,target_type,target_id,updated_at").eq("org_id", orgId).eq("data_class", dataClass).in("project_id", projectIds).or(`correction_owner_user_id.eq.${user.id},submitted_by.eq.${user.id}`).not("status", "in", "(closed,rejected)").limit(200) : empty() },
    { source: "reporting_snapshots", promise: supabase.from("reporting_snapshots").select("id,subject_scope,subject_id,status,period_end,narrative").eq("org_id", orgId).eq("data_class", dataClass).eq("submitted_to_user_id", user.id).eq("status", "submitted").limit(100) },
    { source: "data_quality_issues", promise: projectIds.length ? (() => { let query = supabase.from("data_quality_issues").select("id,project_id,field_name,description,severity,status,owner_user_id,due_at,updated_at").eq("org_id", orgId).eq("data_class", dataClass).in("project_id", projectIds).not("status", "in", "(closed,waived)"); query = role === "pmo" ? query.or(`owner_user_id.eq.${user.id},status.eq.evidence_submitted`) : query.eq("owner_user_id", user.id); return query.limit(200); })() : empty() },
    { source: "governance_cadence_actions", promise: projectIds.length ? (() => { let query = supabase.from("governance_cadence_actions").select("id,project_id,title,status,owner_user_id,due_at,updated_at").eq("org_id", orgId).eq("data_class", dataClass).in("project_id", projectIds).not("status", "in", "(closed,cancelled)"); query = role === "pmo" ? query.or(`owner_user_id.eq.${user.id},status.in.(evidence_submitted,effect_review)`) : query.eq("owner_user_id", user.id); return query.limit(200); })() : empty() },
    { source: "capacity_conflict_actions", promise: (() => { let query = supabase.from("capacity_conflict_actions").select("id,capacity_snapshot_id,action_title,status,owner_user_id,due_at,overload_hours").eq("org_id", orgId).eq("data_class", dataClass).not("status", "in", "(closed,cancelled)"); query = role === "pmo" ? query.or(`owner_user_id.eq.${user.id},status.in.(evidence_submitted,verified)`) : query.eq("owner_user_id", user.id); return query.limit(200); })() },
    { source: "project_dependencies", promise: projectIds.length ? (() => { let query = supabase.from("project_dependencies").select("id,from_project_id,to_project_id,description,status,owner_user_id,due_date,updated_at").eq("org_id", orgId).eq("data_class", dataClass).in("from_project_id", projectIds).in("to_project_id", projectIds).not("status", "in", "(resolved,cancelled)"); query = role === "pmo" ? query.or(`owner_user_id.eq.${user.id},status.in.(evidence_submitted,verified)`) : query.eq("owner_user_id", user.id); return query.limit(200); })() : empty() },
    { source: "risks", promise: projectQuery("risks", "id,project_id,risk_code,description,status,priority_score,owner,due_date,updated_at").then(result => result) },
    { source: "business_joint_check_items", promise: projectIds.length ? (() => { let query = supabase.from("business_joint_check_items").select("id,project_id,title,status,severity,due_at,owner_user_id,reviewer_user_id,updated_at").eq("org_id", orgId).eq("data_class", dataClass).in("project_id", projectIds).not("status", "in", "(closed,dismissed)"); if (role !== "pmo") query = query.or(`owner_user_id.eq.${user.id},reviewer_user_id.eq.${user.id},owner_business_role.eq.${role}`); return query.limit(200); })() : empty() },
    { source: "business_operating_occurrences", promise: supabase.from("business_operating_occurrences").select("id,subject_scope,subject_id,business_role,status,due_at,owner_user_id,updated_at").eq("org_id", orgId).eq("data_class", dataClass).eq("owner_user_id", user.id).not("status", "in", "(closed,cancelled)").limit(200) },
    { source: "project_governance_artifacts", promise: projectIds.length && role === "pmo" ? supabase.from("project_governance_artifacts").select("id,project_id,artifact_type,title,status,updated_at").eq("org_id", orgId).eq("data_class", dataClass).in("project_id", projectIds).eq("status", "submitted").limit(200) : empty() },
    { source: "management_signals", promise: (() => { let query = supabase.from("management_signals").select("id,project_id,subject_scope,subject_id,title,status,severity,due_at,owner_user_id,reviewer_user_id,updated_at").eq("org_id", orgId).eq("data_class", dataClass).not("status", "in", "(closed,rejected)"); if (!["pmo", "ceo"].includes(role)) query = query.or(`owner_user_id.eq.${user.id},reviewer_user_id.eq.${user.id}`); return query.limit(300); })() },
    { source: "ai_recommendations", promise: supabase.from("ai_recommendations").select("id,subject_scope,subject_id,recommendation_type,title,status,created_at,updated_at").eq("org_id", orgId).eq("data_class", dataClass).eq("actor_user_id", user.id).eq("business_role", role).eq("status", "pending_confirmation").limit(200) },
    { source: "feishu_action_confirmations", promise: supabase.from("feishu_action_confirmations").select("id,project_id,action_type,target_summary,status,risk_level,created_at,updated_at").eq("requester_id", user.id).eq("org_id", orgId).eq("data_class", dataClass).in("status", ["pending_confirmation", "failed"]).limit(200) },
    { source: "formal_business_outputs", promise: supabase.from("formal_business_outputs").select("id,project_id,subject_scope,subject_id,output_type,title,status,created_at,updated_at").eq("org_id", orgId).eq("data_class", dataClass).in("status", role === "ceo" ? ["submitted", "approved", "published"] : ["submitted"]).limit(200) },
    { source: "cross_role_flows", promise: projectIds.length ? supabase.from("cross_role_flows").select("id,project_id,title,status,pmo_owner_user_id,decision_owner_user_id,execution_owner_user_id,deadline,created_by,updated_at").eq("org_id", orgId).eq("data_class", dataClass).in("project_id", projectIds).not("status", "in", "(closed,cancelled)").limit(200) : empty() },
    { source: "collaboration_inbox_receipts", promise: supabase.from("collaboration_inbox_receipts").select("id,item_type,source_type,source_id,status,snoozed_until,version,updated_at").eq("user_id", user.id).eq("org_id", orgId).eq("business_role", role).eq("data_class", dataClass).limit(1000) },
    { source: "projects", promise: projectIds.length ? supabase.from("projects").select("id,name").eq("org_id", orgId).eq("data_class", dataClass).in("id", projectIds).limit(300) : empty() },
  ];
  if (projectIds.length && ["pmo", "sponsor"].includes(role)) queries.push({ source: "project_closure_assessments", promise: supabase.from("project_closure_assessments").select("id,project_id,status,created_at").in("project_id", projectIds).eq("org_id", orgId).eq("data_class", dataClass).eq("status", "submitted").limit(100) });
  if (projectIds.length && ["pmo", "finance", "business_owner"].includes(role)) queries.push({ source: "benefit_realization_reviews", promise: supabase.from("benefit_realization_reviews").select("id,project_id,status,review_gate,conclusion,updated_at").in("project_id", projectIds).eq("org_id", orgId).eq("data_class", dataClass).eq("status", "submitted").limit(100) });
  if (projectIds.length && ["pmo", "sponsor", "business_owner", "finance", "quality"].includes(role)) queries.push({ source: "evidence_links", promise: supabase.from("evidence_links").select("id,subject_id,title,evidence_type,valid_until,created_at").eq("org_id", orgId).eq("subject_type", "project").in("subject_id", projectIds).is("verified_at", null).limit(200) });

  const settled = await Promise.all(queries.map(async query => ({ source: query.source, result: await query.promise })));
  const unavailableSources = settled.filter(item => item.result.error).map(item => ({ source: item.source, reason: missing(item.result.error!.message) ? "migration_not_applied" : "query_failed" }));
  const rows = new Map(settled.map(item => [item.source, item.result.error ? [] : (item.result.data as Array<Record<string, unknown>> ?? [])]));
  const capacitySnapshotIds = (rows.get("capacity_conflict_actions") ?? []).map(item => String(item.capacity_snapshot_id));
  const capacityScopes = capacitySnapshotIds.length ? await supabase.from("resource_capacity_allocations").select("capacity_snapshot_id").eq("org_id", orgId).eq("data_class", dataClass).in("capacity_snapshot_id", capacitySnapshotIds).in("project_id", projectIds) : { data: [], error: null };
  if (capacityScopes.error) unavailableSources.push({ source: "resource_capacity_allocations", reason: missing(capacityScopes.error.message) ? "migration_not_applied" : "query_failed" });
  const allowedCapacitySnapshots = new Set((capacityScopes.data ?? []).map(item => String(item.capacity_snapshot_id)));
  const briefIds = (rows.get("decision_receipts") ?? []).map(item => String(item.brief_id));
  const briefs = briefIds.length ? await supabase.from("decision_briefs").select("id,title,project_id,subject_scope,subject_id,requested_decision_at,data_class").in("id", briefIds).eq("org_id", orgId).eq("data_class", dataClass) : { data: [], error: null };
  if (briefs.error) unavailableSources.push({ source: "decision_briefs", reason: missing(briefs.error.message) ? "migration_not_applied" : "query_failed" });
  const briefById = new Map((briefs.data ?? []).filter(item => item.project_id ? projectIds.includes(String(item.project_id)) : item.subject_scope === subjectScope && String(item.subject_id) === subjectId).map(item => [String(item.id), item]));

  const items: InboxItem[] = [];
  for (const row of rows.get("decision_receipts") ?? []) { const brief = briefById.get(String(row.brief_id)); if (!brief) continue; items.push({ id: `decision:${row.id}`, type: "decision_receipt", title: `接收决策：${brief.title}`, status: String(row.status), projectId: brief.project_id ? String(brief.project_id) : null, dueAt: String(brief.requested_decision_at || "") || null, priority: row.status === "disputed" ? "high" : "medium", actionUrl: "/decision-center", sourceId: String(row.id) }); }
  for (const row of rows.get("unified_action_items") ?? []) items.push({ id: `action:${row.id}`, type: "action", title: String(row.title || "待处理行动"), status: String(row.status), projectId: row.project_id ? String(row.project_id) : null, dueAt: row.due_date ? String(row.due_date) : null, priority: row.priority === "P0" ? "critical" : row.priority === "P1" ? "high" : "medium", actionUrl: row.source_type === "decision" ? "/decision-center" : row.project_id ? `/projects/${row.project_id}` : "/workbench", sourceId: String(row.id) });
  for (const row of rows.get("feedback_correction_events") ?? []) items.push({ id: `correction:${row.id}`, type: "correction", title: `人工纠偏：${String(row.reason_detail || row.target_type)}`, status: String(row.status), projectId: String(row.project_id), dueAt: row.due_at ? String(row.due_at) : null, priority: "high", actionUrl: `/projects/${row.project_id}/lifecycle`, sourceId: String(row.id) });
  for (const row of rows.get("reporting_snapshots") ?? []) items.push({ id: `report:${row.id}`, type: "report_receipt", title: `接收汇报：${String(row.narrative || "").slice(0, 60)}`, status: String(row.status), projectId: row.subject_scope === "project" ? String(row.subject_id) : null, dueAt: row.period_end ? String(row.period_end) : null, priority: "medium", actionUrl: "/decision-center", sourceId: String(row.id) });
  for (const row of rows.get("project_closure_assessments") ?? []) items.push({ id: `closure:${row.id}`, type: "closure_review", title: "项目正式收尾复核", status: String(row.status), projectId: String(row.project_id), dueAt: null, priority: "high", actionUrl: "/closure-knowledge", sourceId: String(row.id) });
  for (const row of rows.get("benefit_realization_reviews") ?? []) items.push({ id: `benefit:${row.id}`, type: "benefit_review", title: `收益${String(row.review_gate)}复核：${String(row.conclusion || "")}`, status: String(row.status), projectId: String(row.project_id), dueAt: null, priority: row.review_gate === "G6" || row.review_gate === "exit" ? "high" : "medium", actionUrl: "/business-finance", sourceId: String(row.id) });
  for (const row of rows.get("evidence_links") ?? []) items.push({ id: `evidence:${row.id}`, type: "evidence_review", title: `核验证据：${String(row.title || row.evidence_type)}`, status: "pending_verification", projectId: String(row.subject_id), dueAt: row.valid_until ? String(row.valid_until) : null, priority: "medium", actionUrl: `/projects/${row.subject_id}/lifecycle`, sourceId: String(row.id) });
  for (const row of rows.get("data_quality_issues") ?? []) items.push({ id: `quality:${row.id}`, type: "data_quality", title: `数据纠偏：${String(row.field_name || row.description || "数据质量问题")}`, status: String(row.status), projectId: String(row.project_id), dueAt: row.due_at ? String(row.due_at) : null, priority: row.severity === "critical" ? "critical" : row.severity === "high" ? "high" : "medium", actionUrl: "/pmo/control-center?owner_mode=1", sourceId: String(row.id) });
  for (const row of rows.get("governance_cadence_actions") ?? []) items.push({ id: `governance-action:${row.id}`, type: "governance_action", title: `会后行动：${String(row.title || "待办")}`, status: String(row.status), projectId: row.project_id ? String(row.project_id) : null, dueAt: row.due_at ? String(row.due_at) : null, priority: "high", actionUrl: "/pmo/control-center?owner_mode=1", sourceId: String(row.id) });
  for (const row of rows.get("capacity_conflict_actions") ?? []) { if (!allowedCapacitySnapshots.has(String(row.capacity_snapshot_id))) continue; items.push({ id: `capacity:${row.id}`, type: "capacity_conflict", title: `资源冲突：${String(row.action_title || "超载处置")}`, status: String(row.status), projectId: null, dueAt: row.due_at ? String(row.due_at) : null, priority: Number(row.overload_hours || 0) >= 16 ? "critical" : "high", actionUrl: "/pmo/control-center?owner_mode=1", sourceId: String(row.id) }); }
  for (const row of rows.get("project_dependencies") ?? []) items.push({ id: `dependency:${row.id}`, type: "project_dependency", title: `项目依赖：${String(row.description || "待确认")}`, status: String(row.status), projectId: String(row.from_project_id), dueAt: row.due_date ? String(row.due_date) : null, priority: row.status === "blocked" ? "critical" : "high", actionUrl: "/pmo/control-center?owner_mode=1", sourceId: String(row.id) });
  for (const row of rows.get("risks") ?? []) items.push({ id: `risk:${row.id}`, type: "risk", title: `风险：${String(row.description || row.risk_code || "待处理")}`, status: String(row.status), projectId: String(row.project_id), dueAt: row.due_date ? String(row.due_date) : null, priority: Number(row.priority_score || 0) >= 20 ? "critical" : Number(row.priority_score || 0) >= 12 ? "high" : "medium", actionUrl: `/risk?project_id=${row.project_id}`, sourceId: String(row.id) });
  for (const row of rows.get("business_joint_check_items") ?? []) items.push({ id: `joint:${row.id}`, type: "joint_check", title: `联合检查：${String(row.title || "交付经营断点")}`, status: String(row.status), projectId: String(row.project_id), dueAt: row.due_at ? String(row.due_at) : null, priority: row.severity === "critical" ? "critical" : row.severity === "high" ? "high" : "medium", actionUrl: "/business-assistant/operations-loop", sourceId: String(row.id) });
  for (const row of rows.get("business_operating_occurrences") ?? []) {
    const relevant = row.subject_scope === subjectScope && String(row.subject_id) === subjectId || projectIds.includes(String(row.subject_id));
    if (!relevant) continue;
    items.push({ id: `calendar:${row.id}`, type: "operating_calendar", title: `运行日历：${String(row.business_role)}周期工作`, status: String(row.status), projectId: row.subject_scope === "project" ? String(row.subject_id) : null, dueAt: row.due_at ? String(row.due_at) : null, priority: row.status === "overdue" ? "critical" : "medium", actionUrl: "/business-assistant/operations-loop", sourceId: String(row.id) });
  }
  for (const row of rows.get("project_governance_artifacts") ?? []) items.push({ id: `governance-approval:${row.id}`, type: "governance_approval", title: `治理审批：${String(row.title || row.artifact_type || "待审批成果")}`, status: String(row.status), projectId: String(row.project_id), dueAt: null, priority: "high", actionUrl: "/initiation", sourceId: String(row.id) });
  for (const row of rows.get("management_signals") ?? []) {
    const relevant = row.project_id ? projectIds.includes(String(row.project_id)) : row.subject_scope === subjectScope && String(row.subject_id) === subjectId;
    if (!relevant && subjectScope !== "organization") continue;
    items.push({ id: `signal:${row.id}`, type: "management_signal", title: `管理信号：${String(row.title || "待复核")}`, status: String(row.status), projectId: row.project_id ? String(row.project_id) : null, dueAt: row.due_at ? String(row.due_at) : null, priority: row.severity === "critical" ? "critical" : row.severity === "high" ? "high" : "medium", actionUrl: "/pmo/control-center?owner_mode=1", sourceId: String(row.id) });
  }
  for (const row of rows.get("ai_recommendations") ?? []) {
    const relevant = row.subject_scope === subjectScope && String(row.subject_id) === subjectId || projectIds.includes(String(row.subject_id));
    if (!relevant) continue;
    items.push({ id: `ai:${row.id}`, type: "ai_recommendation", title: `AI建议待确认：${String(row.title || row.recommendation_type)}`, status: String(row.status), projectId: row.subject_scope === "project" ? String(row.subject_id) : null, dueAt: null, priority: "medium", actionUrl: "/role-assistant", sourceId: String(row.id) });
  }
  for (const row of rows.get("feishu_action_confirmations") ?? []) items.push({ id: `feishu:${row.id}`, type: "feishu_confirmation", title: `${row.status === "failed" ? "飞书写入失败" : "飞书写入待确认"}：${String(row.target_summary || row.action_type)}`, status: String(row.status), projectId: row.project_id ? String(row.project_id) : null, dueAt: null, priority: row.status === "failed" || row.risk_level === "high" ? "high" : "medium", actionUrl: "/integration-center", sourceId: String(row.id) });
  for (const row of rows.get("formal_business_outputs") ?? []) {
    const relevant = row.project_id ? projectIds.includes(String(row.project_id)) : row.subject_scope === subjectScope && String(row.subject_id) === subjectId;
    if (!relevant && subjectScope !== "organization") continue;
    items.push({ id: `formal:${row.id}`, type: "formal_output", title: `正式成果：${String(row.title || row.output_type)}`, status: String(row.status), projectId: row.project_id ? String(row.project_id) : null, dueAt: null, priority: row.status === "submitted" ? "high" : "medium", actionUrl: "/reports", sourceId: String(row.id) });
  }
  for (const row of rows.get("cross_role_flows") ?? []) {
    const relevant = role === "pmo"
      || (["ceo", "sponsor"].includes(role) && ["decision_submitted", "decision_made", "effect_reviewed"].includes(String(row.status)))
      || String(row.created_by) === user.id || String(row.execution_owner_user_id) === user.id;
    if (!relevant) continue;
    items.push({ id: `cross-role:${row.id}`, type: "cross_role_flow", title: `跨角色闭环：${String(row.title || "待处理事项")}`, status: String(row.status), projectId: row.project_id ? String(row.project_id) : null, dueAt: row.deadline ? String(row.deadline) : null, priority: ["decision_submitted", "action_dispatched"].includes(String(row.status)) ? "critical" : "high", actionUrl: "/cross-role-flow", sourceId: String(row.id) });
  }
  const projectNameById = new Map((rows.get("projects") ?? []).map(row => [String(row.id), String(row.name || "未命名项目")]));
  const sourceForType: Record<InboxItem["type"], string> = {
    risk: "risks", joint_check: "business_joint_check_items", operating_calendar: "business_operating_occurrences", governance_approval: "project_governance_artifacts", management_signal: "management_signals", ai_recommendation: "ai_recommendations", decision_receipt: "decision_receipts", feishu_confirmation: "feishu_action_confirmations", formal_output: "formal_business_outputs", cross_role_flow: "cross_role_flows", action: "unified_action_items", closure_review: "project_closure_assessments", benefit_review: "benefit_realization_reviews", correction: "feedback_correction_events", report_receipt: "reporting_snapshots", evidence_review: "evidence_links", data_quality: "data_quality_issues", governance_action: "governance_cadence_actions", capacity_conflict: "capacity_conflict_actions", project_dependency: "project_dependencies",
  };
  const sourceUpdatedAt = new Map<string, string>();
  for (const [source, sourceRows] of rows) for (const row of sourceRows) sourceUpdatedAt.set(`${source}:${row.id}`, String(row.updated_at || row.created_at || "") || "");
  const receiptBySource = new Map((rows.get("collaboration_inbox_receipts") ?? []).map(row => [`${row.item_type}:${row.source_type}:${row.source_id}`, row]));
  const normalized: CollaborationInboxItem[] = items.map(item => {
    const sourceType = sourceForType[item.type];
    const receipt = receiptBySource.get(`${item.type}:${sourceType}:${item.sourceId}`);
    return { ...item, projectName: item.projectId ? projectNameById.get(item.projectId) || "授权项目" : null, sourceType, sourceUpdatedAt: sourceUpdatedAt.get(`${sourceType}:${item.sourceId}`) || null, dataClass, receiptStatus: receipt?.status as CollaborationInboxItem["receiptStatus"] | undefined, receiptVersion: receipt ? Number(receipt.version || 1) : 0 };
  }).filter(item => {
    const receipt = receiptBySource.get(`${item.type}:${item.sourceType}:${item.sourceId}`);
    return !(receipt?.status === "snoozed" && receipt.snoozed_until && new Date(String(receipt.snoozed_until)).getTime() > Date.now());
  });
  const result = sortAndSummarizeInbox(normalized);
  return json({ status: "succeeded", context, data_class: dataClass, items: result.items, summary: result.summary, unavailable_sources: unavailableSources, source: { type: "supabase", fallback_used: false }, request_id: requestId });
}

const RECEIPT_STATUSES = new Set(["unread", "read", "snoozed", "acknowledged"]);
const RECEIPT_SOURCES = new Set([
  "risks", "business_joint_check_items", "business_operating_occurrences", "project_governance_artifacts", "management_signals",
  "ai_recommendations", "decision_receipts", "feishu_action_confirmations", "formal_business_outputs", "unified_action_items",
  "project_closure_assessments", "benefit_realization_reviews", "feedback_correction_events", "reporting_snapshots", "evidence_links",
  "data_quality_issues", "governance_cadence_actions", "capacity_conflict_actions", "project_dependencies",
  "cross_role_flows",
]);

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  const user = await getCurrentUser();
  if (!user) return json({ error: "UNAUTHORIZED", request_id: requestId }, 401, requestId);
  const url = new URL(request.url);
  const role = String(url.searchParams.get("role") || "") as BusinessRole;
  const orgId = String(url.searchParams.get("org_id") || "");
  const subjectScope = String(url.searchParams.get("subject_scope") || "") as SubjectScope;
  const subjectId = String(url.searchParams.get("subject_id") || "");
  const dataClass = String(url.searchParams.get("data_class") || "production") as ManagementSignalRecord["dataClass"];
  if (!ROLES.has(role) || !orgId || !subjectScope || !subjectId) return json({ error: "BUSINESS_CONTEXT_REQUIRED", request_id: requestId }, 400, requestId);
  const assignments = await listBusinessRoleAssignments(user.id);
  if (assignments.status !== "succeeded") return json({ error: "P17_STORAGE_NOT_CONFIGURED", detail: assignments.warning, request_id: requestId }, 503, requestId);
  const context = resolveBusinessContext({ user: { id: user.id, systemRole: user.role }, assignments: assignments.data ?? [], requestedRole: role, requestedOrgId: orgId, requestedSubjectScope: subjectScope, requestedSubjectId: subjectId });
  if (!context) return json({ error: "BUSINESS_CONTEXT_FORBIDDEN", request_id: requestId }, 403, requestId);
  const mappings = await loadContextProjectIdentityMappings({ context, dataClass });
  if (mappings.status !== "succeeded") return json({ error: "PROJECT_SCOPE_MAPPING_FAILED", detail: mappings.warning, request_id: requestId }, mappings.status === "not_configured" ? 503 : 500, requestId);
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; }
  catch { return json({ error: "INVALID_JSON", request_id: requestId }, 400, requestId); }
  const itemType = String(body.item_type || "").trim();
  const sourceType = String(body.source_type || "").trim();
  const sourceId = String(body.source_id || "").trim();
  const projectId = String(body.project_id || "").trim() || null;
  const status = String(body.status || "").trim();
  const expectedVersion = Number(body.expected_version);
  const idempotencyKey = String(body.idempotency_key || "").trim();
  if (!itemType || !RECEIPT_SOURCES.has(sourceType) || !sourceId || !RECEIPT_STATUSES.has(status) || !Number.isInteger(expectedVersion) || expectedVersion < 0 || !idempotencyKey) return json({ error: "INBOX_RECEIPT_CONTRACT_INVALID", request_id: requestId }, 400, requestId);
  const projectIds = new Set((mappings.data ?? []).map(item => item.projectId));
  if (projectId && !projectIds.has(projectId)) return json({ error: "PROJECT_OUTSIDE_CONTEXT", request_id: requestId }, 403, requestId);
  const snoozeHours = Number(body.snooze_hours);
  const snoozedUntil = status === "snoozed"
    ? Number.isFinite(snoozeHours) && snoozeHours > 0 && snoozeHours <= 168
      ? new Date(Date.now() + snoozeHours * 60 * 60 * 1000).toISOString()
      : String(body.snoozed_until || "").trim()
    : null;
  if (status === "snoozed" && (!snoozedUntil || !Number.isFinite(new Date(snoozedUntil).getTime()) || new Date(snoozedUntil).getTime() <= Date.now())) return json({ error: "SNOOZE_UNTIL_INVALID", request_id: requestId }, 400, requestId);
  const supabase = getAuthSupabase();
  const sourceCheck = sourceType === "decision_receipts"
    ? await supabase.from(sourceType).select("id").eq("id", sourceId).eq("recipient_user_id", user.id).maybeSingle()
    : sourceType === "evidence_links"
      ? await supabase.from(sourceType).select("id").eq("id", sourceId).eq("org_id", orgId).maybeSingle()
      : await supabase.from(sourceType).select("id").eq("id", sourceId).eq("org_id", orgId).eq("data_class", dataClass).maybeSingle();
  if (sourceCheck.error || !sourceCheck.data) return json({ error: "INBOX_SOURCE_OUTSIDE_CONTEXT", detail: sourceCheck.error?.message, request_id: requestId }, sourceCheck.error ? 503 : 403, requestId);
  const existing = await supabase.from("collaboration_inbox_receipts").select("*").eq("user_id", user.id).eq("org_id", orgId).eq("business_role", role).eq("data_class", dataClass).eq("item_type", itemType).eq("source_type", sourceType).eq("source_id", sourceId).maybeSingle();
  if (existing.error) return json({ error: "INBOX_RECEIPT_STORAGE_UNAVAILABLE", detail: existing.error.message, request_id: requestId }, 503, requestId);
  if (existing.data && Number(existing.data.version) !== expectedVersion) return json({ error: "INBOX_RECEIPT_VERSION_CONFLICT", current_version: existing.data.version, request_id: requestId }, 409, requestId);
  if (!existing.data && expectedVersion !== 0) return json({ error: "INBOX_RECEIPT_VERSION_CONFLICT", current_version: 0, request_id: requestId }, 409, requestId);
  const mutation = existing.data
    ? await supabase.from("collaboration_inbox_receipts").update({ status, snoozed_until: snoozedUntil, last_seen_at: new Date().toISOString(), idempotency_key: idempotencyKey }).eq("id", existing.data.id).select("*").single()
    : await supabase.from("collaboration_inbox_receipts").insert({ user_id: user.id, org_id: orgId, business_role: role, data_class: dataClass, item_type: itemType, source_type: sourceType, source_id: sourceId, project_id: projectId, status, snoozed_until: snoozedUntil, idempotency_key: idempotencyKey }).select("*").single();
  if (mutation.error) return json({ error: "INBOX_RECEIPT_SAVE_FAILED", detail: mutation.error.message, request_id: requestId }, /duplicate key|unique/i.test(mutation.error.message) ? 409 : 503, requestId);
  return json({ status: "succeeded", receipt: mutation.data, request_id: requestId }, existing.data ? 200 : 201, requestId);
}
