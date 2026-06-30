import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildRiskTrackingReport,
  buildSensitivityReport,
  calculateSensitivity,
  sensitivityTemplates,
} from '../src/lib/risk-analytics.ts';
import {
  buildWorkflowReport,
  newProjectWorkflow,
  takeoverWorkflow,
} from '../src/lib/project-workflows.ts';
import { templateCatalog, templateRows } from '../src/lib/template-center.ts';
import { initialRisks } from '../src/lib/risk.ts';

test('risk sensitivity analysis ranks factors and produces report output', () => {
  const results = calculateSensitivity(sensitivityTemplates);
  assert.equal(results[0].rank, 1);
  assert.ok(results[0].swing >= results[results.length - 1].swing);

  const report = buildSensitivityReport('测试项目', sensitivityTemplates, results);
  assert.match(report, /测试项目 风险敏感性分析报告/);
  assert.match(report, /管理建议/);
});

test('risk tracking report summarizes open high and overdue risks', () => {
  const report = buildRiskTrackingReport(initialRisks, [{
    riskId: initialRisks[0].id,
    status: 'tracking',
    progress: 70,
    owner: '项目经理',
    deadline: '2026-07-15',
    actionTaken: '已完成风险评审',
    nextAction: '确认应急资源',
  }]);

  assert.match(report, /风险跟踪管理报告/);
  assert.match(report, /本次跟踪记录/);
  assert.match(report, /确认应急资源/);
});

test('project manager workflows require user inputs and produce readiness score', () => {
  const takeover = buildWorkflowReport(takeoverWorkflow, {});
  assert.equal(takeover.readiness, 0);
  assert.ok(takeover.completed.some(item => item.missing.length > 0));

  const values: Record<string, string> = {};
  for (const step of newProjectWorkflow.steps) {
    for (const input of step.userInputs) {
      if (input.required) values[`${step.id}.${input.id}`] = '已填写';
    }
  }
  const newProject = buildWorkflowReport(newProjectWorkflow, values);
  assert.equal(newProject.readiness, 100);
});

test('template center exposes risk and planning templates with downloadable rows', () => {
  assert.ok(templateCatalog.some(template => template.id === 'risk-sensitivity'));
  assert.ok(templateCatalog.some(template => template.id === 'mid-project-takeover'));
  assert.ok(templateRows('risk-tracking').length > 0);
  assert.ok(templateRows('new-project-best-practice').some(row => String(row['输出成果']).includes('干系人登记册')));
});
