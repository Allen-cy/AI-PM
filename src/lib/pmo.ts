// PMO Governance - Types and Calculation Logic

export interface ProjectHealth {
  id: string;
  name: string;
  tier: 'S' | 'A' | 'B' | 'C';
  scheduleStatus: 'green' | 'amber' | 'red';
  budgetStatus: 'green' | 'amber' | 'red';
  qualityStatus: 'green' | 'amber' | 'red';
  overallStatus: 'healthy' | 'concern' | 'critical';
}

export interface OKRKeyResult {
  id: string;
  description: string;
  target: number;
  current: number;
  unit: string;
  progress: number; // percentage
}

export interface OKR {
  id: string;
  objective: string;
  keyResults: OKRKeyResult[];
  status: 'on-track' | 'at-risk' | 'behind';
  owner: string;
}

export interface GovernanceMetric {
  name: string;
  value: number;
  unit: string;
  target: number;
  status: 'green' | 'amber' | 'red';
}

// Calculate overall project health based on RAG statuses
export function calculateProjectHealth(project: ProjectHealth): 'healthy' | 'concern' | 'critical' {
  const { scheduleStatus, budgetStatus, qualityStatus } = project;

  // Critical if any status is red
  if (scheduleStatus === 'red' || budgetStatus === 'red' || qualityStatus === 'red') {
    return 'critical';
  }

  // Concern if any status is amber
  if (scheduleStatus === 'amber' || budgetStatus === 'amber' || qualityStatus === 'amber') {
    return 'concern';
  }

  return 'healthy';
}

// Calculate OKR key result progress percentage
export function calculateOKRProgress(kr: OKRKeyResult): number {
  if (kr.target === 0) return 0;
  const progress = Math.round((kr.current / kr.target) * 100);
  return Math.min(Math.max(progress, 0), 100); // clamp between 0-100
}

// Get projects that need escalation (concern or critical)
export function getEscalationProjects(projects: ProjectHealth[]): ProjectHealth[] {
  return projects.filter(p => p.overallStatus === 'critical' || p.overallStatus === 'concern');
}

// PRINCE2 Stage Gate Checklist
export interface PRINCE2Gate {
  id: string;
  stage: string;
  description: string;
  exitCriteria: string[];
  status: 'pending' | 'in-progress' | 'completed' | 'not-applicable';
  completedAt?: string;
}

export const prince2Gates: PRINCE2Gate[] = [
  {
    id: 'SU',
    stage: 'SU - 开始阶段',
    description: '启动阶段门 - 项目启动文件批准',
    exitCriteria: ['项目章程已批准', '项目经理已任命', '干系人登记册已创建', '初步风险登记册已建立'],
    status: 'completed',
    completedAt: '2026-04-15',
  },
  {
    id: 'LP',
    stage: 'LP - 规划阶段',
    description: '规划阶段门 - 业务案例和计划批准',
    exitCriteria: ['业务案例已验证', '项目管理计划已批准', '阶段计划已创建', '质量管理计划已确定'],
    status: 'completed',
    completedAt: '2026-04-28',
  },
  {
    id: 'MP',
    stage: 'MP - 监控阶段',
    description: '执行阶段门 - 里程碑检查点',
    exitCriteria: ['工作包按计划执行', '风险在可控范围', '偏差小于阈值', '阶段报告已提交'],
    status: 'in-progress',
  },
  {
    id: 'CP',
    stage: 'CP - 控制阶段',
    description: '控制阶段门 - 变更控制批准',
    exitCriteria: ['变更请求已评审', '配置项已记录', '变更委员会决策已执行'],
    status: 'pending',
  },
  {
    id: 'DP',
    stage: 'DP - 交付阶段',
    description: '交付阶段门 - 产品交付验收',
    exitCriteria: ['产品已测试', '质量标准已达标', '客户验收已获得', '交付文档已完善'],
    status: 'pending',
  },
  {
    id: 'CS',
    stage: 'CS - 收尾阶段',
    description: '收尾阶段门 - 项目收尾批准',
    exitCriteria: ['经验教训已记录', '最终产品已移交', '项目账目已关闭', '干系人满意度已评估'],
    status: 'pending',
  },
];

