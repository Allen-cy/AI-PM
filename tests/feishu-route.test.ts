import assert from 'node:assert/strict';
import test from 'node:test';

import { GET } from '../src/app/api/integrations/feishu/health/route.ts';

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
