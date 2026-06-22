import { FeishuApiError, FeishuBaseClient } from '../../../../../features/feishu/client.ts';
import { readFeishuConfig } from '../../../../../features/feishu/config.ts';

export const runtime = 'nodejs';

export async function GET(): Promise<Response> {
  const id = crypto.randomUUID();
  const config = readFeishuConfig();
  if (!config) {
    return Response.json({
      status: 'not_configured',
      identity: 'bot',
      detail: 'Server-side Feishu app credentials and Base mapping are required.',
      request_id: id,
    }, {
      status: 503,
      headers: { 'Cache-Control': 'no-store', 'X-Request-Id': id },
    });
  }

  try {
    const health = await new FeishuBaseClient(config).health();
    return Response.json({ ...health, request_id: id }, {
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
      request_id: id,
    }, {
      status: 503,
      headers: { 'Cache-Control': 'no-store', 'X-Request-Id': id },
    });
  }
}
