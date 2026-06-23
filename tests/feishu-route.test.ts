import assert from 'node:assert/strict';
import test from 'node:test';

import { GET } from '../src/app/api/integrations/feishu/health/route.ts';
import { POST as receiveFeishuEvent } from '../src/app/api/integrations/feishu/events/route.ts';

test('Feishu health route fails closed when server credentials are absent', async () => {
  const previous = {
    appId: process.env.FEISHU_APP_ID,
    appSecret: process.env.FEISHU_APP_SECRET,
    baseToken: process.env.FEISHU_BASE_TOKEN,
  };
  delete process.env.FEISHU_APP_ID;
  delete process.env.FEISHU_APP_SECRET;
  delete process.env.FEISHU_BASE_TOKEN;

  try {
    const response = await GET();
    const body = await response.json();
    assert.equal(response.status, 503);
    assert.equal(body.status, 'not_configured');
    assert.doesNotMatch(JSON.stringify(body), /app_secret|tenant_access_token/i);
  } finally {
    if (previous.appId) process.env.FEISHU_APP_ID = previous.appId;
    if (previous.appSecret) process.env.FEISHU_APP_SECRET = previous.appSecret;
    if (previous.baseToken) process.env.FEISHU_BASE_TOKEN = previous.baseToken;
  }
});

test('Feishu event route completes URL verification without calling OpenAPI', async () => {
  const previous = { ...process.env };
  process.env.FEISHU_APP_ID = 'cli_test';
  process.env.FEISHU_APP_SECRET = 'secret-value';
  process.env.FEISHU_BASE_TOKEN = 'base-token';
  process.env.FEISHU_SYNC_LEDGER_TABLE_ID = 'tbl-ledger';
  process.env.FEISHU_VERIFICATION_TOKEN = 'verify-token';

  try {
    const response = await receiveFeishuEvent(new Request('http://localhost/api/integrations/feishu/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'url_verification',
        token: 'verify-token',
        challenge: 'challenge-value',
      }),
    }));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { challenge: 'challenge-value' });
  } finally {
    process.env = previous;
  }
});

test('Feishu event route persists and completes a new V2 event', async () => {
  const previousEnvironment = { ...process.env };
  const previousFetch = globalThis.fetch;
  const calls: string[] = [];
  process.env.FEISHU_APP_ID = 'cli_test';
  process.env.FEISHU_APP_SECRET = 'secret-value';
  process.env.FEISHU_BASE_TOKEN = 'base-token';
  process.env.FEISHU_SYNC_LEDGER_TABLE_ID = 'tbl-ledger';
  process.env.FEISHU_VERIFICATION_TOKEN = 'verify-token';
  process.env.FEISHU_EVENT_ALLOWED_TYPES = 'im.message.receive_v1';
  globalThis.fetch = async input => {
    const url = String(input);
    calls.push(url);
    if (url.includes('/auth/')) {
      return Response.json({ code: 0, tenant_access_token: 'tenant-token', expire: 7200 });
    }
    if (url.endsWith('/records/search')) {
      return Response.json({ code: 0, data: { items: [] } });
    }
    return Response.json({ code: 0, data: { record: { record_id: 'rec-event-1' } } });
  };

  try {
    const response = await receiveFeishuEvent(new Request('http://localhost/api/integrations/feishu/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        schema: '2.0',
        header: {
          token: 'verify-token',
          event_id: 'evt-1',
          event_type: 'im.message.receive_v1',
          create_time: '1750000000000',
        },
        event: { message: { message_id: 'om-1' } },
      }),
    }));
    const body = await response.json();
    assert.equal(response.status, 202);
    assert.equal(body.status, 'accepted');
    assert.equal(body.event_id, 'evt-1');
    assert.equal(calls.some(url => url.endsWith('/records')), true);
    assert.equal(calls.some(url => url.endsWith('/records/rec-event-1')), true);
  } finally {
    globalThis.fetch = previousFetch;
    process.env = previousEnvironment;
  }
});
