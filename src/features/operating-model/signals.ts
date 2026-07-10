export const S1_MILESTONE_DELAY_RULE_VERSION = "S1-MILESTONE-DELAY-v1" as const;

export interface MilestoneImpactFlags {
  criticalPath: boolean;
  stageGate: boolean;
  customerCommitment: boolean;
  acceptance: boolean;
  cash: boolean;
  majorRisk: boolean;
  crossProjectResource: boolean;
}

export interface MilestoneDelayInput {
  orgId: string;
  projectId: string;
  milestoneId: string;
  baselineVersion: string;
  baselineDueDate: string;
  forecastDueDate: string;
  status: "pending" | "in_progress" | "completed" | "cancelled";
  approvedBaselineChange: boolean;
  impacts: MilestoneImpactFlags;
}

export interface MilestoneDelayEvaluation {
  ruleVersion: string;
  triggered: true;
  deviationWorkdays: number;
  route: "action" | "escalation";
  nextStatus: "pending_verification";
  dedupKey: string;
  impactReasons: Array<keyof MilestoneImpactFlags>;
  slaDueAt?: string;
}

export interface MilestoneDelayRuleConfig {
  version: string;
  warningWorkdays: number;
  pmoToleranceWorkdays: number;
  majorImpacts: Array<keyof MilestoneImpactFlags>;
  dataFreshnessHours?: number;
  escalationHours?: number;
}

export const DEFAULT_S1_MILESTONE_RULE: MilestoneDelayRuleConfig = {
  version: S1_MILESTONE_DELAY_RULE_VERSION,
  warningWorkdays: 1,
  pmoToleranceWorkdays: 3,
  majorImpacts: ["criticalPath", "stageGate", "customerCommitment", "acceptance", "cash", "majorRisk", "crossProjectResource"],
};

export interface ParsedMilestoneSignalRequest extends MilestoneDelayInput {
  dataClass: "production" | "sample" | "test" | "diagnostic" | "unclassified";
  sourceId: string;
  ownerUserId: string | null;
  sourceUpdatedAt?: string | null;
}

export function evaluateSourceFreshness(
  sourceUpdatedAt: string | null | undefined,
  maximumAgeHours: number,
  now = new Date(),
): { valid: boolean; ageHours: number | null } {
  const updatedAt = sourceUpdatedAt ? new Date(sourceUpdatedAt).getTime() : Number.NaN;
  if (!Number.isFinite(updatedAt) || !Number.isFinite(maximumAgeHours) || maximumAgeHours <= 0) return { valid: false, ageHours: null };
  const ageHours = Math.max(0, Math.round((now.getTime() - updatedAt) / 36_000) / 100);
  return { valid: ageHours <= maximumAgeHours, ageHours };
}

export function applySignalSla(
  evaluation: MilestoneDelayEvaluation,
  rule: MilestoneDelayRuleConfig,
  now = new Date(),
): MilestoneDelayEvaluation {
  if (!Number.isFinite(rule.escalationHours) || Number(rule.escalationHours) <= 0) return evaluation;
  return { ...evaluation, slaDueAt: new Date(now.getTime() + Number(rule.escalationHours) * 3_600_000).toISOString() };
}

function requiredText(record: Record<string, unknown>, key: string): string {
  const value = String(record[key] ?? "").trim();
  if (!value) throw new Error(`${key}为必填字段`);
  return value;
}

export function parseMilestoneSignalRequest(value: unknown): ParsedMilestoneSignalRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("请求体为必填对象");
  const record = value as Record<string, unknown>;
  const status = requiredText(record, "status") as MilestoneDelayInput["status"];
  if (!["pending", "in_progress", "completed", "cancelled"].includes(status)) throw new Error("status不合法");
  const dataClass = requiredText(record, "data_class") as ParsedMilestoneSignalRequest["dataClass"];
  if (!["production", "sample", "test", "diagnostic", "unclassified"].includes(dataClass)) throw new Error("data_class不合法");
  const impactsValue = record.impacts && typeof record.impacts === "object" && !Array.isArray(record.impacts)
    ? record.impacts as Record<string, unknown>
    : {};
  const impact = (key: keyof MilestoneImpactFlags) => impactsValue[key] === true;
  return {
    orgId: requiredText(record, "org_id"),
    projectId: requiredText(record, "project_id"),
    milestoneId: requiredText(record, "milestone_id"),
    baselineVersion: requiredText(record, "baseline_version"),
    baselineDueDate: requiredText(record, "baseline_due_date"),
    forecastDueDate: requiredText(record, "forecast_due_date"),
    status,
    approvedBaselineChange: record.approved_baseline_change === true,
    dataClass,
    sourceId: requiredText(record, "source_id"),
    ownerUserId: record.owner_user_id ? String(record.owner_user_id) : null,
    impacts: {
      criticalPath: impact("criticalPath"),
      stageGate: impact("stageGate"),
      customerCommitment: impact("customerCommitment"),
      acceptance: impact("acceptance"),
      cash: impact("cash"),
      majorRisk: impact("majorRisk"),
      crossProjectResource: impact("crossProjectResource"),
    },
  };
}

