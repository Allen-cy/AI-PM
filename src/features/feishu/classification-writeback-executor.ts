import { getAuthSupabase, type AppUser } from "../auth/server.ts";
import type { FeishuActionConfirmationRecord } from "./action-confirmations.ts";
import { validateFeishuActionBody } from "./action-payload.ts";
import { FeishuApiError, FeishuBaseClient } from "./client.ts";
import {
  currentChineseDataClass,
  dataClassificationFeishuScopeMatches,
  dataClassificationPayloadMatchesDraft,
} from "./classification-writeback.ts";
import {
  claimDataClassificationWriteback,
  finalizeDataClassificationWriteback,
  getDataClassificationDraftByConfirmation,
  type DataClassificationDraftRecord,
} from "./classification-writeback-repository.ts";
import { getOrganizationFeishuConfig, getUserFeishuConfig } from "./user-config.ts";
import { isBusinessWritebackLeaseLive } from "../operating-assistant/writeback-values.ts";
import { FeishuReconcileError, runFeishuTargetedReconcile } from "./reconcile-service.ts";

type Status = "succeeded" | "duplicate" | "not_configured" | "forbidden" | "conflict" | "failed";

export type DataClassificationWritebackExecution = {
  status: Status;
  warning?: string;
  draft?: DataClassificationDraftRecord;
  resource?: Record<string, unknown>;
  feishuSource?: "user";
  errorCode?: string;
};

function same(left: unknown, right: unknown): boolean {
  return String(left ?? "").trim() === String(right ?? "").trim();
}

async function requester(userId: string): Promise<AppUser | null> {
  const { data, error } = await getAuthSupabase().from("app_users").select("id,email,phone,name,role,status")
    .eq("id", userId).eq("status", "active").maybeSingle();
  return error || !data ? null : data as AppUser;
}

async function finalizeWithRetry(input: Parameters<typeof finalizeDataClassificationWriteback>[0]) {
  const first = await finalizeDataClassificationWriteback(input);
  if (first.status === "succeeded") return first;
  return finalizeDataClassificationWriteback(input);
}

