import { calculateCPM, type Task } from './src/lib/cpm';

const tasks: Task[] = [
  { id: 'A', name: '项目启动与规划', duration: 5, predecessors: [] },
  { id: 'B', name: '需求分析与设计', duration: 8, predecessors: ['A'] },
  { id: 'C', name: '开发阶段一', duration: 15, predecessors: ['B'] },
  { id: 'D', name: '开发阶段二', duration: 10, predecessors: ['B'] },
  { id: 'E', name: '测试与集成', duration: 7, predecessors: ['C', 'D'] },
  { id: 'F', name: '用户验收测试', duration: 5, predecessors: ['E'] },
  { id: 'G', name: '部署与上线', duration: 3, predecessors: ['F'] },
];

const res = calculateCPM(tasks);
console.log('项目总工期:', res.projectDuration);
console.log('关键路径:', res.criticalPath.join(' -> '));
console.log('关键任务数:', res.criticalPath.length);
console.log('');
console.log('各任务详情:');
res.tasks.forEach(t => {
  console.log(`${t.id}: ES=${t.es} EF=${t.ef} LS=${t.ls} LF=${t.lf} 浮动=${t.totalFloat} 关键=${t.isCritical}`);
});