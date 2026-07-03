import {
  evaluateGovernanceStrategy,
  listGovernanceStrategyCatalog,
  type GovernanceStrategyInput,
} from "@/features/governance/strategy";

export const runtime = "nodejs";

function jsonResponse(body: unknown, status = 200, requestId = crypto.randomUUID()) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store", "X-Request-Id": requestId },
  });
}

export async function GET(): Promise<Response> {
  const requestId = crypto.randomUUID();
  return jsonResponse({
    request_id: requestId,
    status: "succeeded",
    catalog: listGovernanceStrategyCatalog(),
  }, 200, requestId);
}

export async function POST(request: Request): Promise<Response> {
  const requestId = crypto.randomUUID();
  let body: GovernanceStrategyInput;
  try {
    body = await request.json() as GovernanceStrategyInput;
  } catch {
    return jsonResponse({ request_id: requestId, status: "failed", warning: "请求 JSON 格式错误。" }, 400, requestId);
  }

  const preview = evaluateGovernanceStrategy(body);
  return jsonResponse({
    request_id: requestId,
    ...preview,
  }, 200, requestId);
}
