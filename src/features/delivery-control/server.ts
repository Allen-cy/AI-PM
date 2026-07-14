import { getAuthSupabase, requireAuthenticatedApiUser, type AppUser } from "@/features/auth/server";
import { projectAccessHttpStatus, resolveProjectLifecycleAccess } from "@/features/lifecycle-loop/access";
import type { BusinessRole } from "@/features/operating-model/context";

import type { DeliveryDataClass } from "./contracts";

const ROLES = new Set<BusinessRole>(["pm", "operations", "pmo", "sponsor", "business_owner", "finance", "quality"]);
const DATA_CLASSES = new Set<DeliveryDataClass>(["production", "sample", "test", "diagnostic", "unclassified"]);

export type ResolvedDeliveryProject = {
  ok: true;
  user: AppUser;
  projectId: string;
  businessRole: BusinessRole;
  dataClass: DeliveryDataClass;
  orgId: string;
  context: {
    org_id: string;
    subject_scope: "project";
    subject_id: string;
    project_id: string;
    business_role: BusinessRole;
    data_class: DeliveryDataClass;
  };
};

export type DeliveryProjectFailure = {
  ok: false;
  error: string;
  detail?: string;
  status: number;
};

export async function resolveDeliveryProject(
  request: Request,
  body?: Record<string, unknown>,
): Promise<ResolvedDeliveryProject | DeliveryProjectFailure> {
  const user = await requireAuthenticatedApiUser();
  if (!user) return { ok: false, error: "UNAUTHORIZED", status: 401 };

  const url = new URL(request.url);
  const projectId = String(body?.project_id ?? url.searchParams.get("project_id") ?? "").trim();
  const businessRole = String(body?.business_role ?? url.searchParams.get("business_role") ?? "").trim() as BusinessRole;
  const dataClass = String(body?.data_class ?? url.searchParams.get("data_class") ?? "").trim() as DeliveryDataClass;
  if (!projectId || !ROLES.has(businessRole) || !DATA_CLASSES.has(dataClass)) {
    return { ok: false, error: "DELIVERY_CONTEXT_REQUIRED", detail: "请选择当前项目、业务角色和数据分类。", status: 400 };
  }

  const access = await resolveProjectLifecycleAccess({ user, projectId, businessRole });
  if (access.status !== "succeeded" || !access.scope) {
    return {
      ok: false,
      error: access.status.toUpperCase(),
      detail: access.warning,
      status: projectAccessHttpStatus(access.status),
    };
  }
  if (access.scope.dataClass !== dataClass) {
    return { ok: false, error: "DATA_CLASS_MISMATCH", status: 409 };
  }
  return {
    ok: true,
    user,
    projectId,
    businessRole,
    dataClass,
    orgId: access.scope.orgId,
    context: {
      org_id: access.scope.orgId,
      subject_scope: "project",
      subject_id: projectId,
      project_id: projectId,
      business_role: businessRole,
      data_class: dataClass,
    },
  };
}

export function deliveryJson(body: unknown, status: number, requestId: string) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store", "X-Request-Id": requestId },
  });
}

export function deliverySource(dataClass: DeliveryDataClass, updatedAt?: string | null, type = "supabase") {
  return { type, fallback_used: false, data_class: dataClass, updated_at: updatedAt ?? null };
}

export function deliverySuccess(
  resolved: ResolvedDeliveryProject,
  requestId: string,
  data: unknown,
  options: { updatedAt?: string | null; warnings?: string[]; sourceType?: string } = {},
) {
  return deliveryJson({
    status: "succeeded",
    request_id: requestId,
    context: resolved.context,
    source: deliverySource(resolved.dataClass, options.updatedAt, options.sourceType),
    data_class: resolved.dataClass,
    generated_at: new Date().toISOString(),
    warnings: options.warnings ?? [],
    data,
  }, 200, requestId);
}

export function deliveryErrorStatus(message: string) {
  if (/VERSION_CONFLICT|IDEMPOTENCY_PAYLOAD_CONFLICT|STATUS_CONFLICT|DATA_CLASS_MISMATCH|ORG_SCOPE_MISMATCH/i.test(message)) return 409;
  if (/ROLE_FORBIDDEN|FORBIDDEN/i.test(message)) return 403;
  if (/NOT_FOUND/i.test(message)) return 404;
  if (/INVALID|REQUIRED|WRITE_CONTRACT|HORIZON|COMMENT/i.test(message)) return 400;
  return 503;
}

export function deliveryErrorMessage(error: unknown, fallback = "交付控制操作失败") {
  if (error && typeof error === "object" && "message" in error) return String(error.message);
  return error instanceof Error ? error.message : fallback;
}

export function deliverySupabase() {
  return getAuthSupabase();
}