// Tier criteria
export interface TierCriteria {
  tier: 'S' | 'A' | 'B' | 'C';
  criteria: string[];
  color: string;
}

export const tierCriteria: TierCriteria[] = [
  {
    tier: 'S',
    criteria: ['合同金额 ≥ 500万', '战略重要性极高', '跨组织/跨部门', '延期风险 > 30%'],
    color: '#ef4444',
  },
  {
    tier: 'A',
    criteria: ['合同金额 100-500万', '战略重要性高', '多团队协作', '延期风险 15-30%'],
    color: '#f59e0b',
  },
  {
    tier: 'B',
    criteria: ['合同金额 30-100万', '战略重要性中', '单团队可完成', '延期风险 5-15%'],
    color: '#3b82f6',
  },
  {
    tier: 'C',
    criteria: ['合同金额 < 30万', '战略重要性低', '单人可完成', '延期风险 < 5%'],
    color: '#6b7280',
  },
];

// Test data - 12 active projects
export const initialProjects: ProjectHealth[] = [
  // S tier (2)
  { id: 'P001', name: '智慧城市项目', tier: 'S', scheduleStatus: 'red', budgetStatus: 'amber', qualityStatus: 'green', overallStatus: 'critical' },
  { id: 'P002', name: '金融科技平台', tier: 'S', scheduleStatus: 'green', budgetStatus: 'green', qualityStatus: 'green', overallStatus: 'healthy' },
  // A tier (5)
  { id: 'P003', name: '教育平台项目', tier: 'A', scheduleStatus: 'amber', budgetStatus: 'amber', qualityStatus: 'green', overallStatus: 'concern' },
  { id: 'P004', name: '医疗健康系统', tier: 'A', scheduleStatus: 'green', budgetStatus: 'amber', qualityStatus: 'green', overallStatus: 'healthy' },
  { id: 'P005', name: '物流追踪系统', tier: 'A', scheduleStatus: 'green', budgetStatus: 'green', qualityStatus: 'amber', overallStatus: 'healthy' },
  { id: 'P006', name: '零售会员系统', tier: 'A', scheduleStatus: 'amber', budgetStatus: 'green', qualityStatus: 'green', overallStatus: 'concern' },
  { id: 'P007', name: '政务OA系统', tier: 'A', scheduleStatus: 'green', budgetStatus: 'green', qualityStatus: 'green', overallStatus: 'healthy' },
  // B tier (4)
  { id: 'P008', name: '企业内部系统', tier: 'B', scheduleStatus: 'green', budgetStatus: 'green', qualityStatus: 'amber', overallStatus: 'healthy' },
  { id: 'P009', name: '数据分析平台', tier: 'B', scheduleStatus: 'amber', budgetStatus: 'green', qualityStatus: 'green', overallStatus: 'concern' },
  { id: 'P010', name: '客户关系系统', tier: 'B', scheduleStatus: 'green', budgetStatus: 'green', qualityStatus: 'green', overallStatus: 'healthy' } as ProjectHealth,
  { id: 'P011', name: '供应链管理系统', tier: 'B', scheduleStatus: 'green', budgetStatus: 'green', qualityStatus: 'green', overallStatus: 'healthy' },
  // C tier (1)
  { id: 'P012', name: '小工具开发', tier: 'C', scheduleStatus: 'green', budgetStatus: 'green', qualityStatus: 'green', overallStatus: 'healthy' },
];

// Fix the type issue - reassign correctly
initialProjects[9] = { id: 'P010', name: '客户关系系统', tier: 'B', scheduleStatus: 'green', budgetStatus: 'amber', qualityStatus: 'green', overallStatus: 'healthy' };

