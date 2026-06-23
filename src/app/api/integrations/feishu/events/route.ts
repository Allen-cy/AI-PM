import { FeishuApiError, FeishuBaseClient } from '../../../../../features/feishu/client.ts';
import { readFeishuConfig } from '../../../../../features/feishu/config.ts';
import {
  FeishuEventValidationError,
  verifyFeishuEventPayload,
} from '../../../../../features/feishu/events.ts';

export const runtime = 'nodejs';

function json(body: unknown, status: number, requestId: string): Response {
  return Response.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Request-Id': requestId,
    },
  });
}

export async function POST(request: Request): Promise<Response> {
  const requestId = crypto.randomUUID();
  const config = readFeishuConfig();
  if (!config || !config.verificationToken || !config.tables.syncLedger) {
    return json({
      status: 'not_configured',
      code: 'FEISHU_EVENT_NOT_CONFIGURED',
      request_id: requestId,
    }, 503, requestId);
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return json({
      status: 'error',
      code: 'FEISHU_EVENT_MALFORMED_JSON',
      request_id: requestId,
    }, 400, requestId);
  }

  try {
    const verified = verifyFeishuEventPayload(payload, config);
    if (verified.kind === 'challenge') {
      return json({ challenge: verified.challenge }, 200, requestId);
    }

    const client = new FeishuBaseClient(config);
    const claim = await client.claimEvent({
      eventId: verified.eventId,
      eventType: verified.eventType,
      payload: verified.payload,
      occurredAt: verified.occurredAt,
    });
    if (!claim.claimed) {
      return json({
        status: 'duplicate',
        event_id: verified.eventId,
        request_id: requestId,
      }, 200, requestId);
    }

    await client.completeEvent(claim.recordId);
    return json({
      status: 'accepted',
      event_id: verified.eventId,
      request_id: requestId,
    }, 202, requestId);
  } catch (error) {
    if (error instanceof FeishuEventValidationError) {
      const status = error.code === 'FEISHU_EVENT_TOKEN_INVALID'
        ? 401
        : error.code === 'FEISHU_EVENT_TYPE_NOT_ALLOWED' ? 422 : 400;
      return json({
        status: 'rejected',
        code: error.code,
        request_id: requestId,
      }, status, requestId);
    }

    const code = error instanceof FeishuApiError ? error.code : 'FEISHU_EVENT_UNKNOWN_ERROR';
    console.error(JSON.stringify({
      level: 'error',
      event: 'feishu.event.failed',
      request_id: requestId,
      code,
    }));
    return json({ status: 'error', code, request_id: requestId }, 503, requestId);
  }
}
