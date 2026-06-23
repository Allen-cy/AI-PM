import { timingSafeEqual } from 'node:crypto';

export interface FeishuEventVerificationConfig {
  verificationToken?: string;
  allowedEventTypes: string[];
}

export type VerifiedFeishuPayload =
  | { kind: 'challenge'; challenge: string }
  | {
    kind: 'event';
    eventId: string;
    eventType: string;
    occurredAt: number;
    payload: unknown;
  };

export class FeishuEventValidationError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
  }
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function sameToken(actual: unknown, expected: string | undefined): boolean {
  if (typeof actual !== 'string' || !expected) return false;
  const left = Buffer.from(actual);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function verifyFeishuEventPayload(
  value: unknown,
  config: FeishuEventVerificationConfig,
): VerifiedFeishuPayload {
  const body = record(value);
  if (!body) {
    throw new FeishuEventValidationError('Feishu callback payload must be an object.', 'FEISHU_EVENT_INVALID');
  }
  if (typeof body.encrypt === 'string') {
    throw new FeishuEventValidationError(
      'Encrypted Feishu callbacks are not enabled for this endpoint.',
      'FEISHU_ENCRYPTED_EVENTS_UNSUPPORTED',
    );
  }

  if (body.type === 'url_verification') {
    if (!sameToken(body.token, config.verificationToken)) {
      throw new FeishuEventValidationError('Feishu verification token is invalid.', 'FEISHU_EVENT_TOKEN_INVALID');
    }
    if (typeof body.challenge !== 'string' || body.challenge.length === 0) {
      throw new FeishuEventValidationError('Feishu verification challenge is missing.', 'FEISHU_EVENT_INVALID');
    }
    return { kind: 'challenge', challenge: body.challenge };
  }

  const header = record(body.header);
  if (body.schema !== '2.0' || !header || !sameToken(header.token, config.verificationToken)) {
    throw new FeishuEventValidationError('Feishu verification token is invalid.', 'FEISHU_EVENT_TOKEN_INVALID');
  }
  const eventId = header.event_id;
  const eventType = header.event_type;
  const occurredAt = Number(header.create_time);
  if (typeof eventId !== 'string' || typeof eventType !== 'string' || !Number.isFinite(occurredAt)) {
    throw new FeishuEventValidationError('Feishu V2 event header is incomplete.', 'FEISHU_EVENT_INVALID');
  }
  if (!config.allowedEventTypes.includes(eventType)) {
    throw new FeishuEventValidationError('Feishu event type is not allowed.', 'FEISHU_EVENT_TYPE_NOT_ALLOWED');
  }

  return {
    kind: 'event',
    eventId,
    eventType,
    occurredAt,
    payload: body.event,
  };
}
