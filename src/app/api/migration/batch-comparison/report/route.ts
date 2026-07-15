import { buildMigrationBatchComparisonReport, type MigrationBatchComparison } from "../../../../../features/migration/batch-comparison.ts";

export const runtime = "nodejs";

function safeFilename(value: string): string {
  return value
    .replace(/[\\/:*?"<>|\r\n]/g, "-")
    .replace(/\s+/g, "-")
    .slice(0, 80) || "migration-batch-comparison";
}

export async function POST(request: Request): Promise<Response> {
  const requestId = crypto.randomUUID();
  let body: { comparison?: MigrationBatchComparison };
  try {
    body = await request.json() as { comparison?: MigrationBatchComparison };
  } catch {
    return Response.json({
      status: "failed",
      warning: "请求 JSON 格式错误。",
      request_id: requestId,
    }, { status: 400, headers: { "Cache-Control": "no-store", "X-Request-Id": requestId } });
  }

  if (!body.comparison?.objectName || !Array.isArray(body.comparison.snapshots)) {
    return Response.json({
      status: "failed",
      warning: "缺少有效的试迁移批次对比结果。",
      request_id: requestId,
    }, { status: 400, headers: { "Cache-Control": "no-store", "X-Request-Id": requestId } });
  }

  const comparison = body.comparison;
  const markdown = buildMigrationBatchComparisonReport(comparison);
  const filename = `${safeFilename(`${comparison.objectName}-试迁移批次对比报告`)}.md`;
  const formal = process.env.AUTH_REQUIRED === "true"
    ? await (async () => { const { persistFormalMigrationOutput } = await import("../../../../../features/formal-output/migration-output.ts"); return persistFormalMigrationOutput({ request, requestId, outputType: "migration_comparison", title: `${comparison.objectName}-试迁移批次对比报告`, objectName: comparison.objectName, markdown, structuredPayload: { comparison } }); })()
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
