import { getCurrentUser } from "@/features/auth/server";
import {
  buildRiskRetrospectiveAssetDuplicateWarnings,
  confirmRiskRetrospectiveAsset,
  listRiskRetrospectiveAssets,
  updateRiskRetrospectiveAssetStatus,
  type RiskRetrospectiveAssetStatus,
} from "@/features/risk/retrospective-assets";
import type { RiskRetrospectiveKnowledgeCard } from "@/features/risk/retrospective";

export const runtime = "nodejs";

function jsonResponse(body: unknown, status = 200, requestId = crypto.randomUUID()) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store", "X-Request-Id": requestId },
  });
}

function isKnownStatus(status: unknown): status is RiskRetrospectiveAssetStatus {
  return status === "draft" || status === "reviewed" || status === "published" || status === "archived";
}

export async function GET(request: Request): Promise<Response> {
  const requestId = crypto.randomUUID();
  const url = new URL(request.url);
  const status = url.searchParams.get("status") as RiskRetrospectiveAssetStatus | "all" | null;
  const result = await listRiskRetrospectiveAssets(status || "all");
  return jsonResponse({
    request_id: requestId,
    status: result.status,
    assets: result.assets,
    duplicate_warnings: buildRiskRetrospectiveAssetDuplicateWarnings(result.assets),
    warning: "warning" in result ? result.warning : undefined,
  }, result.status === "failed" ? 500 : 200, requestId);
}

export async function POST(request: Request): Promise<Response> {
  const requestId = crypto.randomUUID();
  const user = await getCurrentUser();
  if (process.env.AUTH_REQUIRED === "true" && !user) {
    return jsonResponse({ request_id: requestId, status: "unauthorized", error: "请先登录后再管理风险复盘资产。" }, 401, requestId);
  }

  let body: {
    action?: "confirm" | "publish" | "archive" | "review";
    card?: RiskRetrospectiveKnowledgeCard;
    id?: string;
  };
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ request_id: requestId, status: "failed", error: "请求 JSON 格式错误。" }, 400, requestId);
  }

  if (body.action === "confirm") {
    if (!body.card?.sourceRiskId) {
      return jsonResponse({ request_id: requestId, status: "failed", error: "缺少风险复盘知识卡。" }, 400, requestId);
    }
    const result = await confirmRiskRetrospectiveAsset(body.card, user);
    return jsonResponse({
      request_id: requestId,
      status: result.status,
      asset: result.status === "succeeded" ? result.asset : undefined,
      duplicate_warnings: result.status === "succeeded"
        ? buildRiskRetrospectiveAssetDuplicateWarnings((await listRiskRetrospectiveAssets("all", 100)).assets)
        : [],
      warning: result.status !== "succeeded" ? result.warning : undefined,
    }, result.status === "failed" ? 500 : result.status === "not_configured" ? 503 : 200, requestId);
  }

  const nextStatus = body.action === "publish"
    ? "published"
    : body.action === "archive"
      ? "archived"
      : body.action === "review"
        ? "reviewed"
        : undefined;
  if (!body.id || !isKnownStatus(nextStatus)) {
    return jsonResponse({ request_id: requestId, status: "failed", error: "缺少资产 ID 或有效动作。" }, 400, requestId);
  }

  const result = await updateRiskRetrospectiveAssetStatus(body.id, nextStatus, user);
  return jsonResponse({
    request_id: requestId,
    status: result.status,
    asset: result.status === "succeeded" ? result.asset : undefined,
    duplicate_warnings: result.status === "succeeded"
      ? buildRiskRetrospectiveAssetDuplicateWarnings((await listRiskRetrospectiveAssets("all", 100)).assets)
      : [],
    warning: result.status !== "succeeded" ? result.warning : undefined,
  }, result.status === "failed" ? 500 : result.status === "not_configured" ? 503 : 200, requestId);
}
