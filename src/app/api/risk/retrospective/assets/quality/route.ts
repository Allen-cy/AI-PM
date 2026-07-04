import { listRiskRetrospectiveAssets } from "@/features/risk/retrospective-assets";
import { buildRiskRetrospectiveQualityDashboard } from "@/features/risk/retrospective-quality";

export const runtime = "nodejs";

function jsonResponse(body: unknown, status = 200, requestId = crypto.randomUUID()) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store", "X-Request-Id": requestId },
  });
}

export async function GET(): Promise<Response> {
  const requestId = crypto.randomUUID();
  const result = await listRiskRetrospectiveAssets("all", 200);
  return jsonResponse({
    request_id: requestId,
    status: result.status,
    risk_retrospective_quality: buildRiskRetrospectiveQualityDashboard(result.assets),
    warning: "warning" in result ? result.warning : undefined,
  }, result.status === "failed" ? 500 : 200, requestId);
}
