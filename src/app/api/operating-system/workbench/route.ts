import { getEffectiveFeishuConfig } from "@/features/feishu/user-config";
import { writeIntegrationSyncLog } from "@/features/operating-system/sync-logs";
import { buildOperationalWorkbench, loadOperationalWorkbenchFromFeishu } from "@/features/operating-system/workbench";
import { listRiskRetrospectiveGovernanceFollowups } from "@/features/risk/retrospective-governance-followups";
import { loadProjectAccessGrantsForUser, writeOperationAudit } from "@/features/security/repository";

export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  const requestId = crypto.randomUUID();
  const effective = await getEffectiveFeishuConfig();
  const followupResult = await listRiskRetrospectiveGovernanceFollowups(80);
  if (!effective.config) {
    return Response.json({
      status: "not_configured",
      source: effective.source,
      detail: effective.setupHint,
      workbench: buildOperationalWorkbench({
        user: effective.user,
        projects: [],
        risks: [],
        tasks: [],
        milestones: [],
        payments: [],
        riskRetrospectiveGovernanceFollowups: followupResult.followups,
        riskRetrospectiveGovernanceFollowupsWarning: "warning" in followupResult ? followupResult.warning : undefined,
      }),
      request_id: requestId,
    }, {
      status: process.env.AUTH_REQUIRED === "true" && !effective.user ? 401 : 200,
      headers: { "Cache-Control": "no-store", "X-Request-Id": requestId },
    });
  }

  try {
    const grants = await loadProjectAccessGrantsForUser(effective.user);
    const workbench = await loadOperationalWorkbenchFromFeishu(
      effective.config,
      effective.user,
      grants,
      followupResult.followups,
      "warning" in followupResult ? followupResult.warning : undefined,
    );
    await writeIntegrationSyncLog({
      userId: effective.user?.id,
      source: "system",
      eventType: "workbench_generation",
      status: "succeeded",
      severity: workbench.todayTodos.some(item => item.priority === "P0") || workbench.myRisks.some(item => item.severity === "高") ? "medium" : "low",
      summary: `工作台生成完成：项目${workbench.myProjects.length}个，待办${workbench.todayTodos.length}个，风险${workbench.myRisks.length}个，经营提醒${workbench.businessReminders.length}个。`,
      detail: {
        evidence: workbench.evidence,
        action_count: workbench.actions.length,
      },
      requestId,
    });
    await writeOperationAudit({
      user: effective.user,
      action: "workbench_read",
      resourceType: "workbench",
      status: "succeeded",
      summary: `读取工作台：项目${workbench.myProjects.length}个，待办${workbench.todayTodos.length}个`,
      detail: { evidence: workbench.evidence, explicit_grants: grants.length },
      requestId,
    });
    return Response.json({
      status: "succeeded",
      source: effective.source,
      generated_at: workbench.evidence.generatedAt,
      explicit_grants: grants.length,
      workbench,
      request_id: requestId,
    }, {
      headers: { "Cache-Control": "no-store", "X-Request-Id": requestId },
    });
  } catch (error) {
    return Response.json({
      status: "error",
      source: effective.source,
      code: "WORKBENCH_DASHBOARD_FAILED",
      detail: error instanceof Error ? error.message : "unknown",
      workbench: buildOperationalWorkbench({
        user: effective.user,
        projects: [],
        risks: [],
        tasks: [],
        milestones: [],
        payments: [],
        riskRetrospectiveGovernanceFollowups: followupResult.followups,
        riskRetrospectiveGovernanceFollowupsWarning: "warning" in followupResult ? followupResult.warning : undefined,
      }),
      request_id: requestId,
    }, {
      status: 503,
      headers: { "Cache-Control": "no-store", "X-Request-Id": requestId },
    });
  }
}
