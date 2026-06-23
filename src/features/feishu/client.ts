import type { FeishuConfig, FeishuTableKey } from './config.ts';

interface TenantTokenResponse {
  code: number;
  msg?: string;
  tenant_access_token?: string;
  expire?: number;
}

interface TableListResponse {
  code: number;
  msg?: string;
  data?: {
    items?: Array<{ table_id: string; name: string }>;
  };
}

interface RecordSearchResponse {
  code: number;
  msg?: string;
  data?: {
    items?: Array<{
      record_id: string;
      fields?: Record<string, unknown>;
    }>;
  };
}

interface RecordCreateResponse {
  code: number;
  msg?: string;
  data?: {
    record?: { record_id: string };
  };
}

export interface FeishuEventClaimInput {
  eventId: string;
  eventType: string;
  payload: unknown;
  occurredAt?: number;
}

export interface FeishuEventClaim {
  claimed: boolean;
  recordId: string;
}

export interface FeishuHealth {
  status: 'ok' | 'degraded';
  identity: 'bot';
  base_accessible: boolean;
  table_count: number;
  configured_table_count: number;
  missing_required_tables: FeishuTableKey[];
}

export class FeishuApiError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
  }
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export class FeishuBaseClient {
  private tenantToken?: { value: string; expiresAt: number };

  constructor(
    private readonly config: FeishuConfig,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  private async getTenantToken(): Promise<string> {
    if (this.tenantToken && this.tenantToken.expiresAt > Date.now()) {
      return this.tenantToken.value;
    }

    const response = await this.fetcher(
      'https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          app_id: this.config.appId,
          app_secret: this.config.appSecret,
        }),
      },
    );
    if (!response.ok) {
      throw new FeishuApiError('Feishu authentication request failed.', 'FEISHU_AUTH_HTTP_ERROR');
    }

    const payload = await response.json() as TenantTokenResponse;
    if (payload.code !== 0 || !payload.tenant_access_token) {
      throw new FeishuApiError('Feishu application identity is not authorized.', `FEISHU_AUTH_${payload.code}`);
    }

    const ttl = Math.max(60, (payload.expire ?? 7200) - 60);
    this.tenantToken = {
      value: payload.tenant_access_token,
      expiresAt: Date.now() + ttl * 1000,
    };
    return payload.tenant_access_token;
  }

  private async listTables(): Promise<Array<{ table_id: string; name: string }>> {
    const token = await this.getTenantToken();
    const url = new URL(
      `https://open.feishu.cn/open-apis/base/v3/bases/${encodeURIComponent(this.config.baseToken)}/tables`,
    );
    url.searchParams.set('page_size', '100');
    const response = await this.fetcher(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      throw new FeishuApiError('Feishu Base table request failed.', 'FEISHU_BASE_HTTP_ERROR');
    }

    const payload = await response.json() as TableListResponse;
    if (payload.code !== 0) {
      throw new FeishuApiError('Feishu Base is not accessible to the configured app.', `FEISHU_BASE_${payload.code}`);
    }
    return payload.data?.items ?? [];
  }

  async claimEvent(input: FeishuEventClaimInput): Promise<FeishuEventClaim> {
    const tableId = this.config.tables.syncLedger;
    if (!tableId) {
      throw new FeishuApiError('Feishu sync ledger table is not configured.', 'FEISHU_SYNC_LEDGER_NOT_CONFIGURED');
    }

    const token = await this.getTenantToken();
    const recordsUrl = `https://open.feishu.cn/open-apis/base/v3/bases/${encodeURIComponent(this.config.baseToken)}/tables/${encodeURIComponent(tableId)}/records`;
    const idempotencyKey = `feishu:${input.eventId}`;
    const headers = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
    const searchResponse = await this.fetcher(`${recordsUrl}/search`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        page_size: 1,
        filter: {
          conjunction: 'and',
          conditions: [{
            field_name: 'idempotency_key',
            operator: 'is',
            value: [idempotencyKey],
          }],
        },
      }),
    });
    if (!searchResponse.ok) {
      throw new FeishuApiError('Feishu sync ledger search failed.', 'FEISHU_LEDGER_SEARCH_HTTP_ERROR');
    }
    const search = await searchResponse.json() as RecordSearchResponse;
    if (search.code !== 0) {
      throw new FeishuApiError('Feishu sync ledger search was rejected.', `FEISHU_LEDGER_SEARCH_${search.code}`);
    }
    const existing = search.data?.items?.[0];
    if (existing) {
      const status = existing.fields?.['处理状态'];
      const attempts = Number(existing.fields?.['尝试次数'] ?? 0);
      if (status === 'failed' && attempts < 3) {
        const retryResponse = await this.fetcher(`${recordsUrl}/${encodeURIComponent(existing.record_id)}`, {
          method: 'PUT',
          headers,
          body: JSON.stringify({
            fields: {
              '处理状态': 'pending',
              '尝试次数': attempts + 1,
              '错误信息': '',
            },
          }),
        });
        if (!retryResponse.ok) {
          throw new FeishuApiError('Feishu sync ledger retry update failed.', 'FEISHU_LEDGER_RETRY_HTTP_ERROR');
        }
        const retried = await retryResponse.json() as { code: number };
        if (retried.code !== 0) {
          throw new FeishuApiError('Feishu sync ledger retry was rejected.', `FEISHU_LEDGER_RETRY_${retried.code}`);
        }
        return { claimed: true, recordId: existing.record_id };
      }
      return { claimed: false, recordId: existing.record_id };
    }

    const createResponse = await this.fetcher(recordsUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        fields: {
          trace_id: input.eventId,
          target_system: 'ai-pm-system',
          payload_digest: await sha256(JSON.stringify(input.payload)),
          producer: 'feishu-event',
          confidentiality: 'internal',
          event_type: input.eventType,
          '处理状态': 'pending',
          '尝试次数': 1,
          subject_id: input.eventId,
          subject_type: 'feishu-event',
          idempotency_key: idempotencyKey,
          ...(input.occurredAt ? { occurred_at: input.occurredAt } : {}),
          source_revision: '2.0',
          '事件ID': input.eventId,
        },
      }),
    });
    if (!createResponse.ok) {
      throw new FeishuApiError('Feishu sync ledger write failed.', 'FEISHU_LEDGER_CREATE_HTTP_ERROR');
    }
    const created = await createResponse.json() as RecordCreateResponse;
    const recordId = created.data?.record?.record_id;
    if (created.code !== 0 || !recordId) {
      throw new FeishuApiError('Feishu sync ledger write was rejected.', `FEISHU_LEDGER_CREATE_${created.code}`);
    }
    return { claimed: true, recordId };
  }

  private async updateEventStatus(
    recordId: string,
    status: 'succeeded' | 'failed',
    errorMessage?: string,
  ): Promise<void> {
    const tableId = this.config.tables.syncLedger;
    if (!tableId) {
      throw new FeishuApiError('Feishu sync ledger table is not configured.', 'FEISHU_SYNC_LEDGER_NOT_CONFIGURED');
    }
    const token = await this.getTenantToken();
    const url = `https://open.feishu.cn/open-apis/base/v3/bases/${encodeURIComponent(this.config.baseToken)}/tables/${encodeURIComponent(tableId)}/records/${encodeURIComponent(recordId)}`;
    const response = await this.fetcher(url, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fields: {
          '处理状态': status,
          processed_at: Date.now(),
          ...(errorMessage ? { '错误信息': errorMessage.slice(0, 500) } : {}),
        },
      }),
    });
    if (!response.ok) {
      throw new FeishuApiError('Feishu sync ledger update failed.', 'FEISHU_LEDGER_UPDATE_HTTP_ERROR');
    }
    const payload = await response.json() as { code: number };
    if (payload.code !== 0) {
      throw new FeishuApiError('Feishu sync ledger update was rejected.', `FEISHU_LEDGER_UPDATE_${payload.code}`);
    }
  }

  async completeEvent(recordId: string): Promise<void> {
    await this.updateEventStatus(recordId, 'succeeded');
  }

  async failEvent(recordId: string, errorMessage: string): Promise<void> {
    await this.updateEventStatus(recordId, 'failed', errorMessage);
  }

  async health(): Promise<FeishuHealth> {
    const tables = await this.listTables();
    const actualIds = new Set(tables.map(table => table.table_id));
    const configured = Object.entries(this.config.tables) as Array<[FeishuTableKey, string]>;
    const missing = configured
      .filter(([, tableId]) => !actualIds.has(tableId))
      .map(([key]) => key);

    return {
      status: missing.length === 0 ? 'ok' : 'degraded',
      identity: 'bot',
      base_accessible: true,
      table_count: tables.length,
      configured_table_count: configured.length,
      missing_required_tables: missing,
    };
  }
}
