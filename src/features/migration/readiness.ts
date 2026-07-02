export type MigrationAreaId =
  | "process-coverage"
  | "data-portability"
  | "ai-trust"
  | "collaboration"
  | "security"
  | "daily-adoption"
  | "finance-integration";

export type MigrationStageId = "inventory" | "mapping" | "trial-import" | "pilot" | "cutover" | "operate";

export interface MigrationReadinessArea {
  id: MigrationAreaId;
  name: string;
  whyItMatters: string;
  userProof: string;
  systemCapability: string;
  nextAction: string;
  owner: "PMO" | "项目经理" | "管理员" | "管理层";
  weight: number;
}

export interface MigrationStage {
  id: MigrationStageId;
  name: string;
  objective: string;
  inputs: string[];
  outputs: string[];
  gate: string;
}

export interface MigrationDataObject {
  name: string;
  source: "竞品A" | "飞书" | "Excel/CSV" | "Supabase" | "知识库";
  requiredFields: string[];
  targetModule: string;
  qualityChecks: string[];
}

export interface MigrationReadinessResult {
  score: number;
  level: "not-ready" | "trial-ready" | "pilot-ready" | "migration-ready";
  levelName: string;
  summary: string;
  missingAreas: MigrationReadinessArea[];
  recommendedNextActions: string[];
}

export const migrationReadinessAreas: MigrationReadinessArea[] = [
  {
    id: "process-coverage",
    name: "核心流程覆盖",
    whyItMatters: "竞品忠实用户不会接受关键流程断点，必须覆盖立项、规划、执行、监控、风险、验收、回款和复盘。",
    userProof: "拿 1 个真实项目走完端到端流程，确认每个管理动作都有入口、状态和输出物。",
    systemCapability: "项目全流程蓝图、治理工作流、风险问题变更链路、收尾验收和报告工厂。",
    nextAction: "选择一个已完成项目做流程回放，标记竞品A中高频动作在本系统中的对应入口。",
    owner: "PMO",
    weight: 18,
  },
  {
    id: "data-portability",
    name: "数据可迁移与可信",
    whyItMatters: "历史项目数据如果迁不过来、对不上、不可追溯，用户不会永久迁移。",
    userProof: "完成项目台账、风险、任务、里程碑、合同回款的导入试跑，并生成字段映射和质量问题清单。",
    systemCapability: "项目组合看板文件导入、飞书实时读取、字段映射检查、实时数据质量扫描。",
    nextAction: "准备竞品A导出的项目台账样例，先跑 20-50 条项目数据的试迁移。",
    owner: "管理员",
    weight: 20,
  },
  {
    id: "ai-trust",
    name: "AI 输出可信可追溯",
    whyItMatters: "AI 不能只是生成文字，必须说明依据、影响和下一步动作。",
    userProof: "商业论证、风险扫描、状态摘要、周报至少各生成 1 次，并能看到数据来源和可转行动项。",
    systemCapability: "AI 依据仓库、RAG 引用、AI 建议转行动项、审计日志。",
    nextAction: "用同一个项目对比竞品A手工报告与本系统 AI 报告，检查依据是否足够透明。",
    owner: "项目经理",
    weight: 14,
  },
  {
    id: "collaboration",
    name: "飞书/协作系统打通",
    whyItMatters: "团队已经在飞书工作时，迁移系统必须进入原有协作流，而不是另开一个孤岛。",
    userProof: "个人飞书配置可用，项目台账、任务、文档、通知或日历动作至少有一个真实写入闭环。",
    systemCapability: "个人飞书接入、Bot/OpenAPI 动作、飞书项目台账读取、同步日志。",
    nextAction: "选择一个测试项目，验证从系统生成待办并写入飞书任务或文档。",
    owner: "管理员",
    weight: 14,
  },
  {
    id: "security",
    name: "权限、安全与审计",
    whyItMatters: "公网多人使用时，数据隔离、审批、审计不成熟会阻断组织迁移。",
    userProof: "普通用户只能看到授权项目，管理员能审批项目访问申请，并能导出审计记录。",
    systemCapability: "申请制注册、项目级授权、安全中心、审计导出、敏感配置脱敏。",
    nextAction: "用管理员和普通用户各登录一次，检查同一项目数据的可见范围。",
    owner: "管理员",
    weight: 14,
  },
  {
    id: "daily-adoption",
    name: "日常使用效率",
    whyItMatters: "永久迁移的前提是项目经理每天愿意打开，而不是只在汇报前临时用。",
    userProof: "PM/PMO 每日工作台能给出今日待办、重点项目、经营提醒和 AI 建议依据。",
    systemCapability: "PM/PMO每日工作台、重点项目链路、经营提醒、统一行动项。",
    nextAction: "选 3 个真实项目连续使用 1 周，记录系统是否减少手工整理时间。",
    owner: "项目经理",
    weight: 10,
  },
  {
    id: "finance-integration",
    name: "业财一体化联动",
    whyItMatters: "如果系统只能管任务，无法说明项目经营结果，就很难替代 PMO/管理层视角工具。",
    userProof: "合同、预算、成本、回款、应收、核销、决算能围绕项目和里程碑串起来。",
    systemCapability: "业财一体化驾驶舱、合同回款、成本监控、验收阻塞和经营预警。",
    nextAction: "用一个重点项目核对合同额、预算、已回款、应收、毛利和验收状态。",
    owner: "管理层",
    weight: 10,
  },
];

