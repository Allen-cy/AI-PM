import { issueChangeReportMarkdown } from "@/features/issue-change/repository";
import { authorizeRiskRequest } from "@/features/risk/access";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  const requestId = crypto.randomUUID();
  const access = await authorizeRiskRequest(request, "read");
  if (!access.ok) {
    return Response.json({ request_id: requestId, status: "forbidden", warning: access.error, detail: access.detail }, {
      status: access.status,
      headers: { "Cache-Control": "no-store", "X-Request-Id": requestId },
    });
  }
  const result = await issueChangeReportMarkdown(access.scope);
  if (result.status !== "succeeded" || !result.markdown) {
    return Response.json({
      request_id: requestId,
      status: result.status,
      warning: result.warning || "风险-问题-变更-行动项链路报告不可用。",
    }, {
      status: result.status === "not_configured" ? 503 : 400,
      headers: { "Cache-Control": "no-store", "X-Request-Id": requestId },
    });
  }

  return new Response(result.markdown, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(result.filename || "issue-change-chain-report.md")}`,
      "Cache-Control": "no-store",
      "X-Request-Id": requestId,
    },
  });
}
