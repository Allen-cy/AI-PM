import { getCurrentUser } from "@/features/auth/server";
import { loadDashboardFromFeishu } from "@/features/dashboard/feishu";
import { getEffectiveFeishuConfig } from "@/features/feishu/user-config";
import { buildRiskIntegrationDashboard } from "@/features/risk/integration";
import { buildRiskOrganizationalGovernanceDashboard } from "@/features/risk/organizational-governance";
import { filterDashboardByProjectAccess } from "@/features/security/authorization";
import { loadProjectAccessGrantsForUser } from "@/features/security/repository";
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
  const riskResult = await listRisks().catch(() => null);
  if (!riskResult) {
    return json({ request_id: requestId, status: "failed", code: "RISK_REGISTER_LOAD_FAILED", detail: "风险登记册读取失败，未使用样例风险兜底。" }, 503, requestId);
  }
  const effective = await getEffectiveFeishuConfig();
  if (!effective.config) {
    return json({ request_id: requestId, status: "not_configured", code: "FEISHU_DASHBOARD_NOT_CONFIGURED", detail: effective.setupHint, lark_cli_hint: effective.larkCliHint }, process.env.AUTH_REQUIRED === "true" && !effective.user ? 401 : 503, requestId);
  }
  let rawDashboard;
  try {
    rawDashboard = await loadDashboardFromFeishu(effective.config);
  } catch (error) {
    return json({ request_id: requestId, status: "failed", code: "FEISHU_DASHBOARD_LOAD_FAILED", detail: error instanceof Error ? error.message : "飞书项目台账读取失败。" }, 503, requestId);
  }
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
      dashboard: "feishu",
    },
    warning: riskResult.warning,
  }, 200, requestId);
}
