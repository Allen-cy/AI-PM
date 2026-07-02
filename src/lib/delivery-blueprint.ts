export type BlueprintPhaseId = "initiation" | "planning" | "execution" | "closing";
export type BlueprintLaneId = "sales" | "project" | "monitoring" | "cost" | "tools";

export interface SalesStage {
  id: string;
  name: string;
  description: string;
  linkedPhaseIds: BlueprintPhaseId[];
}

export interface DeliveryControlPoint {
  id: number;
  title: string;
  description: string;
  from: BlueprintLaneId;
  to: BlueprintLaneId;
  phaseId: BlueprintPhaseId;
  output: string;
}

export interface ProjectBlueprintNode {
  id: string;
  name: string;
  href: string;
  role: string;
  output: string;
  evidence: string;
  children?: string[];
}

export interface DeliveryPhase {
  id: BlueprintPhaseId;
  name: string;
  businessMeaning: string;
  salesTouchpoint: string;
  costGate: string;
  nodes: ProjectBlueprintNode[];
}

export interface MonitoringTrack {
  id: string;
  name: string;
  purpose: string;
  evidence: string;
}

export interface ToolSupport {
  id: string;
  name: string;
  href: string;
  purpose: string;
}

export const salesStages: SalesStage[] = [
  {
    id: "opportunity",
    name: "商机",
    description: "售前线索形成项目机会，触发预立项、报价和交付可行性判断。",
    linkedPhaseIds: ["initiation"],
  },
  {
    id: "contract-sign",
    name: "合同签约",
    description: "合同条款、SOW、工作计划和交付边界需要与项目启动口径一致。",
    linkedPhaseIds: ["initiation", "planning"],
  },
  {
    id: "contract-order",
    name: "合同/订单",
    description: "合同付款条件、SOW和订单信息转化为项目计划、里程碑与预算基线。",
    linkedPhaseIds: ["planning"],
  },
  {
    id: "payment-plan",
    name: "回款计划",
    description: "以里程碑验收为触发条件，将交付进度转化为回款计划。",
    linkedPhaseIds: ["execution"],
  },
  {
    id: "receivable",
    name: "应收",
    description: "里程碑验收和项目验收完成后，形成明确应收和回款责任。",
    linkedPhaseIds: ["execution", "closing"],
  },
  {
    id: "write-off",
    name: "核销",
    description: "回款到账后进行核销，结合项目决算计算项目损益。",
    linkedPhaseIds: ["closing"],
  },
  {
    id: "after-sales",
    name: "售后服务",
    description: "项目移交 CSM/售后团队，完成交付到运营服务的责任交接。",
    linkedPhaseIds: ["closing"],
  },
];

export const deliveryControlPoints: DeliveryControlPoint[] = [
  {
    id: 1,
    title: "预立项申请",
    description: "销售商机进入项目化评估，先判断是否值得投入交付资源。",
    from: "sales",
    to: "project",
    phaseId: "initiation",
    output: "预立项申请与初步交付判断",
  },
  {
    id: 2,
    title: "编制指导销售报价",
    description: "项目经理基于方案、工作量和资源假设，为销售报价提供交付成本依据。",
    from: "project",
    to: "sales",
    phaseId: "initiation",
    output: "报价交付假设与成本测算",
  },
  {
    id: 3,
    title: "拆解工作计划作为合同附件",
    description: "把交付范围、计划和关键职责固化进合同/SOW，避免签约后边界漂移。",
    from: "project",
    to: "sales",
    phaseId: "initiation",
    output: "SOW与工作计划附件",
  },
  {
    id: 4,
    title: "正式立项",
    description: "合同签约或内部批准后，项目进入正式立项和资源组织。",
    from: "sales",
    to: "project",
    phaseId: "initiation",
    output: "正式立项记录",
  },
  {
    id: 5,
    title: "付款条件转里程碑",
    description: "合同付款条件与SOW生成里程碑节点，作为进度、验收和回款联动依据。",
    from: "sales",
    to: "project",
    phaseId: "planning",
    output: "里程碑计划与验收条件",
  },
  {
    id: 6,
    title: "里程碑关联回款计划",
    description: "每个关键里程碑要明确回款触发条件、责任人和预计回款日期。",
    from: "project",
    to: "sales",
    phaseId: "planning",
    output: "回款计划基线",
  },
  {
    id: 7,
    title: "里程碑验收触发回款",
    description: "执行阶段完成里程碑验收后，触发对应回款计划并确认应收。",
    from: "project",
    to: "sales",
    phaseId: "execution",
    output: "里程碑验收与应收确认",
  },
  {
    id: 8,
    title: "项目验收确认应收",
    description: "项目整体验收完成后，确认剩余应收并进入结项准备。",
    from: "project",
    to: "sales",
    phaseId: "closing",
    output: "项目验收单与应收清单",
  },
  {
    id: 9,
    title: "核销回款，里程碑完成",
    description: "回款到账核销后，关闭对应里程碑经营状态，支撑项目损益计算。",
    from: "sales",
    to: "cost",
    phaseId: "closing",
    output: "核销记录与损益口径",
  },
  {
    id: 10,
    title: "项目移交到 CSM",
    description: "交付责任移交至客户成功/售后服务，形成后续运营服务入口。",
    from: "project",
    to: "sales",
    phaseId: "closing",
    output: "移交记录与服务责任人",
  },
];

