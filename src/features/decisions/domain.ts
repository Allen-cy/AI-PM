import type { BusinessRole, SubjectScope } from "../operating-model/context.ts";

export type DecisionBriefStatus =
  | "draft"
  | "submitted"
  | "decided"
  | "distributed"
  | "effect_review_pending"
  | "effect_reviewed"
  | "closed"
  | "withdrawn";

export type DecisionOperation =
  | "view"
  | "create"
  | "submit"
  | "decide"
  | "distribute"
  | "acknowledge"
  | "start_execution"
  | "submit_execution_evidence"
  | "submit_effect_review"
  | "approve_effect_review"
  | "close"
  | "create_report"
  | "accept_report"
  | "return_report"
  | "resubmit_report"
  | "freeze_report"
  | "supersede_report"
  | "schedule_meeting"
  | "record_meeting"
  | "freeze_agenda"
  | "start_meeting"
  | "cancel_meeting"
  | "postpone_meeting"
  | "reschedule_meeting"
  | "assign_meeting_delegate"
  | "close_meeting"
  | "request_evidence"
  | "resubmit_evidence"
  | "review_evidence"
  | "vote"
  | "decline"
  | "reassign"
  | "reopen"
  | "create_committee"
  | "manage_committee";

export type DecisionWorkflowStatus =
  | "draft"
  | "evidence_required"
  | "pending_decision"
  | "decided"
  | "translated"
  | "executing"
  | "effect_review"
  | "closed"
  | "reopened";

export type DecisionWorkflowOperation =
  | "submit"
  | "request_evidence"
  | "resubmit_evidence"
  | "decide"
  | "translate"
  | "start_execution"
  | "submit_effect_review"
  | "close"
  | "reopen";

export type ReportingSnapshotStatus = "draft" | "submitted" | "returned" | "frozen" | "superseded";
export type ReportingSnapshotOperation = "submit" | "return" | "resubmit" | "freeze" | "supersede";
export type GovernanceMeetingStatus =
  | "scheduled"
  | "agenda_frozen"
  | "in_progress"
  | "minutes_pending"
  | "actions_pending"
  | "effect_review"
  | "closed"
  | "cancelled"
  | "postponed";
export type GovernanceMeetingOperation =
  | "freeze_agenda"
  | "start"
  | "record_minutes"
  | "materialize_outputs"
  | "start_effect_review"
  | "close"
  | "cancel"
  | "postpone"
  | "reschedule";

export type StandardDecisionType =
  | "continue"
  | "accelerate"
  | "downgrade"
  | "pause"
  | "terminate"
  | "resource_adjustment"
  | "risk_acceptance"
  | "evidence_request";

export type DecisionMode = "routine" | "emergency";
export type DecisionLevel = "project" | "portfolio" | "executive";
export type DecisionAuthorityMode = "individual" | "committee";

export interface DecisionActionTemplate {
  key: string;
  title: string;
  ownerRoles: Array<Extract<BusinessRole, "pm" | "operations" | "business_owner" | "finance" | "quality">>;
  acceptanceCriteria: string;
}

export interface StandardDecisionDefinition {
  version: string;
  requiredInputFields: string[];
  allowedDecisionRoles: Array<Extract<BusinessRole, "ceo" | "sponsor">>;
  downstreamActionTemplates: DecisionActionTemplate[];
  reviewMetrics: string[];
  revocationConditions: string[];
}

const decisionDefinition = (
  requiredInputFields: string[],
  downstreamActionTemplates: DecisionActionTemplate[],
  reviewMetrics: string[],
  revocationConditions: string[],
  allowedDecisionRoles: StandardDecisionDefinition["allowedDecisionRoles"] = ["ceo", "sponsor"],
): StandardDecisionDefinition => ({ version: "P21-v1", requiredInputFields, allowedDecisionRoles, downstreamActionTemplates, reviewMetrics, revocationConditions });