// Test data - OKRs
export const initialOKRs: OKR[] = [
  {
    id: 'OKR001',
    objective: '提升项目交付效率',
    status: 'at-risk',
    owner: 'PMO负责人',
    keyResults: [
      { id: 'KR001', description: '项目交付率', target: 90, current: 87, unit: '%', progress: 97 },
      { id: 'KR002', description: '里程碑达成率', target: 85, current: 78, unit: '%', progress: 92 },
      { id: 'KR003', description: '需求准时交付率', target: 88, current: 82, unit: '%', progress: 93 },
    ],
  },
  {
    id: 'OKR002',
    objective: '加强成本管理与控制',
    status: 'on-track',
    owner: 'PMO负责人',
    keyResults: [
      { id: 'KR004', description: '预算执行准确率', target: 95, current: 93, unit: '%', progress: 98 },
      { id: 'KR005', description: '成本超支控制率', target: 96, current: 94, unit: '%', progress: 98 },
      { id: 'KR006', description: '资源利用率', target: 85, current: 82, unit: '%', progress: 96 },
    ],
  },
  {
    id: 'OKR003',
    objective: '提高客户满意度',
    status: 'behind',
    owner: 'PMO负责人',
    keyResults: [
      { id: 'KR007', description: '客户满意度评分', target: 4.5, current: 4.1, unit: '分', progress: 91 },
      { id: 'KR008', description: '客户投诉关闭率', target: 98, current: 91, unit: '%', progress: 93 },
      { id: 'KR009', description: '服务响应及时率', target: 95, current: 88, unit: '%', progress: 93 },
    ],
  },
];

// Governance metrics
export const governanceMetrics: GovernanceMetric[] = [
  { name: '交付及时率', value: 87, unit: '%', target: 90, status: 'amber' },
  { name: '预算合规率', value: 94, unit: '%', target: 95, status: 'green' },
  { name: '风险关闭率', value: 82, unit: '%', target: 85, status: 'amber' },
  { name: '客户满意度', value: 4.1, unit: '分', target: 4.5, status: 'red' },
];

// Helper functions for status display
export function getStatusColor(status: 'green' | 'amber' | 'red'): string {
  const colors = {
    green: 'var(--green)',
    amber: 'var(--amber)',
    red: 'var(--red)',
  };
  return colors[status];
}

export function getTierColor(tier: 'S' | 'A' | 'B' | 'C'): string {
  const colors = {
    S: '#ef4444',
    A: '#f59e0b',
    B: '#3b82f6',
    C: '#6b7280',
  };
  return colors[tier];
}

export function getOKRStatusLabel(status: 'on-track' | 'at-risk' | 'behind'): string {
  const labels = {
    'on-track': '正常',
    'at-risk': '有风险',
    'behind': '滞后',
  };
  return labels[status];
}

export function getOKRStatusColor(status: 'on-track' | 'at-risk' | 'behind'): string {
  const colors = {
    'on-track': 'var(--green)',
    'at-risk': 'var(--amber)',
    'behind': 'var(--red)',
  };
  return colors[status];
}

// Portfolio overview calculation
export interface PortfolioOverview {
  totalProjects: number;
  activeProjects: number;
  totalContractValue: number;
  healthDistribution: {
    healthy: number;
    concern: number;
    critical: number;
  };
  tierDistribution: {
    S: number;
    A: number;
    B: number;
    C: number;
  };
}

export function calculatePortfolioOverview(projects: ProjectHealth[]): PortfolioOverview {
  const healthDistribution = { healthy: 0, concern: 0, critical: 0 };
  const tierDistribution = { S: 0, A: 0, B: 0, C: 0 };

  for (const p of projects) {
    healthDistribution[p.overallStatus]++;
    tierDistribution[p.tier]++;
  }

  return {
    totalProjects: projects.length,
    activeProjects: projects.filter(p => p.overallStatus !== 'critical').length,
    totalContractValue: 0, // Would be calculated from actual contract data
    healthDistribution,
    tierDistribution,
  };
}