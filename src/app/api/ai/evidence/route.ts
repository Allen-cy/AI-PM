import { getCurrentUser } from "@/features/auth/server";
import { createAiEvidence, type AiEvidence } from "@/features/ai/evidence";
import { listAiEvidenceAudits, persistAiEvidence } from "@/features/ai/evidence-repository";

export const runtime = "nodejs";

function jsonResponse(body: unknown, status = 200, requestId = crypto.randomUUID()) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store", "X-Request-Id": requestId },
  });
}

export async function GET(): Promise<Response> {
  const requestId = crypto.randomUUID();
  const user = await getCurrentUser();
  if (process.env.AUTH_REQUIRED === "true" && !user) {
    return jsonResponse({ request_id: requestId, status: "unauthorized", warning: "请先登录后再读取AI依据审计。" }, 401, requestId);
  }
  const result = await listAiEvidenceAudits();
  return jsonResponse({ request_id: requestId, ...result }, result.status === "failed" ? 500 : 200, requestId);
}

export async function POST(request: Request): Promise<Response> {
  const requestId = crypto.randomUUID();
  const user = await getCurrentUser();
  if (process.env.AUTH_REQUIRED === "true" && !user) {
    return jsonResponse({ request_id: requestId, status: "unauthorized", warning: "请先登录后再保存AI依据审计。" }, 401, requestId);
  }

  let body: { evidence?: AiEvidence };
  try {
    body = await request.json() as { evidence?: AiEvidence };
  } catch {
    return jsonResponse({ request_id: requestId, status: "failed", warning: "请求 JSON 格式错误。" }, 400, requestId);
  }

  if (!body.evidence?.scene || !body.evidence.title) {
    return jsonResponse({ request_id: requestId, status: "failed", warning: "缺少AI evidence参数。" }, 400, requestId);
  }

  const evidence = createAiEvidence(body.evidence);
  const audit = await persistAiEvidence({ evidence, user, requestId });
  return jsonResponse({
    request_id: requestId,
    status: audit.status,
    audit_id: audit.status === "succeeded" ? audit.id : undefined,
    warning: audit.status === "succeeded" ? undefined : audit.warning,
  }, audit.status === "failed" ? 500 : 200, requestId);
}
