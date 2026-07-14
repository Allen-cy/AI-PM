import { createHash } from "node:crypto";

import { parseDeliveryWriteContract } from "@/features/delivery-control/contracts";
import {
  deliveryErrorMessage,
  deliveryErrorStatus,
  deliveryJson,
  deliverySource,
  deliverySuccess,
  deliverySupabase,
  resolveDeliveryProject,
} from "@/features/delivery-control/server";
import { calculateCPM, type Task } from "@/lib/cpm";
import { llmComplete } from "@/lib/llm";

export const runtime = "nodejs";

type StoredWbsItem = {
  id: string;
  item_code: string;
  name: string;
  duration_days: number | string;
  predecessors: unknown;
};

function tasksFromWbs(items: StoredWbsItem[]): Task[] {
  const tasks = items.map((item) => ({
    id: String(item.item_code).trim(),
    name: String(item.name).trim(),
    duration: Number(item.duration_days),
    predecessors: Array.isArray(item.predecessors)
      ? item.predecessors.map((value) => String(value).trim()).filter(Boolean)
      : [],
  }));
  if (tasks.length === 0) throw new Error("PERSISTED_WBS_ITEMS_REQUIRED");
  const ids = new Set<string>();
  for (const task of tasks) {
    if (!task.id || ids.has(task.id) || !Number.isFinite(task.duration) || task.duration <= 0) throw new Error("WBS_TASK_INPUT_INVALID");
    ids.add(task.id);
  }
  for (const task of tasks) {
    if (task.predecessors.some((predecessor) => !ids.has(predecessor) || predecessor === task.id)) {
      throw new Error("WBS_PREDECESSOR_INVALID");
    }
  }
  const inDegree = new Map(tasks.map((task) => [task.id, task.predecessors.length]));
  const successors = new Map(tasks.map((task) => [task.id, [] as string[]]));
  tasks.forEach((task) => task.predecessors.forEach((predecessor) => successors.get(predecessor)?.push(task.id)));
  const queue = tasks.filter((task) => task.predecessors.length === 0).map((task) => task.id);
  let visited = 0;
  while (queue.length) {
    const current = queue.shift()!;
    visited += 1;
    for (const successor of successors.get(current) ?? []) {
      const degree = (inDegree.get(successor) ?? 0) - 1;
      inDegree.set(successor, degree);
      if (degree === 0) queue.push(successor);
    }
  }
  if (visited !== tasks.length) throw new Error("WBS_DEPENDENCY_CYCLE");
  return tasks;
}

function normalizedResult(result: ReturnType<typeof calculateCPM>) {
  return {
    tasks: result.tasks.map((task) => ({
      ...task,
      es: task.es ?? 0,
      ef: task.ef ?? task.duration,
      ls: task.ls ?? 0,
      lf: task.lf ?? task.duration,
      totalFloat: task.totalFloat ?? 0,
      isCritical: Boolean(task.isCritical),
    })),
    criticalPath: result.criticalPath,
    projectDuration: result.projectDuration,
    criticalDuration: result.criticalDuration,
  };
}

