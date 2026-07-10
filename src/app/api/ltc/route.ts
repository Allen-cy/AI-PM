import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedApiUser } from '@/features/auth/server';
import { FeishuApiError, FeishuBaseClient } from '@/features/feishu/client';
import { getEffectiveFeishuConfig } from '@/features/feishu/user-config';
import { normalizeLtcFields, normalizeLtcProject, type LTCRealProject } from '@/features/ltc/real-data';
import { canAccessProjectRecord } from '@/features/security/authorization';
import { loadProjectAccessGrantsForUser } from '@/features/security/repository';

const DATA_CLASSES = new Set<LTCRealProject['dataClass']>(['production', 'sample', 'test', 'diagnostic', 'unclassified']);

function json(body: unknown, status: number, requestId: string) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store', 'X-Request-Id': requestId } });
}

export async function GET(request: NextRequest) {
  const requestId = crypto.randomUUID();
  const user = await requireAuthenticatedApiUser();
  if (!user) return json({ error: 'UNAUTHORIZED', request_id: requestId }, 401, requestId);
  const dataClass = String(new URL(request.url).searchParams.get('data_class') || 'production') as LTCRealProject['dataClass'];
  if (!DATA_CLASSES.has(dataClass)) return json({ error: 'DATA_CLASS_INVALID', request_id: requestId }, 400, requestId);
  const effective = await getEffectiveFeishuConfig();
  if (!effective.config?.tables.project) {
    return json({ error: 'FEISHU_PROJECT_NOT_CONFIGURED', detail: effective.setupHint || '请在用户中心配置个人飞书项目台账表ID。', lark_cli_hint: effective.larkCliHint, source: { type: 'feishu', fallback_used: false }, request_id: requestId }, 503, requestId);
  }
  try {
    const [records, grants] = await Promise.all([
      new FeishuBaseClient(effective.config).listRecords('project', 500),
      loadProjectAccessGrantsForUser(user),
    ]);
    const accessible = records.filter(record => canAccessProjectRecord(user, normalizeLtcFields(record), grants));
    const projects = accessible
      .map(normalizeLtcProject)
      .filter((project): project is LTCRealProject => Boolean(project))
      .filter(project => project.dataClass === dataClass);
    const tableLinks = Object.fromEntries(Object.entries(effective.config.tables).map(([key, tableId]) => {
      const url = new URL(`https://www.feishu.cn/base/${encodeURIComponent(effective.config!.baseToken)}`);
      if (tableId) url.searchParams.set('table', tableId);
      return [key, url.toString()];
    }));
    return json({
      status: 'succeeded',
      projects,
      bottlenecks: [],
      bottleneck_status: 'unavailable',
      bottleneck_detail: '需要在飞书中补齐各阶段实际开始、实际完成和项目关联字段后，才能计算真实瓶颈；当前不使用随机数据。',
      table_links: tableLinks,
      source: {
        type: 'feishu', fallback_used: false, data_class: dataClass,
        detail: `飞书项目台账共${records.length}条，按用户授权和${dataClass}数据空间筛选后${projects.length}条。`,
      },
      request_id: requestId,
    }, 200, requestId);
  } catch (error) {
    return json({ error: error instanceof FeishuApiError ? error.code : 'LTC_SOURCE_UNAVAILABLE', detail: error instanceof Error ? error.message : 'LTC数据源不可用。', source: { type: 'feishu', fallback_used: false }, request_id: requestId }, 503, requestId);
  }
}

export async function POST(request: NextRequest) {
  const user = await requireAuthenticatedApiUser();
  if (!user) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  try {
    const { projectId, stageId, stageData } = await request.json();

    // Deterministic completeness review; it does not invent project facts.
    const issues: string[] = [];
    const suggestions: string[] = [];

    // Basic validation
    if (!stageData?.entryCriteria?.length) {
      issues.push('缺少入口标准定义');
    }
    if (!stageData?.exitCriteria?.length) {
      issues.push('缺少出口标准定义');
    }
    if (!stageData?.deliverables?.length) {
      issues.push('缺少交付物定义');
    }

    // Generate a rule-based review from the submitted stage definition.
    const aiReasoning = `
【AI阶段评审报告】

项目: ${projectId}
阶段: ${stageData?.name || stageId} (${stageData?.alias || ''})

📋 评审维度:

1. 入口标准检查:
   - ${stageData?.entryCriteria?.length > 0 ? '✓ 已定义 ' + stageData.entryCriteria.length + ' 项入口标准' : '✗ 未定义入口标准'}

2. 出口标准检查:
   - ${stageData?.exitCriteria?.length > 0 ? '✓ 已定义 ' + stageData.exitCriteria.length + ' 项出口标准' : '✗ 未定义出口标准'}

3. 交付物检查:
   - ${stageData?.deliverables?.length > 0 ? '✓ 已定义 ' + stageData.deliverables.length + ' 项交付物' : '✗ 未定义交付物'}

4. RACI矩阵检查:
   - ${stageData?.raciMatrix ? '✓ 已定义RACI矩阵' : '✗ 未定义RACI矩阵'}

📊 评审结论:
${issues.length === 0 ? '✓ 阶段配置完整，可进入下一阶段审批流程' : '⚠ 阶段配置存在缺陷，建议补充完善'}

${suggestions.length > 0 ? '💡 改进建议:\n' + suggestions.map(s => `- ${s}`).join('\n') : ''}
`.trim();

    return NextResponse.json({
      approved: issues.length === 0,
      issues,
      suggestions,
      aiReasoning,
    });
  } catch (error) {
    console.error('LTC review error:', error);
    return NextResponse.json(
      { approved: false, issues: ['系统错误'], suggestions: ['请稍后重试'], aiReasoning: '评审服务暂不可用' },
      { status: 500 }
    );
  }
}
