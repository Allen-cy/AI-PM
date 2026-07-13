import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  buildRiskClosurePackage,
  validateRiskClosureReview,
  type RiskClosureReviewInput,
} from "@/features/risk/closure";
import {
  buildWorkflowEvent,
  calculateRiskPriority,
  calculateRiskScore,
  categoryLabels,
  getWorkflowStepForStatus,
  impactAreaLabels,
  statusLabels,
  statusToWorkflowStep,
  type LinkedModule,
  type Risk,
  type RiskCategory,
  type RiskImpactArea,
  type RiskStage,
  type RiskStatus,
  type RiskStrategy,
  type RiskWorkflowEvent,
  type RiskWorkflowStep,
} from "@/lib/risk";
import type { RiskDataScope } from "@/features/risk/scope";

type RiskDbRow = {
  id: string;
  org_id?: string | null;
  project_id?: string | null;
  data_class?: string | null;
  risk_code?: string | null;
  project_name?: string | null;
  description?: string | null;
  category?: string | null;
  stage?: string | null;
  source?: string | null;
  impact_area?: string | null;
  probability?: number | null;
  impact?: number | null;
  urgency?: number | null;
  pi_score?: number | null;
  priority_score?: number | null;
  status?: string | null;
  response_strategy_type?: string | null;
  response_strategy?: string | null;
  preventive_action?: string | null;
  contingency_plan?: string | null;
  trigger_condition?: string | null;
  tracking_method?: string | null;
  owner?: string | null;
  due_date?: string | null;
  next_review_date?: string | null;
  closing_criteria?: string | null;
  linked_module?: string | null;
  evidence?: string | null;
  workflow_step?: string | null;
  current_input?: string | null;
  current_output?: string | null;
  last_action?: string | null;
  action_owner?: string | null;
  action_deadline?: string | null;
  version?: number | null;
  archived_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type RiskWorkflowEventDbRow = {
  id: string;
  org_id?: string | null;
  project_id?: string | null;
  data_class?: string | null;
  risk_id?: string | null;
  risk_code?: string | null;
  workflow_step?: string | null;
  from_status?: string | null;
  to_status?: string | null;
  input_summary?: string | null;
  output_summary?: string | null;
  action_required?: string | null;
  owner?: string | null;
  deadline?: string | null;
  evidence?: string | null;
  actor?: string | null;
  request_id?: string | null;
  created_at?: string | null;
};

export interface RiskWriteControl {
  expectedVersion: number;
  idempotencyKey: string;
}

export interface RiskTransitionInput {
  id: string;
  toStatus: RiskStatus;
  inputSummary?: string;
  outputSummary?: string;
  actionRequired?: string;
  owner?: string;
  deadline?: string;
  evidence?: string;
  actor?: string;
  closure?: Partial<RiskClosureReviewInput>;
  expectedVersion: number;
  idempotencyKey: string;
}

export type RiskRepositoryScope = RiskDataScope & { actorUserId?: string };

export interface RiskArchiveInput extends RiskWriteControl {
  id: string;
  reason?: string;
}

export interface RiskListResult {
  risks: Risk[];
  events: RiskWorkflowEvent[];
  source: "supabase" | "memory";
  warning?: string;
}

export const MAX_RISK_LIST_LIMIT = 500;
export const DEFAULT_RISK_LIST_LIMIT = 200;
export const MAX_RISK_BATCH_SIZE = 100;

export function normalizeRiskListLimit(value: unknown): number {
  if (value === null || value === undefined || String(value).trim() === "") return DEFAULT_RISK_LIST_LIMIT;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_RISK_LIST_LIMIT;
  return Math.min(MAX_RISK_LIST_LIMIT, Math.max(1, Math.trunc(parsed)));
}

function assertWriteControl(control: RiskWriteControl): void {
  if (!Number.isInteger(control.expectedVersion) || control.expectedVersion < 0) {
    throw new Error("EXPECTED_VERSION_REQUIRED");
  }
  if (!control.idempotencyKey.trim() || control.idempotencyKey.length > 160) {
    throw new Error("IDEMPOTENCY_KEY_REQUIRED");
  }
}

const statuses = Object.keys(statusLabels) as RiskStatus[];
const categories = Object.keys(categoryLabels) as RiskCategory[];
const impactAreas = Object.keys(impactAreaLabels) as RiskImpactArea[];
const stages: RiskStage[] = ["立项", "规划", "执行", "监控", "验收", "结项", "全生命周期"];
const strategies: RiskStrategy[] = ["规避", "缓解", "转移", "接受", "上报"];
const modules: LinkedModule[] = ["项目组合看板", "立项", "规划", "执行", "监控", "收尾", "合同回款", "质量", "资源"];
const workflowSteps: RiskWorkflowStep[] = ["identify", "analyze", "plan", "implement", "supervise", "track", "close"];
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function getMemoryStore() {
  const globalStore = globalThis as typeof globalThis & {
    __aiPmRisks?: Risk[];
    __aiPmRiskEvents?: RiskWorkflowEvent[];
    __aiPmRiskWriteReceipts?: Map<string, { requestHash: string; result: unknown }>;
  };
  globalStore.__aiPmRisks ??= [];
  globalStore.__aiPmRiskEvents ??= [];
  globalStore.__aiPmRiskWriteReceipts ??= new Map();
  return globalStore;
}

function hasSupabaseConfig(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL
    && process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}

function getSupabaseClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function pickAllowed<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  const text = String(value ?? "");
  return allowed.includes(text as T) ? text as T : fallback;
}

