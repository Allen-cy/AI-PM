import { getCurrentUser } from "@/features/auth/server";
import { loadDashboardFromFeishu } from "@/features/dashboard/feishu";
import { getEffectiveFeishuConfig } from "@/features/feishu/user-config";
import { syncGovernanceEventToFeishu } from "@/features/governance/feishu-sync";
import { createGovernanceInstance, listGovernanceInstances } from "@/features/governance/repository";
import { createUnifiedAction, listIssueChangeChain } from "@/features/issue-change/repository";
import { writeIntegrationSyncLog } from "@/features/operating-system/sync-logs";
import { buildRiskEscalationDraftDashboard, type RiskEscalationDraftType } from "@/features/risk/escalation";
import { buildRiskIntegrationDashboard } from "@/features/risk/integration";
import { filterDashboardByProjectAccess, projectAccessMode } from "@/features/security/authorization";
import { loadProjectAccessGrantsForUser } from "@/features/security/repository";
import { listRisks } from "@/lib/risk-repository";

export const runtime = "nodejs";

type ConfirmBody = {
  draftId?: string;
  draftType?: RiskEscalationDraftType;
  confirm?: boolean;
};

function jsonResponse(body: unknown, status = 200, requestId = crypto.randomUUID()) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store", "X-Request-Id": requestId },
  });
}

function statusCode(status?: string): number {
  if (status === "succeeded" || status === "already_exists") return 200;
  if (status === "not_configured") return 503;
  if (status === "not_found") return 404;
  if (status === "unauthorized") return 401;
  return 400;
}

async function loadDraftDashboard() {
  const user = await getCurrentUser();
  const riskResult = await listRisks().catch(() => null);
  if (!riskResult) {
    return { status: "failed" as const, code: "RISK_REGISTER_LOAD_FAILED", warning: "风险登记册读取失败，未使用样例风险兜底。", user };
  }
  const effective = await getEffectiveFeishuConfig();
  if (!effective.config) {
    return { status: "not_configured" as const, code: "FEISHU_DASHBOARD_NOT_CONFIGURED", warning: effective.setupHint || "飞书项目台账未配置。", larkCliHint: effective.larkCliHint, user };
  }
  let rawDashboard;
  try {
    rawDashboard = await loadDashboardFromFeishu(effective.config);
  } catch (error) {
    return { status: "failed" as const, code: "FEISHU_DASHBOARD_LOAD_FAILED", warning: error instanceof Error ? error.message : "飞书项目台账读取失败。", user };
  }
  const grants = await loadProjectAccessGrantsForUser(effective.user ?? user);
  const dashboard = filterDashboardByProjectAccess(rawDashboard, effective.user ?? user, grants);
  const riskIntegration = buildRiskIntegrationDashboard({
    risks: riskResult.risks,
    dashboard,
  });
  const riskEscalation = buildRiskEscalationDraftDashboard({ riskIntegration });

  return {
    status: "succeeded" as const,
    user,
    riskResult,
    effective,
    rawDashboard,
    dashboard,
    access: {
      mode: projectAccessMode(effective.user ?? user, dashboard.records.length, rawDashboard.records.length),
      visible_projects: dashboard.records.length,
      total_projects: rawDashboard.records.length,
      explicit_grants: grants.length,
    },
    riskIntegration,
    riskEscalation,
  };
}

export async function GET(): Promise<Response> {
  const requestId = crypto.randomUUID();
  const loaded = await loadDraftDashboard();
  if (loaded.status !== "succeeded") {
    return jsonResponse({ request_id: requestId, status: loaded.status, code: loaded.code, warning: loaded.warning, lark_cli_hint: loaded.larkCliHint }, loaded.status === "not_configured" ? 503 : 503, requestId);
  }

  return jsonResponse({
    request_id: requestId,
    status: "succeeded",
    risk_escalation: loaded.riskEscalation,
    source: {
      risk: loaded.riskResult.source,
      dashboard: "feishu",
    },
    warning: loaded.riskResult.warning,
    access: loaded.access,
  }, 200, requestId);
}