export const migrationStages: MigrationStage[] = [
  {
    id: "inventory",
    name: "1. 迁移盘点",
    objective: "明确竞品A中哪些数据和流程必须迁移，哪些历史数据只归档不进入日常管理。",
    inputs: ["竞品A项目清单", "组织/用户清单", "高频报表样例", "现有模板和台账"],
    outputs: ["迁移范围清单", "数据对象清单", "保留/废弃规则"],
    gate: "PMO确认迁移范围，避免把历史垃圾数据原样搬进新系统。",
  },
  {
    id: "mapping",
    name: "2. 字段映射",
    objective: "把竞品A字段映射到飞书智能表和系统标准字段，优先统一中文字段口径。",
    inputs: ["竞品A字段表", "飞书表字段", "系统模板字段"],
    outputs: ["字段映射表", "枚举值转换规则", "缺失字段补充清单"],
    gate: "项目台账、风险、任务、里程碑、合同回款五类对象字段映射通过。",
  },
  {
    id: "trial-import",
    name: "3. 试迁移",
    objective: "用小批量真实数据验证导入、清洗、质量检查和看板读取链路。",
    inputs: ["20-50条项目样例", "风险/问题/任务样例", "合同回款样例"],
    outputs: ["导入结果报告", "数据质量问题清单", "修正建议"],
    gate: "关键字段缺失率、重复率、金额/日期异常率在可接受范围内。",
  },
  {
    id: "pilot",
    name: "4. 试点运行",
    objective: "选一个团队或项目组合并行运行，验证项目经理和PMO日常使用效率。",
    inputs: ["试点项目", "试点用户", "飞书个人连接", "AI模型配置"],
    outputs: ["试点周报", "用户反馈", "功能缺口清单"],
    gate: "试点用户能独立完成查看、更新、报告、风险跟踪等核心动作。",
  },
  {
    id: "cutover",
    name: "5. 正式切换",
    objective: "明确旧系统冻结点、增量数据同步方式和新系统主数据归属。",
    inputs: ["冻结日期", "最终导入包", "权限分配", "管理员确认"],
    outputs: ["切换记录", "权限校验记录", "上线公告"],
    gate: "管理层确认新系统作为项目管理主入口，竞品A只读归档。",
  },
  {
    id: "operate",
    name: "6. 运营优化",
    objective: "持续优化数据质量、模板、AI提示词、报表和流程配置。",
    inputs: ["同步日志", "审计日志", "用户反馈", "PMO制度更新"],
    outputs: ["月度优化清单", "模板更新", "知识库沉淀"],
    gate: "形成PMO月度治理节奏，而不是一次性上线后无人维护。",
  },
];

