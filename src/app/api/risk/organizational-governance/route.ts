import { getCurrentUser } from "@/features/auth/server";
import { loadDashboardFromFeishu } from "@/features/dashboard/feishu";
import { DEFAULT_DASHBOARD_DATA } from "@/features/dashboard/normalizer";
import { getEffectiveFeishuConfig } from "@/features/feishu/user-config";
import { buildRiskIntegrationDashboard } from "@/features/risk/integration";
import { buildRiskOrganizationalGovernanceDashboard } from "@/features/risk/organizational-governance";
import { filterDashboardByProjectAccess } from "@/features/security/authorization";
import { loadProjectAccessGrantsForUser } from "@/features/security/repository";
import { initialRisks } from "@/lib/risk";
import { listRisks } from "@/lib/risk-repository";

export const runtime = "nodejs";

function json(body: unknown, status = 200, requestId = crypto.randomUUID()) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Request-Id": requestId,
    },
  });
}

export async function GET(): Promise<Response> {
  const requestId = crypto.randomUUID();
  const user = await getCurrentUser();
  const riskResult = await listRisks().catch(error => ({
    risks: initialRisks,
    events: [],
    source: "memory" as const,
    warning: error instanceof Error ? error.message : "风险登记册读取失败，已回退到样例风险。",
  }));
  const effective = await getEffectiveFeishuConfig();
  const rawDashboard = effective.config
    ? await loadDashboardFromFeishu(effective.config).catch(() => DEFAULT_DASHBOARD_DATA)
    : DEFAULT_DASHBOARD_DATA;
  const grants = await loadProjectAccessGrantsForUser(effective.user ?? user);
  const dashboard = filterDashboardByProjectAccess(rawDashboard, effective.user ?? user, grants);
  const risk_integration = buildRiskIntegrationDashboard({
    risks: riskResult.risks,
    dashboard,
  });
  const risk_organizational_governance = buildRiskOrganizationalGovernanceDashboard({
    risks: riskResult.risks,
    integration: risk_integration,
  });

  return json({
    request_id: requestId,
    status: "succeeded",
    risk_organizational_governance,
    source: {
      risk: riskResult.source,
      dashboard: effective.config ? "feishu" : "sample",
    },
    warning: riskResult.warning,
  }, 200, requestId);
}
