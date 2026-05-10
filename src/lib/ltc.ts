import type { LTCStage, RACIMatrix, LTCProject } from './ltc';

export type { LTCStage, RACIMatrix, LTCProject };

export const LTC_STAGES: LTCStage[] = [
  {
    id: 'stage-01',
    number: 1,
    name: '商机立项',
    alias: 'Opportunity Initiation',
    entryCriteria: ['客户需求初步接触', '商机信息登记', '初步商务谈判'],
    exitCriteria: ['商机立项评审通过', '商务模式确认', '立项决策文档完成'],
    deliverables: ['商机信息表', '初步报价单', '立项审批单'],
    raciMatrix: {
      roles: ['项目经理', '技术负责人', '销售', '客户'],
      workProducts: ['商机信息表', '初步报价单', '立项审批单'],
      assignments: [
        ['R', 'C', 'A', 'I'],
        ['C', 'R', 'A', 'I'],
        ['A', 'C', 'R', 'I'],
      ],
    },
    duration: '3-5天',
    status: 'pending',
  },
  {
    id: 'stage-02',
    number: 2,
    name: '需求调研评审',
    alias: 'Requirements Research',
    entryCriteria: ['立项审批通过', '客户对接人确认', '调研计划制定'],
    exitCriteria: ['需求文档评审通过', '技术方案初稿完成', '工作量评估通过'],
    deliverables: ['需求规格说明书', '技术方案初稿', '项目工作量评估表'],
    raciMatrix: {
      roles: ['项目经理', '技术负责人', '销售', '客户'],
      workProducts: ['需求规格说明书', '技术方案初稿', '工作量评估表'],
      assignments: [
        ['C', 'R', 'A', 'I'],
        ['A', 'R', 'C', 'I'],
        ['R', 'C', 'I', 'A'],
      ],
    },
    duration: '7-14天',
    status: 'pending',
  },
  {
    id: 'stage-03',
    number: 3,
    name: '方案设计建设',
    alias: 'Solution Design',
    entryCriteria: ['需求文档定稿', '技术方案评审通过', '设计方案通过'],
    exitCriteria: ['方案设计文档评审通过', '技术架构确定', '开发计划制定'],
    deliverables: ['技术架构设计', '详细设计方案', '开发计划表'],
    raciMatrix: {
      roles: ['项目经理', '技术负责人', '销售', '客户'],
      workProducts: ['技术架构设计', '详细设计方案', '开发计划表'],
      assignments: [
        ['A', 'R', 'C', 'I'],
        ['C', 'A', 'I', 'R'],
        ['R', 'C', 'A', 'I'],
      ],
    },
    duration: '14-30天',
    status: 'pending',
  },
  {
    id: 'stage-04',
    number: 4,
    name: '招投标管理',
    alias: 'Bid Management',
    entryCriteria: ['招标公告发布', '投标文件准备', '投标保证金缴纳'],
    exitCriteria: ['投标文件评审通过', '中标通知书获取', '招标结果公示'],
    deliverables: ['投标文件', '技术方案书', '投标保证金凭证'],
    raciMatrix: {
      roles: ['项目经理', '技术负责人', '销售', '客户'],
      workProducts: ['投标文件', '技术方案书', '保证金凭证'],
      assignments: [
        ['C', 'R', 'A', 'I'],
        ['A', 'C', 'R', 'I'],
        ['R', 'I', 'A', 'C'],
      ],
    },
    duration: '15-30天',
    status: 'pending',
  },
  {
    id: 'stage-05',
    number: 5,
    name: '合同签约',
    alias: 'Contract Signing',
    entryCriteria: ['中标结果确认', '合同条款谈判', '法务审核通过'],
    exitCriteria: ['合同文本签署完成', '合同金额确认', '合同生效'],
    deliverables: ['正式合同文本', '合同审批单', '签收确认单'],
    raciMatrix: {
      roles: ['项目经理', '技术负责人', '销售', '客户'],
      workProducts: ['正式合同文本', '合同审批单', '签收确认单'],
      assignments: [
        ['C', 'I', 'A', 'R'],
        ['A', 'C', 'R', 'I'],
        ['R', 'I', 'A', 'C'],
      ],
    },
    duration: '7-14天',
    status: 'pending',
  },
  {
    id: 'stage-06',
    number: 6,
    name: '项目准备',
    alias: 'Project Preparation',
    entryCriteria: ['合同生效', '项目启动会召开', '项目团队组建'],
    exitCriteria: ['项目启动会完成', '团队成员到位', '项目章程发布'],
    deliverables: ['项目章程', '团队分工表', '沟通计划表'],
    raciMatrix: {
      roles: ['项目经理', '技术负责人', '销售', '客户'],
      workProducts: ['项目章程', '团队分工表', '沟通计划表'],
      assignments: [
        ['A', 'R', 'C', 'I'],
        ['R', 'A', 'I', 'C'],
        ['A', 'R', 'C', 'I'],
      ],
    },
    duration: '5-10天',
    status: 'pending',
  },
  {
    id: 'stage-07',
    number: 7,
    name: '项目规划',
    alias: 'Project Planning',
    entryCriteria: ['项目章程批准', '团队成员全部到位', 'WBS分解完成'],
    exitCriteria: ['项目管理计划评审通过', '基准计划确定', '干系人批准'],
    deliverables: ['项目管理计划', 'WBS分解图', '风险登记册', '成本基准'],
    raciMatrix: {
      roles: ['项目经理', '技术负责人', '销售', '客户'],
      workProducts: ['项目管理计划', 'WBS分解图', '风险登记册', '成本基准'],
      assignments: [
        ['A', 'R', 'C', 'I'],
        ['R', 'A', 'I', 'C'],
        ['A', 'R', 'C', 'I'],
        ['R', 'C', 'A', 'I'],
      ],
    },
    duration: '10-15天',
    status: 'pending',
  },
  {
    id: 'stage-08',
    number: 8,
    name: '项目实施',
    alias: 'Project Execution',
    entryCriteria: ['项目管理计划批准', '资源调配到位', '基准计划发布'],
    exitCriteria: ['阶段交付物完成', '变更控制通过', '质量检查通过'],
    deliverables: ['阶段交付物', '变更请求表', '质量检查报告', '问题日志'],
    raciMatrix: {
      roles: ['项目经理', '技术负责人', '销售', '客户'],
      workProducts: ['阶段交付物', '变更请求表', '质量检查报告', '问题日志'],
      assignments: [
        ['A', 'R', 'C', 'I'],
        ['R', 'A', 'I', 'C'],
        ['C', 'R', 'A', 'I'],
        ['A', 'R', 'C', 'I'],
      ],
    },
    duration: '30-90天',
    status: 'pending',
  },
  {
    id: 'stage-09',
    number: 9,
    name: '项目结项',
    alias: 'Project Closure',
    entryCriteria: ['所有交付物完成', '客户验收通过', '项目收尾计划制定'],
    exitCriteria: ['项目结项报告评审通过', '项目文档归档', '经验教训总结完成'],
    deliverables: ['项目结项报告', '最终交付清单', '经验教训报告', '文档归档确认单'],
    raciMatrix: {
      roles: ['项目经理', '技术负责人', '销售', '客户'],
      workProducts: ['项目结项报告', '最终交付清单', '经验教训报告', '文档归档确认单'],
      assignments: [
        ['A', 'R', 'C', 'I'],
        ['R', 'A', 'I', 'C'],
        ['A', 'R', 'C', 'I'],
        ['R', 'C', 'A', 'I'],
      ],
    },
    duration: '7-14天',
    status: 'pending',
  },
  {
    id: 'stage-10',
    number: 10,
    name: '回款管理',
    alias: 'Collection Management',
    entryCriteria: ['项目验收完成', '发票开具申请', '回款计划制定'],
    exitCriteria: ['回款到账确认', '应收账款清零', '财务结清证明'],
    deliverables: ['回款计划表', '发票申请单', '银行到账凭证', '应收账款核销表'],
    raciMatrix: {
      roles: ['项目经理', '技术负责人', '销售', '客户'],
      workProducts: ['回款计划表', '发票申请单', '到账凭证', '核销表'],
      assignments: [
        ['C', 'I', 'A', 'R'],
        ['I', 'C', 'R', 'A'],
        ['R', 'I', 'A', 'C'],
        ['A', 'I', 'R', 'C'],
      ],
    },
    duration: '30-120天',
    status: 'pending',
  },
  {
    id: 'stage-11',
    number: 11,
    name: '运营服务',
    alias: 'Operation Service',
    entryCriteria: ['项目交付完成', '运营支持协议签订', '运维团队组建'],
    exitCriteria: ['运营服务水平达成', '客户满意度达标', '运营报告提交'],
    deliverables: ['运营服务计划', 'SLA报告', '客户满意度调查', '运维工单记录'],
    raciMatrix: {
      roles: ['项目经理', '技术负责人', '销售', '客户'],
      workProducts: ['运营服务计划', 'SLA报告', '满意度调查', '运维工单'],
      assignments: [
        ['A', 'R', 'C', 'I'],
        ['R', 'A', 'I', 'C'],
        ['A', 'R', 'C', 'I'],
        ['R', 'A', 'I', 'C'],
      ],
    },
    duration: '90-365天',
    status: 'pending',
  },
  {
    id: 'stage-12',
    number: 12,
    name: '合同关闭',
    alias: 'Contract Closeout',
    entryCriteria: ['运营服务结束', '所有款项结清', '合同关闭申请'],
    exitCriteria: ['合同关闭审批通过', '合同档案归档', '项目后评价完成'],
    deliverables: ['合同关闭确认单', '项目后评价报告', '合同档案归档证明', '最终报告'],
    raciMatrix: {
      roles: ['项目经理', '技术负责人', '销售', '客户'],
      workProducts: ['合同关闭确认单', '后评价报告', '档案归档证明', '最终报告'],
      assignments: [
        ['A', 'C', 'R', 'I'],
        ['C', 'A', 'I', 'R'],
        ['R', 'I', 'A', 'C'],
        ['A', 'R', 'C', 'I'],
      ],
    },
    duration: '14-30天',
    status: 'pending',
  },
];

