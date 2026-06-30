import { FeishuApiError, FeishuBaseClient } from '../../../../../features/feishu/client.ts';
import { getEffectiveFeishuConfig } from '../../../../../features/feishu/user-config.ts';

export const runtime = 'nodejs';

export async function GET(): Promise<Response> {
  const id = crypto.randomUUID();
  const effective = await getEffectiveFeishuConfig();
  const config = effective.config;
  if (!config) {
    return Response.json({
      status: 'not_configured',
      identity: 'bot',
      detail: effective.setupHint,
      lark_cli_hint: effective.larkCliHint,
      source: effective.source,
      request_id: id,
    }, {
      status: process.env.AUTH_REQUIRED === 'true' && !effective.user ? 401 : 503,
      headers: { 'Cache-Control': 'no-store', 'X-Request-Id': id },
    });
  }

  try {
    const health = await new FeishuBaseClient(config).health();
    return Response.json({ ...health, source: effective.source, request_id: id }, {
      status: health.status === 'ok' ? 200 : 503,
      headers: { 'Cache-Control': 'no-store', 'X-Request-Id': id },
    });
  } catch (error) {
    const code = error instanceof FeishuApiError ? error.code : 'FEISHU_UNKNOWN_ERROR';
    console.error(JSON.stringify({
      level: 'error',
      event: 'feishu.health.failed',
      request_id: id,
      code,
    }));
    return Response.json({
      status: 'error',
      identity: 'bot',
      code,
      source: effective.source,
      request_id: id,
    }, {
      status: 503,
      headers: { 'Cache-Control': 'no-store', 'X-Request-Id': id },
    });
  }
}
