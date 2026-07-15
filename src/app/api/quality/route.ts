import { parseCommercialQualityWriteContract, requireArray, requireObject } from "@/features/commercial-quality/contracts";
import { deliveryErrorMessage, deliveryErrorStatus, deliveryJson, deliverySource, deliverySuccess, deliverySupabase, resolveDeliveryProject } from "@/features/delivery-control/server";
import { llmComplete } from "@/lib/llm";

export const runtime = "nodejs";

async function loadQuality(projectId: string, dataClass: string) {
  const supabase = deliverySupabase();
  const project = await supabase.from("projects").select("id,name,oa_no,data_class,updated_at").eq("id", projectId).eq("data_class", dataClass).maybeSingle();
  if (project.error) throw project.error;
  if (!project.data) throw new Error("PROJECT_NOT_FOUND");
  const [plans, checkItems, defects, acceptances, acceptanceItems, signoffs, events] = await Promise.all([
    supabase.from("project_quality_plans").select("*").eq("project_id", projectId).eq("data_class", dataClass).order("revision_no", { ascending: false }),
    supabase.from("project_quality_check_items").select("*").eq("project_id", projectId).eq("data_class", dataClass).order("item_code"),
    supabase.from("project_defect_records").select("*").eq("project_id", projectId).eq("data_class", dataClass).order("updated_at", { ascending: false }),
    supabase.from("project_acceptance_records").select("*").eq("project_id", projectId).eq("data_class", dataClass).order("updated_at", { ascending: false }),
    supabase.from("project_acceptance_items").select("*").eq("project_id", projectId).eq("data_class", dataClass).order("item_code"),
    supabase.from("project_signoff_records").select("*").eq("project_id", projectId).eq("data_class", dataClass).order("updated_at", { ascending: false }),
    supabase.from("project_commercial_quality_events").select("id,aggregate_type,aggregate_id,event_type,aggregate_version,business_role,actor_user_id,payload,created_at").eq("project_id", projectId).eq("data_class", dataClass).in("aggregate_type", ["quality_plan", "defect", "acceptance", "signoff"]).order("created_at", { ascending: false }).limit(80),
  ]);
  const error = plans.error || checkItems.error || defects.error || acceptances.error || acceptanceItems.error || signoffs.error || events.error;
  if (error) throw error;
  return { project: project.data, plans: plans.data ?? [], checkItems: checkItems.data ?? [], defects: defects.data ?? [], acceptances: acceptances.data ?? [], acceptanceItems: acceptanceItems.data ?? [], signoffs: signoffs.data ?? [], events: events.data ?? [] };
}

