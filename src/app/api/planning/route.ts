import { getAuthSupabase, requireAuthenticatedApiUser } from "@/features/auth/server";
import { parseGovernanceWriteContract } from "@/features/project-governance/contracts";
import { projectAccessHttpStatus, resolveProjectLifecycleAccess } from "@/features/lifecycle-loop/access";
import type { BusinessRole } from "@/features/operating-model/context";
import { llmComplete } from "@/lib/llm";

export const runtime = "nodejs";

const ROLES = new Set<BusinessRole>(["pm", "operations", "pmo", "sponsor", "business_owner", "finance"]);
const DATA_CLASSES = new Set(["production", "sample", "test", "diagnostic", "unclassified"]);

function json(body: unknown, status: number, requestId: string) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store", "X-Request-Id": requestId } });
}

function text(value: unknown, field: string, maximum = 4000): string {
  const output = String(value ?? "").trim();
  if (!output || output.length > maximum) throw new Error(`${field}为必填项，且不得超过${maximum}字符。`);
  return output;
}

function object(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${field}必须为结构化对象。`);
  return value as Record<string, unknown>;
}

function errorMessage(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) return String(error.message);
  return error instanceof Error ? error.message : "规划数据操作失败";
}

function errorStatus(message: string): number {
  if (/VERSION_CONFLICT|IDEMPOTENCY_PAYLOAD_CONFLICT|STATUS_CONFLICT|DATA_CLASS_MISMATCH|ORG_SCOPE_MISMATCH/i.test(message)) return 409;
  if (/ROLE_FORBIDDEN/i.test(message)) return 403;
  if (/NOT_FOUND/i.test(message)) return 404;
  if (/INPUT_REQUIRED|INPUT_INVALID|WRITE_CONTRACT_INVALID|COMMENT_REQUIRED/i.test(message)) return 400;
  return 503;
}

async function resolveProject(request: Request, body?: Record<string, unknown>) {
  const user = await requireAuthenticatedApiUser();
  if (!user) return { ok: false, error: "UNAUTHORIZED", status: 401 } as const;
  const url = new URL(request.url);
  const projectId = String(body?.project_id ?? url.searchParams.get("project_id") ?? "").trim();
  const businessRole = String(body?.business_role ?? url.searchParams.get("business_role") ?? "") as BusinessRole;
  const dataClass = String(body?.data_class ?? url.searchParams.get("data_class") ?? "");
  if (!projectId || !ROLES.has(businessRole) || !DATA_CLASSES.has(dataClass)) return { ok: false, error: "PLANNING_CONTEXT_REQUIRED", status: 400 } as const;
  const access = await resolveProjectLifecycleAccess({ user, projectId, businessRole });
  if (access.status !== "succeeded" || !access.scope) return { ok: false, error: access.status.toUpperCase(), detail: access.warning, status: projectAccessHttpStatus(access.status) } as const;
  if (access.scope.dataClass !== dataClass) return { ok: false, error: "DATA_CLASS_MISMATCH", status: 409 } as const;
  return { ok: true, user, projectId, businessRole, dataClass, access, scope: access.scope } as const;
}

function source(dataClass: string, updatedAt?: string | null) {
  return { type: "supabase", fallback_used: false, data_class: dataClass, updated_at: updatedAt ?? null };
}

export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  const resolved = await resolveProject(request);
  if (!resolved.ok) return json({ ...resolved, request_id: requestId }, resolved.status, requestId);
  const supabase = getAuthSupabase();
  const [project, plans, baselines, decisions, events] = await Promise.all([
    supabase.from("projects").select("id,name,oa_no,data_class,updated_at").eq("id", resolved.projectId).maybeSingle(),
    supabase.from("project_governance_artifacts").select("*").eq("project_id", resolved.projectId).eq("data_class", resolved.dataClass).eq("artifact_type", "management_plan").order("updated_at", { ascending: false }),
    supabase.from("project_plan_baselines").select("*").eq("project_id", resolved.projectId).eq("data_class", resolved.dataClass).order("updated_at", { ascending: false }),
    supabase.from("project_governance_decisions").select("id,subject_type,subject_id,operation,from_status,to_status,decision_comment,business_role,actor_user_id,created_at").eq("project_id", resolved.projectId).eq("data_class", resolved.dataClass).order("created_at", { ascending: false }).limit(30),
    supabase.from("project_governance_events").select("id,aggregate_type,aggregate_id,event_type,aggregate_version,business_role,actor_user_id,payload,created_at").eq("project_id", resolved.projectId).eq("data_class", resolved.dataClass).order("created_at", { ascending: false }).limit(30),
  ]);
  const error = project.error || plans.error || baselines.error || decisions.error || events.error;
  if (error) {
    const missing = /project_(governance_artifacts|plan_baselines)|relation|does not exist/i.test(error.message);
    return json({ error: missing ? "V63_GOVERNANCE_STORAGE_NOT_READY" : "PLANNING_DATA_LOAD_FAILED", detail: missing ? "请先应用V6.3.0立项与规划持久化迁移。" : error.message, source: source(resolved.dataClass), request_id: requestId }, 503, requestId);
  }
  if (!project.data) return json({ error: "PROJECT_NOT_FOUND", request_id: requestId }, 404, requestId);
  const updatedAt = [project.data.updated_at, ...(plans.data ?? []).map(item => item.updated_at), ...(baselines.data ?? []).map(item => item.updated_at)].filter(Boolean).sort().at(-1) ?? null;
  return json({
    status: "succeeded", data_class: resolved.dataClass, request_id: requestId,
    context: { org_id: resolved.scope.orgId, subject_scope: "project", subject_id: resolved.projectId, project_id: resolved.projectId, business_role: resolved.businessRole, data_class: resolved.dataClass },
    project: project.data, plans: plans.data ?? [], baselines: baselines.data ?? [], decisions: decisions.data ?? [], events: events.data ?? [],
    data: { project: project.data, plans: plans.data ?? [], baselines: baselines.data ?? [] },
    source: { type: "supabase", fallback_used: false, data_class: resolved.dataClass, updated_at: updatedAt }, generated_at: new Date().toISOString(), warnings: [],
  }, 200, requestId);
}

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; } catch {
    return json({ error: "INVALID_JSON", request_id: requestId }, 400, requestId);
  }
  const resolved = await resolveProject(request, body);
  if (!resolved.ok) return json({ ...resolved, request_id: requestId }, resolved.status, requestId);
  const operation = String(body.operation || "");
  const scope = resolved.scope;
  const responseContext = { org_id: scope.orgId, subject_scope: "project", subject_id: resolved.projectId, project_id: resolved.projectId, business_role: resolved.businessRole, data_class: resolved.dataClass };
  const supabase = getAuthSupabase();

  if (operation === "assist") {
    try {
      const project = await supabase.from("projects").select("id,name,oa_no,data_class").eq("id", resolved.projectId).eq("data_class", resolved.dataClass).maybeSingle();
      if (project.error || !project.data) throw project.error || new Error("PROJECT_NOT_FOUND");
      const projectType = text(body.project_type, "项目类型", 40);
      const knowledgeArea = text(body.knowledge_area, "知识领域", 80);
      const context = object(body.context ?? {}, "规划上下文");
      const systemPrompt = `你是项目管理规划助手。只能根据当前项目的真实输入提供${knowledgeArea}规划建议，不得编造预算、期限、资源或已批准状态。返回严格JSON：{"suggestions":[],"checklist":[],"warnings":[]}。内容使用中文，建议必须可由项目成员复核。`;
      const result = await llmComplete("planning", systemPrompt, `项目ID：${resolved.projectId}\n项目名称：${project.data.name}\n项目编码：${project.data.oa_no || "未设置"}\n项目类型：${projectType}\n知识领域：${knowledgeArea}\n用户输入：${JSON.stringify(context)}`, { temperature: 0.2 });
      const match = result.content.match(/\{[\s\S]*\}/);
      const parsed = object(JSON.parse(match?.[0] ?? result.content), "LLM返回结果");
      return json({ status: "succeeded", data_class: resolved.dataClass, request_id: requestId, context: responseContext, data: parsed, ...parsed, model: result.model, source: { type: "llm+supabase", fallback_used: false, data_class: resolved.dataClass }, generated_at: new Date().toISOString(), warnings: ["规划建议必须经用户确认并保存，AI不会代替审批。"] }, 200, requestId);
    } catch (error) {
      return json({ error: "PLANNING_AI_FAILED", detail: errorMessage(error), request_id: requestId, source: { type: "llm+supabase", fallback_used: false, data_class: resolved.dataClass } }, 503, requestId);
    }
  }

  let contract;
  try { contract = parseGovernanceWriteContract(body); } catch (error) {
    return json({ error: "WRITE_CONTRACT_INVALID", detail: errorMessage(error), request_id: requestId }, 400, requestId);
  }
  if (contract.projectId !== resolved.projectId || contract.businessRole !== resolved.businessRole || contract.dataClass !== resolved.dataClass) {
    return json({ error: "WRITE_CONTEXT_MISMATCH", request_id: requestId }, 409, requestId);
  }
  const common = { p_org_id: scope.orgId, p_project_id: resolved.projectId, p_data_class: resolved.dataClass, p_business_role: resolved.businessRole, p_actor_user_id: resolved.user.id, p_idempotency_key: contract.idempotencyKey, p_expected_version: contract.expectedVersion };
  try {
    if (operation === "save_management_plan") {
      const result = await supabase.rpc("save_project_governance_artifact_tx", { ...common, p_artifact_type: "management_plan", p_title: text(body.title, "管理计划标题", 240), p_content: object(body.content, "管理计划内容"), p_source_type: String(body.source_type || "human_input") });
      if (result.error) throw result.error;
      return json({ status: "succeeded", data_class: resolved.dataClass, request_id: requestId, context: responseContext, data: result.data, source: source(resolved.dataClass, String(result.data?.updated_at ?? "")), generated_at: new Date().toISOString(), warnings: [] }, 200, requestId);
    }
    if (operation === "transition_artifact") {
      const result = await supabase.rpc("transition_project_governance_artifact_tx", { ...common, p_artifact_id: text(body.artifact_id, "管理计划ID", 80), p_operation: text(body.transition, "状态动作", 40), p_comment: String(body.comment ?? "").trim() || null });
      if (result.error) throw result.error;
      return json({ status: "succeeded", data_class: resolved.dataClass, request_id: requestId, context: responseContext, data: result.data, source: source(resolved.dataClass, String(result.data?.updated_at ?? "")), generated_at: new Date().toISOString(), warnings: [] }, 200, requestId);
    }
    if (operation === "save_baseline") {
      const result = await supabase.rpc("save_project_plan_baseline_tx", { ...common, p_baseline_type: text(body.baseline_type, "基准类型", 30), p_title: text(body.title, "基准标题", 240), p_content: object(body.content, "基准内容"), p_baseline_value: body.baseline_value === null || body.baseline_value === undefined || body.baseline_value === "" ? null : Number(body.baseline_value), p_currency: String(body.currency ?? "").trim() || null, p_effective_date: String(body.effective_date ?? "").trim() || null });
      if (result.error) throw result.error;
      return json({ status: "succeeded", data_class: resolved.dataClass, request_id: requestId, context: responseContext, data: result.data, source: source(resolved.dataClass, String(result.data?.updated_at ?? "")), generated_at: new Date().toISOString(), warnings: [] }, 200, requestId);
    }
    if (operation === "transition_baseline") {
      const result = await supabase.rpc("transition_project_plan_baseline_tx", { ...common, p_baseline_id: text(body.baseline_id, "基准ID", 80), p_operation: text(body.transition, "状态动作", 40), p_comment: String(body.comment ?? "").trim() || null });
      if (result.error) throw result.error;
      return json({ status: "succeeded", data_class: resolved.dataClass, request_id: requestId, context: responseContext, data: result.data, source: source(resolved.dataClass, String(result.data?.updated_at ?? "")), generated_at: new Date().toISOString(), warnings: [] }, 200, requestId);
    }
    return json({ error: "PLANNING_OPERATION_INVALID", request_id: requestId }, 400, requestId);
  } catch (error) {
    const message = errorMessage(error);
    return json({ error: "PLANNING_OPERATION_FAILED", detail: message, request_id: requestId, source: source(resolved.dataClass) }, errorStatus(message), requestId);
  }
}
