import { getAuthSupabase, type AppUser } from "../auth/server.ts";
import type { FeishuActionConfirmationRecord } from "./action-confirmations.ts";
import { validateFeishuActionBody } from "./action-payload.ts";
import { FeishuApiError, FeishuBaseClient } from "./client.ts";
import { currentChineseDataClass, dataClassificationPayloadMatchesDraft } from "./classification-writeback.ts";
import {
  claimDataClassificationWriteback,
  finalizeDataClassificationWriteback,
  getDataClassificationDraftByConfirmation,
  type DataClassificationDraftRecord,
} from "./classification-writeback-repository.ts";
import { getUserFeishuConfig } from "./user-config.ts";
import { isBusinessWritebackLeaseLive } from "../operating-assistant/writeback-values.ts";

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

  const claimed = await claimDataClassificationWriteback({ confirmationId: input.confirmation.id, actorUserId: input.actor.id });
  if (claimed.status !== "succeeded") return { status: claimed.status === "not_configured" ? "not_configured" : claimed.status === "forbidden" ? "forbidden" : "conflict", warning: claimed.warning };
  const client = new FeishuBaseClient(config);
  let ledgerRecordId: string | undefined;
  let ledgerShouldFail = false;
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
    if (!alreadyApplied) updateResource = { ...await client.updateRecord(draft.domain, draft.sourceRecordId, { 数据分类: draft.targetChineseValue }) };
    await client.completeEvent(ledgerRecordId);
    const resource = { ...updateResource, tableKey: draft.domain, ledgerRecordId, alreadyApplied, feishuSource: "user", targetDataClass: draft.targetDataClass };
    const finalized = await finalizeWithRetry({ confirmationId: input.confirmation.id, expectedAttempt: claimed.data.attempt, status: "succeeded", resource, actorUserId: input.actor.id });
    if (finalized.status !== "succeeded") return { status: "failed", warning: "飞书分类已更新，但本地状态对账失败；请勿重复改写。", resource, errorCode: "V666_STATUS_RECONCILIATION_REQUIRED" };
    return { status: alreadyApplied ? "duplicate" : "succeeded", draft: finalized.data, resource, feishuSource: "user" };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const code = error instanceof FeishuApiError ? error.code : [
      "V666_CURRENT_CLASSIFICATION_CHANGED", "V666_WRITEBACK_LEASE_EXPIRED", "V666_LEDGER_RETRY_EXHAUSTED", "V666_LEDGER_FACT_DIVERGED",
    ].includes(message) ? message : "V666_BASE_UPDATE_FAILED";
    if (ledgerRecordId && ledgerShouldFail) {
      try { await client.failEvent(ledgerRecordId, code); } catch { /* Supabase remains the recovery source. */ }
    }
    const finalized = await finalizeWithRetry({ confirmationId: input.confirmation.id, expectedAttempt: claimed.data.attempt, status: "failed", errorCode: code, actorUserId: input.actor.id });
    const warning = code === "V666_CURRENT_CLASSIFICATION_CHANGED" ? "飞书当前数据分类已经变化，系统未覆盖他人的新值。"
      : code === "V666_WRITEBACK_LEASE_EXPIRED" ? "分类写回租约已过期，系统未改写飞书。"
        : code === "V666_LEDGER_RETRY_EXHAUSTED" ? "同步流水重试次数已用尽，系统未重复改写。"
          : code === "V666_LEDGER_FACT_DIVERGED" ? "同步流水显示成功但当前分类不一致，系统未重复改写。"
            : `飞书数据分类写回失败：${code}`;
    return { status: code.includes("CHANGED") || code.includes("DIVERGED") ? "conflict" : "failed", warning, draft: finalized.data, feishuSource: "user", errorCode: code };
  }
}
