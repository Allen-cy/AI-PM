import type { BusinessRoleAssignment, BusinessRole, SubjectScope } from "./context.ts";
import type { MilestoneDelayEvaluation, MilestoneImpactFlags } from "./signals.ts";

export function mapBusinessRoleAssignment(row: Record<string, unknown>): BusinessRoleAssignment {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    businessRole: String(row.business_role) as BusinessRole,
    orgId: String(row.org_id),
    subjectScope: String(row.subject_scope) as SubjectScope,
    subjectId: String(row.subject_id),
    status: String(row.status) as BusinessRoleAssignment["status"],
    validFrom: String(row.valid_from),
    validUntil: row.valid_until ? String(row.valid_until) : null,
    delegatedFromUserId: row.delegated_from_user_id ? String(row.delegated_from_user_id) : null,
  };
}

export function buildManagementSignalInsert(input: {
  evaluation: MilestoneDelayEvaluation;
  orgId: string;
  projectId: string;
  milestoneId: string;
  baselineVersion: string;
  dataClass: "production" | "sample" | "test" | "diagnostic" | "unclassified";
  ownerUserId: string | null;
  sourceId: string;
  observation?: {
    baselineDueDate: string;
    forecastDueDate: string;
    status: string;
    approvedBaselineChange: boolean;
    impacts: MilestoneImpactFlags;
  };
}): Record<string, unknown> {
  return {
    org_id: input.orgId,
    subject_scope: "project",
    subject_id: input.projectId,
    project_id: input.projectId,
    data_class: input.dataClass,
    signal_type: "milestone_delay",
    rule_version: input.evaluation.ruleVersion,
    baseline_version: input.baselineVersion,
    severity: input.evaluation.route === "escalation" ? "high" : "medium",
    route: input.evaluation.route,
    status: input.evaluation.nextStatus,
    title: `里程碑延期：${input.milestoneId}`,
    summary: `预测偏差 ${input.evaluation.deviationWorkdays} 个组织工作日。`,
    impact: { reasons: input.evaluation.impactReasons },
    payload: {
      milestone_id: input.milestoneId,
      deviation_workdays: input.evaluation.deviationWorkdays,
      baseline_due_date: input.observation?.baselineDueDate,
      forecast_due_date: input.observation?.forecastDueDate,
      milestone_status: input.observation?.status,
      approved_baseline_change: input.observation?.approvedBaselineChange,
      impacts: input.observation?.impacts,
    },
    dedup_key: input.evaluation.dedupKey,
    owner_user_id: input.ownerUserId,
    due_at: input.evaluation.slaDueAt,
    source_type: "feishu_milestone",
    source_id: input.sourceId,
  };
}

export interface SignalRoutingSource {
  id: string;
  orgId: string;
  subjectScope: "project" | "portfolio" | "organization" | "customer" | "contract";
  subjectId: string;
  projectId: string | null;
  title: string;
  ownerUserId: string | null;
  impact: Record<string, unknown>;
}

export function buildSignalActionInsert(signal: SignalRoutingSource): Record<string, unknown> {
  return {
    source_type: "signal",
    source_id: signal.id,
    org_id: signal.orgId,
    subject_scope: signal.subjectScope,
    subject_id: signal.subjectId,
    project_id: signal.projectId,
    title: `纠偏行动：${signal.title}`,
    owner_user_id: signal.ownerUserId,
    status: signal.ownerUserId ? "assigned" : "open",
    priority: "P0",
    acceptance_criteria: "完成纠偏措施、更新业务事实并提交可验证证据，由PMO复核效果。",
    idempotency_key: `signal:${signal.id}:corrective-action`,
    metadata: { signal_id: signal.id, impact: signal.impact },
  };
}

export function buildSignalEscalationInsert(
  signal: SignalRoutingSource,
  reason: string,
  requestId: string,
): Record<string, unknown> {
  return {
    signal_id: signal.id,
    org_id: signal.orgId,
    subject_scope: signal.subjectScope,
    subject_id: signal.subjectId,
    project_id: signal.projectId,
    status: "pending_decision_brief",
    escalation_level: "pmo",
    reason,
    impact: signal.impact,
    owner_user_id: signal.ownerUserId,
    request_id: requestId,
  };
}
