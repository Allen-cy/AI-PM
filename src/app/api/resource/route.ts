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
import { llmComplete } from "@/lib/llm";

export const runtime = "nodejs";

function arrayOfRecords(value: unknown, label: string) {
  if (!Array.isArray(value)) throw new Error(`${label}必须为结构化数组。`);
  return value.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error(`${label}包含不合法记录。`);
    return item as Record<string, unknown>;
  });
}

function requiredText(value: unknown, label: string, maximum = 240) {
  const result = String(value ?? "").trim();
  if (!result || result.length > maximum) throw new Error(`${label}为必填项，且不得超过${maximum}字符。`);
  return result;
}

async function loadResources(orgId: string, projectId: string, dataClass: string) {
  const supabase = deliverySupabase();
  const [plan, wbs, roles] = await Promise.all([
    supabase.from("project_resource_plans").select("*").eq("project_id", projectId).eq("data_class", dataClass).maybeSingle(),
    supabase.from("project_wbs_versions").select("id,revision_no,title,status,version,updated_at").eq("project_id", projectId).eq("data_class", dataClass).neq("status", "superseded").order("revision_no", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("user_business_roles").select("user_id,business_role,subject_scope,subject_id,status,valid_until").eq("org_id", orgId).eq("status", "active").or(`subject_id.eq.${projectId},subject_scope.eq.organization`),
  ]);
  const error = plan.error || wbs.error || roles.error;
  if (error) throw error;
  const [periods, assignments, conflicts, items] = await Promise.all([
    plan.data ? supabase.from("project_resource_capacity_periods").select("*").eq("resource_plan_id", plan.data.id).order("period_start") : Promise.resolve({ data: [], error: null }),
    plan.data ? supabase.from("project_resource_assignments").select("*").eq("resource_plan_id", plan.data.id).order("created_at") : Promise.resolve({ data: [], error: null }),
    plan.data ? supabase.from("project_resource_conflict_actions").select("*").eq("resource_plan_id", plan.data.id).order("due_at") : Promise.resolve({ data: [], error: null }),
    wbs.data ? supabase.from("project_wbs_items").select("id,item_code,name,assignee_user_id,assignee_name").eq("wbs_version_id", wbs.data.id).order("item_code") : Promise.resolve({ data: [], error: null }),
  ]);
  const childError = periods.error || assignments.error || conflicts.error || items.error;
  if (childError) throw childError;
  const userIds = [...new Set((roles.data ?? []).map((role) => role.user_id))];
  const users = userIds.length
    ? await supabase.from("app_users").select("id,name,email,phone,status").in("id", userIds).eq("status", "active")
    : { data: [], error: null };
  if (users.error) throw users.error;
  const roleByUser = new Map<string, string[]>();
  for (const role of roles.data ?? []) roleByUser.set(role.user_id, [...(roleByUser.get(role.user_id) ?? []), role.business_role]);
  return {
    plan: plan.data ?? null,
    periods: periods.data ?? [],
    assignments: assignments.data ?? [],
    conflicts: conflicts.data ?? [],
    wbs: wbs.data ?? null,
    wbsItems: items.data ?? [],
    members: (users.data ?? []).map((user) => ({ ...user, business_roles: roleByUser.get(user.id) ?? [] })),
  };
}

export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  const resolved = await resolveDeliveryProject(request);
  if (!resolved.ok) return deliveryJson({ ...resolved, request_id: requestId }, resolved.status, requestId);
  try {
    const data = await loadResources(resolved.orgId, resolved.projectId, resolved.dataClass);
    return deliverySuccess(resolved, requestId, data, { updatedAt: data.plan?.updated_at ?? data.wbs?.updated_at ?? null });
  } catch (error) {
    const detail = deliveryErrorMessage(error);
    const missing = /project_resource_|relation|does not exist/i.test(detail);
    return deliveryJson({
      error: missing ? "V631_DELIVERY_STORAGE_NOT_READY" : "RESOURCE_DATA_LOAD_FAILED",
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
      const stored = await loadResources(resolved.orgId, resolved.projectId, resolved.dataClass);
      if (!stored.plan || stored.periods.length === 0) throw new Error("PERSISTED_RESOURCE_PLAN_REQUIRED");
      const result = await llmComplete("planning", "你是资源容量分析助手。只能根据当前项目已保存的8–12周容量、分配和冲突数据给出调整建议，不得改变分配、关闭冲突或编造人员。返回严格JSON：{\"suggestions\":[],\"warnings\":[]}。", JSON.stringify({ plan: stored.plan, periods: stored.periods, assignments: stored.assignments, conflicts: stored.conflicts }), { temperature: 0.1 });
      const match = result.content.match(/\{[\s\S]*\}/);
      const parsed = JSON.parse(match?.[0] ?? result.content);
      return deliverySuccess(resolved, requestId, parsed, { sourceType: "llm+supabase", warnings: ["AI建议不会自动改变资源计划或关闭冲突。"] });
    } catch (error) {
      return deliveryJson({ error: "RESOURCE_AI_FAILED", detail: deliveryErrorMessage(error), request_id: requestId }, 503, requestId);
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
    if (operation === "save_plan") {
      const periods = arrayOfRecords(body.periods, "容量期间");
      const assignments = arrayOfRecords(body.assignments ?? [], "资源分配");
      const result = await supabase.rpc("save_project_resource_plan_tx", {
        ...common,
        p_title: requiredText(body.title, "容量计划标题"),
        p_horizon_start: requiredText(body.horizon_start, "计划开始日期", 20),
        p_horizon_end: requiredText(body.horizon_end, "计划结束日期", 20),
        p_periods: periods,
        p_assignments: assignments,
      });
      if (result.error) throw result.error;
      return deliverySuccess(resolved, requestId, result.data, { updatedAt: String(result.data?.plan?.updated_at ?? "") });
    }
    if (operation === "transition_conflict") {
      const result = await supabase.rpc("transition_project_resource_conflict_tx", {
        ...common,
        p_conflict_id: requiredText(body.conflict_id, "资源冲突ID", 80),
        p_operation: requiredText(body.transition, "状态动作", 40),
        p_comment: String(body.comment ?? "").trim() || null,
        p_evidence: Array.isArray(body.evidence) ? body.evidence : [],
      });
      if (result.error) throw result.error;
      return deliverySuccess(resolved, requestId, result.data, { updatedAt: String(result.data?.updated_at ?? "") });
    }
    return deliveryJson({ error: "RESOURCE_OPERATION_INVALID", request_id: requestId }, 400, requestId);
  } catch (error) {
    const detail = deliveryErrorMessage(error);
    return deliveryJson({ error: "RESOURCE_OPERATION_FAILED", detail, request_id: requestId }, deliveryErrorStatus(detail), requestId);
  }
}
