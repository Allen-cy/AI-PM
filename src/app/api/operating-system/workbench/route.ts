import { getEffectiveFeishuConfig } from "@/features/feishu/user-config";
import { writeIntegrationSyncLog } from "@/features/operating-system/sync-logs";
import { buildOperationalWorkbench, loadOperationalWorkbenchFromFeishu } from "@/features/operating-system/workbench";
import { listRiskRetrospectiveGovernanceFollowups } from "@/features/risk/retrospective-governance-followups";
import { loadProjectAccessGrantsForUser, writeOperationAudit } from "@/features/security/repository";
import { resolveBusinessContext, type BusinessRole, type SubjectScope } from "@/features/operating-model/context";
import { listBusinessRoleAssignments, loadContextProjectIdentityMappings, type ManagementSignalRecord } from "@/features/operating-model/persistence";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  const requestId = crypto.randomUUID();
  const effective = await getEffectiveFeishuConfig();
  if (!effective.user) return Response.json({ error: "UNAUTHORIZED", request_id: requestId }, { status: 401, headers: { "Cache-Control": "no-store", "X-Request-Id": requestId } });
  const url = new URL(request.url);
  const role = url.searchParams.get("role") as BusinessRole | null;
  const orgId = url.searchParams.get("org_id");
  const subjectScope = url.searchParams.get("subject_scope") as SubjectScope | null;
  const subjectId = url.searchParams.get("subject_id");
  const requestedDataClass = (url.searchParams.get("data_class") || "production") as ManagementSignalRecord["dataClass"];
  if (!role || !orgId || !subjectScope || !subjectId || !["production", "sample", "test", "diagnostic", "unclassified"].includes(requestedDataClass)) {
    return Response.json({ error: "BUSINESS_CONTEXT_AND_DATA_CLASS_REQUIRED", request_id: requestId }, { status: 400, headers: { "Cache-Control": "no-store", "X-Request-Id": requestId } });
  }
  const assignments = await listBusinessRoleAssignments(effective.user.id);
  if (assignments.status !== "succeeded") return Response.json({ error: "P17_STORAGE_NOT_CONFIGURED", detail: assignments.warning, request_id: requestId }, { status: 503 });
  const context = resolveBusinessContext({
    user: { id: effective.user.id, systemRole: effective.user.role }, assignments: assignments.data ?? [],
    requestedRole: role, requestedOrgId: orgId, requestedSubjectScope: subjectScope, requestedSubjectId: subjectId,
  });
  if (!context) return Response.json({ error: "BUSINESS_CONTEXT_FORBIDDEN", request_id: requestId }, { status: 403 });
  const mappingResult = await loadContextProjectIdentityMappings({ context, dataClass: requestedDataClass });
  if (mappingResult.status !== "succeeded") return Response.json({ error: "PROJECT_SCOPE_MAPPING_FAILED", detail: mappingResult.warning, request_id: requestId }, { status: mappingResult.status === "not_configured" ? 503 : 500 });
  const mappings = mappingResult.data ?? [];
  const businessScope = {
    businessRole: role,
    canonicalProjectIds: mappings.map(item => item.projectId),
    sourceRecordIds: mappings.map(item => item.sourceRecordId),
    externalProjectCodes: mappings.map(item => item.externalProjectCode).filter((value): value is string => Boolean(value)),
    dataClass: requestedDataClass,
  };
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
        businessScope,
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
      businessScope,
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
      detail: { evidence: workbench.evidence, explicit_grants: grants.length, businessRole: role, dataClass: requestedDataClass },
      requestId,
    });
    return Response.json({
      status: "succeeded",
      source: effective.source,
      generated_at: workbench.evidence.generatedAt,
      explicit_grants: grants.length,
      context,
      data_class: requestedDataClass,
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
        businessScope,
      }),
      request_id: requestId,
    }, {
      status: 503,
      headers: { "Cache-Control": "no-store", "X-Request-Id": requestId },
    });
  }
}