export function getStageStatus(project: LTCProject, stageId: string): string {
  const stageIndex = project.stages.findIndex((s) => s.id === stageId);
  if (stageIndex < project.currentStage) return 'completed';
  if (stageIndex === project.currentStage) return 'in-progress';
  return 'pending';
}

export function validateStageGate(project: LTCProject, stageId: string): boolean {
  const stage = project.stages.find((s) => s.id === stageId);
  if (!stage) return false;
  const stageIndex = project.stages.findIndex((s) => s.id === stageId);
  return stageIndex <= project.currentStage + 1;
}

// Demo projects for selector
export const DEMO_PROJECTS: LTCProject[] = [
  {
    id: 'proj-001',
    name: '智慧城市大数据平台项目',
    currentStage: 3,
    stages: LTC_STAGES.map((s, i) => ({
      ...s,
      status:
        i < 3 ? 'completed' : i === 3 ? 'in-progress' : 'pending',
    })),
    startedAt: '2024-01-15',
    completedAt: undefined,
  },
  {
    id: 'proj-002',
    name: '企业数字化转型项目',
    currentStage: 7,
    stages: LTC_STAGES.map((s, i) => ({
      ...s,
      status:
        i < 7 ? 'completed' : i === 7 ? 'in-progress' : 'pending',
    })),
    startedAt: '2023-11-01',
    completedAt: undefined,
  },
  {
    id: 'proj-003',
    name: '金融机构智能风控系统',
    currentStage: 10,
    stages: LTC_STAGES.map((s, i) => ({
      ...s,
      status:
        i < 10 ? 'completed' : i === 10 ? 'in-progress' : 'pending',
    })),
    startedAt: '2023-06-15',
    completedAt: undefined,
  },
];