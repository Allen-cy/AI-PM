import assert from 'node:assert/strict';
import test from 'node:test';

import {
  FeishuEventValidationError,
  verifyFeishuEventPayload,
} from '../src/features/feishu/events.ts';

test('returns the Feishu URL verification challenge after token validation', () => {
  const result = verifyFeishuEventPayload({
    type: 'url_verification',
    token: 'verify-token',
    challenge: 'challenge-value',
  }, {
    verificationToken: 'verify-token',
    allowedEventTypes: ['im.message.receive_v1'],
  });

  assert.deepEqual(result, { kind: 'challenge', challenge: 'challenge-value' });
});

test('rejects a callback with the wrong verification token', () => {
  assert.throws(() => verifyFeishuEventPayload({
    schema: '2.0',
    header: {
      token: 'wrong-token',
      event_id: 'evt-1',
      event_type: 'im.message.receive_v1',
      create_time: '1750000000000',
    },
    event: {},
  }, {
    verificationToken: 'verify-token',
    allowedEventTypes: ['im.message.receive_v1'],
  }), (error: unknown) => (
    error instanceof FeishuEventValidationError
    && error.code === 'FEISHU_EVENT_TOKEN_INVALID'
  ));
});

test('accepts an allowed Feishu V2 event envelope', () => {
  const result = verifyFeishuEventPayload({
    schema: '2.0',
    header: {
      app_id: 'cli_test',
      token: 'verify-token',
      event_id: 'evt-1',
      event_type: 'im.message.receive_v1',
      create_time: '1750000000000',
      tenant_key: 'tenant-1',
    },
    event: { message: { message_id: 'om-1' } },
  }, {
    verificationToken: 'verify-token',
    allowedEventTypes: ['im.message.receive_v1'],
  });

  assert.deepEqual(result, {
    kind: 'event',
    eventId: 'evt-1',
    eventType: 'im.message.receive_v1',
    occurredAt: 1_750_000_000_000,
    payload: { message: { message_id: 'om-1' } },
  });
});

test('rejects encrypted callbacks when no verified decryption path is configured', () => {
  assert.throws(() => verifyFeishuEventPayload({ encrypt: 'ciphertext' }, {
    verificationToken: 'verify-token',
    allowedEventTypes: ['im.message.receive_v1'],
  }), (error: unknown) => (
    error instanceof FeishuEventValidationError
    && error.code === 'FEISHU_ENCRYPTED_EVENTS_UNSUPPORTED'
  ));
});
