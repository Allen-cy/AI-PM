import { getCurrentUser } from "@/features/auth/server";
import { listRiskRetrospectiveGovernanceFollowups } from "@/features/risk/retrospective-governance-followups";
import {
  listRiskRetrospectiveGovernanceOperationHistory,
  persistRiskRetrospectiveGovernanceOperationSnapshot,
  updateRiskRetrospectiveGovernanceReminderLogStatus,
  type RiskRetrospectiveGovernanceReminderLogStatus,
} from "@/features/risk/retrospective-governance-operations";
import { buildRiskRetrospectiveGovernanceFollowupOperationReport } from "@/features/risk/retrospective-governance-followup-workbench";
import { writeOperationAudit } from "@/features/security/repository";

export const runtime = "nodejs";

type PostBody = {
  action?: "snapshot";
};

type PatchBody = {
  id?: string;
  status?: RiskRetrospectiveGovernanceReminderLogStatus;
  closureNote?: string | null;
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
  if (status === "skipped") return 200;
  return 400;
}

function isCloseStatus(value: unknown): value is "processed" | "ignored" | "escalated" {
  return value === "processed" || value === "ignored" || value === "escalated";
}

async function currentOperationReport(limit = 500) {
  const followupResult = await listRiskRetrospectiveGovernanceFollowups(limit);
  return {
    followupResult,
    operationReport: buildRiskRetrospectiveGovernanceFollowupOperationReport({
      followups: followupResult.followups,
      warning: "warning" in followupResult ? followupResult.warning : undefined,
    }),
  };
}

export async function GET(): Promise<Response> {
  const requestId = crypto.randomUUID();
  const user = await getCurrentUser();
  if (process.env.AUTH_REQUIRED === "true" && !user) {
    return jsonResponse({ request_id: requestId, status: "unauthorized", warning: "请先登录后再查看知识治理运营历史。" }, 401, requestId);
  }

  const [{ operationReport }, history] = await Promise.all([
    currentOperationReport(),
    listRiskRetrospectiveGovernanceOperationHistory(),
  ]);
  return jsonResponse({
    request_id: requestId,
    status: history.status,
    operation_report: operationReport,
    snapshots: history.snapshots,
    reminder_logs: history.reminderLogs,
    warning: "warning" in history ? history.warning : undefined,
    boundary: "知识治理运营历史只记录系统快照和提醒处理状态；不会自动关闭二次治理待办，也不会自动发送飞书消息。",
  }, statusCode(history.status), requestId);
}

export async function POST(request: Request): Promise<Response> {
  const requestId = crypto.randomUUID();
  const user = await getCurrentUser();
  if (process.env.AUTH_REQUIRED === "true" && !user) {
    return jsonResponse({ request_id: requestId, status: "unauthorized", warning: "请先登录后再保存知识治理运营快照。" }, 401, requestId);
  }

  let body: PostBody = {};
  try {
    body = await request.json() as PostBody;
  } catch {
    return jsonResponse({ request_id: requestId, status: "failed", warning: "请求 JSON 格式错误。" }, 400, requestId);
  }
  if (body.action && body.action !== "snapshot") {
    return jsonResponse({ request_id: requestId, status: "failed", warning: "知识治理运营历史动作不合法。" }, 400, requestId);
  }

  const { operationReport } = await currentOperationReport();
  const result = await persistRiskRetrospectiveGovernanceOperationSnapshot({
    report: operationReport,
    user,
    requestId,
  });
  await writeOperationAudit({
    user,
    action: "risk_retrospective_governance_operation_snapshot",
    resourceType: "risk_retrospective_governance_operation",
    resourceId: result.status === "succeeded" ? result.snapshot.id : "snapshot",
    status: result.status === "failed" ? "failed" : result.status === "skipped" ? "skipped" : "succeeded",
    severity: result.status === "failed" ? "medium" : "low",
    summary: result.status === "succeeded"
      ? `知识治理运营快照已保存：${result.snapshot.snapshotDate}`
      : result.warning,
    detail: {
      total: operationReport.summary.total,
      open: operationReport.summary.open,
      reminder_count: operationReport.reminderDrafts.length,
    },
    requestId,
  });
  return jsonResponse({
    request_id: requestId,
    ...result,
    operation_report: operationReport,
  }, result.status === "failed" ? 500 : statusCode(result.status), requestId);
}

export async function PATCH(request: Request): Promise<Response> {
  const requestId = crypto.randomUUID();
  const user = await getCurrentUser();
  if (process.env.AUTH_REQUIRED === "true" && !user) {
    return jsonResponse({ request_id: requestId, status: "unauthorized", warning: "请先登录后再更新知识治理运营提醒。" }, 401, requestId);
  }

  let body: PatchBody;
  try {
    body = await request.json() as PatchBody;
  } catch {
    return jsonResponse({ request_id: requestId, status: "failed", warning: "请求 JSON 格式错误。" }, 400, requestId);
  }
  if (!body.id || !isCloseStatus(body.status)) {
    return jsonResponse({ request_id: requestId, status: "failed", warning: "请提供提醒日志 ID，并将状态更新为已处理、无需处理或已升级。" }, 400, requestId);
  }

  const result = await updateRiskRetrospectiveGovernanceReminderLogStatus({
    id: body.id,
    status: body.status,
    closureNote: body.closureNote,
    user,
    requestId,
  });
  if (result.status === "succeeded") {
    await writeOperationAudit({
      user,
      action: "risk_retrospective_governance_reminder_close",
      resourceType: "risk_retrospective_governance_reminder_log",
      resourceId: result.log.id,
      status: "succeeded",
      severity: result.log.status === "escalated" ? "medium" : "low",
      summary: `知识治理运营提醒已更新为${result.log.status}：${result.log.title}`,
      detail: {
        reminder_key: result.log.reminderKey,
        closure_note: result.log.closureNote,
      },
      requestId,
    });
  }
  return jsonResponse({ request_id: requestId, ...result }, result.status === "failed" ? 500 : statusCode(result.status), requestId);
}
