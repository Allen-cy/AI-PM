import { parseCommercialQualityWriteContract, requireObject } from "@/features/commercial-quality/contracts";
import { deliveryErrorMessage, deliveryErrorStatus, deliveryJson, deliverySource, deliverySuccess, deliverySupabase, resolveDeliveryProject } from "@/features/delivery-control/server";
import { llmComplete } from "@/lib/llm";

export const runtime = "nodejs";

async function loadStakeholders(projectId: string, dataClass: string) {
  const supabase = deliverySupabase();
  const project = await supabase.from("projects").select("id,name,oa_no,data_class,updated_at").eq("id", projectId).eq("data_class", dataClass).maybeSingle();
  if (project.error) throw project.error;
  if (!project.data) throw new Error("PROJECT_NOT_FOUND");
  const [stakeholders, actions, events] = await Promise.all([
    supabase.from("project_stakeholder_records").select("*").eq("project_id", projectId).eq("data_class", dataClass).order("updated_at", { ascending: false }),
    supabase.from("project_stakeholder_engagement_actions").select("*").eq("project_id", projectId).eq("data_class", dataClass).order("due_at", { ascending: true }),
    supabase.from("project_commercial_quality_events").select("id,aggregate_type,aggregate_id,event_type,aggregate_version,business_role,actor_user_id,payload,created_at").eq("project_id", projectId).eq("data_class", dataClass).in("aggregate_type", ["stakeholder", "stakeholder_action"]).order("created_at", { ascending: false }).limit(50),
  ]);
  const error = stakeholders.error || actions.error || events.error;
  if (error) throw error;
  return { project: project.data, stakeholders: stakeholders.data ?? [], actions: actions.data ?? [], events: events.data ?? [] };
}

export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  const resolved = await resolveDeliveryProject(request);
  if (!resolved.ok) return deliveryJson({ ...resolved, request_id: requestId }, resolved.status, requestId);
  try {
    const data = await loadStakeholders(resolved.projectId, resolved.dataClass);
    return deliverySuccess(resolved, requestId, data, { updatedAt: data.stakeholders[0]?.updated_at ?? data.project.updated_at });
  } catch (error) {
    const detail = deliveryErrorMessage(error);
    const missing = /project_stakeholder_|relation|does not exist/i.test(detail);
    return deliveryJson({ error: missing ? "V632_STAKEHOLDER_STORAGE_NOT_READY" : "STAKEHOLDER_DATA_LOAD_FAILED", detail: missing ? "请先应用V6.3.2商财质量迁移。" : detail, request_id: requestId, source: deliverySource(resolved.dataClass) }, 503, requestId);
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
      const current = await supabase.from("project_stakeholder_records").select("stakeholder_code,name,role_title,organization_name,power,interest,current_engagement,desired_engagement,communication_frequency,communication_method,management_strategy").eq("project_id", resolved.projectId).eq("data_class", resolved.dataClass).eq("status", "active");
      if (current.error) throw current.error;
      if (!current.data?.length) throw new Error("STAKEHOLDER_INPUT_REQUIRED");
      const result = await llmComplete("stakeholder", "你是干系人管理助手。仅根据正式登记册分析权力-利益、参与度差距和沟通建议，不得编造人员或已完成沟通事实。返回JSON建议和依据。AI只生成候选策略，必须由项目人员复核保存。", JSON.stringify(current.data), { temperature: 0.2 });
      return deliverySuccess(resolved, requestId, { suggestion: result.content, model: result.model }, { sourceType: "llm+supabase", warnings: ["AI只生成候选策略，不会自动修改登记册或关闭参与行动。"] });
    } catch (error) { return deliveryJson({ error: "STAKEHOLDER_AI_FAILED", detail: deliveryErrorMessage(error), request_id: requestId }, 503, requestId); }
  }

  let contract;
  try { contract = parseCommercialQualityWriteContract(body); }
  catch (error) { return deliveryJson({ error: "WRITE_CONTRACT_INVALID", detail: deliveryErrorMessage(error), request_id: requestId }, 400, requestId); }
  if (contract.projectId !== resolved.projectId || contract.businessRole !== resolved.businessRole || contract.dataClass !== resolved.dataClass) return deliveryJson({ error: "WRITE_CONTEXT_MISMATCH", request_id: requestId }, 409, requestId);
  const common = { p_org_id: resolved.orgId, p_project_id: resolved.projectId, p_data_class: resolved.dataClass, p_business_role: resolved.businessRole, p_actor_user_id: resolved.user.id, p_idempotency_key: contract.idempotencyKey, p_expected_version: contract.expectedVersion, p_record_id: String(body.record_id ?? "").trim() || null };
  try {
    const payload = requireObject(body.payload, operation === "save_stakeholder" ? "干系人" : "参与行动");
    const fn = operation === "save_stakeholder" ? "save_project_stakeholder_record_tx" : operation === "save_action" ? "save_project_stakeholder_action_tx" : "";
    if (!fn) return deliveryJson({ error: "STAKEHOLDER_OPERATION_INVALID", request_id: requestId }, 400, requestId);
    const result = await supabase.rpc(fn, { ...common, p_payload: payload });
    if (result.error) throw result.error;
    return deliverySuccess(resolved, requestId, result.data, { updatedAt: String(result.data?.updated_at ?? "") });
  } catch (error) {
    const detail = deliveryErrorMessage(error);
    return deliveryJson({ error: "STAKEHOLDER_OPERATION_FAILED", detail, request_id: requestId }, deliveryErrorStatus(detail), requestId);
  }
}
