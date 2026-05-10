// Quality Management - Types and Calculation Logic

export type Severity = 'critical' | 'major' | 'minor' | 'cosmetic';
export type DefectStatus = 'open' | 'in-progress' | 'resolved' | 'closed' | 'rejected';

export interface Defect {
  id: string;
  description: string;
  severity: Severity;
  status: DefectStatus;
  assignee: string;
  createdAt: string;
  resolvedAt?: string;
  rootCause?: string;
}

export interface ChecklistItem {
  id: string;
  text: string;
  category: string;
  required: boolean;
  checked: boolean;
}

export interface AcceptanceCriteria {
  id: string;
  description: string;
  target: string;
  actual?: string;
  passed: boolean;
}

export interface DefectMetrics {
  total: number;
  found: number;
  resolved: number;
  open: number;
  inProgress: number;
  closed: number;
  rejected: number;
  critical: number;
  major: number;
  minor: number;
  cosmetic: number;
  leakageRate: number;     // 缺陷漏检率 %
  firstPassRate: number;   // 一次验收通过率 %
  testCoverage: number;     // 测试覆盖率 %
}

export function calculateDefectMetrics(defects: Defect[]): DefectMetrics {
  const total = defects.length;
  const found = defects.length;
  const resolved = defects.filter(d => d.status === 'resolved' || d.status === 'closed').length;
  const open = defects.filter(d => d.status === 'open').length;
  const inProgress = defects.filter(d => d.status === 'in-progress').length;
  const closed = defects.filter(d => d.status === 'closed').length;
  const rejected = defects.filter(d => d.status === 'rejected').length;
  const critical = defects.filter(d => d.severity === 'critical').length;
  const major = defects.filter(d => d.severity === 'major').length;
  const minor = defects.filter(d => d.severity === 'minor').length;
  const cosmetic = defects.filter(d => d.severity === 'cosmetic').length;

  return {
    total,
    found,
    resolved,
    open,
    inProgress,
    closed,
    rejected,
    critical,
    major,
    minor,
    cosmetic,
    leakageRate: 3,     // 缺陷漏检率 3% (test data)
    firstPassRate: 85,   // 一次验收通过率 85% (test data)
    testCoverage: 78,    // 测试覆盖率 78% (test data)
  };
}

export function evaluateAcceptance(criteria: AcceptanceCriteria[]): {
  passRate: number;
  passed: number;
  total: number;
} {
  const total = criteria.length;
  const passed = criteria.filter(c => c.passed).length;
  const passRate = total > 0 ? Math.round((passed / total) * 100) : 0;
  return { passRate, passed, total };
}

