import assert from 'node:assert/strict';
import test from 'node:test';

import { calculateCPM, type Task } from '../src/lib/cpm.ts';

test('calculates deterministic critical path for parallel activities', () => {
  const tasks: Task[] = [
    { id: 'A', name: '启动', duration: 5, predecessors: [] },
    { id: 'B', name: '需求', duration: 8, predecessors: ['A'] },
    { id: 'C', name: '开发一', duration: 15, predecessors: ['B'] },
    { id: 'D', name: '开发二', duration: 10, predecessors: ['B'] },
    { id: 'E', name: '测试集成', duration: 7, predecessors: ['C', 'D'] },
    { id: 'F', name: '验收', duration: 5, predecessors: ['E'] },
  ];

  const result = calculateCPM(tasks);

  assert.equal(result.projectDuration, 40);
  assert.deepEqual(result.criticalPath, ['A', 'B', 'C', 'E', 'F']);
  assert.equal(result.tasks.find(task => task.id === 'D')?.totalFloat, 5);
});
