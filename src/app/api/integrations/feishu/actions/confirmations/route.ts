import { getCurrentUser } from "../../../../../../features/auth/server.ts";
import {
  buildFeishuConfirmationQueueSummary,
  buildFeishuConfirmationRiskReview,
  createFeishuActionConfirmation,
  listFeishuActionConfirmations,
  type FeishuActionConfirmationRecord,
  type FeishuActionConfirmationStatus,
} from "../../../../../../features/feishu/action-confirmations.ts";
import {
  ActionValidationError,
  buildFeishuActionPreview,
  validateFeishuActionBody,
  type FeishuActionBody,
} from "../../../../../../features/feishu/action-payload.ts";

export const runtime = "nodejs";

function json(body: unknown, status = 200, requestId = crypto.randomUUID()) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store", "X-Request-Id": requestId },
  });
}

function text(value: unknown, maximum = 200): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!normalized || normalized.length > maximum) return null;
  return normalized;
}

function sourceFrom(value: unknown): FeishuActionConfirmationRecord["source"] {
  return value === "user_center" || value === "integration_center" || value === "system" ? value : "integration_center";
}

function statusFrom(value: string | null): FeishuActionConfirmationStatus | "all" {
  const allowed = ["pending_confirmation", "confirmed", "writing", "succeeded", "failed", "cancelled", "all"];
  return allowed.includes(value ?? "") ? value as FeishuActionConfirmationStatus | "all" : "all";
}

export async function GET(request: Request): Promise<Response> {
  const requestId = crypto.randomUUID();
  const user = await getCurrentUser();
  if (!user) return json({ request_id: requestId, status: "unauthorized", warning: "请先登录后查看飞书写入确认队列。" }, 401, requestId);

  const url = new URL(request.url);
  const result = await listFeishuActionConfirmations({
    user,
    status: statusFrom(url.searchParams.get("status")),
    limit: Math.min(100, Math.max(1, Number(url.searchParams.get("limit") || 50))),
  });
  const status = result.status === "succeeded" ? 200 : result.status === "not_configured" ? 503 : 500;
  if (result.status !== "succeeded") return json({ request_id: requestId, ...result }, status, requestId);

  return json({
    request_id: requestId,
    ...result,
    confirmations: result.confirmations.map(confirmation => ({
      ...confirmation,
      riskReview: buildFeishuConfirmationRiskReview(confirmation, { user }),
    })),
    summary: buildFeishuConfirmationQueueSummary(result.confirmations),
  }, status, requestId);
}

export async function POST(request: Request): Promise<Response> {
  const requestId = crypto.randomUUID();
  const user = await getCurrentUser();
  if (!user) return json({ request_id: requestId, status: "unauthorized", warning: "请先登录后创建飞书写入确认。" }, 401, requestId);

  let body: Record<string, unknown>;
  try {
    const value = await request.json();
    if (typeof value !== "object" || value === null || Array.isArray(value)) throw new ActionValidationError();
    body = value as Record<string, unknown>;
  } catch {
    return json({ request_id: requestId, status: "failed", warning: "请求 JSON 格式错误。" }, 400, requestId);
  }

  const payload = (typeof body.payload === "object" && body.payload !== null && !Array.isArray(body.payload)
    ? body.payload
    : body) as FeishuActionBody;
  try {
    validateFeishuActionBody(payload);
  } catch {
    return json({ request_id: requestId, status: "failed", warning: "飞书动作参数不合法。" }, 422, requestId);
  }

  const preview = buildFeishuActionPreview(payload);
  const result = await createFeishuActionConfirmation({
    user,
    source: sourceFrom(body.source),
    sourcePage: text(body.sourcePage) ?? text(body.source_page) ?? "/integration-center",
    payload,
    requestId,
  });
  const status = result.status === "succeeded" ? 201 : result.status === "not_configured" ? 503 : 500;
  return json({
    request_id: requestId,
    ...result,
    preview: result.status === "succeeded" ? result.confirmation.preview : preview,
    riskReview: result.status === "succeeded" ? buildFeishuConfirmationRiskReview(result.confirmation, { user }) : undefined,
    confirmation_required: result.status === "succeeded",
  }, status, requestId);
}