function clampScale(value: unknown, fallback = 3): 1 | 2 | 3 | 4 | 5 {
  const parsed = Math.round(Number(value));
  return Math.min(5, Math.max(1, Number.isFinite(parsed) ? parsed : fallback)) as 1 | 2 | 3 | 4 | 5;
}

function dateOnly(value?: string | null): string {
  if (!value) return "";
  return value.includes("T") ? value.slice(0, 10) : value;
}

function toRisk(row: RiskDbRow): Risk {
  const probability = clampScale(row.probability);
  const impact = clampScale(row.impact);
  const urgency = clampScale(row.urgency);
  const status = pickAllowed(row.status, statuses, "identified");
  const piScore = Number(row.pi_score ?? calculateRiskScore(probability, impact));
  const priorityScore = Number(row.priority_score ?? calculateRiskPriority(probability, impact, urgency));
  return {
    id: row.id,
    version: Number(row.version ?? 1),
    projectId: row.project_id || undefined,
    orgId: row.org_id || undefined,
    dataClass: pickAllowed(row.data_class, ["production", "sample", "test", "diagnostic", "unclassified"] as const, "unclassified"),
    riskCode: row.risk_code || undefined,
    projectName: row.project_name || "未指定项目",
    description: row.description || "未填写风险描述",
    category: pickAllowed(row.category, categories, "管理"),
    stage: pickAllowed(row.stage, stages, "全生命周期"),
    source: row.source || "人工登记",
    impactArea: pickAllowed(row.impact_area, impactAreas, "范围"),
    probability,
    impact,
    urgency,
    piScore,
    priorityScore,
    status,
    responseStrategyType: pickAllowed(row.response_strategy_type, strategies, "缓解"),
    responseStrategy: row.response_strategy || "",
    preventiveAction: row.preventive_action || "",
    contingencyPlan: row.contingency_plan || "",
    trigger: row.trigger_condition || "",
    trackingMethod: row.tracking_method || "",
    owner: row.owner || "",
    dueDate: dateOnly(row.due_date),
    nextReviewDate: dateOnly(row.next_review_date),
    closingCriteria: row.closing_criteria || "",
    linkedModule: pickAllowed(row.linked_module, modules, "规划"),
    evidence: row.evidence || undefined,
    workflowStep: pickAllowed(row.workflow_step, workflowSteps, statusToWorkflowStep(status)),
    currentInput: row.current_input || undefined,
    currentOutput: row.current_output || undefined,
    lastAction: row.last_action || undefined,
    actionOwner: row.action_owner || undefined,
    actionDeadline: dateOnly(row.action_deadline) || undefined,
    createdAt: dateOnly(row.created_at) || new Date().toISOString().slice(0, 10),
    updatedAt: row.updated_at || undefined,
    archivedAt: row.archived_at || undefined,
  };
}

