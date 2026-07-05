import { getCurrentUser } from "@/features/auth/server";
import { FeishuActionClient } from "@/features/feishu/actions";
import { FeishuApiError } from "@/features/feishu/client";
import { getEffectiveFeishuConfig } from "@/features/feishu/user-config";
import {
  getRiskRetrospectiveGovernanceFollowup,
  updateRiskRetrospectiveGovernanceFollowupFeishuSync,
  type RiskRetrospectiveGovernanceFollowupRecord,
} from "@/features/risk/retrospective-governance-followups";
import { writeOperationAudit } from "@/features/security/repository";

export const runtime = "nodejs";

type FeishuSyncBody = {
  id?: string;
  mode?: "prepare" | "confirm";
  confirm?: boolean;
};

function jsonResponse(body: unknown, status = 200, requestId = crypto.randomUUID()) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store", "X-Request-Id": requestId },
  });
}

function dueAtFromDate(value: string): number | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const parsed = Date.parse(`${value}T23:59:00+08:00`);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function buildTaskDescription(followup: RiskRetrospectiveGovernanceFollowupRecord): string {
  return [
    `资产：${followup.assetTitle}`,
    `优先级：${followup.priority === "high" ? "高" : followup.priority === "medium" ? "中" : "低"}`,
    `责任人：${followup.ownerName}`,
    `截止日期：${followup.dueDate}`,
    "",
    `原因：${followup.reason}`,
    `复核动作：${followup.actionRequired}`,
    `关闭标准：${followup.closingCriteria}`,
    "",
    "说明：系统内风险复盘二次治理待办为主记录，飞书任务仅作为协同提醒与执行跟踪。",
  ].join("\n");
}

async function auditSync(input: {
  user: Awaited<ReturnType<typeof getCurrentUser>>;
  action: string;
  resourceId: string;
  status: "succeeded" | "failed";
  summary: string;
  detail: Record<string, unknown>;
  requestId: string;
}) {
  await writeOperationAudit({
    user: input.user,
    action: input.action,
    resourceType: "risk_retrospective_governance_followup",
    resourceId: input.resourceId,
    status: input.status,
    severity: input.status === "failed" ? "medium" : "low",
    summary: input.summary,
    detail: input.detail,
    requestId: input.requestId,
  });
}

