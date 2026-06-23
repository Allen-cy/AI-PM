import { timingSafeEqual } from 'node:crypto';

import { FeishuActionClient } from '../../../../../features/feishu/actions.ts';
import { FeishuApiError, FeishuBaseClient } from '../../../../../features/feishu/client.ts';
import { readFeishuConfig, type FeishuConfig } from '../../../../../features/feishu/config.ts';

export const runtime = 'nodejs';

type ActionBody = Record<string, unknown>;

class ActionValidationError extends Error {}

function json(body: unknown, status: number, requestId: string): Response {
  return Response.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Request-Id': requestId,
    },
  });
}

function authorized(request: Request, expected: string): boolean {
  const value = request.headers.get('authorization');
  if (!value?.startsWith('Bearer ')) return false;
  const actual = Buffer.from(value.slice(7));
  const target = Buffer.from(expected);
  return actual.length === target.length && timingSafeEqual(actual, target);
}

function text(body: ActionBody, field: string, maximum = 3000): string {
  const value = body[field];
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > maximum) {
    throw new ActionValidationError(`${field} must be a non-empty string up to ${maximum} characters.`);
  }
  return value.trim();
}

function optionalText(body: ActionBody, field: string, maximum = 5000): string | undefined {
  const value = body[field];
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.length > maximum) {
    throw new ActionValidationError(`${field} must be a string up to ${maximum} characters.`);
  }
  return value.trim();
}

function stringArray(body: ActionBody, field: string): string[] | undefined {
  const value = body[field];
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > 50 || value.some(item => typeof item !== 'string' || !item)) {
    throw new ActionValidationError(`${field} must be an array of up to 50 IDs.`);
  }
  return value as string[];
}

function timestamp(body: ActionBody, field: string): number | undefined {
  const value = body[field];
  if (value === undefined) return undefined;
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Date.parse(value) : Number.NaN;
  if (!Number.isFinite(parsed)) throw new ActionValidationError(`${field} must be epoch milliseconds or ISO 8601.`);
  return parsed;
}

function validateActionBody(body: ActionBody): { actionType: string; idempotencyKey: string } {
  const idempotencyKey = text(body, 'idempotency_key', 128);
  const actionType = text(body, 'type', 32);
  switch (actionType) {
    case 'message':
      if (body.receive_id_type !== 'chat_id' && body.receive_id_type !== 'open_id') {
        throw new ActionValidationError('receive_id_type must be chat_id or open_id.');
      }
      text(body, 'receive_id', 128);
      text(body, 'text', 30_000);
      break;
    case 'task':
      text(body, 'summary');
      optionalText(body, 'description');
      stringArray(body, 'assignee_ids');
      timestamp(body, 'due_at');
      break;
    case 'calendar': {
      text(body, 'summary');
      optionalText(body, 'description');
      stringArray(body, 'attendee_ids');
      optionalText(body, 'timezone', 64);
      const startAt = timestamp(body, 'start_at');
      const endAt = timestamp(body, 'end_at');
      if (startAt === undefined || endAt === undefined || endAt <= startAt) {
        throw new ActionValidationError('start_at and end_at must define a valid time block.');
      }
      break;
    }
    case 'document':
      text(body, 'title');
      text(body, 'summary', 5000);
      stringArray(body, 'bullets');
      optionalText(body, 'parent_token', 256);
      break;
    default:
      throw new ActionValidationError('type must be message, task, calendar, or document.');
  }
  return { actionType, idempotencyKey };
}

