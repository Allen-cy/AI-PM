import { getCurrentUser } from "@/features/auth/server";
import {
  buildDeepKnowledgeReferencePlan,
  persistDeepKnowledgeOutputReferences,
} from "@/features/knowledge/deep-output-references";
import { buildKnowledgeOperationDashboard } from "@/features/knowledge/operations";
import { writeOperationAudit } from "@/features/security/repository";

export const runtime = "nodejs";

function json(body: unknown, status = 200, requestId = crypto.randomUUID()) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Request-Id": requestId,
    },
  });
}

export async function GET(): Promise<Response> {
  const requestId = crypto.randomUUID();
  const dashboard = buildKnowledgeOperationDashboard();
  const deepReferences = buildDeepKnowledgeReferencePlan(dashboard);
  return json({ request_id: requestId, status: "succeeded", deepReferences }, 200, requestId);
}

export async function POST(request: Request): Promise<Response> {
  const requestId = crypto.randomUUID();
  const user = await getCurrentUser();
  if (!user) return json({ request_id: requestId, status: "unauthorized", warning: "请先登录后再写入深层知识引用链。" }, 401, requestId);

  const body = await request.json().catch(() => ({})) as {
    confirm?: boolean;
    candidateIds?: string[];
  };
  if (body.confirm !== true) {
    return json({
      request_id: requestId,
      status: "failed",
      warning: "深层知识引用链写入必须显式 confirm=true。",
    }, 400, requestId);
  }

  const dashboard = buildKnowledgeOperationDashboard();
  const plan = buildDeepKnowledgeReferencePlan(dashboard);
  const result = await persistDeepKnowledgeOutputReferences({
    plan,
    candidateIds: Array.isArray(body.candidateIds) ? body.candidateIds : undefined,
    user,
    requestId,
  });

  await writeOperationAudit({
    user,
    action: "knowledge_deep_output_references_persist",
    resourceType: "knowledge_output_reference",
    status: result.status === "succeeded" || result.status === "partial" ? "succeeded" : "failed",
    severity: result.status === "succeeded" ? "low" : "medium",
    summary: `深层知识引用链写入：成功 ${result.created} 条，失败 ${result.failed} 条。`,
    detail: {
      created: result.created,
      skipped: result.skipped,
      failed: result.failed,
      results: result.results,
    },
    requestId,
  });

  const status = result.status === "not_configured" ? 503 : result.status === "failed" ? 500 : 200;
  return json({ request_id: requestId, ...result, deepReferences: plan }, status, requestId);
}
