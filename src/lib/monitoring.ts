// Monitoring Center Analytics Logic

export interface ProjectMetrics {
  id: string;
  name: string;
  scheduleVariance: number;   // SV in days
  costVariance: number;        // CV in 万元
  scopeChangeCount: number;
  riskCount: number;
  status: 'healthy' | 'concern' | 'critical';
  trend: 'improving' | 'stable' | 'declining';
}

export interface DashboardKPI {
  label: string;
  value: number;
  unit: string;
  target: number;
  status: 'green' | 'amber' | 'red';
}

export interface MonitoringAlert {
  projectId: string;
  projectName: string;
  type: 'schedule' | 'cost' | 'quality' | 'risk';
  severity: 'warning' | 'critical';
  message: string;
  suggestedAction: string;
}

// Test data - 8 projects with varying health statuses
export const MOCK_PROJECTS: ProjectMetrics[] = [
  { id: 'P-001', name: '智慧城市一期', scheduleVariance: 5, costVariance: 12, scopeChangeCount: 2, riskCount: 1, status: 'healthy', trend: 'stable' },
  { id: 'P-002', name: '教育平台建设', scheduleVariance: -8, costVariance: -15, scopeChangeCount: 5, riskCount: 3, status: 'critical', trend: 'declining' },
  { id: 'P-003', name: '政务系统升级', scheduleVariance: 3, costVariance: 8, scopeChangeCount: 1, riskCount: 0, status: 'healthy', trend: 'improving' },
  { id: 'P-004', name: '智慧交通项目', scheduleVariance: -12, costVariance: -20, scopeChangeCount: 6, riskCount: 4, status: 'critical', trend: 'declining' },
  { id: 'P-005', name: '高职虚拟仿真实训', scheduleVariance: 2, costVariance: 5, scopeChangeCount: 1, riskCount: 1, status: 'healthy', trend: 'stable' },
  { id: 'P-006', name: '教育局数据平台', scheduleVariance: -3, costVariance: -5, scopeChangeCount: 3, riskCount: 2, status: 'concern', trend: 'stable' },
  { id: 'P-007', name: '智慧校园改造', scheduleVariance: 4, costVariance: 10, scopeChangeCount: 2, riskCount: 0, status: 'healthy', trend: 'improving' },
  { id: 'P-008', name: '职教云平台', scheduleVariance: -6, costVariance: -8, scopeChangeCount: 4, riskCount: 2, status: 'concern', trend: 'declining' },
];

export function calculateProjectStatus(metrics: ProjectMetrics): 'healthy' | 'concern' | 'critical' {
  // Schedule variance thresholds (in days): healthy > -3, concern >= -10, critical < -10
  // Cost variance thresholds (in 万元): healthy > -5, concern >= -15, critical < -15
  const svOk = metrics.scheduleVariance >= -3;
  const cvOk = metrics.costVariance >= -5;
  const scopeOk = metrics.scopeChangeCount <= 3;
  const riskOk = metrics.riskCount <= 1;

  const score = [svOk, cvOk, scopeOk, riskOk].filter(Boolean).length;

  if (score >= 3) return 'healthy';
  if (score >= 2) return 'concern';
  return 'critical';
}

export function calculateKPIs(projects: ProjectMetrics[]): DashboardKPI[] {
  const total = projects.length;

  // 交付及时率 = healthy + concern (stable/improving) / total
  const onTimeCount = projects.filter(p => p.status !== 'critical' && p.trend !== 'declining').length;
  const deliveryRate = Math.round((onTimeCount / total) * 100);

  // 预算合规率 = projects with costVariance >= -5 / total
  const budgetCompliant = projects.filter(p => p.costVariance >= -5).length;
  const budgetComplianceRate = Math.round((budgetCompliant / total) * 100);

  // 风险关闭率 = projects with riskCount <= 1 / total (assuming tracked risks being closed)
  const lowRisk = projects.filter(p => p.riskCount <= 1).length;
  const riskClosureRate = Math.round((lowRisk / total) * 100);

  // 客户满意度 (mock score out of 5)
  const satisfactionScore = 4.2;

  const kpiTarget = (value: number, target: number): 'green' | 'amber' | 'red' => {
    const gap = ((value - target) / target) * 100;
    if (gap >= -5) return 'green';
    if (gap >= -15) return 'amber';
    return 'red';
  };

  return [
    { label: '交付及时率', value: deliveryRate, unit: '%', target: 85, status: kpiTarget(deliveryRate, 85) },
    { label: '预算合规率', value: budgetComplianceRate, unit: '%', target: 90, status: kpiTarget(budgetComplianceRate, 90) },
    { label: '风险关闭率', value: riskClosureRate, unit: '%', target: 80, status: kpiTarget(riskClosureRate, 80) },
    { label: '客户满意度', value: satisfactionScore, unit: '/5', target: 4.5, status: kpiTarget(satisfactionScore, 4.5) },
  ];
}

