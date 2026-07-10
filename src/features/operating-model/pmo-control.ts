import type { MilestoneDelayRuleConfig, MilestoneImpactFlags } from "./signals.ts";

export interface PmoProjectFact { id: string; name: string; projectLevel: string | null; progress: number; status: string }
export interface PmoSignalFact { id: string; projectId: string | null; title: string; severity: string; status: string; dueAt: string | null; ownerUserId?: string | null; route?: string; ruleVersion?: string }
export interface PmoDependencyFact { id: string; fromProjectId: string; toProjectId: string; dependencyType?: string; description?: string; status: string; ownerUserId?: string; dueDate: string | null; resolutionCriteria?: string; evidence?: unknown[]; reviewComment?: string | null }
export interface PmoCapacityFact { id: string; ownerName: string; ownerUserId?: string | null; roleName?: string; capacityHours: number; demandHours: number; periodStart: string; periodEnd?: string; allocations?: CapacityAllocation[] }
export interface PmoDataQualityFact { id: string; projectId: string | null; fieldName?: string | null; description?: string; severity: string; status: string; ownerUserId?: string | null; dueAt: string | null; closureEvidence?: unknown[] }
export interface PmoCadenceFact { id: string; cadenceType: string; status: string; periodStart: string; periodEnd: string; conclusions?: unknown[]; actionCount?: number; openActionCount?: number }
export interface PmoGovernanceActionFact { id: string; cadenceId: string; projectId: string | null; title: string; ownerUserId: string; dueAt: string; status: string; completionEvidence?: unknown[]; effectReview?: Record<string, unknown> }
export interface PmoCapacityConflictFact { id: string; capacitySnapshotId: string; ownerUserId: string; ownerName?: string; actionTitle: string; overloadHours: number; dueAt: string; status: string; resolutionEvidence?: unknown[] }
export interface PmoRuleMatrixFact { id: string; version: string; status: string; rules: Record<string, unknown>; changeReason: string; effectiveFrom: string | null }
export interface PmoMetricDefinitionFact { id: string; metricKey: string; version: string; name: string; definition: string; freshnessSlaMinutes: number | null; status: string }

export type DataQualityStatus = "open" | "assigned" | "in_progress" | "evidence_submitted" | "closed" | "waived" | "reopened";
export type CadenceStatus = "draft" | "preparing" | "ready" | "in_meeting" | "minutes_pending" | "actions_pending" | "effect_review" | "closed" | "cancelled";
export type GovernanceActionStatus = "assigned" | "accepted" | "in_progress" | "evidence_submitted" | "effect_review" | "closed" | "reopened" | "cancelled";
export type CapacityConflictStatus = "assigned" | "accepted" | "in_progress" | "evidence_submitted" | "verified" | "closed" | "reopened" | "cancelled";
export type DependencyStatus = "identified" | "confirmed" | "monitoring" | "blocked" | "evidence_submitted" | "verified" | "resolved" | "reopened" | "cancelled";

const DATA_QUALITY_TRANSITIONS: Readonly<Record<DataQualityStatus, readonly DataQualityStatus[]>> = {
  open: ["assigned", "waived"],
  assigned: ["in_progress", "waived"],
  in_progress: ["evidence_submitted"],
  evidence_submitted: ["closed", "reopened"],
  closed: ["reopened"],
  waived: ["reopened"],
  reopened: ["in_progress", "waived"],
};

const CADENCE_TRANSITIONS: Readonly<Record<CadenceStatus, readonly CadenceStatus[]>> = {
  draft: ["preparing", "cancelled"],
  preparing: ["ready", "cancelled"],
  ready: ["in_meeting", "cancelled"],
  in_meeting: ["minutes_pending", "cancelled"],
  minutes_pending: ["actions_pending", "effect_review", "cancelled"],
  actions_pending: ["effect_review", "cancelled"],
  effect_review: ["closed", "actions_pending", "cancelled"],
  closed: [],
  cancelled: [],
};

