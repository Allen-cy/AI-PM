// Stakeholder Management - Types and Calculation Logic

export type EngagementLevel = '不知情' | '抵制' | '中立' | '支持' | '领导';

export interface Stakeholder {
  id: string;
  name: string;
  role: string;
  organization: string;
  power: 1 | 2 | 3 | 4 | 5;      // 1=低, 5=高
  interest: 1 | 2 | 3 | 4 | 5;    // 1=低, 5=高
  currentEngagement: EngagementLevel;
  desiredEngagement: EngagementLevel;
  communicationFrequency: '每周' | '每两周' | '每月' | '按需';
  communicationMethod: '邮件' | '会议' | '电话' | '即时通讯';
  managementStrategy: string;
}

export type MatrixQuadrant = 'keepSatisfied' | 'manageClosely' | 'keepInformed' | 'monitor';

export interface MatrixClassification {
  keepSatisfied: Stakeholder[];   // 高权力 x 低利益
  manageClosely: Stakeholder[];  // 高权力 x 高利益
  keepInformed: Stakeholder[];    // 低权力 x 高利益
  monitor: Stakeholder[];         // 低权力 x 低利益
  total: number;
}

export interface EngagementGap {
  type: 'increase' | 'maintain' | 'decrease';
  label: string;
  color: string;
}

const engagementOrder: Record<EngagementLevel, number> = {
  '不知情': 0,
  '抵制': 1,
  '中立': 2,
  '支持': 3,
  '领导': 4,
};

/**
 * Classify stakeholders into Power-Interest matrix quadrants
 */
export function classifyStakeholders(stakeholders: Stakeholder[]): MatrixClassification {
  const result: MatrixClassification = {
    keepSatisfied: [],
    manageClosely: [],
    keepInformed: [],
    monitor: [],
    total: stakeholders.length,
  };

  for (const s of stakeholders) {
    const highPower = s.power >= 4;
    const highInterest = s.interest >= 4;

    if (highPower && highInterest) {
      result.manageClosely.push(s);
    } else if (highPower && !highInterest) {
      result.keepSatisfied.push(s);
    } else if (!highPower && highInterest) {
      result.keepInformed.push(s);
    } else {
      result.monitor.push(s);
    }
  }

  return result;
}

/**
 * Calculate engagement gap for a stakeholder
 */
export function calculateEngagementGap(stakeholder: Stakeholder): EngagementGap {
  const current = engagementOrder[stakeholder.currentEngagement];
  const desired = engagementOrder[stakeholder.desiredEngagement];
  const diff = desired - current;

  if (diff > 0) {
    return { type: 'increase', label: '提升参与度', color: '#3b82f6' };
  } else if (diff < 0) {
    return { type: 'decrease', label: '降低参与度', color: '#f59e0b' };
  }
  return { type: 'maintain', label: '保持现状', color: '#22c55e' };
}

/**
 * Get management recommendation based on stakeholder classification
 */
export function getManagementRecommendation(stakeholder: Stakeholder): string {
  const highPower = stakeholder.power >= 4;
  const highInterest = stakeholder.interest >= 4;

  if (highPower && highInterest) {
    return '重点管理：每周沟通，定期汇报进展，确保项目方向与组织战略一致，及时获取决策支持。';
  } else if (highPower && !highInterest) {
    return '保持满意：定期汇报项目成果，维护合作关系，确保关键决策获得支持。';
  } else if (!highPower && highInterest) {
    return '随时告知：定期反馈收集，邀请参与评审会议，保持其积极性和参与感。';
  }
  return '监督：定期检查状态，通过邮件或简报更新信息，控制沟通成本。';
}

/**
 * Get quadrant label in Chinese
 */
export function getQuadrantLabel(quadrant: MatrixQuadrant): string {
  const labels: Record<MatrixQuadrant, string> = {
    manageClosely: '重点管理',
    keepSatisfied: '保持满意',
    keepInformed: '随时告知',
    monitor: '监督',
  };
  return labels[quadrant];
}

/**
 * Get quadrant color scheme
 */
