import { getCurrentUser } from "@/features/auth/server";
import { syncGovernanceEventToFeishu } from "@/features/governance/feishu-sync";
import { buildGovernanceImpactDashboard, buildGovernanceImpactPackage } from "@/features/governance/impact";
import { listGovernanceStrategyCatalog } from "@/features/governance/strategy";
import {
  createGovernanceInstance,
  listGovernanceInstances,
  transitionGovernanceInstance,
  type GovernanceCreateInput,
  type GovernanceTransitionInput,
} from "@/features/governance/repository";
import { buildGovernanceSlaDashboard, deriveGovernanceSla } from "@/features/governance/sla";
import { writeIntegrationSyncLog } from "@/features/operating-system/sync-logs";
import { buildRiskRetrospectiveGovernanceOperationHistorySummary } from "@/features/risk/retrospective-governance-operation-analytics";
import { buildKnowledgeGovernanceWorkflowCandidate } from "@/features/risk/retrospective-governance-workflow-candidate";
import {
  listRiskRetrospectiveGovernanceOperationHistory,
} from "@/features/risk/retrospective-governance-operations";

export const runtime = "nodejs";

function jsonResponse(body: unknown, status = 200, requestId = crypto.randomUUID()) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store", "X-Request-Id": requestId },
  });
}

export async function GET(): Promise<Response> {
  const requestId = crypto.randomUUID();
  const user = await getCurrentUser();
  const result = await listGovernanceInstances();
  const operationHistory = await listRiskRetrospectiveGovernanceOperationHistory({ snapshotLimit: 8, reminderLimit: 80 });
  const governance_workbench = buildGovernanceSlaDashboard(result.instances, user);
  const governance_impact = buildGovernanceImpactDashboard(result.instances);
  const governance_strategy = listGovernanceStrategyCatalog();
  const governance_knowledge_operation = buildRiskRetrospectiveGovernanceOperationHistorySummary({
    snapshots: operationHistory.snapshots,
    reminderLogs: operationHistory.reminderLogs,
    warning: "warning" in operationHistory ? operationHistory.warning : undefined,
  });
  const governance_knowledge_workflow_candidates = operationHistory.reminderLogs
    .filter(log => log.status === "escalated")
    .map(log => buildKnowledgeGovernanceWorkflowCandidate(log))
    .slice(0, 6);
  return jsonResponse({
    request_id: requestId,
    ...result,
    instances: result.instances.map(instance => ({ ...instance, sla: deriveGovernanceSla(instance), businessImpact: buildGovernanceImpactPackage({ instance }) })),
    governance_workbench,
    governance_impact,
    governance_strategy,
    governance_knowledge_operation: {
      ...governance_knowledge_operation,
      workflowCandidates: governance_knowledge_workflow_candidates,
    },
  }, 200, requestId);
}

export async function POST(request: Request): Promise<Response> {
  const requestId = crypto.randomUUID();
  const user = await getCurrentUser();
  if (process.env.AUTH_REQUIRED === "true" && !user) {
    return jsonResponse({ request_id: requestId, status: "unauthorized", warning: "请先登录后再创建治理流程。" }, 401, requestId);
  }

  let body: GovernanceCreateInput;
  try {
    body = await request.json() as GovernanceCreateInput;
  } catch {
    return jsonResponse({ request_id: requestId, status: "failed", warning: "请求 JSON 格式错误。" }, 400, requestId);
  }

  const result = await createGovernanceInstance(body, user);
  let feishu_sync: Awaited<ReturnType<typeof syncGovernanceEventToFeishu>> = { status: "skipped", reason: "流程未创建，跳过飞书回写。" };
  if (result.status === "succeeded" && result.instance) {
    feishu_sync = await syncGovernanceEventToFeishu({ instance: result.instance, requestId });
    await writeIntegrationSyncLog({
      userId: user?.id,
      source: "system",
      eventType: "governance_workflow_created",
      status: "succeeded",
      severity: result.instance.priority === "high" ? "medium" : "low",
      summary: `治理流程已创建：${result.instance.workflowName} / ${result.instance.projectName} / ${result.instance.state}`,
      detail: { instance_id: result.instance.id, feishu_sync, business_impact: result.businessImpact },
      requestId,
    });
  }

  return jsonResponse({
    request_id: requestId,
    ...result,
    feishu_sync,
  }, result.status === "succeeded" ? 201 : result.status === "not_configured" ? 503 : 400, requestId);
}

export async function PATCH(request: Request): Promise<Response> {
  const requestId = crypto.randomUUID();
  const user = await getCurrentUser();
  if (process.env.AUTH_REQUIRED === "true" && !user) {
    return jsonResponse({ request_id: requestId, status: "unauthorized", warning: "请先登录后再处理治理流程。" }, 401, requestId);
  }

  let body: GovernanceTransitionInput;
  try {
    body = await request.json() as GovernanceTransitionInput;
  } catch {
    return jsonResponse({ request_id: requestId, status: "failed", warning: "请求 JSON 格式错误。" }, 400, requestId);
  }

  const result = await transitionGovernanceInstance(body, user);
  let feishu_sync: Awaited<ReturnType<typeof syncGovernanceEventToFeishu>> = { status: "skipped", reason: "流程未流转，跳过飞书回写。" };
  if (result.status === "succeeded" && result.instance) {
    feishu_sync = await syncGovernanceEventToFeishu({ instance: result.instance, event: result.event, requestId });
    await writeIntegrationSyncLog({
      userId: user?.id,
      source: "system",
      eventType: "governance_workflow_transition",
      status: "succeeded",
      severity: body.action === "reject" || body.action === "return" ? "medium" : "low",
      summary: `治理流程已流转：${result.instance.workflowName} / ${result.instance.projectName} / ${result.instance.state}`,
      detail: { instance_id: result.instance.id, action: body.action, feishu_sync, business_impact: result.businessImpact },
      requestId,
    });
    await writeIntegrationSyncLog({
      userId: user?.id,
      source: "system",
      eventType: "governance_business_impact_generated",
      status: result.businessImpact?.writebackMode === "manual_confirmation_required" ? "warning" : "succeeded",
      severity: result.businessImpact?.severity || "low",
      summary: `治理业务联动建议：${result.businessImpact?.summary || result.instance.title}`,
      detail: { instance_id: result.instance.id, action: body.action, business_impact: result.businessImpact },
      remediation: result.businessImpact?.writebackMode === "manual_confirmation_required" ? "需要责任人确认后再写回项目台账或风险登记册，避免静默改写业务主数据。" : undefined,
      requestId,
    });
  }

  return jsonResponse({
    request_id: requestId,
    ...result,
    feishu_sync,
  }, result.status === "succeeded" ? 200 : result.status === "not_configured" ? 503 : result.status === "not_found" ? 404 : 400, requestId);
}