const GOVERNANCE_ACTION_TRANSITIONS: Readonly<Record<GovernanceActionStatus, readonly GovernanceActionStatus[]>> = {
  assigned: ["accepted", "cancelled"],
  accepted: ["in_progress", "cancelled"],
  in_progress: ["evidence_submitted"],
  evidence_submitted: ["effect_review", "reopened"],
  effect_review: ["closed", "reopened"],
  closed: ["reopened"],
  reopened: ["evidence_submitted"],
  cancelled: [],
};

const CAPACITY_CONFLICT_TRANSITIONS: Readonly<Record<CapacityConflictStatus, readonly CapacityConflictStatus[]>> = {
  assigned: ["accepted", "cancelled"],
  accepted: ["in_progress", "cancelled"],
  in_progress: ["evidence_submitted"],
  evidence_submitted: ["verified", "reopened"],
  verified: ["closed", "reopened"],
  closed: ["reopened"],
  reopened: ["evidence_submitted"],
  cancelled: [],
};

const DEPENDENCY_TRANSITIONS: Readonly<Record<DependencyStatus, readonly DependencyStatus[]>> = {
  identified: ["confirmed", "cancelled"],
  confirmed: ["monitoring", "blocked", "cancelled"],
  monitoring: ["blocked", "evidence_submitted", "cancelled"],
  blocked: ["monitoring", "evidence_submitted", "cancelled"],
  evidence_submitted: ["verified", "reopened"],
  verified: ["resolved", "reopened"],
  resolved: ["reopened"],
  reopened: ["monitoring", "blocked", "evidence_submitted", "cancelled"],
  cancelled: [],
};

export function canTransitionDataQuality(from: DataQualityStatus, to: DataQualityStatus): boolean {
  return DATA_QUALITY_TRANSITIONS[from]?.includes(to) ?? false;
}

export function canTransitionCadence(from: CadenceStatus, to: CadenceStatus): boolean {
  return CADENCE_TRANSITIONS[from]?.includes(to) ?? false;
}

export function canTransitionGovernanceAction(from: GovernanceActionStatus, to: GovernanceActionStatus): boolean {
  return GOVERNANCE_ACTION_TRANSITIONS[from]?.includes(to) ?? false;
}

export function canTransitionCapacityConflict(from: CapacityConflictStatus, to: CapacityConflictStatus): boolean {
  return CAPACITY_CONFLICT_TRANSITIONS[from]?.includes(to) ?? false;
}

export function canTransitionDependency(from: DependencyStatus, to: DependencyStatus): boolean {
  return DEPENDENCY_TRANSITIONS[from]?.includes(to) ?? false;
}

export interface CapacityAllocation { projectId: string; hours: number }
export interface CapacityWeekInput {
  periodStart: string;
  periodEnd: string;
  capacityHours: number;
  allocations: CapacityAllocation[];
}

export function buildCapacityPlan(input: {
  ownerName: string;
  roleName: string;
  ownerUserId: string | null;
  weeks: CapacityWeekInput[];
}) {
  if (input.weeks.length < 8 || input.weeks.length > 12) throw new Error("资源计划必须覆盖连续 8–12 周。");
  if (!input.ownerName.trim() || !input.roleName.trim()) throw new Error("资源名称和关键角色不能为空。");
  const seen = new Set<string>();
  const weeks = input.weeks.map((week, index) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(week.periodStart) || !/^\d{4}-\d{2}-\d{2}$/.test(week.periodEnd)) throw new Error(`第 ${index + 1} 周日期无效。`);
    if (seen.has(week.periodStart)) throw new Error("资源计划周次不能重复。");
    seen.add(week.periodStart);
    if (!Number.isFinite(week.capacityHours) || week.capacityHours < 0) throw new Error(`第 ${index + 1} 周容量无效。`);
    const allocations = week.allocations.map(allocation => {
      if (!allocation.projectId || !Number.isFinite(allocation.hours) || allocation.hours < 0) throw new Error(`第 ${index + 1} 周项目分配无效。`);
      return allocation;
    });
    const demandHours = allocations.reduce((sum, allocation) => sum + allocation.hours, 0);
    return { ...week, allocations, demandHours };
  });
  const conflicts = weeks.flatMap(week => week.demandHours > week.capacityHours ? [{
    ownerName: input.ownerName.trim(),
    ownerUserId: input.ownerUserId,
    roleName: input.roleName.trim(),
    periodStart: week.periodStart,
    periodEnd: week.periodEnd,
    capacityHours: week.capacityHours,
    demandHours: week.demandHours,
    overloadHours: week.demandHours - week.capacityHours,
    allocations: week.allocations,
  }] : []);
  return { ownerName: input.ownerName.trim(), roleName: input.roleName.trim(), ownerUserId: input.ownerUserId, weeks, conflicts };
}

