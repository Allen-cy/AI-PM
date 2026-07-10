import { getAuthSupabase, getCurrentUser } from "@/features/auth/server";
import { canPerformBusinessAction } from "@/features/operating-model/authorization";
import { resolveBusinessContext, type BusinessRole, type SubjectScope } from "@/features/operating-model/context";
import {
  listBusinessRoleAssignments,
  listManagementSignals,
  loadActiveMilestoneDelayRule,
  loadContextProjectIdentityMappings,
  upsertMilestoneSignal,
  type ManagementSignalRecord,
} from "@/features/operating-model/persistence";
import { loadVerifiedMilestoneSignalSource } from "@/features/operating-model/milestone-source";
import { applySignalSla, evaluateMilestoneDelay, evaluateSourceFreshness, type ManagementSignalStatus } from "@/features/operating-model/signals";

export const runtime = "nodejs";

function json(body: unknown, status = 200, requestId = crypto.randomUUID()) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store", "X-Request-Id": requestId } });
}

function dataClass(value: string | null): ManagementSignalRecord["dataClass"] | null {
  if (!value) return "production";
  return ["production", "sample", "test", "diagnostic", "unclassified"].includes(value)
    ? value as ManagementSignalRecord["dataClass"]
    : null;
}

export async function GET(request: Request): Promise<Response> {
  const requestId = crypto.randomUUID();
  const user = await getCurrentUser();
  if (!user) return json({ error: "UNAUTHORIZED", request_id: requestId }, 401, requestId);
  const url = new URL(request.url);
  const orgId = url.searchParams.get("org_id");
  const subjectScope = url.searchParams.get("subject_scope") as SubjectScope | null;
  const subjectId = url.searchParams.get("subject_id");
  const role = url.searchParams.get("role") as BusinessRole | null;
  const requestedDataClass = dataClass(url.searchParams.get("data_class"));
  if (!(orgId && subjectScope && subjectId && role) || !requestedDataClass) {
    return json({ error: "CONTEXT_AND_DATA_CLASS_REQUIRED", request_id: requestId }, 400, requestId);
  }
  const assignments = await listBusinessRoleAssignments(user.id);
  if (assignments.status !== "succeeded") return json({ error: "P17_STORAGE_NOT_CONFIGURED", detail: assignments.warning, request_id: requestId }, 503, requestId);
  const context = resolveBusinessContext({
    user: { id: user.id, systemRole: user.role },
    assignments: assignments.data ?? [],
    requestedRole: role,
    requestedOrgId: orgId,
    requestedSubjectScope: subjectScope,
    requestedSubjectId: subjectId,
  });
  if (!context || !canPerformBusinessAction(context, "project.read", { orgId, subjectScope, subjectId })) {
    return json({ error: "SIGNAL_SCOPE_FORBIDDEN", request_id: requestId }, 403, requestId);
  }
  const contextMappings = await loadContextProjectIdentityMappings({ context, dataClass: requestedDataClass });
  if (contextMappings.status !== "succeeded") return json({ error: "PROJECT_SCOPE_MAPPING_FAILED", detail: contextMappings.warning, request_id: requestId }, contextMappings.status === "not_configured" ? 503 : 500, requestId);
  const result = await listManagementSignals({
    orgId,
    subjectScope: subjectScope === "project" ? subjectScope : undefined,
    subjectId: subjectScope === "project" ? subjectId : undefined,
    projectIds: (contextMappings.data ?? []).map(item => item.projectId),
    status: (url.searchParams.get("status") || undefined) as ManagementSignalStatus | undefined,
    dataClass: requestedDataClass,
  });
  return json({
    request_id: requestId,
    context,
    data_class: requestedDataClass,
    signals: result.data ?? [],
    status: result.status,
    warning: result.warning,
    source: { type: "supabase", fallback_used: false },
  }, result.status === "succeeded" ? 200 : result.status === "not_configured" ? 503 : 500, requestId);
}