function toRiskWorkflowEvent(row: RiskWorkflowEventDbRow): RiskWorkflowEvent {
  const toStatus = pickAllowed(row.to_status, statuses, "identified");
  return {
    id: row.id,
    riskId: row.risk_id || "",
    riskCode: row.risk_code || undefined,
    workflowStep: pickAllowed(row.workflow_step, workflowSteps, statusToWorkflowStep(toStatus)),
    fromStatus: row.from_status ? pickAllowed(row.from_status, statuses, "identified") : undefined,
    toStatus,
    inputSummary: row.input_summary || "",
    outputSummary: row.output_summary || "",
    actionRequired: row.action_required || "",
    owner: row.owner || "",
    deadline: dateOnly(row.deadline),
    evidence: row.evidence || undefined,
    actor: row.actor || undefined,
    createdAt: row.created_at || new Date().toISOString(),
    requestId: row.request_id || undefined,
  };
}

function riskToDbPayload(risk: Risk, scope: RiskRepositoryScope, projectId: string): Record<string, unknown> {
  const isUuid = uuidPattern.test(risk.id);
  return {
    org_id: scope.orgId,
    project_id: projectId,
    data_class: scope.dataClass,
    risk_code: risk.riskCode || (isUuid ? undefined : risk.id),
    project_name: risk.projectName || null,
    description: risk.description,
    category: risk.category,
    stage: risk.stage,
    source: risk.source,
    impact_area: risk.impactArea,
    probability: risk.probability,
    impact: risk.impact,
    urgency: risk.urgency,
    status: risk.status,
    response_strategy_type: risk.responseStrategyType,
    response_strategy: risk.responseStrategy,
    preventive_action: risk.preventiveAction,
    contingency_plan: risk.contingencyPlan,
    trigger_condition: risk.trigger,
    tracking_method: risk.trackingMethod,
    owner: risk.owner,
    due_date: risk.dueDate || null,
    next_review_date: risk.nextReviewDate || null,
    closing_criteria: risk.closingCriteria,
    linked_module: risk.linkedModule,
    evidence: risk.evidence || null,
    workflow_step: risk.workflowStep || statusToWorkflowStep(risk.status),
    current_input: risk.currentInput || null,
    current_output: risk.currentOutput || null,
    last_action: risk.lastAction || null,
    action_owner: risk.actionOwner || risk.owner || null,
    action_deadline: risk.actionDeadline || risk.dueDate || null,
  };
}

function eventToDbPayload(event: RiskWorkflowEvent, scope: RiskRepositoryScope, projectId: string): Record<string, unknown> {
  return {
    org_id: scope.orgId,
    project_id: projectId,
    data_class: scope.dataClass,
    risk_id: uuidPattern.test(event.riskId) ? event.riskId : null,
    risk_code: event.riskCode || (uuidPattern.test(event.riskId) ? null : event.riskId),
    workflow_step: event.workflowStep,
    from_status: event.fromStatus || null,
    to_status: event.toStatus,
    input_summary: event.inputSummary,
    output_summary: event.outputSummary,
    action_required: event.actionRequired,
    owner: event.owner,
    deadline: event.deadline || null,
    evidence: event.evidence || null,
    actor: event.actor || "系统",
    request_id: event.requestId || null,
  };
}

function receiptKey(scope: RiskRepositoryScope, projectId: string, idempotencyKey: string): string {
  return [scope.orgId, scope.dataClass, projectId, idempotencyKey].join(":");
}

function stableRequestHash(value: unknown): string {
  return JSON.stringify(value);
}

function readRpcResult(data: unknown): { risk: RiskDbRow; event?: RiskWorkflowEventDbRow } {
  if (!data || typeof data !== "object") throw new Error("RISK_RPC_INVALID_RESPONSE");
  const payload = data as { risk?: unknown; event?: unknown };
  if (!payload.risk || typeof payload.risk !== "object") throw new Error("RISK_RPC_INVALID_RESPONSE");
  return {
    risk: payload.risk as RiskDbRow,
    event: payload.event && typeof payload.event === "object" ? payload.event as RiskWorkflowEventDbRow : undefined,
  };
}