export type ProjectLevel = "S" | "A" | "B" | "C";
export interface ProjectLevelRule {
  maxOpenCriticalSignals: number;
  cadence: string;
  escalationHours: number;
  evidenceRequired: boolean;
  signalRules: SignalRule[];
  [key: string]: unknown;
}

export interface SignalRule {
  signalType: string;
  metricKey: string;
  metricVersion: string;
  comparison?: "greater_than" | "less_than" | "variance_percent_above";
  yellowThreshold: number;
  redThreshold: number;
  unit: string;
  impactDimensions: string[];
  dataFreshnessHours: number;
  handlingRole: string;
  slaStartEvent: string;
  slaEndEvent: string;
  escalationLevel: string;
  decisionAuthority: string;
  closureEvidence: string[];
}

function nonEmptyStrings(value: unknown): value is string[] {
  return Array.isArray(value) && value.length > 0 && value.every(item => typeof item === "string" && item.trim().length > 0);
}

export function validateProjectLevelRuleMatrix(matrix: Partial<Record<ProjectLevel, Partial<ProjectLevelRule>>>): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  for (const level of ["S", "A", "B", "C"] as const) {
    const rule = matrix[level];
    if (!rule) { errors.push(`缺少 ${level} 级规则`); continue; }
    if (!Number.isFinite(rule.maxOpenCriticalSignals) || Number(rule.maxOpenCriticalSignals) < 0) errors.push(`${level}级最大关键异常数无效`);
    if (!String(rule.cadence || "").trim()) errors.push(`${level}级治理节奏不能为空`);
    if (!Number.isFinite(rule.escalationHours) || Number(rule.escalationHours) <= 0) errors.push(`${level}级升级时限无效`);
    if (typeof rule.evidenceRequired !== "boolean") errors.push(`${level}级证据要求无效`);
    if (!Array.isArray(rule.signalRules) || rule.signalRules.length === 0) {
      errors.push(`${level}级至少需要一条信号规则`);
      continue;
    }
    const identities = new Set<string>();
    rule.signalRules.forEach((signal, index) => {
      const prefix = `${level}级第${index + 1}条规则`;
      if (!signal || typeof signal !== "object") { errors.push(`${prefix}格式无效`); return; }
      const identity = `${String(signal.signalType || "").trim()}:${String(signal.metricKey || "").trim()}`;
      if (!String(signal.signalType || "").trim() || !String(signal.metricKey || "").trim() || !String(signal.metricVersion || "").trim()) errors.push(`${prefix}缺少信号类型或指标版本`);
      if (identities.has(identity)) errors.push(`${prefix}信号和指标重复`);
      identities.add(identity);
      const comparison = signal.comparison || "greater_than";
      if (!["greater_than", "less_than", "variance_percent_above"].includes(comparison)) errors.push(`${prefix}比较方式无效`);
      const invalidThreshold = !Number.isFinite(signal.yellowThreshold) || !Number.isFinite(signal.redThreshold)
        || (comparison === "less_than" ? Number(signal.redThreshold) > Number(signal.yellowThreshold) : Number(signal.yellowThreshold) > Number(signal.redThreshold));
      if (invalidThreshold) errors.push(`${prefix}黄红阈值无效`);
      if (!String(signal.unit || "").trim()) errors.push(`${prefix}阈值单位不能为空`);
      if (!nonEmptyStrings(signal.impactDimensions)) errors.push(`${prefix}影响维度不能为空`);
      if (!Number.isFinite(signal.dataFreshnessHours) || Number(signal.dataFreshnessHours) <= 0) errors.push(`${prefix}数据新鲜度无效`);
      if (!String(signal.handlingRole || "").trim() || !String(signal.slaStartEvent || "").trim() || !String(signal.slaEndEvent || "").trim()) errors.push(`${prefix}处理角色或SLA起止点不完整`);
      if (!String(signal.escalationLevel || "").trim() || !String(signal.decisionAuthority || "").trim()) errors.push(`${prefix}升级层级或决策权限不完整`);
      if (!nonEmptyStrings(signal.closureEvidence)) errors.push(`${prefix}关闭证据不能为空`);
    });
  }
  return { ok: errors.length === 0, errors };
}

