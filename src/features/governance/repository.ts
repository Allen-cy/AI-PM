import { getAuthSupabase, isAuthStorageConfigured, type AppUser } from "../auth/server.ts";
import { governanceWorkflows } from "../pmo-operating-system.ts";
import {
  buildGovernanceReport,
  deriveGovernanceNextState,
  initialGovernanceState,
  isTerminalGovernanceState,
  parseGovernanceActionItems,
  workflowById,
  type GovernanceAction,
  type GovernanceActionRecord,
  type GovernanceEventRecord,
  type GovernanceInstanceRecord,
} from "./model.ts";

export interface GovernanceCreateInput {
  workflowId: string;
  projectId?: string;
  projectName: string;
  title?: string;
  triggerSummary?: string;
  inputSummary?: string;
  owner?: string;
  approver?: string;
  priority?: "high" | "medium" | "low";
  deadline?: string;
  actionItems?: unknown;
}

export interface GovernanceTransitionInput {
  id: string;
  action: GovernanceAction;
  comment?: string;
  outputSummary?: string;
  actionItems?: unknown;
}

function missingStorageResult() {
  return {
    status: "not_configured" as const,
    warning: "请先配置 Supabase 并执行 supabase-v529-governance-workflows.sql。",
  };
}

function isMissingTableError(message?: string): boolean {
  return Boolean(message?.includes("governance_process_instances") || message?.includes("governance_process_events") || message?.includes("relation") || message?.includes("does not exist"));
}

function mapInstance(row: Record<string, unknown>): GovernanceInstanceRecord {
  return {
    id: String(row.id),
    workflowId: String(row.workflow_id),
    workflowName: String(row.workflow_name),
    stage: String(row.stage),
    projectId: row.project_id ? String(row.project_id) : null,
    projectName: String(row.project_name),
    title: String(row.title),
    triggerSummary: row.trigger_summary ? String(row.trigger_summary) : null,
    inputSummary: row.input_summary ? String(row.input_summary) : null,
    outputSummary: row.output_summary ? String(row.output_summary) : null,
    owner: String(row.owner),
    approver: String(row.approver),
    state: String(row.state),
    priority: String(row.priority || "medium") as GovernanceInstanceRecord["priority"],
    deadline: row.deadline ? String(row.deadline) : null,
    source: String(row.source || "ai-pmo"),
    feishuRecordId: row.feishu_record_id ? String(row.feishu_record_id) : null,
    createdByName: row.created_by_name ? String(row.created_by_name) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    closedAt: row.closed_at ? String(row.closed_at) : null,
  };
}

function mapEvent(row: Record<string, unknown>): GovernanceEventRecord {
  return {
    id: String(row.id),
    instanceId: String(row.instance_id),
    eventType: String(row.event_type),
    fromState: row.from_state ? String(row.from_state) : null,
    toState: String(row.to_state),
    comment: row.comment ? String(row.comment) : null,
    actorName: row.actor_name ? String(row.actor_name) : null,
    actorRole: row.actor_role ? String(row.actor_role) : null,
    decision: row.decision ? String(row.decision) : null,
    outputs: typeof row.outputs === "object" && row.outputs !== null ? row.outputs as Record<string, unknown> : {},
    createdAt: String(row.created_at),
  };
}

