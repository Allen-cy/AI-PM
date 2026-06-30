import { FeishuBaseClient } from '../feishu/client.ts';
import type { FeishuConfig } from '../feishu/config.ts';
import { buildDashboardData, normalizeProjectRows } from './normalizer.ts';
import type { DashboardData } from './types.ts';

function scalar(value: unknown): unknown {
  if (Array.isArray(value)) {
    const first = value[0] as unknown;
    if (typeof first === 'object' && first !== null && 'text' in first) return (first as { text: unknown }).text;
    if (typeof first === 'object' && first !== null && 'name' in first) return (first as { name: unknown }).name;
    return first;
  }
  return value;
}

function normalizeFields(fields: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, scalar(value)]));
}

export async function loadDashboardFromFeishu(config: FeishuConfig): Promise<DashboardData> {
  const client = new FeishuBaseClient(config);
  const [projects, risks, payments, contracts] = await Promise.all([
    client.listRecords('project', 500).catch(() => []),
    client.listRecords('risk', 500).catch(() => []),
    client.listRecords('payment', 500).catch(() => []),
    client.listRecords('contract', 500).catch(() => []),
  ]);

  const riskByIndex = risks.map(item => normalizeFields(item.fields));
  const rows = projects.map((item, index) => {
    const project = normalizeFields(item.fields);
    const risk = riskByIndex[index % Math.max(1, riskByIndex.length)] ?? {};
    return {
      ...project,
      项目编号: project.project_id ?? project['项目编号'] ?? item.recordId,
      项目名称: project['项目名称'],
      项目状态: project['项目状态'],
      当前状态: project['当前状态'],
      项目等级: project['项目等级'],
      项目类型: project['项目类型'],
      当前进度: project['当前进度'],
      合同金额: Number(project['合同金额'] ?? 0),
      已回款金额: Number(project['已回款金额'] ?? project['回款额'] ?? 0),
      应收金额: Number(project['应收金额'] ?? project['应催账款'] ?? 0),
      回款率: Number(project['回款率'] ?? 0),
      风险类型: project['风险类型'] ?? risk['风险类别'] ?? risk['风险类型'],
      风险等级: project['风险等级'] ?? (Number(risk['风险值'] ?? 0) >= 12 ? '高' : Number(risk['风险值'] ?? 0) >= 6 ? '中' : undefined),
      风险状态: project['风险状态'] ?? risk['状态'],
      风险趋势: project['风险趋势'] ?? risk['风险趋势'],
      重点项目标记: project['重点项目标记'] ?? project['重点项目'] ?? project['是否重点项目'],
      重点项目原因: project['重点项目原因'],
      执行阶段进度: project['执行阶段进度'] ?? project['执行进度'],
      监控阶段进度: project['监控阶段进度'] ?? project['监控进度'],
      收尾阶段进度: project['收尾阶段进度'] ?? project['收尾进度'],
    };
  });

  return buildDashboardData(normalizeProjectRows(rows), {
    type: 'feishu',
    name: '飞书智能表',
    note: `项目${projects.length}条，风险${risks.length}条，合同${contracts.length}条，回款${payments.length}条。飞书缺失的看板衍生字段已按规则补齐。`,
  });
}
