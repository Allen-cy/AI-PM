import { requireAuthenticatedApiUser } from "@/features/auth/server";
import { readFeishuConfig } from "@/features/feishu/config";
import { getUserFeishuConfig } from "@/features/feishu/user-config";
import {
  authorizeAssistantProject,
  resolveBusinessAssistantAccess,
} from "@/features/operating-assistant/access";
import { validateDraftChangesAgainstSnapshot } from "@/features/operating-assistant/change-draft";
import {
  decideBusinessUpdateDraft,
  getBusinessUpdateDraft,
  loadAssistantProjectIdentities,
  queueBusinessUpdateDraftWriteback,
} from "@/features/operating-assistant/repository";
import { loadAssistantCurrentFacts } from "@/features/operating-assistant/source";
import { writeOperationAudit } from "@/features/security/repository";

export const runtime = "nodejs";

function json(body: unknown, status = 200, requestId = crypto.randomUUID()) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store", "X-Request-Id": requestId } });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = crypto.randomUUID();
  const user = await requireAuthenticatedApiUser();
  if (!user) return json({ status: "unauthorized", error: "UNAUTHORIZED", request_id: requestId }, 401, requestId);
  const access = await resolveBusinessAssistantAccess(request, user);
  if (access.status !== "succeeded") return json({ status: access.status, detail: access.warning, request_id: requestId }, access.status === "invalid" ? 400 : access.status === "forbidden" ? 403 : 503, requestId);
  const body = await request.json().catch(() => ({})) as { decision?: unknown; confirm?: unknown; reason?: unknown };
  const decision = body.decision === "cancel" ? "cancel" : body.decision === "confirm" ? "confirm" : null;
  if (!decision) return json({ status: "invalid", detail: "decision必须为confirm或cancel。", request_id: requestId }, 422, requestId);
  if (decision === "confirm" && body.confirm !== true) return json({ status: "invalid", detail: "确认草稿必须显式传入confirm=true。", request_id: requestId }, 400, requestId);
  const { id } = await params;
  const loaded = await getBusinessUpdateDraft({ id, context: access.data.context, dataClass: access.data.dataClass, user });
  if (loaded.status !== "succeeded" || !loaded.data) return json({ status: loaded.status, detail: loaded.warning, request_id: requestId }, loaded.status === "not_found" ? 404 : loaded.status === "not_configured" ? 503 : 500, requestId);
  const draft = loaded.data;
  const action = draft.businessRole === "operations" ? "operations.update" : draft.sourceType === "action" ? "action.execute" : "milestone.update";
  const projectAccess = await authorizeAssistantProject({ user, context: access.data.context, projectId: draft.projectId, dataClass: access.data.dataClass, action });
  if (!projectAccess.allowed) return json({ status: "forbidden", detail: projectAccess.warning, request_id: requestId }, 403, requestId);

  if (draft.sourceType === "action") {
    return json({
      status: "not_executable",
      error: "ACTION_SOURCE_REQUIRES_CONTROLLED_WORKFLOW",
      detail: "行动项状态必须通过Supabase统一行动台账的受控流转接口处理；本接口不会伪造写回成功。",
      request_id: requestId,
    }, 422, requestId);
  }

  if (decision === "confirm") {
    const identities = await loadAssistantProjectIdentities({ context: access.data.context, dataClass: access.data.dataClass });
    if (identities.status !== "succeeded") return json({ status: identities.status, detail: identities.warning, request_id: requestId }, identities.status === "not_configured" ? 503 : 500, requestId);
    let feishuConfig = null;
    try {
      feishuConfig = await getUserFeishuConfig(draft.requestedBy) ?? readFeishuConfig();
    } catch {
      return json({ status: "not_configured", detail: "草稿申请人的个人飞书凭据不可用，未创建写回队列。", request_id: requestId }, 503, requestId);
    }
    const current = await loadAssistantCurrentFacts({
      draft: { role: draft.businessRole, projectId: draft.projectId, sourceType: draft.sourceType, sourceRecordId: draft.sourceRecordId, changes: draft.changes },
      identities: identities.data ?? [],
      feishuConfig,
    });
    if (current.status !== "succeeded" || !current.data) return json({ status: current.status, detail: current.warning, request_id: requestId }, current.status === "conflict" ? 409 : 503, requestId);
    try {
      validateDraftChangesAgainstSnapshot({ role: draft.businessRole, projectId: draft.projectId, sourceType: draft.sourceType, sourceRecordId: draft.sourceRecordId, changes: draft.changes }, current.data);
    } catch (error) {
      return json({ status: "conflict", error: "CURRENT_FACT_CHANGED", detail: error instanceof Error ? error.message : "当前事实已变化。", current_facts: current.data, request_id: requestId }, 409, requestId);
    }

    const queued = await queueBusinessUpdateDraftWriteback({ draft, user, requestId });
    if (queued.status !== "succeeded" || !queued.data) return json({ status: queued.status, detail: queued.warning, request_id: requestId }, queued.status === "conflict" ? 409 : queued.status === "not_configured" ? 503 : 500, requestId);
    await writeOperationAudit({
      user,
      action: "business_update_draft_confirm_and_queue",
      resourceType: "business_update_draft",
      resourceId: id,
      status: "succeeded",
      severity: "high",
      summary: "业务变化草稿已确认并进入飞书Base写回确认队列",
      detail: { project_id: draft.projectId, changed_fields: draft.changes.map(item => item.field), writeback_status: "queued", feishu_confirmation_id: queued.data.confirmationId, data_class: draft.dataClass },
      requestId,
    });
    return json({
      status: "succeeded",
      draft: queued.data.draft,
      writeback_status: "queued",
      feishu_confirmation_id: queued.data.confirmationId,
      confirmation_url: `/integration-center?confirmation_id=${encodeURIComponent(queued.data.confirmationId)}`,
      boundary: "草稿已确认并原子化进入独立飞书写回确认队列；本次仍未改写业务主数据，请前往队列完成最终确认。",
      request_id: requestId,
    }, 202, requestId);
  }

  const result = await decideBusinessUpdateDraft({
    id,
    decision,
    cancelReason: typeof body.reason === "string" ? body.reason : null,
    user,
    context: access.data.context,
    dataClass: access.data.dataClass,
  });
  if (result.status !== "succeeded") return json({ status: result.status, detail: result.warning, draft: result.data, request_id: requestId }, result.status === "conflict" ? 409 : result.status === "not_found" ? 404 : result.status === "not_configured" ? 503 : 500, requestId);
  await writeOperationAudit({
    user,
    action: "business_update_draft_cancel",
    resourceType: "business_update_draft",
    resourceId: id,
    status: "succeeded",
    severity: "medium",
    summary: "取消业务变化草稿",
    detail: { project_id: draft.projectId, changed_fields: draft.changes.map(item => item.field), writeback_status: "not_requested" },
    requestId,
  });
  return json({
    status: "succeeded",
    draft: result.data,
    writeback_status: "not_requested",
    boundary: "草稿已取消。",
    request_id: requestId,
  }, 200, requestId);
}
