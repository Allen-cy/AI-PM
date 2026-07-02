import { DEFAULT_DASHBOARD_DATA } from "@/features/dashboard/normalizer";
import { loadDashboardFromFeishu } from "@/features/dashboard/feishu";
import { getEffectiveFeishuConfig } from "@/features/feishu/user-config";
import { buildFinanceCockpit } from "@/features/finance/cockpit";
import { writeIntegrationSyncLog } from "@/features/operating-system/sync-logs";

export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  const requestId = crypto.randomUUID();
  const effective = await getEffectiveFeishuConfig();

  if (process.env.AUTH_REQUIRED === "true" && !effective.user) {
    return Response.json({
      status: "unauthorized",
      code: "AUTH_REQUIRED",
      detail: "请先登录后再查看业财一体化经营驾驶舱。",
      request_id: requestId,
    }, {
      status: 401,
      headers: { "Cache-Control": "no-store", "X-Request-Id": requestId },
    });
  }

  if (!effective.config) {
    const cockpit = buildFinanceCockpit(DEFAULT_DASHBOARD_DATA);
    return Response.json({
      status: "not_configured",
      source: effective.source,
      detail: effective.setupHint,
      lark_cli_hint: effective.larkCliHint,
      cockpit,
      request_id: requestId,
    }, {
      status: 200,
      headers: { "Cache-Control": "no-store", "X-Request-Id": requestId },
    });
  }

  try {
    const dashboard = await loadDashboardFromFeishu(effective.config);
    const cockpit = buildFinanceCockpit(dashboard);
    await writeIntegrationSyncLog({
      userId: effective.user?.id,
      source: "system",
      eventType: "finance_cockpit_generation",
      status: "succeeded",
      severity: cockpit.alerts.some(item => item.priority === "P0") ? "medium" : "low",
      summary: `经营驾驶舱生成完成：项目${cockpit.kpis.totalProjects}个，应收${cockpit.kpis.receivable}万，逾期${cockpit.kpis.overdueReceivable}万，验收阻塞回款${cockpit.kpis.acceptanceBlockedReceivable}万。`,
      detail: {
        source: cockpit.source,
        alert_count: cockpit.alerts.length,
        gross_margin_rate: cockpit.kpis.grossMarginRate,
        collection_rate: cockpit.kpis.collectionRate,
      },
      requestId,
    });
    return Response.json({
      status: "succeeded",
      source: effective.source,
      cockpit,
      request_id: requestId,
    }, {
      headers: { "Cache-Control": "no-store", "X-Request-Id": requestId },
    });
  } catch (error) {
    const cockpit = buildFinanceCockpit(DEFAULT_DASHBOARD_DATA);
    return Response.json({
      status: "error",
      source: effective.source,
      code: "FINANCE_COCKPIT_FAILED",
      detail: error instanceof Error ? error.message : "unknown",
      cockpit,
      request_id: requestId,
    }, {
      status: 503,
      headers: { "Cache-Control": "no-store", "X-Request-Id": requestId },
    });
  }
}