function scopedProjectIds(scope: RiskRepositoryScope): string[] {
  const allowed = [...new Set(scope.projectIds.filter(Boolean))];
  if (!scope.requestedProjectId) return allowed;
  if (!allowed.includes(scope.requestedProjectId)) throw new Error("PROJECT_OUTSIDE_CONTEXT");
  return [scope.requestedProjectId];
}

function writableProjectId(scope: RiskRepositoryScope, risk?: Pick<Risk, "projectId">): string {
  const projectIds = scopedProjectIds(scope);
  const requested = risk?.projectId || scope.requestedProjectId;
  if (requested && projectIds.includes(requested)) return requested;
  if (requested) throw new Error("PROJECT_OUTSIDE_CONTEXT");
  if (projectIds.length === 1) return projectIds[0];
  throw new Error("PROJECT_ID_REQUIRED");
}

export async function listRisks(
  scope: RiskRepositoryScope,
  options: { limit?: unknown } = {},
): Promise<RiskListResult> {
  const projectIds = scopedProjectIds(scope);
  const limit = normalizeRiskListLimit(options.limit);
  if (projectIds.length === 0) {
    return { risks: [], events: [], source: hasSupabaseConfig() ? "supabase" : "memory" };
  }
  if (!hasSupabaseConfig()) {
    const store = getMemoryStore();
    return {
      risks: (store.__aiPmRisks ?? [])
        .filter(risk => !risk.archivedAt && risk.orgId === scope.orgId && risk.dataClass === scope.dataClass && Boolean(risk.projectId && projectIds.includes(risk.projectId)))
        .slice(0, limit),
      events: (store.__aiPmRiskEvents ?? []).filter(event => (store.__aiPmRisks ?? []).some(risk => !risk.archivedAt && risk.id === event.riskId && risk.orgId === scope.orgId && risk.dataClass === scope.dataClass && Boolean(risk.projectId && projectIds.includes(risk.projectId)))).slice(0, limit),
      source: "memory",
      warning: "未配置Supabase，本地开发模式仅使用内存数据。",
    };
  }

  const supabase = getSupabaseClient();
  const { data: risks, error } = await supabase
    .from("risks")
    .select("*")
    .eq("org_id", scope.orgId)
    .eq("data_class", scope.dataClass)
    .in("project_id", projectIds)
    .is("archived_at", null)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;

  const { data: events, error: eventsError } = await supabase
    .from("risk_workflow_events")
    .select("*")
    .eq("org_id", scope.orgId)
    .eq("data_class", scope.dataClass)
    .in("project_id", projectIds)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (eventsError) {
    return {
      risks: (risks ?? []).map(row => toRisk(row as RiskDbRow)),
      events: [],
      source: "supabase",
      warning: "risk_workflow_events 表或 V6.1 风险治理对象尚未就绪，请执行正式 V6.1 migrations 完成数据库升级。",
    };
  }

  return {
    risks: (risks ?? []).map(row => toRisk(row as RiskDbRow)),
    events: (events ?? []).map(row => toRiskWorkflowEvent(row as RiskWorkflowEventDbRow)),
    source: "supabase",
  };
}

