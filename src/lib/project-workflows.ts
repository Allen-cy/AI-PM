export interface WorkflowInput {
  id: string;
  label: string;
  placeholder: string;
  required?: boolean;
  type?: "text" | "textarea" | "date" | "number";
}

export interface WorkflowStep {
  id: string;
  phase: string;
  title: string;
  source: string;
  userInputs: WorkflowInput[];
  userActions: string[];
  aiAssist: string[];
  outputs: string[];
  acceptanceCriteria: string[];
}

export interface WorkflowDefinition {
  id: string;
  title: string;
  subtitle: string;
  sourceFiles: string[];
  steps: WorkflowStep[];
}

export const takeoverWorkflow: WorkflowDefinition = {
  id: "mid-project-takeover",
  title: "中途接手项目如何开展",
  subtitle: "把原项目经理、承接项目经理、组织过程资产、项目进展、难点、相关方与隐形信息完整交接，并形成可执行的接手诊断报告。",
  sourceFiles: [
    "中途接手的项目.xmind",
  ],
  steps: [
    {
      id: "handover-people",
      phase: "交接准备",
      title: "明确交接人和承接人",
      source: "中途接手的项目.xmind / 交接人 / 承接人",
      userInputs: [
        { id: "formerPm", label: "原项目经理", placeholder: "填写原项目经理姓名、联系方式、当前可配合时间", required: true },
        { id: "newPm", label: "新项目经理", placeholder: "填写承接项目经理姓名和接手日期", required: true },
        { id: "handoverDate", label: "计划交接日期", placeholder: "选择交接会议日期", type: "date", required: true },
      ],
      userActions: ["确认交接双方", "锁定交接会议时间", "明确交接范围和交接截止日期"],
      aiAssist: ["根据输入生成交接会议议程", "提示常见遗漏项"],
      outputs: ["交接责任人清单", "交接会议议程"],
      acceptanceCriteria: ["交接双方已确认", "交接日期已确认", "交接范围已列明"],
    },
    {
      id: "process-assets",
      phase: "资料盘点",
      title: "收集项目组织过程资产",
      source: "中途接手的项目.xmind / 项目组织过程资产",
      userInputs: [
        { id: "contracts", label: "项目合同/招投标/技术协议", placeholder: "列出已收到、缺失、需补充确认的合同与技术协议", required: true, type: "textarea" },
        { id: "requirements", label: "需求调研与客户确认文件", placeholder: "列出需求文件、确认记录、未确认事项", type: "textarea" },
        { id: "plans", label: "里程碑、整体计划、WBS", placeholder: "列出计划版本、更新时间、是否已获确认", type: "textarea" },
        { id: "registers", label: "干系人/风险/会议纪要", placeholder: "列出登记册、会议纪要和待补资料", type: "textarea" },
      ],
      userActions: ["上传或登记已接收资料", "标记缺失资料", "指定资料补齐责任人"],
      aiAssist: ["识别资料缺口", "生成交接资料完整性评分"],
      outputs: ["项目资料交接清单", "资料缺口清单"],
      acceptanceCriteria: ["核心合同与需求资料已定位", "计划基线已定位", "风险和干系人登记册已定位或明确缺失"],
    },
    {
      id: "current-state",
      phase: "现状诊断",
      title: "确认项目当前进展和项目难点",
      source: "中途接手的项目.xmind / 项目当前进展 / 项目难点",
      userInputs: [
        { id: "progress", label: "当前进展", placeholder: "填写已完成、进行中、延期、阻塞事项", required: true, type: "textarea" },
        { id: "hardPoints", label: "项目难点", placeholder: "填写技术、客户、资源、合同、回款、验收等难点", required: true, type: "textarea" },
        { id: "urgentIssues", label: "必须立即处理的问题", placeholder: "填写接手后7天内必须处理的问题", type: "textarea" },
      ],
      userActions: ["访谈原PM和关键成员", "复核里程碑和关键路径", "确认7天内必须处理事项"],
      aiAssist: ["归纳项目健康状态", "识别接手优先级", "生成前30天行动建议"],
      outputs: ["项目接手诊断报告", "7天行动清单", "30天稳定计划"],
      acceptanceCriteria: ["当前进展可信", "关键难点已归类", "短期行动责任人明确"],
    },
    {
      id: "stakeholder-hidden-info",
      phase: "隐性信息",
      title: "了解相关方情况和隐形项目信息",
      source: "中途接手的项目.xmind / 项目相关方情况 / 隐形信息",
      userInputs: [
        { id: "stakeholders", label: "关键相关方情况", placeholder: "填写客户、内部、供应商、第三方的态度、诉求和影响力", required: true, type: "textarea" },
        { id: "hiddenInfo", label: "原PM补充的隐形信息", placeholder: "填写正式文档之外的矛盾、承诺、历史问题和注意事项", type: "textarea" },
      ],
      userActions: ["点对点访谈关键相关方", "记录未写入正式文档的承诺和冲突", "判断是否需要升级"],
      aiAssist: ["归纳相关方地图", "识别沟通风险", "生成接手沟通策略"],
      outputs: ["相关方接手地图", "隐性风险清单", "沟通策略"],
      acceptanceCriteria: ["关键相关方已识别", "隐性承诺已记录", "沟通策略已形成"],
    },
    {
      id: "formal-handover",
      phase: "正式交接",
      title: "召开交接会议并形成接手结论",
      source: "中途接手的项目.xmind / 交接形式",
      userInputs: [
        { id: "meetingConclusion", label: "交接会议结论", placeholder: "填写会议结论、遗留事项和确认人", required: true, type: "textarea" },
        { id: "openActions", label: "遗留行动项", placeholder: "填写行动项、责任人、deadline", required: true, type: "textarea" },
      ],
      userActions: ["召开交接会议", "确认交接内容", "形成遗留事项责任清单"],
      aiAssist: ["生成会议纪要", "生成接手声明和后续行动计划"],
      outputs: ["交接会议纪要", "遗留事项跟踪表", "接手行动计划"],
      acceptanceCriteria: ["交接会议已完成", "遗留事项责任到人", "新PM接手计划已发布"],
    },
  ],
};

