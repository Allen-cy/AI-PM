import assert from 'node:assert/strict';
import test from 'node:test';

import { calculateCPM, type Task } from '../src/lib/cpm.ts';
import { buildCriticalPathNetworkLayout, type NetworkTask } from '../src/lib/cpm-network.ts';

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

test('critical path network layout separates dependent nodes into non-overlapping layers', () => {
  const tasks: Task[] = [
    { id: 'A', name: '启动', duration: 2, predecessors: [] },
    { id: 'B', name: '需求', duration: 4, predecessors: ['A'] },
    { id: 'C', name: '设计', duration: 3, predecessors: ['A'] },
    { id: 'D', name: '开发', duration: 6, predecessors: ['B', 'C'] },
    { id: 'E', name: '测试', duration: 2, predecessors: ['D'] },
    { id: 'F', name: '上线', duration: 1, predecessors: ['B', 'E'] },
  ];
  const result = calculateCPM(tasks);
  const layout = buildCriticalPathNetworkLayout(result.tasks as NetworkTask[], result.criticalPath);

  for (const task of result.tasks) {
    const current = layout.positions.get(task.id);
    assert.ok(current, `missing position for ${task.id}`);
    for (const predecessorId of task.predecessors) {
      const predecessor = layout.positions.get(predecessorId);
      assert.ok(predecessor, `missing predecessor position for ${predecessorId}`);
      assert.ok(predecessor.rank < current.rank, `${predecessorId} should be left of ${task.id}`);
      assert.ok(predecessor.x + layout.nodeWidth < current.x, `${predecessorId} should not overlap ${task.id}`);
    }
  }

  const positions = [...layout.positions.entries()];
  for (let i = 0; i < positions.length; i += 1) {
    for (let j = i + 1; j < positions.length; j += 1) {
      const [, a] = positions[i];
      const [, b] = positions[j];
      const separated = Math.abs(a.x - b.x) >= layout.nodeWidth || Math.abs(a.y - b.y) >= layout.nodeHeight;
      assert.ok(separated, 'network nodes should not overlap');
    }
  }

  assert.ok(layout.edges.some(edge => edge.fromId === 'B' && edge.toId === 'F' && edge.path.includes('L')));
});