function mapAction(row: Record<string, unknown>): GovernanceActionRecord {
  return {
    id: String(row.id),
    instanceId: String(row.instance_id),
    title: String(row.title),
    owner: row.owner ? String(row.owner) : null,
    dueDate: row.due_date ? String(row.due_date) : null,
    status: String(row.status || "open") as GovernanceActionRecord["status"],
    closeEvidence: row.close_evidence ? String(row.close_evidence) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

async function listEvents(instanceId: string): Promise<GovernanceEventRecord[]> {
  const supabase = getAuthSupabase();
  const { data, error } = await supabase
    .from("governance_process_events")
    .select("*")
    .eq("instance_id", instanceId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(item => mapEvent(item as Record<string, unknown>));
}

async function listActions(instanceId: string): Promise<GovernanceActionRecord[]> {
  const supabase = getAuthSupabase();
  const { data, error } = await supabase
    .from("governance_process_actions")
    .select("*")
    .eq("instance_id", instanceId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(item => mapAction(item as Record<string, unknown>));
}

export async function listGovernanceInstances(limit = 30): Promise<{
  status: "succeeded" | "not_configured" | "failed";
  workflows: typeof governanceWorkflows;
  instances: GovernanceInstanceRecord[];
  warning?: string;
}> {
  if (!isAuthStorageConfigured()) {
    return { ...missingStorageResult(), workflows: governanceWorkflows, instances: [] };
  }

  try {
    const supabase = getAuthSupabase();
    const { data, error } = await supabase
      .from("governance_process_instances")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(limit);
    if (error) {
      return {
        status: isMissingTableError(error.message) ? "not_configured" : "failed",
        workflows: governanceWorkflows,
        instances: [],
        warning: isMissingTableError(error.message) ? "请在 Supabase SQL Editor 执行 supabase-v529-governance-workflows.sql。" : error.message,
      };
    }
    return {
      status: "succeeded",
      workflows: governanceWorkflows,
      instances: (data ?? []).map(item => mapInstance(item as Record<string, unknown>)),
    };
  } catch (error) {
    return {
      status: "failed",
      workflows: governanceWorkflows,
      instances: [],
      warning: error instanceof Error ? error.message : "治理流程读取失败。",
    };
  }
}

export async function getGovernanceInstanceBundle(id: string): Promise<{
  status: "succeeded" | "not_found" | "not_configured" | "failed";
  instance?: GovernanceInstanceRecord;
  events: GovernanceEventRecord[];
  actions: GovernanceActionRecord[];
  warning?: string;
}> {
  if (!isAuthStorageConfigured()) return { ...missingStorageResult(), events: [], actions: [] };
  try {
    const supabase = getAuthSupabase();
    const { data, error } = await supabase
      .from("governance_process_instances")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) {
      return {
        status: isMissingTableError(error.message) ? "not_configured" : "failed",
        events: [],
        actions: [],
        warning: error.message,
      };
    }
    if (!data) return { status: "not_found", events: [], actions: [] };
    return {
      status: "succeeded",
      instance: mapInstance(data as Record<string, unknown>),
      events: await listEvents(id),
      actions: await listActions(id),
    };
  } catch (error) {
    return {
      status: "failed",
      events: [],
      actions: [],
      warning: error instanceof Error ? error.message : "治理流程读取失败。",
    };
  }
}

async function createActionItems(instanceId: string, actionItems: unknown, fallbackOwner?: string, eventId?: string): Promise<void> {
  const items = parseGovernanceActionItems(actionItems);
  if (items.length === 0) return;
  const supabase = getAuthSupabase();
  const { error } = await supabase
    .from("governance_process_actions")
    .insert(items.map(item => ({
      instance_id: instanceId,
      title: item.title,
      owner: item.owner || fallbackOwner || null,
      due_date: item.dueDate || null,
      status: "open",
      source_event_id: eventId ?? null,
    })));
  if (error) throw error;
}

export async function createGovernanceInstance(input: GovernanceCreateInput, user: AppUser | null): Promise<{
  status: "succeeded" | "not_configured" | "failed";
  instance?: GovernanceInstanceRecord;
  warning?: string;
}> {
  if (!isAuthStorageConfigured()) return missingStorageResult();
  const workflow = workflowById(input.workflowId);
  if (!workflow) return { status: "failed", warning: "未知治理流程类型。" };
  if (!input.projectName?.trim()) return { status: "failed", warning: "项目名称不能为空。" };

  try {
    const supabase = getAuthSupabase();
    const initialState = initialGovernanceState(input.workflowId);
    const { data, error } = await supabase
      .from("governance_process_instances")
      .insert({
        workflow_id: workflow.id,
        workflow_name: workflow.name,
        stage: workflow.stage,
        project_id: input.projectId || null,
        project_name: input.projectName.trim(),
        title: input.title?.trim() || `${input.projectName.trim()}-${workflow.name}`,
        trigger_summary: input.triggerSummary?.trim() || workflow.trigger,
        input_summary: input.inputSummary?.trim() || "",
        output_summary: null,
        owner: input.owner?.trim() || workflow.owner,
        approver: input.approver?.trim() || workflow.approver,
        state: initialState,
        priority: input.priority || "medium",
        deadline: input.deadline || null,
        source: "ai-pmo",
        created_by: user?.id ?? null,
        created_by_name: user?.name || user?.email || null,
        metadata: { required_inputs: workflow.inputs, expected_outputs: workflow.outputs },
      })
      .select("*")
      .maybeSingle();
    if (error || !data) {
      return {
        status: error && isMissingTableError(error.message) ? "not_configured" : "failed",
        warning: error?.message || "治理流程创建失败。",
      };
    }

    const instance = mapInstance(data as Record<string, unknown>);
    const eventInsert = await supabase
      .from("governance_process_events")
      .insert({
        instance_id: instance.id,
        event_type: "created",
        from_state: null,
        to_state: instance.state,
        comment: "流程实例已创建。",
        actor_id: user?.id ?? null,
        actor_name: user?.name || user?.email || "系统",
        actor_role: user?.role || "system",
        decision: "created",
        outputs: {},
      })
      .select("id")
      .maybeSingle();
    if (eventInsert.error) throw eventInsert.error;
    await createActionItems(instance.id, input.actionItems, instance.owner, eventInsert.data?.id);
    return { status: "succeeded", instance };
  } catch (error) {
    return {
      status: "failed",
      warning: error instanceof Error ? error.message : "治理流程创建失败。",
    };
  }
}

export async function transitionGovernanceInstance(input: GovernanceTransitionInput, user: AppUser | null): Promise<{
  status: "succeeded" | "not_found" | "not_configured" | "failed";
  instance?: GovernanceInstanceRecord;
  event?: GovernanceEventRecord;
  warning?: string;
}> {
  if (!isAuthStorageConfigured()) return missingStorageResult();
  try {
    const bundle = await getGovernanceInstanceBundle(input.id);
    if (bundle.status !== "succeeded" || !bundle.instance) {
      return { status: bundle.status, warning: bundle.warning };
    }
    const current = bundle.instance;
    const nextState = deriveGovernanceNextState(current.workflowId, current.state, input.action);
    const now = new Date().toISOString();
    const supabase = getAuthSupabase();
    const { data, error } = await supabase
      .from("governance_process_instances")
      .update({
        state: nextState,
        output_summary: input.outputSummary?.trim() || current.outputSummary,
        updated_at: now,
        closed_at: isTerminalGovernanceState(nextState) ? now : current.closedAt,
      })
      .eq("id", current.id)
      .select("*")
      .maybeSingle();
    if (error || !data) {
      return {
        status: error && isMissingTableError(error.message) ? "not_configured" : "failed",
        warning: error?.message || "治理流程状态更新失败。",
      };
    }

    const eventInsert = await supabase
      .from("governance_process_events")
      .insert({
        instance_id: current.id,
        event_type: input.action,
        from_state: current.state,
        to_state: nextState,
        comment: input.comment?.trim() || null,
        actor_id: user?.id ?? null,
        actor_name: user?.name || user?.email || "系统",
        actor_role: user?.role || "system",
        decision: input.action,
        outputs: { output_summary: input.outputSummary?.trim() || "" },
      })
      .select("*")
      .maybeSingle();
    if (eventInsert.error || !eventInsert.data) throw eventInsert.error || new Error("治理流程审计事件写入失败。");
    await createActionItems(current.id, input.actionItems, current.owner, eventInsert.data.id);

    return {
      status: "succeeded",
      instance: mapInstance(data as Record<string, unknown>),
      event: mapEvent(eventInsert.data as Record<string, unknown>),
    };
  } catch (error) {
    return {
      status: "failed",
      warning: error instanceof Error ? error.message : "治理流程状态流转失败。",
    };
  }
}

export async function governanceReportMarkdown(id: string): Promise<{
  status: "succeeded" | "not_found" | "not_configured" | "failed";
  markdown?: string;
  filename?: string;
  warning?: string;
}> {
  const bundle = await getGovernanceInstanceBundle(id);
  if (bundle.status !== "succeeded" || !bundle.instance) {
    return { status: bundle.status, warning: bundle.warning };
  }
  const instance = bundle.instance;
  return {
    status: "succeeded",
    markdown: buildGovernanceReport({ instance, events: bundle.events, actions: bundle.actions }),
    filename: `${instance.workflowName}-${instance.projectName}-${instance.id.slice(0, 8)}.md`,
  };
}
