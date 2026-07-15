import { getCurrentUser } from "../../../../../../features/auth/server.ts";
import {
  buildFeishuConfirmationQueueSummary,
  buildFeishuConfirmationRiskReview,
  createFeishuActionConfirmation,
  listFeishuActionConfirmations,
  type FeishuActionConfirmationRecord,
  type FeishuActionConfirmationStatus,
} from "../../../../../../features/feishu/action-confirmations.ts";
import {
  ActionValidationError,
  buildFeishuActionPreview,
  validateFeishuActionBody,
  type FeishuActionBody,
} from "../../../../../../features/feishu/action-payload.ts";
import { resolveBusinessContext, type BusinessRole, type SubjectScope } from "@/features/operating-model/context";
import { listBusinessRoleAssignments, loadContextProjectIdentityMappings } from "@/features/operating-model/persistence";

export const runtime = "nodejs";

function json(body: unknown, status = 200, requestId = crypto.randomUUID()) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store", "X-Request-Id": requestId },
  });
}

function text(value: unknown, maximum = 200): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!normalized || normalized.length > maximum) return null;
  return normalized;
}

function sourceFrom(value: unknown): FeishuActionConfirmationRecord["source"] {
  return value === "user_center" || value === "integration_center" || value === "system" ? value : "integration_center";
}

function statusFrom(value: string | null): FeishuActionConfirmationStatus | "all" {
  const allowed = ["pending_confirmation", "confirmed", "writing", "succeeded", "failed", "cancelled", "all"];
  return allowed.includes(value ?? "") ? value as FeishuActionConfirmationStatus | "all" : "all";
}

export async function GET(request: Request): Promise<Response> {
  const requestId = crypto.randomUUID();
  const user = await getCurrentUser();
  if (!user) return json({ request_id: requestId, status: "unauthorized", warning: "请先登录后查看飞书写入确认队列。" }, 401, requestId);

  const url = new URL(request.url);
  const result = await listFeishuActionConfirmations({
    user,
    status: statusFrom(url.searchParams.get("status")),
    limit: Math.min(100, Math.max(1, Number(url.searchParams.get("limit") || 50))),
  });
  const status = result.status === "succeeded" ? 200 : result.status === "not_configured" ? 503 : 500;
  if (result.status !== "succeeded") return json({ request_id: requestId, ...result }, status, requestId);

  return json({
    request_id: requestId,
    ...result,
    confirmations: result.confirmations.map(confirmation => ({
      ...confirmation,
      riskReview: buildFeishuConfirmationRiskReview(confirmation, { user }),
    })),
    summary: buildFeishuConfirmationQueueSummary(result.confirmations),
  }, status, requestId);
}

export async function POST(request: Request): Promise<Response> {
  const requestId = crypto.randomUUID();
  const user = await getCurrentUser();
  if (!user) return json({ request_id: requestId, status: "unauthorized", warning: "请先登录后创建飞书写入确认。" }, 401, requestId);

  let body: Record<string, unknown>;
  try {
    const value = await request.json();
    if (typeof value !== "object" || value === null || Array.isArray(value)) throw new ActionValidationError();
    body = value as Record<string, unknown>;
  } catch {
    return json({ request_id: requestId, status: "failed", warning: "请求 JSON 格式错误。" }, 400, requestId);
  }

  const payload = (typeof body.payload === "object" && body.payload !== null && !Array.isArray(body.payload)
    ? body.payload
    : body) as FeishuActionBody;
  try {
    const validated = validateFeishuActionBody(payload);
    if (validated.actionType === "base_record_update") {
      return json({ request_id: requestId, status: "forbidden", warning: "Base记录更新必须从业务助理变化草稿发起，并与草稿在同一数据库事务中入队。" }, 403, requestId);
    }
  } catch {
    return json({ request_id: requestId, status: "failed", warning: "飞书动作参数不合法。" }, 422, requestId);
  }

  const preview = buildFeishuActionPreview(payload);
  let scope: { orgId: string; projectId: string; dataClass: "production" | "sample" | "test" | "diagnostic" | "unclassified" } | undefined;
  if (body.business_context && typeof body.business_context === "object" && !Array.isArray(body.business_context)) {
    const candidate = body.business_context as Record<string, unknown>;
    const role = text(candidate.role, 32) as BusinessRole | null;
    const orgId = text(candidate.org_id, 80);
    const subjectScope = text(candidate.subject_scope, 32) as SubjectScope | null;
    const subjectId = text(candidate.subject_id, 160);
    const dataClass = text(candidate.data_class, 32) as "production" | "sample" | "test" | "diagnostic" | "unclassified" | null;
    const projectId = text(candidate.project_id, 80);
    if (!role || !orgId || !subjectScope || !subjectId || !dataClass || !projectId || !["production", "sample", "test", "diagnostic", "unclassified"].includes(dataClass)) {
      return json({ request_id: requestId, status: "failed", warning: "业务上下文不完整。" }, 400, requestId);
    }
    const assignments = await listBusinessRoleAssignments(user.id);
    if (assignments.status !== "succeeded") return json({ request_id: requestId, status: "failed", warning: assignments.warning || "角色数据不可用。" }, 503, requestId);
    const context = resolveBusinessContext({ user: { id: user.id, systemRole: user.role }, assignments: assignments.data ?? [], requestedRole: role, requestedOrgId: orgId, requestedSubjectScope: subjectScope, requestedSubjectId: subjectId });
    if (!context) return json({ request_id: requestId, status: "forbidden", warning: "当前账号无权使用该业务上下文。" }, 403, requestId);
    const mappings = await loadContextProjectIdentityMappings({ context, dataClass });
    if (mappings.status !== "succeeded") return json({ request_id: requestId, status: "failed", warning: mappings.warning || "项目范围不可用。" }, 503, requestId);
    if (!(mappings.data ?? []).some(item => item.projectId === projectId)) return json({ request_id: requestId, status: "forbidden", warning: "项目不在当前授权范围。" }, 403, requestId);
    scope = { orgId, projectId, dataClass };
  }
  if ((text(body.sourcePage) ?? text(body.source_page)) === "/operations-center/pilot-acceptance" && !scope) {
    return json({ request_id: requestId, status: "failed", warning: "受控试点飞书动作必须携带并校验业务上下文。" }, 400, requestId);
  }
  const result = await createFeishuActionConfirmation({
    user,
    source: sourceFrom(body.source),
    sourcePage: text(body.sourcePage) ?? text(body.source_page) ?? "/integration-center",
    payload,
    requestId,
    scope,
  });
  const status = result.status === "succeeded" ? 201 : result.status === "not_configured" ? 503 : 500;
  return json({
    request_id: requestId,
    ...result,
    preview: result.status === "succeeded" ? result.confirmation.preview : preview,
    riskReview: result.status === "succeeded" ? buildFeishuConfirmationRiskReview(result.confirmation, { user }) : undefined,
    confirmation_required: result.status === "succeeded",
  }, status, requestId);
}