export const DECISION_TYPE_DEFINITIONS: Record<StandardDecisionType, StandardDecisionDefinition> = {
  continue: decisionDefinition(
    ["business_reason", "forecast", "risks", "conditions"],
    [{ key: "stage_gate", title: "落实继续/有条件继续的阶段门结论", ownerRoles: ["pm", "operations"], acceptanceCriteria: "条件清单逐项完成并由PMO复核" }],
    ["condition_completion_rate", "milestone_forecast_variance", "cash_forecast_variance"],
    ["任一前置条件逾期", "最新预测越过批准容差", "关键证据失效"],
  ),
  accelerate: decisionDefinition(
    ["strategic_value", "resource_conflicts", "benefit_cash_impact"],
    [{ key: "acceleration_plan", title: "执行加速方案并更新优先级、里程碑与预算", ownerRoles: ["pm", "operations", "finance"], acceptanceCriteria: "资源生效且基线、预算和现金预测完成更新" }],
    ["cycle_time_improvement", "opportunity_cost", "benefit_forecast_delta"],
    ["机会成本高于批准上限", "加速后收益预测下降", "关键资源不可用"],
  ),
  downgrade: decisionDefinition(
    ["value_decline", "scope_options", "contract_impact"],
    [{ key: "scope_change", title: "执行降级/范围调整并处理基线与合同影响", ownerRoles: ["pm", "operations", "finance"], acceptanceCriteria: "变更获批且范围、基线、合同和客户承诺一致" }],
    ["cost_reduction", "benefit_delta", "customer_impact"],
    ["客户拒绝范围调整", "合同损失超过批准值", "剩余价值恢复至原等级"],
  ),
  pause: decisionDefinition(
    ["pause_reason", "obligation_inventory", "restart_conditions"],
    [{ key: "pause_control", title: "冻结新增投入并完成暂停义务与重启条件清单", ownerRoles: ["pm", "operations", "finance"], acceptanceCriteria: "新增投入冻结、存量义务有责任人、重启门槛可验证" }],
    ["cash_burn_avoided", "open_obligation_count", "restart_condition_completion"],
    ["暂停导致不可接受的合同违约", "重启条件已全部满足", "风险敞口超过停项阈值"],
  ),
  terminate: decisionDefinition(
    ["termination_basis", "contract_customer_impact", "closure_obligations"],
    [{ key: "termination_plan", title: "执行终止、合同客户处理、资源释放与收尾", ownerRoles: ["pm", "operations", "finance", "business_owner"], acceptanceCriteria: "终止义务、资源释放、客户沟通和收尾门禁全部完成" }],
    ["loss_avoided", "termination_cost", "obligation_completion_rate"],
    ["终止成本超过批准边界", "关键合同义务无法解除", "出现经批准的更优转向方案"],
  ),
  resource_adjustment: decisionDefinition(
    ["resource_gap", "candidate_plan", "milestone_budget_impact"],
    [{ key: "resource_reallocation", title: "执行资源调配并同步受影响项目里程碑与预算", ownerRoles: ["pm", "operations", "finance"], acceptanceCriteria: "资源到岗且所有受影响项目基线与预算完成更新" }],
    ["capacity_gap", "milestone_recovery_days", "budget_delta", "third_project_impact"],
    ["被调人员或责任人拒收", "容量数据过期", "第三项目影响超过批准容差"],
  ),
  risk_acceptance: decisionDefinition(
    ["risk_id", "residual_exposure", "appetite_basis", "contingency"],
    [{ key: "risk_watch", title: "登记风险接受边界、应急预案与复审触发器", ownerRoles: ["pm", "operations", "quality"], acceptanceCriteria: "剩余风险、预案Owner、触发阈值和复审日期均已登记" }],
    ["residual_exposure", "trigger_distance", "contingency_readiness"],
    ["剩余风险超过风险偏好", "应急预案失效", "关键假设变化"],
  ),
  evidence_request: decisionDefinition(
    ["evidence_gaps", "required_evidence", "due_at"],
    [{ key: "evidence_completion", title: "补齐并验证决策所需证据", ownerRoles: ["pm", "operations", "finance", "quality"], acceptanceCriteria: "要求的证据全部提交、可追溯并通过授权决策人确认" }],
    ["evidence_completion_rate", "evidence_freshness", "decision_delay"],
    ["证据来源失效", "补证超过SLA", "新增事实改变决策问题"],
  ),
};