// QA Checklist templates by project type and phase
const CHECKLIST_TEMPLATES: Record<string, Record<string, ChecklistItem[]>> = {
  it: {
    启动: [
      { id: 'c1', text: '项目章程已批准', category: '流程合规', required: true, checked: false },
      { id: 'c2', text: '干系人登记册已建立', category: '文档完整性', required: true, checked: false },
      { id: 'c3', text: '需求调研报告已完成', category: '文档完整性', required: true, checked: false },
      { id: 'c4', text: '初步范围说明书已编制', category: '文档完整性', required: true, checked: false },
    ],
    规划: [
      { id: 'c5', text: 'WBS 已分解至工作包层级', category: '流程合规', required: true, checked: false },
      { id: 'c6', text: '进度计划已评审', category: '流程合规', required: true, checked: false },
      { id: 'c7', text: '质量计划已编制', category: '文档完整性', required: true, checked: false },
      { id: 'c8', text: '风险登记册已建立', category: '风险控制', required: true, checked: false },
      { id: 'c9', text: '配置管理计划已确定', category: '流程合规', required: false, checked: false },
    ],
    执行: [
      { id: 'c10', text: '设计文档已评审签字', category: '文档完整性', required: true, checked: false },
      { id: 'c11', text: '代码评审已完成', category: '质量指标', required: true, checked: false },
      { id: 'c12', text: '单元测试覆盖率 ≥ 80%', category: '质量指标', required: true, checked: false },
      { id: 'c13', text: '集成测试报告已归档', category: '文档完整性', required: true, checked: false },
      { id: 'c14', text: '变更记录已同步至配置库', category: '流程合规', required: true, checked: false },
    ],
    监控: [
      { id: 'c15', text: '缺陷修复率达标', category: '质量指标', required: true, checked: false },
      { id: 'c16', text: '进度偏差在可控范围', category: '风险控制', required: true, checked: false },
      { id: 'c17', text: '质量周报已发送', category: '流程合规', required: false, checked: false },
      { id: 'c18', text: '阶段评审会已召开', category: '流程合规', required: true, checked: false },
    ],
    收尾: [
      { id: 'c19', text: '验收测试全部通过', category: '交付验收', required: true, checked: false },
      { id: 'c20', text: '用户手册已完成', category: '交付验收', required: true, checked: false },
      { id: 'c21', text: '项目总结报告已编制', category: '文档完整性', required: true, checked: false },
      { id: 'c22', text: '知识库已归档', category: '文档完整性', required: false, checked: false },
      { id: 'c23', text: '合同结算已完成', category: '交付验收', required: true, checked: false },
    ],
  },
  content: {
    启动: [
      { id: 'c1', text: '课程设计目标已明确', category: '流程合规', required: true, checked: false },
      { id: 'c2', text: '内容开发标准已确定', category: '文档完整性', required: true, checked: false },
      { id: 'c3', text: '素材清单已编制', category: '文档完整性', required: false, checked: false },
    ],
    规划: [
      { id: 'c4', text: '课程大纲已评审', category: '流程合规', required: true, checked: false },
      { id: 'c5', text: '制作进度表已确定', category: '流程合规', required: true, checked: false },
      { id: 'c6', text: '质量标准已明确', category: '文档完整性', required: true, checked: false },
    ],
    执行: [
      { id: 'c7', text: '脚本已审核', category: '质量指标', required: true, checked: false },
      { id: 'c8', text: '视频录制质量达标', category: '质量指标', required: true, checked: false },
      { id: 'c9', text: '课件交互已测试', category: '质量指标', required: true, checked: false },
    ],
    监控: [
      { id: 'c10', text: '内容审核已完成', category: '质量指标', required: true, checked: false },
      { id: 'c11', text: '学习数据采集正常', category: '风险控制', required: false, checked: false },
    ],
    收尾: [
      { id: 'c12', text: '课程验收已通过', category: '交付验收', required: true, checked: false },
      { id: 'c13', text: '平台上线发布完成', category: '交付验收', required: true, checked: false },
    ],
  },
  engineering: {
    启动: [
      { id: 'c1', text: '施工许可证已办理', category: '流程合规', required: true, checked: false },
      { id: 'c2', text: '设计方案已评审', category: '文档完整性', required: true, checked: false },
    ],
    规划: [
      { id: 'c3', text: '施工组织设计已审批', category: '流程合规', required: true, checked: false },
      { id: 'c4', text: '安全施工方案已编制', category: '风险控制', required: true, checked: false },
    ],
    执行: [
      { id: 'c5', text: '隐蔽工程验收合格', category: '质量指标', required: true, checked: false },
      { id: 'c6', text: '材料进场检验通过', category: '质量指标', required: true, checked: false },
    ],
    监控: [
      { id: 'c7', text: '安全检查记录完整', category: '风险控制', required: true, checked: false },
    ],
    收尾: [
      { id: 'c8', text: '竣工验收报告已出具', category: '交付验收', required: true, checked: false },
      { id: 'c9', text: '工程结算已完成', category: '交付验收', required: true, checked: false },
    ],
  },
  ops: {
    启动: [
      { id: 'c1', text: '服务等级协议(SLA)已签署', category: '流程合规', required: true, checked: false },
      { id: 'c2', text: '服务范围说明书已确认', category: '文档完整性', required: true, checked: false },
    ],
    规划: [
      { id: 'c3', text: '服务流程已编制', category: '流程合规', required: true, checked: false },
      { id: 'c4', text: '应急预案已制定', category: '风险控制', required: true, checked: false },
    ],
    执行: [
      { id: 'c5', text: '服务人员培训完成', category: '质量指标', required: true, checked: false },
      { id: 'c6', text: '运维工具已部署', category: '质量指标', required: false, checked: false },
    ],
    监控: [
      { id: 'c7', text: 'SLA达成率达标', category: '质量指标', required: true, checked: false },
      { id: 'c8', text: '服务报告已发送', category: '流程合规', required: true, checked: false },
    ],
    收尾: [
      { id: 'c9', text: '服务验收已通过', category: '交付验收', required: true, checked: false },
      { id: 'c10', text: '运维文档已移交', category: '文档完整性', required: true, checked: false },
    ],
  },
};

export function generateChecklist(projectType: string, phase: string): ChecklistItem[] {
  const templates = CHECKLIST_TEMPLATES[projectType] || CHECKLIST_TEMPLATES['it'];
  const phaseItems = templates[phase] || templates['规划'];
  return phaseItems.map(item => ({ ...item, checked: false }));
}

// Severity display helpers
export const severityConfig: Record<Severity, { label: string; bg: string; text: string }> = {
  critical: { label: '严重', bg: 'rgba(239,68,68,0.15)', text: 'var(--red)' },
  major:    { label: '重要', bg: 'rgba(245,158,11,0.15)', text: 'var(--amber)' },
  minor:    { label: '一般', bg: 'rgba(59,130,246,0.15)', text: 'var(--accent2)' },
  cosmetic: { label: '微小', bg: 'rgba(148,163,184,0.1)', text: 'var(--text2)' },
};

