export type DashboardSourceType = 'sample' | 'file' | 'feishu';

export interface DashboardKpi {
  totalProjects: number;
  totalContract: number;
  totalCollection: number;
  collectionRate: number;
  receivable: number;
}

export interface NamedValue {
  name: string;
  value: number;
  color: string;
}

export interface MonthlyTrend {
  month: string;
  contract: number;
  collection: number;
}

export interface RegionDistribution {
  region: string;
  count: number;
  amount: number;
}

export interface PaymentGroup {
  range: string;
  count: number;
  amount: number;
}

export interface HealthMatrixProject {
  name: string;
  progressDev: number;
  costHealth: number;
  status: 'green' | 'yellow' | 'red';
}

export interface RiskProject {
  id: string;
  name: string;
  riskType: string;
  severity: '高' | '中' | '低';
  status: string;
  trend: '恶化' | '平稳' | '改善';
}

export interface UpcomingPayment {
  project: string;
  party: string;
  amount: number;
  dueDate: string;
  daysLeft: number;
}

export interface DashboardProjectRecord {
  项目编号: string;
  项目名称: string;
  省份: string;
  客户名称: string;
  项目状态: string;
  项目等级: string;
  项目类型: string;
  产品类别: string;
  签约时间?: string;
  计划开始?: string;
  计划完成?: string;
  当前进度: number;
  合同金额: number;
  已回款金额: number;
  应收金额: number;
  回款率: number;
  成本健康度: number;
  进度偏差: number;
  风险类型: string;
  风险等级: '高' | '中' | '低';
  风险状态: string;
  风险趋势: '恶化' | '平稳' | '改善';
  到期日期?: string;
}

export interface DashboardData {
  source: {
    type: DashboardSourceType;
    name: string;
    generatedAt: string;
    note?: string;
  };
  kpi: DashboardKpi;
  statusDistribution: NamedValue[];
  monthlyTrend: MonthlyTrend[];
  regionDistribution: RegionDistribution[];
  paymentGroups: PaymentGroup[];
  projectLevels: NamedValue[];
  healthMatrix: HealthMatrixProject[];
  riskProjects: RiskProject[];
  upcomingPayments: UpcomingPayment[];
  records: DashboardProjectRecord[];
}
