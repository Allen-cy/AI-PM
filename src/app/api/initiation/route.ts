import { getAuthSupabase, requireAuthenticatedApiUser } from "@/features/auth/server";
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

function parseJsonObject(content: string): Record<string, unknown> {
  const match = content.match(/\{[\s\S]*\}/);
  const parsed = JSON.parse(match?.[0] ?? content) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("LLM返回格式错误。");
  return parsed as Record<string, unknown>;
}

async function resolveProject(request: Request, body?: Record<string, unknown>) {
  const user = await requireAuthenticatedApiUser();
  if (!user) return { error: "UNAUTHORIZED", status: 401 } as const;
  const url = new URL(request.url);
  const projectId = String(body?.project_id ?? url.searchParams.get("project_id") ?? "").trim();
  const businessRole = String(body?.business_role ?? url.searchParams.get("business_role") ?? "") as BusinessRole;
  const dataClass = String(body?.data_class ?? url.searchParams.get("data_class") ?? "");
  if (!projectId || !ROLES.has(businessRole) || !DATA_CLASSES.has(dataClass)) return { error: "INITIATION_CONTEXT_REQUIRED", status: 400 } as const;
  const access = await resolveProjectLifecycleAccess({ user, projectId, businessRole });
  if (access.status !== "succeeded" || !access.scope) return { error: access.status.toUpperCase(), detail: access.warning, status: projectAccessHttpStatus(access.status) } as const;
  if (access.scope.dataClass !== dataClass) return { error: "DATA_CLASS_MISMATCH", status: 409 } as const;
  return { user, projectId, businessRole, dataClass, access } as const;
}

