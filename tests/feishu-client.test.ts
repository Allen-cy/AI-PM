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
    FEISHU_VERIFICATION_TOKEN: 'verify-token',
    FEISHU_EVENT_ALLOWED_TYPES: 'im.message.receive_v1,base.record.changed_v1',
    AI_PM_INTEGRATION_API_KEY: 'action-api-key',
    FEISHU_DOCUMENT_PARENT_TOKEN: 'fld-docs',
    FEISHU_DOCUMENT_GRANT_OPEN_ID: 'ou-owner',
  });

  assert.ok(config);
  assert.equal(config.appId, 'cli_test');
  assert.equal(config.tables.project, 'tbl-project');
  assert.equal(config.verificationToken, 'verify-token');
  assert.deepEqual(config.allowedEventTypes, ['im.message.receive_v1', 'base.record.changed_v1']);
  assert.equal(config.actionApiKey, 'action-api-key');
  assert.equal(config.documentParentToken, 'fld-docs');
  assert.equal(config.documentGrantOpenId, 'ou-owner');
  assert.doesNotMatch(JSON.stringify(config.publicSummary), /secret-value/);
  assert.doesNotMatch(JSON.stringify(config.publicSummary), /verify-token/);
  assert.doesNotMatch(JSON.stringify(config.publicSummary), /action-api-key/);
});