export const newProjectWorkflow: WorkflowDefinition = {
  id: "new-project-best-practice",
  title: "项目经理接手一个新项目如何开展",
  subtitle: "融合新项目接手XMind、项目管理20步直线型路径和项目最佳实践路径，形成从了解全局到收尾复盘的实操工作流。",
  sourceFiles: [
    "项目经理接手一个新项目如何开展.xmind",
    "项目管理路径-直线型.html",
    "项目最佳实践路径.xmind",
  ],
  steps: [
    {
      id: "global-understanding",
      phase: "了解全局",
      title: "明确目标、范围、客户、场景和成功指标",
      source: "新项目XMind / 一、了解项目全局；20步 / 01-03",
      userInputs: [
        { id: "goal", label: "项目目标", placeholder: "项目为什么做，业务目标是什么", required: true, type: "textarea" },
        { id: "scope", label: "项目大概做什么", placeholder: "项目范围、核心业务、主要功能和流程", required: true, type: "textarea" },
        { id: "successMetrics", label: "成功指标", placeholder: "如何判定项目成功，如验收、回款、上线、满意度、收益指标", required: true, type: "textarea" },
      ],
      userActions: ["访谈发起人和客户关键人", "确认业务痛点", "整理成功指标"],
      aiAssist: ["归纳项目目标", "检查目标是否SMART-AS", "提示需求合理性问题"],
      outputs: ["项目目标说明", "成功指标清单", "初始商业论证输入"],
      acceptanceCriteria: ["目标清楚", "范围边界初步明确", "成功指标可验证"],
    },
    {
      id: "organization-stakeholders",
      phase: "组织与干系人",
      title: "识别内外部组织架构和关键决策链",
      source: "新项目XMind / 二、了解项目组织架构；最佳实践 / 干系人、团队",
      userInputs: [
        { id: "internalTeam", label: "内部团队", placeholder: "商务、咨询、交付、后端支持、项目管理团队", required: true, type: "textarea" },
        { id: "customerTeam", label: "客户/第三方/供应商", placeholder: "甲方PM、销售经理、关键决策人、用户、供应商KP、监理方", required: true, type: "textarea" },
      ],
      userActions: ["识别干系人", "分析权力-利益", "设计项目管理团队"],
      aiAssist: ["生成干系人登记册草案", "识别沟通重点和阻力"],
      outputs: ["干系人登记册", "团队花名册", "沟通重点清单"],
      acceptanceCriteria: ["关键决策人已识别", "内部交付责任清楚", "供应商/第三方已纳入"],
    },
    {
      id: "plan-cost-quality",
      phase: "计划与成本",
      title: "确认周期、里程碑、质量标准、资源和成本底线",
      source: "新项目XMind / 三、了解项目计划和成本；20步 / 06-10",
      userInputs: [
        { id: "milestones", label: "里程碑节点", placeholder: "客户期望、公司期望、关键里程碑和审查点", required: true, type: "textarea" },
        { id: "quality", label: "质量标准", placeholder: "产品/资源/题库/定制化交付标准和验收依据", required: true, type: "textarea" },
        { id: "cost", label: "成本与资源", placeholder: "计划投入资源、成本、利润底线和约束", type: "textarea" },
      ],
      userActions: ["拆分PBS/WBS/活动", "估算工期和成本", "设置质量标准和审查点"],
      aiAssist: ["提示关键路径风险", "生成基准管理建议"],
      outputs: ["里程碑计划", "WBS输入", "质量标准清单", "成本约束说明"],
      acceptanceCriteria: ["里程碑可跟踪", "质量标准可验证", "资源成本约束已记录"],
    },
    {
      id: "risk-process-tools",
      phase: "风险与流程",
      title: "识别风险、流程冲突和工具模板要求",
      source: "新项目XMind / 四-六；最佳实践 / 关注风险",
      userInputs: [
        { id: "risks", label: "问题与风险", placeholder: "当前状况、不满意点、承诺事项、潜在威胁", required: true, type: "textarea" },
        { id: "process", label: "流程", placeholder: "公司流程、客户流程、例外流程、变更流程、冲突点", required: true, type: "textarea" },
        { id: "tools", label: "模板工具", placeholder: "客户模板、公司模板、标准化工具、飞书/其他协同工具", type: "textarea" },
      ],
      userActions: ["识别潜在威胁", "制定应对策略", "确认流程冲突和模板要求"],
      aiAssist: ["生成风险登记册候选项", "归纳流程冲突和例外处理建议"],
      outputs: ["初始风险登记册", "流程冲突清单", "模板工具清单"],
      acceptanceCriteria: ["风险已进入登记册", "变更/例外流程清楚", "模板工具可获取"],
    },
    {
      id: "communication-rules",
      phase: "沟通与规则",
      title: "搭建沟通机制并制定项目规则",
      source: "新项目XMind / 七-八；20步 / 12-17",
      userInputs: [
        { id: "communication", label: "沟通机制", placeholder: "项目日志、例会、周报对象、沟通工具、正式邮件规则", required: true, type: "textarea" },
        { id: "rules", label: "项目规则", placeholder: "纪律、扯皮规避抓手、完成标准、考核指标", required: true, type: "textarea" },
      ],
      userActions: ["定义沟通对象-信息-方式-频率", "宣贯项目纪律", "召开Kickoff"],
      aiAssist: ["生成沟通计划", "生成项目规则宣贯稿"],
      outputs: ["沟通计划", "项目规则", "Kickoff议程"],
      acceptanceCriteria: ["沟通频率明确", "升级规则明确", "完成标准已发布"],
    },
    {
      id: "monitor-close",
      phase: "监控与收尾",
      title: "建立监控、例外处理、验收移交和复盘机制",
      source: "最佳实践 / 项目监控阶段、项目收尾阶段；新项目XMind / 九、项目收尾；20步 / 18-20",
      userInputs: [
        { id: "monitoring", label: "监控机制", placeholder: "进度、成本、风险、问题、例外授权和报告机制", required: true, type: "textarea" },
        { id: "closing", label: "收尾机制", placeholder: "验收、交付动作、合同收尾、行政收尾、经验教训和资源释放", required: true, type: "textarea" },
      ],
      userActions: ["实时跟踪进度", "控制支出", "管理例外", "组织验收和复盘"],
      aiAssist: ["生成监控节奏", "生成收尾清单", "生成复盘提纲"],
      outputs: ["项目监控机制", "验收移交清单", "项目复盘报告提纲"],
      acceptanceCriteria: ["监控机制运行", "验收/移交责任清楚", "复盘和组织过程资产更新安排明确"],
    },
  ],
};

export function buildWorkflowReport(workflow: WorkflowDefinition, values: Record<string, string>) {
  const completed = workflow.steps.map(step => {
    const missing = step.userInputs.filter(input => input.required && !values[`${step.id}.${input.id}`]?.trim());
    return {
      step,
      missing,
      ready: missing.length === 0,
    };
  });
  const readyCount = completed.filter(item => item.ready).length;
  return {
    readyCount,
    total: workflow.steps.length,
    completed,
    readiness: Math.round((readyCount / workflow.steps.length) * 100),
  };
}
