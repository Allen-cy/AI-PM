import { buildRiskRetrospectiveDashboard } from "@/features/risk/retrospective";
import { listRisks } from "@/lib/risk-repository";
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
  try {
    const access = await authorizeRiskRequest(request, "read");
    if (!access.ok) return jsonResponse({ request_id: requestId, error: access.error, detail: access.detail }, access.status, requestId);
    const result = await listRisks(access.scope);
    const risk_retrospective = buildRiskRetrospectiveDashboard(result.risks, result.events);
    return jsonResponse({
      request_id: requestId,
      status: "succeeded",
      risk_retrospective,
      source: result.source,
      warning: result.warning,
    }, 200, requestId);
  } catch (error) {
    return jsonResponse({
      request_id: requestId,
      status: "failed",
      error: error instanceof Error ? error.message : "风险复盘资产包读取失败。",
    }, 500, requestId);
  }
}