export const defectStatusConfig: Record<DefectStatus, { label: string; bg: string; text: string }> = {
  'open':        { label: '待处理', bg: 'rgba(239,68,68,0.15)', text: 'var(--red)' },
  'in-progress': { label: '处理中', bg: 'rgba(245,158,11,0.15)', text: 'var(--amber)' },
  'resolved':    { label: '已解决', bg: 'rgba(16,185,129,0.15)', text: 'var(--green)' },
  'closed':      { label: '已关闭', bg: 'rgba(148,163,184,0.1)', text: 'var(--text2)' },
  'rejected':    { label: '已驳回', bg: 'rgba(139,92,246,0.15)', text: 'var(--purple)' },
};

// Test data: 12 defects
export const testDefects: Defect[] = [
  { id: 'DEF-001', description: '用户权限验证逻辑漏洞，导致未授权访问', severity: 'critical', status: 'resolved', assignee: '张工', createdAt: '2026-04-10', resolvedAt: '2026-04-15', rootCause: '接口鉴权未完整实现' },
  { id: 'DEF-002', description: '核心模块数据一致性异常', severity: 'critical', status: 'resolved', assignee: '李工', createdAt: '2026-04-12', resolvedAt: '2026-04-18', rootCause: '事务边界处理不当' },
  { id: 'DEF-003', description: '报表导出格式与需求偏差', severity: 'major', status: 'open', assignee: '王工', createdAt: '2026-04-14' },
  { id: 'DEF-004', description: '高并发下响应超时', severity: 'major', status: 'resolved', assignee: '张工', createdAt: '2026-04-16', resolvedAt: '2026-04-20', rootCause: '数据库连接池配置过小' },
  { id: 'DEF-005', description: '移动端适配布局错乱', severity: 'major', status: 'resolved', assignee: '刘工', createdAt: '2026-04-17', resolvedAt: '2026-04-22', rootCause: 'CSS响应式断点缺失' },
  { id: 'DEF-006', description: '搜索结果排序不符合预期', severity: 'major', status: 'in-progress', assignee: '陈工', createdAt: '2026-04-19' },
  { id: 'DEF-007', description: '页面加载动画不流畅', severity: 'minor', status: 'open', assignee: '赵工', createdAt: '2026-04-20' },
  { id: 'DEF-008', description: '表单提交按钮重复点击未拦截', severity: 'minor', status: 'resolved', assignee: '刘工', createdAt: '2026-04-11', resolvedAt: '2026-04-13' },
  { id: 'DEF-009', description: '弹窗关闭按钮位置不统一', severity: 'minor', status: 'open', assignee: '王工', createdAt: '2026-04-21' },
  { id: 'DEF-010', description: '输入框placeholder文案错误', severity: 'minor', status: 'resolved', assignee: '赵工', createdAt: '2026-04-08', resolvedAt: '2026-04-09' },
  { id: 'DEF-011', description: '下拉菜单选项闪烁', severity: 'minor', status: 'resolved', assignee: '陈工', createdAt: '2026-04-15', resolvedAt: '2026-04-17' },
  { id: 'DEF-012', description: '页面图标像素模糊', severity: 'cosmetic', status: 'resolved', assignee: '赵工', createdAt: '2026-04-10', resolvedAt: '2026-04-11' },
];

// Test acceptance criteria (8 items, 6 passed)
export const testAcceptanceCriteria: AcceptanceCriteria[] = [
  { id: 'AC-001', description: '用户登录成功率 ≥ 99%', target: '≥ 99%', actual: '99.2%', passed: true },
  { id: 'AC-002', description: '系统响应时间 ≤ 2秒', target: '≤ 2秒', actual: '1.8秒', passed: true },
  { id: 'AC-003', description: '数据备份成功率 100%', target: '100%', actual: '100%', passed: true },
  { id: 'AC-004', description: '缺陷修复率 ≥ 90%', target: '≥ 90%', actual: '83%', passed: false },
  { id: 'AC-005', description: '验收测试覆盖率 ≥ 95%', target: '≥ 95%', actual: '78%', passed: false },
  { id: 'AC-006', description: '文档完整率 100%', target: '100%', actual: '100%', passed: true },
  { id: 'AC-007', description: '需求变更响应时间 ≤ 24h', target: '≤ 24h', actual: '18h', passed: true },
  { id: 'AC-008', description: '客户满意度评分 ≥ 4.5', target: '≥ 4.5', actual: '4.7', passed: true },
];

// Quality trends data (defects per sprint/week)
export const qualityTrends = [
  { period: 'Sprint 1', defects: 5 },
  { period: 'Sprint 2', defects: 8 },
  { period: 'Sprint 3', defects: 4 },
  { period: 'Sprint 4', defects: 3 },
  { period: 'Sprint 5', defects: 6 },
  { period: 'Sprint 6', defects: 2 },
];
