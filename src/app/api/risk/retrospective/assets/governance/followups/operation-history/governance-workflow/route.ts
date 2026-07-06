import { getCurrentUser } from "@/features/auth/server";
import { syncGovernanceEventToFeishu } from "@/features/governance/feishu-sync";
import {
  createGovernanceInstance,
  listGovernanceInstances,
  type GovernanceCreateInput,
} from "@/features/governance/repository";
import { writeIntegrationSyncLog } from "@/features/operating-system/sync-logs";
import {
  buildKnowledgeGovernanceWorkflowCandidate,
  type KnowledgeGovernanceWorkflowCandidateOverride,
} from "@/features/risk/retrospective-governance-workflow-candidate";
import { getRiskRetrospectiveGovernanceReminderLog } from "@/features/risk/retrospective-governance-operations";
import { writeOperationAudit } from "@/features/security/repository";

export const runtime = "nodejs";

type Body = {
  id?: string;
  confirm?: boolean;
  candidate?: KnowledgeGovernanceWorkflowCandidateOverride;
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

function candidateToGovernanceInput(candidate: ReturnType<typeof buildKnowledgeGovernanceWorkflowCandidate>): GovernanceCreateInput {
  return {
    workflowId: candidate.workflowId,
    projectName: candidate.projectName,
    title: candidate.title,
    triggerSummary: candidate.triggerSummary,
    inputSummary: candidate.inputSummary,
    owner: candidate.owner,
    approver: candidate.approver,
    priority: candidate.priority,
    deadline: candidate.deadline,
    actionItems: candidate.actionItems,
    strategyVersion: candidate.strategyVersion,
    strategyRuleId: candidate.strategyRuleId,
    strategySummary: candidate.strategySummary,
    sourceType: candidate.sourceType,
    sourceId: candidate.sourceId,
    sourceLinkId: candidate.sourceLinkId || undefined,
    sourceSummary: candidate.sourceSummary,
  };
}

export async function POST(request: Request): Promise<Response> {
  const requestId = crypto.randomUUID();
  const user = await getCurrentUser();
  if (process.env.AUTH_REQUIRED === "true" && !user) {
    return jsonResponse({ request_id: requestId, status: "unauthorized", warning: "请先登录后再将知识治理升级转为治理流程。" }, 401, requestId);
  }

  let body: Body;
  try {
    body = await request.json() as Body;
  } catch {
    return jsonResponse({ request_id: requestId, status: "failed", warning: "请求 JSON 格式错误。" }, 400, requestId);
  }
  if (!body.id) {
    return jsonResponse({ request_id: requestId, status: "failed", warning: "请提供知识治理运营提醒日志 ID。" }, 400, requestId);
  }

  const reminder = await getRiskRetrospectiveGovernanceReminderLog(body.id);
  if (reminder.status !== "succeeded") {
    return jsonResponse({ request_id: requestId, ...reminder }, statusCode(reminder.status), requestId);
  }
  if (reminder.log.status !== "escalated") {
    return jsonResponse({
      request_id: requestId,
      status: "failed",
      warning: "只有已升级的知识治理运营提醒才能转为治理流程。",
      reminder_log: reminder.log,
    }, 400, requestId);
  }

  const candidate = buildKnowledgeGovernanceWorkflowCandidate(reminder.log, body.candidate ?? {});
  if (body.confirm !== true) {
    return jsonResponse({
      request_id: requestId,
      status: "confirmation_required",
      confirmation_required: true,
      candidate,
      reminder_log: reminder.log,
      boundary: candidate.boundary,
    }, 200, requestId);
  }

  const existing = await listGovernanceInstances(100);
  if (existing.status === "succeeded") {
    const duplicate = existing.instances.find(instance =>
      instance.workflowId === candidate.workflowId
      && instance.projectName === candidate.projectName
      && instance.title === candidate.title
      && !instance.closedAt
    );
    if (duplicate) {
      return jsonResponse({
        request_id: requestId,
        status: "succeeded",
        duplicate_skipped: true,
        instance: duplicate,
        candidate,
        warning: "已存在相同标题、项目和流程类型的未关闭治理流程，本次未重复创建。",
      }, 200, requestId);
    }
  }

  const result = await createGovernanceInstance(candidateToGovernanceInput(candidate), user);
  let feishu_sync: Awaited<ReturnType<typeof syncGovernanceEventToFeishu>> = { status: "skipped", reason: "流程未创建，跳过飞书回写。" };
  if (result.status === "succeeded" && result.instance) {
    feishu_sync = await syncGovernanceEventToFeishu({ instance: result.instance, requestId });
    await writeIntegrationSyncLog({
      userId: user?.id,
      source: "system",
      eventType: "governance_workflow_created_from_knowledge_governance",
      status: "succeeded",
      severity: result.instance.priority === "high" ? "medium" : "low",
      summary: `知识治理升级已转治理流程：${result.instance.workflowName} / ${result.instance.projectName} / ${result.instance.state}`,
      detail: { reminder_log_id: reminder.log.id, source_followup_id: reminder.log.sourceFollowupId, instance_id: result.instance.id, feishu_sync, business_impact: result.businessImpact },
      requestId,
    });
    await writeOperationAudit({
      user,
      action: "risk_retrospective_governance_reminder_to_workflow",
      resourceType: "risk_retrospective_governance_reminder_log",
      resourceId: reminder.log.id,
      status: "succeeded",
      severity: result.instance.priority === "high" ? "medium" : "low",
      summary: `知识治理运营提醒已转为治理流程：${result.instance.title}`,
      detail: { candidate, instance_id: result.instance.id, feishu_sync },
      requestId,
    });
  }

  return jsonResponse({
    request_id: requestId,
    ...result,
    candidate,
    reminder_log: reminder.log,
    feishu_sync,
  }, result.status === "succeeded" ? 201 : statusCode(result.status), requestId);
}
