import { buildRiskRetrospectiveDashboard } from "@/features/risk/retrospective";
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
    const result = await listRisks();
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
