import { createHash } from "node:crypto";

import { parseDeliveryWriteContract } from "@/features/delivery-control/contracts";
import { calculateGovernedEvm, type GovernedEvmPeriod } from "@/features/delivery-control/evm";
import {
  deliveryErrorMessage,
  deliveryErrorStatus,
  deliveryJson,
  deliverySource,
  deliverySuccess,
  deliverySupabase,
  resolveDeliveryProject,
} from "@/features/delivery-control/server";
import { llmComplete } from "@/lib/llm";

export const runtime = "nodejs";

type WbsValueItem = {
  id: string;
  item_code: string;
  name: string;
  planned_value: number | string;
  planned_start: string | null;
  planned_end: string | null;
};

type DeliveryActual = {
  wbs_item_id: string;
  percent_complete: number | string;
};

type CostRecord = {
  period: string;
  actual_cost: number | string;
  source_updated_at?: string | null;
};

function monthKey(value: string | null | undefined) {
  const normalized = String(value ?? "").trim();
  const match = normalized.match(/^(\d{4})[-/]?(\d{2})/);
  return match ? `${match[1]}-${match[2]}` : "未排期";
}

function buildPeriods(items: WbsValueItem[], actuals: DeliveryActual[], costs: CostRecord[]): GovernedEvmPeriod[] {
  if (items.length === 0) throw new Error("APPROVED_WBS_ITEMS_REQUIRED");
  if (actuals.length === 0) throw new Error("DELIVERY_ACTUALS_REQUIRED");
  if (costs.length === 0 || costs.every((cost) => Number(cost.actual_cost) <= 0)) throw new Error("REAL_COST_RECORDS_REQUIRED");

  const actualByItem = new Map(actuals.map((actual) => [actual.wbs_item_id, Number(actual.percent_complete) || 0]));
  const periods = new Map<string, GovernedEvmPeriod>();
  const ensure = (period: string) => {
    const current = periods.get(period) ?? { period, plannedValue: 0, earnedValue: 0, actualCost: 0 };
    periods.set(period, current);
    return current;
  };
  for (const item of items) {
    const period = monthKey(item.planned_end || item.planned_start);
    const planned = Number(item.planned_value) || 0;
    const completion = Math.min(100, Math.max(0, actualByItem.get(item.id) ?? 0));
    const row = ensure(period);
    row.plannedValue += planned;
    row.earnedValue += planned * completion / 100;
  }
  for (const cost of costs) ensure(monthKey(cost.period)).actualCost += Number(cost.actual_cost) || 0;
  return [...periods.values()]
    .filter((period) => period.plannedValue > 0 || period.earnedValue > 0 || period.actualCost > 0)
    .sort((a, b) => a.period.localeCompare(b.period));
}

