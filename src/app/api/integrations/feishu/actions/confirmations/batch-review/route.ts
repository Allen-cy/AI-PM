import { getCurrentUser } from "../../../../../../../features/auth/server.ts";
import {
  buildFeishuConfirmationBatchRiskReview,
  canManageFeishuActionConfirmation,
  getFeishuActionConfirmation,
  type FeishuActionConfirmationRecord,
} from "../../../../../../../features/feishu/action-confirmations.ts";

export const runtime = "nodejs";

function json(body: unknown, status = 200, requestId = crypto.randomUUID()) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store", "X-Request-Id": requestId },
  });
}

async function readIds(request: Request): Promise<string[]> {
  const body = await request.json() as { ids?: unknown };
  if (!Array.isArray(body.ids)) return [];
  return Array.from(new Set(body.ids.filter((id): id is string => typeof id === "string" && id.trim().length > 0).map(id => id.trim()))).slice(0, 50);
}

export async function POST(request: Request): Promise<Response> {
  const requestId = crypto.randomUUID();
  const user = await getCurrentUser();
  if (!user) return json({ request_id: requestId, status: "unauthorized", warning: "请先登录后进行批量确认前风险复核。" }, 401, requestId);

  let ids: string[];
  try {
    ids = await readIds(request);
  } catch {
    return json({ request_id: requestId, status: "failed", warning: "请求 JSON 格式错误。" }, 400, requestId);
  }
  if (ids.length === 0) {
    return json({ request_id: requestId, status: "failed", warning: "请至少选择一条飞书写入确认记录。" }, 400, requestId);
  }

  const confirmations: FeishuActionConfirmationRecord[] = [];
  const inaccessibleIds: string[] = [];
  const missingIds: string[] = [];

  for (const id of ids) {
    const loaded = await getFeishuActionConfirmation(id);
    if (loaded.status === "not_configured") return json({ request_id: requestId, ...loaded }, 503, requestId);
    if (loaded.status === "failed") return json({ request_id: requestId, ...loaded }, 500, requestId);
    if (loaded.status === "not_found") {
      missingIds.push(id);
      continue;
    }
    if (!canManageFeishuActionConfirmation(user, loaded.confirmation)) {
      inaccessibleIds.push(id);
      continue;
    }
    confirmations.push(loaded.confirmation);
  }

  const batchReview = buildFeishuConfirmationBatchRiskReview(confirmations, { user });
  return json({
    request_id: requestId,
    status: "succeeded",
    batchReview: {
      ...batchReview,
      inaccessibleIds,
      missingIds,
      selectedCount: ids.length,
      blockedCount: batchReview.blockedCount + inaccessibleIds.length + missingIds.length,
      blockingIssues: [
        ...batchReview.blockingIssues,
        ...(inaccessibleIds.length > 0 ? [`${inaccessibleIds.length} 条记录无权确认。`] : []),
        ...(missingIds.length > 0 ? [`${missingIds.length} 条记录不存在或已被删除。`] : []),
      ],
      decisionText: `${batchReview.decisionText}${inaccessibleIds.length > 0 ? ` 无权 ${inaccessibleIds.length} 条。` : ""}${missingIds.length > 0 ? ` 不存在 ${missingIds.length} 条。` : ""}`,
    },
    boundary: "该接口只做批量确认前风险复核，不执行飞书写入；真正写入仍需要逐条或批量显式确认。",
  }, 200, requestId);
}
