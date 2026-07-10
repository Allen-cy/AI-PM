import assert from 'node:assert/strict';
import test from 'node:test';

import { POST } from '../src/app/api/integrations/feishu/actions/route.ts';

function request(body: unknown, key = 'action-api-key'): Request {
  return new Request('http://localhost/api/integrations/feishu/actions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify(body),
  });
}

function configure(): NodeJS.ProcessEnv {
  const previous = { ...process.env };
  process.env.FEISHU_APP_ID = 'cli_test';
  process.env.FEISHU_APP_SECRET = 'secret-value';
  process.env.FEISHU_BASE_TOKEN = 'base-token';
  process.env.FEISHU_SYNC_LEDGER_TABLE_ID = 'tbl-ledger';
  process.env.AI_PM_INTEGRATION_API_KEY = 'action-api-key';
  return previous;
}

test('rejects anonymous Feishu write actions before any OpenAPI call', async () => {
  const previousEnvironment = configure();
  const previousFetch = globalThis.fetch;
  let called = false;
  globalThis.fetch = async () => {
    called = true;
    return Response.json({ code: 0 });
  };

  try {
    const response = await POST(request({ type: 'message' }, 'wrong-key'));
    assert.equal(response.status, 401);
    assert.equal((await response.json()).code, 'FEISHU_ACTION_UNAUTHORIZED');
    assert.equal(called, false);
  } finally {
    globalThis.fetch = previousFetch;
    process.env = previousEnvironment;
  }
});

test('rejects an invalid action before creating a ledger record', async () => {
  const previousEnvironment = configure();
  const previousFetch = globalThis.fetch;
  let called = false;
  globalThis.fetch = async () => {
    called = true;
    return Response.json({ code: 0 });
  };

  try {
    const response = await POST(request({
      type: 'task',
      idempotency_key: 'invalid-task',
    }));
    assert.equal(response.status, 422);
    assert.equal((await response.json()).code, 'FEISHU_ACTION_INVALID');
    assert.equal(called, false);
  } finally {
    globalThis.fetch = previousFetch;
    process.env = previousEnvironment;
  }
});

test('queues an authenticated message action instead of executing directly', async () => {
  const previousEnvironment = configure();
  const previousFetch = globalThis.fetch;
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    calls.push({ url, init });
    if (url.includes('/auth/')) return Response.json({ code: 0, tenant_access_token: 'token', expire: 7200 });
    if (url.endsWith('/records/search')) return Response.json({ code: 0, data: { items: [] } });
    if (url.endsWith('/records')) return Response.json({ code: 0, data: { record: { record_id: 'rec-action-1' } } });
    if (url.includes('/im/v1/messages')) return Response.json({ code: 0, data: { message_id: 'om-1', chat_id: 'oc-1' } });
    return Response.json({ code: 0, data: { record: { record_id: 'rec-action-1' } } });
  };

  try {
    const response = await POST(request({
      type: 'message',
      idempotency_key: 'weekly-2026-25',
      receive_id: 'oc-1',
      receive_id_type: 'chat_id',
      text: '项目周报已生成',
    }));
    const body = await response.json();
    assert.equal(response.status, 503);
    assert.equal(body.status, 'not_configured');
    assert.equal(body.code, 'FEISHU_ACTION_CONFIRMATION_QUEUE_NOT_CONFIGURED');
    assert.equal(body.preview.confirmationRequired, true);
    assert.match(body.preview.targetSummary, /群聊/);
    assert.equal(calls.length, 0);
  } finally {
    globalThis.fetch = previousFetch;
    process.env = previousEnvironment;
  }
});