export type ManagementSignalStatus =
  | "detected"
  | "pending_verification"
  | "verified"
  | "rejected"
  | "under_review"
  | "action_required"
  | "action_in_progress"
  | "evidence_submitted"
  | "closed"
  | "re_escalated"
  | "pending_decision_brief";

export type ManagementSignalAction =
  | "submit_for_verification"
  | "verify"
  | "reject"
  | "start_review"
  | "route_action"
  | "reject_action"
  | "escalate"
  | "accept_action"
  | "submit_evidence"
  | "close"
  | "reopen";

const SIGNAL_TRANSITIONS: Partial<Record<ManagementSignalStatus, Partial<Record<ManagementSignalAction, ManagementSignalStatus>>>> = {
  detected: { submit_for_verification: "pending_verification" },
  pending_verification: { verify: "verified", reject: "rejected" },
  verified: { start_review: "under_review" },
  rejected: { reopen: "pending_verification" },
  under_review: { route_action: "action_required", escalate: "pending_decision_brief", reject: "rejected" },
  action_required: { accept_action: "action_in_progress", reject_action: "re_escalated", escalate: "pending_decision_brief" },
  action_in_progress: { submit_evidence: "evidence_submitted", escalate: "re_escalated" },
  evidence_submitted: { close: "closed", reopen: "action_in_progress" },
  closed: { reopen: "action_in_progress" },
  re_escalated: { escalate: "pending_decision_brief", route_action: "action_required" },
};

export function transitionManagementSignal(
  status: ManagementSignalStatus,
  action: ManagementSignalAction,
): ManagementSignalStatus {
  const next = SIGNAL_TRANSITIONS[status]?.[action];
  if (!next) throw new Error(`状态 ${status} 不允许执行 ${action}`);
  return next;
}

function parseDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function workdaysAfter(start: Date, end: Date): number {
  if (end.getTime() <= start.getTime()) return 0;
  let count = 0;
  const cursor = new Date(start);
  cursor.setUTCDate(cursor.getUTCDate() + 1);
  while (cursor.getTime() <= end.getTime()) {
    const day = cursor.getUTCDay();
    if (day !== 0 && day !== 6) count += 1;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return count;
}

export function evaluateMilestoneDelay(
  input: MilestoneDelayInput,
  rule: MilestoneDelayRuleConfig = DEFAULT_S1_MILESTONE_RULE,
): MilestoneDelayEvaluation | null {
  if (input.status === "completed" || input.status === "cancelled" || input.approvedBaselineChange) return null;
  const baseline = parseDate(input.baselineDueDate);
  const forecast = parseDate(input.forecastDueDate);
  if (!baseline || !forecast) return null;
  const deviationWorkdays = workdaysAfter(baseline, forecast);
  if (deviationWorkdays < rule.warningWorkdays) return null;

  const impactReasons = (Object.entries(input.impacts) as Array<[keyof MilestoneImpactFlags, boolean]>)
    .filter(([key, value]) => value && rule.majorImpacts.includes(key))
    .map(([key]) => key);
  return {
    ruleVersion: rule.version,
    triggered: true,
    deviationWorkdays,
    route: deviationWorkdays > rule.pmoToleranceWorkdays || impactReasons.length > 0 ? "escalation" : "action",
    nextStatus: "pending_verification",
    dedupKey: [
      input.orgId,
      input.projectId,
      input.milestoneId,
      rule.version,
      input.baselineVersion,
    ].join(":"),
    impactReasons,
  };
}
