import { getCurrentUser } from "@/features/auth/server";
import { governanceReportMarkdown } from "@/features/governance/repository";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = crypto.randomUUID();
  const user = await getCurrentUser();
  if (process.env.AUTH_REQUIRED === "true" && !user) {
    return Response.json({
      request_id: requestId,
      status: "unauthorized",
      warning: "请先登录后再下载治理审计包。",
    }, {
      status: 401,
      headers: { "Cache-Control": "no-store", "X-Request-Id": requestId },
    });
  }
  const { id } = await context.params;
  const result = await governanceReportMarkdown(id);
  if (result.status !== "succeeded" || !result.markdown) {
    return Response.json({
      request_id: requestId,
      status: result.status,
      warning: result.warning || "治理流程报告不可用。",
    }, {
      status: result.status === "not_found" ? 404 : result.status === "not_configured" ? 503 : 400,
      headers: { "Cache-Control": "no-store", "X-Request-Id": requestId },
    });
  }

  return new Response(result.markdown, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(result.filename || "governance-report.md")}`,
      "Cache-Control": "no-store",
      "X-Request-Id": requestId,
    },
  });
}
