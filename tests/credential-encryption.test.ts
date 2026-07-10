import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  CredentialDecryptionError,
  decryptCredential,
  encryptCredential,
  resolveStoredCredential,
} from '../src/features/security/credential-encryption.ts';
import { getUserAiModelSummary } from '../src/features/ai/settings.ts';
import { testAiConnection } from '../src/features/ai/connection-test.ts';
import {
  connectionToFeishuConfig,
  resolvePersonalFeishuConfig,
} from '../src/features/feishu/user-config.ts';

const environment = {
  CREDENTIAL_ENCRYPTION_KEY: 'test-only-credential-root-secret-with-enough-entropy',
  CREDENTIAL_ENCRYPTION_KEY_VERSION: '3',
};

test('encrypts credentials with AES-GCM envelope, version and bound context', () => {
  const first = encryptCredential('sk-private-value', 'user_ai_settings:user-1:api_key', environment);
  const second = encryptCredential('sk-private-value', 'user_ai_settings:user-1:api_key', environment);

  assert.equal(first.keyVersion, 3);
  assert.match(first.encrypted, /^cred:v1:k3:/);
  assert.notEqual(first.encrypted, second.encrypted);
  assert.doesNotMatch(first.encrypted, /sk-private-value/);
  assert.equal(
    decryptCredential(first.encrypted, 'user_ai_settings:user-1:api_key', environment),
    'sk-private-value',
  );
  assert.throws(
    () => decryptCredential(first.encrypted, 'user_ai_settings:user-2:api_key', environment),
    (error: unknown) => error instanceof CredentialDecryptionError && !error.message.includes('sk-private-value'),
  );
});

test('supports legacy plaintext only as a migration fallback and prefers ciphertext', () => {
  const encrypted = encryptCredential('new-secret', 'user_feishu_connections:user-1:app_secret', environment);

  assert.deepEqual(resolveStoredCredential({
    encrypted: encrypted.encrypted,
    plaintext: 'legacy-secret',
    context: 'user_feishu_connections:user-1:app_secret',
    environment,
  }), { value: 'new-secret', source: 'encrypted', keyVersion: 3 });

  assert.deepEqual(resolveStoredCredential({
    encrypted: null,
    plaintext: 'legacy-secret',
    context: 'user_feishu_connections:user-1:app_secret',
    environment,
  }), { value: 'legacy-secret', source: 'legacy_plaintext', keyVersion: null });
});

test('AI summary relies on masked configuration metadata instead of reading the API key', () => {
  const summary = getUserAiModelSummary({
    provider: 'glm',
    model: 'glm-4.5',
    api_key_last4: '1234',
    enabled: true,
  });

  assert.ok(summary);
  assert.equal(summary.provider, 'glm');
  assert.doesNotMatch(JSON.stringify(summary), /1234/);
});

test('Feishu runtime config decrypts App Secret and Base token without exposing them in API source', () => {
  const appSecret = encryptCredential('feishu-secret', 'user_feishu_connections:user-1:app_secret', environment);
  const baseToken = encryptCredential('base-token', 'user_feishu_connections:user-1:base_token', environment);
  const config = connectionToFeishuConfig({
    user_id: 'user-1',
    app_id: 'cli_test',
    app_secret_encrypted: appSecret.encrypted,
    base_token_encrypted: baseToken.encrypted,
    table_mapping: { project: 'tbl_project' },
  }, environment);

  assert.ok(config);
  assert.equal(config.appSecret, 'feishu-secret');
  assert.equal(config.baseToken, 'base-token');

  const routeSource = readFileSync(new URL('../src/app/api/user/feishu-connection/route.ts', import.meta.url), 'utf8');
  assert.match(routeSource, /app_secret_encrypted/);
  assert.match(routeSource, /base_token_encrypted/);
  assert.match(routeSource, /appSecretMasked/);
  assert.match(routeSource, /baseTokenMasked/);
  assert.doesNotMatch(routeSource, /baseToken:\s*row\?\.base_token/);
});

test('credential persistence routes clear legacy plaintext when saving ciphertext', () => {
  const aiRoute = readFileSync(new URL('../src/app/api/user/ai-settings/route.ts', import.meta.url), 'utf8');
  const feishuRoute = readFileSync(new URL('../src/app/api/user/feishu-connection/route.ts', import.meta.url), 'utf8');

  assert.match(aiRoute, /api_key_encrypted/);
  assert.match(aiRoute, /api_key:\s*null/);
  assert.match(feishuRoute, /app_secret:\s*null/);
  assert.match(feishuRoute, /base_token:\s*null/);
});

test('P25 migration adds versioned encrypted columns and preserves plaintext only for migration reads', () => {
  const migration = readFileSync(new URL('../supabase/migrations/20260710071709_p25_encrypt_user_credentials.sql', import.meta.url), 'utf8');
  const runbook = readFileSync(new URL('../docs/p25-user-credential-encryption-runbook.md', import.meta.url), 'utf8');

  assert.match(migration, /api_key_encrypted text/);
  assert.match(migration, /app_secret_encrypted text/);
  assert.match(migration, /base_token_encrypted text/);
  assert.match(migration, /not \(api_key is not null and api_key_encrypted is not null\)/);
  assert.match(migration, /revoke select \(api_key, api_key_encrypted\)/);
  assert.match(runbook, /ai_plaintext_rows/);
  assert.match(runbook, /CREDENTIAL_ENCRYPTION_KEY_V1/);
});

test('AI provider error responses cannot echo a user credential', async () => {
  const apiKey = 'plain-private-key-123456789';
  const result = await testAiConnection({
    provider: 'openai-compatible',
    model: 'private-model',
    baseUrl: 'https://model.example/v1',
    apiKey,
  }, async () => new Response(`invalid credential ${apiKey}`, { status: 401 }));

  assert.equal(result.status, 'failed');
  assert.doesNotMatch(JSON.stringify(result), new RegExp(apiKey));
});

test('a configured personal Feishu connection fails closed when ciphertext cannot be decrypted', () => {
  assert.throws(() => resolvePersonalFeishuConfig({
    user_id: 'user-1',
    app_id: 'cli_test',
    app_secret_encrypted: 'cred:v1:k1:invalid:invalid:invalid',
    base_token_encrypted: 'cred:v1:k1:invalid:invalid:invalid',
    status: 'configured',
  }, environment), /PERSONAL_FEISHU_CREDENTIAL_UNAVAILABLE/);
});