export async function saveRiskToRepository(
  risk: Risk,
  scope: RiskRepositoryScope,
  control: RiskWriteControl,
): Promise<Risk> {
  assertWriteControl(control);
  const projectId = writableProjectId(scope, risk);
  const normalizedRisk: Risk = {
    ...risk,
    projectId,
    orgId: scope.orgId,
    dataClass: scope.dataClass,
    workflowStep: risk.workflowStep || statusToWorkflowStep(risk.status),
    actionOwner: risk.actionOwner || risk.owner,
    actionDeadline: risk.actionDeadline || risk.dueDate,
  };

  if (!hasSupabaseConfig()) {
    const store = getMemoryStore();
    const risks = store.__aiPmRisks ?? [];
    const requestHash = stableRequestHash({ operation: "upsert", risk: normalizedRisk, expectedVersion: control.expectedVersion });
    const key = receiptKey(scope, projectId, control.idempotencyKey);
    const receipt = store.__aiPmRiskWriteReceipts?.get(key);
    if (receipt) {
      if (receipt.requestHash !== requestHash) throw new Error("IDEMPOTENCY_KEY_REUSED");
      return receipt.result as Risk;
    }
    const index = uuidPattern.test(normalizedRisk.id)
      ? risks.findIndex(item => item.id === normalizedRisk.id && item.orgId === scope.orgId && item.dataClass === scope.dataClass && item.projectId === projectId && !item.archivedAt)
      : risks.findIndex(item => (item.riskCode || item.id) === (normalizedRisk.riskCode || normalizedRisk.id) && item.orgId === scope.orgId && item.dataClass === scope.dataClass && item.projectId === projectId && !item.archivedAt);
    if (uuidPattern.test(normalizedRisk.id) && index < 0) throw new Error("RISK_NOT_FOUND_OR_OUTSIDE_SCOPE");
    const currentVersion = index >= 0 ? Number(risks[index]?.version ?? 1) : 0;
    if (currentVersion !== control.expectedVersion) throw new Error("VERSION_CONFLICT");
    const savedRisk = { ...normalizedRisk, version: currentVersion + 1 };
    if (index >= 0) risks[index] = savedRisk;
    else risks.unshift(savedRisk);
    store.__aiPmRisks = risks;
    store.__aiPmRiskWriteReceipts?.set(key, { requestHash, result: savedRisk });
    return savedRisk;
  }

  const supabase = getSupabaseClient();
  const payload = riskToDbPayload(normalizedRisk, scope, projectId);
  const { data, error } = await supabase.rpc("upsert_risk_v61", {
    p_org_id: scope.orgId,
    p_project_id: projectId,
    p_data_class: scope.dataClass,
    p_risk_id: uuidPattern.test(normalizedRisk.id) ? normalizedRisk.id : null,
    p_risk_code: String(payload.risk_code || "") || null,
    p_payload: payload,
    p_expected_version: control.expectedVersion,
    p_idempotency_key: control.idempotencyKey.trim(),
    p_actor_user_id: scope.actorUserId || null,
  });
  if (error) throw error;
  return toRisk(readRpcResult(data).risk);
}

export async function saveRisksToRepository(
  risks: Risk[],
  scope: RiskRepositoryScope,
  control: RiskWriteControl,
): Promise<Risk[]> {
  assertWriteControl(control);
  if (risks.length > MAX_RISK_BATCH_SIZE) throw new Error("BATCH_LIMIT_EXCEEDED");
  if (control.idempotencyKey.length > 140) throw new Error("IDEMPOTENCY_KEY_REQUIRED");
  const normalized = risks.map(risk => {
    const projectId = writableProjectId(scope, risk);
    return {
      risk: {
        ...risk,
        projectId,
        orgId: scope.orgId,
        dataClass: scope.dataClass,
        workflowStep: risk.workflowStep || statusToWorkflowStep(risk.status),
        actionOwner: risk.actionOwner || risk.owner,
        actionDeadline: risk.actionDeadline || risk.dueDate,
      } satisfies Risk,
      projectId,
    };
  });
  const projectIds = [...new Set(normalized.map(item => item.projectId))];
  if (projectIds.length > 1) throw new Error("BATCH_SINGLE_PROJECT_REQUIRED");
  if (normalized.length === 0) return [];

  if (!hasSupabaseConfig()) {
    const store = getMemoryStore();
    const previousRisks = [...(store.__aiPmRisks ?? [])];
    const previousReceipts = new Map(store.__aiPmRiskWriteReceipts ?? []);
    try {
      const saved: Risk[] = [];
      for (const [index, item] of normalized.entries()) {
        saved.push(await saveRiskToRepository(item.risk, scope, {
          expectedVersion: Number(item.risk.version ?? control.expectedVersion),
          idempotencyKey: `${control.idempotencyKey}:${index}`,
        }));
      }
      return saved;
    } catch (error) {
      store.__aiPmRisks = previousRisks;
      store.__aiPmRiskWriteReceipts = previousReceipts;
      throw error;
    }
  }

  const projectId = projectIds[0];
  const items = normalized.map(item => {
    const payload = riskToDbPayload(item.risk, scope, item.projectId);
    return {
      risk_id: uuidPattern.test(item.risk.id) ? item.risk.id : null,
      risk_code: String(payload.risk_code || "") || null,
      payload,
      expected_version: Number(item.risk.version ?? control.expectedVersion),
    };
  });
  const { data, error } = await getSupabaseClient().rpc("upsert_risk_batch_v61", {
    p_org_id: scope.orgId,
    p_project_id: projectId,
    p_data_class: scope.dataClass,
    p_items: items,
    p_batch_idempotency_key: control.idempotencyKey.trim(),
    p_actor_user_id: scope.actorUserId || null,
  });
  if (error) throw error;
  const rows = data && typeof data === "object" && Array.isArray((data as { risks?: unknown[] }).risks)
    ? (data as { risks: RiskDbRow[] }).risks
    : null;
  if (!rows) throw new Error("RISK_RPC_INVALID_RESPONSE");
  return rows.map(toRisk);
}

