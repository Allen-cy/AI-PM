import { listRiskRetrospectiveAssets } from "@/features/risk/retrospective-assets";
import { buildRiskRetrospectiveQualityDashboard } from "@/features/risk/retrospective-quality";
import { authorizeRiskRequest } from "@/features/risk/access";

export const runtime = "nodejs";

function jsonResponse(body: unknown, status = 200, requestId = crypto.randomUUID()) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store", "X-Request-Id": requestId },
  });
}

export async function GET(request: Request): Promise<Response> {
  const requestId = crypto.randomUUID();
  const access = await authorizeRiskRequest(request, "read");
  if (!access.ok) return jsonResponse({ request_id: requestId, error: access.error, detail: access.detail }, access.status, requestId);
  const result = await listRiskRetrospectiveAssets("all", 200, access.scope);
  return jsonResponse({
    request_id: requestId,
    status: result.status,
    risk_retrospective_quality: buildRiskRetrospectiveQualityDashboard(result.assets),
    warning: "warning" in result ? result.warning : undefined,
  }, result.status === "failed" ? 500 : 200, requestId);
}