export const deliveryPhases: DeliveryPhase[] = [
  {
    id: "initiation",
    name: "项目立项",
    businessMeaning: "从商机到正式项目，确认是否做、谁来做、做什么边界。",
    salesTouchpoint: "商机 / 合同签约",
    costGate: "项目概算",
    nodes: [
      {
        id: "initiation-request",
        name: "立项申请",
        href: "/initiation",
        role: "销售 / 项目经理",
        output: "预立项申请",
        evidence: "商机背景、客户目标、初步范围、预估合同额",
      },
      {
        id: "initiation-approval",
        name: "立项审批",
        href: "/initiation",
        role: "PMO / 业务负责人",
        output: "立项结论",
        evidence: "投入产出判断、风险、资源可行性",
      },
      {
        id: "team-setup",
        name: "项目团队组建",
        href: "/resource",
        role: "项目经理",
        output: "项目组织与责任分工",
        evidence: "项目经理、核心成员、RACI",
      },
      {
        id: "sow-breakdown",
        name: "拆解 SOW",
        href: "/wbs",
        role: "项目经理 / 交付负责人",
        output: "SOW拆解与交付边界",
        evidence: "合同范围、工作计划、关键假设",
      },
    ],
  },
  {
    id: "planning",
    name: "项目规划",
    businessMeaning: "把合同和SOW转化为可执行、可验收、可回款的项目基线。",
    salesTouchpoint: "合同/订单",
    costGate: "项目预算",
    nodes: [
      {
        id: "wbs",
        name: "WBS拆解",
        href: "/wbs",
        role: "项目经理",
        output: "WBS与任务结构",
        evidence: "范围分解、交付物、责任人",
        children: ["任务管理", "WBS物料管理"],
      },
      {
        id: "milestone-plan",
        name: "里程碑计划",
        href: "/planning",
        role: "项目经理 / 销售",
        output: "里程碑计划",
        evidence: "付款条件、验收条件、关键节点",
      },
      {
        id: "resource-plan",
        name: "制定资源计划",
        href: "/resource",
        role: "资源经理 / 项目经理",
        output: "资源计划",
        evidence: "人力、采购、物料、外包需求",
        children: ["人力资源计划", "采购计划", "物料计划", "外包计划"],
      },
      {
        id: "budget-approval",
        name: "项目预算审批",
        href: "/finance",
        role: "财务 / PMO",
        output: "项目预算基线",
        evidence: "拆解详细预算、毛利、现金流",
        children: ["拆解详细预算"],
      },
      {
        id: "baseline",
        name: "项目基线管理",
        href: "/planning",
        role: "项目经理 / PMO",
        output: "范围、进度、成本基线",
        evidence: "计划评审记录与基线版本",
      },
    ],
  },
  {
    id: "execution",
    name: "项目执行",
    businessMeaning: "按基线推进交付，围绕进度、资源、里程碑和变更形成过程闭环。",
    salesTouchpoint: "回款计划 / 应收",
    costGate: "核算（预算执行）",
    nodes: [
      {
        id: "progress",
        name: "项目进度管理",
        href: "/execution",
        role: "项目经理",
        output: "进度状态与偏差处理",
        evidence: "周报汇报、周报工时管理、任务完成情况",
        children: ["周报汇报", "周报工时管理"],
      },
      {
        id: "resource",
        name: "资源管理",
        href: "/resource",
        role: "项目经理 / 资源经理",
        output: "资源执行记录",
        evidence: "人力资源、采购、物料到位情况",
        children: ["人力资源管理", "采购管理", "物料管理"],
      },
      {
        id: "milestone",
        name: "里程碑管理",
        href: "/execution",
        role: "项目经理 / 客户",
        output: "里程碑验收",
        evidence: "阶段交付物、验收记录、回款触发依据",
        children: ["里程碑验收"],
      },
      {
        id: "change",
        name: "项目变更",
        href: "/issue-change",
        role: "项目经理 / PMO",
        output: "变更审批与基线调整",
        evidence: "范围、进度、成本、合同影响评估",
      },
    ],
  },
  {
    id: "closing",
    name: "项目收尾",
    businessMeaning: "完成验收、结项、移交和经营闭环，确认应收、核销与损益。",
    salesTouchpoint: "应收 / 核销 / 售后服务",
    costGate: "决算",
    nodes: [
      {
        id: "acceptance",
        name: "项目验收",
        href: "/closing",
        role: "项目经理 / 客户",
        output: "项目验收单",
        evidence: "验收材料、问题清单、应收确认",
      },
      {
        id: "settlement",
        name: "项目结项",
        href: "/closing",
        role: "项目经理 / PMO / 财务",
        output: "结项报告",
        evidence: "交付结果、成本决算、项目损益",
      },
      {
        id: "handover",
        name: "项目移交",
        href: "/closing",
        role: "项目经理 / CSM",
        output: "售后服务移交",
        evidence: "客户资料、系统账号、待办事项、服务责任人",
      },
    ],
  },
];