export async function POST(request: Request): Promise<Response> {
  const requestId = crypto.randomUUID();
  const user = await getCurrentUser();
  if (process.env.AUTH_REQUIRED === "true" && !user) {
    return jsonResponse({ request_id: requestId, status: "unauthorized", warning: "请先登录后再同步飞书任务。" }, 401, requestId);
  }

  let body: FeishuSyncBody;
  try {
    body = await request.json() as FeishuSyncBody;
  } catch {
    return jsonResponse({ request_id: requestId, status: "failed", warning: "请求 JSON 格式错误。" }, 400, requestId);
  }
  if (!body.id) {
    return jsonResponse({ request_id: requestId, status: "failed", warning: "缺少二次治理待办 ID。" }, 400, requestId);
  }
  const mode = body.mode ?? "prepare";
  if (mode !== "prepare" && mode !== "confirm") {
    return jsonResponse({ request_id: requestId, status: "failed", warning: "飞书同步动作不合法。" }, 400, requestId);
  }

  const current = await getRiskRetrospectiveGovernanceFollowup(body.id);
  if (current.status !== "succeeded") {
    const httpStatus = current.status === "not_configured" ? 503 : current.status === "not_found" ? 404 : 400;
    return jsonResponse({ request_id: requestId, ...current }, httpStatus, requestId);
  }

  if (mode === "prepare") {
    const result = await updateRiskRetrospectiveGovernanceFollowupFeishuSync({
      id: body.id,
      status: "待确认",
      requestId,
    });
    if (result.status === "succeeded") {
      await auditSync({
        user,
        action: "risk_retrospective_governance_followup_feishu_prepare",
        resourceId: result.followup.id,
        status: "succeeded",
        summary: `风险复盘二次治理待办进入飞书任务待确认：${result.followup.assetTitle}`,
        detail: { followup_id: result.followup.id, feishu_sync_status: result.followup.feishuSyncStatus },
        requestId,
      });
    }
    const httpStatus = result.status === "succeeded" ? 200 : result.status === "not_configured" ? 503 : result.status === "not_found" ? 404 : 400;
    return jsonResponse({ request_id: requestId, ...result }, httpStatus, requestId);
  }

  if (body.confirm !== true) {
    return jsonResponse({ request_id: requestId, status: "failed", warning: "写入飞书任务前必须显式确认。" }, 400, requestId);
  }

  const effectiveFeishu = await getEffectiveFeishuConfig();
  if (!effectiveFeishu.config) {
    const failed = await updateRiskRetrospectiveGovernanceFollowupFeishuSync({
      id: body.id,
      status: "同步失败",
      error: effectiveFeishu.setupHint || "飞书接入未配置。",
      requestId,
    });
    if (failed.status === "succeeded") {
      await auditSync({
        user,
        action: "risk_retrospective_governance_followup_feishu_sync",
        resourceId: failed.followup.id,
        status: "failed",
        summary: `风险复盘二次治理待办写入飞书任务失败：${failed.followup.assetTitle}`,
        detail: { followup_id: failed.followup.id, reason: "feishu_not_configured", source: effectiveFeishu.source },
        requestId,
      });
    }
    return jsonResponse({
      request_id: requestId,
      status: "not_configured",
      followup: failed.status === "succeeded" ? failed.followup : current.followup,
      warning: effectiveFeishu.setupHint || "飞书接入未配置，请先在用户中心配置个人飞书或联系管理员配置全局飞书。",
      lark_cli_hint: effectiveFeishu.larkCliHint,
    }, 503, requestId);
  }

  const running = await updateRiskRetrospectiveGovernanceFollowupFeishuSync({
    id: body.id,
    status: "同步中",
    requestId,
  });
  if (running.status !== "succeeded") {
    const httpStatus = running.status === "not_configured" ? 503 : running.status === "not_found" ? 404 : 400;
    return jsonResponse({ request_id: requestId, ...running }, httpStatus, requestId);
  }

  try {
    const client = new FeishuActionClient(effectiveFeishu.config);
    const resource = await client.createTask({
      summary: `[AI-PMO知识治理] ${current.followup.assetTitle}`,
      description: buildTaskDescription(current.followup),
      dueAt: dueAtFromDate(current.followup.dueDate),
      isAllDay: true,
      idempotencyKey: `risk-retro-governance-followup-${current.followup.id}`,
    });
    const result = await updateRiskRetrospectiveGovernanceFollowupFeishuSync({
      id: body.id,
      status: "已同步",
      taskGuid: resource.taskGuid,
      taskUrl: resource.url ?? null,
      requestId,
    });
    if (result.status !== "succeeded") {
      const httpStatus = result.status === "not_configured" ? 503 : result.status === "not_found" ? 404 : 400;
      return jsonResponse({ request_id: requestId, ...result }, httpStatus, requestId);
    }
    await auditSync({
      user,
      action: "risk_retrospective_governance_followup_feishu_sync",
      resourceId: result.followup.id,
      status: "succeeded",
      summary: `风险复盘二次治理待办已写入飞书任务：${result.followup.assetTitle}`,
      detail: {
        followup_id: result.followup.id,
        feishu_task_guid: resource.taskGuid,
        feishu_source: effectiveFeishu.source,
      },
      requestId,
    });
    return jsonResponse({ request_id: requestId, status: "succeeded", followup: result.followup, resource }, 201, requestId);
  } catch (error) {
    const code = error instanceof FeishuApiError ? error.code : "FEISHU_TASK_SYNC_FAILED";
    const failed = await updateRiskRetrospectiveGovernanceFollowupFeishuSync({
      id: body.id,
      status: "同步失败",
      error: code,
      requestId,
    });
    if (failed.status === "succeeded") {
      await auditSync({
        user,
        action: "risk_retrospective_governance_followup_feishu_sync",
        resourceId: failed.followup.id,
        status: "failed",
        summary: `风险复盘二次治理待办写入飞书任务失败：${failed.followup.assetTitle}`,
        detail: { followup_id: failed.followup.id, code, feishu_source: effectiveFeishu.source },
        requestId,
      });
    }
    console.error(JSON.stringify({ level: "error", event: "risk.retrospective_governance.followup_feishu_task_sync_failed", request_id: requestId, code }));
    return jsonResponse({
      request_id: requestId,
      status: "failed",
      followup: failed.status === "succeeded" ? failed.followup : current.followup,
      warning: `写入飞书任务失败：${code}`,
    }, 502, requestId);
  }
}