async function findRiskInScope(
  id: string,
  scope: RiskRepositoryScope,
  options: { includeArchived?: boolean } = {},
): Promise<Risk | null> {
  const projectIds = scopedProjectIds(scope);
  if (projectIds.length === 0) return null;
  if (!hasSupabaseConfig()) {
    return (getMemoryStore().__aiPmRisks ?? []).find(risk => (
      (options.includeArchived || !risk.archivedAt)
      && (risk.id === id || risk.riskCode === id)
      && risk.orgId === scope.orgId
      && risk.dataClass === scope.dataClass
      && Boolean(risk.projectId && projectIds.includes(risk.projectId))
    )) ?? null;
  }
  const supabase = getSupabaseClient();
  let query = supabase.from("risks").select("*")
    .eq("org_id", scope.orgId)
    .eq("data_class", scope.dataClass)
    .in("project_id", projectIds);
  if (!options.includeArchived) query = query.is("archived_at", null);
  query = uuidPattern.test(id) ? query.eq("id", id) : query.eq("risk_code", id);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data ? toRisk(data as RiskDbRow) : null;
}

export async function transitionRisk(input: RiskTransitionInput, scope: RiskRepositoryScope): Promise<{ risk: Risk; event: RiskWorkflowEvent; warning?: string }> {
  assertWriteControl(input);
  const current = await findRiskInScope(input.id, scope);
  if (!current) throw new Error("风险不存在或已被删除");

  const step = getWorkflowStepForStatus(input.toStatus);
  const closurePackage = input.toStatus === "closed"
    ? buildRiskClosurePackage(current, input.closure ?? {})
    : null;
  if (input.toStatus === "closed") {
    const validationErrors = validateRiskClosureReview(current, input.closure);
    if (validationErrors.length > 0) {
      throw new Error(`风险关闭被拒绝：${validationErrors.join("；")}`);
    }
  }
  const event = buildWorkflowEvent(current, input.toStatus, {
    inputSummary: closurePackage?.inputSummary || input.inputSummary || current.currentInput || step.input,
    outputSummary: closurePackage?.outputSummary || input.outputSummary || step.output,
    actionRequired: closurePackage?.actionRequired || input.actionRequired || step.requiredAction,
    owner: closurePackage?.reviewer || input.owner || current.owner || "项目经理",
    deadline: closurePackage?.followUpDeadline || input.deadline || current.dueDate || current.nextReviewDate,
    evidence: closurePackage?.evidenceText || input.evidence || current.evidence,
    actor: input.actor || "管理员",
  });
  event.requestId = input.idempotencyKey;

  const updated: Risk = {
    ...current,
    status: input.toStatus,
    workflowStep: statusToWorkflowStep(input.toStatus),
    currentInput: event.inputSummary,
    currentOutput: event.outputSummary,
    lastAction: event.actionRequired,
    actionOwner: event.owner,
    actionDeadline: event.deadline,
    owner: event.owner || current.owner,
    dueDate: event.deadline || current.dueDate,
    evidence: event.evidence || current.evidence,
    updatedAt: new Date().toISOString(),
  };

  if (!hasSupabaseConfig()) {
    const store = getMemoryStore();
    const projectId = writableProjectId(scope, current);
    const requestHash = stableRequestHash({ operation: "transition", input, currentId: current.id });
    const key = receiptKey(scope, projectId, input.idempotencyKey);
    const receipt = store.__aiPmRiskWriteReceipts?.get(key);
    if (receipt) {
      if (receipt.requestHash !== requestHash) throw new Error("IDEMPOTENCY_KEY_REUSED");
      return receipt.result as { risk: Risk; event: RiskWorkflowEvent };
    }
    if (Number(current.version ?? 1) !== input.expectedVersion) throw new Error("VERSION_CONFLICT");
    const savedRisk = { ...updated, version: input.expectedVersion + 1 };
    store.__aiPmRisks = (store.__aiPmRisks ?? []).map(risk => risk.id === current.id ? savedRisk : risk);
    store.__aiPmRiskEvents = [event, ...(store.__aiPmRiskEvents ?? [])];
    const result = { risk: savedRisk, event };
    store.__aiPmRiskWriteReceipts?.set(key, { requestHash, result });
    return result;
  }

  const supabase = getSupabaseClient();
  const projectId = writableProjectId(scope, current);
  const persistedEvent = { ...event, riskId: current.id, riskCode: current.riskCode };
  const { data, error } = await supabase.rpc("transition_risk_v61", {
    p_org_id: scope.orgId,
    p_project_id: projectId,
    p_data_class: scope.dataClass,
    p_risk_id: current.id,
    p_expected_version: input.expectedVersion,
    p_idempotency_key: input.idempotencyKey.trim(),
    p_risk_payload: riskToDbPayload(updated, scope, projectId),
    p_event_payload: eventToDbPayload(persistedEvent, scope, projectId),
    p_request_payload: {
      id: input.id,
      toStatus: input.toStatus,
      inputSummary: input.inputSummary,
      outputSummary: input.outputSummary,
      actionRequired: input.actionRequired,
      owner: input.owner,
      deadline: input.deadline,
      evidence: input.evidence,
      actor: input.actor,
      closure: input.closure,
    },
    p_actor_user_id: scope.actorUserId || null,
  });
  if (error) throw error;
  const result = readRpcResult(data);
  if (!result.event) throw new Error("RISK_RPC_INVALID_RESPONSE");
  return { risk: toRisk(result.risk), event: toRiskWorkflowEvent(result.event) };
}

