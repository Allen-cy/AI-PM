import assert from 'node:assert/strict';
import test from 'node:test';

import { buildDashboardData, normalizeProjectRows } from '../src/features/dashboard/normalizer.ts';

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
