import { buildMigrationReviewReport, type MigrationReviewReportInput } from "../../../../features/migration/package.ts";

export const runtime = "nodejs";

function safeFilename(value: string): string {
  return value
    .replace(/[\\/:*?"<>|\r\n]/g, "-")
    .replace(/\s+/g, "-")
    .slice(0, 80) || "migration-review-report";
}

export async function POST(request: Request): Promise<Response> {
  const requestId = crypto.randomUUID();
  let body: MigrationReviewReportInput;
  try {
    body = await request.json() as MigrationReviewReportInput;
  } catch {
    return Response.json({
      status: "failed",
      warning: "请求 JSON 格式错误。",
      request_id: requestId,
    }, { status: 400, headers: { "X-Request-Id": requestId } });
  }

  if (!body.analysis?.objectName || !Array.isArray(body.analysis.mappings)) {
    return Response.json({
      status: "failed",
      warning: "缺少有效的试迁移分析结果。",
      request_id: requestId,
    }, { status: 400, headers: { "X-Request-Id": requestId } });
  }

  const markdown = buildMigrationReviewReport(body);
  const filename = `${safeFilename(body.batchName || `${body.analysis.objectName}-试迁移评审`)}.md`;
  return new Response(markdown, {
    status: 200,
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "no-store",
      "X-Request-Id": requestId,
    },
  });
}
