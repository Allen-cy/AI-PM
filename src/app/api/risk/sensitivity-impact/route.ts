import { getCurrentUser } from "@/features/auth/server";
import { loadDashboardFromFeishu } from "@/features/dashboard/feishu";
import { getEffectiveFeishuConfig } from "@/features/feishu/user-config";
import { buildRiskSensitivityImpactDashboard } from "@/features/risk/sensitivity-impact";
import { authorizeRiskRequest } from "@/features/risk/access";
import { filterRiskScopedProjectRecords } from "@/features/risk/scope";
import { buildDashboardData } from "@/features/dashboard/normalizer";
import { filterDashboardByProjectAccess, projectAccessMode } from "@/features/security/authorization";
import { loadProjectAccessGrantsForUser } from "@/features/security/repository";

export const runtime = "nodejs";

function jsonResponse(body: unknown, status = 200, requestId = crypto.randomUUID()) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store", "X-Request-Id": requestId },
  });
}

export async function GET(request: Request): Promise<Response> {
  const requestId = crypto.randomUUID();
  const scopedAccess = await authorizeRiskRequest(request, "read");
  if (!scopedAccess.ok) return jsonResponse({ request_id: requestId, error: scopedAccess.error, detail: scopedAccess.detail }, scopedAccess.status, requestId);
  const user = await getCurrentUser();
  const effective = await getEffectiveFeishuConfig();
  if (!effective.config) {
    return jsonResponse({ request_id: requestId, status: "not_configured", code: "FEISHU_DASHBOARD_NOT_CONFIGURED", detail: effective.setupHint, lark_cli_hint: effective.larkCliHint }, 503, requestId);
  }
  let rawDashboard;
  try {
    rawDashboard = await loadDashboardFromFeishu(effective.config, { dataClass: scopedAccess.scope.dataClass });
  } catch (error) {
    return jsonResponse({ request_id: requestId, status: "failed", code: "FEISHU_DASHBOARD_LOAD_FAILED", detail: error instanceof Error ? error.message : "飞书项目台账读取失败。" }, 503, requestId);
  }
  const grants = await loadProjectAccessGrantsForUser(effective.user ?? user);
  const grantedDashboard = filterDashboardByProjectAccess(rawDashboard, effective.user ?? user, grants);
  const scopedRecords = filterRiskScopedProjectRecords(grantedDashboard.records, scopedAccess.scope);
  const dashboard = buildDashboardData(scopedRecords, {
    type: grantedDashboard.source.type,
    name: grantedDashboard.source.name,
    note: `${grantedDashboard.source.note || ""} 已按当前业务上下文过滤为 ${scopedRecords.length} 个项目。`.trim(),
  }, { useTemplateFallback: false });
  const access = {
    mode: projectAccessMode(effective.user ?? user, dashboard.records.length, rawDashboard.records.length),
    visible_projects: dashboard.records.length,
    total_projects: rawDashboard.records.length,
    explicit_grants: grants.length,
  };
  const risk_sensitivity_impact = buildRiskSensitivityImpactDashboard(dashboard);

  return jsonResponse({
    request_id: requestId,
    status: "succeeded",
    risk_sensitivity_impact,
    source: {
      dashboard: "feishu",
    },
    access,
  }, 200, requestId);
}
