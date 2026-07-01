import { getAuthSupabase, isAuthStorageConfigured, type AppUser } from "../auth/server.ts";
import { listRisks } from "@/lib/risk-repository";
import type { Risk } from "@/lib/risk";
import {
  buildIssueChangeChainReport,
  deriveChangeNextStatus,
  deriveIssueNextStatus,
  isTerminalChangeStatus,
  isTerminalIssueStatus,
  parseUnifiedActionItems,
  riskToIssueDraft,
  type ChangeAction,
  type ChangeCreateInput,
  type ChangeRecord,
  type ChangeStatus,
  type IssueAction,
  type IssueChangeEventRecord,
  type IssueCreateInput,
  type IssueRecord,
  type IssueStatus,
  type UnifiedActionCreateInput,
  type UnifiedActionPriority,
  type UnifiedActionRecord,
  type UnifiedActionSource,
} from "./model.ts";

export interface IssueTransitionInput {
  id: string;
  action: IssueAction;
  comment?: string;
  evidence?: string;
  actionItems?: unknown;
}

export interface ChangeTransitionInput {
  id: string;
  action: ChangeAction;
  comment?: string;
  decisionSummary?: string;
  evidence?: string;
  actionItems?: unknown;
}

export interface CloseActionInput {
  id: string;
  closeEvidence: string;
  status?: "done" | "cancelled";
}

