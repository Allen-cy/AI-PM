import { FeishuBaseClient, type FeishuRecordPage } from "./client.ts";
import type { FeishuConfig } from "./config.ts";
import {
  FEISHU_RECONCILE_DOMAINS,
  canonicalRowHash,
  normalizeFeishuRecord,
  type FeishuReconcileDataClass,
  type FeishuReconcileDomain,
  type NormalizedFeishuRecord,
} from "./reconcile-contract.ts";

type RpcError = { message?: string; code?: string } | null;

export interface ReconcileSupabaseClient {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: RpcError }>;
}

export interface ReconcileFeishuClient {
  listRecordsPage(
    domain: FeishuReconcileDomain,
    options?: { pageToken?: string; pageSize?: number },
  ): Promise<FeishuRecordPage>;
}

export interface RunFeishuReconcileInput {
  config: FeishuConfig;
  supabase: ReconcileSupabaseClient;
  client?: ReconcileFeishuClient;
  orgId: string;
  dataClass: FeishuReconcileDataClass;
  sourceScope: "organization" | "user";
  sourceUserId: string | null;
  triggerType: "manual" | "cron" | "retry" | "verification";
  domains: FeishuReconcileDomain[];
  idempotencyKey: string;
  expectedVersion: number;
  actorUserId: string | null;
  requestId: string;
  sourceCheckpoint: string;
}

interface BeginBatchResult {
  batch_id: string;
  status: string;
  created?: boolean;
  completed_domains?: string[];
  counts?: Record<string, number>;
}

interface FinalizedBatchResult extends Record<string, unknown> {
  id?: string;
  status?: string;
  total_records?: number;
  inserted_records?: number;
  updated_records?: number;
  unchanged_records?: number;
  tombstoned_records?: number;
  quarantined_records?: number;
  failed_records?: number;
  completed_at?: string;
}

export interface FeishuReconcileResult {
  batch_id: string;
  status: string;
  replayed: boolean;
  source: {
    type: "feishu";
    container: "飞书多维表格";
    scope: "organization" | "user";
  };
  data_class: FeishuReconcileDataClass;
  source_checkpoint: string;
  freshness: { latest_source_updated_at: string | null };
  data_quality: { status: "ready" | "attention"; quarantined: number; warnings: string[] };
  counts: Record<string, number>;
  domains: Array<{ domain: FeishuReconcileDomain; pages: number; source_records: number; quarantined: number }>;
}

export class FeishuReconcileError extends Error {
  constructor(message: string, readonly code: string, readonly status = 503) {
    super(message);
  }
}

function uniqueOrderedDomains(domains: FeishuReconcileDomain[]): FeishuReconcileDomain[] {
  const requested = new Set(domains);
  return FEISHU_RECONCILE_DOMAINS.filter(domain => requested.has(domain));
}

function validateInput(input: RunFeishuReconcileInput): FeishuReconcileDomain[] {
  if (input.expectedVersion !== 0) {
    throw new FeishuReconcileError("首次同步的 expected_version 必须为 0。", "EXPECTED_VERSION_CONFLICT", 409);
  }
  if (!input.idempotencyKey.trim()) {
    throw new FeishuReconcileError("同步请求必须提供幂等键。", "IDEMPOTENCY_KEY_REQUIRED", 400);
  }
  if (!input.orgId || !input.requestId || !input.sourceCheckpoint) {
    throw new FeishuReconcileError("同步上下文不完整。", "RECONCILE_CONTEXT_REQUIRED", 400);
  }
  const invalid = input.domains.filter(domain => !FEISHU_RECONCILE_DOMAINS.includes(domain));
  if (input.domains.length === 0 || invalid.length > 0) {
    throw new FeishuReconcileError("同步领域必须来自八类受治理数据。", "RECONCILE_DOMAIN_INVALID", 400);
  }
  const domains = uniqueOrderedDomains(input.domains);
  const missing = domains.filter(domain => !input.config.tables[domain]);
  if (missing.length > 0) {
    throw new FeishuReconcileError(`飞书缺少数据表配置：${missing.join("、")}`, "FEISHU_TABLE_NOT_CONFIGURED", 503);
  }
  if (input.sourceScope === "user" && !input.sourceUserId) {
    throw new FeishuReconcileError("个人飞书同步必须绑定当前用户。", "SOURCE_USER_REQUIRED", 400);
  }
  return domains;
}

async function callRpc<T>(
  supabase: ReconcileSupabaseClient,
  name: string,
  args: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw new FeishuReconcileError(error.message || `${name} failed`, error.code || "RECONCILE_STORAGE_FAILED");
  if (!data) throw new FeishuReconcileError(`${name} did not return data`, "RECONCILE_STORAGE_EMPTY");
  return data as T;
}

function countsFrom(value: BeginBatchResult | FinalizedBatchResult): Record<string, number> {
  const nested = (value as BeginBatchResult).counts;
  if (nested) return nested;
  const flat = value as FinalizedBatchResult;
  return {
    total: Number(flat.total_records ?? 0),
    inserted: Number(flat.inserted_records ?? 0),
    updated: Number(flat.updated_records ?? 0),
    unchanged: Number(flat.unchanged_records ?? 0),
    tombstoned: Number(flat.tombstoned_records ?? 0),
    quarantined: Number(flat.quarantined_records ?? 0),
    failed: Number(flat.failed_records ?? 0),
  };
}