export function generateAlerts(projects: ProjectMetrics[]): MonitoringAlert[] {
  const alerts: MonitoringAlert[] = [];

  projects.forEach(p => {
    if (p.status === 'critical') {
      if (p.scheduleVariance < -10) {
        alerts.push({
          projectId: p.id,
          projectName: p.name,
          type: 'schedule',
          severity: 'critical',
          message: `进度严重延误，已滞后 ${Math.abs(p.scheduleVariance)} 天`,
          suggestedAction: '立即召开项目恢复会议，评估范围，优先处理关键路径',
        });
      }
      if (p.costVariance < -15) {
        alerts.push({
          projectId: p.id,
          projectName: p.name,
          type: 'cost',
          severity: 'critical',
          message: `成本严重超支，已超出预算 ¥${Math.abs(p.costVariance)}万`,
          suggestedAction: '重新评估预算，更新成本基准，考虑变更请求',
        });
      }
      if (p.scopeChangeCount > 5) {
        alerts.push({
          projectId: p.id,
          projectName: p.name,
          type: 'quality',
          severity: 'critical',
          message: `范围变更过多，累计 ${p.scopeChangeCount} 次`,
          suggestedAction: '冻结范围变更，评审变更影响，更新WBS',
        });
      }
      if (p.riskCount > 3) {
        alerts.push({
          projectId: p.id,
          projectName: p.name,
          type: 'risk',
          severity: 'critical',
          message: `风险数量过多，当前 ${p.riskCount} 个活跃风险`,
          suggestedAction: '召开风险评审会议，更新风险登记册，分配风险责任人',
        });
      }
    } else if (p.status === 'concern') {
      if (p.scheduleVariance < -3) {
        alerts.push({
          projectId: p.id,
          projectName: p.name,
          type: 'schedule',
          severity: 'warning',
          message: `进度出现偏差，已滞后 ${Math.abs(p.scheduleVariance)} 天`,
          suggestedAction: '加强进度监控，分析延误原因，及时调整资源',
        });
      }
      if (p.costVariance < -5) {
        alerts.push({
          projectId: p.id,
          projectName: p.name,
          type: 'cost',
          severity: 'warning',
          message: `成本偏差，已超出预算 ¥${Math.abs(p.costVariance)}万`,
          suggestedAction: '分析成本偏差原因，审查非必要支出',
        });
      }
    }
  });

  return alerts.sort((a, b) => {
    const severityOrder = { critical: 0, warning: 1 };
    return severityOrder[a.severity] - severityOrder[b.severity];
  });
}

export function calculateTrends(projects: ProjectMetrics[]): string[] {
  const trends: string[] = [];

  // Schedule trend
  const avgSV = projects.reduce((sum, p) => sum + p.scheduleVariance, 0) / projects.length;
  trends.push(`平均进度偏差: ${avgSV > 0 ? '+' : ''}${avgSV.toFixed(1)}天`);

  // Cost trend
  const avgCV = projects.reduce((sum, p) => sum + p.costVariance, 0) / projects.length;
  trends.push(`平均成本偏差: ${avgCV > 0 ? '+' : ''}${avgCV.toFixed(1)}万元`);

  // Scope change trend
  const totalScopeChanges = projects.reduce((sum, p) => sum + p.scopeChangeCount, 0);
  trends.push(`范围变更总计: ${totalScopeChanges}次`);

  // Overall trend
  const decliningCount = projects.filter(p => p.trend === 'declining').length;
  const improvingCount = projects.filter(p => p.trend === 'improving').length;
  if (decliningCount > improvingCount) {
    trends.push('整体趋势: 下行（需重点关注）');
  } else if (improvingCount > decliningCount) {
    trends.push('整体趋势: 上行（整体可控）');
  } else {
    trends.push('整体趋势: 平稳');
  }

  return trends;
}

export function getStatusDistribution(projects: ProjectMetrics[]) {
  const healthy = projects.filter(p => p.status === 'healthy').length;
  const concern = projects.filter(p => p.status === 'concern').length;
  const critical = projects.filter(p => p.status === 'critical').length;
  return [
    { name: '健康', value: healthy, color: '#10b981' },
    { name: '关注', value: concern, color: '#f59e0b' },
    { name: '危急', value: critical, color: '#ef4444' },
  ];
}