export async function deleteRiskFromRepository(
  input: RiskArchiveInput,
  scope: RiskRepositoryScope,
): Promise<Risk> {
  assertWriteControl(input);
  const current = await findRiskInScope(input.id, scope, { includeArchived: true });
  const projectId = current?.projectId || writableProjectId(scope);
  if (!hasSupabaseConfig()) {
    const store = getMemoryStore();
    const requestHash = stableRequestHash({ operation: "archive", input });
    const key = receiptKey(scope, projectId, input.idempotencyKey);
    const receipt = store.__aiPmRiskWriteReceipts?.get(key);
    if (receipt) {
      if (receipt.requestHash !== requestHash) throw new Error("IDEMPOTENCY_KEY_REUSED");
      return receipt.result as Risk;
    }
    if (!current) throw new Error("RISK_NOT_FOUND_OR_OUTSIDE_SCOPE");
    if (Number(current.version ?? 1) !== input.expectedVersion) throw new Error("VERSION_CONFLICT");
    const archived = {
      ...current,
      version: input.expectedVersion + 1,
      archivedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    store.__aiPmRisks = (store.__aiPmRisks ?? []).map(risk => risk.id === current.id ? archived : risk);
    store.__aiPmRiskWriteReceipts?.set(key, { requestHash, result: archived });
    return archived;
  }
  const supabase = getSupabaseClient();
  if (!current && !uuidPattern.test(input.id)) throw new Error("RISK_NOT_FOUND_OR_OUTSIDE_SCOPE");
  const { data, error } = await supabase.rpc("archive_risk_v61", {
    p_org_id: scope.orgId,
    p_project_id: projectId,
    p_data_class: scope.dataClass,
    p_risk_id: current?.id || input.id,
    p_expected_version: input.expectedVersion,
    p_idempotency_key: input.idempotencyKey.trim(),
    p_archive_reason: input.reason?.trim() || null,
    p_actor_user_id: scope.actorUserId || null,
  });
  if (error) throw error;
  return toRisk(readRpcResult(data).risk);
}
