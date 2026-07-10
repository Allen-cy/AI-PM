import { getAuthSupabase, getCurrentUser } from "@/features/auth/server";
import { resolveBusinessContext, type BusinessRole, type SubjectScope } from "@/features/operating-model/context";
import { listBusinessRoleAssignments, loadContextProjectIdentityMappings, type ManagementSignalRecord } from "@/features/operating-model/persistence";

export const runtime = "nodejs";

type InboxItem = {
  id: string;
  type: "decision_receipt" | "action" | "closure_review" | "benefit_review" | "correction" | "report_receipt" | "evidence_review" | "data_quality" | "governance_action" | "capacity_conflict" | "project_dependency";
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
  if (projectIds.length === 0) return json({ status: "succeeded", context, data_class: dataClass, items: [], unavailable_sources: [], source: { type: "supabase", fallback_used: false }, request_id: requestId });

  const supabase = getAuthSupabase();
  const queries: Array<{ source: string; promise: PromiseLike<{ data: unknown; error: { message: string } | null }> }> = [
    { source: "decision_receipts", promise: supabase.from("decision_receipts").select("id,brief_id,status,updated_at").eq("recipient_user_id", user.id).eq("recipient_business_role", role).in("status", ["pending", "disputed"]).limit(200) },
    { source: "unified_action_items", promise: supabase.from("unified_action_items").select("id,project_id,title,status,priority,due_date,source_type,source_id").in("project_id", projectIds).or(`owner_user_id.eq.${user.id},reviewer_user_id.eq.${user.id}`).not("status", "in", "(closed,cancelled,done)").limit(300) },
    { source: "feedback_correction_events", promise: supabase.from("feedback_correction_events").select("id,project_id,status,due_at,reason_detail,target_type,target_id").in("project_id", projectIds).or(`correction_owner_user_id.eq.${user.id},submitted_by.eq.${user.id}`).not("status", "in", "(closed,rejected)").limit(200) },
    { source: "reporting_snapshots", promise: supabase.from("reporting_snapshots").select("id,subject_scope,subject_id,status,period_end,narrative").eq("org_id", orgId).eq("data_class", dataClass).eq("submitted_to_user_id", user.id).eq("status", "submitted").limit(100) },
    { source: "data_quality_issues", promise: (() => { let query = supabase.from("data_quality_issues").select("id,project_id,field_name,description,severity,status,owner_user_id,due_at").eq("org_id", orgId).eq("data_class", dataClass).in("project_id", projectIds).not("status", "in", "(closed,waived)"); query = role === "pmo" ? query.or(`owner_user_id.eq.${user.id},status.eq.evidence_submitted`) : query.eq("owner_user_id", user.id); return query.limit(200); })() },
    { source: "governance_cadence_actions", promise: (() => { let query = supabase.from("governance_cadence_actions").select("id,project_id,title,status,owner_user_id,due_at").eq("org_id", orgId).eq("data_class", dataClass).in("project_id", projectIds).not("status", "in", "(closed,cancelled)"); query = role === "pmo" ? query.or(`owner_user_id.eq.${user.id},status.in.(evidence_submitted,effect_review)`) : query.eq("owner_user_id", user.id); return query.limit(200); })() },
    { source: "capacity_conflict_actions", promise: (() => { let query = supabase.from("capacity_conflict_actions").select("id,capacity_snapshot_id,action_title,status,owner_user_id,due_at,overload_hours").eq("org_id", orgId).eq("data_class", dataClass).not("status", "in", "(closed,cancelled)"); query = role === "pmo" ? query.or(`owner_user_id.eq.${user.id},status.in.(evidence_submitted,verified)`) : query.eq("owner_user_id", user.id); return query.limit(200); })() },
    { source: "project_dependencies", promise: (() => { let query = supabase.from("project_dependencies").select("id,from_project_id,to_project_id,description,status,owner_user_id,due_date").eq("org_id", orgId).eq("data_class", dataClass).in("from_project_id", projectIds).in("to_project_id", projectIds).not("status", "in", "(resolved,cancelled)"); query = role === "pmo" ? query.or(`owner_user_id.eq.${user.id},status.in.(evidence_submitted,verified)`) : query.eq("owner_user_id", user.id); return query.limit(200); })() },
  ];
  if (["pmo", "sponsor"].includes(role)) queries.push({ source: "project_closure_assessments", promise: supabase.from("project_closure_assessments").select("id,project_id,status,created_at").in("project_id", projectIds).eq("org_id", orgId).eq("data_class", dataClass).eq("status", "submitted").limit(100) });
  if (["pmo", "finance", "business_owner"].includes(role)) queries.push({ source: "benefit_realization_reviews", promise: supabase.from("benefit_realization_reviews").select("id,project_id,status,review_gate,conclusion,updated_at").in("project_id", projectIds).eq("org_id", orgId).eq("data_class", dataClass).eq("status", "submitted").limit(100) });
  if (["pmo", "sponsor", "business_owner", "finance", "quality"].includes(role)) queries.push({ source: "evidence_links", promise: supabase.from("evidence_links").select("id,subject_id,title,evidence_type,valid_until,created_at").eq("org_id", orgId).eq("subject_type", "project").in("subject_id", projectIds).is("verified_at", null).limit(200) });

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
  const rank = { critical: 0, high: 1, medium: 2, low: 3 };
  items.sort((a, b) => rank[a.priority] - rank[b.priority] || String(a.dueAt || "9999").localeCompare(String(b.dueAt || "9999")));
  return json({ status: "succeeded", context, data_class: dataClass, items, unavailable_sources: unavailableSources, source: { type: "supabase", fallback_used: false }, request_id: requestId });
}
