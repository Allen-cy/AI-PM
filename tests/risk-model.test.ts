import assert from 'node:assert/strict';
import test from 'node:test';

import {
  calculateRiskPriority,
  calculateRiskScore,
  classifyRisks,
  generateMatrixGrid,
  initialRisks,
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

  assert.ok(riskLifecycleSteps.length >= 5);
  assert.ok(riskChecklistItems.some(item => item.linkedModule === '合同回款'));
  assert.ok(classified.high.length >= 1);
  assert.ok(grid['4-5'].some(risk => risk.id === 'R001'));
});