test('authenticates as the app and verifies the Base v3 data.tables response', async () => {
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
        tables: [
          { id: 'tbl-project', name: '项目台账' },
          { id: 'tbl-ledger', name: '同步账本' },
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

test('claims a new event in the Feishu sync ledger before processing', async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fakeFetch: typeof fetch = async (input, init) => {
    const url = String(input);
    calls.push({ url, init });
    if (url.includes('/auth/')) {
      return Response.json({ code: 0, tenant_access_token: 'tenant-token', expire: 7200 });
    }
    if (url.endsWith('/records/search')) {
      return Response.json({ code: 0, data: { items: [] } });
    }
    return Response.json({ code: 0, data: { record: { record_id: 'rec-event-1' } } });
  };
  const config = readFeishuConfig({
    FEISHU_APP_ID: 'cli_test',
    FEISHU_APP_SECRET: 'secret-value',
    FEISHU_BASE_TOKEN: 'base-token',
    FEISHU_SYNC_LEDGER_TABLE_ID: 'tbl-ledger',
  });
  assert.ok(config);

  const result = await new FeishuBaseClient(config, fakeFetch).claimEvent({
    eventId: 'evt-1',
    eventType: 'im.message.receive_v1',
    payload: { message: { message_id: 'om-1' } },
    occurredAt: 1_750_000_000_000,
  });

  assert.deepEqual(result, { claimed: true, recordId: 'rec-event-1' });
  const create = calls.find(call => call.url.endsWith('/records'));
  assert.ok(create);
  const body = JSON.parse(String(create.init?.body));
  assert.equal(body.fields.idempotency_key, 'feishu:evt-1');
  assert.equal(body.fields['事件ID'], 'evt-1');
  assert.equal(body.fields['处理状态'], 'pending');
  assert.equal(body.fields['尝试次数'], 1);
  assert.match(body.fields.payload_digest, /^[a-f0-9]{64}$/);
});

test('does not claim a duplicate Feishu event', async () => {
  const calls: string[] = [];
  const fakeFetch: typeof fetch = async input => {
    const url = String(input);
    calls.push(url);
    if (url.includes('/auth/')) {
      return Response.json({ code: 0, tenant_access_token: 'tenant-token', expire: 7200 });
    }
    return Response.json({ code: 0, data: { items: [{ record_id: 'rec-existing' }] } });
  };
  const config = readFeishuConfig({
    FEISHU_APP_ID: 'cli_test',
    FEISHU_APP_SECRET: 'secret-value',
    FEISHU_BASE_TOKEN: 'base-token',
    FEISHU_SYNC_LEDGER_TABLE_ID: 'tbl-ledger',
  });
  assert.ok(config);

  const result = await new FeishuBaseClient(config, fakeFetch).claimEvent({
    eventId: 'evt-1',
    eventType: 'im.message.receive_v1',
    payload: {},
  });

  assert.deepEqual(result, { claimed: false, recordId: 'rec-existing' });
  assert.equal(calls.some(url => url.endsWith('/records')), false);
});

test('reclaims a failed Feishu operation for a bounded retry', async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fakeFetch: typeof fetch = async (input, init) => {
    const url = String(input);
    calls.push({ url, init });
    if (url.includes('/auth/')) {
      return Response.json({ code: 0, tenant_access_token: 'tenant-token', expire: 7200 });
    }
    if (url.endsWith('/records/search')) {
      return Response.json({
        code: 0,
        data: { items: [{ record_id: 'rec-failed', fields: { '处理状态': 'failed', '尝试次数': 1 } }] },
      });
    }
    return Response.json({ code: 0, data: { record: { record_id: 'rec-failed' } } });
  };
  const config = readFeishuConfig({
    FEISHU_APP_ID: 'cli_test',
    FEISHU_APP_SECRET: 'secret-value',
    FEISHU_BASE_TOKEN: 'base-token',
    FEISHU_SYNC_LEDGER_TABLE_ID: 'tbl-ledger',
  });
  assert.ok(config);

  const result = await new FeishuBaseClient(config, fakeFetch).claimEvent({
    eventId: 'action:retry-1',
    eventType: 'action.message',
    payload: {},
  });

  assert.deepEqual(result, { claimed: true, recordId: 'rec-failed' });
  const update = calls.find(call => call.url.endsWith('/records/rec-failed'));
  assert.ok(update);
  const body = JSON.parse(String(update.init?.body));
  assert.equal(body.fields['处理状态'], 'pending');
  assert.equal(body.fields['尝试次数'], 2);
});

test('marks a claimed Feishu event as succeeded', async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fakeFetch: typeof fetch = async (input, init) => {
    const url = String(input);
    calls.push({ url, init });
    if (url.includes('/auth/')) {
      return Response.json({ code: 0, tenant_access_token: 'tenant-token', expire: 7200 });
    }
    return Response.json({ code: 0, data: { record: { record_id: 'rec-event-1' } } });
  };
  const config = readFeishuConfig({
    FEISHU_APP_ID: 'cli_test',
    FEISHU_APP_SECRET: 'secret-value',
    FEISHU_BASE_TOKEN: 'base-token',
    FEISHU_SYNC_LEDGER_TABLE_ID: 'tbl-ledger',
  });
  assert.ok(config);

  await new FeishuBaseClient(config, fakeFetch).completeEvent('rec-event-1');

  const update = calls.find(call => call.url.endsWith('/records/rec-event-1'));
  assert.ok(update);
  assert.equal(update.init?.method, 'PUT');
  const body = JSON.parse(String(update.init?.body));
  assert.equal(body.fields['处理状态'], 'succeeded');
  assert.equal('尝试次数' in body.fields, false);
  assert.equal(typeof body.fields.processed_at, 'number');
});

test('marks a claimed Feishu operation as failed without exposing long errors', async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fakeFetch: typeof fetch = async (input, init) => {
    const url = String(input);
    calls.push({ url, init });
    if (url.includes('/auth/')) {
      return Response.json({ code: 0, tenant_access_token: 'tenant-token', expire: 7200 });
    }
    return Response.json({ code: 0, data: { record: { record_id: 'rec-event-1' } } });
  };
  const config = readFeishuConfig({
    FEISHU_APP_ID: 'cli_test',
    FEISHU_APP_SECRET: 'secret-value',
    FEISHU_BASE_TOKEN: 'base-token',
    FEISHU_SYNC_LEDGER_TABLE_ID: 'tbl-ledger',
  });
  assert.ok(config);

  await new FeishuBaseClient(config, fakeFetch).failEvent('rec-event-1', 'x'.repeat(800));

  const body = JSON.parse(String(calls.at(-1)?.init?.body));
  assert.equal(body.fields['处理状态'], 'failed');
  assert.equal('尝试次数' in body.fields, false);
  assert.equal(body.fields['错误信息'].length, 500);
});
