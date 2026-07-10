import {
  buildRiskRetrospectiveRecommendations,
  listRiskRetrospectiveAssets,
} from "@/features/risk/retrospective-assets";
import { listRisks } from "@/lib/risk-repository";

export const runtime = "nodejs";

function jsonResponse(body: unknown, status = 200, requestId = crypto.randomUUID()) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store", "X-Request-Id": requestId },
  });
}

export async function GET(): Promise<Response> {
  const requestId = crypto.randomUUID();
  try {
    const [riskResult, assetResult] = await Promise.all([
      listRisks(),
      listRiskRetrospectiveAssets("published", 100),
    ]);
    const recommendations = buildRiskRetrospectiveRecommendations(riskResult.risks, assetResult.assets);
    return jsonResponse({
      request_id: requestId,
      status: assetResult.status,
      recommendations,
      warning: "warning" in assetResult ? assetResult.warning : undefined,
      source: riskResult.source,
    }, assetResult.status === "failed" ? 500 : 200, requestId);
  } catch (error) {
    return jsonResponse({
      request_id: requestId,
      status: "failed",
      recommendations: [],
      error: error instanceof Error ? error.message : "风险复盘推荐读取失败。",
    }, 500, requestId);
  }
}
