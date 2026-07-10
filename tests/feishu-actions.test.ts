import assert from 'node:assert/strict';
import test from 'node:test';

import { FeishuActionClient } from '../src/features/feishu/actions.ts';
import { readFeishuConfig } from '../src/features/feishu/config.ts';

function config() {
  const value = readFeishuConfig({
    FEISHU_APP_ID: 'cli_test',
    FEISHU_APP_SECRET: 'secret-value',
    FEISHU_BASE_TOKEN: 'base-token',
    FEISHU_SYNC_LEDGER_TABLE_ID: 'tbl-ledger',
  });
  assert.ok(value);
  return value;
}

test('sends a bot text message with Feishu native idempotency', async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fakeFetch: typeof fetch = async (input, init) => {
    const url = String(input);
    calls.push({ url, init });
    if (url.includes('/auth/')) return Response.json({ code: 0, tenant_access_token: 'token', expire: 7200 });
    return Response.json({ code: 0, data: { message_id: 'om-1', chat_id: 'oc-1' } });
  };

  const result = await new FeishuActionClient(config(), fakeFetch).sendTextMessage({
    receiveId: 'oc-1',
    receiveIdType: 'chat_id',
    text: '项目周报已生成',
    idempotencyKey: 'action-1',
  });

  assert.deepEqual(result, { messageId: 'om-1', chatId: 'oc-1' });
  const call = calls.at(-1);
  assert.match(call?.url ?? '', /im\/v1\/messages\?receive_id_type=chat_id$/);
  const body = JSON.parse(String(call?.init?.body));
  assert.equal(body.uuid, 'action-1');
  assert.equal(JSON.parse(body.content).text, '项目周报已生成');
});

test('creates a Feishu task with assignees and millisecond due time', async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fakeFetch: typeof fetch = async (input, init) => {
    const url = String(input);
    calls.push({ url, init });
    if (url.includes('/auth/')) return Response.json({ code: 0, tenant_access_token: 'token', expire: 7200 });
    return Response.json({ code: 0, data: { task: { guid: 'task-1', url: 'https://example/task-1' } } });
  };

  const result = await new FeishuActionClient(config(), fakeFetch).createTask({
    summary: '处理项目风险',
    description: '完成缓解措施并更新风险台账',
    assigneeIds: ['ou-1'],
    dueAt: 1_783_000_000_000,
    idempotencyKey: 'action-2',
  });

  assert.deepEqual(result, { taskGuid: 'task-1', url: 'https://example/task-1' });
  const body = JSON.parse(String(calls.at(-1)?.init?.body));
  assert.equal(body.client_token, 'action-2');
  assert.equal(body.due.timestamp, '1783000000000');
  assert.deepEqual(body.members, [{ id: 'ou-1', role: 'assignee', type: 'user' }]);
});

test('creates an event on the bot primary calendar and adds attendees', async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fakeFetch: typeof fetch = async (input, init) => {
    const url = String(input);
    calls.push({ url, init });
    if (url.includes('/auth/')) return Response.json({ code: 0, tenant_access_token: 'token', expire: 7200 });
    if (url.endsWith('/calendars/primary')) {
      return Response.json({ code: 0, data: { calendars: [{ calendar: { calendar_id: 'cal-1' } }] } });
    }
    if (url.endsWith('/events')) {
      return Response.json({ code: 0, data: { event: { event_id: 'evt-1', app_link: 'https://example/event-1' } } });
    }
    return Response.json({ code: 0, data: { attendees: [] } });
  };

  const result = await new FeishuActionClient(config(), fakeFetch).createCalendarEvent({
    summary: '项目例会',
    description: '检查里程碑、风险与回款',
    startAt: 1_782_871_200_000,
    endAt: 1_782_873_000_000,
    attendeeIds: ['ou-1', 'oc-1'],
    timezone: 'Asia/Shanghai',
  });

  assert.deepEqual(result, { eventId: 'evt-1', appLink: 'https://example/event-1' });
  const createBody = JSON.parse(String(calls.find(call => call.url.endsWith('/events'))?.init?.body));
  assert.equal(createBody.start_time.timestamp, '1782871200');
  const attendeeBody = JSON.parse(String(calls.at(-1)?.init?.body));
  assert.deepEqual(attendeeBody.attendees, [
    { type: 'user', user_id: 'ou-1' },
    { type: 'group', user_id: 'oc-1' },
  ]);
});