export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  const resolved = await resolveProject(request);
  if (!("projectId" in resolved)) return json({ ...resolved, request_id: requestId }, resolved.status, requestId);
  const supabase = getAuthSupabase();
  const [project, stakeholders, requirements] = await Promise.all([
    supabase.from("projects").select("id,name,oa_no,data_class").eq("id", resolved.projectId).maybeSingle(),
    supabase.from("stakeholders").select("id,name,role,power,interest").eq("project_id", resolved.projectId).order("updated_at", { ascending: false }),
    supabase.from("project_requirements").select("id,requirement_code,description,priority,status,category,updated_at").eq("project_id", resolved.projectId).eq("data_class", resolved.dataClass).order("updated_at", { ascending: false }),
  ]);
  const error = project.error || stakeholders.error || requirements.error;
  if (error) {
    const missing = /project_requirements|relation|does not exist/i.test(error.message);
    return json({
      error: missing ? "WAVE0_REQUIREMENT_STORAGE_NOT_READY" : "INITIATION_DATA_LOAD_FAILED",
      detail: missing ? "请执行20260710134500_wave0_real_business_entries.sql后再使用需求管理。" : error.message,
      source: { type: "supabase", fallback_used: false },
      request_id: requestId,
    }, 503, requestId);
  }
  if (!project.data) return json({ error: "PROJECT_NOT_FOUND", request_id: requestId }, 404, requestId);
  return json({
    status: "succeeded",
    project: project.data,
    stakeholders: (stakeholders.data ?? []).map(item => ({
      id: String(item.id),
      name: String(item.name),
      role: String(item.role || "未设置"),
      power: Number(item.power || 0),
      interest: Number(item.interest || 0),
    })),
    requirements: (requirements.data ?? []).map(item => ({
      id: String(item.id),
      code: String(item.requirement_code),
      description: String(item.description),
      priority: String(item.priority),
      status: String(item.status),
      category: String(item.category),
    })),
    source: { type: "supabase", fallback_used: false, data_class: resolved.dataClass },
    request_id: requestId,
  }, 200, requestId);
}

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  const user = await requireAuthenticatedApiUser();
  if (!user) return json({ error: "UNAUTHORIZED", request_id: requestId }, 401, requestId);
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; } catch {
    return json({ error: "INVALID_JSON", request_id: requestId }, 400, requestId);
  }
  const operation = String(body.operation || "");

  if (operation === "generate_business_case" || operation === "generate_charter") {
    try {
      const projectName = text(body.project_name, "项目名称", 200);
      const projectType = text(body.project_type, "项目类型", 40);
      const projectLevel = text(body.project_level, "项目等级", 10);
      const sponsor = text(body.sponsor, "项目发起人", 200);
      const justification = text(body.business_justification, "业务立项理由", 4000);
      const system = operation === "generate_business_case"
        ? `你是项目投资决策助理。只能使用用户提供的事实；对未提供的投资额、收益、ROI、回收期不得编造，必须写“待人工补充”。返回严格JSON：{"marketOpportunity":"","costBenefit":{"investment":"","expectedReturn":"","roi":"","paybackPeriod":""},"riskAssessment":"","recommendation":"批准|拒绝|修改"}`
        : `你是项目章程起草助理。只能基于用户提供的事实起草，预算、里程碑、人员、约束和假设缺失时写“待人工补充”。返回严格JSON：{"objectives":"","scope":"","deliverables":"","milestones":"","budget":"","organization":{"pm":"","solution":"","delivery":""},"constraints":"","assumptions":""}`;
      const result = await llmComplete("general", system, `项目名称：${projectName}\n项目类型：${projectType}\n项目等级：${projectLevel}\n发起人：${sponsor}\n业务立项理由：${justification}`, { temperature: 0.2 });
      return json({ status: "succeeded", result: parseJsonObject(result.content), model: result.model, source: { type: "llm+user_input", fallback_used: false }, request_id: requestId }, 200, requestId);
    } catch (error) {
      return json({ error: "INITIATION_AI_FAILED", detail: error instanceof Error ? error.message : "AI生成失败", source: { fallback_used: false }, request_id: requestId }, 503, requestId);
    }
  }

  const resolved = await resolveProject(request, body);
  if (!("projectId" in resolved) || !resolved.access) return json({ ...resolved, request_id: requestId }, resolved.status, requestId);
  const scope = resolved.access.scope;
  if (!scope) return json({ error: "INITIATION_SCOPE_UNAVAILABLE", request_id: requestId }, 403, requestId);
  const supabase = getAuthSupabase();
  try {
    if (operation === "create_requirement") {
      const result = await supabase.from("project_requirements").insert({
        org_id: scope.orgId,
        project_id: resolved.projectId,
        description: text(body.description, "需求描述"),
        priority: text(body.priority, "优先级", 10),
        status: text(body.status, "状态", 20),
        category: text(body.category, "类别", 100),
        data_class: resolved.dataClass,
        created_by: user.id,
        updated_by: user.id,
      }).select("id,requirement_code").maybeSingle();
      if (result.error || !result.data) throw result.error || new Error("需求写入失败");
      return json({ status: "succeeded", requirement: result.data, source: { type: "supabase", fallback_used: false }, request_id: requestId }, 201, requestId);
    }
    if (operation === "update_requirement") {
      const id = text(body.id, "需求ID", 100);
      const result = await supabase.from("project_requirements").update({
        description: text(body.description, "需求描述"), priority: text(body.priority, "优先级", 10), status: text(body.status, "状态", 20), category: text(body.category, "类别", 100), updated_by: user.id,
      }).eq("id", id).eq("project_id", resolved.projectId).eq("data_class", resolved.dataClass).select("id").maybeSingle();
      if (result.error || !result.data) throw result.error || new Error("需求不存在或无权修改");
      return json({ status: "succeeded", requirement: result.data, source: { type: "supabase", fallback_used: false }, request_id: requestId }, 200, requestId);
    }
    if (operation === "delete_requirement") {
      const id = text(body.id, "需求ID", 100);
      const result = await supabase.from("project_requirements").delete().eq("id", id).eq("project_id", resolved.projectId).eq("data_class", resolved.dataClass).select("id").maybeSingle();
      if (result.error || !result.data) throw result.error || new Error("需求不存在或无权删除");
      return json({ status: "succeeded", deleted_id: id, source: { type: "supabase", fallback_used: false }, request_id: requestId }, 200, requestId);
    }
    return json({ error: "INITIATION_OPERATION_INVALID", request_id: requestId }, 400, requestId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "立项数据操作失败";
    const missing = /project_requirements|relation|does not exist/i.test(message);
    return json({ error: missing ? "WAVE0_REQUIREMENT_STORAGE_NOT_READY" : "INITIATION_OPERATION_FAILED", detail: missing ? "请先执行20260710134500_wave0_real_business_entries.sql。" : message, source: { type: "supabase", fallback_used: false }, request_id: requestId }, 503, requestId);
  }
}
