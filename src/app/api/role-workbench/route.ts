import { resolveRoleWorkbenchAccess } from "@/features/role-workbench/access";
import { loadRoleWorkbench } from "@/features/role-workbench/repository";
import { writeOperationAudit } from "@/features/security/repository";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  const access = await resolveRoleWorkbenchAccess(request);
  if (!access.ok) return Response.json({ error: access.error, detail: access.detail, request_id: requestId }, { status: access.status, headers: { "Cache-Control": "no-store", "X-Request-Id": requestId } });
  try {
    const result = await loadRoleWorkbench(access);
    await writeOperationAudit({
      user: access.user,
      action: "role_workbench_read",
      resourceType: "role_workbench",
      status: "succeeded",
      summary: `${access.role}角色读取真实业务工作台`,
      detail: { context: access.context, dataClass: access.dataClass, projectCount: access.projectIds.length, sourceLineage: result.sourceLineage, warnings: result.warnings },
      requestId,
    });
    return Response.json({
      status: "succeeded",
      request_id: requestId,
      context: access.context,
      data_class: access.dataClass,
      source: { type: "supabase", fallback_used: false, lineage: result.sourceLineage },
      warnings: result.warnings,
      workbench: result.workbench,
    }, { headers: { "Cache-Control": "no-store", "X-Request-Id": requestId } });
  } catch (error) {
    return Response.json({ error: "ROLE_WORKBENCH_LOAD_FAILED", detail: error instanceof Error ? error.message : "unknown", request_id: requestId }, { status: 503, headers: { "Cache-Control": "no-store", "X-Request-Id": requestId } });
  }
}