export function getQuadrantColor(quadrant: MatrixQuadrant): { bg: string; border: string; text: string; color: string } {
  const schemes: Record<MatrixQuadrant, { bg: string; border: string; text: string; color: string }> = {
    manageClosely: { bg: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.3)', text: '#ef4444', color: '#ef4444' },
    keepSatisfied: { bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.3)', text: '#f59e0b', color: '#f59e0b' },
    keepInformed: { bg: 'rgba(59,130,246,0.08)', border: 'rgba(59,130,246,0.3)', text: '#3b82f6', color: '#3b82f6' },
    monitor: { bg: 'rgba(107,114,128,0.08)', border: 'rgba(107,114,128,0.3)', text: '#6b7280', color: '#6b7280' },
  };
  return schemes[quadrant];
}

/**
 * Get stakeholder's matrix quadrant
 */
export function getStakeholderQuadrant(stakeholder: Stakeholder): MatrixQuadrant {
  const highPower = stakeholder.power >= 4;
  const highInterest = stakeholder.interest >= 4;

  if (highPower && highInterest) return 'manageClosely';
  if (highPower && !highInterest) return 'keepSatisfied';
  if (!highPower && highInterest) return 'keepInformed';
  return 'monitor';
}

/**
 * Get engagement level badge color
 */
export function getEngagementColor(level: EngagementLevel): string {
  const colors: Record<EngagementLevel, string> = {
    '不知情': '#6b7280',
    '抵制': '#ef4444',
    '中立': '#f59e0b',
    '支持': '#22c55e',
    '领导': '#3b82f6',
  };
  return colors[level];
}

// Test data
export const initialStakeholders: Stakeholder[] = [
  {
    id: 'S001',
    name: '张总',
    role: 'CEO',
    organization: '公司总部',
    power: 5,
    interest: 3,
    currentEngagement: '支持',
    desiredEngagement: '支持',
    communicationFrequency: '每周',
    communicationMethod: '会议',
    managementStrategy: '重点管理：每周五汇报项目整体进展，确保战略方向一致',
  },
  {
    id: 'S002',
    name: '李项目经理',
    role: 'PMO负责人',
    organization: '项目管理办公室',
    power: 4,
    interest: 5,
    currentEngagement: '领导',
    desiredEngagement: '领导',
    communicationFrequency: '每周',
    communicationMethod: '会议',
    managementStrategy: '领导角色：赋予决策权限，密切协作，每周例会同步项目状态',
  },
  {
    id: 'S003',
    name: '王技术总监',
    role: 'CTO',
    organization: '技术部',
    power: 4,
    interest: 4,
    currentEngagement: '支持',
    desiredEngagement: '支持',
    communicationFrequency: '每两周',
    communicationMethod: '会议',
    managementStrategy: '保持满意：每两周技术方案对齐，关注技术可行性',
  },
  {
    id: 'S004',
    name: '刘财务经理',
    role: '财务经理',
    organization: '财务部',
    power: 3,
    interest: 2,
    currentEngagement: '中立',
    desiredEngagement: '中立',
    communicationFrequency: '每月',
    communicationMethod: '邮件',
    managementStrategy: '保持满意：月度预算执行报告，邮件沟通为主',
  },
  {
    id: 'S005',
    name: '陈业务主管',
    role: '业务主管',
    organization: '业务部',
    power: 2,
    interest: 5,
    currentEngagement: '支持',
    desiredEngagement: '支持',
    communicationFrequency: '每周',
    communicationMethod: '即时通讯',
    managementStrategy: '随时告知：纳入需求评审，及时反馈业务需求变更',
  },
  {
    id: 'S006',
    name: '赵供应商经理',
    role: '供应商经理',
    organization: '外部合作伙伴',
    power: 2,
    interest: 2,
    currentEngagement: '中立',
    desiredEngagement: '中立',
    communicationFrequency: '按需',
    communicationMethod: '邮件',
    managementStrategy: '监督：按需沟通，关注合同执行和交付里程碑',
  },
];