export type DecisionOutcome = "approved" | "rejected" | "conditional" | "deferred";

export interface DecisionOption {
  key: string;
  label: string;
  consequences: string;
}

export interface DecisionEvidence {
  source_type: string;
  source_id: string;
  title: string;
  url?: string | null;
}

export interface DecisionBriefInput {
  title: string;
  decisionQuestion: string;
  options: DecisionOption[];
  recommendation: string;
  evidence: DecisionEvidence[];
  requestedDecisionAt: string;
  impactSummary: string;
  meetingId?: string | null;
  reportingSnapshotId?: string | null;
  sourceSignalIds?: string[];
  recipientUserIds?: string[];
  decisionTargetUserId?: string | null;
  executionDueAt: string;
  acceptanceCriteria: string;
  decisionType: StandardDecisionType;
  decisionMode: DecisionMode;
  decisionLevel: DecisionLevel;
  authorityMode: DecisionAuthorityMode;
  committeeId?: string | null;
  structuredInput: Record<string, unknown>;
  emergencyTrigger?: string | null;
  responseSlaMinutes?: number | null;
  reviewPlan: Record<string, unknown>;
  definitionVersion: string;
  downstreamActionTemplates: DecisionActionTemplate[];
  reviewMetrics: string[];
  revocationConditions: string[];
}

export interface DecisionResourceInput {
  orgId: string;
  subjectScope: SubjectScope;
  subjectId: string;
}

const OPERATION_ROLES: Record<DecisionOperation, ReadonlySet<BusinessRole>> = {
  view: new Set(["pmo", "ceo", "sponsor", "business_owner", "finance", "pm", "operations", "quality"]),
  create: new Set(["pmo"]),
  submit: new Set(["pmo"]),
  decide: new Set(["ceo", "sponsor"]),
  distribute: new Set(["pmo"]),
  acknowledge: new Set(["pm", "operations", "business_owner", "finance", "quality"]),
  start_execution: new Set(["pm", "operations", "business_owner", "finance", "quality"]),
  submit_execution_evidence: new Set(["pm", "operations", "business_owner", "finance", "quality"]),
  submit_effect_review: new Set(["pm", "operations", "business_owner", "finance", "quality"]),
  approve_effect_review: new Set(["pmo"]),
  close: new Set(["pmo"]),
  create_report: new Set(["pm", "operations", "pmo"]),
  accept_report: new Set(["pmo"]),
  return_report: new Set(["pmo"]),
  resubmit_report: new Set(["pm", "operations", "pmo"]),
  freeze_report: new Set(["pmo"]),
  supersede_report: new Set(["pmo"]),
  schedule_meeting: new Set(["pmo"]),
  record_meeting: new Set(["pmo"]),
  freeze_agenda: new Set(["pmo"]),
  start_meeting: new Set(["pmo"]),
  cancel_meeting: new Set(["pmo"]),
  postpone_meeting: new Set(["pmo"]),
  reschedule_meeting: new Set(["pmo"]),
  assign_meeting_delegate: new Set(["pmo", "ceo", "sponsor", "business_owner", "finance", "pm", "operations", "quality"]),
  close_meeting: new Set(["pmo"]),
  request_evidence: new Set(["ceo", "sponsor"]),
  resubmit_evidence: new Set(["pmo"]),
  review_evidence: new Set(["ceo", "sponsor"]),
  vote: new Set(["ceo", "sponsor"]),
  decline: new Set(["ceo", "sponsor"]),
  reassign: new Set(["pmo"]),
  reopen: new Set(["pmo", "ceo", "sponsor"]),
  create_committee: new Set(["pmo"]),
  manage_committee: new Set(["pmo"]),
};

const TRANSITIONS: Record<DecisionBriefStatus, Partial<Record<DecisionOperation, DecisionBriefStatus>>> = {
  draft: { submit: "submitted" },
  submitted: { decide: "decided" },
  decided: { distribute: "distributed" },
  distributed: { submit_effect_review: "effect_review_pending" },
  effect_review_pending: { approve_effect_review: "effect_reviewed" },
  effect_reviewed: { close: "closed" },
  closed: {},
  withdrawn: {},
};

