import { getCurrentUser } from "@/features/auth/server";
import { FeishuActionClient } from "@/features/feishu/actions";
import { FeishuApiError } from "@/features/feishu/client";
import { getEffectiveFeishuConfig } from "@/features/feishu/user-config";
import { listRiskRetrospectiveGovernanceFollowups } from "@/features/risk/retrospective-governance-followups";
import {
  persistRiskRetrospectiveGovernanceOperationSnapshot,
  persistRiskRetrospectiveGovernanceReminderLogs,
} from "@/features/risk/retrospective-governance-operations";
import { buildRiskRetrospectiveGovernanceFollowupOperationReport } from "@/features/risk/retrospective-governance-followup-workbench";
import { writeOperationAudit } from "@/features/security/repository";

export const runtime = "nodejs";

type WeeklyReminderBody = {
  confirm?: boolean;
  receiveId?: string;
  receiveIdType?: "chat_id" | "open_id";
  message?: string;
};

function jsonResponse(body: unknown, status = 200, requestId = crypto.randomUUID()) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store", "X-Request-Id": requestId },
  });
}

function normalizeReceiveIdType(value: unknown): "chat_id" | "open_id" | null {
  return value === "chat_id" || value === "open_id" ? value : null;
}

export async function POST(request: Request): Promise<Response> {
  const requestId = crypto.randomUUID();
  const user = await getCurrentUser();
  if (process.env.AUTH_REQUIRED === "true" && !user) {
    return jsonResponse({ request_id: requestId, status: "unauthorized", warning: "请先登录后再发送知识治理周运营飞书提醒。" }, 401, requestId);
  }

  let body: WeeklyReminderBody = {};
  try {
    body = await request.json() as WeeklyReminderBody;
  } catch {
    return jsonResponse({ request_id: requestId, status: "failed", warning: "请求 JSON 格式错误。" }, 400, requestId);
  }

  const followupResult = await listRiskRetrospectiveGovernanceFollowups(500);
  const operationReport = buildRiskRetrospectiveGovernanceFollowupOperationReport({
    followups: followupResult.followups,
    warning: "warning" in followupResult ? followupResult.warning : undefined,
  });
  const draft = operationReport.feishuReminderDraft;
  if (!draft) {
    return jsonResponse({
      request_id: requestId,
      status: "skipped",
      warning: "当前没有需要发送的知识治理运营提醒。",
      operation_report: operationReport,
    }, 200, requestId);
  }

  if (body.confirm !== true) {
    return jsonResponse({
      request_id: requestId,
      status: "confirmation_required",
      confirmation_required: true,
      draft,
      reminder_drafts: operationReport.reminderDrafts.slice(0, 10),
      warning: "发送到飞书前必须显式确认，并填写 chat_id 或 open_id。",
    }, 200, requestId);
  }

  const receiveIdType = normalizeReceiveIdType(body.receiveIdType);
  const receiveId = typeof body.receiveId === "string" ? body.receiveId.trim() : "";
  if (!receiveIdType || !receiveId) {
    return jsonResponse({
      request_id: requestId,
      status: "failed",
      confirmation_required: true,
      draft,
      warning: "发送到飞书前需要填写接收对象类型和接收对象ID：chat_id 用于群聊，open_id 用于个人。",
    }, 400, requestId);
  }

  const effectiveFeishu = await getEffectiveFeishuConfig();
  if (!effectiveFeishu.config) {
    return jsonResponse({
      request_id: requestId,
      status: "not_configured",
      confirmation_required: true,
      draft,
      warning: effectiveFeishu.setupHint || "飞书接入未配置，请先在用户中心配置个人飞书或联系管理员配置全局飞书。",
      lark_cli_hint: effectiveFeishu.larkCliHint,
    }, 503, requestId);
  }

  const message = typeof body.message === "string" && body.message.trim()
    ? body.message.trim().slice(0, 30_000)
    : draft.message;
  try {
    const client = new FeishuActionClient(effectiveFeishu.config);
    const resource = await client.sendTextMessage({
      receiveId,
      receiveIdType,
      text: message,
      idempotencyKey: `risk-retro-governance-weekly-${new Date().toISOString().slice(0, 10)}-${requestId}`,
    });
    const [snapshotResult, reminderLogResult] = await Promise.all([
      persistRiskRetrospectiveGovernanceOperationSnapshot({ report: operationReport, user, requestId }),
      persistRiskRetrospectiveGovernanceReminderLogs({
        reminders: operationReport.reminderDrafts,
        status: "sent",
        user,
        requestId,
        receiveIdType,
        receiveId,
        feishuMessageId: resource.messageId,
      }),
    ]);
    await writeOperationAudit({
      user,
      action: "risk_retrospective_governance_weekly_feishu_reminder",
      resourceType: "risk_retrospective_governance_followup",
      resourceId: "weekly-reminder",
      status: "succeeded",
      severity: "low",
      summary: `知识治理周运营提醒已发送到飞书：${operationReport.reminderDrafts.length}条提醒草稿`,
      detail: {
        receive_id_type: receiveIdType,
        feishu_source: effectiveFeishu.source,
        reminder_count: operationReport.reminderDrafts.length,
        message_id: resource.messageId,
        snapshot_status: snapshotResult.status,
        reminder_log_status: reminderLogResult.status,
      },
      requestId,
    });
    return jsonResponse({
      request_id: requestId,
      status: "succeeded",
      resource,
      sent_message: message,
      operation_report: operationReport,
      operation_snapshot: snapshotResult.status === "succeeded" ? snapshotResult.snapshot : null,
      reminder_logs: reminderLogResult.status === "succeeded" ? reminderLogResult.logs : [],
      history_warning: [snapshotResult, reminderLogResult]
        .map(item => "warning" in item ? item.warning : null)
        .filter(Boolean)
        .join("；") || undefined,
    }, 201, requestId);
  } catch (error) {
    const code = error instanceof FeishuApiError ? error.code : "FEISHU_WEEKLY_REMINDER_FAILED";
    const reminderLogResult = await persistRiskRetrospectiveGovernanceReminderLogs({
      reminders: operationReport.reminderDrafts,
      status: "failed",
      user,
      requestId,
      receiveIdType,
      receiveId,
      error: code,
    });
    await writeOperationAudit({
      user,
      action: "risk_retrospective_governance_weekly_feishu_reminder",
      resourceType: "risk_retrospective_governance_followup",
      resourceId: "weekly-reminder",
      status: "failed",
      severity: "medium",
      summary: `知识治理周运营提醒发送飞书失败：${code}`,
      detail: {
        receive_id_type: receiveIdType,
        feishu_source: effectiveFeishu.source,
        reminder_count: operationReport.reminderDrafts.length,
        code,
        reminder_log_status: reminderLogResult.status,
      },
      requestId,
    });
    console.error(JSON.stringify({ level: "error", event: "risk.retrospective_governance.weekly_reminder_failed", request_id: requestId, code }));
    return jsonResponse({
      request_id: requestId,
      status: "failed",
      draft,
      warning: `发送飞书提醒失败：${code}`,
    }, 502, requestId);
  }
}
