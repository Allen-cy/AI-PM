// Execution & Delivery - Task, Deliverable, and Change Request types & logic

export interface Task {
  id: string;
  name: string;
  assignee: string;
  status: 'pending' | 'in-progress' | 'completed' | 'blocked';
  priority: 'high' | 'medium' | 'low';
  dueDate: string;
  progress: number; // 0-100%
  blockedReason?: string;
}

export interface Deliverable {
  id: string;
  name: string;
  relatedTask?: string;
  status: 'pending' | 'in-progress' | 'ready' | 'accepted' | 'rejected';
  qualityCheck?: string;
}

export interface ChangeRequest {
  id: string;
  description: string;
  impact: string;
  requestor: string;
  status: 'pending' | 'approved' | 'rejected';
  approvedBy?: string;
  createdAt: string;
}

export interface TeamWorkload {
  member: string;
  taskCount: number;
  inProgressCount: number;
  blockedCount: number;
  utilization: number; // 0-100%
}

export function calculateTeamWorkload(tasks: Task[]): TeamWorkload[] {
  const memberMap = new Map<string, { total: number; inProgress: number; blocked: number }>();

  for (const task of tasks) {
    if (!memberMap.has(task.assignee)) {
      memberMap.set(task.assignee, { total: 0, inProgress: 0, blocked: 0 });
    }
    const stats = memberMap.get(task.assignee)!;
    stats.total++;
    if (task.status === 'in-progress') stats.inProgress++;
    if (task.status === 'blocked') stats.blocked++;
  }

  return Array.from(memberMap.entries()).map(([member, stats]) => ({
    member,
    taskCount: stats.total,
    inProgressCount: stats.inProgress,
    blockedCount: stats.blocked,
    utilization: Math.round((stats.inProgress / stats.total) * 100),
  }));
}

export function getBlockedTasks(tasks: Task[]): Task[] {
  return tasks.filter(t => t.status === 'blocked');
}

export function calculateProgress(tasks: Task[]): number {
  if (tasks.length === 0) return 0;
  const completed = tasks.filter(t => t.status === 'completed').length;
  return Math.round((completed / tasks.length) * 100);
}

// Test data for demo
export const DEMO_TASKS: Task[] = [
  { id: 'T1', name: '完成模块A开发', assignee: '张三', status: 'completed', priority: 'high', dueDate: '2026-05-08', progress: 100 },
  { id: 'T2', name: 'API接口联调', assignee: '李四', status: 'in-progress', priority: 'high', dueDate: '2026-05-12', progress: 60 },
  { id: 'T3', name: '前端页面集成', assignee: '王五', status: 'in-progress', priority: 'medium', dueDate: '2026-05-15', progress: 40 },
  { id: 'T4', name: '数据库优化', assignee: '赵六', status: 'blocked', priority: 'medium', dueDate: '2026-05-10', progress: 20, blockedReason: '等待DBA资源' },
  { id: 'T5', name: '安全漏洞修复', assignee: '张三', status: 'blocked', priority: 'high', dueDate: '2026-05-11', progress: 10, blockedReason: '等待安全团队评审' },
  { id: 'T6', name: '第三方支付集成', assignee: '李四', status: 'blocked', priority: 'high', dueDate: '2026-05-14', progress: 30, blockedReason: '等待厂商接口文档' },
  { id: 'T7', name: '单元测试编写', assignee: '王五', status: 'pending', priority: 'medium', dueDate: '2026-05-18', progress: 0 },
  { id: 'T8', name: '性能测试报告', assignee: '赵六', status: 'in-progress', priority: 'low', dueDate: '2026-05-20', progress: 75 },
];

export const DEMO_DELIVERABLES: Deliverable[] = [
  { id: 'D1', name: '需求规格说明书', relatedTask: 'T1', status: 'accepted', qualityCheck: '通过' },
  { id: 'D2', name: '系统设计文档', relatedTask: 'T2', status: 'in-progress' },
  { id: 'D3', name: 'API接口文档', relatedTask: 'T3', status: 'ready', qualityCheck: '待验收' },
  { id: 'D4', name: '测试报告', relatedTask: 'T8', status: 'pending' },
  { id: 'D5', name: '部署手册', status: 'pending' },
];

export const DEMO_CHANGE_REQUESTS: ChangeRequest[] = [
  { id: 'CR-001', description: '增加用户画像分析模块', impact: '增加5人天工作量', requestor: '王总', status: 'approved', approvedBy: '李经理', createdAt: '2026-05-05' },
  { id: 'CR-002', description: '修改登录流程，增加二次验证', impact: '增加2人天工作量', requestor: '安全部门', status: 'pending', createdAt: '2026-05-08' },
];