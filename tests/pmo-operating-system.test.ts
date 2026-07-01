import assert from 'node:assert/strict';
import test from 'node:test';

import {
  dataQualityRules,
  deriveWorkbenchSummary,
  governanceWorkflows,
  operatingDependencies,
} from '../src/features/pmo-operating-system.ts';
import {
  diagnoseIntegrationState,
  evaluateDataQuality,
  evaluateFeishuFieldMappings,
} from '../src/features/operating-system/diagnostics.ts';
import { buildOperationalWorkbench } from '../src/features/operating-system/workbench.ts';
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

test('field mapping diagnostics detect missing Chinese fields and aliases', () => {
  const checks = evaluateFeishuFieldMappings({
    configuredTables: ['project'],
    fieldNamesByTable: {
      project: ['项目ID', '项目名称', '项目状态', '项目等级', '项目类型', '项目负责人', '当前进度'],
    },
  });

  const project = checks.find(item => item.tableKey === 'project');
  const risk = checks.find(item => item.tableKey === 'risk');

  assert.equal(project?.status, 'warning');
  assert.equal(project?.missingFields.includes('项目编号'), false);
  assert.equal(project?.missingFields.includes('合同金额'), true);
  assert.equal(risk?.status, 'not_configured');
});

test('live data quality scanner flags owner deadline finance and risk closure issues', () => {
  const checks = evaluateDataQuality({
    rules: dataQualityRules,
    dashboard: null,
    projectRecords: [
      {
        项目名称: '高风险项目A',
        项目状态: '随便填',
        风险等级: '高',
        合同金额: 100,
        已回款金额: 120,
      },
    ],
    riskRecords: [
      {
        风险编号: 'R-1',
        项目名称: '高风险项目A',
        风险等级: '高',
      },
    ],
  });

  assert.equal(checks.find(item => item.id === 'missing-owner')?.affectedCount, 1);
  assert.equal(checks.find(item => item.id === 'missing-deadline')?.status, 'error');
  assert.equal(checks.find(item => item.id === 'finance-mismatch')?.affectedCount, 1);
  assert.equal(checks.find(item => item.id === 'risk-without-action')?.status, 'error');
});

test('integration diagnostics summarize failed mappings and data quality issues', () => {
  const fieldChecks = evaluateFeishuFieldMappings({
    configuredTables: ['project'],
    fieldNamesByTable: { project: ['项目名称'] },
  });
  const qualityChecks = evaluateDataQuality({
    rules: dataQualityRules,
    dashboard: null,
    projectRecords: [{ 项目名称: '项目A', 风险等级: '高' }],
  });

  const advices = diagnoseIntegrationState({
    feishuStatus: 'degraded',
    aiConfigured: false,
    ragStatus: 'ok',
    fieldMappingChecks: fieldChecks,
    dataQualityChecks: qualityChecks,
    syncLogStatus: 'skipped',
  });

  assert.equal(advices.some(item => item.id === 'field-mapping-missing'), true);
  assert.equal(advices.some(item => item.id === 'data-quality-issues'), true);
  assert.equal(advices.some(item => item.id === 'ai-model-not-configured'), true);
  assert.equal(advices.some(item => item.id === 'sync-log-not-persisted'), true);
});

test('operational workbench filters projects risks todos and reminders for current user', () => {
  const workbench = buildOperationalWorkbench({
    user: { name: '张三', email: 'zhangsan@example.com', phone: '13800000000', role: 'user' },
    projects: [
      {
        项目编号: 'P-1',
        项目名称: '张三负责项目',
        项目负责人: '张三',
        项目状态: '进行中',
        当前阶段: '执行',
        当前进度: 0.55,
        风险等级: '高',
        应收金额: 20,
        到期日期: '2026-07-02',
      },
      {
        项目编号: 'P-2',
        项目名称: '李四负责项目',
        项目负责人: '李四',
        项目状态: '进行中',
        当前进度: 0.9,
      },
    ],
    risks: [
      {
        风险编号: 'R-1',
        项目名称: '张三负责项目',
        风险描述: '核心资源冲突',
        风险等级: '高',
        状态: '应对中',
        风险责任人: '张三',
        复核日期: '2026-07-02',
        应对措施: '升级资源协调',
      },
    ],
    tasks: [
      {
        任务编号: 'T-1',
        项目名称: '张三负责项目',
        任务名称: '完成阶段计划',
        责任人: '张三',
        计划完成: '2026-07-02',
        任务状态: '进行中',
      },
    ],
    milestones: [
      {
        里程碑编号: 'M-1',
        项目名称: '李四负责项目',
        里程碑名称: '李四项目阶段门',
        责任人: '李四',
        计划完成: '2026-07-02',
        里程碑状态: '进行中',
      },
    ],
    payments: [
      {
        回款编号: 'PAY-1',
        项目名称: '张三负责项目',
        客户名称: '客户A',
        应收金额: 20,
        到期日期: '2026-07-02',
        回款状态: '待回款',
      },
    ],
  });

  assert.equal(workbench.evidence.userScope, 'matched-owner');
  assert.equal(workbench.myProjects.length, 1);
  assert.equal(workbench.myProjects[0].name, '张三负责项目');
  assert.equal(workbench.myRisks.length, 1);
  assert.equal(workbench.todayTodos.some(item => item.id === 'T-1'), true);
  assert.equal(workbench.todayTodos.some(item => item.id === 'M-1'), false);
  assert.equal(workbench.businessReminders.length >= 1, true);
  assert.match(workbench.aiSuggestions[0].basis, /任务1条/);
});

test('operational workbench shows all records for admin role', () => {
  const workbench = buildOperationalWorkbench({
    user: { name: '管理员', role: 'admin' },
    projects: [
      { 项目编号: 'P-1', 项目名称: '项目A', 项目负责人: '张三', 项目状态: '进行中', 当前进度: 0.5 },
      { 项目编号: 'P-2', 项目名称: '项目B', 项目负责人: '李四', 项目状态: '进行中', 当前进度: 0.6 },
    ],
    risks: [],
    tasks: [],
    milestones: [],
    payments: [],
  });

  assert.equal(workbench.evidence.userScope, 'admin-all');
  assert.equal(workbench.myProjects.length, 2);
  assert.equal(workbench.kpis.find(item => item.label === '我的项目')?.value, '2');
});
