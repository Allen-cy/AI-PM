import { FeishuBaseClient } from '../feishu/client.ts';
import type { FeishuConfig } from '../feishu/config.ts';
import { normalizeFeishuProjectIdentityCandidate } from '../operating-model/feishu-project.ts';
import { buildDashboardData, normalizeProjectRows } from './normalizer.ts';
import type { DashboardData } from './types.ts';

export type DashboardDataClass = 'production' | 'sample' | 'test' | 'diagnostic' | 'unclassified';

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

function recordDataClass(fields: Record<string, unknown>): DashboardDataClass {
  const normalized = normalizeFields(fields);
  const explicit = String(normalized['数据分类'] ?? normalized.data_class ?? '').trim().toLowerCase();
  if (['production', '正式', '生产'].includes(explicit)) return 'production';
  if (['sample', '样例', '示例'].includes(explicit) || normalized['样例来源'] || normalized.sample_source) return 'sample';
  if (['test', '测试'].includes(explicit) || normalized['测试批次'] || normalized.test_batch) return 'test';
  if (['diagnostic', '诊断'].includes(explicit)) return 'diagnostic';
  return 'unclassified';
}

export function buildDashboardRowsFromFeishu(
  projects: Array<{ recordId: string; fields: Record<string, unknown> }>,
  risks: Array<{ recordId: string; fields: Record<string, unknown> }>,
): Array<Record<string, unknown>> {
  const normalizedRisks = risks.map(item => normalizeFields(item.fields));
  const riskKey = (record: Record<string, unknown>): string => String(
    record['项目UUID'] ?? record.project_id ?? record['项目编号'] ?? record['关联项目编号'] ?? record['关联项目ID'] ?? '',
  ).trim().toLowerCase();
  const risksByProject = new Map<string, Array<Record<string, unknown>>>();
  for (const risk of normalizedRisks) {
    const key = riskKey(risk);
    if (key) risksByProject.set(key, [...(risksByProject.get(key) ?? []), risk]);
  }
  return projects.map(item => {
    const project = normalizeFields(item.fields);
    const code = String(project.project_id ?? project['项目编号'] ?? item.recordId).trim();
    const name = String(project['项目名称'] ?? '').trim();
    const projectRisks = risksByProject.get(code.toLowerCase()) ?? risksByProject.get(item.recordId.toLowerCase()) ?? [];
    const riskScore = (risk: Record<string, unknown>) => Number(risk['风险值'] ?? risk['风险评分'] ?? risk.score ?? 0) || 0;
    const risk = [...projectRisks].sort((a, b) => riskScore(b) - riskScore(a))[0] ?? {};
    const maxRiskScore = projectRisks.reduce((maximum, current) => Math.max(maximum, riskScore(current)), 0);
    const riskTypes = [...new Set(projectRisks.map(current => String(current['风险类别'] ?? current['风险类型'] ?? '').trim()).filter(Boolean))];
    const explicitRiskLevel = projectRisks.map(current => String(current['风险等级'] ?? current['严重度'] ?? '')).find(level => level.includes('高'))
      ?? projectRisks.map(current => String(current['风险等级'] ?? current['严重度'] ?? '')).find(level => level.includes('中'));
    return {
      ...project,
      项目编号: code,
      项目名称: name,
      项目状态: project['项目状态'],
      当前状态: project['当前状态'],
      项目等级: project['项目等级'],
      项目类型: project['项目类型'],
      项目负责人: project['项目负责人'] ?? project['项目经理'] ?? project['负责人'] ?? project['Owner'] ?? project.owner,
      项目经理: project['项目经理'] ?? project['项目负责人'] ?? project['负责人'] ?? project['Owner'] ?? project.owner,
      责任人: project['责任人'] ?? project['项目负责人'] ?? project['项目经理'] ?? project['负责人'],
      当前进度: project['当前进度'],
      合同金额: Number(project['合同金额'] ?? 0),
      已回款金额: Number(project['已回款金额'] ?? project['回款额'] ?? 0),
      应收金额: Number(project['应收金额'] ?? project['应催账款'] ?? 0),
      回款率: Number(project['回款率'] ?? 0),
      风险类型: project['风险类型'] ?? (riskTypes.join('、') || risk['风险类别'] || risk['风险类型']),
      风险等级: project['风险等级'] ?? explicitRiskLevel ?? (maxRiskScore >= 12 ? '高' : maxRiskScore >= 6 ? '中' : projectRisks.length ? '低' : undefined),
      风险状态: project['风险状态'] ?? risk['状态'],
      风险趋势: project['风险趋势'] ?? risk['风险趋势'],
      风险数量: projectRisks.length,
      最高风险值: maxRiskScore,
      重点项目标记: project['重点项目标记'] ?? project['重点项目'] ?? project['是否重点项目'],
      重点项目原因: project['重点项目原因'],
      执行阶段进度: project['执行阶段进度'] ?? project['执行进度'],
      监控阶段进度: project['监控阶段进度'] ?? project['监控进度'],
      收尾阶段进度: project['收尾阶段进度'] ?? project['收尾进度'],
    };
  });
}

export async function loadDashboardFromFeishu(
  config: FeishuConfig,
  options: { dataClass?: DashboardDataClass } = {},
): Promise<DashboardData> {
  const client = new FeishuBaseClient(config);
  const results = await Promise.allSettled([
    client.listRecords('project', 500),
    client.listRecords('risk', 500),
    client.listRecords('payment', 500),
    client.listRecords('contract', 500),
  ]);
  if (results[0].status === 'rejected') throw results[0].reason;
  const requestedDataClass = options.dataClass ?? 'production';
  const allProjects = results[0].value;
  const candidates = allProjects.flatMap(record => {
    try {
      return [normalizeFeishuProjectIdentityCandidate(record, config.baseToken)];
    } catch {
      return [];
    }
  });
  const allowedRecordIds = new Set(
    candidates
      .filter(candidate => candidate.dataClass === requestedDataClass)
      .map(candidate => candidate.sourceRecordId),
  );
  const projects = allProjects.filter(record => allowedRecordIds.has(record.recordId));
  const risks = results[1].status === 'fulfilled'
    ? results[1].value.filter(record => recordDataClass(record.fields) === requestedDataClass)
    : [];
  const payments = results[2].status === 'fulfilled'
    ? results[2].value.filter(record => recordDataClass(record.fields) === requestedDataClass)
    : [];
  const contracts = results[3].status === 'fulfilled'
    ? results[3].value.filter(record => recordDataClass(record.fields) === requestedDataClass)
    : [];
  const warnings = results.slice(1).flatMap((result, index) => result.status === 'rejected' ? [`${['风险', '回款', '合同'][index]}表读取失败`] : []);
  const rows = buildDashboardRowsFromFeishu(projects, risks);

  return buildDashboardData(normalizeProjectRows(rows), {
    type: 'feishu',
    name: '飞书智能表',
    note: [
      `当前数据空间：${requestedDataClass}。项目${projects.length}条，风险${risks.length}条，合同${contracts.length}条，回款${payments.length}条。`,
      allProjects.length > projects.length ? `已排除${allProjects.length - projects.length}条其他数据分类或未完成分类的项目记录。` : '',
      ...warnings,
    ].filter(Boolean).join(' '),
  }, { useTemplateFallback: false });
}
