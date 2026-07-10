import type { AppUser } from "../auth/server.ts";
import { canPerformBusinessAction, type BusinessAction } from "../operating-model/authorization.ts";
import {
  resolveBusinessContext,
  resolveBusinessContextForResource,
  type BusinessContext,
  type SubjectScope,
} from "../operating-model/context.ts";
import {
  listBusinessRoleAssignments,
  loadProjectAccessScope,
} from "../operating-model/persistence.ts";
import type { AssistantDataClass, AssistantRole } from "./snapshot.ts";

export interface BusinessAssistantAccess {
  context: BusinessContext;
  dataClass: AssistantDataClass;
}

export type BusinessAssistantAccessResult =
  | { status: "succeeded"; data: BusinessAssistantAccess }
  | { status: "invalid" | "forbidden" | "not_configured" | "failed"; warning: string };

const DATA_CLASSES: AssistantDataClass[] = ["production", "sample", "test", "diagnostic", "unclassified"];

export async function resolveBusinessAssistantAccess(request: Request, user: AppUser): Promise<BusinessAssistantAccessResult> {
  const url = new URL(request.url);
  const role = url.searchParams.get("role") as AssistantRole | null;
  const orgId = url.searchParams.get("org_id");
  const subjectScope = url.searchParams.get("subject_scope") as SubjectScope | null;
  const subjectId = url.searchParams.get("subject_id");
  const dataClass = url.searchParams.get("data_class") as AssistantDataClass | null;
  if (!role || !orgId || !subjectScope || !subjectId || !dataClass) {
    return { status: "invalid", warning: "缺少业务角色、组织、业务范围或数据空间。" };
  }
  if (role !== "pm" && role !== "operations") return { status: "forbidden", warning: "当前页面仅支持项目经理和运营角色。" };
  if (!DATA_CLASSES.includes(dataClass)) return { status: "invalid", warning: "数据空间不合法。" };
  const assignments = await listBusinessRoleAssignments(user.id);
  if (assignments.status !== "succeeded") return {
    status: assignments.status === "not_configured" ? "not_configured" : "failed",
    warning: assignments.warning ?? "业务角色读取失败。",
  };
  const context = resolveBusinessContext({
    user: { id: user.id, systemRole: user.role },
    assignments: assignments.data ?? [],
    requestedRole: role,
    requestedOrgId: orgId,
    requestedSubjectScope: subjectScope,
    requestedSubjectId: subjectId,
  });
  if (!context) return { status: "forbidden", warning: "当前账号没有所选业务范围的角色授权。" };
  const resource = { orgId, subjectScope, subjectId };
  if (!canPerformBusinessAction(context, "project.read", resource)) return { status: "forbidden", warning: "当前角色不能读取该业务范围。" };
  return { status: "succeeded", data: { context, dataClass } };
}

export async function authorizeAssistantProject(input: {
  user: AppUser;
  context: BusinessContext;
  projectId: string;
  dataClass: AssistantDataClass;
  action: BusinessAction;
}): Promise<{ allowed: boolean; warning?: string }> {
  const scope = await loadProjectAccessScope(input.projectId);
  if (scope.status !== "succeeded" || !scope.data) return { allowed: false, warning: scope.warning ?? "项目不存在。" };
  if (scope.data.dataClass !== input.dataClass) return { allowed: false, warning: "项目与当前数据空间不一致。" };
  const resource = {
    orgId: scope.data.orgId,
    subjectScope: "project" as const,
    subjectId: input.projectId,
    ancestorSubjectIds: { portfolio: scope.data.portfolioIds, organization: [scope.data.orgId] },
  };
  const assignments = await listBusinessRoleAssignments(input.user.id);
  if (assignments.status !== "succeeded") return { allowed: false, warning: assignments.warning };
  const resolved = resolveBusinessContextForResource({
    user: { id: input.user.id, systemRole: input.user.role },
    assignments: assignments.data ?? [],
    requestedRole: input.context.businessRole,
    resource,
  });
  return {
    allowed: Boolean(resolved && resolved.assignmentId === input.context.assignmentId && canPerformBusinessAction(resolved, input.action, resource)),
    warning: resolved ? undefined : "项目不在当前业务角色的授权范围内。",
  };
}