async function loadEvm(projectId: string, dataClass: string) {
  const supabase = deliverySupabase();
  const [baseline, wbs, costs, snapshots] = await Promise.all([
    supabase.from("project_plan_baselines").select("*").eq("project_id", projectId).eq("data_class", dataClass).eq("baseline_type", "cost").eq("status", "approved").order("approved_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("project_wbs_versions").select("*").eq("project_id", projectId).eq("data_class", dataClass).eq("status", "approved").order("revision_no", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("cost_records").select("id,period,planned_value,actual_cost,earned_value,source_system,source_updated_at,updated_at").eq("project_id", projectId).eq("data_class", dataClass).eq("is_source_deleted", false).order("period"),
    supabase.from("project_evm_snapshots").select("*").eq("project_id", projectId).eq("data_class", dataClass).order("snapshot_version", { ascending: false }).limit(20),
  ]);
  const error = baseline.error || wbs.error || costs.error || snapshots.error;
  if (error) throw error;
  const [items, actuals] = wbs.data
    ? await Promise.all([
      supabase.from("project_wbs_items").select("id,item_code,name,planned_value,planned_start,planned_end").eq("wbs_version_id", wbs.data.id).order("item_code"),
      supabase.from("project_delivery_actuals").select("id,wbs_item_id,percent_complete,status,actual_cost,updated_at").eq("wbs_version_id", wbs.data.id).order("updated_at", { ascending: false }),
    ])
    : [{ data: [], error: null }, { data: [], error: null }];
  if (items.error || actuals.error) throw items.error || actuals.error;
  return {
    baseline: baseline.data ?? null,
    wbs: wbs.data ?? null,
    items: items.data ?? [],
    actuals: actuals.data ?? [],
    costs: costs.data ?? [],
    snapshots: snapshots.data ?? [],
    latest: snapshots.data?.[0] ?? null,
  };
}

export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  const resolved = await resolveDeliveryProject(request);
  if (!resolved.ok) return deliveryJson({ ...resolved, request_id: requestId }, resolved.status, requestId);
  try {
    const data = await loadEvm(resolved.projectId, resolved.dataClass);
    return deliverySuccess(resolved, requestId, data, { updatedAt: data.latest?.created_at ?? data.costs.at(-1)?.updated_at ?? null });
  } catch (error) {
    const detail = deliveryErrorMessage(error);
    const missing = /project_(wbs|evm|plan_baselines)|relation|does not exist/i.test(detail);
    return deliveryJson({
      error: missing ? "V631_DELIVERY_STORAGE_NOT_READY" : "EVM_DATA_LOAD_FAILED",
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
  if (String(body.operation ?? "calculate") !== "calculate") return deliveryJson({ error: "EVM_OPERATION_INVALID", request_id: requestId }, 400, requestId);

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
    const stored = await loadEvm(resolved.projectId, resolved.dataClass);
    if (!stored.baseline || Number(stored.baseline.baseline_value) <= 0) throw new Error("APPROVED_COST_BASELINE_REQUIRED");
    if (!stored.wbs) throw new Error("APPROVED_WBS_REQUIRED");
    if (stored.wbs.version !== contract.expectedVersion) throw new Error("VERSION_CONFLICT");
    const periods = buildPeriods(stored.items as WbsValueItem[], stored.actuals as DeliveryActual[], stored.costs as CostRecord[]);
    const metrics = calculateGovernedEvm({ budgetAtCompletion: Number(stored.baseline.baseline_value), periods });
    const asOfDate = String(body.as_of_date ?? new Date().toISOString().slice(0, 10));
    const inputHash = createHash("sha256").update(JSON.stringify({ baseline: stored.baseline.id, wbs: stored.wbs.id, periods, asOfDate })).digest("hex");
    let analysis = `截至${asOfDate}，SPI为${metrics.spi}，CPI为${metrics.cpi}，预计完工成本EAC为${metrics.eac}。`;
    let model: string | null = null;
    const warnings: string[] = [];
    try {
      const ai = await llmComplete("evm", "你是项目绩效分析助手。只能解释系统根据已批准成本基准、WBS实绩和成本台账确定性计算的EVM指标，不得修改任何数值。请说明偏差、风险和需人工确认的纠偏动作。", JSON.stringify({ metrics, periods }), { temperature: 0.1 });
      if (ai.content.trim()) analysis = ai.content.trim();
      model = ai.model;
    } catch {
      warnings.push("AI分析未生成，EVM确定性计算结果不受影响。");
    }
    const result = { ...metrics, periods, analysis, model, inputHash };
    const saved = await supabase.rpc("save_project_evm_snapshot_tx", {
      p_org_id: resolved.orgId,
      p_project_id: resolved.projectId,
      p_data_class: resolved.dataClass,
      p_business_role: resolved.businessRole,
      p_actor_user_id: resolved.user.id,
      p_idempotency_key: contract.idempotencyKey,
      p_expected_version: contract.expectedVersion,
      p_wbs_version_id: stored.wbs.id,
      p_cost_baseline_id: stored.baseline.id,
      p_as_of_date: asOfDate,
      p_input_hash: inputHash,
      p_periods: periods,
      p_result: result,
    });
    if (saved.error) throw saved.error;
    return deliverySuccess(resolved, requestId, { snapshot: saved.data, result, baseline: stored.baseline, wbs: stored.wbs }, { warnings });
  } catch (error) {
    const detail = deliveryErrorMessage(error);
    return deliveryJson({ error: "EVM_CALCULATION_FAILED", detail, request_id: requestId }, deliveryErrorStatus(detail), requestId);
  }
}
