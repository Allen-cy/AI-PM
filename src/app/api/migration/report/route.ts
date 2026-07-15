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
  const formal = process.env.AUTH_REQUIRED === "true"
    ? await (async () => { const { persistFormalMigrationOutput } = await import("../../../../features/formal-output/migration-output.ts"); return persistFormalMigrationOutput({ request, requestId, outputType: "migration_review", title: body.batchName || `${body.analysis.objectName}-试迁移评审`, objectName: body.analysis.objectName, markdown, structuredPayload: { analysis: body.analysis, file_name: body.fileName || null } }); })()
    : { status: "succeeded" as const, output: { id: "development-ephemeral", version: 0 } };
  if (formal.status !== "succeeded") return Response.json({ status: "failed", warning: formal.warning, detail: formal.detail, request_id: requestId }, { status: formal.httpStatus, headers: { "Cache-Control": "no-store", "X-Request-Id": requestId } });
  return new Response(markdown, {
    status: 200,
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "no-store",
      "X-Request-Id": requestId,
      "X-Formal-Output-Id": formal.output.id,
      "X-Output-Version": String(formal.output.version),
    },
  });
}
