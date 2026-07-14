import { parseDeliveryWriteContract, requireDeliveryItems } from "@/features/delivery-control/contracts";
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

function requiredText(value: unknown, label: string, maximum = 4000) {
  const result = String(value ?? "").trim();
  if (!result || result.length > maximum) throw new Error(`${label}为必填项，且不得超过${maximum}字符。`);
  return result;
}

async function loadWbs(projectId: string, dataClass: string) {
  const supabase = deliverySupabase();
  const project = await supabase.from("projects").select("id,name,oa_no,data_class,updated_at").eq("id", projectId).eq("data_class", dataClass).maybeSingle();
  if (project.error) throw project.error;
  if (!project.data) throw new Error("PROJECT_NOT_FOUND");

  const versions = await supabase.from("project_wbs_versions").select("*").eq("project_id", projectId).eq("data_class", dataClass).order("revision_no", { ascending: false });
  if (versions.error) throw versions.error;
  const current = versions.data?.[0] ?? null;
  const [items, actuals, events] = await Promise.all([
    current
      ? supabase.from("project_wbs_items").select("*").eq("wbs_version_id", current.id).order("item_code")
      : Promise.resolve({ data: [], error: null }),
    current
      ? supabase.from("project_delivery_actuals").select("*").eq("wbs_version_id", current.id).order("updated_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    supabase.from("project_delivery_events").select("id,aggregate_type,aggregate_id,event_type,aggregate_version,business_role,actor_user_id,payload,created_at").eq("project_id", projectId).eq("data_class", dataClass).eq("aggregate_type", "wbs_version").order("created_at", { ascending: false }).limit(30),
  ]);
  const error = items.error || actuals.error || events.error;
  if (error) throw error;
  return {
    project: project.data,
    versions: versions.data ?? [],
    current,
    items: items.data ?? [],
    actuals: actuals.data ?? [],
    events: events.data ?? [],
  };
}

export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  const resolved = await resolveDeliveryProject(request);
  if (!resolved.ok) return deliveryJson({ ...resolved, request_id: requestId }, resolved.status, requestId);
  try {
    const data = await loadWbs(resolved.projectId, resolved.dataClass);
    return deliverySuccess(resolved, requestId, data, { updatedAt: data.current?.updated_at ?? data.project.updated_at });
  } catch (error) {
    const detail = deliveryErrorMessage(error);
    const missing = /project_wbs_|relation|does not exist/i.test(detail);
    return deliveryJson({
      error: missing ? "V631_DELIVERY_STORAGE_NOT_READY" : "WBS_DATA_LOAD_FAILED",
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
  const operation = String(body.operation ?? "").trim();
  const supabase = deliverySupabase();

  if (operation === "assist") {
    try {
      const project = await supabase.from("projects").select("id,name,oa_no").eq("id", resolved.projectId).eq("data_class", resolved.dataClass).maybeSingle();
      if (project.error || !project.data) throw project.error || new Error("PROJECT_NOT_FOUND");
      const scopeInput = body.scope_input && typeof body.scope_input === "object" && !Array.isArray(body.scope_input)
        ? body.scope_input as Record<string, unknown>
        : {};
      if (Object.keys(scopeInput).length === 0) throw new Error("WBS_SCOPE_INPUT_REQUIRED");
      const systemPrompt = `你是WBS规划助手。只能根据当前项目和用户提供的范围输入提出候选工作包，不得编造已批准范围、预算、人员或日期。返回严格JSON：{"items":[{"item_code":"1.1","parent_item_code":"1","level":2,"name":"工作包名称","description":"说明","duration_days":5,"predecessors":[],"planned_value":0,"acceptance_criteria":"验收标准"}],"warnings":[]}。工作包必须可交付、可估算、可验收，用户保存后才成为正式版本。`;
      const result = await llmComplete("wbs", systemPrompt, `项目ID：${project.data.id}\n项目名称：${project.data.name}\n项目编码：${project.data.oa_no || "未设置"}\n用户范围输入：${JSON.stringify(scopeInput)}`, { temperature: 0.2 });
      const match = result.content.match(/\{[\s\S]*\}/);
      const parsed = JSON.parse(match?.[0] ?? result.content) as Record<string, unknown>;
      requireDeliveryItems(parsed.items);
      return deliverySuccess(resolved, requestId, parsed, {
        sourceType: "llm+supabase",
        warnings: ["AI只生成候选WBS，必须由项目人员复核并保存后才进入版本管理。"],
      });
    } catch (error) {
      return deliveryJson({ error: "WBS_AI_FAILED", detail: deliveryErrorMessage(error), request_id: requestId }, 503, requestId);
    }
  }

  let contract;
  try {
    contract = parseDeliveryWriteContract(body);
  } catch (error) {
    return deliveryJson({ error: "WRITE_CONTRACT_INVALID", detail: deliveryErrorMessage(error), request_id: requestId }, 400, requestId);
  }
  if (contract.projectId !== resolved.projectId || contract.businessRole !== resolved.businessRole || contract.dataClass !== resolved.dataClass) {
    return deliveryJson({ error: "WRITE_CONTEXT_MISMATCH", request_id: requestId }, 409, requestId);
  }
  const common = {
    p_org_id: resolved.orgId,
    p_project_id: resolved.projectId,
    p_data_class: resolved.dataClass,
    p_business_role: resolved.businessRole,
    p_actor_user_id: resolved.user.id,
    p_idempotency_key: contract.idempotencyKey,
    p_expected_version: contract.expectedVersion,
  };
  try {
    if (operation === "save_version") {
      const items = requireDeliveryItems(body.items);
      const result = await supabase.rpc("save_project_wbs_version_tx", {
        ...common,
        p_title: requiredText(body.title, "WBS版本标题", 240),
        p_scope_source: body.scope_source && typeof body.scope_source === "object" && !Array.isArray(body.scope_source) ? body.scope_source : {},
        p_items: items,
        p_source_type: String(body.source_type ?? "human_input"),
      });
      if (result.error) throw result.error;
      return deliverySuccess(resolved, requestId, result.data, { updatedAt: String(result.data?.updated_at ?? "") });
    }
    if (operation === "transition_version") {
      const result = await supabase.rpc("transition_project_wbs_version_tx", {
        ...common,
        p_wbs_version_id: requiredText(body.wbs_version_id, "WBS版本ID", 80),
        p_operation: requiredText(body.transition, "状态动作", 40),
        p_comment: String(body.comment ?? "").trim() || null,
      });
      if (result.error) throw result.error;
      return deliverySuccess(resolved, requestId, result.data, { updatedAt: String(result.data?.updated_at ?? "") });
    }
    if (operation === "save_actual") {
      const result = await supabase.rpc("save_project_delivery_actual_tx", {
        ...common,
        p_wbs_item_id: requiredText(body.wbs_item_id, "WBS工作包ID", 80),
        p_actual_start: String(body.actual_start ?? "").trim() || null,
        p_actual_end: String(body.actual_end ?? "").trim() || null,
        p_percent_complete: Number(body.percent_complete ?? 0),
        p_status: requiredText(body.status, "工作包状态", 40),
        p_actual_cost: Number(body.actual_cost ?? 0),
        p_evidence: Array.isArray(body.evidence) ? body.evidence : [],
      });
      if (result.error) throw result.error;
      return deliverySuccess(resolved, requestId, result.data, { updatedAt: String(result.data?.updated_at ?? "") });
    }
    return deliveryJson({ error: "WBS_OPERATION_INVALID", request_id: requestId }, 400, requestId);
  } catch (error) {
    const detail = deliveryErrorMessage(error);
    return deliveryJson({ error: "WBS_OPERATION_FAILED", detail, request_id: requestId }, deliveryErrorStatus(detail), requestId);
  }
}