function resultFromExisting(input: RunFeishuReconcileInput, batch: BeginBatchResult): FeishuReconcileResult {
  const counts = countsFrom(batch);
  const quarantined = Number(counts.quarantined ?? 0);
  return {
    batch_id: batch.batch_id,
    status: batch.status,
    replayed: true,
    source: { type: "feishu", container: "飞书多维表格", scope: input.sourceScope },
    data_class: input.dataClass,
    source_checkpoint: input.sourceCheckpoint,
    freshness: { latest_source_updated_at: null },
    data_quality: {
      status: quarantined > 0 ? "attention" : "ready",
      quarantined,
      warnings: quarantined > 0 ? ["存在隔离记录，请在数据与集成中心处理。"] : [],
    },
    counts,
    domains: [],
  };
}

export async function runFeishuReconcile(input: RunFeishuReconcileInput): Promise<FeishuReconcileResult> {
  const domains = validateInput(input);
  const requestFingerprint = await canonicalRowHash({
    org_id: input.orgId,
    data_class: input.dataClass,
    source_scope: input.sourceScope,
    source_user_id: input.sourceUserId,
    source_container_id: input.config.baseToken,
    domains,
    source_checkpoint: input.sourceCheckpoint,
    expected_version: input.expectedVersion,
  });
  const begin = await callRpc<BeginBatchResult>(input.supabase, "begin_feishu_reconcile_batch_tx", {
    p_org_id: input.orgId,
    p_data_class: input.dataClass,
    p_source_scope: input.sourceScope,
    p_source_user_id: input.sourceUserId,
    p_source_container_id: input.config.baseToken,
    p_trigger_type: input.triggerType,
    p_requested_domains: domains,
    p_source_checkpoint: input.sourceCheckpoint,
    p_idempotency_key: input.idempotencyKey,
    p_request_fingerprint: requestFingerprint,
    p_expected_version: input.expectedVersion,
    p_actor_user_id: input.actorUserId,
    p_request_id: input.requestId,
  });
  if (begin.status !== "running") return resultFromExisting(input, begin);

  const batchId = begin.batch_id;
  const completed = new Set(begin.completed_domains ?? []);
  const client = input.client ?? new FeishuBaseClient(input.config);
  const domainResults: FeishuReconcileResult["domains"] = [];
  let latestSourceUpdatedAt: string | null = null;
  let normalizedQuarantineCount = 0;

  try {
    for (const domain of domains) {
      if (completed.has(domain)) continue;
      const normalized: NormalizedFeishuRecord[] = [];
      let pageToken: string | undefined;
      let pages = 0;
      do {
        if (pages >= 200) throw new FeishuReconcileError("飞书分页超过安全上限。", "FEISHU_PAGE_LIMIT_EXCEEDED");
        const page = await client.listRecordsPage(domain, { pageToken, pageSize: 100 });
        pages += 1;
        for (const record of page.records) {
          const item = await normalizeFeishuRecord(domain, record, {
            sourceContainerId: input.config.baseToken,
            requestedDataClass: input.dataClass,
          });
          normalized.push(item);
          if (item.quality.status === "quarantine") normalizedQuarantineCount += 1;
          if (item.source.updated_at && (!latestSourceUpdatedAt || item.source.updated_at > latestSourceUpdatedAt)) {
            latestSourceUpdatedAt = item.source.updated_at;
          }
        }
        if (normalized.length > 20000) throw new FeishuReconcileError("单表记录超过安全上限。", "FEISHU_RECORD_LIMIT_EXCEEDED");
        pageToken = page.hasMore ? page.nextPageToken : undefined;
        if (page.hasMore && !page.nextPageToken) {
          throw new FeishuReconcileError("飞书返回了不完整的分页游标。", "FEISHU_CURSOR_MISSING");
        }
      } while (pageToken);

      const seenRecordIds = normalized
        .filter(item => item.data_class === input.dataClass)
        .map(item => item.source.record_id);
      await callRpc(input.supabase, "apply_feishu_reconcile_domain_tx", {
        p_batch_id: batchId,
        p_domain: domain,
        p_records: normalized,
        p_seen_record_ids: seenRecordIds,
        p_source_page_count: pages,
        p_full_snapshot: true,
        p_actor_user_id: input.actorUserId,
        p_request_id: input.requestId,
      });
      domainResults.push({
        domain,
        pages,
        source_records: normalized.length,
        quarantined: normalized.filter(item => item.quality.status === "quarantine").length,
      });
    }

    const finalized = await callRpc<FinalizedBatchResult>(input.supabase, "finalize_feishu_reconcile_batch_tx", {
      p_batch_id: batchId,
      p_actor_user_id: input.actorUserId,
      p_request_id: input.requestId,
    });
    const counts = countsFrom(finalized);
    const quarantined = Math.max(normalizedQuarantineCount, Number(counts.quarantined ?? 0));
    return {
      batch_id: String(finalized.id ?? batchId),
      status: String(finalized.status ?? "completed"),
      replayed: false,
      source: { type: "feishu", container: "飞书多维表格", scope: input.sourceScope },
      data_class: input.dataClass,
      source_checkpoint: input.sourceCheckpoint,
      freshness: { latest_source_updated_at: latestSourceUpdatedAt },
      data_quality: {
        status: quarantined > 0 ? "attention" : "ready",
        quarantined,
        warnings: quarantined > 0 ? ["存在隔离记录，请在数据与集成中心处理。"] : [],
      },
      counts,
      domains: domainResults,
    };
  } catch (error) {
    const failure = error instanceof FeishuReconcileError
      ? error
      : new FeishuReconcileError("飞书真实数据对账失败。", "RECONCILE_FAILED");
    await input.supabase.rpc("fail_feishu_reconcile_batch_tx", {
      p_batch_id: batchId,
      p_error_code: failure.code,
      p_error_detail: failure.message.slice(0, 1000),
      p_actor_user_id: input.actorUserId,
      p_request_id: input.requestId,
    });
    throw failure;
  }
}
