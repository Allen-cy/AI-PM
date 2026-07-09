import { getCurrentUser } from "@/features/auth/server";
import { getKnowledgeAuditPackageDownload } from "@/features/knowledge/lifecycle-repository";

export const runtime = "nodejs";

function jsonResponse(body: unknown, status = 200, requestId = crypto.randomUUID()) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store", "X-Request-Id": requestId },
  });
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const requestId = crypto.randomUUID();
  const user = await getCurrentUser();
  if (process.env.AUTH_REQUIRED === "true" && !user) {
    return jsonResponse({ request_id: requestId, status: "unauthorized", warning: "请先登录后再下载知识运营审计包。" }, 401, requestId);
  }
  const { id } = await params;
  const result = await getKnowledgeAuditPackageDownload(id);
  if (result.status !== "succeeded") {
    const status = result.status === "not_configured" ? 503 : result.status === "not_found" ? 404 : 500;
    return jsonResponse({ request_id: requestId, ...result }, status, requestId);
  }
  return new Response(result.markdown, {
    status: 200,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(result.filename)}`,
      "X-Request-Id": requestId,
    },
  });
}