export const migrationDataObjects: MigrationDataObject[] = [
  {
    name: "项目台账",
    source: "竞品A",
    requiredFields: ["项目编号", "项目名称", "项目经理", "项目状态", "计划开始日期", "计划完成日期", "合同金额"],
    targetModule: "项目组合看板 / 工作台 / 监控中心",
    qualityChecks: ["项目编号唯一", "责任人不为空", "日期合法", "状态枚举统一"],
  },
  {
    name: "任务与WBS",
    source: "Excel/CSV",
    requiredFields: ["任务名称", "所属项目", "责任人", "计划完成日期", "完成状态", "上级WBS"],
    targetModule: "WBS拆解 / 执行与交付 / 今日待办",
    qualityChecks: ["所属项目可匹配", "任务层级不循环", "deadline不为空"],
  },
  {
    name: "风险/问题/变更",
    source: "竞品A",
    requiredFields: ["事项类型", "所属项目", "责任人", "严重程度", "状态", "应对动作", "复核日期"],
    targetModule: "风险管理 / 问题变更链路 / 治理工作流",
    qualityChecks: ["高风险必须有动作", "关闭事项必须有关闭证据", "状态流转合法"],
  },
  {
    name: "里程碑与验收",
    source: "飞书",
    requiredFields: ["里程碑名称", "所属项目", "验收条件", "计划日期", "实际日期", "验收状态"],
    targetModule: "执行与交付 / 收尾验收 / 回款联动",
    qualityChecks: ["验收状态与回款触发一致", "实际日期不得早于计划开始", "责任人明确"],
  },
  {
    name: "合同与回款",
    source: "Excel/CSV",
    requiredFields: ["合同编号", "所属项目", "合同金额", "回款节点", "应收金额", "已回款", "到期日"],
    targetModule: "业财一体化驾驶舱 / 合同与回款",
    qualityChecks: ["合同额与回款计划匹配", "已回款不超过合同额", "逾期应收可识别"],
  },
  {
    name: "模板与知识库",
    source: "知识库",
    requiredFields: ["模板名称", "适用阶段", "输入要求", "输出成果", "责任角色"],
    targetModule: "模板中心 / RAG问答 / 报告工厂",
    qualityChecks: ["模板可下载", "适用阶段明确", "RAG引用来源可追溯"],
  },
];

export function assessMigrationReadiness(selectedAreaIds: MigrationAreaId[]): MigrationReadinessResult {
  const selected = new Set(selectedAreaIds);
  const score = migrationReadinessAreas.reduce((sum, area) => sum + (selected.has(area.id) ? area.weight : 0), 0);
  const missingAreas = migrationReadinessAreas.filter(area => !selected.has(area.id));

  if (score >= 85) {
    return {
      score,
      level: "migration-ready",
      levelName: "具备正式迁移条件",
      summary: "可以进入正式切换准备，重点关注权限校验、最终数据冻结和上线沟通。",
      missingAreas,
      recommendedNextActions: ["制定切换窗口和回滚预案", "冻结竞品A增量数据", "完成管理员与普通用户权限抽查"],
    };
  }
  if (score >= 65) {
    return {
      score,
      level: "pilot-ready",
      levelName: "具备试点迁移条件",
      summary: "可以选择一个团队或项目组合试点，但暂不建议全员永久切换。",
      missingAreas,
      recommendedNextActions: ["选择3-5个真实项目试点", "建立每日工作台使用反馈", "补齐试点中暴露的数据质量问题"],
    };
  }
  if (score >= 40) {
    return {
      score,
      level: "trial-ready",
      levelName: "适合小批量试迁移",
      summary: "当前更适合做小批量数据试迁移和流程回放，先证明数据和核心流程不断点。",
      missingAreas,
      recommendedNextActions: ["准备竞品A导出的项目样例", "完成字段映射表", "用20-50条真实数据跑导入验证"],
    };
  }
  return {
    score,
    level: "not-ready",
    levelName: "暂不适合迁移",
    summary: "需要先补齐流程、数据、权限或协作底座，否则迁移风险高。",
    missingAreas,
    recommendedNextActions: ["先完成飞书项目台账连接", "确认必须迁移的数据对象", "选定一个真实项目做流程回放"],
  };
}
