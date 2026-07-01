import assert from 'node:assert/strict';
import test from 'node:test';

import {
  dataQualityRules,
  deriveWorkbenchSummary,
  governanceWorkflows,
  operatingDependencies,
} from '../src/features/pmo-operating-system.ts';
import type { DashboardData } from '../src/features/dashboard/types.ts';

test('operating system dependencies cover data ai knowledge and storage', () => {
  const categories = new Set(operatingDependencies.map(item => item.category));

  assert.equal(categories.has('data'), true);
  assert.equal(categories.has('ai'), true);
  assert.equal(categories.has('knowledge'), true);
  assert.equal(categories.has('storage'), true);
  assert.equal(operatingDependencies.every(item => item.action.length > 0), true);
});

test('governance workflows define inputs outputs owners states and audit trail', () => {
  assert.equal(governanceWorkflows.length >= 5, true);
  for (const workflow of governanceWorkflows) {
    assert.ok(workflow.owner);
    assert.ok(workflow.approver);
    assert.equal(workflow.inputs.length > 0, true);
    assert.equal(workflow.outputs.length > 0, true);
    assert.equal(workflow.states.length > 0, true);
    assert.ok(workflow.auditTrail);
  }
});

test('data quality rules include high severity closure prerequisites', () => {
  assert.equal(dataQualityRules.some(rule => rule.severity === 'high' && rule.id === 'risk-without-action'), true);
});

test('workbench summary derives action priorities from dashboard facts', () => {
  const dashboard: DashboardData = {
    source: { type: 'feishu', name: '飞书智能表', generatedAt: '2026-07-01T00:00:00.000Z' },
    kpi: {
      totalProjects: 3,
      totalContract: 100,
      totalCollection: 60,
      collectionRate: 60,
      receivable: 40,
    },
    statusDistribution: [],
    monthlyTrend: [],
    regionDistribution: [],
    paymentGroups: [],
    projectLevels: [],
    healthMatrix: [],
    keyProjects: [
      {
        id: 'P-1',
        name: '重点项目A',
        level: 'A',
        status: '进行中',
        marker: '是',
        reason: '高金额',
        executionProgress: 70,
        monitoringProgress: 50,
        closingProgress: 10,
        riskLevel: '高',
        riskType: '交付风险',
        receivable: 40,
        dependencyNote: '监控阶段落后于执行阶段，需要复核。',
      },
    ],
    riskProjects: [
      { id: 'R-1', name: '重点项目A', riskType: '交付风险', severity: '高', status: '应对中', trend: '恶化' },
    ],
    upcomingPayments: [
      { project: '重点项目A', party: '客户A', amount: 10, dueDate: '2026-07-03', daysLeft: 2 },
    ],
    records: [],
  };

  const summary = deriveWorkbenchSummary(dashboard);

  assert.equal(summary.kpis.find(item => item.label === '高风险项目')?.value, '1');
  assert.equal(summary.actions.some(action => action.priority === 'P0' && action.id === 'review-high-risks'), true);
  assert.equal(summary.keyProjects[0].name, '重点项目A');
  assert.match(summary.aiSuggestions[0].basis, /高风险项目1个/);
});

test('workbench summary gives setup action when dashboard data is unavailable', () => {
  const summary = deriveWorkbenchSummary(null);

  assert.equal(summary.actions[0].id, 'connect-feishu');
  assert.equal(summary.kpis[0].value, '待连接');
});
