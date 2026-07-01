import { loadDashboardFromFeishu } from "@/features/dashboard/feishu";
import { getEffectiveFeishuConfig } from "@/features/feishu/user-config";
import { deriveWorkbenchSummary } from "@/features/pmo-operating-system";

export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  const requestId = crypto.randomUUID();
  const effective = await getEffectiveFeishuConfig();
  if (!effective.config) {
    return Response.json({
      status: "not_configured",
      source: effective.source,
      detail: effective.setupHint,
      workbench: deriveWorkbenchSummary(null),
      request_id: requestId,
    }, {
      status: process.env.AUTH_REQUIRED === "true" && !effective.user ? 401 : 200,
      headers: { "Cache-Control": "no-store", "X-Request-Id": requestId },
    });
  }

  try {
    const dashboard = await loadDashboardFromFeishu(effective.config);
    return Response.json({
      status: "succeeded",
      source: effective.source,
      generated_at: dashboard.source.generatedAt,
      workbench: deriveWorkbenchSummary(dashboard),
      request_id: requestId,
    }, {
      headers: { "Cache-Control": "no-store", "X-Request-Id": requestId },
    });
  } catch (error) {
    return Response.json({
      status: "error",
      source: effective.source,
      code: "WORKBENCH_DASHBOARD_FAILED",
      detail: error instanceof Error ? error.message : "unknown",
      workbench: deriveWorkbenchSummary(null),
      request_id: requestId,
    }, {
      status: 503,
      headers: { "Cache-Control": "no-store", "X-Request-Id": requestId },
    });
  }
}
