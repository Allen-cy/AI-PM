import { createHash } from "node:crypto";
import { getAuthSupabase, requireAuthenticatedApiUser } from "@/features/auth/server";
import { parseProjectControlWriteContract } from "@/features/project-control/contracts";
import { listIssueChangeChain } from "@/features/issue-change/repository";
import { deriveChangeNextStatus, deriveIssueNextStatus, parseUnifiedActionItems, riskToIssueDraft, type ChangeAction, type ChangeStatus, type IssueAction, type IssueStatus } from "@/features/issue-change/model";
import { writeIntegrationSyncLog } from "@/features/operating-system/sync-logs";
import { authorizeRiskRequest, type RiskAccessOperation } from "@/features/risk/access";
import { listRisks } from "@/lib/risk-repository";
import type { Risk } from "@/lib/risk";

export const runtime = "nodejs";
type Body = Record<string, unknown> & { operation?: string };

function response(body: unknown, status = 200, requestId = crypto.randomUUID()) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store", "X-Request-Id": requestId } });
}
function text(value: unknown) { return String(value ?? "").trim(); }
function requestHash(value: unknown) { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function snakePayload(body: Body, projectName: string): Record<string, unknown> {
  return {
    id: body.id,
    issue_id: body.issueId,
    issue_code: body.issueCode,
    project_name: projectName,
    source_risk_id: body.sourceRiskId,
    source_risk_code: body.sourceRiskCode,
    title: body.title,
    description: body.description,
    severity: body.severity,
    owner: body.owner,
    due_date: body.dueDate,
    impact_scope: body.impactScope,
    evidence: body.evidence,
    change_code: body.changeCode,
    reason: body.reason,
    change_type: body.changeType,
    impact_cost: body.impactCost,
    impact_schedule_days: body.impactScheduleDays,
    impact_revenue: body.impactRevenue,
    impact_collection: body.impactCollection,
    approver: body.approver,
    decision_summary: body.decisionSummary,
    close_evidence: body.closeEvidence,
    source_type: body.sourceType,
    source_id: body.sourceId,
    priority: body.priority,
    comment: body.comment,
    metadata: { source_reason: body.sourceReason || null },
    action_items: parseUnifiedActionItems(body.actionItems),
  };
}
function operationAccessOperation(operation: unknown): RiskAccessOperation {
  const value = text(operation);
  return ["transition_issue", "transition_change", "close_action"].includes(value) ? "transition" : "create";
}

export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  const access = await authorizeRiskRequest(request, "read");
  if (!access.ok) return response({ request_id: requestId, status: "forbidden", warning: access.error, detail: access.detail }, access.status, requestId);
  const result = await listIssueChangeChain(access.scope);
  return response({ request_id: requestId, context: access.scope, data_class: access.scope.dataClass, ...result }, result.status === "succeeded" ? 200 : result.status === "not_configured" ? 503 : 500, requestId);
}

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  const user = await requireAuthenticatedApiUser();
  if (!user) return response({ request_id: requestId, status: "unauthorized", warning: "请先登录。" }, 401, requestId);
  let body: Body;
  try { body = await request.json() as Body; }
  catch { return response({ request_id: requestId, status: "failed", warning: "请求JSON格式错误。" }, 400, requestId); }

  let contract;
  try { contract = parseProjectControlWriteContract(body); }
  catch (error) { return response({ request_id: requestId, status: "failed", warning: error instanceof Error ? error.message : "项目控制写入契约错误。" }, 400, requestId); }
  const operation = text(body.operation);
  const accessOperation = operationAccessOperation(body.operation);
  const access = await authorizeRiskRequest(request, accessOperation);
  if (!access.ok) return response({ request_id: requestId, status: "forbidden", warning: access.error, detail: access.detail }, access.status, requestId);
  if (access.scope.orgId !== text(new URL(request.url).searchParams.get("org_id")) || access.scope.dataClass !== contract.dataClass || access.scope.businessRole !== contract.businessRole || access.scope.requestedProjectId !== contract.projectId) {
    return response({ request_id: requestId, status: "failed", warning: "PROJECT_CONTROL_SCOPE_MISMATCH" }, 409, requestId);
  }

  try {
    const projectQuery = await getAuthSupabase().from("projects").select("id,name").eq("org_id", access.scope.orgId).eq("id", contract.projectId).eq("data_class", contract.dataClass).maybeSingle();
    if (projectQuery.error || !projectQuery.data) throw new Error(projectQuery.error?.message || "PROJECT_NOT_FOUND");
    const payload = snakePayload(body, String(projectQuery.data.name));

    if (operation === "escalate_risk") {
      const risks = await listRisks(access.scope);
      const risk = risks.risks.find(item => item.id === text(body.riskId) || item.riskCode === text(body.riskId));
      if (!risk) throw new Error("RISK_NOT_FOUND");
      const draft = riskToIssueDraft(risk as Risk);
      Object.assign(payload, snakePayload(draft as unknown as Body, String(projectQuery.data.name)));
    } else if (operation === "transition_issue") {
      const current = await getAuthSupabase().from("project_issues").select("status").eq("org_id", access.scope.orgId).eq("project_id", contract.projectId).eq("data_class", contract.dataClass).eq("id", text(body.id)).maybeSingle();
      if (current.error || !current.data) throw new Error(current.error?.message || "ISSUE_NOT_FOUND");
      payload.new_status = deriveIssueNextStatus(String(current.data.status) as IssueStatus, text(body.action) as IssueAction);
    } else if (operation === "transition_change") {
      const current = await getAuthSupabase().from("project_changes").select("status").eq("org_id", access.scope.orgId).eq("project_id", contract.projectId).eq("data_class", contract.dataClass).eq("id", text(body.id)).maybeSingle();
      if (current.error || !current.data) throw new Error(current.error?.message || "CHANGE_NOT_FOUND");
      payload.new_status = deriveChangeNextStatus(String(current.data.status) as ChangeStatus, text(body.action) as ChangeAction);
    } else if (operation === "close_action") {
      payload.new_status = body.status || "done";
    }

    if (!["create_issue", "escalate_risk", "transition_issue", "create_change", "transition_change", "create_action", "close_action"].includes(operation)) throw new Error("PROJECT_CONTROL_OPERATION_INVALID");
    const { data, error } = await getAuthSupabase().rpc("apply_project_issue_change_action_tx", {
      p_org_id: access.scope.orgId,
      p_project_id: contract.projectId,
      p_data_class: contract.dataClass,
      p_operation: operation,
      p_idempotency_key: contract.idempotencyKey,
      p_expected_version: contract.expectedVersion,
      p_request_hash: requestHash({ operation, contract, payload }),
      p_actor_user_id: user.id,
      p_actor_name: user.name || user.email || user.phone || "系统",
      p_request_id: requestId,
      p_payload: payload,
    });
    if (error) throw new Error(error.message);
    await writeIntegrationSyncLog({ userId: user.id, source: "system", eventType: operation, status: "succeeded", severity: operation.includes("risk") || operation.includes("change") ? "medium" : "low", summary: `项目控制动作已完成：${operation}`, detail: { project_id: contract.projectId, data_class: contract.dataClass }, requestId });
    return response({ request_id: requestId, context: access.scope, data_class: access.scope.dataClass, ...(data as Record<string, unknown>) }, 200, requestId);
  } catch (error) {
    const warning = error instanceof Error ? error.message : "项目控制动作失败。";
    const conflict = warning.includes("CONFLICT") || warning.includes("ALREADY_RUNNING");
    return response({ request_id: requestId, status: "failed", warning }, conflict ? 409 : warning.includes("NOT_FOUND") ? 404 : 500, requestId);
  }
}
