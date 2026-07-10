import type { AppUser } from "../auth/server.ts";
import {
  resolveBusinessContext,
  resolveBusinessContextForResource,
  type BusinessRole,
  type BusinessRoleAssignment,
  type SubjectScope,
} from "../operating-model/context.ts";
import { loadProjectAccessScope } from "../operating-model/persistence.ts";

export async function resolveRequestedDecisionContext(input: {
  user: AppUser;
  assignments: BusinessRoleAssignment[];
  role: BusinessRole;
  orgId: string;
  subjectScope: SubjectScope;
  subjectId: string;
}) {
  if (input.subjectScope === "project") {
    const scope = await loadProjectAccessScope(input.subjectId);
    if (scope.status !== "succeeded" || !scope.data || scope.data.orgId !== input.orgId) return null;
    return resolveBusinessContextForResource({
      user: { id: input.user.id, systemRole: input.user.role },
      assignments: input.assignments,
      requestedRole: input.role,
      resource: {
        orgId: scope.data.orgId,
        subjectScope: "project",
        subjectId: scope.data.projectId,
        ancestorSubjectIds: { portfolio: scope.data.portfolioIds, organization: [scope.data.orgId] },
      },
    });
  }
  return resolveBusinessContext({
    user: { id: input.user.id, systemRole: input.user.role },
    assignments: input.assignments,
    requestedRole: input.role,
    requestedOrgId: input.orgId,
    requestedSubjectScope: input.subjectScope,
    requestedSubjectId: input.subjectId,
  });
}
