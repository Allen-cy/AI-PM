import { getAuthSupabase, isAuthStorageConfigured, type AppUser } from "../auth/server.ts";
import { writeOperationAudit } from "../security/repository.ts";
import { validateActionClosureEvidence, type ActionClosureEvidence } from "./actions.ts";
import type { BusinessRole, BusinessRoleAssignment, SubjectScope } from "./context.ts";
import {
  buildManagementSignalInsert,
  mapBusinessRoleAssignment,
} from "./repository.ts";
import {
  transitionManagementSignal,
  S1_MILESTONE_DELAY_RULE_VERSION,
  type MilestoneDelayRuleConfig,
  type MilestoneImpactFlags,
  type ManagementSignalAction,
  type ManagementSignalStatus,
  type MilestoneDelayEvaluation,
} from "./signals.ts";
import { resolveMilestoneDelayRuleFromMatrix } from "./pmo-control.ts";

export interface PersistenceResult<T> {
  status: "succeeded" | "not_configured" | "not_found" | "conflict" | "failed";
  data?: T;
  warning?: string;
}

export interface ManagementSignalRecord {
  id: string;
  orgId: string;
  subjectScope: SubjectScope;
  subjectId: string;
  projectId: string | null;
  dataClass: "production" | "sample" | "test" | "diagnostic" | "unclassified";
  signalType: string;
  ruleVersion: string;
  baselineVersion: string | null;
  severity: "low" | "medium" | "high" | "critical";
  route: "action" | "escalation";
  status: ManagementSignalStatus;
  title: string;
  summary: string | null;
  impact: Record<string, unknown>;
  payload: Record<string, unknown>;
  dedupKey: string;
  ownerUserId: string | null;
  reviewerUserId: string | null;
  dueAt: string | null;
  sourceType: string;
  sourceId: string;
  snapshotAt: string;
  createdAt: string;
  updatedAt: string;
}

function missing(message: string): boolean {
  return /relation .* does not exist|schema cache|Could not find the table|management_signals|user_business_roles/i.test(message);
}

