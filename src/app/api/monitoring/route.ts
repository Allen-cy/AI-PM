import { NextResponse } from "next/server";
import { requireAuthenticatedApiUser } from "@/features/auth/server";
import { parseProjectControlWriteContract } from "@/features/project-control/contracts";
import { loadProjectControlSnapshot } from "@/features/project-control/repository";
import { resolveProjectControlAccess } from "@/features/project-control/server";
import type { ProjectControlSnapshot } from "@/features/project-control/snapshot";
import { llmComplete } from "@/lib/llm";

function json(body: unknown, status: number, requestId: string) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store", "X-Request-Id": requestId } });
}

function fallback(snapshot: ProjectControlSnapshot) {
  const exceptions = snapshot.exceptions.slice(0, 5);
  return {
    insights: [
      `当前项目健康度为${snapshot.health.overall}，共${snapshot.exceptions.length}项需要关注的例外。`,
      `任务${snapshot.execution.total_tasks}项，阻塞${snapshot.execution.blocked_tasks}项，逾期${snapshot.execution.overdue_tasks}项。`,
      `高风险${snapshot.governance.open_high_risks}项，未关闭问题${snapshot.governance.open_issues}项，未完成行动${snapshot.governance.open_actions}项。`,
    ],
    rootCauses: exceptions.length ? exceptions.map(item => `${item.domain}：${item.title}（来源${item.source.table}）`) : ["当前没有可分析的例外，需确认业务数据是否已完成飞书对账。"],
    recommendations: exceptions.length ? exceptions.map(item => `${item.owner || "项目经理"}在${item.deadline || "尽快"}前处理${item.title}，并补齐关闭证据。`) : ["执行一次飞书对账并确认任务、里程碑、风险和质量事实的更新时间。"],
  };
}

async function load(request: Request, body?: Record<string, unknown>) {
  const access = await resolveProjectControlAccess(request, body);
  if (!access.ok) return { access, snapshot: null };
  const snapshot = await loadProjectControlSnapshot({ orgId: access.orgId, projectId: access.projectId, dataClass: access.dataClass });
  return { access, snapshot };
}

export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  if (!await requireAuthenticatedApiUser()) return json({ status: "failed", request_id: requestId, error: "UNAUTHORIZED" }, 401, requestId);
  try {
    const { access, snapshot } = await load(request);
    if (!access.ok || !snapshot) return json({ status: "failed", request_id: requestId, error: access.error, detail: access.detail }, access.status ?? 500, requestId);
    return json({
      status: "succeeded",
      request_id: requestId,
      context: { org_id: access.orgId, project_id: access.projectId, business_role: access.businessRole },
      data_class: access.dataClass,
      source: { ...snapshot.source, detail: "飞书业务事实经Supabase稳定镜像，与人工风险、问题、变更、行动、质量和收尾状态合并。" },
      data: snapshot,
      generated_at: snapshot.source.generated_at,
      warnings: snapshot.source.warnings,
    }, 200, requestId);
  } catch (error) {
    return json({ status: "failed", request_id: requestId, error: "MONITORING_SOURCE_UNAVAILABLE", detail: error instanceof Error ? error.message : "监控事实读取失败。" }, 503, requestId);
  }
}

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  if (!await requireAuthenticatedApiUser()) return json({ status: "failed", request_id: requestId, error: "UNAUTHORIZED" }, 401, requestId);
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; }
  catch { return json({ status: "failed", request_id: requestId, error: "INVALID_JSON" }, 400, requestId); }
  try { parseProjectControlWriteContract(body); }
  catch (error) { return json({ status: "failed", request_id: requestId, error: "PROJECT_CONTROL_CONTRACT_INVALID", detail: error instanceof Error ? error.message : "监控分析契约无效。" }, 400, requestId); }

  try {
    const { access, snapshot } = await load(request, body);
    if (!access.ok || !snapshot) return json({ status: "failed", request_id: requestId, error: access.error, detail: access.detail }, access.status ?? 500, requestId);
    let output = fallback(snapshot);
    let model = "deterministic-project-snapshot";
    let warning: string | null = null;
    try {
      const result = await llmComplete("general", "你是PMO监控分析师。只能依据传入的真实项目快照，返回JSON：{insights:string[],rootCauses:string[],recommendations:string[]}。不得补造事实。", JSON.stringify({ project: snapshot.project, health: snapshot.health, execution: snapshot.execution, schedule: snapshot.schedule, performance: snapshot.performance, governance: snapshot.governance, quality: snapshot.quality, closure: snapshot.closure, exceptions: snapshot.exceptions }));
      const match = result.content.match(/\{[\s\S]*\}/);
      const parsed = JSON.parse(match?.[0] ?? result.content) as typeof output;
      if (Array.isArray(parsed.insights) && Array.isArray(parsed.rootCauses) && Array.isArray(parsed.recommendations)) { output = parsed; model = result.model; }
      else warning = "模型返回结构不完整，已使用确定性监控摘要。";
    } catch (error) { warning = `AI分析不可用，已保留确定性事实：${error instanceof Error ? error.message : "未知错误"}`; }
    return json({ status: "succeeded", request_id: requestId, ...output, model, source: snapshot.source, warnings: [...snapshot.source.warnings, ...(warning ? [warning] : [])] }, 200, requestId);
  } catch (error) {
    return json({ status: "failed", request_id: requestId, error: "MONITORING_INSIGHT_FAILED", detail: error instanceof Error ? error.message : "监控分析失败。" }, 500, requestId);
  }
}