export interface IssueChangeChainResult {
  status: "succeeded" | "not_configured" | "failed";
  issues: IssueRecord[];
  changes: ChangeRecord[];
  actions: UnifiedActionRecord[];
  events: IssueChangeEventRecord[];
  warning?: string;
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function missingStorageResult(): IssueChangeChainResult {
  return {
    status: "not_configured",
    issues: [],
    changes: [],
    actions: [],
    events: [],
    warning: "请先配置 Supabase 并执行 supabase-v530-issue-change-action-chain.sql。",
  };
}

function isMissingTableError(message?: string): boolean {
  return Boolean(
    message?.includes("project_issues")
    || message?.includes("project_changes")
    || message?.includes("unified_action_items")
    || message?.includes("issue_change_events")
    || message?.includes("relation")
    || message?.includes("does not exist"),
  );
}

function toDateOnly(value?: unknown): string | null {
  if (!value) return null;
  const text = String(value);
  return text.includes("T") ? text.slice(0, 10) : text;
}

function metadataOf(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
}

function code(prefix: "ISS" | "CHG"): string {
  const now = new Date();
  const stamp = now.toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${prefix}-${stamp}-${suffix}`;
}

function actorName(user: AppUser | null): string {
  return user?.name || user?.email || user?.phone || "系统";
}

function safeNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function mapIssue(row: Record<string, unknown>): IssueRecord {
  return {
    id: String(row.id),
    issueCode: row.issue_code ? String(row.issue_code) : null,
    projectName: String(row.project_name),
    sourceRiskId: row.source_risk_id ? String(row.source_risk_id) : null,
    sourceRiskCode: row.source_risk_code ? String(row.source_risk_code) : null,
    title: String(row.title),
    description: row.description ? String(row.description) : null,
    severity: String(row.severity || "medium") as IssueRecord["severity"],
    status: String(row.status || "open") as IssueStatus,
    owner: row.owner ? String(row.owner) : null,
    dueDate: toDateOnly(row.due_date),
    impactScope: row.impact_scope ? String(row.impact_scope) : null,
    evidence: row.evidence ? String(row.evidence) : null,
    createdByName: row.created_by_name ? String(row.created_by_name) : null,
    metadata: metadataOf(row.metadata),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    closedAt: row.closed_at ? String(row.closed_at) : null,
  };
}

function mapChange(row: Record<string, unknown>): ChangeRecord {
  return {
    id: String(row.id),
    changeCode: row.change_code ? String(row.change_code) : null,
    issueId: row.issue_id ? String(row.issue_id) : null,
    projectName: String(row.project_name),
    title: String(row.title),
    reason: row.reason ? String(row.reason) : null,
    changeType: String(row.change_type || "scope") as ChangeRecord["changeType"],
    impactScope: row.impact_scope ? String(row.impact_scope) : null,
    impactCost: safeNumber(row.impact_cost),
    impactScheduleDays: safeNumber(row.impact_schedule_days),
    impactRevenue: safeNumber(row.impact_revenue),
    impactCollection: row.impact_collection ? String(row.impact_collection) : null,
    status: String(row.status || "proposed") as ChangeStatus,
    owner: row.owner ? String(row.owner) : null,
    approver: row.approver ? String(row.approver) : null,
    dueDate: toDateOnly(row.due_date),
    decisionSummary: row.decision_summary ? String(row.decision_summary) : null,
    createdByName: row.created_by_name ? String(row.created_by_name) : null,
    metadata: metadataOf(row.metadata),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    closedAt: row.closed_at ? String(row.closed_at) : null,
  };
}

function mapAction(row: Record<string, unknown>): UnifiedActionRecord {
  return {
    id: String(row.id),
    sourceType: String(row.source_type || "manual") as UnifiedActionSource,
    sourceId: row.source_id ? String(row.source_id) : null,
    projectName: row.project_name ? String(row.project_name) : null,
    title: String(row.title),
    owner: row.owner ? String(row.owner) : null,
    dueDate: toDateOnly(row.due_date),
    status: String(row.status || "open") as UnifiedActionRecord["status"],
    priority: String(row.priority || "P1") as UnifiedActionPriority,
    closeEvidence: row.close_evidence ? String(row.close_evidence) : null,
    createdByName: row.created_by_name ? String(row.created_by_name) : null,
    metadata: metadataOf(row.metadata),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    closedAt: row.closed_at ? String(row.closed_at) : null,
  };
}

function mapEvent(row: Record<string, unknown>): IssueChangeEventRecord {
  return {
    id: String(row.id),
    subjectType: String(row.subject_type) as IssueChangeEventRecord["subjectType"],
    subjectId: String(row.subject_id),
    eventType: String(row.event_type),
    fromStatus: row.from_status ? String(row.from_status) : null,
    toStatus: row.to_status ? String(row.to_status) : null,
    actorName: row.actor_name ? String(row.actor_name) : null,
    comment: row.comment ? String(row.comment) : null,
    evidence: row.evidence ? String(row.evidence) : null,
    metadata: metadataOf(row.metadata),
    createdAt: String(row.created_at),
  };
}

async function insertEvent(input: {
  subjectType: "issue" | "change" | "action";
  subjectId: string;
  eventType: string;
  fromStatus?: string | null;
  toStatus?: string | null;
  user: AppUser | null;
  comment?: string;
  evidence?: string;
  metadata?: Record<string, unknown>;
}): Promise<IssueChangeEventRecord> {
  const supabase = getAuthSupabase();
  const { data, error } = await supabase
    .from("issue_change_events")
    .insert({
      subject_type: input.subjectType,
      subject_id: input.subjectId,
      event_type: input.eventType,
      from_status: input.fromStatus ?? null,
      to_status: input.toStatus ?? null,
      actor_id: input.user?.id ?? null,
      actor_name: actorName(input.user),
      comment: input.comment || null,
      evidence: input.evidence || null,
      metadata: input.metadata ?? {},
    })
    .select("*")
    .maybeSingle();
  if (error || !data) throw error || new Error("审计事件写入失败。");
  return mapEvent(data as Record<string, unknown>);
}

async function createActionItems(input: {
  sourceType: UnifiedActionSource;
  sourceId: string;
  projectName?: string | null;
  value: unknown;
  fallback?: { title: string; owner?: string | null; dueDate?: string | null; priority?: UnifiedActionPriority };
  user: AppUser | null;
}): Promise<UnifiedActionRecord[]> {
  const parsed = parseUnifiedActionItems(input.value, input.fallback
    ? {
        title: input.fallback.title,
        owner: input.fallback.owner || undefined,
        dueDate: input.fallback.dueDate || undefined,
        priority: input.fallback.priority || "P1",
      }
    : undefined);
  if (parsed.length === 0) return [];
  const supabase = getAuthSupabase();
  const { data, error } = await supabase
    .from("unified_action_items")
    .insert(parsed.map(item => ({
      source_type: input.sourceType,
      source_id: input.sourceId,
      project_name: input.projectName || null,
      title: item.title,
      owner: item.owner || input.fallback?.owner || null,
      due_date: item.dueDate || input.fallback?.dueDate || null,
      priority: item.priority || input.fallback?.priority || "P1",
      status: "open",
      created_by: input.user?.id ?? null,
      created_by_name: actorName(input.user),
      metadata: {},
    })))
    .select("*");
  if (error) throw error;

  const actions = (data ?? []).map(item => mapAction(item as Record<string, unknown>));
  for (const action of actions) {
    await insertEvent({
      subjectType: "action",
      subjectId: action.id,
      eventType: "created",
      toStatus: action.status,
      user: input.user,
      comment: `行动项已创建：${action.title}`,
      metadata: { source_type: input.sourceType, source_id: input.sourceId },
    });
  }
  return actions;
}

async function getIssue(id: string): Promise<IssueRecord | null> {
  const supabase = getAuthSupabase();
  const { data, error } = await supabase
    .from("project_issues")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data ? mapIssue(data as Record<string, unknown>) : null;
}

async function findRiskByIdOrCode(idOrCode: string): Promise<Risk | null> {
  const list = await listRisks();
  return list.risks.find(risk => risk.id === idOrCode || risk.riskCode === idOrCode) ?? null;
}

export async function listIssueChangeChain(limit = 80): Promise<IssueChangeChainResult> {
  if (!isAuthStorageConfigured()) return missingStorageResult();

  try {
    const supabase = getAuthSupabase();
    const [issuesResult, changesResult, actionsResult, eventsResult] = await Promise.all([
      supabase.from("project_issues").select("*").order("updated_at", { ascending: false }).limit(limit),
      supabase.from("project_changes").select("*").order("updated_at", { ascending: false }).limit(limit),
      supabase.from("unified_action_items").select("*").order("updated_at", { ascending: false }).limit(limit),
      supabase.from("issue_change_events").select("*").order("created_at", { ascending: false }).limit(160),
    ]);

    const firstError = issuesResult.error || changesResult.error || actionsResult.error || eventsResult.error;
    if (firstError) {
      return {
        ...missingStorageResult(),
        warning: isMissingTableError(firstError.message)
          ? "请在 Supabase SQL Editor 执行 supabase-v530-issue-change-action-chain.sql。"
          : firstError.message,
        status: isMissingTableError(firstError.message) ? "not_configured" : "failed",
      };
    }

    return {
      status: "succeeded",
      issues: (issuesResult.data ?? []).map(item => mapIssue(item as Record<string, unknown>)),
      changes: (changesResult.data ?? []).map(item => mapChange(item as Record<string, unknown>)),
      actions: (actionsResult.data ?? []).map(item => mapAction(item as Record<string, unknown>)),
      events: (eventsResult.data ?? []).map(item => mapEvent(item as Record<string, unknown>)),
    };
  } catch (error) {
    return {
      ...missingStorageResult(),
      status: "failed",
      warning: error instanceof Error ? error.message : "P5链路读取失败。",
    };
  }
}

export async function createIssue(input: IssueCreateInput, user: AppUser | null): Promise<{
  status: "succeeded" | "not_configured" | "failed";
  issue?: IssueRecord;
  actions?: UnifiedActionRecord[];
  event?: IssueChangeEventRecord;
  warning?: string;
}> {
  if (!isAuthStorageConfigured()) return { ...missingStorageResult(), actions: undefined };
  if (!input.projectName?.trim()) return { status: "failed", warning: "项目名称不能为空。" };
  if (!input.title?.trim()) return { status: "failed", warning: "问题标题不能为空。" };

  try {
    const supabase = getAuthSupabase();
    const sourceRiskId = input.sourceRiskId && uuidPattern.test(input.sourceRiskId) ? input.sourceRiskId : null;
    const { data, error } = await supabase
      .from("project_issues")
      .insert({
        issue_code: code("ISS"),
        project_name: input.projectName.trim(),
        source_risk_id: sourceRiskId,
        source_risk_code: input.sourceRiskCode || (!sourceRiskId ? input.sourceRiskId : null),
        title: input.title.trim(),
        description: input.description?.trim() || null,
        severity: input.severity || "medium",
        status: "open",
        owner: input.owner?.trim() || null,
        due_date: input.dueDate || null,
        impact_scope: input.impactScope?.trim() || null,
        evidence: input.evidence?.trim() || null,
        created_by: user?.id ?? null,
        created_by_name: actorName(user),
        metadata: { source: input.sourceRiskId || input.sourceRiskCode ? "risk-escalation" : "manual" },
      })
      .select("*")
      .maybeSingle();

    if (error || !data) {
      return {
        status: error && isMissingTableError(error.message) ? "not_configured" : "failed",
        warning: error?.message || "问题创建失败。",
      };
    }

    const issue = mapIssue(data as Record<string, unknown>);
    const event = await insertEvent({
      subjectType: "issue",
      subjectId: issue.id,
      eventType: "created",
      toStatus: issue.status,
      user,
      comment: input.sourceRiskId || input.sourceRiskCode ? "风险已升级为问题。" : "问题已创建。",
      evidence: issue.evidence || undefined,
      metadata: { issue_code: issue.issueCode, source_risk_code: issue.sourceRiskCode },
    });
    const actions = await createActionItems({
      sourceType: "issue",
      sourceId: issue.id,
      projectName: issue.projectName,
      value: input.actionItems,
      fallback: {
        title: "确认问题影响范围、处理责任人和关闭标准",
        owner: issue.owner,
        dueDate: issue.dueDate,
        priority: issue.severity === "high" ? "P0" : "P1",
      },
      user,
    });
    return { status: "succeeded", issue, event, actions };
  } catch (error) {
    return {
      status: "failed",
      warning: error instanceof Error ? error.message : "问题创建失败。",
    };
  }
}

export async function createIssueFromRisk(input: { riskId?: string; risk?: Risk; actionItems?: unknown }, user: AppUser | null) {
  const risk = input.risk || (input.riskId ? await findRiskByIdOrCode(input.riskId) : null);
  if (!risk) return { status: "failed" as const, warning: "未找到可升级的风险。请提供风险ID/风险编号，或直接传入风险对象。" };
  return createIssue({ ...riskToIssueDraft(risk), actionItems: input.actionItems || riskToIssueDraft(risk).actionItems }, user);
}

export async function transitionIssue(input: IssueTransitionInput, user: AppUser | null): Promise<{
  status: "succeeded" | "not_found" | "not_configured" | "failed";
  issue?: IssueRecord;
  event?: IssueChangeEventRecord;
  actions?: UnifiedActionRecord[];
  warning?: string;
}> {
  if (!isAuthStorageConfigured()) return { ...missingStorageResult(), actions: undefined };

  try {
    const current = await getIssue(input.id);
    if (!current) return { status: "not_found", warning: "问题不存在或已被删除。" };
    const nextStatus = deriveIssueNextStatus(current.status, input.action);
    const now = new Date().toISOString();
    const supabase = getAuthSupabase();
    const { data, error } = await supabase
      .from("project_issues")
      .update({
        status: nextStatus,
        updated_at: now,
        closed_at: isTerminalIssueStatus(nextStatus) ? now : current.closedAt,
        evidence: input.evidence?.trim() || current.evidence,
      })
      .eq("id", current.id)
      .select("*")
      .maybeSingle();
    if (error || !data) throw error || new Error("问题状态更新失败。");

    const issue = mapIssue(data as Record<string, unknown>);
    const event = await insertEvent({
      subjectType: "issue",
      subjectId: issue.id,
      eventType: input.action,
      fromStatus: current.status,
      toStatus: issue.status,
      user,
      comment: input.comment || "问题状态已流转。",
      evidence: input.evidence,
      metadata: { issue_code: issue.issueCode },
    });
    const actions = await createActionItems({
      sourceType: "issue",
      sourceId: issue.id,
      projectName: issue.projectName,
      value: input.actionItems,
      user,
    });
    return { status: "succeeded", issue, event, actions };
  } catch (error) {
    return {
      status: isMissingTableError(error instanceof Error ? error.message : "") ? "not_configured" : "failed",
      warning: error instanceof Error ? error.message : "问题流转失败。",
    };
  }
}

export async function createChange(input: ChangeCreateInput, user: AppUser | null): Promise<{
  status: "succeeded" | "not_found" | "not_configured" | "failed";
  change?: ChangeRecord;
  issue?: IssueRecord;
  event?: IssueChangeEventRecord;
  actions?: UnifiedActionRecord[];
  warning?: string;
}> {
  if (!isAuthStorageConfigured()) return { ...missingStorageResult(), actions: undefined };

  try {
    const issue = input.issueId ? await getIssue(input.issueId) : null;
    if (input.issueId && !issue) return { status: "not_found", warning: "关联问题不存在或已被删除。" };
    const projectName = input.projectName?.trim() || issue?.projectName || "";
    if (!projectName) return { status: "failed", warning: "项目名称不能为空。" };
    const title = input.title?.trim() || (issue ? `${issue.title}-变更申请` : "");
    if (!title) return { status: "failed", warning: "变更标题不能为空。" };

    const supabase = getAuthSupabase();
    const { data, error } = await supabase
      .from("project_changes")
      .insert({
        change_code: code("CHG"),
        issue_id: issue?.id || null,
        project_name: projectName,
        title,
        reason: input.reason?.trim() || issue?.description || null,
        change_type: input.changeType || "scope",
        impact_scope: input.impactScope?.trim() || issue?.impactScope || null,
        impact_cost: safeNumber(input.impactCost),
        impact_schedule_days: safeNumber(input.impactScheduleDays),
        impact_revenue: safeNumber(input.impactRevenue),
        impact_collection: input.impactCollection?.trim() || null,
        status: "proposed",
        owner: input.owner?.trim() || issue?.owner || null,
        approver: input.approver?.trim() || "PMO/项目发起人",
        due_date: input.dueDate || issue?.dueDate || null,
        created_by: user?.id ?? null,
        created_by_name: actorName(user),
        metadata: { source_issue_id: issue?.id || null },
      })
      .select("*")
      .maybeSingle();
    if (error || !data) throw error || new Error("变更创建失败。");

    let updatedIssue = issue;
    if (issue && issue.status !== "change-required") {
      const issueUpdate = await transitionIssue({
        id: issue.id,
        action: "require_change",
        comment: `问题已触发变更：${title}`,
        evidence: input.reason,
      }, user);
      updatedIssue = issueUpdate.issue ?? issue;
    }

    const change = mapChange(data as Record<string, unknown>);
    const event = await insertEvent({
      subjectType: "change",
      subjectId: change.id,
      eventType: "created",
      toStatus: change.status,
      user,
      comment: issue ? "由问题触发变更申请。" : "变更申请已创建。",
      evidence: input.reason,
      metadata: { change_code: change.changeCode, issue_id: issue?.id || null },
    });
    const actions = await createActionItems({
      sourceType: "change",
      sourceId: change.id,
      projectName: change.projectName,
      value: input.actionItems,
      fallback: {
        title: "完成变更影响分析：范围、成本、进度、回款和审批建议",
        owner: change.owner,
        dueDate: change.dueDate,
        priority: "P1",
      },
      user,
    });
    return { status: "succeeded", change, issue: updatedIssue ?? undefined, event, actions };
  } catch (error) {
    return {
      status: isMissingTableError(error instanceof Error ? error.message : "") ? "not_configured" : "failed",
      warning: error instanceof Error ? error.message : "变更创建失败。",
    };
  }
}

export async function transitionChange(input: ChangeTransitionInput, user: AppUser | null): Promise<{
  status: "succeeded" | "not_found" | "not_configured" | "failed";
  change?: ChangeRecord;
  event?: IssueChangeEventRecord;
  actions?: UnifiedActionRecord[];
  warning?: string;
}> {
  if (!isAuthStorageConfigured()) return { ...missingStorageResult(), actions: undefined };

  try {
    const supabase = getAuthSupabase();
    const { data: currentRow, error: currentError } = await supabase
      .from("project_changes")
      .select("*")
      .eq("id", input.id)
      .maybeSingle();
    if (currentError) throw currentError;
    if (!currentRow) return { status: "not_found", warning: "变更不存在或已被删除。" };

    const current = mapChange(currentRow as Record<string, unknown>);
    const nextStatus = deriveChangeNextStatus(current.status, input.action);
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from("project_changes")
      .update({
        status: nextStatus,
        decision_summary: input.decisionSummary?.trim() || current.decisionSummary,
        updated_at: now,
        closed_at: isTerminalChangeStatus(nextStatus) ? now : current.closedAt,
      })
      .eq("id", current.id)
      .select("*")
      .maybeSingle();
    if (error || !data) throw error || new Error("变更状态更新失败。");

    const change = mapChange(data as Record<string, unknown>);
    const event = await insertEvent({
      subjectType: "change",
      subjectId: change.id,
      eventType: input.action,
      fromStatus: current.status,
      toStatus: change.status,
      user,
      comment: input.comment || input.decisionSummary || "变更状态已流转。",
      evidence: input.evidence,
      metadata: { change_code: change.changeCode },
    });
    const actions = await createActionItems({
      sourceType: "change",
      sourceId: change.id,
      projectName: change.projectName,
      value: input.actionItems,
      user,
    });
    return { status: "succeeded", change, event, actions };
  } catch (error) {
    return {
      status: isMissingTableError(error instanceof Error ? error.message : "") ? "not_configured" : "failed",
      warning: error instanceof Error ? error.message : "变更流转失败。",
    };
  }
}

export async function closeUnifiedAction(input: CloseActionInput, user: AppUser | null): Promise<{
  status: "succeeded" | "not_found" | "not_configured" | "failed";
  action?: UnifiedActionRecord;
  event?: IssueChangeEventRecord;
  warning?: string;
}> {
  if (!isAuthStorageConfigured()) return missingStorageResult();
  if (!input.closeEvidence?.trim()) return { status: "failed", warning: "关闭行动项必须填写关闭证据。" };

  try {
    const supabase = getAuthSupabase();
    const { data: currentRow, error: currentError } = await supabase
      .from("unified_action_items")
      .select("*")
      .eq("id", input.id)
      .maybeSingle();
    if (currentError) throw currentError;
    if (!currentRow) return { status: "not_found", warning: "行动项不存在或已被删除。" };
    const current = mapAction(currentRow as Record<string, unknown>);
    const nextStatus = input.status || "done";
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from("unified_action_items")
      .update({
        status: nextStatus,
        close_evidence: input.closeEvidence.trim(),
        updated_at: now,
        closed_at: now,
      })
      .eq("id", input.id)
      .select("*")
      .maybeSingle();
    if (error || !data) throw error || new Error("行动项关闭失败。");

    const action = mapAction(data as Record<string, unknown>);
    const event = await insertEvent({
      subjectType: "action",
      subjectId: action.id,
      eventType: "close",
      fromStatus: current.status,
      toStatus: action.status,
      user,
      comment: "行动项已关闭并补充证据。",
      evidence: input.closeEvidence,
      metadata: { source_type: action.sourceType, source_id: action.sourceId },
    });
    return { status: "succeeded", action, event };
  } catch (error) {
    return {
      status: isMissingTableError(error instanceof Error ? error.message : "") ? "not_configured" : "failed",
      warning: error instanceof Error ? error.message : "行动项关闭失败。",
    };
  }
}

export async function createUnifiedAction(input: UnifiedActionCreateInput, user: AppUser | null): Promise<{
  status: "succeeded" | "not_configured" | "failed";
  action?: UnifiedActionRecord;
  event?: IssueChangeEventRecord;
  warning?: string;
}> {
  if (!isAuthStorageConfigured()) return missingStorageResult();
  if (!input.title?.trim()) return { status: "failed", warning: "行动项标题不能为空。" };

  try {
    const actions = await createActionItems({
      sourceType: input.sourceType || "manual",
      sourceId: input.sourceId || `manual-${Date.now()}`,
      projectName: input.projectName || null,
      value: [{
        title: input.title.trim(),
        owner: input.owner?.trim() || undefined,
        dueDate: input.dueDate || undefined,
        priority: input.priority || "P1",
      }],
      user,
    });
    const action = actions[0];
    if (!action) return { status: "failed", warning: "行动项创建失败。" };
    const event = await insertEvent({
      subjectType: "action",
      subjectId: action.id,
      eventType: "ai_suggestion_converted",
      toStatus: action.status,
      user,
      comment: input.sourceReason || "AI建议已转为统一行动项。",
      metadata: { source_type: action.sourceType, source_id: action.sourceId },
    });
    return { status: "succeeded", action, event };
  } catch (error) {
    return {
      status: isMissingTableError(error instanceof Error ? error.message : "") ? "not_configured" : "failed",
      warning: error instanceof Error ? error.message : "行动项创建失败。",
    };
  }
}

export async function issueChangeReportMarkdown(): Promise<{
  status: "succeeded" | "not_configured" | "failed";
  markdown?: string;
  filename?: string;
  warning?: string;
}> {
  const bundle = await listIssueChangeChain(200);
  if (bundle.status !== "succeeded") {
    return { status: bundle.status, warning: bundle.warning };
  }
  return {
    status: "succeeded",
    markdown: buildIssueChangeChainReport(bundle),
    filename: `issue-change-chain-${new Date().toISOString().slice(0, 10)}.md`,
  };
}
