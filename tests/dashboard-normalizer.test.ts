import assert from 'node:assert/strict';
import test from 'node:test';

import { buildDashboardData, normalizeProjectRows } from '../src/features/dashboard/normalizer.ts';
import type { DashboardProjectRecord } from '../src/features/dashboard/types.ts';

test('builds monthly trend from Feishu millisecond timestamp strings', () => {
  const records = normalizeProjectRows([
    {
      项目名称: '飞书时间戳项目A',
      签约时间: '1673366400000',
      合同金额: 100,
      已回款金额: 40,
      当前进度: 0.8,
    },
    {
      项目名称: '飞书时间戳项目B',
      计划开始: '1704067200000',
      合同金额: 200,
      已回款金额: 120,
      当前进度: 0.6,
    },
  ]);

  const dashboard = buildDashboardData(records, { type: 'feishu', name: '飞书智能表' });

  assert.deepEqual(dashboard.monthlyTrend, [
    { month: '2023-01', contract: 100, collection: 40 },
    { month: '2024-01', contract: 200, collection: 120 },
  ]);
});

test('builds monthly trend from yyyymmdd date values', () => {
  const records = normalizeProjectRows([
    {
      项目名称: '八位日期项目',
      签约时间: '20260618',
      合同金额: 88,
      已回款金额: 20,
      当前进度: 0.5,
    },
  ]);

  const dashboard = buildDashboardData(records, { type: 'file', name: '导入文件' });

  assert.deepEqual(dashboard.monthlyTrend, [
    { month: '2026-06', contract: 88, collection: 20 },
  ]);
});

test('rebuilds monthly trend from cached normalized records with raw timestamp dates', () => {
  const cachedRecord: DashboardProjectRecord = {
    项目编号: 'P-CACHE',
    项目名称: '旧缓存项目',
    省份: '江苏',
    客户名称: '缓存客户',
    项目状态: '执行中',
    项目等级: 'A',
    项目类型: '信息化',
    产品类别: '项目管理',
    签约时间: '1673366400000',
    计划开始: '1673366400000',
    计划完成: '1704902400000',
    当前进度: 0.8,
    合同金额: 123,
    已回款金额: 23,
    应收金额: 100,
    回款率: 23 / 123,
    成本健康度: 76,
    进度偏差: -3,
    风险类型: '回款风险',
    风险等级: '中',
    风险状态: '已识别',
    风险趋势: '平稳',
    到期日期: '1704902400000',
  };

  const dashboard = buildDashboardData([cachedRecord], { type: 'feishu', name: '旧缓存' });

  assert.deepEqual(dashboard.monthlyTrend, [
    { month: '2023-01', contract: 123, collection: 23 },
  ]);
});
