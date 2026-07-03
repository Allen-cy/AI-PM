import { buildMigrationCutoverDecisionReport, type MigrationCutoverDecisionPackage } from "../../../../../features/migration/cutover-decision.ts";

export const runtime = "nodejs";

function safeFilename(value: string): string {
  return value
    .replace(/[\\/:*?"<>|\r\n]/g, "-")
    .replace(/\s+/g, "-")
    .slice(0, 80) || "migration-cutover-decision";
}

export async function POST(request: Request): Promise<Response> {
  const requestId = crypto.randomUUID();
  let body: { decisionPackage?: MigrationCutoverDecisionPackage };
  try {
    body = await request.json() as { decisionPackage?: MigrationCutoverDecisionPackage };
  } catch {
    return Response.json({
      status: "failed",
      warning: "请求 JSON 格式错误。",
      request_id: requestId,
    }, { status: 400, headers: { "Cache-Control": "no-store", "X-Request-Id": requestId } });
  }

  if (!body.decisionPackage?.objectName || !Array.isArray(body.decisionPackage.checklist)) {
    return Response.json({
      status: "failed",
      warning: "缺少有效的正式迁移决策包。",
      request_id: requestId,
    }, { status: 400, headers: { "Cache-Control": "no-store", "X-Request-Id": requestId } });
  }

  const markdown = buildMigrationCutoverDecisionReport(body.decisionPackage);
  const filename = `${safeFilename(`${body.decisionPackage.objectName}-正式迁移Go-NoGo决策包`)}.md`;
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
