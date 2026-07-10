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
  return Math.round(tasks.reduce((sum, task) => sum + Math.max(0, Math.min(100, task.progress)), 0) / tasks.length);
}
