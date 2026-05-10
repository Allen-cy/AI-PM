// Planning Center - PMBOK 10 Knowledge Areas & Project Planning

export interface KnowledgeArea {
  id: string;
  name: string;
  alias: string;
  description: string;
  icon: string;
  planningInputs: string[];
  toolsTechniques: string[];
  outputs: string[];
}

export interface PlanSection {
  inputs: string[];
  tools: string[];
  outputs: string[];
  status: 'pending' | 'in-progress' | 'completed';
  notes?: string;
}

export interface ProjectPlan {
  id: string;
  name: string;
  type: '信息化' | '课程' | '工程' | '运营';
  areas: Record<string, PlanSection>;
  baselines: {
    scope?: string;
    schedule?: string;
    cost?: string;
  };
  createdAt: string;
  updatedAt: string;
}

// PMBOK 10 Knowledge Areas
export const PMBOK_KNOWLEDGE_AREAS: KnowledgeArea[] = [
  {
    id: 'integration',
    name: '整合管理',
    alias: 'Integration',
    description: '识别、定义、组合、统一、协调和控制项目各过程',
    icon: '🔗',
    planningInputs: ['项目章程', '项目管理计划', '事业环境因素', '组织过程资产'],
    toolsTechniques: ['专家判断', '数据分析', '会议', '决策技术'],
    outputs: ['项目管理计划', '项目章程更新', '变更请求'],
  },
  {
    id: 'scope',
    name: '范围管理',
    alias: 'Scope',
    description: '确保项目做且只做所需工作',
    icon: '📐',
    planningInputs: ['项目管理计划', '项目章程', '事业环境因素'],
    toolsTechniques: ['专家判断', '数据分析', '决策技术', '头脑风暴'],
    outputs: ['范围管理计划', '需求管理计划', '范围基准', '需求文件'],
  },
  {
    id: 'schedule',
    name: '进度管理',
    alias: 'Schedule',
    description: '管理项目按时完成',
    icon: '⏱️',
    planningInputs: ['项目管理计划', '项目章程', '进度基准', '资源日历'],
    toolsTechniques: ['关键路径法', '资源优化', '数据分析', '提前量/滞后量'],
    outputs: ['进度管理计划', '进度基准', '项目进度计划', '进度数据'],
  },
  {
    id: 'cost',
    name: '成本管理',
    alias: 'Cost',
    description: '管理项目在预算内完成',
    icon: '💰',
    planningInputs: ['项目管理计划', '项目章程', '进度基准', '风险登记册'],
    toolsTechniques: ['专家判断', '数据分析', '成本汇总', '融资分析'],
    outputs: ['成本管理计划', '成本基准', '项目预算', '成本估算'],
  },
  {
    id: 'quality',
    name: '质量管理',
    alias: 'Quality',
    description: '将质量要求整合到项目各过程中',
    icon: '✅',
    planningInputs: ['项目管理计划', '项目章程', '需求文件'],
    toolsTechniques: ['专家判断', '数据分析', '审计', '测试/检查'],
    outputs: ['质量管理计划', '质量测量指标', '质量报告', '测试与评估文件'],
  },
  {
    id: 'resource',
    name: '资源管理',
    alias: 'Resource',
    description: '识别和获取项目所需资源',
    icon: '👥',
    planningInputs: ['项目管理计划', '项目章程', '资源管理计划'],
    toolsTechniques: ['专家判断', '组织理论', '数据分析', '资源优化'],
    outputs: ['资源管理计划', '团队章程', '资源日历', '物质资源分配'],
  },
  {
    id: 'communications',
    name: '沟通管理',
    alias: 'Communications',
    description: '确保项目信息及时准确地创建、收集和分发',
    icon: '📡',
    planningInputs: ['项目管理计划', '项目章程', '干系人登记册'],
    toolsTechniques: ['专家判断', '沟通技术', '沟通模型', '会议'],
    outputs: ['沟通管理计划', '沟通记录', '项目报告', '干系人反馈'],
  },
  {
    id: 'risk',
    name: '风险管理',
    alias: 'Risk',
    description: '识别、分析和应对项目风险',
    icon: '⚠️',
    planningInputs: ['项目管理计划', '项目章程', '风险登记册'],
    toolsTechniques: ['专家判断', '数据分析', '威胁应对策略', '审计'],
    outputs: ['风险管理计划', '风险登记册', '风险报告', '变更请求'],
  },
  {
    id: 'procurement',
    name: '采购管理',
    alias: 'Procurement',
    description: '获取项目所需的产品服务和成果',
    icon: '📦',
    planningInputs: ['项目管理计划', '项目章程', '需求文件'],
    toolsTechniques: ['专家判断', '广告', '供应商选择', '合同谈判'],
    outputs: ['采购管理计划', '采购策略', '招标文件', '合同'],
  },
  {
    id: 'stakeholder',
    name: '干系人管理',
    alias: 'Stakeholder',
    description: '识别和分析干系人，制定策略以有效参与',
    icon: '🎯',
    planningInputs: ['项目管理计划', '项目章程', '干系人登记册'],
    toolsTechniques: ['专家判断', '数据分析', '沟通技能', '会议'],
    outputs: ['干系人管理计划', '干系人登记册更新', '变更请求'],
  },
];

