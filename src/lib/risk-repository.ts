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
  initialRisks,
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

type RiskDbRow = {
  id: string;
  project_id?: string | null;
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
  created_at?: string | null;
  updated_at?: string | null;
};

type RiskWorkflowEventDbRow = {
  id: string;
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
  created_at?: string | null;
};

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
}

export interface RiskListResult {
  risks: Risk[];
  events: RiskWorkflowEvent[];
  source: "supabase" | "memory";
  warning?: string;
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
  };
  globalStore.__aiPmRisks ??= initialRisks;
  globalStore.__aiPmRiskEvents ??= [];
  return globalStore;
}

function hasSupabaseConfig(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL
    && (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  );
}

function getSupabaseClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
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
  };
}

function riskToDbPayload(risk: Risk): Record<string, unknown> {
  const isUuid = uuidPattern.test(risk.id);
  return {
    ...(isUuid ? { id: risk.id } : {}),
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
    closed_at: risk.status === "closed" ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  };
}

function eventToDbPayload(event: RiskWorkflowEvent): Record<string, unknown> {
  return {
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
  };
}

export async function listRisks(): Promise<RiskListResult> {
  if (!hasSupabaseConfig()) {
    const store = getMemoryStore();
    return {
      risks: store.__aiPmRisks ?? [],
      events: store.__aiPmRiskEvents ?? [],
      source: "memory",
      warning: "未配置Supabase，本地开发模式仅使用内存数据。",
    };
  }

  const supabase = getSupabaseClient();
  const { data: risks, error } = await supabase
    .from("risks")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw error;

  const { data: events, error: eventsError } = await supabase
    .from("risk_workflow_events")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);

  if (eventsError) {
    return {
      risks: (risks ?? []).map(row => toRisk(row as RiskDbRow)),
      events: [],
      source: "supabase",
      warning: "risk_workflow_events 表尚未创建，请执行 supabase-risk-v521.sql。",
    };
  }

  return {
    risks: (risks ?? []).map(row => toRisk(row as RiskDbRow)),
    events: (events ?? []).map(row => toRiskWorkflowEvent(row as RiskWorkflowEventDbRow)),
    source: "supabase",
  };
}

export async function saveRiskToRepository(risk: Risk): Promise<Risk> {
  const normalizedRisk: Risk = {
    ...risk,
    workflowStep: risk.workflowStep || statusToWorkflowStep(risk.status),
    actionOwner: risk.actionOwner || risk.owner,
    actionDeadline: risk.actionDeadline || risk.dueDate,
  };

  if (!hasSupabaseConfig()) {
    const store = getMemoryStore();
    const risks = store.__aiPmRisks ?? [];
    const index = risks.findIndex(item => item.id === normalizedRisk.id);
    if (index >= 0) risks[index] = normalizedRisk;
    else risks.unshift(normalizedRisk);
    store.__aiPmRisks = risks;
    return normalizedRisk;
  }

  const supabase = getSupabaseClient();
  const payload = riskToDbPayload(normalizedRisk);
  const riskCode = String(payload.risk_code || "");
  const query = riskCode
    ? supabase.from("risks").upsert(payload, { onConflict: "risk_code" })
    : supabase.from("risks").upsert(payload);
  const { data, error } = await query.select().single();
  if (error) throw error;
  return toRisk(data as RiskDbRow);
}

export async function saveRisksToRepository(risks: Risk[]): Promise<Risk[]> {
  const saved: Risk[] = [];
  for (const risk of risks) {
    saved.push(await saveRiskToRepository(risk));
  }
  return saved;
}

export async function transitionRisk(input: RiskTransitionInput): Promise<{ risk: Risk; event: RiskWorkflowEvent; warning?: string }> {
  const list = await listRisks();
  const current = list.risks.find(risk => risk.id === input.id || risk.riskCode === input.id);
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
    store.__aiPmRisks = (store.__aiPmRisks ?? []).map(risk => risk.id === current.id ? updated : risk);
    store.__aiPmRiskEvents = [event, ...(store.__aiPmRiskEvents ?? [])];
    return { risk: updated, event, warning: list.warning };
  }

  const savedRisk = await saveRiskToRepository(updated);
  const persistedEvent = { ...event, riskId: savedRisk.id, riskCode: savedRisk.riskCode };
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("risk_workflow_events")
    .insert(eventToDbPayload(persistedEvent))
    .select()
    .single();

  if (error) {
    return {
      risk: savedRisk,
      event: persistedEvent,
      warning: "风险状态已保存，但工作流事件未写入。请确认已执行 supabase-risk-v521.sql。",
    };
  }

  return { risk: savedRisk, event: toRiskWorkflowEvent(data as RiskWorkflowEventDbRow) };
}

export async function deleteRiskFromRepository(id: string): Promise<void> {
  if (!hasSupabaseConfig()) {
    const store = getMemoryStore();
    store.__aiPmRisks = (store.__aiPmRisks ?? []).filter(risk => risk.id !== id && risk.riskCode !== id);
    return;
  }
  const supabase = getSupabaseClient();
  const { error } = uuidPattern.test(id)
    ? await supabase.from("risks").delete().eq("id", id)
    : await supabase.from("risks").delete().eq("risk_code", id);
  if (error) throw error;
}
