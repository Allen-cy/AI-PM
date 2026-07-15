import { getAuthSupabase, type AppUser } from "../auth/server.ts";
import type { FeishuActionConfirmationRecord } from "../feishu/action-confirmations.ts";
import { validateFeishuActionBody, type FeishuActionBody } from "../feishu/action-payload.ts";
import { FeishuApiError, FeishuBaseClient } from "../feishu/client.ts";
import { type FeishuConfig, type FeishuTableKey } from "../feishu/config.ts";
import { getUserFeishuConfig } from "../feishu/user-config.ts";
import { resolveBusinessContext } from "../operating-model/context.ts";
import { listBusinessRoleAssignments } from "../operating-model/persistence.ts";
import { authorizeAssistantProject } from "./access.ts";
import {
  claimBusinessUpdateWriteback,
  finalizeBusinessUpdateWriteback,
  getBusinessUpdateDraftByConfirmation,
  loadAssistantProjectIdentities,
  type BusinessUpdateDraftRecord,
} from "./repository.ts";
import { loadAssistantCurrentFacts } from "./source.ts";
import {
  businessWritebackFactsMatch,
  businessWritebackPayloadMatchesDraft,
  decideBusinessWritebackLedgerAction,
  isBusinessWritebackLeaseLive,
  normalizeBusinessWritebackFields,
} from "./writeback-values.ts";

type ExecutionStatus = "succeeded" | "duplicate" | "not_configured" | "forbidden" | "conflict" | "failed";

export interface BusinessUpdateWritebackExecution {
  status: ExecutionStatus;
  warning?: string;
  draft?: BusinessUpdateDraftRecord;
  resource?: Record<string, unknown>;
  feishuSource?: "user";
  errorCode?: string;
}

function actionForDraft(draft: BusinessUpdateDraftRecord) {
  return draft.businessRole === "operations" ? "operations.update" as const : "milestone.update" as const;
}

async function loadRequester(draft: BusinessUpdateDraftRecord): Promise<AppUser | null> {
  const { data, error } = await getAuthSupabase().from("app_users")
    .select("id,email,phone,name,role,status")
    .eq("id", draft.requestedBy)
    .eq("status", "active")
    .maybeSingle();
  return error || !data ? null : data as AppUser;
}

async function loadFeishuForRequester(userId: string): Promise<{ config: FeishuConfig | null; source?: "user" }> {
  const personal = await getUserFeishuConfig(userId);
  if (personal) return { config: personal, source: "user" };
  return { config: null };
}

async function finalizeWithRetry(input: Parameters<typeof finalizeBusinessUpdateWriteback>[0]): ReturnType<typeof finalizeBusinessUpdateWriteback> {
  const first = await finalizeBusinessUpdateWriteback(input);
  if (first.status === "succeeded") return first;
  return finalizeBusinessUpdateWriteback(input);
}

