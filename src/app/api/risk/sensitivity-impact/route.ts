import { getCurrentUser } from "@/features/auth/server";
import { loadDashboardFromFeishu } from "@/features/dashboard/feishu";
import { DEFAULT_DASHBOARD_DATA } from "@/features/dashboard/normalizer";
import { getEffectiveFeishuConfig } from "@/features/feishu/user-config";
import { buildRiskSensitivityImpactDashboard } from "@/features/risk/sensitivity-impact";
import { filterDashboardByProjectAccess, projectAccessMode } from "@/features/security/authorization";
import { loadProjectAccessGrantsForUser } from "@/features/security/repository";

export const runtime = "nodejs";

function jsonResponse(body: unknown, status = 200, requestId = crypto.randomUUID()) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store", "X-Request-Id": requestId },
  });
}

export async function GET(): Promise<Response> {
  const requestId = crypto.randomUUID();
  const user = await getCurrentUser();
  const effective = await getEffectiveFeishuConfig();
  const rawDashboard = effective.config
    ? await loadDashboardFromFeishu(effective.config).catch(() => DEFAULT_DASHBOARD_DATA)
    : DEFAULT_DASHBOARD_DATA;
  const grants = await loadProjectAccessGrantsForUser(effective.user ?? user);
  const dashboard = filterDashboardByProjectAccess(rawDashboard, effective.user ?? user, grants);
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
      dashboard: effective.config ? "feishu" : "sample",
    },
    access,
  }, 200, requestId);
}