const WORKFLOW_TRANSITIONS: Record<DecisionWorkflowStatus, Partial<Record<DecisionWorkflowOperation, DecisionWorkflowStatus>>> = {
  draft: { submit: "pending_decision" },
  evidence_required: { resubmit_evidence: "pending_decision" },
  pending_decision: { request_evidence: "evidence_required", decide: "decided" },
  decided: { translate: "translated" },
  translated: { start_execution: "executing" },
  executing: { submit_effect_review: "effect_review" },
  effect_review: { close: "closed" },
  closed: { reopen: "reopened" },
  reopened: { submit: "pending_decision" },
};

const REPORTING_TRANSITIONS: Record<ReportingSnapshotStatus, Partial<Record<ReportingSnapshotOperation, ReportingSnapshotStatus>>> = {
  draft: { submit: "submitted" },
  submitted: { return: "returned", freeze: "frozen" },
  returned: { resubmit: "submitted" },
  frozen: { supersede: "superseded" },
  superseded: {},
};

const MEETING_TRANSITIONS: Record<GovernanceMeetingStatus, Partial<Record<GovernanceMeetingOperation, GovernanceMeetingStatus>>> = {
  scheduled: { freeze_agenda: "agenda_frozen", cancel: "cancelled", postpone: "postponed" },
  agenda_frozen: { start: "in_progress", cancel: "cancelled", postpone: "postponed" },
  in_progress: { record_minutes: "minutes_pending" },
  minutes_pending: { materialize_outputs: "actions_pending" },
  actions_pending: { start_effect_review: "effect_review" },
  effect_review: { close: "closed" },
  closed: {},
  cancelled: {},
  postponed: { reschedule: "scheduled", cancel: "cancelled" },
};

function requiredText(value: unknown, field: string): string {
  const text = String(value ?? "").trim();
  if (!text) throw new Error(`${field}为必填字段`);
  return text;
}

export function canPerformDecisionOperation(role: BusinessRole, operation: DecisionOperation): boolean {
  return OPERATION_ROLES[operation].has(role);
}

export function transitionDecisionBrief(status: DecisionBriefStatus, operation: DecisionOperation): DecisionBriefStatus {
  const next = TRANSITIONS[status]?.[operation];
  if (!next) {
    const gate = operation === "close" && status === "distributed" ? "：尚未完成效果复核" : "";
    throw new Error(`决策包状态 ${status} 不允许执行 ${operation}${gate}`);
  }
  return next;
}

export function transitionDecisionWorkflow(status: DecisionWorkflowStatus, operation: DecisionWorkflowOperation): DecisionWorkflowStatus {
  const next = WORKFLOW_TRANSITIONS[status]?.[operation];
  if (!next) throw new Error(`决策工作流状态 ${status} 不允许执行 ${operation}`);
  return next;
}

export function transitionReportingSnapshot(status: ReportingSnapshotStatus, operation: ReportingSnapshotOperation): ReportingSnapshotStatus {
  const next = REPORTING_TRANSITIONS[status]?.[operation];
  if (!next) throw new Error(`汇报快照状态 ${status} 不允许执行 ${operation}`);
  return next;
}

