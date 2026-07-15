import { parseCommercialQualityWriteContract, requireObject } from "@/features/commercial-quality/contracts";
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

async function loadCommercial(projectId: string, dataClass: string) {
  const supabase = deliverySupabase();
  const project = await supabase.from("projects").select("id,name,oa_no,data_class,updated_at").eq("id", projectId).eq("data_class", dataClass).maybeSingle();
  if (project.error) throw project.error;
  if (!project.data) throw new Error("PROJECT_NOT_FOUND");
  const [contracts, receivables, collections, mirrorContracts, mirrorPayments, events] = await Promise.all([
    supabase.from("project_contract_records").select("*").eq("project_id", projectId).eq("data_class", dataClass).order("updated_at", { ascending: false }),
    supabase.from("project_receivable_records").select("*").eq("project_id", projectId).eq("data_class", dataClass).order("due_date", { ascending: true }),
    supabase.from("project_collection_records").select("*").eq("project_id", projectId).eq("data_class", dataClass).order("collected_date", { ascending: false }),
    supabase.from("contracts").select("id,contract_code,name,total_amount,status,payment_terms,source_system,source_record_id,source_updated_at,data_class").eq("project_id", projectId).eq("data_class", dataClass).eq("is_source_deleted", false),
    supabase.from("payment_milestones").select("id,contract_id,payment_code,name,amount,collected_amount,write_off_amount,due_date,status,actual_paid_date,source_system,source_record_id,source_updated_at,data_class").eq("project_id", projectId).eq("data_class", dataClass).eq("is_source_deleted", false),
    supabase.from("project_commercial_quality_events").select("id,aggregate_type,aggregate_id,event_type,aggregate_version,business_role,actor_user_id,payload,created_at").eq("project_id", projectId).eq("data_class", dataClass).in("aggregate_type", ["contract", "receivable", "collection"]).order("created_at", { ascending: false }).limit(50),
  ]);
  const error = contracts.error || receivables.error || collections.error || mirrorContracts.error || mirrorPayments.error || events.error;
  if (error) throw error;
  return {
    project: project.data,
    contracts: contracts.data ?? [],
    receivables: receivables.data ?? [],
    collections: collections.data ?? [],
    sourceMirror: { contracts: mirrorContracts.data ?? [], payments: mirrorPayments.data ?? [] },
    events: events.data ?? [],
  };
}

export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  const resolved = await resolveDeliveryProject(request);
  if (!resolved.ok) return deliveryJson({ ...resolved, request_id: requestId }, resolved.status, requestId);
  try {
    const data = await loadCommercial(resolved.projectId, resolved.dataClass);
    const latest = [...data.contracts, ...data.receivables, ...data.collections].map((item) => String(item.updated_at ?? item.created_at ?? "")).sort().at(-1);
    return deliverySuccess(resolved, requestId, data, { updatedAt: latest || data.project.updated_at, sourceType: "supabase+feishu_mirror" });
  } catch (error) {
    const detail = deliveryErrorMessage(error);
    const missing = /project_(contract|receivable|collection)|relation|does not exist/i.test(detail);
    return deliveryJson({ error: missing ? "V632_COMMERCIAL_STORAGE_NOT_READY" : "COMMERCIAL_DATA_LOAD_FAILED", detail: missing ? "请先应用V6.3.2商财质量迁移。" : detail, request_id: requestId, source: deliverySource(resolved.dataClass) }, 503, requestId);
  }
}

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; }
  catch { return deliveryJson({ error: "INVALID_JSON", request_id: requestId }, 400, requestId); }
  const resolved = await resolveDeliveryProject(request, body);
  if (!resolved.ok) return deliveryJson({ ...resolved, request_id: requestId }, resolved.status, requestId);
  const operation = String(body.operation ?? "").trim();

  if (operation === "parse_terms") {
    try {
      const text = requiredText(body.text, "合同付款条款", 20000);
      const result = await llmComplete("parse", "你是合同到现金管理助手。仅从用户提供的合同文本提取付款节点，不得编造签约、验收、开票或回款事实。返回严格JSON：{\"milestones\":[{\"title\":\"节点名称\",\"amount\":0,\"due_date\":\"YYYY-MM-DD\",\"trigger_type\":\"验收/日期/交付\",\"trigger_reference\":\"依据\"}],\"warnings\":[]}。", text, { temperature: 0.2 });
      const match = result.content.match(/\{[\s\S]*\}/);
      const candidate = JSON.parse(match?.[0] ?? result.content) as Record<string, unknown>;
      return deliverySuccess(resolved, requestId, candidate, { sourceType: "llm+human_input", warnings: ["AI只生成应收节点候选；用户复核并保存后才成为正式记录。"] });
    } catch (error) {
      return deliveryJson({ error: "CONTRACT_TERMS_AI_FAILED", detail: deliveryErrorMessage(error), request_id: requestId }, 503, requestId);
    }
  }

  let contract;
  try { contract = parseCommercialQualityWriteContract(body); }
  catch (error) { return deliveryJson({ error: "WRITE_CONTRACT_INVALID", detail: deliveryErrorMessage(error), request_id: requestId }, 400, requestId); }
  if (contract.projectId !== resolved.projectId || contract.businessRole !== resolved.businessRole || contract.dataClass !== resolved.dataClass) return deliveryJson({ error: "WRITE_CONTEXT_MISMATCH", request_id: requestId }, 409, requestId);
  const supabase = deliverySupabase();
  const common = { p_org_id: resolved.orgId, p_project_id: resolved.projectId, p_data_class: resolved.dataClass, p_business_role: resolved.businessRole, p_actor_user_id: resolved.user.id, p_idempotency_key: contract.idempotencyKey, p_expected_version: contract.expectedVersion };

  try {
    if (["save_contract", "save_receivable", "record_collection"].includes(operation)) {
      const recordType = operation === "save_contract" ? "contract" : operation === "save_receivable" ? "receivable" : "collection";
      const payload = requireObject(body.payload, `${recordType}数据`);
      const required = recordType === "contract" ? ["contract_code", "name"] : recordType === "receivable" ? ["contract_record_id", "receivable_code", "title", "amount"] : ["receivable_record_id", "collection_code", "amount", "collected_date"];
      for (const field of required) requiredText(payload[field], field, 500);
      const result = await supabase.rpc("save_project_commercial_record_tx", { ...common, p_record_type: recordType, p_record_id: String(body.record_id ?? "").trim() || null, p_payload: payload });
      if (result.error) throw result.error;
      return deliverySuccess(resolved, requestId, result.data, { updatedAt: String(result.data?.updated_at ?? "") });
    }
    if (operation === "transition") {
      const result = await supabase.rpc("transition_project_commercial_quality_tx", { ...common, p_record_type: "contract", p_record_id: requiredText(body.record_id, "合同ID", 80), p_operation: requiredText(body.transition, "状态动作", 40), p_comment: String(body.comment ?? "").trim() || null });
      if (result.error) throw result.error;
      return deliverySuccess(resolved, requestId, result.data, { updatedAt: String(result.data?.updated_at ?? "") });
    }
    return deliveryJson({ error: "COMMERCIAL_OPERATION_INVALID", request_id: requestId }, 400, requestId);
  } catch (error) {
    const detail = deliveryErrorMessage(error);
    return deliveryJson({ error: "COMMERCIAL_OPERATION_FAILED", detail, request_id: requestId }, deliveryErrorStatus(detail), requestId);
  }
}
