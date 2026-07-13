import { listRiskRetrospectiveAssets } from "@/features/risk/retrospective-assets";
import {
  buildRiskRetrospectiveGovernanceDashboard,
  listRiskRetrospectiveGovernanceLogs,
  type RiskRetrospectiveGovernanceAction,
} from "@/features/risk/retrospective-governance";
import { listRiskRetrospectiveGovernanceFollowups } from "@/features/risk/retrospective-governance-followups";
import { buildRiskRetrospectiveGovernanceFollowupClosureDashboard } from "@/features/risk/retrospective-governance-followup-workbench";
import { buildRiskRetrospectiveQualityDashboard } from "@/features/risk/retrospective-quality";
import { authorizeRiskRequest } from "@/features/risk/access";

export const runtime = "nodejs";

function jsonResponse(body: unknown, status = 200, requestId = crypto.randomUUID()) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store", "X-Request-Id": requestId },
  });
}

function isKnownAction(action: string | null): action is RiskRetrospectiveGovernanceAction | "all" {
  return !action || action === "all" || action === "edit" || action === "merge" || action === "archive" || action === "review" || action === "publish";
}

export async function GET(request: Request): Promise<Response> {
  const requestId = crypto.randomUUID();
  const access = await authorizeRiskRequest(request, "read");
  if (!access.ok) return jsonResponse({ request_id: requestId, error: access.error, detail: access.detail }, access.status, requestId);
  const url = new URL(request.url);
  const action = url.searchParams.get("action");
  const assetId = url.searchParams.get("asset_id") || undefined;
  const limit = Number(url.searchParams.get("limit") || 50);
  if (!isKnownAction(action)) {
    return jsonResponse({ request_id: requestId, status: "failed", error: "治理动作筛选条件无效。" }, 400, requestId);
  }

  const [assetsResult, logsResult, followupResult] = await Promise.all([
    listRiskRetrospectiveAssets("all", 200, access.scope),
    listRiskRetrospectiveGovernanceLogs({ scope: access.scope, action: action || "all", assetId, limit: Number.isFinite(limit) ? limit : 50 }),
    listRiskRetrospectiveGovernanceFollowups(120, access.scope),
  ]);
  const quality = buildRiskRetrospectiveQualityDashboard(assetsResult.assets);
  const governance = buildRiskRetrospectiveGovernanceDashboard({
    assets: assetsResult.assets,
    logs: logsResult.logs,
    quality,
  });
  const followupClosure = buildRiskRetrospectiveGovernanceFollowupClosureDashboard({
    followups: followupResult.followups,
    warning: "warning" in followupResult ? followupResult.warning : undefined,
  });
  const governanceWithFollowupClosure = {
    ...governance,
    followupClosure,
    reportMarkdown: [
      governance.reportMarkdown,
      "",
      "## 知识治理待办闭环",
      "",
      ...followupClosure.reportFacts.map(item => `- ${item}`),
      "",
      "### 最近关闭证据",
      "",
      ...(followupClosure.recentClosed.length > 0
        ? followupClosure.recentClosed.map(item => `- ${item.assetTitle}｜责任人：${item.ownerName}｜关闭时间：${item.closedAt || "暂无"}｜证据：${item.closureNote || "未填写"}｜复核：${item.reviewResult || "未填写"}`)
        : ["- 暂无已关闭知识治理待办。"]),
      "",
      `> ${followupClosure.boundary}`,
    ].join("\n"),
  };
  const status = assetsResult.status === "failed" || logsResult.status === "failed" || followupResult.status === "failed"
    ? "failed"
    : logsResult.status === "not_configured" || assetsResult.status === "not_configured" || followupResult.status === "not_configured"
      ? "not_configured"
      : "succeeded";
  const warning = [
    "warning" in assetsResult ? assetsResult.warning : "",
    "warning" in logsResult ? logsResult.warning : "",
    "warning" in followupResult ? followupResult.warning : "",
  ].filter(Boolean).join("；");

  return jsonResponse({
    request_id: requestId,
    status,
    risk_retrospective_governance: governanceWithFollowupClosure,
    risk_retrospective_governance_followup_closure: followupClosure,
    warning: warning || undefined,
  }, status === "failed" ? 500 : 200, requestId);
}
