export type TemplateCategory = "risk" | "planning" | "governance";

export interface TemplateDescriptor {
  id: string;
  title: string;
  category: TemplateCategory;
  description: string;
  source: string;
  format: "xlsx";
  importTarget?: "risk-register" | "risk-tracking" | "sensitivity" | "planning-workflow";
}

export const templateCatalog: TemplateDescriptor[] = [
  {
    id: "risk-register",
    title: "风险登记册模板",
    category: "risk",
    description: "线下登记风险识别、风险分析、风险计划字段，导入后进入正式风险登记册。",
    source: "C-风险管理工具箱.xlsx / 风险登记表",
    format: "xlsx",
    importTarget: "risk-register",
  },
  {
    id: "risk-response-plan",
    title: "风险应对计划模板",
    category: "risk",
    description: "登记风险后果、跟踪方法、责任人、应对行动、优先级和结束条件。",
    source: "C-风险管理工具箱.xlsx / 风险应对计划",
    format: "xlsx",
    importTarget: "risk-tracking",
  },
  {
    id: "risk-tracking",
    title: "项目风险跟踪管理模板",
    category: "risk",
    description: "按阶段跟踪风险可能性、影响、优先级、处理策略、规避计划和应急计划。",
    source: "项目风险跟踪管理.xls",
    format: "xlsx",
    importTarget: "risk-tracking",
  },
  {
    id: "risk-sensitivity",
    title: "风险敏感性分析模板",
    category: "risk",
    description: "录入基准值、低值、高值和影响方向，系统生成敏感性排序和龙卷风图。",
    source: "敏感性分析.xls",
    format: "xlsx",
    importTarget: "sensitivity",
  },
  {
    id: "mid-project-takeover",
    title: "中途接手项目交接清单",
    category: "planning",
    description: "围绕交接人、承接人、组织过程资产、项目现状、难点、相关方和隐形信息完成交接。",
    source: "中途接手的项目.xmind",
    format: "xlsx",
    importTarget: "planning-workflow",
  },
  {
    id: "new-project-best-practice",
    title: "新项目接手最佳实践清单",
    category: "planning",
    description: "融合新项目接手XMind、项目管理20步和项目最佳实践路径，形成项目经理接手新项目输入清单。",
    source: "项目经理接手一个新项目如何开展.xmind / 项目管理路径-直线型.html / 项目最佳实践路径.xmind",
    format: "xlsx",
    importTarget: "planning-workflow",
  },
];

export function getTemplateDescriptor(id: string) {
  return templateCatalog.find(template => template.id === id);
}

export function templateRows(id: string): Array<Record<string, string | number>> {
  switch (id) {
    case "risk-register":
      return [
        {
          "项目名称": "示例项目",
          "风险描述": "关键供应商交付延期，可能影响集成测试。",
          "风险类别": "供应商",
          "项目阶段": "执行",
          "来源": "人工登记",
          "影响领域": "工期",
          "紧迫度": 4,
          "可能性": 4,
          "影响": 4,
          "应对策略": "缓解",
          "应对计划": "每周跟踪供应商交付，提前准备替代方案。",
          "预防措施": "明确供应商里程碑和验收标准。",
          "应急计划": "若延期超过5天，启用替代资源。",
          "触发条件": "供应商连续两周未达成交付节点。",
          "跟踪方法": "周会+供应商日报",
          "责任人": "项目经理",
          "deadline": "2026-07-15",
          "下次复核": "2026-07-08",
          "关闭条件": "供应商交付通过验收测试。",
          "关联模块": "执行",
          "证据": "供应商计划表",
        },
      ];
    case "risk-response-plan":
      return [
        {
          "风险编号": "R001",
          "风险项目": "数据移植专家不能按期到位",
          "风险后果": "数据转换工作滞后，后续任务顺延。",
          "跟踪方法": "每周跟踪专家所在项目进度。",
          "责任人": "项目经理",
          "应对行动": "提前培训副手并准备替代方案。",
          "约束条件": "应急行动不得影响并行任务。",
          "行动优先级": "高",
          "结束条件": "数据转换程序通过验收测试。",
        },
      ];
    case "risk-tracking":
      return [
        {
          "风险编号": "R001",
          "本次状态": "跟踪中",
          "完成进度": 60,
          "责任人": "项目经理",
          "deadline": "2026-07-15",
          "已完成动作": "已召开供应商风险评审会。",
          "下一步动作": "确认替代资源可用性。",
          "阻塞/升级事项": "供应商仍未确认补救计划。",
          "证据": "会议纪要链接或文件名",
        },
      ];
    case "risk-sensitivity":
      return [
        { "因素": "合同金额/收入", "基准值": 100, "低值": 80, "高值": 120, "单位": "万元", "影响方向": "正向收益", "备注": "收入下降会降低收益。" },
        { "因素": "实施成本", "基准值": 60, "低值": 48, "高值": 72, "单位": "万元", "影响方向": "负向影响", "备注": "成本上升会降低收益。" },
        { "因素": "交付延期", "基准值": 0, "低值": -10, "高值": 20, "单位": "天", "影响方向": "负向影响", "备注": "延期会影响验收和回款。" },
      ];
    case "mid-project-takeover":
      return [
        { "阶段": "交接准备", "输入项": "原项目经理", "填写内容": "", "是否必填": "是", "输出成果": "交接责任人清单" },
        { "阶段": "资料盘点", "输入项": "合同/招投标/技术协议/需求/WBS/风险登记册", "填写内容": "", "是否必填": "是", "输出成果": "项目资料交接清单" },
        { "阶段": "现状诊断", "输入项": "当前进展、项目难点、7天内必须处理事项", "填写内容": "", "是否必填": "是", "输出成果": "项目接手诊断报告" },
        { "阶段": "隐性信息", "输入项": "相关方情况、隐形信息", "填写内容": "", "是否必填": "否", "输出成果": "相关方接手地图" },
      ];
    case "new-project-best-practice":
      return [
        { "阶段": "了解全局", "输入项": "目标、范围、客户、业务场景、成功指标", "填写内容": "", "是否必填": "是", "输出成果": "项目目标说明" },
        { "阶段": "组织与干系人", "输入项": "内部团队、客户团队、供应商、第三方", "填写内容": "", "是否必填": "是", "输出成果": "干系人登记册" },
        { "阶段": "计划与成本", "输入项": "周期、里程碑、质量标准、资源和成本", "填写内容": "", "是否必填": "是", "输出成果": "里程碑计划/WBS输入" },
        { "阶段": "风险与流程", "输入项": "问题风险、流程冲突、模板工具", "填写内容": "", "是否必填": "是", "输出成果": "初始风险登记册/流程冲突清单" },
      ];
    default:
      return [];
  }
}