export function resolveMilestoneDelayRuleFromMatrix(input: {
  projectLevel: string | null;
  matrixVersion: string;
  rules: Record<string, unknown>;
}): MilestoneDelayRuleConfig | null {
  if (!LEVEL_SCORE[input.projectLevel || ""] || !input.matrixVersion.trim()) return null;
  const level = input.rules[input.projectLevel || ""];
  if (!level || typeof level !== "object" || Array.isArray(level)) return null;
  const signalRules = (level as Record<string, unknown>).signalRules;
  if (!Array.isArray(signalRules)) return null;
  const configured = signalRules.find(item => item && typeof item === "object" && !Array.isArray(item) && String((item as Record<string, unknown>).signalType || "") === "milestone_delay") as Record<string, unknown> | undefined;
  if (!configured) return null;
  const warningWorkdays = Number(configured.yellowThreshold);
  const pmoToleranceWorkdays = Number(configured.redThreshold);
  const dataFreshnessHours = Number(configured.dataFreshnessHours);
  const escalationHours = Number((level as Record<string, unknown>).escalationHours);
  if (!Number.isFinite(warningWorkdays) || warningWorkdays < 1 || !Number.isFinite(pmoToleranceWorkdays) || pmoToleranceWorkdays < warningWorkdays || !Number.isFinite(dataFreshnessHours) || dataFreshnessHours <= 0 || !Number.isFinite(escalationHours) || escalationHours <= 0) return null;
  const allowed = new Set<keyof MilestoneImpactFlags>(["criticalPath", "stageGate", "customerCommitment", "acceptance", "cash", "majorRisk", "crossProjectResource"]);
  const majorImpacts = Array.isArray(configured.impactDimensions)
    ? configured.impactDimensions.map(String).filter((item): item is keyof MilestoneImpactFlags => allowed.has(item as keyof MilestoneImpactFlags))
    : [];
  return {
    version: `${input.matrixVersion}:${input.projectLevel}:milestone_delay`,
    warningWorkdays,
    pmoToleranceWorkdays,
    majorImpacts,
    dataFreshnessHours,
    escalationHours,
  };
}

const CLOSED = new Set(["closed", "done", "completed", "cancelled", "rejected", "resolved"]);
const SEVERITY_SCORE: Record<string, number> = { critical: 40, high: 30, medium: 20, low: 10 };
const LEVEL_SCORE: Record<string, number> = { S: 16, A: 12, B: 8, C: 4 };

function overdue(value: string | null, now: Date): boolean {
  if (!value) return false;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) && parsed < now.getTime();
}

