import { timingSafeEqual } from "node:crypto";

import { createFeishuActionConfirmation } from "../../../../../features/feishu/action-confirmations.ts";
import {
  ActionValidationError,
  buildFeishuActionPreview,
  validateFeishuActionBody,
  type FeishuActionBody,
} from "../../../../../features/feishu/action-payload.ts";
import { readFeishuConfig } from "../../../../../features/feishu/config.ts";

export const runtime = "nodejs";

function json(body: unknown, status: number, requestId: string): Response {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Request-Id": requestId,
    },
  });
}

function authorized(request: Request, expected: string): boolean {
  const value = request.headers.get("authorization");
  if (!value?.startsWith("Bearer ")) return false;
  const actual = Buffer.from(value.slice(7));
  const target = Buffer.from(expected);
  return actual.length === target.length && timingSafeEqual(actual, target);
}

export async function POST(request: Request): Promise<Response> {
  const requestId = crypto.randomUUID();
  const config = readFeishuConfig();
  if (!config || !config.actionApiKey) {
    return json({ status: "not_configured", code: "FEISHU_ACTION_NOT_CONFIGURED", request_id: requestId }, 503, requestId);
  }
  if (!authorized(request, config.actionApiKey)) {
    return json({ status: "rejected", code: "FEISHU_ACTION_UNAUTHORIZED", request_id: requestId }, 401, requestId);
  }

  let body: FeishuActionBody;
  try {
    const value = await request.json();
    if (typeof value !== "object" || value === null || Array.isArray(value)) throw new ActionValidationError();
    body = value as FeishuActionBody;
    validateFeishuActionBody(body);
  } catch {
    return json({ status: "rejected", code: "FEISHU_ACTION_INVALID", request_id: requestId }, 422, requestId);
  }

  const preview = buildFeishuActionPreview(body);
  const queued = await createFeishuActionConfirmation({
    user: null,
    source: "api_token",
    sourcePage: typeof body.source_page === "string" ? body.source_page : "/api/integrations/feishu/actions",
    payload: body,
    requestId,
  });

  if (queued.status !== "succeeded") {
    return json({
      status: queued.status,
      code: queued.status === "not_configured" ? "FEISHU_ACTION_CONFIRMATION_QUEUE_NOT_CONFIGURED" : "FEISHU_ACTION_CONFIRMATION_QUEUE_FAILED",
      warning: queued.warning,
      migration: queued.status === "not_configured" ? queued.migration : undefined,
      preview,
      request_id: requestId,
    }, queued.status === "not_configured" ? 503 : 500, requestId);
  }

  return json({
    status: "confirmation_required",
    confirmation_required: true,
    confirmation: queued.confirmation,
    preview: queued.confirmation.preview,
    request_id: requestId,
    boundary: "通用飞书写入动作已进入待确认队列；系统不会通过 token 接口直接写飞书。请由授权用户在确认队列中确认后再执行。",
  }, 202, requestId);
}
