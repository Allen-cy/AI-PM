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
