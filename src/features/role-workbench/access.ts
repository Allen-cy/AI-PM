import { requireAuthenticatedApiUser } from "../auth/server.ts";
import { resolveBusinessContext, type BusinessRole, type SubjectScope } from "../operating-model/context.ts";
import { listBusinessRoleAssignments, loadContextProjectIdentityMappings } from "../operating-model/persistence.ts";
import type { PrimaryWorkbenchRole, WorkbenchDataClass } from "./domain.ts";

const ROLES = new Set<PrimaryWorkbenchRole>(["pm", "operations", "pmo", "ceo"]);
const SCOPES = new Set<SubjectScope>(["project", "portfolio", "organization", "customer", "contract"]);
const DATA_CLASSES = new Set<WorkbenchDataClass>(["production", "sample", "test", "diagnostic", "unclassified"]);

export async function resolveRoleWorkbenchAccess(request: Request) {
  const user = await requireAuthenticatedApiUser();
  if (!user) return { ok: false as const, status: 401, error: "UNAUTHORIZED" };
  const params = new URL(request.url).searchParams;
  const role = String(params.get("role") || "").trim() as PrimaryWorkbenchRole;
  const orgId = String(params.get("org_id") || "").trim();
  const subjectScope = String(params.get("subject_scope") || "").trim() as SubjectScope;
  const subjectId = String(params.get("subject_id") || "").trim();
  const dataClass = String(params.get("data_class") || "").trim() as WorkbenchDataClass;
  if (!ROLES.has(role) || !orgId || !SCOPES.has(subjectScope) || !subjectId || !DATA_CLASSES.has(dataClass)) {
    return { ok: false as const, status: 400, error: "ROLE_WORKBENCH_CONTEXT_REQUIRED" };
  }
  const assignments = await listBusinessRoleAssignments(user.id);
  if (assignments.status !== "succeeded") return { ok: false as const, status: assignments.status === "not_configured" ? 503 : 500, error: "BUSINESS_CONTEXT_LOAD_FAILED", detail: assignments.warning };
  const context = resolveBusinessContext({
    user: { id: user.id, systemRole: user.role },
    assignments: assignments.data ?? [],
    requestedRole: role as BusinessRole,
    requestedOrgId: orgId,
    requestedSubjectScope: subjectScope,
    requestedSubjectId: subjectId,
  });
  if (!context) return { ok: false as const, status: 403, error: "ROLE_WORKBENCH_SCOPE_FORBIDDEN" };
  const mappings = await loadContextProjectIdentityMappings({ context, dataClass });
  if (mappings.status !== "succeeded") return { ok: false as const, status: mappings.status === "not_configured" ? 503 : 500, error: "PROJECT_SCOPE_MAPPING_FAILED", detail: mappings.warning };
  return {
    ok: true as const,
    user,
    role,
    orgId,
    subjectScope,
    subjectId,
    dataClass,
    context,
    projectIds: [...new Set((mappings.data ?? []).map(item => item.projectId))],
  };
}