export function transitionGovernanceMeeting(status: GovernanceMeetingStatus, operation: GovernanceMeetingOperation): GovernanceMeetingStatus {
  const next = MEETING_TRANSITIONS[status]?.[operation];
  if (!next) throw new Error(`治理会议状态 ${status} 不允许执行 ${operation}`);
  return next;
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function requiredDateTime(value: unknown, field: string): string {
  const result = requiredText(value, field);
  if (!Number.isFinite(new Date(result).getTime())) throw new Error(`${field}不合法`);
  return result;
}

export function parseDecisionBriefInput(value: unknown): DecisionBriefInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("请求体为必填对象");
  const record = value as Record<string, unknown>;
  const options = Array.isArray(record.options) ? record.options.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error(`备选方案${index + 1}格式不合法`);
    const option = item as Record<string, unknown>;
    return {
      key: requiredText(option.key, `备选方案${index + 1}标识`),
      label: requiredText(option.label, `备选方案${index + 1}名称`),
      consequences: requiredText(option.consequences, `备选方案${index + 1}影响`),
    };
  }) : [];
  if (options.length < 2) throw new Error("至少需要两个备选方案");
  const keys = new Set(options.map(item => item.key));
  if (keys.size !== options.length) throw new Error("备选方案标识不能重复");
  const recommendation = requiredText(record.recommendation, "推荐方案");
  if (!keys.has(recommendation)) throw new Error("推荐方案必须来自备选方案");
  const evidence = Array.isArray(record.evidence) ? record.evidence.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error(`证据${index + 1}格式不合法`);
    const source = item as Record<string, unknown>;
    return {
      source_type: requiredText(source.source_type, `证据${index + 1}来源类型`),
      source_id: requiredText(source.source_id, `证据${index + 1}来源标识`),
      title: requiredText(source.title, `证据${index + 1}标题`),
      url: source.url ? String(source.url).trim() : null,
    };
  }) : [];
  if (evidence.length === 0) throw new Error("至少需要一条可追溯证据");
  const requestedDecisionAt = requiredDateTime(record.requestedDecisionAt, "要求决策时间");
  const executionDueAt = requiredDateTime(record.executionDueAt, "决策执行截止时间");
  const explicitDecisionType = Boolean(record.decisionType);
  const decisionType = String(record.decisionType || "continue") as StandardDecisionType;
  const definition = DECISION_TYPE_DEFINITIONS[decisionType];
  if (!definition) throw new Error("决策类型不合法");
  const decisionMode = String(record.decisionMode || "routine") as DecisionMode;
  if (!(["routine", "emergency"] as string[]).includes(decisionMode)) throw new Error("决策模式不合法");
  const decisionLevel = String(record.decisionLevel || "executive") as DecisionLevel;
  if (!(["project", "portfolio", "executive"] as string[]).includes(decisionLevel)) throw new Error("决策层级不合法");
  const authorityMode = String(record.authorityMode || "individual") as DecisionAuthorityMode;
  if (!(["individual", "committee"] as string[]).includes(authorityMode)) throw new Error("决策授权模式不合法");
  const committeeId = record.committeeId ? String(record.committeeId) : null;
  if (authorityMode === "committee" && !committeeId) throw new Error("委员会决策必须选择决策委员会");
  const impactSummary = requiredText(record.impactSummary, "影响摘要");
  const acceptanceCriteria = requiredText(record.acceptanceCriteria, "执行验收标准");
  const meetingId = record.meetingId ? String(record.meetingId) : null;
  const reportingSnapshotId = record.reportingSnapshotId ? String(record.reportingSnapshotId) : null;
  if (explicitDecisionType && decisionMode === "routine" && !meetingId && !reportingSnapshotId) throw new Error("例会决策必须关联已冻结汇报快照或治理会议");
  const emergencyTrigger = record.emergencyTrigger ? String(record.emergencyTrigger).trim() : null;
  const responseSlaMinutes = record.responseSlaMinutes === undefined || record.responseSlaMinutes === null || record.responseSlaMinutes === "" ? null : Number(record.responseSlaMinutes);
  if (decisionMode === "emergency" && !emergencyTrigger) throw new Error("紧急决策触发事件为必填项");
  if (decisionMode === "emergency" && (!Number.isInteger(responseSlaMinutes) || Number(responseSlaMinutes) <= 0)) throw new Error("紧急决策必须填写有效响应SLA");
  const structuredInput = asObject(record.structuredInput);
  if (explicitDecisionType) {
    for (const field of definition.requiredInputFields) requiredText(structuredInput[field], `structuredInput.${field}`);
  } else {
    structuredInput.business_reason = impactSummary;
    structuredInput.forecast = impactSummary;
    structuredInput.risks = evidence.map(item => item.title).join("；");
    structuredInput.conditions = acceptanceCriteria;
  }
  const reviewPlan = asObject(record.reviewPlan);
  if (explicitDecisionType) {
    requiredDateTime(reviewPlan.review_at, "复审时间");
    requiredText(reviewPlan.owner_role, "复审责任角色");
  } else {
    reviewPlan.review_at = executionDueAt;
    reviewPlan.owner_role = "pmo";
  }
  const revocationConditions = Array.isArray(record.revocationConditions)
    ? record.revocationConditions.map(String).map(item => item.trim()).filter(Boolean)
    : [...definition.revocationConditions];
  if (revocationConditions.length === 0) throw new Error("至少需要一条撤销或重新打开条件");
  return {
    title: requiredText(record.title, "标题"),
    decisionQuestion: requiredText(record.decisionQuestion, "决策问题"),
    options,
    recommendation,
    evidence,
    requestedDecisionAt,
    impactSummary,
    meetingId,
    reportingSnapshotId,
    sourceSignalIds: Array.isArray(record.sourceSignalIds) ? record.sourceSignalIds.map(String).filter(Boolean) : [],
    recipientUserIds: Array.isArray(record.recipientUserIds) ? [...new Set(record.recipientUserIds.map(String).filter(Boolean))] : [],
    decisionTargetUserId: record.decisionTargetUserId ? String(record.decisionTargetUserId) : null,
    executionDueAt,
    acceptanceCriteria,
    decisionType,
    decisionMode,
    decisionLevel,
    authorityMode,
    committeeId,
    structuredInput,
    emergencyTrigger,
    responseSlaMinutes,
    reviewPlan,
    definitionVersion: definition.version,
    downstreamActionTemplates: definition.downstreamActionTemplates.map(item => ({ ...item, ownerRoles: [...item.ownerRoles] })),
    reviewMetrics: [...definition.reviewMetrics],
    revocationConditions,
  };
}