async function loadSchedule(projectId: string, dataClass: string) {
  const supabase = deliverySupabase();
  const [wbs, snapshots] = await Promise.all([
    supabase.from("project_wbs_versions").select("*").eq("project_id", projectId).eq("data_class", dataClass).neq("status", "superseded").order("revision_no", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("project_schedule_snapshots").select("*").eq("project_id", projectId).eq("data_class", dataClass).order("calculation_version", { ascending: false }).limit(20),
  ]);
  if (wbs.error || snapshots.error) throw wbs.error || snapshots.error;
  const items = wbs.data
    ? await supabase.from("project_wbs_items").select("id,item_code,name,duration_days,predecessors,planned_start,planned_end").eq("wbs_version_id", wbs.data.id).order("item_code")
    : { data: [], error: null };
  if (items.error) throw items.error;
  return { wbs: wbs.data ?? null, items: items.data ?? [], snapshots: snapshots.data ?? [], latest: snapshots.data?.[0] ?? null };
}

export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  const resolved = await resolveDeliveryProject(request);
  if (!resolved.ok) return deliveryJson({ ...resolved, request_id: requestId }, resolved.status, requestId);
  try {
    const data = await loadSchedule(resolved.projectId, resolved.dataClass);
    return deliverySuccess(resolved, requestId, data, { updatedAt: data.latest?.created_at ?? data.wbs?.updated_at ?? null });
  } catch (error) {
    const detail = deliveryErrorMessage(error);
    const missing = /project_(wbs|schedule)|relation|does not exist/i.test(detail);
    return deliveryJson({
      error: missing ? "V631_DELIVERY_STORAGE_NOT_READY" : "CPM_DATA_LOAD_FAILED",
      detail: missing ? "请先应用V6.3.1交付控制迁移。" : detail,
      request_id: requestId,
      source: deliverySource(resolved.dataClass),
    }, 503, requestId);
  }
}

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return deliveryJson({ error: "INVALID_JSON", request_id: requestId }, 400, requestId);
  }
  const resolved = await resolveDeliveryProject(request, body);
  if (!resolved.ok) return deliveryJson({ ...resolved, request_id: requestId }, resolved.status, requestId);
  if (String(body.operation ?? "calculate") !== "calculate") return deliveryJson({ error: "CPM_OPERATION_INVALID", request_id: requestId }, 400, requestId);

  let contract;
  try {
    contract = parseDeliveryWriteContract(body);
  } catch (error) {
    return deliveryJson({ error: "WRITE_CONTRACT_INVALID", detail: deliveryErrorMessage(error), request_id: requestId }, 400, requestId);
  }
  if (contract.projectId !== resolved.projectId || contract.businessRole !== resolved.businessRole || contract.dataClass !== resolved.dataClass) {
    return deliveryJson({ error: "WRITE_CONTEXT_MISMATCH", request_id: requestId }, 409, requestId);
  }

  const supabase = deliverySupabase();
  try {
    const stored = await loadSchedule(resolved.projectId, resolved.dataClass);
    if (!stored.wbs) throw new Error("PERSISTED_WBS_REQUIRED");
    if (stored.wbs.version !== contract.expectedVersion) throw new Error("VERSION_CONFLICT");
    const tasks = tasksFromWbs(stored.items as StoredWbsItem[]);
    const deterministic = normalizedResult(calculateCPM(tasks));
    const inputHash = createHash("sha256").update(JSON.stringify({ wbs: stored.wbs.id, version: stored.wbs.version, tasks })).digest("hex");
    let reasoning = `项目总工期为${deterministic.projectDuration}天；关键路径为${deterministic.criticalPath.join(" → ") || "无"}。关键任务总浮动为0，非关键任务可在各自总浮动范围内进行资源平衡。`;
    let model: string | null = null;
    const warnings: string[] = [];
    try {
      const ai = await llmComplete("cpm", "你是项目进度分析助手。只能解释系统给出的确定性CPM计算结果，不得修改工期、关键路径或浮动时间。用中文输出简洁的调度建议。", JSON.stringify(deterministic), { temperature: 0.1 });
      if (ai.content.trim()) reasoning = ai.content.trim();
      model = ai.model;
    } catch {
      warnings.push("AI解释未生成，CPM确定性计算结果不受影响。");
    }
    const payload = { ...deterministic, reasoning, model, inputHash, wbsVersionId: stored.wbs.id, wbsRevision: stored.wbs.revision_no };
    const saved = await supabase.rpc("save_project_schedule_snapshot_tx", {
      p_org_id: resolved.orgId,
      p_project_id: resolved.projectId,
      p_data_class: resolved.dataClass,
      p_business_role: resolved.businessRole,
      p_actor_user_id: resolved.user.id,
      p_idempotency_key: contract.idempotencyKey,
      p_expected_version: contract.expectedVersion,
      p_wbs_version_id: stored.wbs.id,
      p_input_hash: inputHash,
      p_result: payload,
    });
    if (saved.error) throw saved.error;
    return deliverySuccess(resolved, requestId, { snapshot: saved.data, result: payload, wbs: stored.wbs }, { warnings });
  } catch (error) {
    const detail = deliveryErrorMessage(error);
    return deliveryJson({ error: "CPM_CALCULATION_FAILED", detail, request_id: requestId }, deliveryErrorStatus(detail), requestId);
  }
}
