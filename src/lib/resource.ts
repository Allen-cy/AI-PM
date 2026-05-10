// Resource Management Types and Utilities

export interface Allocation {
  projectId: string;
  projectName: string;
  allocatedHours: number;
  startDate: string;
  endDate: string;
}

export interface TeamMember {
  id: string;
  name: string;
  role: string;
  skills: string[];
  hourlyRate: number;
  availableHours: number;  // per week
  allocation: Allocation[];
}

export interface SkillLevel {
  skill: string;
  level: 1 | 2 | 3 | 4 | 5;  // 1=基础, 5=专家
}

export interface ResourceOptimization {
  overloadedMembers: string[];
  underutilizedMembers: string[];
  conflictProjects: string[][];
  suggestions: string[];
}

// Test data: 6 team members with varying allocations
export const TEST_TEAM_MEMBERS: TeamMember[] = [
  {
    id: "tm-001",
    name: "张三",
    role: "高级Java开发",
    skills: ["Java", "数据库", "DevOps"],
    hourlyRate: 400,
    availableHours: 40,
    allocation: [
      { projectId: "p-001", projectName: "在线教育平台开发", allocatedHours: 32, startDate: "2026-05-01", endDate: "2026-06-30" },
      { projectId: "p-003", projectName: "内部CRM系统升级", allocatedHours: 12, startDate: "2026-05-15", endDate: "2026-05-31" },
    ],
  },
  {
    id: "tm-002",
    name: "李四",
    role: "前端开发",
    skills: ["React", "UI设计", "Node.js"],
    hourlyRate: 350,
    availableHours: 40,
    allocation: [
      { projectId: "p-001", projectName: "在线教育平台开发", allocatedHours: 40, startDate: "2026-05-01", endDate: "2026-06-30" },
    ],
  },
  {
    id: "tm-003",
    name: "王五",
    role: "全栈工程师",
    skills: ["Python", "React", "数据库", "项目管玾"],
    hourlyRate: 450,
    availableHours: 40,
    allocation: [
      { projectId: "p-002", projectName: "数据中台建设", allocatedHours: 24, startDate: "2026-05-01", endDate: "2026-07-31" },
      { projectId: "p-004", projectName: "移动端App开发", allocatedHours: 28, startDate: "2026-05-10", endDate: "2026-06-30" },
    ],
  },
  {
    id: "tm-004",
    name: "赵六",
    role: "项目经理",
    skills: ["项目管理", "Java", "Python"],
    hourlyRate: 500,
    availableHours: 40,
    allocation: [
      { projectId: "p-001", projectName: "在线教育平台开发", allocatedHours: 16, startDate: "2026-05-01", endDate: "2026-06-30" },
      { projectId: "p-002", projectName: "数据中台建设", allocatedHours: 12, startDate: "2026-05-01", endDate: "2026-07-31" },
      { projectId: "p-003", projectName: "内部CRM系统升级", allocatedHours: 8, startDate: "2026-05-15", endDate: "2026-06-30" },
    ],
  },
  {
    id: "tm-005",
    name: "孙七",
    role: "UI设计师",
    skills: ["UI设计", "React"],
    hourlyRate: 300,
    availableHours: 40,
    allocation: [
      { projectId: "p-001", projectName: "在线教育平台开发", allocatedHours: 20, startDate: "2026-05-01", endDate: "2026-06-30" },
    ],
  },
  {
    id: "tm-006",
    name: "周八",
    role: "DevOps工程师",
    skills: ["DevOps", "数据库", "Python"],
    hourlyRate: 420,
    availableHours: 40,
    allocation: [
      { projectId: "p-002", projectName: "数据中台建设", allocatedHours: 8, startDate: "2026-05-01", endDate: "2026-07-31" },
    ],
  },
];

export const ACTIVE_PROJECTS = [
  { id: "p-001", name: "在线教育平台开发", status: "进行中" },
  { id: "p-002", name: "数据中台建设", status: "进行中" },
  { id: "p-003", name: "内部CRM系统升级", status: "进行中" },
  { id: "p-004", name: "移动端App开发", status: "进行中" },
];

export const SKILL_CATEGORIES = [
  "Java", "Python", "React", "Node.js", "数据库", "项目管理", "UI设计", "DevOps"
];

// Calculate utilization percentage for a team member
export function calculateUtilization(member: TeamMember): number {
  const totalAllocated = member.allocation.reduce((sum, a) => sum + a.allocatedHours, 0);
  return Math.round((totalAllocated / member.availableHours) * 100);
}

// Find overloaded members (>100% allocation)
export function findOverloadedMembers(members: TeamMember[]): TeamMember[] {
  return members.filter(m => calculateUtilization(m) > 100);
}

// Find underutilized members (<60% allocation)
export function findUnderutilizedMembers(members: TeamMember[]): TeamMember[] {
  return members.filter(m => calculateUtilization(m) < 60 && calculateUtilization(m) > 0);
}

// Get members available on a specific date
export function getAvailableMembers(members: TeamMember[], date: string): TeamMember[] {
  const targetDate = new Date(date);
  return members.filter(member => {
    return !member.allocation.some(a => {
      const start = new Date(a.startDate);
      const end = new Date(a.endDate);
      return targetDate >= start && targetDate <= end;
    });
  });
}

// Get allocation color based on utilization
export function getUtilizationColor(utilization: number): string {
  if (utilization > 100) return "var(--red)";
  if (utilization > 80) return "var(--amber)";
  return "var(--green)";
}

// Optimize resource allocation
export function optimizeAllocation(
  members: TeamMember[],
  projects: string[]
): ResourceOptimization {
  const overloaded: string[] = [];
  const underutilized: string[] = [];
  const conflicts: string[][] = [];
  const suggestions: string[] = [];

  // Analyze each member
  for (const member of members) {
    const utilization = calculateUtilization(member);

    if (utilization > 100) {
      overloaded.push(member.name);

      // Find conflicting projects
      const projectNames = member.allocation.map(a => a.projectName);
      if (projectNames.length > 1) {
        conflicts.push(projectNames);
      }

      suggestions.push(`${member.name} (${member.role}) 超负荷 ${utilization - 100}%，建议重新分配项目或调整工期`);
    } else if (utilization < 60 && utilization > 0) {
      underutilized.push(member.name);
      suggestions.push(`${member.name} 利用率仅 ${utilization}%，建议增加项目分配或安排学习`);
    }
  }

  // General optimization suggestions
  if (overloaded.length > 0) {
    suggestions.push("考虑将部分项目任务转移给利用率较低的团队成员");
  }

  if (underutilized.length > 2) {
    suggestions.push("整体资源利用率偏低，建议评估项目进度或扩展项目范围");
  }

  return {
    overloadedMembers: overloaded,
    underutilizedMembers: underutilized,
    conflictProjects: conflicts,
    suggestions,
  };
}

// Generate skill matrix data
export function getSkillMatrixData(members: TeamMember[]): {
  member: string;
  role: string;
  skills: { [key: string]: number };
}[] {
  return members.map(m => {
    const skillLevels: { [key: string]: number } = {};
    SKILL_CATEGORIES.forEach(skill => {
      skillLevels[skill] = m.skills.includes(skill) ? Math.floor(Math.random() * 3) + 3 : 0;
    });
    return {
      member: m.name,
      role: m.role,
      skills: skillLevels,
    };
  });
}