import { getCurrentUser } from "@/features/auth/server";
import { authorizeRiskRequest } from "@/features/risk/access";
import type { RiskRetrospectiveGovernanceActionItem } from "@/features/risk/retrospective-governance";
import {
  listRiskRetrospectiveGovernanceFollowups,
  saveRiskRetrospectiveGovernanceFollowups,
  transitionRiskRetrospectiveGovernanceFollowup,
  type RiskRetrospectiveGovernanceFollowupFeishuSyncStatus,
  type RiskRetrospectiveGovernanceFollowupRecord,
  type RiskRetrospectiveGovernanceFollowupStatus,
} from "@/features/risk/retrospective-governance-followups";
import {
  buildRiskRetrospectiveGovernanceFollowupOperationReport,
  type RiskRetrospectiveGovernanceFollowupDueFilter,
  type RiskRetrospectiveGovernanceFollowupOperationFilters,
} from "@/features/risk/retrospective-governance-followup-workbench";
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

function markdownResponse(markdown: string, filename: string, status = 200, requestId = crypto.randomUUID()) {
  return new Response(markdown, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"`,
      "X-Request-Id": requestId,
    },
  });
}

function statusCode(status?: string): number {
  if (status === "succeeded") return 200;
  if (status === "not_configured") return 503;
  if (status === "not_found") return 404;
  if (status === "unauthorized") return 401;
  return 400;
}

function isFollowupStatus(value: string | null): value is RiskRetrospectiveGovernanceFollowupStatus {
  return value === "待复核" || value === "处理中" || value === "待验收" || value === "已关闭";
}

function isFollowupPriority(value: string | null): value is RiskRetrospectiveGovernanceFollowupRecord["priority"] {
  return value === "high" || value === "medium" || value === "low";
}

function isFeishuSyncStatus(value: string | null): value is RiskRetrospectiveGovernanceFollowupFeishuSyncStatus {
  return value === "未同步" || value === "待确认" || value === "同步中" || value === "已同步" || value === "同步失败";
}

function isDueFilter(value: string | null): value is RiskRetrospectiveGovernanceFollowupDueFilter {
  return value === "all"
    || value === "overdue"
    || value === "due_soon"
    || value === "normal"
    || value === "waiting_acceptance"
    || value === "evidence_gap"
    || value === "closed_this_week";
}

function operationFiltersFromUrl(url: URL): RiskRetrospectiveGovernanceFollowupOperationFilters {
  const status = url.searchParams.get("status");
  const priority = url.searchParams.get("priority");
  const feishuSyncStatus = url.searchParams.get("feishu_sync_status");
  const due = url.searchParams.get("due");
  return {
    owner: url.searchParams.get("owner") || undefined,
    status: status === "all" || isFollowupStatus(status) ? status : undefined,
    priority: priority === "all" || isFollowupPriority(priority) ? priority : undefined,
    feishuSyncStatus: feishuSyncStatus === "all" || isFeishuSyncStatus(feishuSyncStatus) ? feishuSyncStatus : undefined,
    due: isDueFilter(due) ? due : undefined,
  };
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
  const access = await authorizeRiskRequest(request, "read");
  if (!access.ok) return jsonResponse({ request_id: requestId, error: access.error, detail: access.detail }, access.status, requestId);
  const url = new URL(request.url);
  const limit = Number(url.searchParams.get("limit") || 50);
  const filters = operationFiltersFromUrl(url);
  const result = await listRiskRetrospectiveGovernanceFollowups(Number.isFinite(limit) ? limit : 50, access.scope);
  const operationReport = buildRiskRetrospectiveGovernanceFollowupOperationReport({
    followups: result.followups,
    filters,
    warning: "warning" in result ? result.warning : undefined,
  });
  if (url.searchParams.get("format") === "markdown") {
    return markdownResponse(
      operationReport.reportMarkdown,
      `knowledge-governance-followups-weekly-${new Date().toISOString().slice(0, 10)}.md`,
      result.status === "failed" ? 500 : statusCode(result.status),
      requestId,
    );
  }
  return jsonResponse({
    request_id: requestId,
    ...result,
    operation_report: operationReport,
    report_markdown: operationReport.reportMarkdown,
  }, result.status === "failed" ? 500 : statusCode(result.status), requestId);
}

export async function POST(request: Request): Promise<Response> {
  const requestId = crypto.randomUUID();
  const access = await authorizeRiskRequest(request, "create");
  if (!access.ok) return jsonResponse({ request_id: requestId, error: access.error, detail: access.detail }, access.status, requestId);
  const user = await getCurrentUser();
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

  const result = await saveRiskRetrospectiveGovernanceFollowups({ actionItems }, user, access.scope);
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
  const access = await authorizeRiskRequest(request, "transition");
  if (!access.ok) return jsonResponse({ request_id: requestId, error: access.error, detail: access.detail }, access.status, requestId);
  const user = await getCurrentUser();
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
  }, access.scope);
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
