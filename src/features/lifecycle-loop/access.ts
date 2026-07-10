import type { AppUser } from "../auth/server.ts";
import {
  resolveBusinessContextForResource,
  type BusinessContext,
  type BusinessRole,
} from "../operating-model/context.ts";
import {
  listBusinessRoleAssignments,
  loadProjectAccessScope,
  type ProjectAccessScope,
} from "../operating-model/persistence.ts";

export type ProjectLifecycleAccess = {
  status: "succeeded" | "not_configured" | "not_found" | "forbidden" | "failed";
  context?: BusinessContext;
  scope?: ProjectAccessScope;
  warning?: string;
};

export async function resolveProjectLifecycleAccess(input: {
  user: AppUser;
  projectId: string;
  businessRole: BusinessRole;
}): Promise<ProjectLifecycleAccess> {
  const [assignments, scope] = await Promise.all([
    listBusinessRoleAssignments(input.user.id),
    loadProjectAccessScope(input.projectId),
  ]);
  if (assignments.status !== "succeeded") return { status: assignments.status === "not_configured" ? "not_configured" : "failed", warning: assignments.warning };
  if (scope.status !== "succeeded" || !scope.data) return { status: scope.status, warning: scope.warning } as ProjectLifecycleAccess;
  const resource = {
    orgId: scope.data.orgId,
    subjectScope: "project" as const,
    subjectId: scope.data.projectId,
    ancestorSubjectIds: { portfolio: scope.data.portfolioIds, organization: [scope.data.orgId] },
  };
  const context = resolveBusinessContextForResource({
    user: { id: input.user.id, systemRole: input.user.role },
    assignments: assignments.data ?? [],
    requestedRole: input.businessRole,
    resource,
  });
  if (!context) return { status: "forbidden", warning: "当前用户没有该项目和业务角色的有效授权。" };
  return { status: "succeeded", context, scope: scope.data };
}

export function projectAccessHttpStatus(status: ProjectLifecycleAccess["status"]): number {
  if (status === "not_found") return 404;
  if (status === "forbidden") return 403;
  if (status === "not_configured") return 503;
  return status === "succeeded" ? 200 : 500;
}