export async function executeDataClassificationWriteback(input: {
  confirmation: FeishuActionConfirmationRecord;
  actor: AppUser;
}): Promise<DataClassificationWritebackExecution> {
  try {
    validateFeishuActionBody(input.confirmation.payload);
  } catch {
    return { status: "conflict", warning: "数据分类写回载荷不合法。", errorCode: "V666_PAYLOAD_INVALID" };
  }
  const linked = await getDataClassificationDraftByConfirmation(input.confirmation.id);
  if (linked.status !== "succeeded") return { status: linked.status === "not_configured" ? "not_configured" : "conflict", warning: linked.warning };
  const draft = linked.data;
  if (!dataClassificationPayloadMatchesDraft(input.confirmation.payload, draft)
    || input.confirmation.requesterId !== draft.requestedBy
    || input.confirmation.projectId !== null) {
    return { status: "conflict", warning: "确认队列与分类草稿的稳定标识不一致。", errorCode: "V666_DRAFT_LINK_MISMATCH" };
  }
  const owner = await requester(draft.requestedBy);
  if (!owner) return { status: "forbidden", warning: "分类申请人不存在或已停用。", errorCode: "V666_REQUESTER_INACTIVE" };
  let config;
  try { config = await getUserFeishuConfig(owner.id); } catch { config = null; }
  if (!config) return { status: "not_configured", warning: "分类申请人尚未配置个人飞书；系统不会回退到管理员身份。", errorCode: "V666_PERSONAL_FEISHU_REQUIRED" };
  if (!config.tables[draft.domain]) return { status: "not_configured", warning: `个人飞书配置缺少 ${draft.domain} 表ID。`, errorCode: "V666_TABLE_NOT_CONFIGURED" };
  if (!config.tables.syncLedger) return { status: "not_configured", warning: "个人飞书配置缺少同步流水表，不能执行受控分类写回。", errorCode: "V666_SYNC_LEDGER_NOT_CONFIGURED" };
  let organizationConfig;
  try { organizationConfig = (await getOrganizationFeishuConfig(draft.orgId)).config; } catch { organizationConfig = null; }
  if (!organizationConfig || !organizationConfig.tables[draft.domain]) {
    return { status: "not_configured", warning: "组织共享飞书事实源未配置目标数据表，分类写回后将无法形成真实镜像。", errorCode: "V667_ORGANIZATION_RECONCILE_CONFIG_REQUIRED" };
  }
  if (!dataClassificationFeishuScopeMatches(config, organizationConfig, draft.domain)) {
    return { status: "conflict", warning: "个人飞书连接与组织共享事实源不是同一Base或表映射；系统已阻止跨台账改写。", errorCode: "V667_PERSONAL_ORGANIZATION_BASE_MISMATCH" };
  }

  const claimed = await claimDataClassificationWriteback({ confirmationId: input.confirmation.id, actorUserId: input.actor.id });
  if (claimed.status !== "succeeded") return { status: claimed.status === "not_configured" ? "not_configured" : claimed.status === "forbidden" ? "forbidden" : "conflict", warning: claimed.warning };
  const client = new FeishuBaseClient(config);
  let ledgerRecordId: string | undefined;
  let ledgerShouldFail = false;
  let writeApplied = false;
  let partialResource: Record<string, unknown> | undefined;
  try {
    const current = await client.getRecord(draft.domain, draft.sourceRecordId);
    const currentValue = currentChineseDataClass(current.fields);
    const alreadyApplied = same(currentValue, draft.targetChineseValue);
    if (!alreadyApplied && !same(currentValue, draft.expectedChineseValue)) throw new Error("V666_CURRENT_CLASSIFICATION_CHANGED");
    const ledger = await client.claimEvent({
      eventId: `data-classification:${draft.id}:v${draft.version}`,
      eventType: "action.data_classification_update",
      payload: input.confirmation.payload,
      occurredAt: Date.now(),
    });
    ledgerRecordId = ledger.recordId;
    ledgerShouldFail = ledger.claimed || ledger.status === "pending";
    if (!isBusinessWritebackLeaseLive(claimed.data.leaseExpiresAt)) {
      ledgerShouldFail = false;
      throw new Error("V666_WRITEBACK_LEASE_EXPIRED");
    }
    if (!ledger.claimed && ledger.status === "failed" && !alreadyApplied) throw new Error("V666_LEDGER_RETRY_EXHAUSTED");
    if (!ledger.claimed && ledger.status === "succeeded" && !alreadyApplied) throw new Error("V666_LEDGER_FACT_DIVERGED");
    let updateResource: Record<string, unknown> = { recordId: draft.sourceRecordId };
    if (!alreadyApplied) {
      updateResource = { ...await client.updateRecord(draft.domain, draft.sourceRecordId, { 数据分类: draft.targetChineseValue }) };
      writeApplied = true;
    }
    await client.completeEvent(ledgerRecordId);
    ledgerShouldFail = false;
    partialResource = { ...updateResource, tableKey: draft.domain, ledgerRecordId, alreadyApplied, writeApplied, feishuSource: "user", targetDataClass: draft.targetDataClass };
    const reconcile = await runFeishuTargetedReconcile({
      config: organizationConfig,
      supabase: getAuthSupabase(),
      orgId: draft.orgId,
      dataClass: draft.targetDataClass,
      sourceScope: "organization",
      sourceUserId: null,
      triggerType: "verification",
      domain: draft.domain,
      sourceRecordId: draft.sourceRecordId,
      idempotencyKey: `classification-reconcile:${draft.id}:v${draft.version}:a${claimed.data.attempt}`,
      expectedVersion: 0,
      actorUserId: input.actor.id,
      requestId: `${input.confirmation.requestId || input.confirmation.id}:classification-reconcile:a${claimed.data.attempt}`,
      sourceCheckpoint: `data-classification:${draft.id}:v${draft.version}:a${claimed.data.attempt}`,
    });
    if (!["completed", "completed_with_warnings"].includes(reconcile.status)
      || Number(reconcile.counts.failed ?? 0) > 0
      || Number(reconcile.counts.quarantined ?? 0) > 0) {
      throw new Error("V667_TARGET_RECORD_NOT_MIRRORED");
    }
    const resource = {
      ...partialResource,
      reconcileBatchId: reconcile.batch_id,
      reconcileStatus: reconcile.status,
      reconcileDataClass: reconcile.data_class,
      reconcileSnapshot: reconcile.source.snapshot,
      reconcileCounts: reconcile.counts,
      reconcileReplayed: reconcile.replayed,
    };
    const finalized = await finalizeWithRetry({ confirmationId: input.confirmation.id, expectedAttempt: claimed.data.attempt, status: "succeeded", resource, actorUserId: input.actor.id });
    if (finalized.status !== "succeeded") return { status: "failed", warning: "飞书分类已更新，但本地状态对账失败；请勿重复改写。", resource, errorCode: "V666_STATUS_RECONCILIATION_REQUIRED" };
    return { status: alreadyApplied ? "duplicate" : "succeeded", draft: finalized.data, resource, feishuSource: "user" };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const code = error instanceof FeishuReconcileError ? `V667_TARGET_RECONCILE_${error.code}`.slice(0, 160)
      : error instanceof FeishuApiError ? error.code : [
      "V666_CURRENT_CLASSIFICATION_CHANGED", "V666_WRITEBACK_LEASE_EXPIRED", "V666_LEDGER_RETRY_EXHAUSTED", "V666_LEDGER_FACT_DIVERGED",
      "V667_TARGET_RECORD_NOT_MIRRORED",
    ].includes(message) ? message : "V666_BASE_UPDATE_FAILED";
    if (ledgerRecordId && ledgerShouldFail) {
      try { await client.failEvent(ledgerRecordId, code); } catch { /* Supabase remains the recovery source. */ }
    }
    const finalized = await finalizeWithRetry({ confirmationId: input.confirmation.id, expectedAttempt: claimed.data.attempt, status: "failed", errorCode: code, actorUserId: input.actor.id });
    const warning = code.startsWith("V667_TARGET_RECONCILE_") || code === "V667_TARGET_RECORD_NOT_MIRRORED"
      ? "飞书数据分类已经更新，但目标数据空间的定向镜像对账尚未完成。系统已保留失败状态；可在确认队列重试，重试不会重复改写飞书。"
      : code === "V666_CURRENT_CLASSIFICATION_CHANGED" ? "飞书当前数据分类已经变化，系统未覆盖他人的新值。"
      : code === "V666_WRITEBACK_LEASE_EXPIRED" ? "分类写回租约已过期，系统未改写飞书。"
        : code === "V666_LEDGER_RETRY_EXHAUSTED" ? "同步流水重试次数已用尽，系统未重复改写。"
          : code === "V666_LEDGER_FACT_DIVERGED" ? "同步流水显示成功但当前分类不一致，系统未重复改写。"
            : `飞书数据分类写回失败：${code}`;
    return { status: code.includes("CHANGED") || code.includes("DIVERGED") ? "conflict" : "failed", warning, draft: finalized.data, resource: partialResource, feishuSource: "user", errorCode: code };
  }
}
