import { getCurrentUser } from "@/features/auth/server";
import { syncGovernanceEventToFeishu } from "@/features/governance/feishu-sync";
import {
  createGovernanceInstance,
  listGovernanceInstances,
  transitionGovernanceInstance,
  type GovernanceCreateInput,
  type GovernanceTransitionInput,
} from "@/features/governance/repository";
import { writeIntegrationSyncLog } from "@/features/operating-system/sync-logs";

export const runtime = "nodejs";

function jsonResponse(body: unknown, status = 200, requestId = crypto.randomUUID()) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store", "X-Request-Id": requestId },
  });
}

export async function GET(): Promise<Response> {
  const requestId = crypto.randomUUID();
  const result = await listGovernanceInstances();
  return jsonResponse({ request_id: requestId, ...result }, 200, requestId);
}

export async function POST(request: Request): Promise<Response> {
  const requestId = crypto.randomUUID();
  const user = await getCurrentUser();
  if (process.env.AUTH_REQUIRED === "true" && !user) {
    return jsonResponse({ request_id: requestId, status: "unauthorized", warning: "请先登录后再创建治理流程。" }, 401, requestId);
  }

  let body: GovernanceCreateInput;
  try {
    body = await request.json() as GovernanceCreateInput;
  } catch {
    return jsonResponse({ request_id: requestId, status: "failed", warning: "请求 JSON 格式错误。" }, 400, requestId);
  }

  const result = await createGovernanceInstance(body, user);
  let feishu_sync: Awaited<ReturnType<typeof syncGovernanceEventToFeishu>> = { status: "skipped", reason: "流程未创建，跳过飞书回写。" };
  if (result.status === "succeeded" && result.instance) {
    feishu_sync = await syncGovernanceEventToFeishu({ instance: result.instance, requestId });
    await writeIntegrationSyncLog({
      userId: user?.id,
      source: "system",
      eventType: "governance_workflow_created",
      status: "succeeded",
      severity: result.instance.priority === "high" ? "medium" : "low",
      summary: `治理流程已创建：${result.instance.workflowName} / ${result.instance.projectName} / ${result.instance.state}`,
      detail: { instance_id: result.instance.id, feishu_sync },
      requestId,
    });
  }

  return jsonResponse({
    request_id: requestId,
    ...result,
    feishu_sync,
  }, result.status === "succeeded" ? 201 : result.status === "not_configured" ? 503 : 400, requestId);
}

export async function PATCH(request: Request): Promise<Response> {
  const requestId = crypto.randomUUID();
  const user = await getCurrentUser();
  if (process.env.AUTH_REQUIRED === "true" && !user) {
    return jsonResponse({ request_id: requestId, status: "unauthorized", warning: "请先登录后再处理治理流程。" }, 401, requestId);
  }

  let body: GovernanceTransitionInput;
  try {
    body = await request.json() as GovernanceTransitionInput;
  } catch {
    return jsonResponse({ request_id: requestId, status: "failed", warning: "请求 JSON 格式错误。" }, 400, requestId);
  }

  const result = await transitionGovernanceInstance(body, user);
  let feishu_sync: Awaited<ReturnType<typeof syncGovernanceEventToFeishu>> = { status: "skipped", reason: "流程未流转，跳过飞书回写。" };
  if (result.status === "succeeded" && result.instance) {
    feishu_sync = await syncGovernanceEventToFeishu({ instance: result.instance, event: result.event, requestId });
    await writeIntegrationSyncLog({
      userId: user?.id,
      source: "system",
      eventType: "governance_workflow_transition",
      status: "succeeded",
      severity: body.action === "reject" || body.action === "return" ? "medium" : "low",
      summary: `治理流程已流转：${result.instance.workflowName} / ${result.instance.projectName} / ${result.instance.state}`,
      detail: { instance_id: result.instance.id, action: body.action, feishu_sync },
      requestId,
    });
  }

  return jsonResponse({
    request_id: requestId,
    ...result,
    feishu_sync,
  }, result.status === "succeeded" ? 200 : result.status === "not_configured" ? 503 : result.status === "not_found" ? 404 : 400, requestId);
}
