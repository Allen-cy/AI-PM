import { requireAuthenticatedApiUser } from "../auth/server.ts";
import { resolveRequestedDecisionContext } from "../decisions/access.ts";
import type { BusinessRole, SubjectScope } from "../operating-model/context.ts";
import { listBusinessRoleAssignments, loadContextProjectIdentityMappings } from "../operating-model/persistence.ts";
import { canViewFormalOutputs, type FormalOutputDataClass } from "./contracts.ts";

const ROLES = new Set<BusinessRole>(["pm", "operations", "pmo", "ceo", "sponsor", "business_owner", "finance", "quality"]);
const SCOPES = new Set<SubjectScope>(["project", "portfolio", "organization", "customer", "contract"]);
const DATA_CLASSES = new Set<FormalOutputDataClass>(["production", "sample", "test", "diagnostic", "unclassified"]);

export async function resolveFormalOutputAccess(request: Request, body?: Record<string, unknown>) {
  const user = await requireAuthenticatedApiUser();
  if (!user) return { ok: false as const, status: 401, error: "UNAUTHORIZED" };
  const params = new URL(request.url).searchParams;
  const orgId = String(body?.org_id ?? params.get("org_id") ?? "").trim();
  const subjectScope = String(body?.subject_scope ?? params.get("subject_scope") ?? "").trim() as SubjectScope;
  const subjectId = String(body?.subject_id ?? params.get("subject_id") ?? "").trim();
  const businessRole = String(body?.business_role ?? body?.role ?? params.get("business_role") ?? params.get("role") ?? "").trim() as BusinessRole;
  const dataClass = String(body?.data_class ?? params.get("data_class") ?? "").trim() as FormalOutputDataClass;
  const projectId = String(body?.project_id ?? params.get("project_id") ?? (subjectScope === "project" ? subjectId : "")).trim() || null;
  if (!orgId || !SCOPES.has(subjectScope) || !subjectId || !ROLES.has(businessRole) || !DATA_CLASSES.has(dataClass)) {
    return { ok: false as const, status: 400, error: "FORMAL_OUTPUT_CONTEXT_REQUIRED" };
  }
  const assignments = await listBusinessRoleAssignments(user.id);
  if (assignments.status !== "succeeded") return { ok: false as const, status: assignments.status === "not_configured" ? 503 : 500, error: "BUSINESS_CONTEXT_LOAD_FAILED", detail: assignments.warning };
  const context = await resolveRequestedDecisionContext({ user, assignments: assignments.data ?? [], role: businessRole, orgId, subjectScope, subjectId });
  if (!context || !canViewFormalOutputs(businessRole)) return { ok: false as const, status: 403, error: "FORMAL_OUTPUT_SCOPE_FORBIDDEN" };
  if (projectId) {
    const mappings = await loadContextProjectIdentityMappings({ context, dataClass });
    if (mappings.status !== "succeeded") return { ok: false as const, status: mappings.status === "not_configured" ? 503 : 500, error: "PROJECT_SCOPE_MAPPING_FAILED", detail: mappings.warning };
    if (!(mappings.data ?? []).some(item => item.projectId === projectId)) return { ok: false as const, status: 403, error: "PROJECT_OUTSIDE_CONTEXT" };
  }
  return { ok: true as const, user, orgId, subjectScope, subjectId, projectId, businessRole, dataClass, context };
}
