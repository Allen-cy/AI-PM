import { requireAuthenticatedApiUser } from "@/features/auth/server";
import { projectAccessHttpStatus, resolveProjectLifecycleAccess } from "@/features/lifecycle-loop/access";
import type { BusinessRole } from "@/features/operating-model/context";
import type { ProjectControlDataClass } from "./contracts";

const DATA_CLASSES = new Set<ProjectControlDataClass>(["production", "sample", "test", "diagnostic", "unclassified"]);

export async function resolveProjectControlAccess(request: Request, body?: Record<string, unknown>) {
  const user = await requireAuthenticatedApiUser();
  if (!user) return { ok: false as const, status: 401, error: "UNAUTHORIZED" };
  const url = new URL(request.url);
  const projectId = String(body?.project_id ?? url.searchParams.get("project_id") ?? "").trim();
  const businessRole = String(body?.business_role ?? url.searchParams.get("business_role") ?? "").trim() as BusinessRole;
  const dataClass = String(body?.data_class ?? url.searchParams.get("data_class") ?? "").trim() as ProjectControlDataClass;
  if (!projectId || !businessRole || !DATA_CLASSES.has(dataClass)) {
    return { ok: false as const, status: 400, error: "PROJECT_CONTROL_CONTEXT_REQUIRED", detail: "请先选择项目、业务角色和数据空间。" };
  }
  const access = await resolveProjectLifecycleAccess({ user, projectId, businessRole });
  if (access.status !== "succeeded" || !access.scope || !access.context) {
    return { ok: false as const, status: projectAccessHttpStatus(access.status), error: access.status.toUpperCase(), detail: access.warning };
  }
  if (access.scope.orgId !== access.context.orgId || access.scope.dataClass !== dataClass) {
    return { ok: false as const, status: 409, error: "PROJECT_CONTROL_SCOPE_MISMATCH" };
  }
  return { ok: true as const, user, projectId, businessRole, dataClass, orgId: access.scope.orgId, access };
}
