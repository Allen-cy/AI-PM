import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildWorkflowEvent,
  calculateRiskPriority,
  calculateRiskScore,
  classifyRisks,
  generateMatrixGrid,
  getWorkflowStepForStatus,
  initialRisks,
  nextRiskStatus,
  riskChecklistItems,
  riskLifecycleSteps,
} from '../src/lib/risk.ts';

test('risk score and priority keep probability-impact matrix separate from urgency', () => {
  assert.equal(calculateRiskScore(4, 5), 20);
  assert.equal(calculateRiskPriority(4, 5, 3), 60);
});

test('risk model includes lifecycle, checklist and matrix-ready records', () => {
  const classified = classifyRisks(initialRisks);
  const grid = generateMatrixGrid(initialRisks);

  assert.ok(riskLifecycleSteps.length >= 6);
  assert.ok(riskChecklistItems.some(item => item.linkedModule === '合同回款'));
  assert.ok(classified.high.length >= 1);
  assert.ok(grid['4-5'].some(risk => risk.id === 'R001'));
});

test('risk workflow defines input output action owner and deadline for each transition', () => {
  for (const step of riskLifecycleSteps) {
    assert.ok(step.input.length > 0);
    assert.ok(step.output.length > 0);
    assert.ok(step.requiredAction.length > 0);
    assert.ok(step.exitCriteria.length > 0);
  }

  assert.equal(nextRiskStatus('identified'), 'analyzing');
  assert.equal(nextRiskStatus('response-planned'), 'response-implementing');
  assert.equal(nextRiskStatus('monitoring'), 'tracking');

  const sourceRisk = initialRisks[0];
  const event = buildWorkflowEvent(sourceRisk, 'analyzing', {
    owner: '项目经理A',
    deadline: '2026-07-08',
    inputSummary: '风险线索和项目事实',
    outputSummary: '完成风险定性分析',
    actionRequired: '组织风险评审会',
  });

  assert.equal(event.fromStatus, sourceRisk.status);
  assert.equal(event.toStatus, 'analyzing');
  assert.equal(event.workflowStep, getWorkflowStepForStatus('analyzing').step);
  assert.equal(event.owner, '项目经理A');
  assert.equal(event.deadline, '2026-07-08');
  assert.equal(event.inputSummary, '风险线索和项目事实');
  assert.equal(event.outputSummary, '完成风险定性分析');
  assert.equal(event.actionRequired, '组织风险评审会');
});
