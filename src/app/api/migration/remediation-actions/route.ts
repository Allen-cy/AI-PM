import { getCurrentUser } from "@/features/auth/server";
import {
  listMigrationRemediationActions,
  saveMigrationRemediationActions,
  transitionMigrationRemediationAction,
  type SaveMigrationRemediationActionsInput,
  type TransitionMigrationRemediationActionInput,
} from "@/features/migration/remediation-repository";
import { writeOperationAudit } from "@/features/security/repository";

export const runtime = "nodejs";

function jsonResponse(body: unknown, status = 200, requestId = crypto.randomUUID()) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store", "X-Request-Id": requestId },
  });
}

export async function GET(): Promise<Response> {
  const requestId = crypto.randomUUID();
  const user = await getCurrentUser();
  if (process.env.AUTH_REQUIRED === "true" && !user) {
    return jsonResponse({ request_id: requestId, status: "unauthorized", warning: "请先登录后再查看迁移整改行动项。" }, 401, requestId);
  }

  const result = await listMigrationRemediationActions(50);
  return jsonResponse({ request_id: requestId, ...result }, 200, requestId);
}

export async function POST(request: Request): Promise<Response> {
  const requestId = crypto.randomUUID();
  const user = await getCurrentUser();
  if (process.env.AUTH_REQUIRED === "true" && !user) {
    return jsonResponse({ request_id: requestId, status: "unauthorized", warning: "请先登录后再保存迁移整改行动项。" }, 401, requestId);
  }

  let body: SaveMigrationRemediationActionsInput;
  try {
    body = await request.json() as SaveMigrationRemediationActionsInput;
  } catch {
    return jsonResponse({ request_id: requestId, status: "failed", warning: "请求 JSON 格式错误。" }, 400, requestId);
  }
  if (!body.objectName || !Array.isArray(body.actions) || body.actions.length === 0) {
    return jsonResponse({ request_id: requestId, status: "failed", warning: "缺少有效的迁移整改行动项。" }, 400, requestId);
  }

  const result = await saveMigrationRemediationActions(body, user);
  if (result.status === "succeeded") {
    await writeOperationAudit({
      user,
      action: "migration_remediation_actions_save",
      resourceType: "migration_remediation_action",
      resourceId: body.batchId ?? body.batchName ?? body.objectName,
      status: "succeeded",
      severity: result.actions.some(action => action.priority === "P0") ? "medium" : "low",
      summary: `保存迁移整改行动项：${body.objectName} / ${result.actions.length}项`,
      detail: { object_name: body.objectName, batch_id: body.batchId, batch_name: body.batchName, action_count: result.actions.length },
      requestId,
    });
  }

  const status = result.status === "succeeded" ? 201 : result.status === "not_configured" ? 503 : 400;
  return jsonResponse({ request_id: requestId, ...result }, status, requestId);
}

export async function PATCH(request: Request): Promise<Response> {
  const requestId = crypto.randomUUID();
  const user = await getCurrentUser();
  if (process.env.AUTH_REQUIRED === "true" && !user) {
    return jsonResponse({ request_id: requestId, status: "unauthorized", warning: "请先登录后再流转迁移整改行动项。" }, 401, requestId);
  }

  let body: TransitionMigrationRemediationActionInput;
  try {
    body = await request.json() as TransitionMigrationRemediationActionInput;
  } catch {
    return jsonResponse({ request_id: requestId, status: "failed", warning: "请求 JSON 格式错误。" }, 400, requestId);
  }
  if (!body.id || !body.status) {
    return jsonResponse({ request_id: requestId, status: "failed", warning: "缺少整改行动项ID或目标状态。" }, 400, requestId);
  }

  const result = await transitionMigrationRemediationAction(body);
  if (result.status === "succeeded") {
    await writeOperationAudit({
      user,
      action: "migration_remediation_action_transition",
      resourceType: "migration_remediation_action",
      resourceId: result.action.id,
      status: "succeeded",
      severity: result.action.status === "已关闭" ? "low" : "medium",
      summary: `迁移整改行动项流转：${result.action.title} / ${result.action.status}`,
      detail: { action_id: result.action.id, status: result.action.status, closure_note: body.closureNote, review_result: body.reviewResult },
      requestId,
    });
  }

  const status = result.status === "succeeded" ? 200 : result.status === "not_configured" ? 503 : result.status === "not_found" ? 404 : 400;
  return jsonResponse({ request_id: requestId, ...result }, status, requestId);
}
