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

function dateByOffset(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

test('groups receivables by due-date aging and excludes fully collected projects', () => {
  const records = normalizeProjectRows([
    { 项目名称: '未到期应收', 合同金额: 100, 已回款金额: 90, 应收金额: 10, 到期日期: dateByOffset(15) },
    { 项目名称: '逾期15天', 合同金额: 100, 已回款金额: 80, 应收金额: 20, 到期日期: dateByOffset(-15) },
    { 项目名称: '逾期45天', 合同金额: 100, 已回款金额: 70, 应收金额: 30, 到期日期: dateByOffset(-45) },
    { 项目名称: '逾期75天', 合同金额: 100, 已回款金额: 60, 应收金额: 40, 到期日期: dateByOffset(-75) },
    { 项目名称: '逾期120天', 合同金额: 100, 已回款金额: 50, 应收金额: 50, 到期日期: dateByOffset(-120) },
    { 项目名称: '未设到期日', 合同金额: 100, 已回款金额: 40, 应收金额: 60 },
    { 项目名称: '已全额回款', 合同金额: 100, 已回款金额: 100, 应收金额: 0, 到期日期: dateByOffset(-300) },
  ]);

  const dashboard = buildDashboardData(records, { type: 'feishu', name: '飞书智能表' });

  assert.deepEqual(dashboard.paymentGroups, [
    { range: '未到期', count: 1, amount: 10 },
    { range: '逾期1-30天', count: 1, amount: 20 },
    { range: '逾期31-60天', count: 1, amount: 30 },
    { range: '逾期61-90天', count: 1, amount: 40 },
    { range: '逾期90天以上', count: 1, amount: 50 },
    { range: '未设到期日', count: 1, amount: 60 },
  ]);
});

test('derives key project progress chain from marker and project risk data', () => {
  const records = normalizeProjectRows([
    {
      项目编号: 'KEY-001',
      项目名称: '重点项目样例',
      项目等级: 'A',
      项目状态: '执行中',
      当前进度: 0.72,
      合同金额: 350,
      已回款金额: 120,
      应收金额: 230,
      成本健康度: 80,
      进度偏差: -8,
      风险等级: '中',
      重点项目标记: '是',
      重点项目原因: '客户战略项目',
      执行阶段进度: 76,
      监控阶段进度: 68,
      收尾阶段进度: 10,
    },
    {
      项目编号: 'NORMAL-001',
      项目名称: '普通项目样例',
      项目等级: 'C',
      项目状态: '执行中',
      当前进度: 0.4,
      合同金额: 80,
      已回款金额: 60,
      应收金额: 20,
      成本健康度: 90,
      进度偏差: 0,
      风险等级: '低',
      重点项目标记: '否',
    },
  ]);

  const dashboard = buildDashboardData(records, { type: 'file', name: '重点项目测试' });

  assert.equal(dashboard.keyProjects.length, 1);
  assert.equal(dashboard.keyProjects[0].id, 'KEY-001');
  assert.equal(dashboard.keyProjects[0].executionProgress, 76);
  assert.equal(dashboard.keyProjects[0].monitoringProgress, 68);
  assert.equal(dashboard.keyProjects[0].closingProgress, 10);
  assert.match(dashboard.keyProjects[0].dependencyNote, /收尾依赖|执行、监控、收尾/);
});