export async function executeBusinessUpdateWriteback(input: {
  confirmation: FeishuActionConfirmationRecord;
  actor: AppUser;
}): Promise<BusinessUpdateWritebackExecution> {
  if (input.confirmation.actionType !== "base_record_update") return { status: "conflict", warning: "该确认不是多维表格记录更新。" };
  try {
    validateFeishuActionBody(input.confirmation.payload);
  } catch {
    return { status: "conflict", warning: "飞书Base写回载荷不合法。", errorCode: "P19_WRITEBACK_PAYLOAD_INVALID" };
  }

  const linked = await getBusinessUpdateDraftByConfirmation(input.confirmation.id);
  if (linked.status !== "succeeded" || !linked.data) return { status: linked.status === "not_configured" ? "not_configured" : "conflict", warning: linked.warning };
  const draft = linked.data;
  const payload = input.confirmation.payload as FeishuActionBody;
  if (
    payload.business_update_draft_id !== draft.id
    || payload.org_id !== draft.orgId
    || payload.project_id !== draft.projectId
    || payload.data_class !== draft.dataClass
    || payload.table_key !== draft.sourceType
    || payload.record_id !== draft.sourceRecordId
    || input.confirmation.requesterId !== draft.requestedBy
  ) return { status: "conflict", warning: "确认队列与业务草稿的稳定标识不一致。", errorCode: "P19_WRITEBACK_LINK_MISMATCH" };
  if (!businessWritebackPayloadMatchesDraft(payload, draft)) {
    return { status: "conflict", warning: "确认队列的字段值或幂等版本与已确认草稿不一致。", errorCode: "P19_WRITEBACK_DRAFT_PAYLOAD_MISMATCH" };
  }
  if (draft.sourceType === "action") return { status: "conflict", warning: "行动项必须通过Supabase受控状态机处理，不支持飞书Base写回。", errorCode: "P19_ACTION_SOURCE_NOT_EXECUTABLE" };

  const requester = await loadRequester(draft);
  if (!requester) return { status: "forbidden", warning: "草稿申请人不存在或已停用。", errorCode: "P19_REQUESTER_INACTIVE" };
  const assignments = await listBusinessRoleAssignments(requester.id);
  if (assignments.status !== "succeeded") return { status: assignments.status === "not_configured" ? "not_configured" : "failed", warning: assignments.warning };
  const context = resolveBusinessContext({
    user: { id: requester.id, systemRole: requester.role },
    assignments: assignments.data ?? [],
    requestedRole: draft.businessRole,
    requestedOrgId: draft.orgId,
    requestedSubjectScope: draft.subjectScope,
    requestedSubjectId: draft.subjectId,
  });
  if (!context) return { status: "forbidden", warning: "草稿申请人的业务角色授权已失效。", errorCode: "P19_ROLE_ASSIGNMENT_EXPIRED" };
  const access = await authorizeAssistantProject({ user: requester, context, projectId: draft.projectId, dataClass: draft.dataClass, action: actionForDraft(draft) });
  if (!access.allowed) return { status: "forbidden", warning: access.warning ?? "申请人已无权更新该项目。", errorCode: "P19_PROJECT_ACCESS_REVOKED" };

  let effective: { config: FeishuConfig | null; source?: "user" };
  try {
    effective = await loadFeishuForRequester(requester.id);
  } catch {
    return { status: "not_configured", warning: "申请人的个人飞书凭据不可用。", errorCode: "P19_PERSONAL_FEISHU_UNAVAILABLE" };
  }
  if (!effective.config || !effective.source) return { status: "not_configured", warning: "申请人未配置个人飞书；为避免借用管理员身份，系统不会执行写回。", errorCode: "P19_PERSONAL_FEISHU_REQUIRED" };
  const tableKey = String(payload.table_key) as FeishuTableKey;
  if (!effective.config.tables[tableKey]) return { status: "not_configured", warning: `飞书配置缺少 ${tableKey} 表ID。`, errorCode: "P19_FEISHU_TABLE_NOT_CONFIGURED" };
  if (!effective.config.tables.syncLedger) return { status: "not_configured", warning: "飞书配置缺少同步流水表ID，不允许执行受控写回。", errorCode: "P19_SYNC_LEDGER_NOT_CONFIGURED" };

  const claimed = await claimBusinessUpdateWriteback({ confirmationId: input.confirmation.id, actorUserId: input.actor.id });
  if (claimed.status !== "succeeded" || !claimed.data) return { status: claimed.status === "not_configured" ? "not_configured" : "conflict", warning: claimed.warning };
  const writebackAttempt = claimed.data.attempt;
  const leaseExpiresAt = claimed.data.leaseExpiresAt;

  const client = new FeishuBaseClient(effective.config);
  let ledgerRecordId: string | undefined;
  let ledgerShouldFail = false;
  try {
    const identities = await loadAssistantProjectIdentities({ context, dataClass: draft.dataClass });
    if (identities.status !== "succeeded") throw new Error(identities.warning ?? "P19_PROJECT_IDENTITIES_UNAVAILABLE");
    // Re-read current facts after the queue is atomically claimed; stale facts never reach Base update.
    const current = await loadAssistantCurrentFacts({
      draft: { role: draft.businessRole, projectId: draft.projectId, sourceType: draft.sourceType, sourceRecordId: draft.sourceRecordId, changes: draft.changes },
      identities: identities.data ?? [],
      feishuConfig: effective.config,
    });
    if (current.status !== "succeeded" || !current.data) throw new Error(current.warning ?? "CURRENT_FACT_LOAD_FAILED");
    const expected = payload.expected_fields as Record<string, unknown>;
    const proposed = payload.fields as Record<string, unknown>;
    const alreadyApplied = businessWritebackFactsMatch(proposed, current.data);
    if (!alreadyApplied && !businessWritebackFactsMatch(expected, current.data)) throw new Error("CURRENT_FACT_CHANGED");

    const claim = await client.claimEvent({
      eventId: `business-update:${draft.id}:v${draft.version}`,
      eventType: "action.base_record_update",
      payload,
      occurredAt: Date.now(),
    });
    ledgerRecordId = claim.recordId;
    ledgerShouldFail = claim.claimed || claim.status === "pending";
    const ledgerAction = decideBusinessWritebackLedgerAction({ ...claim, alreadyApplied });
    if (ledgerAction === "conflict") throw new Error("P19_LEDGER_SUCCEEDED_FACT_DIVERGED");
    if (ledgerAction === "retry_exhausted") throw new Error("P19_LEDGER_RETRY_EXHAUSTED");
    if (!isBusinessWritebackLeaseLive(leaseExpiresAt)) {
      ledgerShouldFail = false;
      throw new Error("P19_WRITEBACK_LEASE_EXPIRED");
    }
    if (ledgerAction === "reconcile") {
      await client.completeEvent(ledgerRecordId);
      const resource = { recordId: draft.sourceRecordId, tableKey, ledgerRecordId, ledgerDuplicate: !claim.claimed, ledgerStatus: claim.status, alreadyApplied: true, feishuSource: effective.source };
      const finalized = await finalizeWithRetry({ confirmationId: input.confirmation.id, expectedAttempt: writebackAttempt, status: "succeeded", resource });
      if (finalized.status !== "succeeded") return { status: "failed", warning: "业务记录已是目标值，但队列状态对账失败，请人工复核。", errorCode: "P19_STATUS_RECONCILIATION_REQUIRED" };
      return { status: "duplicate", draft: finalized.data, resource, feishuSource: effective.source };
    }
    const normalizedFields = normalizeBusinessWritebackFields({ proposed, current: current.data });
    const resource = await client.updateRecord(tableKey, draft.sourceRecordId, normalizedFields);
    await client.completeEvent(ledgerRecordId);
    const persistedResource = { ...resource, tableKey, ledgerRecordId, ledgerDuplicate: !claim.claimed, ledgerStatus: claim.status, feishuSource: effective.source, fields: Object.keys(normalizedFields) };
    const finalized = await finalizeWithRetry({ confirmationId: input.confirmation.id, expectedAttempt: writebackAttempt, status: "succeeded", resource: persistedResource });
    if (finalized.status !== "succeeded") return { status: "failed", warning: "飞书记录已更新，但本地队列状态对账失败；同步流水可用于恢复，请勿重复改写。", resource: persistedResource, errorCode: "P19_STATUS_RECONCILIATION_REQUIRED" };
    return { status: "succeeded", draft: finalized.data, resource: persistedResource, feishuSource: effective.source };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const code = error instanceof FeishuApiError ? error.code
      : ["CURRENT_FACT_CHANGED", "P19_LEDGER_SUCCEEDED_FACT_DIVERGED", "P19_LEDGER_RETRY_EXHAUSTED", "P19_WRITEBACK_LEASE_EXPIRED"].includes(message)
        ? message : "P19_BASE_UPDATE_FAILED";
    if (ledgerRecordId && ledgerShouldFail) {
      try { await client.failEvent(ledgerRecordId, code); } catch { /* the Supabase failure state remains the recovery source */ }
    }
    const failed = await finalizeWithRetry({ confirmationId: input.confirmation.id, expectedAttempt: writebackAttempt, status: "failed", errorCode: code });
    const warning = code === "CURRENT_FACT_CHANGED"
      ? "最终确认前的当前事实已变化，系统未写回飞书。"
      : code === "P19_LEDGER_SUCCEEDED_FACT_DIVERGED"
        ? "同步流水已记录成功，但当前业务事实与目标值不一致；系统未重复改写，请人工复核。"
        : code === "P19_LEDGER_RETRY_EXHAUSTED"
          ? "同步流水的有界重试次数已用尽，系统未写回飞书。"
          : code === "P19_WRITEBACK_LEASE_EXPIRED"
            ? "本次写回租约已过期，系统未改写飞书；请在确认队列中重新执行恢复。"
          : `飞书Base写回失败：${code}`;
    return {
      status: code === "CURRENT_FACT_CHANGED" || code === "P19_LEDGER_SUCCEEDED_FACT_DIVERGED" ? "conflict" : "failed",
      warning,
      draft: failed.data,
      feishuSource: effective.source,
      errorCode: code,
    };
  }
}
