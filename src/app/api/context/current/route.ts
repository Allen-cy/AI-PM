import { getAuthSupabase, getCurrentUser } from "@/features/auth/server";
import { resolveBusinessContext, type BusinessRole, type SubjectScope } from "@/features/operating-model/context";
import { listBusinessRoleAssignments, loadContextProjectIdentityMappings } from "@/features/operating-model/persistence";

export const runtime = "nodejs";

function json(body: unknown, status = 200, requestId = crypto.randomUUID()) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store", "X-Request-Id": requestId },
  });
}

export async function GET(request: Request): Promise<Response> {
  const requestId = crypto.randomUUID();
  const user = await getCurrentUser();
  if (process.env.AUTH_REQUIRED === "true" && !user) {
    return json({ error: "UNAUTHORIZED", request_id: requestId }, 401, requestId);
  }
  if (!user) return json({ error: "BUSINESS_CONTEXT_REQUIRES_USER", request_id: requestId }, 401, requestId);

  const result = await listBusinessRoleAssignments(user.id);
  if (result.status !== "succeeded") {
    return json({
      error: result.status === "not_configured" ? "P17_STORAGE_NOT_CONFIGURED" : "BUSINESS_CONTEXT_LOAD_FAILED",
      detail: result.warning,
      request_id: requestId,
    }, result.status === "not_configured" ? 503 : 500, requestId);
  }

  const assignments = result.data ?? [];
  const url = new URL(request.url);
  const requestedRole = url.searchParams.get("role") as BusinessRole | null;
  const requestedOrgId = url.searchParams.get("org_id");
  const requestedSubjectScope = url.searchParams.get("subject_scope") as SubjectScope | null;
  const requestedSubjectId = url.searchParams.get("subject_id");
  const hasRequestedContext = Boolean(requestedRole || requestedOrgId || requestedSubjectScope || requestedSubjectId);
  if (hasRequestedContext && !(requestedRole && requestedOrgId && requestedSubjectScope && requestedSubjectId)) {
    return json({ error: "BUSINESS_CONTEXT_FIELDS_REQUIRED", request_id: requestId }, 400, requestId);
  }

  const defaultAssignment = assignments.find(item => item.status === "active") ?? null;
  const activeContext = requestedRole && requestedOrgId && requestedSubjectScope && requestedSubjectId
    ? resolveBusinessContext({
      user: { id: user.id, systemRole: user.role },
      assignments,
      requestedRole,
      requestedOrgId,
      requestedSubjectScope,
      requestedSubjectId,
    })
    : defaultAssignment
      ? resolveBusinessContext({
        user: { id: user.id, systemRole: user.role },
        assignments,
        requestedRole: defaultAssignment.businessRole,
        requestedOrgId: defaultAssignment.orgId,
        requestedSubjectScope: defaultAssignment.subjectScope,
        requestedSubjectId: defaultAssignment.subjectId,
      })
      : null;

  if (hasRequestedContext && !activeContext) {
    return json({ error: "BUSINESS_CONTEXT_FORBIDDEN", request_id: requestId }, 403, requestId);
  }

  const dataClass = url.searchParams.get("data_class") || "production";
  if (!["production", "sample", "test", "diagnostic", "unclassified"].includes(dataClass)) {
    return json({ error: "DATA_CLASS_INVALID", request_id: requestId }, 400, requestId);
  }
  let availableProjects: Array<{ id: string; name: string; code: string | null; dataClass: string }> = [];
  let projectOptionsWarning: string | undefined;
  if (activeContext && ["project", "portfolio", "organization"].includes(activeContext.subjectScope)) {
    const mappings = await loadContextProjectIdentityMappings({ context: activeContext, dataClass: dataClass as "production" | "sample" | "test" | "diagnostic" | "unclassified" });
    if (mappings.status === "succeeded") {
      const ids = [...new Set((mappings.data ?? []).map(item => item.projectId))];
      if (ids.length > 0) {
        const projects = await getAuthSupabase().from("projects").select("id,name,oa_no,data_class").in("id", ids).eq("org_id", activeContext.orgId).eq("data_class", dataClass).order("name");
        if (projects.error) projectOptionsWarning = projects.error.message;
        else availableProjects = (projects.data ?? []).map(item => ({ id: String(item.id), name: String(item.name || "未命名项目"), code: item.oa_no ? String(item.oa_no) : null, dataClass: String(item.data_class) }));
      }
    } else projectOptionsWarning = mappings.warning;
  }

  return json({
    request_id: requestId,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      system_role: user.role,
    },
    active_context: activeContext,
    available_contexts: assignments,
    available_projects: availableProjects,
    project_options_warning: projectOptionsWarning,
    setup_required: assignments.length === 0,
  }, 200, requestId);
}