export async function POST(request: Request): Promise<Response> {
  const requestId = crypto.randomUUID();
  const user = await getCurrentUser();
  if (!user) return json({ error: "UNAUTHORIZED", request_id: requestId }, 401, requestId);
  let raw: Record<string, unknown>;
  try {
    raw = await request.json() as Record<string, unknown>;
  } catch {
    return json({ error: "INVALID_JSON", request_id: requestId }, 400, requestId);
  }

  const requestedProjectId = String(raw.project_id || "").trim();
  const requestedSourceId = String(raw.source_id || "").trim();
  if (!requestedProjectId || !requestedSourceId) return json({ error: "PROJECT_AND_FEISHU_SOURCE_REQUIRED", request_id: requestId }, 400, requestId);
  const source = await loadVerifiedMilestoneSignalSource({ projectId: requestedProjectId, sourceRecordId: requestedSourceId });
  if (source.status !== "succeeded" || !source.data) {
    const status = source.status === "not_found" ? 404 : source.status === "not_configured" ? 503 : source.status === "conflict" ? 409 : 500;
    return json({ error: "MILESTONE_SOURCE_NOT_VERIFIED", detail: source.warning, request_id: requestId }, status, requestId);
  }
  const input = source.data;
  const role = String(raw.business_role || "") as BusinessRole;
  const assignments = await listBusinessRoleAssignments(user.id);
  if (assignments.status !== "succeeded") return json({ error: "P17_STORAGE_NOT_CONFIGURED", detail: assignments.warning, request_id: requestId }, 503, requestId);
  const context = resolveBusinessContext({
    user: { id: user.id, systemRole: user.role },
    assignments: assignments.data ?? [],
    requestedRole: role,
    requestedOrgId: input.orgId,
    requestedSubjectScope: "project",
    requestedSubjectId: input.projectId,
  });
  const resource = { orgId: input.orgId, subjectScope: "project" as const, subjectId: input.projectId };
  if (!context || !(canPerformBusinessAction(context, "milestone.update", resource) || canPerformBusinessAction(context, "signal.verify", resource))) {
    return json({ error: "SIGNAL_CREATE_FORBIDDEN", request_id: requestId }, 403, requestId);
  }
  const rule = await loadActiveMilestoneDelayRule(input.orgId, input.projectId, input.dataClass);
  if (rule.status !== "succeeded" || !rule.data) {
    return json({ error: "MILESTONE_RULE_NOT_ACTIVE", detail: rule.warning, request_id: requestId }, rule.status === "not_configured" ? 503 : 409, requestId);
  }
  if (rule.data.dataFreshnessHours) {
    const freshness = evaluateSourceFreshness(input.sourceUpdatedAt, rule.data.dataFreshnessHours);
    if (!freshness.valid) {
      const supabase = getAuthSupabase();
      const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
      const due = await supabase.rpc("add_org_workdays", { p_org_id: input.orgId, p_start: today, p_days: 1 });
      const quality = due.error ? { error: due.error } : await supabase.rpc("save_data_quality_scan_tx", {
        p_org_id: input.orgId,
        p_data_class: input.dataClass,
        p_actor_id: user.id,
        p_issues: [{ project_id: input.projectId, rule_key: "milestone_source_freshness", field_name: "里程碑数据新鲜度", severity: "high", description: input.sourceUpdatedAt ? `里程碑来源数据已超过${rule.data.dataFreshnessHours}小时新鲜度阈值。` : "飞书里程碑记录未返回可验证的最后更新时间。", owner_user_id: input.ownerUserId || user.id, due_at: `${due.data}T18:00:00+08:00`, dedup_key: `${input.projectId}:milestone_source_freshness:${input.sourceId}:${input.dataClass}` }],
        p_idempotency_key: `milestone-freshness:${input.projectId}:${input.sourceId}:${rule.data.version}:${input.sourceUpdatedAt || "missing"}`,
      });
      return json({ error: "MILESTONE_SOURCE_STALE", detail: freshness.ageHours === null ? "里程碑来源无法证明数据新鲜度，已阻止正式信号判定。" : `里程碑来源已过期 ${freshness.ageHours} 小时，超过 ${rule.data.dataFreshnessHours} 小时阈值。`, data_quality_task_status: quality.error ? "unavailable" : "created_or_updated", data_quality_warning: quality.error?.message, request_id: requestId }, 409, requestId);
    }
  }
  const evaluated = evaluateMilestoneDelay(input, rule.data);
  if (!evaluated) {
    return json({ request_id: requestId, triggered: false, reason: "未达到规则触发条件或已有批准基线变更。" }, 200, requestId);
  }
  const evaluation = applySignalSla(evaluated, rule.data);
  const result = await upsertMilestoneSignal({
    evaluation,
    orgId: input.orgId,
    projectId: input.projectId,
    milestoneId: input.milestoneId,
    baselineVersion: input.baselineVersion,
    dataClass: input.dataClass,
    ownerUserId: input.ownerUserId || user.id,
    sourceId: input.sourceId,
    observation: {
      baselineDueDate: input.baselineDueDate,
      forecastDueDate: input.forecastDueDate,
      status: input.status,
      approvedBaselineChange: input.approvedBaselineChange,
      impacts: input.impacts,
    },
    actor: user,
    requestId,
  });
  return json({ request_id: requestId, triggered: true, status: result.status, signal: result.data, warning: result.warning },
    result.status === "succeeded" ? 201 : result.status === "not_configured" ? 503 : 500, requestId);
}
