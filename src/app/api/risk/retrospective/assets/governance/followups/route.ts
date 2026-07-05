import { getCurrentUser } from "@/features/auth/server";
import type { RiskRetrospectiveGovernanceActionItem } from "@/features/risk/retrospective-governance";
import {
  listRiskRetrospectiveGovernanceFollowups,
  saveRiskRetrospectiveGovernanceFollowups,
  transitionRiskRetrospectiveGovernanceFollowup,
  type RiskRetrospectiveGovernanceFollowupStatus,
} from "@/features/risk/retrospective-governance-followups";
import { writeOperationAudit } from "@/features/security/repository";

export const runtime = "nodejs";

type SaveBody = {
  actionItems?: RiskRetrospectiveGovernanceActionItem[];
};

type PatchBody = {
  id?: string;
  status?: RiskRetrospectiveGovernanceFollowupStatus;
  closureNote?: string | null;
  reviewResult?: string | null;
};

function jsonResponse(body: unknown, status = 200, requestId = crypto.randomUUID()) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store", "X-Request-Id": requestId },
  });
}

function statusCode(status?: string): number {
  if (status === "succeeded") return 200;
  if (status === "not_configured") return 503;
  if (status === "not_found") return 404;
  if (status === "unauthorized") return 401;
  return 400;
}

function isActionItem(value: unknown): value is RiskRetrospectiveGovernanceActionItem {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<RiskRetrospectiveGovernanceActionItem>;
  return typeof item.id === "string"
    && typeof item.sourceLogId === "string"
    && typeof item.assetTitle === "string"
    && typeof item.reason === "string"
    && typeof item.actionRequired === "string"
    && typeof item.owner === "string"
    && typeof item.deadline === "string"
    && (item.priority === "high" || item.priority === "medium" || item.priority === "low")
    && typeof item.closingCriteria === "string"
    && typeof item.reminderText === "string";
}

export async function GET(request: Request): Promise<Response> {
  const requestId = crypto.randomUUID();
  const url = new URL(request.url);
  const limit = Number(url.searchParams.get("limit") || 50);
  const result = await listRiskRetrospectiveGovernanceFollowups(Number.isFinite(limit) ? limit : 50);
  return jsonResponse({
    request_id: requestId,
    ...result,
  }, result.status === "failed" ? 500 : statusCode(result.status), requestId);
}

export async function POST(request: Request): Promise<Response> {
  const requestId = crypto.randomUUID();
  const user = await getCurrentUser();
  if (process.env.AUTH_REQUIRED === "true" && !user) {
    return jsonResponse({ request_id: requestId, status: "unauthorized", warning: "请先登录后再保存风险复盘二次治理待办。" }, 401, requestId);
  }

  let body: SaveBody;
  try {
    body = await request.json() as SaveBody;
  } catch {
    return jsonResponse({ request_id: requestId, status: "failed", warning: "请求 JSON 格式错误。" }, 400, requestId);
  }
  const actionItems = Array.isArray(body.actionItems) ? body.actionItems.filter(isActionItem) : [];
  if (actionItems.length === 0) {
    return jsonResponse({ request_id: requestId, status: "failed", warning: "缺少有效的二次治理待办。" }, 400, requestId);
  }

  const result = await saveRiskRetrospectiveGovernanceFollowups({ actionItems }, user);
  if (result.status === "succeeded") {
    await writeOperationAudit({
      user,
      action: "risk_retrospective_governance_followups_save",
      resourceType: "risk_retrospective_governance_followup",
      resourceId: result.followups.map(item => item.id).join(",") || "no_new_followup",
      status: "succeeded",
      severity: result.followups.some(item => item.priority === "high") ? "medium" : "low",
      summary: `保存风险复盘二次治理待办：新增${result.created}项，跳过${result.skipped}项`,
      detail: { created: result.created, skipped: result.skipped, action_keys: actionItems.map(item => item.id) },
      requestId,
    });
  }
  return jsonResponse({ request_id: requestId, ...result }, result.status === "failed" ? 500 : statusCode(result.status), requestId);
}

export async function PATCH(request: Request): Promise<Response> {
  const requestId = crypto.randomUUID();
  const user = await getCurrentUser();
  if (process.env.AUTH_REQUIRED === "true" && !user) {
    return jsonResponse({ request_id: requestId, status: "unauthorized", warning: "请先登录后再流转风险复盘二次治理待办。" }, 401, requestId);
  }

  let body: PatchBody;
  try {
    body = await request.json() as PatchBody;
  } catch {
    return jsonResponse({ request_id: requestId, status: "failed", warning: "请求 JSON 格式错误。" }, 400, requestId);
  }
  if (!body.id || !body.status) {
    return jsonResponse({ request_id: requestId, status: "failed", warning: "缺少待办 ID 或目标状态。" }, 400, requestId);
  }

  const result = await transitionRiskRetrospectiveGovernanceFollowup({
    id: body.id,
    status: body.status,
    closureNote: body.closureNote,
    reviewResult: body.reviewResult,
  });
  if (result.status === "succeeded") {
    await writeOperationAudit({
      user,
      action: "risk_retrospective_governance_followup_transition",
      resourceType: "risk_retrospective_governance_followup",
      resourceId: result.followup.id,
      status: "succeeded",
      severity: result.followup.priority === "high" ? "medium" : "low",
      summary: `风险复盘二次治理待办流转：${result.followup.assetTitle} / ${result.followup.status}`,
      detail: { followup_id: result.followup.id, status: result.followup.status },
      requestId,
    });
  }
  return jsonResponse({ request_id: requestId, ...result }, result.status === "failed" ? 500 : statusCode(result.status), requestId);
}