async function executeAction(config: FeishuConfig, body: ActionBody): Promise<unknown> {
  const client = new FeishuActionClient(config);
  switch (body.type) {
    case 'message': {
      const receiveIdType = body.receive_id_type;
      if (receiveIdType !== 'chat_id' && receiveIdType !== 'open_id') {
        throw new ActionValidationError('receive_id_type must be chat_id or open_id.');
      }
      return client.sendTextMessage({
        receiveId: text(body, 'receive_id', 128),
        receiveIdType,
        text: text(body, 'text', 30_000),
        idempotencyKey: text(body, 'idempotency_key', 128),
      });
    }
    case 'task':
      return client.createTask({
        summary: text(body, 'summary'),
        description: optionalText(body, 'description'),
        assigneeIds: stringArray(body, 'assignee_ids'),
        dueAt: timestamp(body, 'due_at'),
        isAllDay: body.is_all_day === true,
        idempotencyKey: text(body, 'idempotency_key', 128),
      });
    case 'calendar': {
      const startAt = timestamp(body, 'start_at');
      const endAt = timestamp(body, 'end_at');
      if (startAt === undefined || endAt === undefined) {
        throw new ActionValidationError('start_at and end_at are required.');
      }
      return client.createCalendarEvent({
        summary: text(body, 'summary'),
        description: optionalText(body, 'description'),
        startAt,
        endAt,
        attendeeIds: stringArray(body, 'attendee_ids'),
        timezone: optionalText(body, 'timezone', 64) ?? 'Asia/Shanghai',
      });
    }
    case 'document':
      return client.createDocument({
        title: text(body, 'title'),
        summary: text(body, 'summary', 5000),
        bullets: stringArray(body, 'bullets'),
        parentToken: optionalText(body, 'parent_token', 256) ?? config.documentParentToken,
      });
    default:
      throw new ActionValidationError('type must be message, task, calendar, or document.');
  }
}

export async function POST(request: Request): Promise<Response> {
  const requestId = crypto.randomUUID();
  const config = readFeishuConfig();
  if (!config || !config.actionApiKey || !config.tables.syncLedger) {
    return json({ status: 'not_configured', code: 'FEISHU_ACTION_NOT_CONFIGURED', request_id: requestId }, 503, requestId);
  }
  if (!authorized(request, config.actionApiKey)) {
    return json({ status: 'rejected', code: 'FEISHU_ACTION_UNAUTHORIZED', request_id: requestId }, 401, requestId);
  }

  let body: ActionBody;
  try {
    const value = await request.json();
    if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new ActionValidationError();
    body = value as ActionBody;
  } catch {
    return json({ status: 'rejected', code: 'FEISHU_ACTION_MALFORMED_JSON', request_id: requestId }, 400, requestId);
  }

  const ledger = new FeishuBaseClient(config);
  let recordId: string | undefined;
  let validated: { actionType: string; idempotencyKey: string };
  try {
    validated = validateActionBody(body);
  } catch {
    return json({ status: 'rejected', code: 'FEISHU_ACTION_INVALID', request_id: requestId }, 422, requestId);
  }
  try {
    const claim = await ledger.claimEvent({
      eventId: `action:${validated.idempotencyKey}`,
      eventType: `action.${validated.actionType}`,
      payload: body,
      occurredAt: Date.now(),
    });
    if (!claim.claimed) {
      return json({
        status: 'duplicate',
        action: validated.actionType,
        request_id: requestId,
      }, 200, requestId);
    }
    recordId = claim.recordId;

    const resource = await executeAction(config, body);
    await ledger.completeEvent(recordId);
    return json({
      status: 'succeeded',
      action: validated.actionType,
      resource,
      request_id: requestId,
    }, 201, requestId);
  } catch (error) {
    if (error instanceof ActionValidationError) {
      return json({ status: 'rejected', code: 'FEISHU_ACTION_INVALID', request_id: requestId }, 422, requestId);
    }
    const code = error instanceof FeishuApiError ? error.code : 'FEISHU_ACTION_UNKNOWN_ERROR';
    if (recordId) {
      try {
        await ledger.failEvent(recordId, code);
      } catch {
        console.error(JSON.stringify({ level: 'error', event: 'feishu.action.ledger_fail', request_id: requestId }));
      }
    }
    console.error(JSON.stringify({ level: 'error', event: 'feishu.action.failed', request_id: requestId, code }));
    return json({ status: 'error', code, request_id: requestId }, 502, requestId);
  }
}
