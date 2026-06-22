import assert from 'node:assert/strict';
import test from 'node:test';

import { FeishuBaseClient } from '../src/features/feishu/client.ts';
import { readFeishuConfig } from '../src/features/feishu/config.ts';

test('returns null when server-side Feishu credentials are incomplete', () => {
  assert.equal(readFeishuConfig({ FEISHU_APP_ID: 'app-only' }), null);
});

test('loads app identity and table mapping without exposing the secret', () => {
  const config = readFeishuConfig({
    FEISHU_APP_ID: 'cli_test',
    FEISHU_APP_SECRET: 'secret-value',
    FEISHU_BASE_TOKEN: 'base-token',
    FEISHU_PROJECT_TABLE_ID: 'tbl-project',
    FEISHU_SYNC_LEDGER_TABLE_ID: 'tbl-ledger',
  });

  assert.ok(config);
  assert.equal(config.appId, 'cli_test');
  assert.equal(config.tables.project, 'tbl-project');
  assert.doesNotMatch(JSON.stringify(config.publicSummary), /secret-value/);
});

test('authenticates as the app and verifies the expected Base tables', async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fakeFetch: typeof fetch = async (input, init) => {
    const url = String(input);
    calls.push({ url, init });
    if (url.endsWith('/auth/v3/tenant_access_token/internal')) {
      return Response.json({ code: 0, tenant_access_token: 'tenant-token', expire: 7200 });
    }
    return Response.json({
      code: 0,
      data: {
        items: [
          { table_id: 'tbl-project', name: '项目台账' },
          { table_id: 'tbl-ledger', name: '同步账本' },
        ],
      },
    });
  };
  const config = readFeishuConfig({
    FEISHU_APP_ID: 'cli_test',
    FEISHU_APP_SECRET: 'secret-value',
    FEISHU_BASE_TOKEN: 'base-token',
    FEISHU_PROJECT_TABLE_ID: 'tbl-project',
    FEISHU_SYNC_LEDGER_TABLE_ID: 'tbl-ledger',
  });
  assert.ok(config);

  const client = new FeishuBaseClient(config, fakeFetch);
  const health = await client.health();

  assert.equal(health.status, 'ok');
  assert.equal(health.table_count, 2);
  assert.deepEqual(health.missing_required_tables, []);
  assert.equal(calls.length, 2);
  assert.equal(new Headers(calls[1].init?.headers).get('authorization'), 'Bearer tenant-token');
});

test('reports missing required table IDs as degraded', async () => {
  const fakeFetch: typeof fetch = async input => String(input).includes('/auth/')
    ? Response.json({ code: 0, tenant_access_token: 'tenant-token', expire: 7200 })
    : Response.json({ code: 0, data: { items: [{ table_id: 'tbl-project', name: '项目台账' }] } });
  const config = readFeishuConfig({
    FEISHU_APP_ID: 'cli_test',
    FEISHU_APP_SECRET: 'secret-value',
    FEISHU_BASE_TOKEN: 'base-token',
    FEISHU_PROJECT_TABLE_ID: 'tbl-project',
    FEISHU_SYNC_LEDGER_TABLE_ID: 'tbl-ledger',
  });
  assert.ok(config);

  const health = await new FeishuBaseClient(config, fakeFetch).health();

  assert.equal(health.status, 'degraded');
  assert.deepEqual(health.missing_required_tables, ['syncLedger']);
});
