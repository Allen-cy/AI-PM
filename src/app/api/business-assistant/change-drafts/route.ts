import { requireAuthenticatedApiUser } from "@/features/auth/server";
import { getEffectiveFeishuConfig } from "@/features/feishu/user-config";
import {
  authorizeAssistantProject,
  resolveBusinessAssistantAccess,
} from "@/features/operating-assistant/access";
import {
  parseAssistantChangeDraftInput,
  validateDraftChangesAgainstSnapshot,
} from "@/features/operating-assistant/change-draft";
import {
  createBusinessUpdateDraft,
  listBusinessUpdateDrafts,
  loadAssistantProjectIdentities,
} from "@/features/operating-assistant/repository";
import { loadAssistantCurrentFacts } from "@/features/operating-assistant/source";
import { writeOperationAudit } from "@/features/security/repository";

export const runtime = "nodejs";

function json(body: unknown, status = 200, requestId = crypto.randomUUID()) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store", "X-Request-Id": requestId } });
}

export async function GET(request: Request): Promise<Response> {
  const requestId = crypto.randomUUID();
  const user = await requireAuthenticatedApiUser();
  if (!user) return json({ status: "unauthorized", error: "UNAUTHORIZED", request_id: requestId }, 401, requestId);
  const access = await resolveBusinessAssistantAccess(request, user);
  if (access.status !== "succeeded") return json({ status: access.status, detail: access.warning, request_id: requestId }, access.status === "invalid" ? 400 : access.status === "forbidden" ? 403 : 503, requestId);
  const drafts = await listBusinessUpdateDrafts({ context: access.data.context, dataClass: access.data.dataClass, user });
  if (drafts.status !== "succeeded") return json({ status: drafts.status, detail: drafts.warning, request_id: requestId }, drafts.status === "not_configured" ? 503 : 500, requestId);
  return json({ status: "succeeded", drafts: drafts.data ?? [], request_id: requestId }, 200, requestId);
}

export async function POST(request: Request): Promise<Response> {
  const requestId = request.headers.get("x-idempotency-key")?.trim().slice(0, 160) || crypto.randomUUID();
  const user = await requireAuthenticatedApiUser();
  if (!user) return json({ status: "unauthorized", error: "UNAUTHORIZED", request_id: requestId }, 401, requestId);
  const access = await resolveBusinessAssistantAccess(request, user);
  if (access.status !== "succeeded") return json({ status: access.status, detail: access.warning, request_id: requestId }, access.status === "invalid" ? 400 : access.status === "forbidden" ? 403 : 503, requestId);
  let draft;
  try {
    draft = parseAssistantChangeDraftInput(await request.json());
  } catch (error) {
    return json({ status: "invalid", error: "CHANGE_DRAFT_INVALID", detail: error instanceof Error ? error.message : "变更内容不合法。", request_id: requestId }, 422, requestId);
  }
  if (draft.sourceType === "action") {
    return json({
      status: "not_executable",
      error: "ACTION_SOURCE_REQUIRES_CONTROLLED_WORKFLOW",
      detail: "行动项状态必须在Supabase统一行动台账的受控状态机中处理；当前业务助理不会将它伪装成飞书写回成功。",
      request_id: requestId,
    }, 422, requestId);
  }
  if (draft.role !== access.data.context.businessRole) return json({ status: "forbidden", detail: "变更角色与当前业务身份不一致。", request_id: requestId }, 403, requestId);
  const action = draft.role === "operations" ? "operations.update" : "milestone.update";
  const projectAccess = await authorizeAssistantProject({ user, context: access.data.context, projectId: draft.projectId, dataClass: access.data.dataClass, action });
  if (!projectAccess.allowed) return json({ status: "forbidden", detail: projectAccess.warning, request_id: requestId }, 403, requestId);
  const identities = await loadAssistantProjectIdentities({ context: access.data.context, dataClass: access.data.dataClass });
  if (identities.status !== "succeeded") return json({ status: identities.status, detail: identities.warning, request_id: requestId }, identities.status === "not_configured" ? 503 : 500, requestId);
  const effective = await getEffectiveFeishuConfig();
  const current = await loadAssistantCurrentFacts({ draft, identities: identities.data ?? [], feishuConfig: effective.config });
  if (current.status !== "succeeded" || !current.data) return json({ status: current.status, error: "CURRENT_FACT_LOAD_FAILED", detail: current.warning, request_id: requestId }, current.status === "not_configured" ? 503 : current.status === "conflict" ? 409 : 502, requestId);
  try {
    validateDraftChangesAgainstSnapshot(draft, current.data);
  } catch (error) {
    return json({ status: "conflict", error: "CURRENT_FACT_CHANGED", detail: error instanceof Error ? error.message : "当前事实已变化。", current_facts: current.data, request_id: requestId }, 409, requestId);
  }
  const created = await createBusinessUpdateDraft({ draft, context: access.data.context, dataClass: access.data.dataClass, user, requestId });
  if (created.status !== "succeeded") return json({ status: created.status, detail: created.warning, request_id: requestId }, created.status === "not_configured" ? 503 : 500, requestId);
  await writeOperationAudit({
    user,
    action: "business_update_draft_create",
    resourceType: "business_update_draft",
    resourceId: created.data?.id,
    status: "succeeded",
    severity: "medium",
    summary: `创建${draft.role === "pm" ? "项目经理" : "运营"}变化草稿：${draft.sourceType}`,
    detail: { project_id: draft.projectId, source_type: draft.sourceType, source_record_id: draft.sourceRecordId, changed_fields: draft.changes.map(item => item.field), writeback_status: "not_requested" },
    requestId,
  });
  return json({
    status: "confirmation_required",
    confirmation_required: true,
    draft: created.data,
    boundary: "本次仅保存发生变化的字段并进入待确认状态；系统没有直接写回飞书。",
    request_id: requestId,
  }, 202, requestId);
}
