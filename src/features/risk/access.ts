import { requireAuthenticatedApiUser } from "../auth/server.ts";
import {
  resolveBusinessContext,
  type BusinessRole,
  type SubjectScope,
  type SystemRole,
} from "../operating-model/context.ts";
import {
  listBusinessRoleAssignments,
  loadContextProjectIdentityMappings,
} from "../operating-model/persistence.ts";
import {
  normalizeRiskDataClass,
  resolveRequestedRiskProjectIds,
  type RiskAccessScope,
  type RiskDataClass,
} from "./scope.ts";

export { normalizeRiskDataClass, resolveRequestedRiskProjectIds } from "./scope.ts";
export type { RiskAccessScope, RiskDataClass } from "./scope.ts";

export type RiskAccessOperation = "read" | "create" | "transition" | "delete" | "govern_quarantine";

export type RiskAccessFailure = {
  ok: false;
  error: string;
  status: number;
  detail?: string;
};

export type RiskAccessSuccess = {
  ok: true;
  scope: RiskAccessScope;
};

const BUSINESS_ROLES: BusinessRole[] = ["pm", "operations", "pmo", "ceo", "sponsor", "business_owner", "finance", "quality"];
const MUTATING_ROLES = new Set<BusinessRole>(["pm", "pmo", "quality", "operations", "business_owner"]);

function text(value: string | null): string {
  return String(value ?? "").trim();
}

function operationAllowed(role: BusinessRole, systemRole: SystemRole, operation: RiskAccessOperation): boolean {
  if (operation === "read") return true;
  if (operation === "govern_quarantine") return systemRole === "admin" && role === "pmo";
  return MUTATING_ROLES.has(role);
}

export async function authorizeRiskRequest(
  request: Request,
  operation: RiskAccessOperation,
): Promise<RiskAccessSuccess | RiskAccessFailure> {
  const user = await requireAuthenticatedApiUser();
  if (!user) return { ok: false, error: "UNAUTHORIZED", status: 401 };

  const url = new URL(request.url);
  const role = text(url.searchParams.get("role")) as BusinessRole;
  const orgId = text(url.searchParams.get("org_id"));
  const subjectScope = text(url.searchParams.get("subject_scope")) as SubjectScope;
  const subjectId = text(url.searchParams.get("subject_id"));
  const rawDataClass = text(url.searchParams.get("data_class"));
  if (!BUSINESS_ROLES.includes(role) || !orgId || !subjectScope || !subjectId || !rawDataClass) {
    return { ok: false, error: "BUSINESS_CONTEXT_AND_DATA_CLASS_REQUIRED", status: 400 };
  }

  let dataClass: RiskDataClass;
  try {
    dataClass = normalizeRiskDataClass(rawDataClass);
  } catch {
    return { ok: false, error: "DATA_CLASS_INVALID", status: 400 };
  }

  const assignments = await listBusinessRoleAssignments(user.id);
  if (assignments.status !== "succeeded") {
    return {
      ok: false,
      error: assignments.status === "not_configured" ? "P17_STORAGE_NOT_CONFIGURED" : "BUSINESS_CONTEXT_LOAD_FAILED",
      status: assignments.status === "not_configured" ? 503 : 500,
      detail: assignments.warning,
    };
  }

  const context = resolveBusinessContext({
    user: { id: user.id, systemRole: user.role },
    assignments: assignments.data ?? [],
    requestedRole: role,
    requestedOrgId: orgId,
    requestedSubjectScope: subjectScope,
    requestedSubjectId: subjectId,
  });
  if (!context) return { ok: false, error: "BUSINESS_CONTEXT_FORBIDDEN", status: 403 };
  if (!operationAllowed(context.businessRole, context.systemRole, operation)) {
    return { ok: false, error: "RISK_OPERATION_FORBIDDEN", status: 403 };
  }
  if (operation === "govern_quarantine" && context.subjectScope !== "organization") {
    return { ok: false, error: "RISK_QUARANTINE_ORG_SCOPE_REQUIRED", status: 403 };
  }

  const mappings = await loadContextProjectIdentityMappings({ context, dataClass });
  if (mappings.status !== "succeeded") {
    return {
      ok: false,
      error: "PROJECT_SCOPE_MAPPING_FAILED",
      status: mappings.status === "not_configured" ? 503 : 500,
      detail: mappings.warning,
    };
  }

  const projectIds = [...new Set((mappings.data ?? []).map(item => item.projectId))];
  const requestedProjectId = text(url.searchParams.get("project_id"));
  try {
    resolveRequestedRiskProjectIds({
      orgId: context.orgId,
      dataClass,
      projectIds,
    }, requestedProjectId);
  } catch {
    return { ok: false, error: "PROJECT_OUTSIDE_CONTEXT", status: 403 };
  }
  const effectiveMappings = (mappings.data ?? []).filter(item => !requestedProjectId || item.projectId === requestedProjectId);

  return {
    ok: true,
    scope: {
      actorUserId: user.id,
      systemRole: user.role,
      businessRole: context.businessRole,
      orgId: context.orgId,
      subjectScope: context.subjectScope,
      subjectId: context.subjectId,
      dataClass,
      projectIds,
      sourceRecordIds: [...new Set(effectiveMappings.map(item => item.sourceRecordId).filter(Boolean))],
      externalProjectCodes: [...new Set(effectiveMappings.map(item => item.externalProjectCode).filter((value): value is string => Boolean(value)))],
      requestedProjectId: requestedProjectId || undefined,
    },
  };
}
