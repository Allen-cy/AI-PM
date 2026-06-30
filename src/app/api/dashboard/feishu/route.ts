import { loadDashboardFromFeishu } from '../../../../features/dashboard/feishu.ts';
import { getEffectiveFeishuConfig } from '../../../../features/feishu/user-config.ts';

export const runtime = 'nodejs';

export async function GET(): Promise<Response> {
  const requestId = crypto.randomUUID();
  const effective = await getEffectiveFeishuConfig();
  const config = effective.config;
  if (!config) {
    return Response.json({
      status: 'not_configured',
      code: 'FEISHU_NOT_CONFIGURED',
      detail: effective.setupHint,
      lark_cli_hint: effective.larkCliHint,
      source: effective.source,
      request_id: requestId,
    }, { status: process.env.AUTH_REQUIRED === 'true' && !effective.user ? 401 : 503, headers: { 'X-Request-Id': requestId, 'Cache-Control': 'no-store' } });
  }

  try {
    const data = await loadDashboardFromFeishu(config);
    return Response.json({
      status: 'succeeded',
      data,
      source: effective.source,
      request_id: requestId,
    }, { status: 200, headers: { 'X-Request-Id': requestId, 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error(JSON.stringify({
      level: 'error',
      event: 'dashboard.feishu.failed',
      request_id: requestId,
      message: error instanceof Error ? error.message : 'unknown',
    }));
    return Response.json({
      status: 'error',
      code: 'DASHBOARD_FEISHU_FAILED',
      request_id: requestId,
    }, { status: 503, headers: { 'X-Request-Id': requestId, 'Cache-Control': 'no-store' } });
  }
}