export const monitoringTracks: MonitoringTrack[] = [
  {
    id: "progress-monitoring",
    name: "进度监控",
    purpose: "监控计划偏差、里程碑风险和关键路径变化。",
    evidence: "计划基线、周报、里程碑完成率",
  },
  {
    id: "risk-monitoring",
    name: "风险监控",
    purpose: "识别范围、资源、客户、供应商和回款风险，并转行动闭环。",
    evidence: "风险登记册、风险跟踪、问题/变更记录",
  },
  {
    id: "cost-monitoring",
    name: "成本监控",
    purpose: "连接概算、预算、执行核算和决算，识别毛利与现金流偏差。",
    evidence: "预算、工时、采购、物料、回款和决算数据",
  },
];

export const toolSupports: ToolSupport[] = [
  {
    id: "project-group",
    name: "项目与企信群",
    href: "/integration-center",
    purpose: "承载项目沟通、通知和过程协同。",
  },
  {
    id: "pmo-dashboard",
    name: "项目经理/PMO看板",
    href: "/workbench",
    purpose: "把进度、风险、成本、回款和待办集中到日常管理入口。",
  },
  {
    id: "templates",
    name: "项目模板",
    href: "/templates",
    purpose: "沉淀立项、规划、风险、验收和结项标准模板。",
  },
  {
    id: "structured-docs",
    name: "结构化文档",
    href: "/reports",
    purpose: "生成周报、月报、验收报告和经营复盘报告。",
  },
  {
    id: "knowledge",
    name: "知识库与AI问答",
    href: "/knowledge",
    purpose: "连接方法论、历史案例和项目管理RAG。",
  },
];

export function getControlPointsByPhase(phaseId: BlueprintPhaseId): DeliveryControlPoint[] {
  return deliveryControlPoints.filter(point => point.phaseId === phaseId);
}

export function getBlueprintSummary() {
  return {
    salesStages: salesStages.length,
    projectPhases: deliveryPhases.length,
    controlPoints: deliveryControlPoints.length,
    monitoringTracks: monitoringTracks.length,
    toolSupports: toolSupports.length,
  };
}
