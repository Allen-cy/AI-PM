import { loadDashboardFromFeishu } from '../../../../features/dashboard/feishu.ts';
import { getEffectiveFeishuConfig } from '../../../../features/feishu/user-config.ts';
import { filterDashboardByProjectAccess, projectAccessMode } from '../../../../features/security/authorization.ts';
import { loadProjectAccessGrantsForUser, writeOperationAudit } from '../../../../features/security/repository.ts';

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
    const rawData = await loadDashboardFromFeishu(config);
    const grants = await loadProjectAccessGrantsForUser(effective.user);
    const data = filterDashboardByProjectAccess(rawData, effective.user, grants);
    const access = {
      mode: projectAccessMode(effective.user, data.records.length, rawData.records.length),
      visible_projects: data.records.length,
      total_projects: rawData.records.length,
      explicit_grants: grants.length,
    };
    await writeOperationAudit({
      user: effective.user,
      action: 'dashboard_feishu_read',
      resourceType: 'dashboard',
      status: 'succeeded',
      summary: `读取项目组合看板：可见${access.visible_projects}/${access.total_projects}个项目`,
      detail: access,
      requestId,
    });
    return Response.json({
      status: 'succeeded',
      data,
      access,
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
