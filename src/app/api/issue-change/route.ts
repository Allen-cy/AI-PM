import { requireAuthenticatedApiUser } from "@/features/auth/server";
import {
  closeUnifiedAction,
  createChange,
  createIssue,
  createIssueFromRisk,
  createUnifiedAction,
  listIssueChangeChain,
  transitionChange,
  transitionIssue,
  type ChangeTransitionInput,
  type CloseActionInput,
  type IssueTransitionInput,
} from "@/features/issue-change/repository";
import type { ChangeCreateInput, IssueCreateInput, UnifiedActionCreateInput } from "@/features/issue-change/model";
import { writeIntegrationSyncLog } from "@/features/operating-system/sync-logs";
import type { Risk } from "@/lib/risk";

export const runtime = "nodejs";

type OperationBody =
  | ({ operation: "create_issue" } & IssueCreateInput)
  | ({ operation: "escalate_risk"; riskId?: string; risk?: Risk; actionItems?: unknown })
  | ({ operation: "transition_issue" } & IssueTransitionInput)
  | ({ operation: "create_change" } & ChangeCreateInput)
  | ({ operation: "transition_change" } & ChangeTransitionInput)
  | ({ operation: "close_action" } & CloseActionInput)
  | ({ operation: "create_action" } & UnifiedActionCreateInput);

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

export async function GET(): Promise<Response> {
  const requestId = crypto.randomUUID();
  const user = await requireAuthenticatedApiUser();
  if (!user) return jsonResponse({ request_id: requestId, status: "unauthorized" }, 401, requestId);
  const result = await listIssueChangeChain();
  return jsonResponse({ request_id: requestId, ...result }, statusCode(result.status), requestId);
}

export async function POST(request: Request): Promise<Response> {
  const requestId = crypto.randomUUID();
  const user = await requireAuthenticatedApiUser();
  if (!user) {
    return jsonResponse({
      request_id: requestId,
      status: "unauthorized",
      warning: "请先登录后再处理问题、变更和行动项。",
    }, 401, requestId);
  }

  let body: OperationBody;
  try {
    body = await request.json() as OperationBody;
  } catch {
    return jsonResponse({ request_id: requestId, status: "failed", warning: "请求 JSON 格式错误。" }, 400, requestId);
  }

  let result:
    | Awaited<ReturnType<typeof createIssue>>
    | Awaited<ReturnType<typeof createIssueFromRisk>>
    | Awaited<ReturnType<typeof transitionIssue>>
    | Awaited<ReturnType<typeof createChange>>
    | Awaited<ReturnType<typeof transitionChange>>
    | Awaited<ReturnType<typeof closeUnifiedAction>>
    | Awaited<ReturnType<typeof createUnifiedAction>>;
  let eventType = "issue_change_operation";
  let summary = "P5链路动作已处理。";

  if (body.operation === "create_issue") {
    result = await createIssue(body, user);
    eventType = "issue_created";
    summary = result.status === "succeeded" && "issue" in result && result.issue
      ? `问题已创建：${result.issue.projectName} / ${result.issue.title}`
      : "问题创建失败。";
  } else if (body.operation === "escalate_risk") {
    result = await createIssueFromRisk({ riskId: body.riskId, risk: body.risk, actionItems: body.actionItems }, user);
    eventType = "risk_escalated_to_issue";
    summary = result.status === "succeeded" && "issue" in result && result.issue
      ? `风险已升级为问题：${result.issue.projectName} / ${result.issue.title}`
      : "风险升级为问题失败。";
  } else if (body.operation === "transition_issue") {
    result = await transitionIssue(body, user);
    eventType = "issue_transition";
    summary = result.status === "succeeded" && "issue" in result && result.issue
      ? `问题已流转：${result.issue.projectName} / ${result.issue.title} / ${result.issue.status}`
      : "问题流转失败。";
  } else if (body.operation === "create_change") {
    result = await createChange(body, user);
    eventType = "change_created";
    summary = result.status === "succeeded" && "change" in result && result.change
      ? `变更已创建：${result.change.projectName} / ${result.change.title}`
      : "变更创建失败。";
  } else if (body.operation === "transition_change") {
    result = await transitionChange(body, user);
    eventType = "change_transition";
    summary = result.status === "succeeded" && "change" in result && result.change
      ? `变更已流转：${result.change.projectName} / ${result.change.title} / ${result.change.status}`
      : "变更流转失败。";
  } else if (body.operation === "close_action") {
    result = await closeUnifiedAction(body, user);
    eventType = "action_closed";
    summary = result.status === "succeeded" && "action" in result && result.action
      ? `行动项已关闭：${result.action.title}`
      : "行动项关闭失败。";
  } else if (body.operation === "create_action") {
    result = await createUnifiedAction(body, user);
    eventType = "ai_suggestion_action_created";
    summary = result.status === "succeeded" && "action" in result && result.action
      ? `AI建议已转行动项：${result.action.title}`
      : "AI建议转行动项失败。";
  } else {
    return jsonResponse({ request_id: requestId, status: "failed", warning: "未知P5操作。" }, 400, requestId);
  }

  if (result.status === "succeeded") {
    await writeIntegrationSyncLog({
      userId: user?.id,
      source: "system",
      eventType,
      status: "succeeded",
      severity: eventType.includes("risk") || eventType.includes("change") ? "medium" : "low",
      summary,
      detail: { operation: body.operation, result_status: result.status },
      requestId,
    });
  }

  return jsonResponse({ request_id: requestId, ...result }, statusCode(result.status), requestId);
}
