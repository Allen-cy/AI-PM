import { getCurrentUser } from "@/features/auth/server";
import {
  buildRiskRetrospectiveKnowledgeExport,
  listRiskRetrospectiveSyncLogs,
  persistRiskRetrospectiveSyncLog,
} from "@/features/risk/retrospective-knowledge-sync";
import {
  buildRiskRetrospectiveAssetDuplicateWarnings,
  listRiskRetrospectiveAssets,
  recordRiskRetrospectiveAssetExportMetrics,
} from "@/features/risk/retrospective-assets";

export const runtime = "nodejs";

function jsonResponse(body: unknown, status = 200, requestId = crypto.randomUUID()) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store", "X-Request-Id": requestId },
  });
}

export async function GET(): Promise<Response> {
  const requestId = crypto.randomUUID();
  const result = await listRiskRetrospectiveSyncLogs(20);
  return jsonResponse({
    request_id: requestId,
    status: result.status,
    logs: result.logs,
    warning: "warning" in result ? result.warning : undefined,
  }, result.status === "failed" ? 500 : 200, requestId);
}

export async function POST(request: Request): Promise<Response> {
  const requestId = crypto.randomUUID();
  const user = await getCurrentUser();
  if (process.env.AUTH_REQUIRED === "true" && !user) {
    return jsonResponse({ request_id: requestId, status: "unauthorized", error: "请先登录后再导出风险复盘资产。" }, 401, requestId);
  }

  const payload = await request.json().catch(() => ({})) as { targetPath?: string };
  const assetResult = await listRiskRetrospectiveAssets("all", 200);
  if (assetResult.status !== "succeeded") {
    return jsonResponse({
      request_id: requestId,
      status: assetResult.status,
      error: "warning" in assetResult ? assetResult.warning : "风险复盘资产读取失败。",
    }, assetResult.status === "failed" ? 500 : 503, requestId);
  }

  const knowledgeExport = buildRiskRetrospectiveKnowledgeExport(assetResult.assets, payload.targetPath);
  const duplicateWarnings = buildRiskRetrospectiveAssetDuplicateWarnings(assetResult.assets);
  const repeatedExport = assetResult.assets.some(asset => asset.lastExportSha256 === knowledgeExport.sha256);
  const audit = await persistRiskRetrospectiveSyncLog({ knowledgeExport, user, requestId });
  const metrics = await recordRiskRetrospectiveAssetExportMetrics({
    assetIds: knowledgeExport.assetIds,
    sha256: knowledgeExport.sha256,
  });
  const warning = audit.status === "succeeded" ? "" : audit.warning;
  const metricWarning = metrics.status === "succeeded" ? "" : metrics.warning;
  return new Response(knowledgeExport.markdown, {
    status: 200,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "text/markdown;charset=utf-8",
      "Content-Disposition": "attachment; filename=\"risk-retrospective-assets.md\"",
      "X-Request-Id": requestId,
      "X-Risk-Retrospective-Asset-Count": String(knowledgeExport.assetCount),
      "X-Risk-Retrospective-Sha256": knowledgeExport.sha256,
      "X-Risk-Retrospective-Audit-Status": audit.status,
      "X-Risk-Retrospective-Audit-Warning": encodeURIComponent(warning),
      "X-Risk-Retrospective-Metrics-Status": metrics.status,
      "X-Risk-Retrospective-Metrics-Warning": encodeURIComponent(metricWarning),
      "X-Risk-Retrospective-Duplicate-Warnings": encodeURIComponent([
        ...duplicateWarnings.map(item => item.message),
        repeatedExport ? "当前知识页 SHA256 与历史导出一致，可能是重复导出；如内容无变化，可不再写入新的知识页。" : "",
      ].filter(Boolean).join("；")),
    },
  });
}