export async function POST(request: Request): Promise<Response> {
  const requestId = crypto.randomUUID();
  const user = await getCurrentUser();
  if (process.env.AUTH_REQUIRED === "true" && !user) {
    return jsonResponse({ request_id: requestId, status: "unauthorized", warning: "请先登录后再确认风险升级草稿。" }, 401, requestId);
  }

  let body: ConfirmBody;
  try {
    body = await request.json() as ConfirmBody;
  } catch {
    return jsonResponse({ request_id: requestId, status: "failed", warning: "请求 JSON 格式错误。" }, 400, requestId);
  }
  if (body.confirm !== true) {
    return jsonResponse({
      request_id: requestId,
      status: "failed",
      warning: "风险升级草稿必须由用户显式确认后才会创建治理流程或行动项。",
    }, 400, requestId);
  }

  const loaded = await loadDraftDashboard();
  if (loaded.status !== "succeeded") {
    return jsonResponse({ request_id: requestId, status: loaded.status, code: loaded.code, warning: loaded.warning, lark_cli_hint: loaded.larkCliHint }, loaded.status === "not_configured" ? 503 : 503, requestId);
  }
  const governanceDraft = loaded.riskEscalation.governanceDrafts.find(draft => draft.id === body.draftId);
  const actionDraft = loaded.riskEscalation.actionDrafts.find(draft => draft.id === body.draftId);
  if (body.draftType === "governance_workflow" && governanceDraft) {
    const existing = await listGovernanceInstances(100);
    const existingInstance = existing.status === "succeeded"
      ? existing.instances.find(instance => instance.workflowId === governanceDraft.workflowId && instance.projectName === governanceDraft.projectName && instance.title === governanceDraft.title)
      : null;
    if (existingInstance) {
      return jsonResponse({
        request_id: requestId,
        status: "already_exists",
        draft: governanceDraft,
        instance: existingInstance,
        warning: "同名风险升级治理流程已存在，未重复创建。",
      }, 200, requestId);
    }

    const result = await createGovernanceInstance(governanceDraft.createInput, user);
    let feishu_sync: Awaited<ReturnType<typeof syncGovernanceEventToFeishu>> = { status: "skipped", reason: "流程未创建，跳过飞书回写。" };
    if (result.status === "succeeded" && result.instance) {
      feishu_sync = await syncGovernanceEventToFeishu({ instance: result.instance, requestId });
      await writeIntegrationSyncLog({
        userId: user?.id,
        source: "system",
        eventType: "risk_escalation_governance_confirmed",
        status: "succeeded",
        severity: result.instance.priority === "high" ? "medium" : "low",
        summary: `风险升级治理流程已确认创建：${result.instance.projectName} / ${result.instance.title}`,
        detail: { draft_id: governanceDraft.id, risk_id: governanceDraft.riskId, instance_id: result.instance.id, feishu_sync },
        requestId,
      });
    }
    return jsonResponse({ request_id: requestId, draft: governanceDraft, ...result, feishu_sync }, statusCode(result.status), requestId);
  }

  if (body.draftType === "unified_action" && actionDraft) {
    const existing = await listIssueChangeChain(120);
    const existingAction = existing.status === "succeeded"
      ? existing.actions.find(action => action.sourceType === "risk" && action.sourceId === actionDraft.riskId && action.projectName === actionDraft.projectName && action.title === actionDraft.title && !["done", "cancelled"].includes(action.status))
      : null;
    if (existingAction) {
      return jsonResponse({
        request_id: requestId,
        status: "already_exists",
        draft: actionDraft,
        action: existingAction,
        warning: "同名风险行动项已存在，未重复创建。",
      }, 200, requestId);
    }

    const result = await createUnifiedAction(actionDraft.createInput, user);
    if (result.status === "succeeded" && result.action) {
      await writeIntegrationSyncLog({
        userId: user?.id,
        source: "system",
        eventType: "risk_escalation_action_confirmed",
        status: "succeeded",
        severity: actionDraft.priority === "P0" ? "medium" : "low",
        summary: `风险升级行动项已确认创建：${actionDraft.projectName} / ${actionDraft.title}`,
        detail: { draft_id: actionDraft.id, risk_id: actionDraft.riskId, action_id: result.action.id },
        requestId,
      });
    }
    return jsonResponse({ request_id: requestId, draft: actionDraft, ...result }, statusCode(result.status), requestId);
  }

  return jsonResponse({ request_id: requestId, status: "not_found", warning: "未找到对应的风险升级草稿，请刷新后重试。" }, 404, requestId);
}
