import { getCurrentUser } from "@/features/auth/server";
import { governanceAuditCollectionMarkdown } from "@/features/governance/repository";

export const runtime = "nodejs";

function jsonResponse(body: unknown, status = 200, requestId = crypto.randomUUID()) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store", "X-Request-Id": requestId },
  });
}

export async function GET(request: Request): Promise<Response> {
  const requestId = crypto.randomUUID();
  const user = await getCurrentUser();
  if (process.env.AUTH_REQUIRED === "true" && !user) {
    return jsonResponse({ request_id: requestId, status: "unauthorized", warning: "请先登录后再下载治理审计包。" }, 401, requestId);
  }

  const url = new URL(request.url);
  const projectName = url.searchParams.get("projectName")?.trim() || undefined;
  const dateFrom = url.searchParams.get("dateFrom")?.trim() || undefined;
  const dateTo = url.searchParams.get("dateTo")?.trim() || undefined;
  const limitParam = Number(url.searchParams.get("limit") || "80");
  const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 120) : 80;
  const result = await governanceAuditCollectionMarkdown({ projectName, dateFrom, dateTo, limit });

  if (result.status !== "succeeded" || !result.markdown) {
    return jsonResponse({
      request_id: requestId,
      status: result.status,
      warning: result.warning || "治理审计包不可用。",
    }, result.status === "not_configured" ? 503 : 400, requestId);
  }

  return new Response(result.markdown, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(result.filename || "governance-audit-package.md")}`,
      "Cache-Control": "no-store",
      "X-Request-Id": requestId,
    },
  });
}
