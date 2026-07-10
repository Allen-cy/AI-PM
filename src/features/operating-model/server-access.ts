import type { AppUser } from "../auth/server.ts";
import {
  resolveBusinessContext,
  resolveBusinessContextForResource,
  type BusinessRole,
  type BusinessRoleAssignment,
} from "./context.ts";
import { loadProjectAccessScope, type ManagementSignalRecord } from "./persistence.ts";

export async function resolveSignalBusinessAccess(input: {
  user: AppUser;
  assignments: BusinessRoleAssignment[];
  role: BusinessRole;
  signal: Pick<ManagementSignalRecord, "orgId" | "subjectScope" | "subjectId" | "projectId">;
}) {
  if (input.signal.subjectScope === "project" && input.signal.projectId) {
    const scope = await loadProjectAccessScope(input.signal.projectId);
    if (scope.status !== "succeeded" || !scope.data) return { context: null, resource: null, warning: scope.warning };
    const resource = {
      orgId: scope.data.orgId,
      subjectScope: "project" as const,
      subjectId: scope.data.projectId,
      ancestorSubjectIds: { portfolio: scope.data.portfolioIds, organization: [scope.data.orgId] },
    };
    return {
      context: resolveBusinessContextForResource({
        user: { id: input.user.id, systemRole: input.user.role },
        assignments: input.assignments,
        requestedRole: input.role,
        resource,
      }),
      resource,
    };
  }
  const resource = { orgId: input.signal.orgId, subjectScope: input.signal.subjectScope, subjectId: input.signal.subjectId };
  return {
    context: resolveBusinessContext({
      user: { id: input.user.id, systemRole: input.user.role }, assignments: input.assignments,
      requestedRole: input.role, requestedOrgId: input.signal.orgId,
      requestedSubjectScope: input.signal.subjectScope, requestedSubjectId: input.signal.subjectId,
    }),
    resource,
  };
}