export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  const resolved = await resolveDeliveryProject(request);
  if (!resolved.ok) return deliveryJson({ ...resolved, request_id: requestId }, resolved.status, requestId);
  try {
    const data = await loadQuality(resolved.projectId, resolved.dataClass);
    const latest = [...data.plans, ...data.defects, ...data.acceptances, ...data.signoffs].map((item) => String(item.updated_at ?? item.created_at ?? "")).sort().at(-1);
    return deliverySuccess(resolved, requestId, data, { updatedAt: latest || data.project.updated_at });
  } catch (error) {
    const detail = deliveryErrorMessage(error);
    const missing = /project_(quality|defect|acceptance|signoff)|relation|does not exist/i.test(detail);
    return deliveryJson({ error: missing ? "V632_QUALITY_STORAGE_NOT_READY" : "QUALITY_DATA_LOAD_FAILED", detail: missing ? "请先应用V6.3.2商财质量迁移。" : detail, request_id: requestId, source: deliverySource(resolved.dataClass) }, 503, requestId);
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
  const supabase = deliverySupabase();

  if (operation === "assist") {
    try {
      const facts = requireObject(body.facts, "质量评审输入");
      const result = await llmComplete("quality", "你是质量管理助手。只能根据用户输入和当前项目正式事实识别质量问题、检查项候选与改进建议，不得编造已通过检查、已关闭缺陷、已验收或已签发事实。返回严格JSON。", JSON.stringify(facts), { temperature: 0.2 });
      return deliverySuccess(resolved, requestId, { suggestion: result.content, model: result.model }, { sourceType: "llm+human_input", warnings: ["AI只生成候选分析，检查、整改、验收和签发必须由责任人完成。"] });
    } catch (error) { return deliveryJson({ error: "QUALITY_AI_FAILED", detail: deliveryErrorMessage(error), request_id: requestId }, 503, requestId); }
  }

  let contract;
  try { contract = parseCommercialQualityWriteContract(body); }
  catch (error) { return deliveryJson({ error: "WRITE_CONTRACT_INVALID", detail: deliveryErrorMessage(error), request_id: requestId }, 400, requestId); }
  if (contract.projectId !== resolved.projectId || contract.businessRole !== resolved.businessRole || contract.dataClass !== resolved.dataClass) return deliveryJson({ error: "WRITE_CONTEXT_MISMATCH", request_id: requestId }, 409, requestId);
  const common = { p_org_id: resolved.orgId, p_project_id: resolved.projectId, p_data_class: resolved.dataClass, p_business_role: resolved.businessRole, p_actor_user_id: resolved.user.id, p_idempotency_key: contract.idempotencyKey, p_expected_version: contract.expectedVersion };

  try {
    let result;
    if (operation === "save_plan") {
      const payload = requireObject(body.payload, "质量计划");
      result = await supabase.rpc("save_project_quality_plan_tx", { ...common, p_plan_id: String(body.record_id ?? "").trim() || null, p_title: String(payload.title ?? "").trim(), p_phase: String(payload.phase ?? "").trim(), p_standards: Array.isArray(payload.standards) ? payload.standards : [], p_acceptance_strategy: String(payload.acceptance_strategy ?? "").trim() || null, p_items: requireArray(body.items, "质量检查项") });
    } else if (operation === "save_check_result") {
      result = await supabase.rpc("save_project_quality_check_result_tx", { ...common, p_item_id: String(body.record_id ?? "").trim(), p_result: String(body.result ?? "").trim(), p_evidence: Array.isArray(body.evidence) ? body.evidence : [], p_comment: String(body.comment ?? "").trim() || null });
    } else if (operation === "save_defect") {
      result = await supabase.rpc("save_project_defect_tx", { ...common, p_defect_id: String(body.record_id ?? "").trim() || null, p_payload: requireObject(body.payload, "缺陷记录") });
    } else if (operation === "save_acceptance") {
      result = await supabase.rpc("save_project_acceptance_tx", { ...common, p_acceptance_id: String(body.record_id ?? "").trim() || null, p_payload: requireObject(body.payload, "验收记录"), p_items: requireArray(body.items, "验收标准") });
    } else if (operation === "save_acceptance_item_result") {
      result = await supabase.rpc("save_project_acceptance_item_result_tx", { ...common, p_item_id: String(body.record_id ?? "").trim(), p_actual: String(body.actual ?? "").trim(), p_result: String(body.result ?? "").trim(), p_evidence: Array.isArray(body.evidence) ? body.evidence : [], p_comment: String(body.comment ?? "").trim() || null });
    } else if (operation === "save_signoff") {
      result = await supabase.rpc("save_project_signoff_tx", { ...common, p_signoff_id: String(body.record_id ?? "").trim() || null, p_payload: requireObject(body.payload, "签发记录") });
    } else if (operation === "transition") {
      result = await supabase.rpc("transition_project_commercial_quality_tx", { ...common, p_record_type: String(body.record_type ?? "").trim(), p_record_id: String(body.record_id ?? "").trim(), p_operation: String(body.transition ?? "").trim(), p_comment: String(body.comment ?? "").trim() || null });
    } else return deliveryJson({ error: "QUALITY_OPERATION_INVALID", request_id: requestId }, 400, requestId);
    if (result.error) throw result.error;
    return deliverySuccess(resolved, requestId, result.data, { updatedAt: String(result.data?.updated_at ?? "") });
  } catch (error) {
    const detail = deliveryErrorMessage(error);
    return deliveryJson({ error: "QUALITY_OPERATION_FAILED", detail, request_id: requestId }, deliveryErrorStatus(detail), requestId);
  }
}
