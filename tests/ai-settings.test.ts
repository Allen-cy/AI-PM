import assert from 'node:assert/strict';
import test from 'node:test';

import { getGlobalAiModelSummary, getUserAiModelSummary } from '../src/features/ai/settings.ts';

test('reports MiniMax-M3 as the configured global model when MiniMax key exists', () => {
  const summary = getGlobalAiModelSummary({
    MINIMAX_API_KEY: 'test-key',
    MINIMAX_MODEL: 'MiniMax-M3',
  });

  assert.equal(summary.provider, 'minimax');
  assert.equal(summary.providerLabel, 'MiniMax');
  assert.equal(summary.model, 'MiniMax-M3');
  assert.equal(summary.source, 'global');
  assert.equal(summary.configured, true);
  assert.doesNotMatch(JSON.stringify(summary), /test-key/);
});

test('falls back to default MiniMax-M3 without exposing unconfigured state as active credentials', () => {
  const summary = getGlobalAiModelSummary({});

  assert.equal(summary.provider, 'minimax');
  assert.equal(summary.model, 'MiniMax-M3');
  assert.equal(summary.source, 'default');
  assert.equal(summary.configured, false);
});

test('uses a user model only when it is enabled and has an API key', () => {
  assert.equal(getUserAiModelSummary({
    provider: 'deepseek',
    model: 'deepseek-chat',
    api_key: '',
    enabled: true,
  }), null);

  const summary = getUserAiModelSummary({
    provider: 'glm',
    model: 'glm-4.5',
    api_key: 'test-key',
    enabled: true,
  });

  assert.ok(summary);
  assert.equal(summary.provider, 'glm');
  assert.equal(summary.model, 'glm-4.5');
  assert.equal(summary.source, 'user');
  assert.doesNotMatch(JSON.stringify(summary), /test-key/);
});
