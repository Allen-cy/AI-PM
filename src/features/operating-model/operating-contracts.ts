import type { BusinessRole, SubjectScope } from "./context.ts";

export const MANAGEMENT_SIGNAL_TYPES = [
  "progress", "cost", "quality", "risk", "resource", "acceptance", "cash", "benefit", "data_quality",
] as const;
export type ManagementSignalType = typeof MANAGEMENT_SIGNAL_TYPES[number];

export interface BusinessAuthorizationPolicy {
  id: string;
  effect: "allow" | "deny";
  businessRole: BusinessRole;
  objectType: string;
  action: string;
  allowedStates: string[];
  projectLevels: string[];
  decisionLevels: string[];
  maxAmount: number | null;
  priority: number;
}

export interface BusinessAuthorizationRequest {
  businessRole: BusinessRole;
  objectType: string;
  action: string;
  objectState: string;
  projectLevel: string;
  decisionLevel: string;
  amount: number | null;
  recused: boolean;
}

export interface BusinessAuthorizationResult {
  allowed: boolean;
  policyId: string | null;
  code: "POLICY_ALLOWED" | "ACTOR_RECUSED" | "EXPLICIT_POLICY_DENY" | "AMOUNT_LIMIT_EXCEEDED" | "NO_MATCHING_ALLOW_POLICY";
}

function matchesDimension(values: string[], value: string): boolean {
  return values.length === 0 || values.includes("*") || values.includes(value);
}

export function evaluateBusinessAuthorization(
  request: BusinessAuthorizationRequest,
  policies: BusinessAuthorizationPolicy[],
): BusinessAuthorizationResult {
  if (request.recused) return { allowed: false, policyId: null, code: "ACTOR_RECUSED" };
  const candidates = policies
    .filter(policy => policy.businessRole === request.businessRole && policy.objectType === request.objectType && policy.action === request.action)
    .filter(policy => matchesDimension(policy.allowedStates, request.objectState))
    .filter(policy => matchesDimension(policy.projectLevels, request.projectLevel))
    .filter(policy => matchesDimension(policy.decisionLevels, request.decisionLevel))
    .sort((left, right) => right.priority - left.priority);
  const explicitDeny = candidates.find(policy => policy.effect === "deny");
  if (explicitDeny) return { allowed: false, policyId: explicitDeny.id, code: "EXPLICIT_POLICY_DENY" };
  const allowCandidates = candidates.filter(policy => policy.effect === "allow");
  const allowed = allowCandidates.find(policy => request.amount === null || policy.maxAmount === null || request.amount <= policy.maxAmount);
  if (!allowed && allowCandidates.length > 0) return { allowed: false, policyId: allowCandidates[0].id, code: "AMOUNT_LIMIT_EXCEEDED" };
  return allowed
    ? { allowed: true, policyId: allowed.id, code: "POLICY_ALLOWED" }
    : { allowed: false, policyId: null, code: "NO_MATCHING_ALLOW_POLICY" };
}

export interface MetricTrustInput {
  observedAt: string;
  evaluatedAt: string;
  freshnessSlaMinutes: number;
  definitionStatus: "draft" | "active" | "retired";
  sourceStatus: "verified" | "manual_unverified" | "unavailable";
  dataClass: "production" | "sample" | "test" | "diagnostic" | "unclassified";
}

export function assessMetricTrust(input: MetricTrustInput) {
  const observedAt = new Date(input.observedAt).getTime();
  const evaluatedAt = new Date(input.evaluatedAt).getTime();
  if (!Number.isFinite(observedAt) || !Number.isFinite(evaluatedAt) || input.freshnessSlaMinutes <= 0) throw new Error("指标时间或新鲜度SLA不合法");
  const ageMinutes = Math.max(0, Math.floor((evaluatedAt - observedAt) / 60_000));
  const freshnessStatus = ageMinutes <= input.freshnessSlaMinutes ? "fresh" as const : "stale" as const;
  const trusted = input.definitionStatus === "active" && input.sourceStatus === "verified" && input.dataClass === "production";
  return {
    ageMinutes,
    freshnessStatus,
    trustStatus: trusted ? "trusted" as const : "untrusted" as const,
    decisionUsable: trusted && freshnessStatus === "fresh",
    reason: !trusted ? "指标定义、事实验证或数据空间未达到正式决策要求" : freshnessStatus === "stale" ? "指标已超过新鲜度SLA" : null,
  };
}

export function buildManagementSignalDedupKey(input: {
  signalType: string;
  subjectScope: SubjectScope;
  subjectId: string;
  window: string;
}): string {
  if (!(MANAGEMENT_SIGNAL_TYPES as readonly string[]).includes(input.signalType)) throw new Error("不支持的管理信号类型");
  const subjectId = input.subjectId.trim(); const window = input.window.trim();
  if (!subjectId || !window) throw new Error("主体和统计窗口不能为空");
  return `${input.signalType}:${input.subjectScope}:${subjectId}:${window}`;
}

const IMPACT_TARGET_TYPES = ["plan", "milestone", "budget", "contract", "payment"] as const;
export type ImpactTargetType = typeof IMPACT_TARGET_TYPES[number];

export interface ImpactPackageDraftInput {
  orgId: string;
  projectId: string;
  sourceType: "risk" | "issue" | "change";
  sourceId: string;
  sourceStatus: string;
  targets: Array<{ targetType: ImpactTargetType; targetId: string; proposedChange: Record<string, unknown> }>;
  ownerUserId: string;
  reviewerUserId: string;
  dueAt: string;
}

export function buildImpactPackageDraft(input: ImpactPackageDraftInput) {
  if (!(["approved", "accepted", "escalated", "response_in_progress", "monitoring", "change-required", "resolving", "resolved", "implementing", "implemented"] as string[]).includes(input.sourceStatus)) throw new Error("只有经人工批准或确认的来源对象才能生成影响包");
  if (input.targets.length === 0) throw new Error("影响包至少包含一个目标对象");
  for (const target of input.targets) {
    if (!(IMPACT_TARGET_TYPES as readonly string[]).includes(target.targetType) || !target.targetId.trim() || Object.keys(target.proposedChange).length === 0) throw new Error("影响包目标不完整");
  }
  if (!input.ownerUserId || !input.reviewerUserId || !Number.isFinite(new Date(input.dueAt).getTime())) throw new Error("影响包责任人、复核人和期限不能为空");
  return { ...input, status: "pending_confirmation" as const, directWriteAllowed: false as const };
}

export type LifecycleEvidenceExpiryAction = "block_transition" | "reopen_object" | "warn";
export function resolveEvidenceExpiry(action: LifecycleEvidenceExpiryAction, currentStatus: string, reopenStatus: string) {
  if (action === "block_transition") return { blockFutureTransition: true, nextStatus: currentStatus, createSignal: false };
  if (action === "warn") return { blockFutureTransition: false, nextStatus: currentStatus, createSignal: true };
  return { blockFutureTransition: false, nextStatus: reopenStatus, createSignal: true };
}
