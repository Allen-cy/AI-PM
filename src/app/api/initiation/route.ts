import { getAuthSupabase, requireAuthenticatedApiUser } from "@/features/auth/server";
import { parseGovernanceWriteContract } from "@/features/project-governance/contracts";
import { projectAccessHttpStatus, resolveProjectLifecycleAccess } from "@/features/lifecycle-loop/access";
import type { BusinessRole } from "@/features/operating-model/context";
import { llmComplete } from "@/lib/llm";

export const runtime = "nodejs";

const ROLES = new Set<BusinessRole>(["pm", "operations", "pmo", "sponsor", "business_owner"]);
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

function parseJsonObject(content: string): Record<string, unknown> {
  const match = content.match(/\{[\s\S]*\}/);
  const parsed = JSON.parse(match?.[0] ?? content) as unknown;
  return object(parsed, "LLM返回结果");
}

function databaseMessage(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) return String(error.message);
  return error instanceof Error ? error.message : "立项数据操作失败";
}

function databaseStatus(message: string): number {
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
  if (!projectId || !ROLES.has(businessRole) || !DATA_CLASSES.has(dataClass)) return { ok: false, error: "INITIATION_CONTEXT_REQUIRED", status: 400 } as const;
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
  const [project, stakeholders, requirements, initiation, artifacts, baselines, decisions, events] = await Promise.all([
    supabase.from("projects").select("id,name,oa_no,data_class,updated_at").eq("id", resolved.projectId).maybeSingle(),
    supabase.from("stakeholders").select("id,name,role,power,interest").eq("project_id", resolved.projectId).order("updated_at", { ascending: false }),
    supabase.from("project_requirements").select("id,requirement_code,description,priority,status,category,updated_at").eq("project_id", resolved.projectId).eq("data_class", resolved.dataClass).order("updated_at", { ascending: false }),
    supabase.from("project_initiation_records").select("*").eq("project_id", resolved.projectId).eq("data_class", resolved.dataClass).maybeSingle(),
    supabase.from("project_governance_artifacts").select("*").eq("project_id", resolved.projectId).eq("data_class", resolved.dataClass).order("updated_at", { ascending: false }),
    supabase.from("project_plan_baselines").select("*").eq("project_id", resolved.projectId).eq("data_class", resolved.dataClass).order("updated_at", { ascending: false }),
    supabase.from("project_governance_decisions").select("id,subject_type,subject_id,operation,from_status,to_status,decision_comment,business_role,actor_user_id,created_at").eq("project_id", resolved.projectId).eq("data_class", resolved.dataClass).order("created_at", { ascending: false }).limit(30),
    supabase.from("project_governance_events").select("id,aggregate_type,aggregate_id,event_type,aggregate_version,business_role,actor_user_id,payload,created_at").eq("project_id", resolved.projectId).eq("data_class", resolved.dataClass).order("created_at", { ascending: false }).limit(30),
  ]);
  const error = project.error || stakeholders.error || requirements.error || initiation.error || artifacts.error || baselines.error || decisions.error || events.error;
  if (error) {
    const missing = /project_(initiation_records|governance_artifacts|plan_baselines)|relation|does not exist/i.test(error.message);
    return json({
      error: missing ? "V63_GOVERNANCE_STORAGE_NOT_READY" : "INITIATION_DATA_LOAD_FAILED",
      detail: missing ? "请先应用V6.3.0立项与规划持久化迁移。" : error.message,
      source: source(resolved.dataClass), request_id: requestId,
    }, 503, requestId);
  }
  if (!project.data) return json({ error: "PROJECT_NOT_FOUND", request_id: requestId }, 404, requestId);
  const updatedAt = [project.data.updated_at, initiation.data?.updated_at, ...(artifacts.data ?? []).map(item => item.updated_at)].filter(Boolean).sort().at(-1) ?? null;
  return json({
    status: "succeeded",
    data_class: resolved.dataClass,
    request_id: requestId,
    context: { org_id: resolved.scope.orgId, subject_scope: "project", subject_id: resolved.projectId, project_id: resolved.projectId, business_role: resolved.businessRole, data_class: resolved.dataClass },
    project: project.data,
    initiation: initiation.data ?? null,
    artifacts: artifacts.data ?? [],
    baselines: baselines.data ?? [],
    decisions: decisions.data ?? [],
    events: events.data ?? [],
    stakeholders: (stakeholders.data ?? []).map(item => ({ id: String(item.id), name: String(item.name), role: String(item.role || "未设置"), power: Number(item.power || 0), interest: Number(item.interest || 0) })),
    requirements: (requirements.data ?? []).map(item => ({ id: String(item.id), code: String(item.requirement_code), description: String(item.description), priority: String(item.priority), status: String(item.status), category: String(item.category) })),
    data: {
      project: project.data,
      initiation: initiation.data ?? null,
      artifacts: artifacts.data ?? [],
      baselines: baselines.data ?? [],
      stakeholders: stakeholders.data ?? [],
      requirements: requirements.data ?? [],
      decisions: decisions.data ?? [],
      events: events.data ?? [],
    },
    source: { type: "supabase", fallback_used: false, data_class: resolved.dataClass, updated_at: updatedAt },
    generated_at: new Date().toISOString(), warnings: [],
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

  if (operation === "generate_business_case" || operation === "generate_charter") {
    try {
      const projectName = text(body.project_name, "项目名称", 200);
      const projectType = text(body.project_type, "项目类型", 40);
      const projectLevel = text(body.project_level, "项目等级", 10);
      const sponsor = text(body.sponsor, "项目发起人", 200);
      const justification = text(body.business_justification, "业务立项理由", 4000);
      const system = operation === "generate_business_case"
        ? `你是项目投资决策助理。只能使用用户提供且与当前项目关联的事实；对未提供的投资额、收益、ROI、回收期不得编造，必须写“待人工补充”。返回严格JSON：{"marketOpportunity":"","costBenefit":{"investment":"","expectedReturn":"","roi":"","paybackPeriod":""},"riskAssessment":"","recommendation":"批准|拒绝|修改"}`
        : `你是项目章程起草助理。只能基于用户提供且与当前项目关联的事实起草，预算、里程碑、人员、约束和假设缺失时写“待人工补充”。返回严格JSON：{"objectives":"","scope":"","deliverables":"","milestones":"","budget":"","organization":{"pm":"","solution":"","delivery":""},"constraints":"","assumptions":""}`;
      const result = await llmComplete("general", system, `项目ID：${resolved.projectId}\n项目名称：${projectName}\n项目类型：${projectType}\n项目等级：${projectLevel}\n发起人：${sponsor}\n业务立项理由：${justification}`, { temperature: 0.2 });
      const parsed = parseJsonObject(result.content);
      return json({ status: "succeeded", data_class: resolved.dataClass, request_id: requestId, context: responseContext, data: { result: parsed, model: result.model }, result: parsed, model: result.model, source: { type: "llm+supabase", fallback_used: false, data_class: resolved.dataClass }, generated_at: new Date().toISOString(), warnings: ["AI内容必须由用户复核并保存，AI不会代替提交或审批。"] }, 200, requestId);
    } catch (error) {
      return json({ error: "INITIATION_AI_FAILED", detail: databaseMessage(error), source: { type: "llm+supabase", fallback_used: false }, request_id: requestId }, 503, requestId);
    }
  }

  let contract;
  try { contract = parseGovernanceWriteContract(body); } catch (error) {
    return json({ error: "WRITE_CONTRACT_INVALID", detail: databaseMessage(error), request_id: requestId }, 400, requestId);
  }
  if (contract.projectId !== resolved.projectId || contract.businessRole !== resolved.businessRole || contract.dataClass !== resolved.dataClass) {
    return json({ error: "WRITE_CONTEXT_MISMATCH", request_id: requestId }, 409, requestId);
  }

  const supabase = getAuthSupabase();
  const common = {
    p_org_id: scope.orgId, p_project_id: resolved.projectId, p_data_class: resolved.dataClass,
    p_business_role: resolved.businessRole, p_actor_user_id: resolved.user.id,
    p_idempotency_key: contract.idempotencyKey, p_expected_version: contract.expectedVersion,
  };
  try {
    if (operation === "save_initiation") {
      const result = await supabase.rpc("save_project_initiation_tx", { ...common, p_content: object(body.content, "立项输入") });
      if (result.error) throw result.error;
      return json({ status: "succeeded", data_class: resolved.dataClass, request_id: requestId, context: responseContext, source: source(resolved.dataClass, String(result.data?.updated_at ?? "")), data: result.data, generated_at: new Date().toISOString(), warnings: [] }, 200, requestId);
    }
    if (operation === "save_business_case" || operation === "save_charter") {
      const artifactType = operation === "save_business_case" ? "business_case" : "project_charter";
      const result = await supabase.rpc("save_project_governance_artifact_tx", { ...common, p_artifact_type: artifactType, p_title: text(body.title, "成果标题", 240), p_content: object(body.content, "成果内容"), p_source_type: String(body.source_type || "human_input") });
      if (result.error) throw result.error;
      return json({ status: "succeeded", data_class: resolved.dataClass, request_id: requestId, context: responseContext, source: source(resolved.dataClass, String(result.data?.updated_at ?? "")), data: result.data, generated_at: new Date().toISOString(), warnings: [] }, 200, requestId);
    }
    if (operation === "transition_artifact") {
      const result = await supabase.rpc("transition_project_governance_artifact_tx", { ...common, p_artifact_id: text(body.artifact_id, "成果ID", 80), p_operation: text(body.transition, "状态动作", 40), p_comment: String(body.comment ?? "").trim() || null });
      if (result.error) throw result.error;
      return json({ status: "succeeded", data_class: resolved.dataClass, request_id: requestId, context: responseContext, source: source(resolved.dataClass, String(result.data?.updated_at ?? "")), data: result.data, generated_at: new Date().toISOString(), warnings: [] }, 200, requestId);
    }
    if (operation === "create_requirement") {
      const result = await supabase.from("project_requirements").insert({ org_id: scope.orgId, project_id: resolved.projectId, description: text(body.description, "需求描述"), priority: text(body.priority, "优先级", 10), status: text(body.status, "状态", 20), category: text(body.category, "类别", 100), data_class: resolved.dataClass, created_by: resolved.user.id, updated_by: resolved.user.id }).select("id,requirement_code").maybeSingle();
      if (result.error || !result.data) throw result.error || new Error("需求写入失败");
      return json({ status: "succeeded", data_class: resolved.dataClass, request_id: requestId, context: responseContext, requirement: result.data, data: result.data, source: source(resolved.dataClass), generated_at: new Date().toISOString(), warnings: [] }, 201, requestId);
    }
    if (operation === "update_requirement") {
      const id = text(body.id, "需求ID", 100);
      const result = await supabase.from("project_requirements").update({ description: text(body.description, "需求描述"), priority: text(body.priority, "优先级", 10), status: text(body.status, "状态", 20), category: text(body.category, "类别", 100), updated_by: resolved.user.id }).eq("id", id).eq("project_id", resolved.projectId).eq("data_class", resolved.dataClass).select("id").maybeSingle();
      if (result.error || !result.data) throw result.error || new Error("需求不存在或无权修改");
      return json({ status: "succeeded", data_class: resolved.dataClass, request_id: requestId, context: responseContext, requirement: result.data, data: result.data, source: source(resolved.dataClass), generated_at: new Date().toISOString(), warnings: [] }, 200, requestId);
    }
    if (operation === "delete_requirement") {
      const id = text(body.id, "需求ID", 100);
      const result = await supabase.from("project_requirements").delete().eq("id", id).eq("project_id", resolved.projectId).eq("data_class", resolved.dataClass).select("id").maybeSingle();
      if (result.error || !result.data) throw result.error || new Error("需求不存在或无权删除");
      return json({ status: "succeeded", data_class: resolved.dataClass, request_id: requestId, context: responseContext, deleted_id: id, data: { deleted_id: id }, source: source(resolved.dataClass), generated_at: new Date().toISOString(), warnings: [] }, 200, requestId);
    }
    return json({ error: "INITIATION_OPERATION_INVALID", request_id: requestId }, 400, requestId);
  } catch (error) {
    const message = databaseMessage(error);
    return json({ error: "INITIATION_OPERATION_FAILED", detail: message, source: source(resolved.dataClass), request_id: requestId }, databaseStatus(message), requestId);
  }
}