export function buildPmoControlCenter(input: {
  projects: PmoProjectFact[];
  signals: PmoSignalFact[];
  dependencies: PmoDependencyFact[];
  capacities: PmoCapacityFact[];
  dataQualityIssues: PmoDataQualityFact[];
  cadences: PmoCadenceFact[];
  governanceActions?: PmoGovernanceActionFact[];
  capacityConflictActions?: PmoCapacityConflictFact[];
  ruleMatrices?: PmoRuleMatrixFact[];
  metricDefinitions?: PmoMetricDefinitionFact[];
  stageGateEvidence?: { total: number; complete: number };
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const openSignals = input.signals.filter(item => !CLOSED.has(item.status));
  const activeProjects = input.projects.filter(item => !CLOSED.has(item.status));
  const classifiedProjects = activeProjects.filter(item => ["S", "A", "B", "C"].includes(String(item.projectLevel || "")));
  const exceptionInbox = [...openSignals].sort((a, b) => {
    const score = (item: PmoSignalFact) => (SEVERITY_SCORE[item.severity] ?? 0) + (overdue(item.dueAt, now) ? 20 : 0) + (item.status === "pending_decision_brief" ? 15 : 0);
    return score(b) - score(a);
  });
  const portfolioHealth = activeProjects.map(project => {
    const signals = openSignals.filter(item => item.projectId === project.id);
    const blocked = input.dependencies.some(item => item.fromProjectId === project.id && item.status === "blocked");
    const dataQuality = input.dataQualityIssues.some(item => item.projectId === project.id && !CLOSED.has(item.status) && ["high", "critical"].includes(item.severity));
    const critical = signals.some(item => item.severity === "critical" || item.status === "pending_decision_brief");
    const warning = signals.length > 0 || blocked || dataQuality || project.progress < 70;
    return {
      ...project,
      health: critical || blocked ? "red" as const : warning ? "yellow" as const : "green" as const,
      openSignals: signals.length,
      priorityScore: (LEVEL_SCORE[project.projectLevel || ""] ?? 0) + signals.reduce((sum, item) => sum + (SEVERITY_SCORE[item.severity] ?? 0), 0),
    };
  }).sort((a, b) => b.priorityScore - a.priorityScore);
  return {
    summary: {
      activeProjects: activeProjects.length,
      classifiedProjects: classifiedProjects.length,
      projectLevelCoverageRate: activeProjects.length === 0 ? null : Math.round(classifiedProjects.length / activeProjects.length * 10000) / 100,
      redSignals: openSignals.filter(item => item.severity === "critical" || item.status === "pending_decision_brief").length,
      overdueSignals: openSignals.filter(item => overdue(item.dueAt, now)).length,
      blockedDependencies: input.dependencies.filter(item => item.status === "blocked").length,
      overAllocatedResources: input.capacities.filter(item => item.demandHours > item.capacityHours).length,
      overdueDataQuality: input.dataQualityIssues.filter(item => !CLOSED.has(item.status) && overdue(item.dueAt, now)).length,
      preparingCadences: input.cadences.filter(item => !["closed", "cancelled"].includes(item.status)).length,
      openGovernanceActions: (input.governanceActions ?? []).filter(item => !CLOSED.has(item.status)).length,
      openCapacityConflicts: (input.capacityConflictActions ?? []).filter(item => !CLOSED.has(item.status)).length,
      activeRuleMatrices: (input.ruleMatrices ?? []).filter(item => item.status === "active").length,
      activeMetricDefinitions: (input.metricDefinitions ?? []).filter(item => item.status === "active").length,
      formalStageGates: input.stageGateEvidence?.total ?? 0,
      stageGateEvidenceComplete: input.stageGateEvidence?.complete ?? 0,
      stageGateEvidenceCompletenessRate: input.stageGateEvidence && input.stageGateEvidence.total > 0 ? Math.round(input.stageGateEvidence.complete / input.stageGateEvidence.total * 10000) / 100 : null,
    },
    exceptionInbox,
    portfolioHealth,
    dependencies: input.dependencies,
    capacityConflicts: input.capacities.filter(item => item.demandHours > item.capacityHours).sort((a, b) => (b.demandHours - b.capacityHours) - (a.demandHours - a.capacityHours)),
    dataQualityIssues: input.dataQualityIssues.filter(item => !CLOSED.has(item.status)),
    cadences: input.cadences,
    governanceActions: input.governanceActions ?? [],
    capacityConflictActions: input.capacityConflictActions ?? [],
    ruleMatrices: input.ruleMatrices ?? [],
    metricDefinitions: input.metricDefinitions ?? [],
    projectsWithoutLevel: activeProjects.filter(item => !["S", "A", "B", "C"].includes(String(item.projectLevel || ""))),
  };
}