function mapSignal(row: Record<string, unknown>): ManagementSignalRecord {
  return {
    id: String(row.id),
    orgId: String(row.org_id),
    subjectScope: String(row.subject_scope) as SubjectScope,
    subjectId: String(row.subject_id),
    projectId: row.project_id ? String(row.project_id) : null,
    dataClass: String(row.data_class || "unclassified") as ManagementSignalRecord["dataClass"],
    signalType: String(row.signal_type),
    ruleVersion: String(row.rule_version),
    baselineVersion: row.baseline_version ? String(row.baseline_version) : null,
    severity: String(row.severity || "medium") as ManagementSignalRecord["severity"],
    route: String(row.route) as ManagementSignalRecord["route"],
    status: String(row.status) as ManagementSignalStatus,
    title: String(row.title),
    summary: row.summary ? String(row.summary) : null,
    impact: typeof row.impact === "object" && row.impact !== null ? row.impact as Record<string, unknown> : {},
    payload: typeof row.payload === "object" && row.payload !== null ? row.payload as Record<string, unknown> : {},
    dedupKey: String(row.dedup_key),
    ownerUserId: row.owner_user_id ? String(row.owner_user_id) : null,
    reviewerUserId: row.reviewer_user_id ? String(row.reviewer_user_id) : null,
    dueAt: row.due_at ? String(row.due_at) : null,
    sourceType: String(row.source_type),
    sourceId: String(row.source_id),
    snapshotAt: String(row.snapshot_at),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export async function loadActiveMilestoneDelayRule(
  orgId: string,
  projectId?: string,
  dataClass?: ManagementSignalRecord["dataClass"],
): Promise<PersistenceResult<MilestoneDelayRuleConfig>> {
  if (!isAuthStorageConfigured()) return { status: "not_configured", warning: "AUTH_STORAGE_NOT_CONFIGURED" };
  const supabase = getAuthSupabase();
  if (projectId) {
    const [project, links] = await Promise.all([
      supabase.from("projects").select("id,project_level,data_class").eq("id", projectId).eq("org_id", orgId).maybeSingle(),
      supabase.from("portfolio_project_links").select("portfolio_id").eq("org_id", orgId).eq("project_id", projectId),
    ]);
    if (project.error || links.error) return { status: missing(project.error?.message || links.error?.message || "") ? "not_configured" : "failed", warning: project.error?.message || links.error?.message };
    if (!project.data || (dataClass && project.data.data_class !== dataClass)) return { status: "not_found", warning: "项目不在当前组织或数据分类中。" };
    const portfolioIds = [...new Set((links.data ?? []).map(row => String(row.portfolio_id)))];
    let matrixQuery = supabase.from("project_level_rule_matrices").select("id,portfolio_id,version,rules,effective_from").eq("org_id", orgId).eq("data_class", dataClass || project.data.data_class).eq("status", "active");
    matrixQuery = portfolioIds.length > 0 ? matrixQuery.or(`portfolio_id.is.null,portfolio_id.in.(${portfolioIds.join(",")})`) : matrixQuery.is("portfolio_id", null);
    const matrices = await matrixQuery.order("effective_from", { ascending: false });
    if (!matrices.error && (matrices.data?.length ?? 0) > 0) {
      const scoped = (matrices.data ?? []).filter(row => row.portfolio_id);
      if (scoped.length > 1) return { status: "conflict", warning: "项目同时命中多个组合规则矩阵，请PMO明确主治理组合。" };
      const selected = scoped[0] ?? (matrices.data ?? []).find(row => !row.portfolio_id);
      const resolved = selected ? resolveMilestoneDelayRuleFromMatrix({ projectLevel: project.data.project_level ? String(project.data.project_level) : null, matrixVersion: String(selected.version), rules: selected.rules && typeof selected.rules === "object" ? selected.rules as Record<string, unknown> : {} }) : null;
      if (!resolved) return { status: "conflict", warning: "生效的P20分级规则矩阵未提供当前项目等级的里程碑延期规则。" };
      return { status: "succeeded", data: resolved };
    }
    if (matrices.error && !missing(matrices.error.message)) return { status: "failed", warning: matrices.error.message };
  }
  const { data, error } = await supabase.from("management_rule_versions")
    .select("version,configuration,status")
    .eq("rule_key", "milestone_delay")
    .eq("version", S1_MILESTONE_DELAY_RULE_VERSION)
    .eq("status", "active")
    .or(`org_id.eq.${orgId},org_id.is.null`)
    .order("org_id", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  if (error) return { status: missing(error.message) ? "not_configured" : "failed", warning: error.message };
  if (!data) return { status: "conflict", warning: "S1里程碑延期规则尚未由管理员批准启用。" };
  const config = (data.configuration && typeof data.configuration === "object" ? data.configuration : {}) as Record<string, unknown>;
  const warningWorkdays = Number(config.warning_workdays ?? config.warningWorkdays ?? 1);
  const pmoToleranceWorkdays = Number(config.pmo_tolerance_workdays ?? config.pmoToleranceWorkdays ?? 3);
  const escalationHours = Number(config.escalation_hours ?? config.escalationHours ?? 24);
  const allowedImpacts = ["criticalPath", "stageGate", "customerCommitment", "acceptance", "cash", "majorRisk", "crossProjectResource"] as const;
  const configuredImpacts = Array.isArray(config.major_impacts) ? config.major_impacts.map(String) : [...allowedImpacts];
  const majorImpacts = allowedImpacts.filter(item => configuredImpacts.includes(item));
  if (!Number.isFinite(warningWorkdays) || warningWorkdays < 1 || !Number.isFinite(pmoToleranceWorkdays) || pmoToleranceWorkdays < warningWorkdays || !Number.isFinite(escalationHours) || escalationHours <= 0) {
    return { status: "conflict", warning: "S1里程碑延期规则配置无效。" };
  }
  return {
    status: "succeeded",
    data: {
      version: S1_MILESTONE_DELAY_RULE_VERSION,
      warningWorkdays,
      pmoToleranceWorkdays,
      majorImpacts,
      escalationHours,
    },
  };
}

export async function listBusinessRoleAssignments(userId: string): Promise<PersistenceResult<BusinessRoleAssignment[]>> {
  if (!isAuthStorageConfigured()) return { status: "not_configured", warning: "AUTH_STORAGE_NOT_CONFIGURED" };
  const { data, error } = await getAuthSupabase()
    .from("user_business_roles")
    .select("*")
    .eq("user_id", userId);
  if (error) {
    const isMissing = missing(error.message);
    return {
      status: isMissing ? "not_configured" : "failed",
      warning: isMissing ? `请先执行P17/S1数据库迁移。原始错误：${error.message}` : error.message,
    };
  }
  return { status: "succeeded", data: (data ?? []).map(row => mapBusinessRoleAssignment(row as Record<string, unknown>)) };
}

export async function listManagementSignals(input: {
  orgId: string;
  subjectScope?: SubjectScope;
  subjectId?: string;
  status?: ManagementSignalStatus;
  dataClass?: ManagementSignalRecord["dataClass"];
  projectIds?: string[];
  limit?: number;
}): Promise<PersistenceResult<ManagementSignalRecord[]>> {
  if (!isAuthStorageConfigured()) return { status: "not_configured", warning: "AUTH_STORAGE_NOT_CONFIGURED" };
  let query = getAuthSupabase()
    .from("management_signals")
    .select("*")
    .eq("org_id", input.orgId)
    .order("updated_at", { ascending: false })
    .limit(Math.max(1, Math.min(input.limit ?? 100, 200)));
  if (input.subjectScope) query = query.eq("subject_scope", input.subjectScope);
  if (input.subjectId) query = query.eq("subject_id", input.subjectId);
  if (input.status) query = query.eq("status", input.status);
  if (input.dataClass) query = query.eq("data_class", input.dataClass);
  if (input.projectIds) {
    if (input.projectIds.length === 0) return { status: "succeeded", data: [] };
    query = query.in("project_id", input.projectIds);
  }
  const { data, error } = await query;
  if (error) return { status: missing(error.message) ? "not_configured" : "failed", warning: error.message };
  return { status: "succeeded", data: (data ?? []).map(row => mapSignal(row as Record<string, unknown>)) };
}

export async function getManagementSignal(signalId: string): Promise<PersistenceResult<ManagementSignalRecord>> {
  if (!isAuthStorageConfigured()) return { status: "not_configured", warning: "AUTH_STORAGE_NOT_CONFIGURED" };
  const { data, error } = await getAuthSupabase().from("management_signals").select("*").eq("id", signalId).maybeSingle();
  if (error) return { status: missing(error.message) ? "not_configured" : "failed", warning: error.message };
  if (!data) return { status: "not_found", warning: "管理信号不存在。" };
  return { status: "succeeded", data: mapSignal(data as Record<string, unknown>) };
}

export async function upsertMilestoneSignal(input: {
  evaluation: MilestoneDelayEvaluation;
  orgId: string;
  projectId: string;
  milestoneId: string;
  baselineVersion: string;
  dataClass: ManagementSignalRecord["dataClass"];
  ownerUserId: string | null;
  sourceId: string;
  observation?: {
    baselineDueDate: string;
    forecastDueDate: string;
    status: string;
    approvedBaselineChange: boolean;
    impacts: MilestoneImpactFlags;
  };
  actor: AppUser;
  requestId: string;
}): Promise<PersistenceResult<ManagementSignalRecord>> {
  if (!isAuthStorageConfigured()) return { status: "not_configured", warning: "AUTH_STORAGE_NOT_CONFIGURED" };
  const signalPayload = buildManagementSignalInsert(input);
  const { data: existing, error: existingError } = await getAuthSupabase()
    .from("management_signals")
    .select("id,status,created_by,verified_at,reviewed_at,closed_at,due_at")
    .eq("org_id", input.orgId)
    .eq("dedup_key", input.evaluation.dedupKey)
    .maybeSingle();
  if (existingError) return { status: missing(existingError.message) ? "not_configured" : "failed", warning: existingError.message };
  const now = new Date().toISOString();
  const payload = {
    ...signalPayload,
    snapshot_at: now,
    updated_by: input.actor.id,
    updated_at: now,
  } as Record<string, unknown>;
  let query;
  if (existing) {
    delete payload.status;
    delete payload.created_by;
    delete payload.due_at;
    query = getAuthSupabase().from("management_signals").update(payload).eq("id", existing.id).select("*").single();
  } else {
    payload.created_by = input.actor.id;
    query = getAuthSupabase().from("management_signals").insert(payload).select("*").single();
  }
  let { data, error } = await query;
  if (error && !existing && error.code === "23505") {
    const retry = await getAuthSupabase().from("management_signals")
      .update(Object.fromEntries(Object.entries(payload).filter(([key]) => key !== "status" && key !== "created_by")))
      .eq("org_id", input.orgId)
      .eq("dedup_key", input.evaluation.dedupKey)
      .select("*")
      .single();
    data = retry.data;
    error = retry.error;
  }
  if (error) return { status: missing(error.message) ? "not_configured" : "failed", warning: error.message };
  await writeOperationAudit({
    user: input.actor,
    action: "management_signal_upsert",
    resourceType: "management_signal",
    resourceId: data.id,
    status: "succeeded",
    severity: input.evaluation.route === "escalation" ? "high" : "medium",
    summary: `${existing ? "里程碑信号事实已刷新" : "里程碑信号已登记"}：${input.milestoneId}`,
    detail: { projectId: input.projectId, ruleVersion: input.evaluation.ruleVersion, dataClass: input.dataClass, preservedStatus: existing?.status ?? null },
    requestId: input.requestId,
  });
  return { status: "succeeded", data: mapSignal(data as Record<string, unknown>) };
}

export async function transitionManagementSignalRecord(input: {
  signalId: string;
  action: ManagementSignalAction;
  actor: AppUser;
  actorBusinessRole: BusinessRole;
  comment?: string;
  reasonCode?: string;
  evidence?: Array<Record<string, unknown>>;
  requestId: string;
}): Promise<PersistenceResult<ManagementSignalRecord>> {
  if (!isAuthStorageConfigured()) return { status: "not_configured", warning: "AUTH_STORAGE_NOT_CONFIGURED" };
  const supabase = getAuthSupabase();
  const { data: current, error: readError } = await supabase.from("management_signals").select("*").eq("id", input.signalId).maybeSingle();
  if (readError) return { status: missing(readError.message) ? "not_configured" : "failed", warning: readError.message };
  if (!current) return { status: "not_found", warning: "管理信号不存在。" };

  let next: ManagementSignalStatus;
  try {
    next = transitionManagementSignal(String(current.status) as ManagementSignalStatus, input.action);
  } catch (error) {
    return { status: "conflict", warning: error instanceof Error ? error.message : "状态转换不允许。" };
  }
  const { data: updated, error: transitionError } = await supabase.rpc("transition_management_signal_tx", {
    p_signal_id: input.signalId,
    p_expected_status: current.status,
    p_next_status: next,
    p_event_type: input.action,
    p_actor_user_id: input.actor.id,
    p_actor_business_role: input.actorBusinessRole,
    p_comment: input.comment || null,
    p_reason_code: input.reasonCode || null,
    p_evidence: input.evidence ?? [],
    p_request_id: input.requestId,
  });
  if (transitionError) {
    const conflict = /MANAGEMENT_SIGNAL_CONFLICT|serialization|40001/i.test(transitionError.message);
    return { status: conflict ? "conflict" : missing(transitionError.message) ? "not_configured" : "failed", warning: transitionError.message };
  }
  if (!updated) return { status: "conflict", warning: "信号已被其他操作更新，请刷新后重试。" };

  await writeOperationAudit({
    user: input.actor,
    action: `management_signal_${input.action}`,
    resourceType: "management_signal",
    resourceId: input.signalId,
    status: "succeeded",
    severity: next === "pending_decision_brief" ? "high" : "medium",
    summary: `管理信号状态：${current.status} → ${next}`,
    detail: { actorBusinessRole: input.actorBusinessRole, reasonCode: input.reasonCode },
    requestId: input.requestId,
  });
  return { status: "succeeded", data: mapSignal(updated as Record<string, unknown>) };
}

export async function reviewAndRouteManagementSignal(input: {
  signalId: string;
  actor: AppUser;
  actorBusinessRole: BusinessRole;
  comment?: string;
  requestId: string;
}): Promise<PersistenceResult<{ signal: ManagementSignalRecord; actionId?: string; escalationId?: string }>> {
  const currentResult = await getManagementSignal(input.signalId);
  if (currentResult.status !== "succeeded" || !currentResult.data) return currentResult as PersistenceResult<never>;
  let current = currentResult.data;
  if (current.status === "verified") {
    const review = await transitionManagementSignalRecord({
      signalId: input.signalId,
      action: "start_review",
      actor: input.actor,
      actorBusinessRole: input.actorBusinessRole,
      comment: input.comment,
      requestId: input.requestId,
    });
    if (review.status !== "succeeded" || !review.data) return review as PersistenceResult<never>;
    current = review.data;
  }
  if (current.status === "action_required" || current.status === "pending_decision_brief") {
    return { status: "succeeded", data: { signal: current } };
  }
  if (current.status !== "under_review") {
    return { status: "conflict", warning: `状态 ${current.status} 不能进行PMO路由。` };
  }

  const supabase = getAuthSupabase();
  const shanghaiToday = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const [actionDue, escalationDue] = await Promise.all([
    supabase.rpc("add_org_workdays", { p_org_id: current.orgId, p_start: shanghaiToday, p_days: 3 }),
    supabase.rpc("add_org_workdays", { p_org_id: current.orgId, p_start: shanghaiToday, p_days: 1 }),
  ]);
  if (actionDue.error || escalationDue.error) return { status: "not_configured", warning: actionDue.error?.message || escalationDue.error?.message };

  let escalationTargetUserId: string | null = null;
  if (current.route === "escalation") {
    if (!current.ownerUserId) return { status: "conflict", warning: "升级信号缺少原责任人，无法匹配PM/运营→PMO汇报关系。" };
    const exact = await supabase.from("business_reporting_relationships")
      .select("to_user_id")
      .eq("org_id", current.orgId)
      .eq("from_user_id", current.ownerUserId)
      .eq("to_business_role", "pmo")
      .eq("subject_scope", current.subjectScope)
      .eq("subject_id", current.subjectId)
      .eq("status", "active")
      .lte("valid_from", new Date().toISOString())
      .or(`valid_until.is.null,valid_until.gte.${new Date().toISOString()}`)
      .limit(1)
      .maybeSingle();
    if (exact.error) return { status: missing(exact.error.message) ? "not_configured" : "failed", warning: exact.error.message };
    escalationTargetUserId = exact.data?.to_user_id ?? null;
    if (!escalationTargetUserId) return { status: "conflict", warning: "未配置当前项目的PM/运营→PMO有效汇报关系，升级已停止。" };
  }
  const nextStatus: ManagementSignalStatus = current.route === "action" ? "action_required" : "pending_decision_brief";
  const { data: routedPayload, error: routeError } = await supabase.rpc("route_management_signal_tx", {
    p_signal_id: current.id,
    p_expected_status: current.status,
    p_next_status: nextStatus,
    p_actor_user_id: input.actor.id,
    p_actor_business_role: input.actorBusinessRole,
    p_comment: input.comment || null,
    p_request_id: input.requestId,
    p_action_due_date: actionDue.data,
    p_escalation_target_user_id: escalationTargetUserId,
    p_escalation_target_role: "pmo",
    p_escalation_due_at: escalationDue.data ? `${escalationDue.data}T18:00:00+08:00` : null,
  });
  if (routeError) {
    const conflict = /MANAGEMENT_SIGNAL_CONFLICT|serialization|40001/i.test(routeError.message);
    return { status: conflict ? "conflict" : missing(routeError.message) ? "not_configured" : "failed", warning: routeError.message };
  }
  const routed = routedPayload as { signal?: Record<string, unknown>; action_id?: string | null; escalation_id?: string | null } | null;
  if (!routed?.signal) return { status: "failed", warning: "信号路由事务未返回结果。" };
  await writeOperationAudit({
    user: input.actor,
    action: current.route === "action" ? "management_signal_route_action" : "management_signal_escalate",
    resourceType: "management_signal",
    resourceId: current.id,
    status: "succeeded",
    severity: current.route === "escalation" ? "high" : "medium",
    summary: `管理信号已原子路由至${current.route === "action" ? "责任行动" : "PMO升级收件箱"}`,
    detail: { actionId: routed.action_id, escalationId: routed.escalation_id, escalationTargetUserId },
    requestId: input.requestId,
  });
  return {
    status: "succeeded",
    data: {
      signal: mapSignal(routed.signal),
      actionId: routed.action_id || undefined,
      escalationId: routed.escalation_id || undefined,
    },
  };
}

export async function transitionSignalAction(input: {
  signalId: string;
  actionId: string;
  operation: "accept" | "reject" | "start" | "submit_evidence" | "verify_evidence" | "close" | "reopen";
  actor: AppUser;
  actorBusinessRole: BusinessRole;
  comment?: string;
  evidence?: ActionClosureEvidence[];
  effectReview?: Record<string, unknown>;
  requestId: string;
}): Promise<PersistenceResult<{ signal: ManagementSignalRecord; action: Record<string, unknown> }>> {
  if (!isAuthStorageConfigured()) return { status: "not_configured", warning: "AUTH_STORAGE_NOT_CONFIGURED" };
  const signalResult = await getManagementSignal(input.signalId);
  if (signalResult.status !== "succeeded" || !signalResult.data) return signalResult as PersistenceResult<never>;
  const signal = signalResult.data;
  const supabase = getAuthSupabase();
  const { data: currentAction, error: actionError } = await supabase.from("unified_action_items")
    .select("*")
    .eq("id", input.actionId)
    .eq("source_type", "signal")
    .eq("source_id", input.signalId)
    .maybeSingle();
  if (actionError) return { status: "failed", warning: actionError.message };
  if (!currentAction) return { status: "not_found", warning: "信号行动项不存在。" };

  const currentStatus = String(currentAction.status);
  const allowed: Record<typeof input.operation, string[]> = {
    accept: ["open", "assigned", "rejected"],
    reject: ["open", "assigned", "accepted"],
    start: ["accepted"],
    submit_evidence: ["in_progress"],
    verify_evidence: ["evidence_submitted"],
    close: ["evidence_submitted"],
    reopen: ["evidence_submitted", "closed"],
  };
  if (!allowed[input.operation].includes(currentStatus)) {
    return { status: "conflict", warning: `行动项状态 ${currentStatus} 不能执行 ${input.operation}。` };
  }
  if (input.operation === "reject" && !input.comment?.trim()) return { status: "conflict", warning: "拒收必须填写原因。" };
  if (input.operation === "submit_evidence" || input.operation === "verify_evidence" || input.operation === "close") {
    const evidence = input.evidence ?? (Array.isArray(currentAction.evidence) ? currentAction.evidence as ActionClosureEvidence[] : []);
    const validation = validateActionClosureEvidence(evidence);
    if (!validation.valid) return { status: "conflict", warning: validation.errors.join(" ") };
    if (input.operation !== "submit_evidence") {
      const registered = await supabase.from("evidence_links")
        .select("id,source_type,source_id,verified_by,verified_at,metadata")
        .eq("org_id", signal.orgId)
        .eq("subject_type", "management_signal")
        .eq("subject_id", signal.id)
        .contains("metadata", { action_id: input.actionId });
      if (registered.error) return { status: missing(registered.error.message) ? "not_configured" : "failed", warning: registered.error.message };
      const bySource = new Map((registered.data ?? []).map(item => [`${item.source_type}:${item.source_id}`, item]));
      const missingEvidence = evidence.filter(item => !bySource.has(`${item.sourceType}:${item.sourceId}`));
      if (missingEvidence.length > 0) return { status: "conflict", warning: "关闭证据未登记到当前信号行动，请先重新提交证据。" };
      if (input.operation === "close") {
        const unverified = evidence.filter(item => {
          const row = bySource.get(`${item.sourceType}:${item.sourceId}`);
          return !row?.verified_by || !row?.verified_at;
        });
        if (unverified.length > 0) return { status: "conflict", warning: "关闭前必须由PMO或授权复核人显式核验所有证据。" };
      }
    }
  }
  if (input.operation === "close" && !String(input.effectReview?.outcome || "").trim()) {
    return { status: "conflict", warning: "PMO关闭前必须填写效果复核结论。" };
  }

  const nextStatus = {
    accept: "accepted",
    reject: "rejected",
    start: "in_progress",
    submit_evidence: "evidence_submitted",
    verify_evidence: "evidence_submitted",
    close: "closed",
    reopen: "in_progress",
  }[input.operation];
  const signalOperation = input.operation === "accept" ? "accept_action"
    : input.operation === "reject" ? "reject_action"
      : input.operation === "submit_evidence" ? "submit_evidence"
        : input.operation === "close" ? "close"
          : input.operation === "reopen" ? "reopen"
            : null;
  let nextSignalStatus: ManagementSignalStatus | null = null;
  if (signalOperation) {
    try {
      nextSignalStatus = transitionManagementSignal(signal.status, signalOperation);
    } catch (error) {
      return { status: "conflict", warning: error instanceof Error ? error.message : "信号状态与行动项不一致。" };
    }
  }
  const { data: transactionPayload, error: transactionError } = await supabase.rpc("transition_signal_action_tx", {
    p_signal_id: input.signalId,
    p_action_id: input.actionId,
    p_expected_action_status: currentStatus,
    p_next_action_status: nextStatus,
    p_expected_signal_status: signal.status,
    p_next_signal_status: nextSignalStatus,
    p_operation: input.operation,
    p_actor_user_id: input.actor.id,
    p_actor_business_role: input.actorBusinessRole,
    p_comment: input.comment || null,
    p_evidence: input.evidence ?? (Array.isArray(currentAction.evidence) ? currentAction.evidence : []),
    p_effect_review: input.effectReview ?? {},
    p_request_id: input.requestId,
  });
  if (transactionError) {
    const conflict = /SIGNAL_ACTION_CONFLICT|SIGNAL_ACTION_EVIDENCE_|MANAGEMENT_SIGNAL_CONFLICT|serialization|40001/i.test(transactionError.message);
    return { status: conflict ? "conflict" : missing(transactionError.message) ? "not_configured" : "failed", warning: transactionError.message };
  }
  const transaction = transactionPayload as { signal?: Record<string, unknown>; action?: Record<string, unknown> } | null;
  if (!transaction?.signal || !transaction.action) return { status: "failed", warning: "行动闭环事务未返回完整结果。" };
  await writeOperationAudit({
    user: input.actor,
    action: `signal_action_${input.operation}`,
    resourceType: "unified_action_item",
    resourceId: input.actionId,
    status: "succeeded",
    severity: input.operation === "close" || input.operation === "reopen" ? "medium" : "low",
    summary: `信号行动项：${currentStatus} → ${nextStatus}`,
    detail: { signalId: input.signalId, actorBusinessRole: input.actorBusinessRole },
    requestId: input.requestId,
  });
  return { status: "succeeded", data: { signal: mapSignal(transaction.signal), action: transaction.action } };
}

export interface Project360Data {
  project: Record<string, unknown>;
  risks: Record<string, unknown>[];
  issues: Record<string, unknown>[];
  changes: Record<string, unknown>[];
  actions: Record<string, unknown>[];
  governance: Record<string, unknown>[];
  signals: ManagementSignalRecord[];
  evidence: Record<string, unknown>[];
  lifecycleStates: Record<string, unknown>[];
  lifecycleEvents: Record<string, unknown>[];
  corrections: Record<string, unknown>[];
  reportingSnapshots: Record<string, unknown>[];
  metricObservations: Record<string, unknown>[];
  decisionBriefs: Record<string, unknown>[];
  decisions: Record<string, unknown>[];
  costs: Record<string, unknown>[];
  contracts: Record<string, unknown>[];
  payments: Record<string, unknown>[];
  benefitBaselines: Record<string, unknown>[];
  benefitReviews: Record<string, unknown>[];
  closureAssessments: Record<string, unknown>[];
  knowledgeCandidates: Record<string, unknown>[];
  knowledgeReuse: Record<string, unknown>[];
  retrospectives: Record<string, unknown>[];
  knowledgeRecommendations: Record<string, unknown>[];
}

export interface ProjectAccessScope {
  projectId: string;
  orgId: string;
  dataClass: ManagementSignalRecord["dataClass"];
  portfolioIds: string[];
}

export interface ContextProjectIdentityMapping {
  projectId: string;
  sourceRecordId: string;
  externalProjectCode: string | null;
  dataClass: ManagementSignalRecord["dataClass"];
}

export async function loadContextProjectIdentityMappings(input: {
  context: { orgId: string; subjectScope: SubjectScope; subjectId: string };
  dataClass: ManagementSignalRecord["dataClass"];
}): Promise<PersistenceResult<ContextProjectIdentityMapping[]>> {
  if (!isAuthStorageConfigured()) return { status: "not_configured", warning: "AUTH_STORAGE_NOT_CONFIGURED" };
  const supabase = getAuthSupabase();
  let projectIds: string[] = [];
  if (input.context.subjectScope === "project") projectIds = [input.context.subjectId];
  else if (input.context.subjectScope === "portfolio") {
    const links = await supabase.from("portfolio_project_links").select("project_id").eq("org_id", input.context.orgId).eq("portfolio_id", input.context.subjectId);
    if (links.error) return { status: missing(links.error.message) ? "not_configured" : "failed", warning: links.error.message };
    projectIds = (links.data ?? []).map(row => String(row.project_id));
  } else if (input.context.subjectScope === "organization") {
    const projects = await supabase.from("projects").select("id").eq("org_id", input.context.orgId).eq("data_class", input.dataClass);
    if (projects.error) return { status: missing(projects.error.message) ? "not_configured" : "failed", warning: projects.error.message };
    projectIds = (projects.data ?? []).map(row => String(row.id));
  } else {
    const links = await supabase.from("business_subject_links").select("target_id")
      .eq("org_id", input.context.orgId)
      .eq("source_type", input.context.subjectScope)
      .eq("source_id", input.context.subjectId)
      .eq("target_type", "project");
    if (links.error) return { status: missing(links.error.message) ? "not_configured" : "failed", warning: links.error.message };
    projectIds = (links.data ?? []).map(row => String(row.target_id));
  }
  if (projectIds.length === 0) return { status: "succeeded", data: [] };
  const [projects, mappings] = await Promise.all([
    supabase.from("projects").select("id,data_class,source_record_id,oa_no").in("id", projectIds).eq("org_id", input.context.orgId).eq("data_class", input.dataClass),
    supabase.from("project_identity_mappings").select("project_id,source_container_id,source_record_id,external_project_code,data_class").in("project_id", projectIds).eq("org_id", input.context.orgId).eq("mapping_status", "active").eq("data_class", input.dataClass),
  ]);
  if (projects.error || mappings.error) return { status: "failed", warning: projects.error?.message || mappings.error?.message };
  const cutover = await supabase.from("project_identity_cutover_configs").select("source_container_id,mode,read_percentage").eq("org_id", input.context.orgId).eq("source_type", "feishu");
  const cutoverUnavailable = Boolean(cutover.error && /does not exist|schema cache|Could not find the table/i.test(cutover.error.message));
  if (cutover.error && !cutoverUnavailable) return { status: "failed", warning: cutover.error.message };
  const cutoverByContainer = new Map((cutover.data ?? []).map(row => [String(row.source_container_id), { mode: String(row.mode), percentage: Number(row.read_percentage || 0) }]));
  const rolloutBucket = (projectId: string) => [...projectId].reduce((sum, character) => (sum * 31 + character.charCodeAt(0)) % 100, 0);
  const usesStableMapping = (row: { project_id: unknown; source_container_id: unknown }) => {
    const config = cutoverByContainer.get(String(row.source_container_id));
    if (!config) return true;
    if (config.mode === "stable_id") return true;
    if (config.mode === "legacy") return false;
    return config.mode === "dual_read" && rolloutBucket(String(row.project_id)) < config.percentage;
  };
  const stableOnlyProjects = new Set((mappings.data ?? []).filter(row => usesStableMapping(row)).map(row => String(row.project_id)));
  const output = new Map<string, ContextProjectIdentityMapping>();
  for (const row of projects.data ?? []) {
    if (stableOnlyProjects.has(String(row.id))) continue;
    if (!row.source_record_id && !row.oa_no) continue;
    output.set(`${row.id}:${row.source_record_id || "project"}`, { projectId: row.id, sourceRecordId: row.source_record_id || "", externalProjectCode: row.oa_no, dataClass: row.data_class });
  }
  for (const row of mappings.data ?? []) {
    if (!usesStableMapping(row)) continue;
    output.set(`${row.project_id}:${row.source_record_id}`, {
      projectId: row.project_id,
      sourceRecordId: row.source_record_id,
      externalProjectCode: row.external_project_code,
      dataClass: row.data_class,
    });
  }
  return { status: "succeeded", data: [...output.values()] };
}

export async function loadProjectAccessScope(projectId: string): Promise<PersistenceResult<ProjectAccessScope>> {
  if (!isAuthStorageConfigured()) return { status: "not_configured", warning: "AUTH_STORAGE_NOT_CONFIGURED" };
  const supabase = getAuthSupabase();
  const [project, links] = await Promise.all([
    supabase.from("projects").select("id,org_id,data_class").eq("id", projectId).maybeSingle(),
    supabase.from("portfolio_project_links").select("portfolio_id").eq("project_id", projectId),
  ]);
  if (project.error) return { status: missing(project.error.message) ? "not_configured" : "failed", warning: project.error.message };
  if (!project.data) return { status: "not_found", warning: "项目不存在。" };
  if (links.error) return { status: missing(links.error.message) ? "not_configured" : "failed", warning: links.error.message };
  return {
    status: "succeeded",
    data: {
      projectId: project.data.id,
      orgId: project.data.org_id,
      dataClass: String(project.data.data_class || "unclassified") as ProjectAccessScope["dataClass"],
      portfolioIds: (links.data ?? []).map(row => String(row.portfolio_id)),
    },
  };
}

export async function loadProject360(projectId: string): Promise<PersistenceResult<Project360Data>> {
  if (!isAuthStorageConfigured()) return { status: "not_configured", warning: "AUTH_STORAGE_NOT_CONFIGURED" };
  const supabase = getAuthSupabase();
  const projectResult = await supabase.from("projects").select("*").eq("id", projectId).maybeSingle();
  if (projectResult.error) return { status: "failed", warning: projectResult.error.message };
  if (!projectResult.data) return { status: "not_found", warning: "项目不存在。" };
  const orgId = String(projectResult.data.org_id || "");
  const dataClass = String(projectResult.data.data_class || "unclassified");
  const [
    risks, issues, changes, actions, governance, signals, evidence,
    lifecycleStates, lifecycleEvents, corrections, reportingSnapshots, metricObservations,
    decisionBriefs, costs, contracts, benefitBaselines, benefitReviews,
    closureAssessments, knowledgeCandidates, knowledgeReuse, retrospectives, knowledgeRecommendations,
  ] = await Promise.all([
    supabase.from("risks").select("*").eq("project_id", projectId),
    supabase.from("project_issues").select("*").eq("project_id", projectId),
    supabase.from("project_changes").select("*").eq("project_id", projectId),
    supabase.from("unified_action_items").select("*").eq("project_id", projectId),
    supabase.from("governance_process_instances").select("*").eq("canonical_project_id", projectId),
    supabase.from("management_signals").select("*").eq("project_id", projectId).order("updated_at", { ascending: false }),
    supabase.from("evidence_links").select("*").eq("subject_type", "project").eq("subject_id", projectId),
    supabase.from("project_lifecycle_states").select("*").eq("project_id", projectId).eq("data_class", dataClass).order("updated_at", { ascending: false }),
    supabase.from("project_lifecycle_events").select("*").eq("project_id", projectId).order("created_at", { ascending: false }).limit(300),
    supabase.from("feedback_correction_events").select("*").eq("project_id", projectId).eq("org_id", orgId).order("updated_at", { ascending: false }).limit(200),
    supabase.from("reporting_snapshots").select("*").eq("org_id", orgId).eq("subject_scope", "project").eq("subject_id", projectId).eq("data_class", dataClass).order("period_end", { ascending: false }).limit(100),
    supabase.from("metric_observations").select("*").eq("org_id", orgId).eq("project_id", projectId).eq("data_class", dataClass).order("observed_at", { ascending: false }).limit(200),
    supabase.from("decision_briefs").select("*").eq("org_id", orgId).eq("project_id", projectId).eq("data_class", dataClass).order("updated_at", { ascending: false }).limit(100),
    supabase.from("cost_records").select("*").eq("project_id", projectId).order("period", { ascending: false }).limit(100),
    supabase.from("contracts").select("*").eq("project_id", projectId).order("updated_at", { ascending: false }),
    supabase.from("project_benefit_baselines").select("*").eq("org_id", orgId).eq("project_id", projectId).eq("data_class", dataClass).order("updated_at", { ascending: false }),
    supabase.from("benefit_realization_reviews").select("*").eq("org_id", orgId).eq("project_id", projectId).eq("data_class", dataClass).order("snapshot_at", { ascending: false }).limit(100),
    supabase.from("project_closure_assessments").select("*").eq("org_id", orgId).eq("project_id", projectId).eq("data_class", dataClass).order("created_at", { ascending: false }).limit(50),
    supabase.from("knowledge_items").select("id,page_id,title,knowledge_type,status,owner_name,confidentiality,current_version_label,applicable_scenarios,metadata,updated_at").contains("metadata", { source_project_id: projectId }).order("updated_at", { ascending: false }).limit(100),
    supabase.from("knowledge_reuse_events").select("*").eq("org_id", orgId).eq("data_class", dataClass).or(`source_project_id.eq.${projectId},target_project_id.eq.${projectId}`).order("updated_at", { ascending: false }).limit(100),
    supabase.from("project_retrospectives").select("*").eq("org_id", orgId).eq("project_id", projectId).eq("data_class", dataClass).order("created_at", { ascending: false }).limit(50),
    supabase.from("knowledge_recommendation_requests").select("*").eq("org_id", orgId).eq("project_id", projectId).eq("data_class", dataClass).order("created_at", { ascending: false }).limit(50),
  ]);
  const primaryResults = [
    risks, issues, changes, actions, governance, signals, evidence,
    lifecycleStates, lifecycleEvents, corrections, reportingSnapshots, metricObservations,
    decisionBriefs, costs, contracts, benefitBaselines, benefitReviews,
    closureAssessments, knowledgeCandidates, knowledgeReuse, retrospectives, knowledgeRecommendations,
  ];
  const firstError = primaryResults.find(result => result.error)?.error;
  if (firstError) return { status: missing(firstError.message) ? "not_configured" : "failed", warning: firstError.message };
  const signalIds = (signals.data ?? []).map(row => String(row.id));
  const signalEvidence = signalIds.length > 0
    ? await supabase.from("evidence_links").select("*").eq("subject_type", "management_signal").in("subject_id", signalIds)
    : { data: [], error: null };
  if (signalEvidence.error) return { status: missing(signalEvidence.error.message) ? "not_configured" : "failed", warning: signalEvidence.error.message };
  const briefIds = (decisionBriefs.data ?? []).map(row => String(row.id));
  const contractIds = (contracts.data ?? []).map(row => String(row.id));
  const [decisions, payments] = await Promise.all([
    briefIds.length > 0
      ? supabase.from("decisions").select("*").in("brief_id", briefIds).order("decided_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    contractIds.length > 0
      ? supabase.from("payment_milestones").select("*").in("contract_id", contractIds).order("due_date", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
  ]);
  const dependentError = decisions.error || payments.error;
  if (dependentError) return { status: missing(dependentError.message) ? "not_configured" : "failed", warning: dependentError.message };
  return {
    status: "succeeded",
    data: {
      project: projectResult.data as Record<string, unknown>,
      risks: (risks.data ?? []) as Record<string, unknown>[],
      issues: (issues.data ?? []) as Record<string, unknown>[],
      changes: (changes.data ?? []) as Record<string, unknown>[],
      actions: (actions.data ?? []) as Record<string, unknown>[],
      governance: (governance.data ?? []) as Record<string, unknown>[],
      signals: (signals.data ?? []).map(row => mapSignal(row as Record<string, unknown>)),
      evidence: [...(evidence.data ?? []), ...(signalEvidence.data ?? [])] as Record<string, unknown>[],
      lifecycleStates: (lifecycleStates.data ?? []) as Record<string, unknown>[],
      lifecycleEvents: (lifecycleEvents.data ?? []) as Record<string, unknown>[],
      corrections: (corrections.data ?? []) as Record<string, unknown>[],
      reportingSnapshots: (reportingSnapshots.data ?? []) as Record<string, unknown>[],
      metricObservations: (metricObservations.data ?? []) as Record<string, unknown>[],
      decisionBriefs: (decisionBriefs.data ?? []) as Record<string, unknown>[],
      decisions: (decisions.data ?? []) as Record<string, unknown>[],
      costs: (costs.data ?? []) as Record<string, unknown>[],
      contracts: (contracts.data ?? []) as Record<string, unknown>[],
      payments: (payments.data ?? []) as Record<string, unknown>[],
      benefitBaselines: (benefitBaselines.data ?? []) as Record<string, unknown>[],
      benefitReviews: (benefitReviews.data ?? []) as Record<string, unknown>[],
      closureAssessments: (closureAssessments.data ?? []) as Record<string, unknown>[],
      knowledgeCandidates: (knowledgeCandidates.data ?? []) as Record<string, unknown>[],
      knowledgeReuse: (knowledgeReuse.data ?? []) as Record<string, unknown>[],
      retrospectives: (retrospectives.data ?? []) as Record<string, unknown>[],
      knowledgeRecommendations: (knowledgeRecommendations.data ?? []) as Record<string, unknown>[],
    },
  };
}