export interface MeetingConclusion {
  type: "decision" | "action" | "no_action";
  title: string;
  rationale?: string;
  owner_user_id?: string;
  owner_business_role?: string;
  due_at?: string;
  acceptance_criteria?: string;
  review_at: string;
  decision_brief?: DecisionBriefInput;
}

export function validateMeetingConclusions(value: unknown): MeetingConclusion[] {
  if (!Array.isArray(value) || value.length === 0) throw new Error("会议至少需要一条结论");
  return value.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error(`会议结论${index + 1}格式不合法`);
    const record = item as Record<string, unknown>;
    const type = String(record.type) as MeetingConclusion["type"];
    if (!(["decision", "action", "no_action"] as string[]).includes(type)) throw new Error(`会议结论${index + 1}.type不合法`);
    const title = requiredText(record.title, `会议结论${index + 1}.title`);
    if (type === "no_action") {
      const rationale = requiredText(record.rationale, `会议结论${index + 1}.rationale`);
      return { type, title, rationale, review_at: requiredDateTime(record.review_at, `会议结论${index + 1}.review_at`) };
    }
    if (type === "action") {
      const ownerUserId = requiredText(record.owner_user_id, `会议结论${index + 1}.owner_user_id`);
      const ownerBusinessRole = requiredText(record.owner_business_role, `会议结论${index + 1}.owner_business_role`);
      return {
        type, title, owner_user_id: ownerUserId, owner_business_role: ownerBusinessRole,
        due_at: requiredDateTime(record.due_at, `会议结论${index + 1}.due_at`),
        acceptance_criteria: requiredText(record.acceptance_criteria, `会议结论${index + 1}.acceptance_criteria`),
        review_at: requiredDateTime(record.review_at, `会议结论${index + 1}.review_at`),
      };
    }
    return { type, title, review_at: requiredDateTime(record.review_at, `会议结论${index + 1}.review_at`), decision_brief: parseDecisionBriefInput(record.decision_brief) };
  });
}

export function validateDecisionOutcome(input: {
  outcome: DecisionOutcome;
  selectedOptionKey?: string | null;
  rationale?: string | null;
  conditions?: string | null;
}): void {
  if (!["approved", "rejected", "conditional", "deferred"].includes(input.outcome)) throw new Error("决策结果不合法");
  if (input.outcome !== "deferred" && !String(input.selectedOptionKey ?? "").trim()) throw new Error("必须填写选定方案");
  if (!String(input.rationale ?? "").trim()) throw new Error("必须填写决策理由");
  if (input.outcome === "conditional" && !String(input.conditions ?? "").trim()) throw new Error("有条件通过必须填写条件");
}
