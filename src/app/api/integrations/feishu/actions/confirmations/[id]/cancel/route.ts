import { getCurrentUser } from "../../../../../../../../features/auth/server.ts";
import {
  canManageFeishuActionConfirmation,
  getFeishuActionConfirmation,
  updateFeishuActionConfirmationStatus,
} from "../../../../../../../../features/feishu/action-confirmations.ts";
import { writeIntegrationSyncLog } from "../../../../../../../../features/operating-system/sync-logs.ts";
import { cancelBusinessUpdateWriteback } from "../../../../../../../../features/operating-assistant/repository.ts";
import { cancelDataClassificationWriteback } from "../../../../../../../../features/feishu/classification-writeback-repository.ts";
import { writeOperationAudit } from "../../../../../../../../features/security/repository.ts";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

function json(body: unknown, status = 200, requestId = crypto.randomUUID()) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store", "X-Request-Id": requestId },
  });
}

async function readReason(request: Request): Promise<string | null> {
  try {
    const body = await request.json() as { reason?: unknown };
    return typeof body.reason === "string" && body.reason.trim() ? body.reason.trim().slice(0, 500) : null;
  } catch {
    return null;
  }
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  const requestId = crypto.randomUUID();
  const user = await getCurrentUser();
  if (!user) return json({ request_id: requestId, status: "unauthorized", warning: "请先登录后取消飞书写入。" }, 401, requestId);

  const { id } = await context.params;
  const loaded = await getFeishuActionConfirmation(id);
  if (loaded.status !== "succeeded") {
    const httpStatus = loaded.status === "not_configured" ? 503 : loaded.status === "not_found" ? 404 : 500;
    return json({ request_id: requestId, ...loaded }, httpStatus, requestId);
  }
  const confirmation = loaded.confirmation;
  if (!canManageFeishuActionConfirmation(user, confirmation)) {
    return json({ request_id: requestId, status: "forbidden", warning: "你无权取消该飞书写入动作。" }, 403, requestId);
  }
  if (confirmation.status === "succeeded" || confirmation.status === "writing") {
    return json({ request_id: requestId, status: "conflict", warning: `当前状态为 ${confirmation.status}，不能取消。`, confirmation }, 409, requestId);
  }

  const reason = await readReason(request);
  const cancelled = confirmation.actionType === "base_record_update"
    ? typeof confirmation.payload.classification_draft_id === "string"
      ? await cancelDataClassificationWriteback({ confirmationId: id, actorUserId: user.id, reason: reason || "用户取消数据分类写回。" })
      : await cancelBusinessUpdateWriteback({ confirmationId: id, actorUserId: user.id, reason: reason || "用户取消飞书Base写回。" })
    : await updateFeishuActionConfirmationStatus({ id, status: "cancelled", cancelReason: reason || "用户取消飞书写入。" });
  if (cancelled.status !== "succeeded") {
    const httpStatus = cancelled.status === "not_configured" ? 503 : cancelled.status === "conflict" ? 409 : cancelled.status === "not_found" ? 404 : 500;
    return json({ request_id: requestId, ...cancelled }, httpStatus, requestId);
  }

  await writeOperationAudit({
    user,
    action: "feishu_action_confirmation_cancel",
    resourceType: "feishu_action_confirmation",
    resourceId: id,
    status: "succeeded",
    severity: "low",
    summary: `已取消飞书写入：${confirmation.targetSummary}`,
    detail: { action_type: confirmation.actionType, reason },
    requestId,
  });
  await writeIntegrationSyncLog({
    userId: user.id,
    source: "feishu",
    eventType: "action_confirmation_cancel",
    status: "skipped",
    severity: "low",
    summary: `飞书写入已取消：${confirmation.targetSummary}`,
    detail: { confirmation_id: id, action_type: confirmation.actionType, reason },
    requestId,
  });

  const refreshed = await getFeishuActionConfirmation(id);
  return json({ request_id: requestId, status: "cancelled", confirmation: refreshed.status === "succeeded" ? refreshed.confirmation : confirmation, draft: "data" in cancelled ? cancelled.data : undefined }, 200, requestId);
}