// Plan Templates by Project Type
export const PLAN_TEMPLATES: Record<string, ProjectPlan> = {
  '信息化项目': {
    id: 'template-info',
    name: '信息化项目计划模板',
    type: '信息化',
    areas: {
      integration: {
        inputs: ['项目章程草案', '业务需求文档'],
        tools: ['专家判断', '方案评审'],
        outputs: ['项目管理计划', '项目章程'],
        status: 'pending',
      },
      scope: {
        inputs: ['需求规格说明书', '技术方案'],
        tools: ['需求分析', 'WBS分解'],
        outputs: ['范围说明书', 'WBS', '范围基准'],
        status: 'pending',
      },
      schedule: {
        inputs: ['WBS', '资源日历', '历史数据'],
        tools: ['关键路径法', '资源平衡'],
        outputs: ['进度计划', '进度基准', '甘特图'],
        status: 'pending',
      },
      cost: {
        inputs: ['资源费率', '进度计划', '风险登记'],
        tools: ['类比估算', '参数估算', '三点估算'],
        outputs: ['成本估算', '成本基准', '预算'],
        status: 'pending',
      },
      quality: {
        inputs: ['项目管理计划', '需求文件'],
        tools: ['质量审计', '测试计划'],
        outputs: ['质量管理计划', '测试用例', '质量标准'],
        status: 'pending',
      },
      resource: {
        inputs: ['资源需求', '组织结构图'],
        tools: ['组织分解结构', '资源分配矩阵'],
        outputs: ['资源管理计划', '角色责任矩阵'],
        status: 'pending',
      },
      communications: {
        inputs: ['干系人登记册', '项目组织结构'],
        tools: ['沟通需求分析', '渠道管理'],
        outputs: ['沟通管理计划', '信息传递记录'],
        status: 'pending',
      },
      risk: {
        inputs: ['项目章程', '范围说明书', '历史信息'],
        tools: ['SWOT分析', '风险识别工作坊'],
        outputs: ['风险管理计划', '风险登记册'],
        status: 'pending',
      },
      procurement: {
        inputs: ['范围基准', '市场调研'],
        tools: ['自制外购分析', '供应商评估'],
        outputs: ['采购管理计划', '招标文件'],
        status: 'pending',
      },
      stakeholder: {
        inputs: ['干系人登记册', '项目章程'],
        tools: ['权力利益方格', '干系人分析矩阵'],
        outputs: ['干系人管理计划', '沟通策略'],
        status: 'pending',
      },
    },
    baselines: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  '课程开发': {
    id: 'template-course',
    name: '课程开发项目计划模板',
    type: '课程',
    areas: {
      integration: {
        inputs: ['培训需求报告', '课程大纲'],
        tools: ['专家判断', '评审会议'],
        outputs: ['项目管理计划', '课程开发计划'],
        status: 'pending',
      },
      scope: {
        inputs: ['学员画像', '课程目标', '教学大纲'],
        tools: ['ADDIE模型', '教学设计'],
        outputs: ['课程范围说明书', '教学设计文档'],
        status: 'pending',
      },
      schedule: {
        inputs: ['课程大纲', '专家资源'],
        tools: ['里程碑计划', '迭代开发'],
        outputs: ['课程开发计划', '评审节点'],
        status: 'pending',
      },
      cost: {
        inputs: ['专家费率', '制作成本估算'],
        tools: ['类比估算', '资源成本分析'],
        outputs: ['课程预算', '成本基准'],
        status: 'pending',
      },
      quality: {
        inputs: ['课程大纲', '教学标准'],
        tools: ['教学评估', '专家评审', '学员试读'],
        outputs: ['课程质量标准', '评估问卷'],
        status: 'pending',
      },
      resource: {
        inputs: ['专家清单', '制作团队'],
        tools: ['资源分配', '团队协作计划'],
        outputs: ['资源管理计划', '专家时间表'],
        status: 'pending',
      },
      communications: {
        inputs: ['干系人列表', '项目团队'],
        tools: ['周会', '状态报告'],
        outputs: ['沟通计划', '进度报告模板'],
        status: 'pending',
      },
      risk: {
        inputs: ['专家availability', '技术风险'],
        tools: ['风险识别', '应对策略'],
        outputs: ['风险登记册', '应急预案'],
        status: 'pending',
      },
      stakeholder: {
        inputs: ['培训负责人', '学员代表'],
        tools: ['需求访谈', '满意度调查'],
        outputs: ['干系人管理计划'],
        status: 'pending',
      },
      procurement: {
        inputs: ['素材需求', '外部专家需求'],
        tools: ['供应商比选', '合同管理'],
        outputs: ['采购计划', '外包合同'],
        status: 'pending',
      },
    },
    baselines: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  '工程基建': {
    id: 'template-engineering',
    name: '工程基建项目计划模板',
    type: '工程',
    areas: {
      integration: {
        inputs: ['项目建议书', '可行性研究报告'],
        tools: ['专家判断', '方案比选'],
        outputs: ['项目管理计划', '项目章程'],
        status: 'pending',
      },
      scope: {
        inputs: ['设计图纸', '技术规格书', '规范标准'],
        tools: ['工作分解结构', '范围定义'],
        outputs: ['范围说明书', 'WBS', '范围基准'],
        status: 'pending',
      },
      schedule: {
        inputs: ['施工组织设计', '资源计划'],
        tools: ['关键路径法', '甘特图计划'],
        outputs: ['施工进度计划', '进度基准'],
        status: 'pending',
      },
      cost: {
        inputs: ['工程量清单', '定额标准'],
        tools: ['工程量清单计价', '成本估算'],
        outputs: ['施工图预算', '成本基准'],
        status: 'pending',
      },
      quality: {
        inputs: ['施工规范', '验收标准'],
        tools: ['质量检查', '隐蔽工程验收'],
        outputs: ['质量计划', '验收报告模板'],
        status: 'pending',
      },
      resource: {
        inputs: ['施工人员配置', '设备清单'],
        tools: ['劳动力计划', '设备调度'],
        outputs: ['资源配置计划', '人员组织方案'],
        status: 'pending',
      },
      communications: {
        inputs: ['参建单位列表', '报告要求'],
        tools: ['例会制度', '报告体系'],
        outputs: ['沟通管理计划', '报告模板'],
        status: 'pending',
      },
      risk: {
        inputs: ['地质报告', '气候条件', '设计变更风险'],
        tools: ['风险识别', '评估矩阵'],
        outputs: ['风险登记册', '应急预案'],
        status: 'pending',
      },
      procurement: {
        inputs: ['材料清单', '设备清单'],
        tools: ['招标管理', '供应商评价'],
        outputs: ['采购计划', '材料供应计划'],
        status: 'pending',
      },
      stakeholder: {
        inputs: ['业主单位', '监理单位', '政府部门'],
        tools: ['干系人分析', '协调会议'],
        outputs: ['干系人管理计划', '协调机制'],
        status: 'pending',
      },
    },
    baselines: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  '运营服务': {
    id: 'template-operation',
    name: '运营服务项目计划模板',
    type: '运营',
    areas: {
      integration: {
        inputs: ['运营需求', '服务水平协议'],
        tools: ['专家判断', '服务设计'],
        outputs: ['运营管理计划', '服务目录'],
        status: 'pending',
      },
      scope: {
        inputs: ['服务级别定义', '运营流程'],
        tools: ['流程分析', '服务蓝图'],
        outputs: ['运营范围说明书', '流程文档'],
        status: 'pending',
      },
      schedule: {
        inputs: ['服务时间要求', '资源约束'],
        tools: ['排班计划', '服务日历'],
        outputs: ['运营排班表', '服务时间表'],
        status: 'pending',
      },
      cost: {
        inputs: ['运营成本数据', '资源费率'],
        tools: ['成本核算', '预算管理'],
        outputs: ['运营预算', '成本基准'],
        status: 'pending',
      },
      quality: {
        inputs: ['SLA', '服务质量标准'],
        tools: ['服务监控', '满意度调查'],
        outputs: ['质量指标', '监控仪表盘'],
        status: 'pending',
      },
      resource: {
        inputs: ['人员配置', '系统资源'],
        tools: ['人员排班', '资源分配'],
        outputs: ['运营资源计划', '排班表'],
        status: 'pending',
      },
      communications: {
        inputs: ['客户信息', '团队结构'],
        tools: ['服务报告', '沟通渠道'],
        outputs: ['沟通计划', '服务报告模板'],
        status: 'pending',
      },
      risk: {
        inputs: ['服务中断风险', '人员流动风险'],
        tools: ['业务影响分析', '风险评估'],
        outputs: ['风险登记册', '业务连续性计划'],
        status: 'pending',
      },
      stakeholder: {
        inputs: ['客户', '服务团队', '供应商'],
        tools: ['干系人访谈', '满意度评估'],
        outputs: ['干系人管理计划', '沟通策略'],
        status: 'pending',
      },
      procurement: {
        inputs: ['采购需求', '供应商列表'],
        tools: ['供应商评估', '合同管理'],
        outputs: ['采购计划', '供应商合同'],
        status: 'pending',
      },
    },
    baselines: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
};

// Generate baseline document based on knowledge area
export function generateBaseline(area: string, template: ProjectPlan): string {
  const section = template.areas[area];
  if (!section) return '';

  const lines: string[] = [
    `# ${area.toUpperCase()} 基线文档`,
    '',
    `## 输入 (Inputs)`,
    ...section.inputs.map(i => `- ${i}`),
    '',
    `## 工具与技术 (Tools & Techniques)`,
    ...section.tools.map(t => `- ${t}`),
    '',
    `## 输出 (Outputs)`,
    ...section.outputs.map(o => `- ${o}`),
    '',
    `## 状态: ${section.status}`,
  ];

  return lines.join('\n');
}

// Get integration dependencies for a knowledge area
export function getIntegrationDependencies(areaId: string): string[] {
  const dependencies: Record<string, string[]> = {
    integration: ['scope', 'schedule', 'cost', 'quality', 'resource', 'communications', 'risk', 'procurement', 'stakeholder'],
    scope: ['integration', 'schedule', 'cost'],
    schedule: ['integration', 'scope', 'resource'],
    cost: ['integration', 'scope', 'schedule', 'risk'],
    quality: ['integration', 'scope'],
    resource: ['integration', 'schedule', 'cost'],
    communications: ['integration', 'stakeholder'],
    risk: ['integration', 'scope', 'schedule', 'cost'],
    procurement: ['integration', 'scope', 'cost'],
    stakeholder: ['integration', 'communications'],
  };
  return dependencies[areaId] || [];
}

// Create new project plan from template
export function createProjectPlan(
  name: string,
  type: '信息化' | '课程' | '工程' | '运营',
  templateKey: string
): ProjectPlan {
  const template = PLAN_TEMPLATES[templateKey];
  if (!template) {
    throw new Error(`Template ${templateKey} not found`);
  }

  return {
    id: `plan_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
    name,
    type,
    areas: JSON.parse(JSON.stringify(template.areas)), // Deep clone
    baselines: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

// Update plan baseline
export function updateBaseline(
  plan: ProjectPlan,
  baselineType: 'scope' | 'schedule' | 'cost',
  content: string
): ProjectPlan {
  return {
    ...plan,
    baselines: {
      ...plan.baselines,
      [baselineType]: content,
    },
    updatedAt: new Date().toISOString(),
  };
}