test('rolls back an empty calendar event when adding attendees fails', async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fakeFetch: typeof fetch = async (input, init) => {
    const url = String(input);
    calls.push({ url, init });
    if (url.includes('/auth/')) return Response.json({ code: 0, tenant_access_token: 'token', expire: 7200 });
    if (url.endsWith('/calendars/primary')) {
      return Response.json({ code: 0, data: { calendars: [{ calendar: { calendar_id: 'cal-1' } }] } });
    }
    if (url.endsWith('/events')) {
      return Response.json({ code: 0, data: { event: { event_id: 'evt-1' } } });
    }
    if (init?.method === 'DELETE') return Response.json({ code: 0, data: {} });
    return Response.json({ code: 999, msg: 'invalid attendee' });
  };

  await assert.rejects(() => new FeishuActionClient(config(), fakeFetch).createCalendarEvent({
    summary: '项目例会',
    startAt: 1_782_871_200_000,
    endAt: 1_782_873_000_000,
    attendeeIds: ['ou-invalid'],
  }));

  const rollback = calls.find(call => call.init?.method === 'DELETE');
  assert.ok(rollback);
  assert.match(rollback.url, /events\/evt-1\?need_notification=false$/);
});

test('creates a structured Feishu document in XML format', async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fakeFetch: typeof fetch = async (input, init) => {
    const url = String(input);
    calls.push({ url, init });
    if (url.includes('/auth/')) return Response.json({ code: 0, tenant_access_token: 'token', expire: 7200 });
    return Response.json({ code: 0, data: { document: { document_id: 'doc-1', url: 'https://example/doc-1' } } });
  };

  const result = await new FeishuActionClient(config(), fakeFetch).createDocument({
    title: '项目周报',
    summary: '本周进度正常，风险可控。',
    bullets: ['里程碑按期', '回款无逾期'],
    parentToken: 'fld-1',
  });

  assert.deepEqual(result, { documentId: 'doc-1', url: 'https://example/doc-1' });
  const body = JSON.parse(String(calls.at(-1)?.init?.body));
  assert.equal(body.format, 'xml');
  assert.equal(body.parent_token, 'fld-1');
  assert.match(body.content, /<title>项目周报<\/title>/);
  assert.match(body.content, /<callout[^>]*>[\s\S]*本周进度正常/);
  assert.match(body.content, /<ul><li>里程碑按期<\/li><li>回款无逾期<\/li><\/ul>/);
});

test('grants the configured user full access to a Bot-created document', async () => {
  const value = readFeishuConfig({
    FEISHU_APP_ID: 'cli_test',
    FEISHU_APP_SECRET: 'secret-value',
    FEISHU_BASE_TOKEN: 'base-token',
    FEISHU_DOCUMENT_GRANT_OPEN_ID: 'ou-owner',
  });
  assert.ok(value);
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fakeFetch: typeof fetch = async (input, init) => {
    const url = String(input);
    calls.push({ url, init });
    if (url.includes('/auth/')) return Response.json({ code: 0, tenant_access_token: 'token', expire: 7200 });
    if (url.includes('/docs_ai/')) {
      return Response.json({ code: 0, data: { document: { document_id: 'doc-1' } } });
    }
    return Response.json({ code: 0, data: { member: { member_id: 'ou-owner' } } });
  };

  await new FeishuActionClient(value, fakeFetch).createDocument({
    title: '项目周报',
    summary: '测试',
  });

  const grant = calls.at(-1);
  assert.match(grant?.url ?? '', /drive\/v1\/permissions\/doc-1\/members\?type=docx&need_notification=false$/);
  const body = JSON.parse(String(grant?.init?.body));
  assert.deepEqual(body, { member_type: 'openid', member_id: 'ou-owner', perm: 'full_access' });
});
