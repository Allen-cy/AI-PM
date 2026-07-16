import { getCurrentUser } from "../../../../../../../../features/auth/server.ts";
import {
  buildFeishuConfirmationRiskReview,
  canManageFeishuActionConfirmation,
  getFeishuActionConfirmation,
  updateFeishuActionConfirmationStatus,
} from "../../../../../../../../features/feishu/action-confirmations.ts";
import { executeFeishuAction } from "../../../../../../../../features/feishu/action-payload.ts";
import { FeishuApiError, FeishuBaseClient } from "../../../../../../../../features/feishu/client.ts";
import { getUserFeishuConfig, larkCliHint } from "../../../../../../../../features/feishu/user-config.ts";
import { executeBusinessUpdateWriteback } from "../../../../../../../../features/operating-assistant/writeback.ts";
import { executeDataClassificationWriteback } from "../../../../../../../../features/feishu/classification-writeback-executor.ts";
import { writeIntegrationSyncLog } from "../../../../../../../../features/operating-system/sync-logs.ts";
import { writeOperationAudit } from "../../../../../../../../features/security/repository.ts";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

function json(body: unknown, status = 200, requestId = crypto.randomUUID()) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store", "X-Request-Id": requestId },
  });
}

async function readConfirm(request: Request): Promise<{ confirm: boolean; riskAcknowledged: boolean }> {
  try {
    const body = await request.json() as { confirm?: unknown; riskAcknowledged?: unknown; risk_acknowledged?: unknown };
    return {
      confirm: body.confirm === true,
      riskAcknowledged: body.riskAcknowledged === true || body.risk_acknowledged === true,
    };
  } catch {
    return { confirm: false, riskAcknowledged: false };
  }
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  const requestId = crypto.randomUUID();
  const user = await getCurrentUser();
  if (!user) return json({ request_id: requestId, status: "unauthorized", warning: "请先登录后确认飞书写入。" }, 401, requestId);
  const confirmRequest = await readConfirm(request);
  if (!confirmRequest.confirm) return json({ request_id: requestId, status: "failed", warning: "执行飞书写入前必须显式传入 confirm=true。" }, 400, requestId);

  const { id } = await context.params;
  const loaded = await getFeishuActionConfirmation(id);
  if (loaded.status !== "succeeded") {
    const httpStatus = loaded.status === "not_configured" ? 503 : loaded.status === "not_found" ? 404 : 500;
    return json({ request_id: requestId, ...loaded }, httpStatus, requestId);
  }
  const confirmation = loaded.confirmation;
  if (!canManageFeishuActionConfirmation(user, confirmation)) {
    return json({ request_id: requestId, status: "forbidden", warning: "你无权确认该飞书写入动作。" }, 403, requestId);
  }
  if (confirmation.status === "succeeded" || confirmation.status === "cancelled") {
    return json({ request_id: requestId, status: "conflict", warning: `当前状态为 ${confirmation.status}，不能重复确认。`, confirmation }, 409, requestId);
  }
  const riskReview = buildFeishuConfirmationRiskReview(confirmation, { user });
  if (!riskReview.canConfirm) {
    return json({
      request_id: requestId,
      status: "risk_review_blocked",
      warning: riskReview.blockingIssues[0] || "风险复核未通过，不能确认执行。",
      confirmation,
      riskReview,
    }, 409, requestId);
  }
  if (riskReview.requiresSecondConfirm && !confirmRequest.riskAcknowledged) {
    return json({
      request_id: requestId,
      status: "risk_acknowledgement_required",
      warning: "该飞书写入包含高风险、逾期或失败重试提示，执行前必须完成风险复核并传入 riskAcknowledged=true。",
      confirmation,
      riskReview,
    }, 428, requestId);
  }

  if (confirmation.actionType === "base_record_update") {
    const classificationWriteback = typeof confirmation.payload.classification_draft_id === "string";
    const executed = classificationWriteback
      ? await executeDataClassificationWriteback({ confirmation, actor: user })
      : await executeBusinessUpdateWriteback({ confirmation, actor: user });
    const refreshed = await getFeishuActionConfirmation(id);
    const effectiveConfirmation = refreshed.status === "succeeded" ? refreshed.confirmation : confirmation;
    const succeeded = executed.status === "succeeded" || executed.status === "duplicate";
    await writeOperationAudit({
      user,
      action: classificationWriteback ? "data_classification_base_confirmation_execute" : "business_update_base_confirmation_execute",
      resourceType: "feishu_action_confirmation",
      resourceId: id,
      status: succeeded ? "succeeded" : "failed",
      severity: "high",
      summary: succeeded ? `已人工确认并执行Base记录更新：${confirmation.targetSummary}` : `Base记录更新未执行：${confirmation.targetSummary}`,
      detail: { action_type: confirmation.actionType, feishu_source: executed.feishuSource, error_code: executed.errorCode, data_class: confirmation.payload.data_class, business_update_draft_id: confirmation.payload.business_update_draft_id, classification_draft_id: confirmation.payload.classification_draft_id },
      requestId,
    });
    await writeIntegrationSyncLog({
      userId: user.id,
      source: "feishu",
      eventType: classificationWriteback ? "data_classification_base_record_update" : "business_update_base_record_update",
      status: succeeded ? "succeeded" : "failed",
      severity: "high",
      summary: succeeded ? `飞书Base业务记录已经二次确认更新：${confirmation.targetSummary}` : `飞书Base业务记录写回被阻断：${confirmation.targetSummary}`,
      detail: { confirmation_id: id, business_update_draft_id: confirmation.payload.business_update_draft_id, classification_draft_id: confirmation.payload.classification_draft_id, data_class: confirmation.payload.data_class, error_code: executed.errorCode, resource: executed.resource },
      remediation: succeeded ? undefined : executed.warning ?? "刷新当前事实，检查申请人角色权限、个人飞书配置和数据空间后重试。",
      requestId,
    });
    const httpStatus = executed.status === "succeeded" ? 201
      : executed.status === "duplicate" ? 200
        : executed.status === "forbidden" ? 403
          : executed.status === "not_configured" ? 503
            : executed.status === "conflict" ? 409 : 502;
    return json({
      request_id: requestId,
      status: executed.status,
      warning: executed.warning,
      confirmation: effectiveConfirmation,
      draft: executed.draft,
      resource: executed.resource,
      riskReview,
      boundary: succeeded ? "Base记录只在二次人工确认、当前事实复核、权限复核和同步流水占位后更新。" : "本次未将队列失败伪装成业务写回成功。",
    }, httpStatus, requestId);
  }

  const require_personal_feishu = true;
  const executor_user_id = user.id;
  const personalFeishuConfig = await getUserFeishuConfig(executor_user_id);
  const effectiveFeishu = { config: personalFeishuConfig, source: "user" as const, larkCliHint };
  if (!effectiveFeishu.config) {
    return json({
      request_id: requestId,
      status: "not_configured",
      confirmation,
      riskReview,
      warning: require_personal_feishu ? "消息、任务、文档和业务写回必须使用确认人的个人飞书接入。请先在用户中心完成配置；系统不会回退到管理员身份。" : "个人飞书配置缺失。",
      lark_cli_hint: effectiveFeishu.larkCliHint,
    }, 503, requestId);
  }
  if (!effectiveFeishu.config.tables.syncLedger) {
    return json({
      request_id: requestId,
      status: "not_configured",
      confirmation,
      riskReview,
      warning: "当前飞书配置缺少同步流水表，无法安全执行通用写入动作。",
      remediation: "请在用户中心的个人飞书表映射中配置同步流水表，并确保字段使用中文描述。",
    }, 503, requestId);
  }

  const confirmed = await updateFeishuActionConfirmationStatus({ id, status: "confirmed" });
  if (confirmed.status !== "succeeded") {
    const httpStatus = confirmed.status === "not_configured" ? 503 : 500;
    return json({ request_id: requestId, ...confirmed }, httpStatus, requestId);
  }
  const writing = await updateFeishuActionConfirmationStatus({ id, status: "writing" });
  if (writing.status !== "succeeded") {
    const httpStatus = writing.status === "not_configured" ? 503 : 500;
    return json({ request_id: requestId, ...writing }, httpStatus, requestId);
  }

  const ledger = new FeishuBaseClient(effectiveFeishu.config);
  let ledgerRecordId: string | undefined;
  try {
    const claim = await ledger.claimEvent({
      eventId: `action-confirmation:${confirmation.id}`,
      eventType: `action.${confirmation.actionType}`,
      payload: confirmation.payload,
      occurredAt: Date.now(),
    });
    ledgerRecordId = claim.recordId;
    if (!claim.claimed) {
      const duplicate = await updateFeishuActionConfirmationStatus({
        id,
        status: "succeeded",
        resource: { duplicate: true, ledgerRecordId },
      });
      return json({ request_id: requestId, status: "duplicate", confirmation: duplicate.status === "succeeded" ? duplicate.confirmation : confirmation, riskReview }, 200, requestId);
    }

    const resource = await executeFeishuAction(effectiveFeishu.config, confirmation.payload);
    await ledger.completeEvent(ledgerRecordId);
    const completed = await updateFeishuActionConfirmationStatus({
      id,
      status: "succeeded",
      resource: { actionResource: resource, ledgerRecordId, feishuSource: effectiveFeishu.source },
    });
    await writeOperationAudit({
      user,
      action: "feishu_action_confirmation_execute",
      resourceType: "feishu_action_confirmation",
      resourceId: id,
      status: "succeeded",
      severity: confirmation.riskLevel === "high" ? "high" : "medium",
      summary: `已确认并执行飞书写入：${confirmation.targetSummary}`,
      detail: { action_type: confirmation.actionType, feishu_source: effectiveFeishu.source, ledger_record_id: ledgerRecordId },
      requestId,
    });
    await writeIntegrationSyncLog({
      userId: user.id,
      source: "feishu",
      eventType: "action_confirmation_execute",
      status: "succeeded",
      severity: "medium",
      summary: `飞书写入已确认执行：${confirmation.targetSummary}`,
      detail: { confirmation_id: id, action_type: confirmation.actionType, feishu_source: effectiveFeishu.source, executor_user_id },
      requestId,
    });
    return json({ request_id: requestId, status: "succeeded", confirmation: completed.status === "succeeded" ? completed.confirmation : confirmation, riskReview, resource }, 201, requestId);
  } catch (error) {
    const code = error instanceof FeishuApiError ? error.code : "FEISHU_ACTION_CONFIRMATION_EXECUTE_FAILED";
    if (ledgerRecordId) {
      try {
        await ledger.failEvent(ledgerRecordId, code);
      } catch {
        console.error(JSON.stringify({ level: "error", event: "feishu.action_confirmation.ledger_fail", request_id: requestId, code }));
      }
    }
    const failed = await updateFeishuActionConfirmationStatus({ id, status: "failed", errorCode: code });
    await writeOperationAudit({
      user,
      action: "feishu_action_confirmation_execute",
      resourceType: "feishu_action_confirmation",
      resourceId: id,
      status: "failed",
      severity: "medium",
      summary: `飞书写入确认执行失败：${confirmation.targetSummary}`,
      detail: { action_type: confirmation.actionType, code, feishu_source: effectiveFeishu.source },
      requestId,
    });
    await writeIntegrationSyncLog({
      userId: user.id,
      source: "feishu",
      eventType: "action_confirmation_execute",
      status: "failed",
      severity: "medium",
      summary: `飞书写入确认执行失败：${confirmation.targetSummary}`,
      detail: { confirmation_id: id, action_type: confirmation.actionType, code, feishu_source: effectiveFeishu.source },
      remediation: "检查个人飞书配置、同步流水表字段、目标动作权限后重试。",
      requestId,
    });
    console.error(JSON.stringify({ level: "error", event: "feishu.action_confirmation.failed", request_id: requestId, code }));
    return json({ request_id: requestId, status: "failed", warning: `飞书写入失败：${code}`, confirmation: failed.status === "succeeded" ? failed.confirmation : confirmation, riskReview }, 502, requestId);
  }
}
