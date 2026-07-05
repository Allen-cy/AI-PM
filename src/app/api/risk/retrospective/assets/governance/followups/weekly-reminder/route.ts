import { getCurrentUser } from "@/features/auth/server";
import { FeishuActionClient } from "@/features/feishu/actions";
import { FeishuApiError } from "@/features/feishu/client";
import { getEffectiveFeishuConfig } from "@/features/feishu/user-config";
import { listRiskRetrospectiveGovernanceFollowups } from "@/features/risk/retrospective-governance-followups";
import { suppressRiskRetrospectiveGovernanceReminderDraftsForWeek } from "@/features/risk/retrospective-governance-operation-analytics";
import {
  listRiskRetrospectiveGovernanceOperationHistory,
  persistRiskRetrospectiveGovernanceOperationSnapshot,
  persistRiskRetrospectiveGovernanceReminderLogs,
} from "@/features/risk/retrospective-governance-operations";
import {
  buildRiskRetrospectiveGovernanceFollowupOperationReport,
  type RiskRetrospectiveGovernanceFollowupReminderDraft,
} from "@/features/risk/retrospective-governance-followup-workbench";
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

function buildWeeklyReminderMessage(reportFacts: string[], reminders: RiskRetrospectiveGovernanceFollowupReminderDraft[], suppressedCount: number): string {
  const topReminders = reminders.slice(0, 8).map((item, index) => `${index + 1}. ${item.title}｜${item.ownerName}｜${item.dueDate}｜${item.actionRequired}`);
  return [
    "【AI-PMO知识治理周运营提醒】",
    ...reportFacts,
    suppressedCount > 0 ? `本周已抑制重复提醒：${suppressedCount}条。` : "",
    "",
    "需处理提醒：",
    ...topReminders,
    "",
    "请责任人在系统内补齐处理动作、关闭证据和验收结论。该消息由用户在系统中显式确认后发送。",
  ].filter(line => line !== "").join("\n");
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
  const history = await listRiskRetrospectiveGovernanceOperationHistory({ reminderLimit: 300 });
  const currentWeekStart = operationReport.weeklyTrend[operationReport.weeklyTrend.length - 1]?.weekStart ?? new Date().toISOString().slice(0, 10);
  const reminderSuppression = suppressRiskRetrospectiveGovernanceReminderDraftsForWeek({
    reminders: operationReport.reminderDrafts,
    reminderLogs: history.reminderLogs,
    weekStart: currentWeekStart,
  });
  const sendableMessage = buildWeeklyReminderMessage(
    operationReport.reportFacts,
    reminderSuppression.reminders,
    reminderSuppression.summary.suppressedThisWeek,
  );

  if (body.confirm !== true) {
    return jsonResponse({
      request_id: requestId,
      status: "confirmation_required",
      confirmation_required: true,
      draft: { ...draft, message: sendableMessage },
      reminder_drafts: reminderSuppression.reminders.slice(0, 10),
      reminder_suppression: reminderSuppression,
      history_warning: "warning" in history ? history.warning : undefined,
      warning: "发送到飞书前必须显式确认，并填写 chat_id 或 open_id。",
    }, 200, requestId);
  }

  if (reminderSuppression.reminders.length === 0) {
    return jsonResponse({
      request_id: requestId,
      status: "skipped",
      confirmation_required: false,
      operation_report: operationReport,
      reminder_suppression: reminderSuppression,
      history_warning: "warning" in history ? history.warning : undefined,
      warning: "本周同一知识治理提醒已发送或已闭环处理，本次不重复外发。",
    }, 200, requestId);
  }

  const receiveIdType = normalizeReceiveIdType(body.receiveIdType);
  const receiveId = typeof body.receiveId === "string" ? body.receiveId.trim() : "";
  if (!receiveIdType || !receiveId) {
    return jsonResponse({
      request_id: requestId,
      status: "failed",
      confirmation_required: true,
      draft: { ...draft, message: sendableMessage },
      reminder_suppression: reminderSuppression,
      warning: "发送到飞书前需要填写接收对象类型和接收对象ID：chat_id 用于群聊，open_id 用于个人。",
    }, 400, requestId);
  }

  const effectiveFeishu = await getEffectiveFeishuConfig();
  if (!effectiveFeishu.config) {
    return jsonResponse({
      request_id: requestId,
      status: "not_configured",
      confirmation_required: true,
      draft: { ...draft, message: sendableMessage },
      reminder_suppression: reminderSuppression,
      warning: effectiveFeishu.setupHint || "飞书接入未配置，请先在用户中心配置个人飞书或联系管理员配置全局飞书。",
      lark_cli_hint: effectiveFeishu.larkCliHint,
    }, 503, requestId);
  }

  const message = sendableMessage.slice(0, 30_000);
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
        reminders: reminderSuppression.reminders,
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
      summary: `知识治理周运营提醒已发送到飞书：${reminderSuppression.reminders.length}条提醒草稿`,
      detail: {
        receive_id_type: receiveIdType,
        feishu_source: effectiveFeishu.source,
        reminder_count: reminderSuppression.reminders.length,
        suppressed_this_week: reminderSuppression.summary.suppressedThisWeek,
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
      reminder_suppression: reminderSuppression,
      history_warning: [snapshotResult, reminderLogResult]
        .map(item => "warning" in item ? item.warning : null)
        .filter(Boolean)
        .join("；") || undefined,
    }, 201, requestId);
  } catch (error) {
    const code = error instanceof FeishuApiError ? error.code : "FEISHU_WEEKLY_REMINDER_FAILED";
    const reminderLogResult = await persistRiskRetrospectiveGovernanceReminderLogs({
      reminders: reminderSuppression.reminders,
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
        reminder_count: reminderSuppression.reminders.length,
        suppressed_this_week: reminderSuppression.summary.suppressedThisWeek,
        code,
        reminder_log_status: reminderLogResult.status,
      },
      requestId,
    });
    console.error(JSON.stringify({ level: "error", event: "risk.retrospective_governance.weekly_reminder_failed", request_id: requestId, code }));
    return jsonResponse({
      request_id: requestId,
      status: "failed",
      draft: { ...draft, message },
      reminder_suppression: reminderSuppression,
      warning: `发送飞书提醒失败：${code}`,
    }, 502, requestId);
  }
}
