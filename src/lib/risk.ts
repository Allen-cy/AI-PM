// Risk Management - source-driven PMO risk model and calculations

export type RiskCategory =
  | "商业"
  | "客户"
  | "供应商"
  | "计划编制"
  | "组织管理"
  | "开发实施环境"
  | "过程"
  | "设计实现"
  | "人员资源"
  | "外部环境"
  | "产品"
  | "需求"
  | "技术"
  | "质量"
  | "合同"
  | "财务"
  | "进度"
  | "管理";

export type RiskStage = "立项" | "规划" | "执行" | "监控" | "验收" | "结项" | "全生命周期";
export type RiskStatus =
  | "identified"
  | "analyzing"
  | "response-planned"
  | "response-implementing"
  | "monitoring"
  | "tracking"
  | "resolved"
  | "closed";
export type RiskStrategy = "规避" | "缓解" | "转移" | "接受" | "上报";
export type RiskImpactArea = "范围" | "费用" | "工期" | "质量" | "组织" | "技术" | "合同" | "回款" | "客户" | "供应商";
export type LinkedModule = "项目组合看板" | "立项" | "规划" | "执行" | "监控" | "收尾" | "合同回款" | "质量" | "资源";
export type RiskWorkflowStep = "identify" | "analyze" | "plan" | "implement" | "supervise" | "track" | "close";

export interface Risk {
  id: string;
  version?: number;
  projectId?: string;
  orgId?: string;
  dataClass?: "production" | "sample" | "test" | "diagnostic" | "unclassified";
  riskCode?: string;
  projectName: string;
  description: string;
  category: RiskCategory;
  stage: RiskStage;
  source: string;
  impactArea: RiskImpactArea;
  probability: 1 | 2 | 3 | 4 | 5;  // 1=极低, 5=极高
  impact: 1 | 2 | 3 | 4 | 5;        // 1=轻微, 5=严重
  urgency: 1 | 2 | 3 | 4 | 5;       // 1=可观察, 5=必须立即处理
  piScore: number;                  // P × I
  priorityScore: number;            // P × I × Urgency
  status: RiskStatus;
  responseStrategyType: RiskStrategy;
  responseStrategy: string;
  preventiveAction: string;
  contingencyPlan: string;
  trigger: string;
  trackingMethod: string;
  owner: string;
  dueDate: string;
  nextReviewDate: string;
  closingCriteria: string;
  linkedModule: LinkedModule;
  evidence?: string;
  workflowStep?: RiskWorkflowStep;
  currentInput?: string;
  currentOutput?: string;
  lastAction?: string;
  actionOwner?: string;
  actionDeadline?: string;
  createdAt: string;
  updatedAt?: string;
  archivedAt?: string;
}

export interface RiskWorkflowEvent {
  id: string;
  riskId: string;
  riskCode?: string;
  workflowStep: RiskWorkflowStep;
  fromStatus?: RiskStatus;
  toStatus: RiskStatus;
  inputSummary: string;
  outputSummary: string;
  actionRequired: string;
  owner: string;
  deadline: string;
  evidence?: string;
  actor?: string;
  createdAt: string;
  requestId?: string;
}

export interface RiskClassification {
  high: Risk[];
  medium: Risk[];
  low: Risk[];
  total: number;
}

export interface ChecklistItem {
  id: string;
  category: RiskCategory;
  stage: RiskStage;
  question: string;
  riskSignal: string;
  linkedModule: LinkedModule;
}

export interface LifecycleStep {
  step: RiskWorkflowStep;
  status: RiskStatus;
  name: string;
  intent: string;
  input: string;
  output: string;
  requiredAction: string;
  exitCriteria: string;
  systemOutput: string;
}

export function calculateRiskScore(p: number, i: number): number {
  return p * i;
}

export function calculateRiskPriority(p: number, i: number, urgency = 3): number {
  return p * i * urgency;
}

export function getRiskLevel(score: number): "high" | "medium" | "low" {
  if (score >= 16) return "high";
  if (score >= 6) return "medium";
  return "low";
}

export function classifyRisks(risks: Risk[]): RiskClassification {
  const high: Risk[] = [];
  const medium: Risk[] = [];
  const low: Risk[] = [];

  for (const risk of risks) {
    const level = getRiskLevel(risk.piScore);
    if (level === "high") high.push(risk);
    else if (level === "medium") medium.push(risk);
    else low.push(risk);
  }

  return { high, medium, low, total: risks.length };
}

export function normalizeRiskScores<T extends Pick<Risk, "probability" | "impact" | "urgency">>(risk: T): Pick<Risk, "piScore" | "priorityScore"> {
  const piScore = calculateRiskScore(risk.probability, risk.impact);
  return {
    piScore,
    priorityScore: calculateRiskPriority(risk.probability, risk.impact, risk.urgency),
  };
}

export const statusLabels: Record<RiskStatus, string> = {
  identified: "已识别",
  analyzing: "分析中",
  "response-planned": "已制定应对",
  "response-implementing": "应对实施中",
  monitoring: "监督中",
  tracking: "跟踪中",
  resolved: "已解决",
  closed: "已关闭",
};

export const statusOrder: RiskStatus[] = [
  "identified",
  "analyzing",
  "response-planned",
  "response-implementing",
  "monitoring",
  "tracking",
  "resolved",
  "closed",
];

export const workflowStatusSequence: RiskStatus[] = [
  "identified",
  "analyzing",
  "response-planned",
  "response-implementing",
  "monitoring",
  "tracking",
  "resolved",
  "closed",
];

export const categoryLabels: Record<RiskCategory, string> = {
  商业: "商业风险",
  客户: "客户风险",
  供应商: "供应商风险",
  计划编制: "计划编制风险",
  组织管理: "组织和管理风险",
  开发实施环境: "开发/实施环境风险",
  过程: "过程风险",
  设计实现: "设计与实现风险",
  人员资源: "人员和资源风险",
  外部环境: "外部环境风险",
  产品: "产品风险",
  需求: "需求风险",
  技术: "技术风险",
  质量: "质量风险",
  合同: "合同风险",
  财务: "财务风险",
  进度: "进度风险",
  管理: "管理风险",
};

export const impactAreaLabels: Record<RiskImpactArea, string> = {
  范围: "范围",
  费用: "费用",
  工期: "工期",
  质量: "质量",
  组织: "组织",
  技术: "技术",
  合同: "合同",
  回款: "回款",
  客户: "客户",
  供应商: "供应商",
};

export const responseStrategyGuidance: Record<RiskStrategy, string> = {
  规避: "改变方案、范围或路径，消除风险触发条件。",
  缓解: "降低发生概率或影响程度，是项目风险最常用的处理方式。",
  转移: "通过合同、保险、外包或责任边界转移结果和责任。",
  接受: "影响可承受时建立应急储备，定期复核，不做高成本干预。",
  上报: "超出项目经理授权容差时，提交治理层决策和资源支持。",
};

export const riskLifecycleSteps: LifecycleStep[] = [
  {
    step: "identify",
    status: "identified",
    name: "识别风险",
    intent: "从阶段门、计划、项目事实、干系人和核查清单中发现不确定性。",
    input: "项目事实、阶段门检查项、飞书项目台账、会议纪要、质量/合同/进度异常信号。",
    output: "风险描述、来源、触发器、影响领域、关联模块。",
    requiredAction: "登记风险线索，指定初始责任人和下一步分析期限。",
    exitCriteria: "风险线索已进入登记册，描述清楚且有责任人。",
    systemOutput: "风险线索、来源、触发器、关联模块",
  },
  {
    step: "analyze",
    status: "analyzing",
    name: "分析风险",
    intent: "评估概率、影响、紧迫度和整体风险水平，形成优先级。",
    input: "风险描述、触发器、影响领域、历史数据、项目偏差和干系人反馈。",
    output: "P-I评分、紧迫度、优先级、风险等级和分析结论。",
    requiredAction: "完成概率/影响/紧迫度评估，确认是否需要上报。",
    exitCriteria: "风险等级与优先级已确认，分析证据可追溯。",
    systemOutput: "P-I矩阵、优先级、阶段/风险类型热区",
  },
  {
    step: "plan",
    status: "response-planned",
    name: "规划应对",
    intent: "明确规避、缓解、转移、接受或上报策略，并设定预防和应急动作。",
    input: "风险等级、优先级、容差、可用资源、合同约束和阶段目标。",
    output: "应对策略、预防措施、应急计划、责任人、deadline、关闭条件。",
    requiredAction: "补齐应对计划，明确责任人、到期日和关闭条件。",
    exitCriteria: "应对动作可执行，责任到人，期限明确。",
    systemOutput: "应对计划、责任人、到期日、关闭条件",
  },
  {
    step: "implement",
    status: "response-implementing",
    name: "实施应对",
    intent: "把风险应对动作落到执行、监控、质量、合同或资源模块。",
    input: "已批准的应对计划、责任人、deadline、所需资源和依赖模块。",
    output: "执行动作、过程证据、依赖模块处理结果和剩余阻塞。",
    requiredAction: "执行预防/应急动作，并把结果写回登记册。",
    exitCriteria: "应对动作已开始执行，有明确过程证据。",
    systemOutput: "行动项、跟踪方法、依赖模块",
  },
  {
    step: "supervise",
    status: "monitoring",
    name: "监督风险",
    intent: "检查风险条件、策略有效性、新风险和关闭证据。",
    input: "执行证据、最新项目指标、复核日期、触发器状态和风险趋势。",
    output: "复核结论、趋势判断、状态变化、升级/关闭建议。",
    requiredAction: "按复核周期检查触发条件和应对效果，必要时调整策略。",
    exitCriteria: "已形成复核结论，下一步处理路径明确。",
    systemOutput: "复核日期、状态变化、关闭/升级决策",
  },
  {
    step: "track",
    status: "tracking",
    name: "执行跟踪",
    intent: "持续跟踪责任人动作、deadline、证据和关闭条件，直到风险解决或关闭。",
    input: "复核结论、责任人反馈、deadline状态、完成证据和关闭条件。",
    output: "跟踪记录、逾期/升级事项、解决或关闭申请。",
    requiredAction: "跟踪责任人动作到完成，逾期时升级，满足条件后转解决/关闭。",
    exitCriteria: "风险已解决或关闭，证据完整，责任动作闭环。",
    systemOutput: "执行跟踪记录、逾期处理、关闭证据",
  },
];

export function getWorkflowStepForStatus(status: RiskStatus): LifecycleStep {
  if (status === "resolved" || status === "closed") {
    return riskLifecycleSteps[riskLifecycleSteps.length - 1];
  }
  return riskLifecycleSteps.find(step => step.status === status) ?? riskLifecycleSteps[0];
}

export function nextRiskStatus(status: RiskStatus): RiskStatus {
  const index = workflowStatusSequence.indexOf(status);
  if (index < 0 || index >= workflowStatusSequence.length - 1) return status;
  return workflowStatusSequence[index + 1];
}

export function statusToWorkflowStep(status: RiskStatus): RiskWorkflowStep {
  if (status === "resolved" || status === "closed") return "close";
  return getWorkflowStepForStatus(status).step;
}

export function buildWorkflowEvent(
  risk: Risk,
  toStatus: RiskStatus,
  event: Partial<Omit<RiskWorkflowEvent, "id" | "riskId" | "toStatus" | "createdAt">> = {},
): RiskWorkflowEvent {
  const step = getWorkflowStepForStatus(toStatus);
  const now = new Date().toISOString();
  return {
    id: `EVT-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    riskId: risk.id,
    riskCode: risk.riskCode,
    workflowStep: event.workflowStep ?? step.step,
    fromStatus: event.fromStatus ?? risk.status,
    toStatus,
    inputSummary: event.inputSummary || risk.currentInput || step.input,
    outputSummary: event.outputSummary || step.output,
    actionRequired: event.actionRequired || risk.lastAction || step.requiredAction,
    owner: event.owner || risk.actionOwner || risk.owner || "项目经理",
    deadline: event.deadline || risk.actionDeadline || risk.dueDate || risk.nextReviewDate,
    evidence: event.evidence || risk.evidence,
    actor: event.actor || "系统",
    createdAt: now,
  };
}

export const riskManagementRoles = [
  { role: "项目经理", responsibility: "建立风险管理计划，维护登记册，组织定期评审和应对闭环。" },
  { role: "项目组成员", responsibility: "参与识别和评估，按职责执行预防/应急行动。" },
  { role: "度量/PMO", responsibility: "度量风险数量、等级、趋势、关闭率和阶段门证据完整性。" },
  { role: "配置管理员", responsibility: "把风险计划、登记册、评审纪要和关闭证据纳入配置管理。" },
  { role: "高层/治理层", responsibility: "处理重大风险，审批超出项目容差的上报事项，提供资源。" },
];

export const stageGateRiskRequirements = [
  { stage: "立项", requirement: "形成初始风险登记册，识别商业、客户、合同、供应商和资源风险。" },
  { stage: "规划", requirement: "完成风险管理计划、P-I评估、应对策略、责任人和复核周期。" },
  { stage: "执行", requirement: "把高/中风险应对动作纳入任务、质量、资源和供应商协同。" },
  { stage: "监控", requirement: "按复核周期检查风险条件、趋势、偏差和新增风险，必要时上报例外。" },
  { stage: "验收", requirement: "聚焦验收、质量、客户决策、合同回款和遗留问题风险。" },
  { stage: "结项", requirement: "关闭风险或转为后续行动，沉淀复盘和组织过程资产。" },
];

export const riskChecklistItems: ChecklistItem[] = [
  { id: "CHK-PLAN-01", category: "计划编制", stage: "规划", question: "计划是否遗漏必要任务，或只依赖口头指令和不一致的资源定义？", riskSignal: "计划基准不可靠，后续进度预测失真", linkedModule: "规划" },
  { id: "CHK-PLAN-02", category: "计划编制", stage: "规划", question: "目标日期提前时，范围或资源是否同步调整？", riskSignal: "目标日期不现实，导致赶工和质量下降", linkedModule: "规划" },
  { id: "CHK-ORG-01", category: "组织管理", stage: "立项", question: "项目是否缺少经验丰富的项目经理或关键责任人？", riskSignal: "决策慢、计划失真、问题升级不及时", linkedModule: "资源" },
  { id: "CHK-ORG-02", category: "组织管理", stage: "执行", question: "管理层审查/决策周期是否比计划长？", riskSignal: "阶段门和客户决策延迟", linkedModule: "监控" },
  { id: "CHK-ENV-01", category: "开发实施环境", stage: "执行", question: "必要设备、环境、开发工具或测试环境是否及时到位？", riskSignal: "开发/实施无法按计划启动", linkedModule: "执行" },
  { id: "CHK-CUSTOMER-01", category: "客户", stage: "立项", question: "客户需求是否含糊、反复变化，且对交付期限要求不现实？", riskSignal: "范围蔓延、验收争议、回款受阻", linkedModule: "立项" },
  { id: "CHK-REQ-01", category: "需求", stage: "规划", question: "需求已经成为基准但仍在持续变化吗？", riskSignal: "需求基线不稳定，影响范围/进度/成本", linkedModule: "规划" },
  { id: "CHK-TECH-01", category: "技术", stage: "规划", question: "项目是否涉及未验证技术、陌生产品领域或复杂系统集成？", riskSignal: "设计实现和测试工作量不可控", linkedModule: "质量" },
  { id: "CHK-QUALITY-01", category: "质量", stage: "执行", question: "前期质量保证活动是否真实有效，重要成果是否经过评审？", riskSignal: "后期返工、缺陷堆积、验收延期", linkedModule: "质量" },
  { id: "CHK-SUPPLIER-01", category: "供应商", stage: "执行", question: "供应商能否按时交付质量合格的组件、服务或证明材料？", riskSignal: "外部依赖阻塞关键路径", linkedModule: "合同回款" },
  { id: "CHK-CONTRACT-01", category: "合同", stage: "监控", question: "合同边界、付款条件、验收责任和变更条款是否清楚？", riskSignal: "交付争议、回款延迟、责任不清", linkedModule: "合同回款" },
  { id: "CHK-CLOSE-01", category: "客户", stage: "验收", question: "最终用户或客户决策组是否迟迟不确认验收标准和结果？", riskSignal: "项目无法收尾，尾款和归档受阻", linkedModule: "收尾" },
];

export const overallRiskDimensions: RiskImpactArea[] = ["范围", "费用", "工期", "质量", "组织", "技术"];

export const initialRisks: Risk[] = [
  {
    id: "R001",
    projectName: "智慧校园一期",
    description: "关键开发人员离职或被抽调，导致核心模块进度和知识连续性受影响",
    category: "人员资源",
    stage: "执行",
    source: "项目风险核查表 / 组织和管理",
    impactArea: "组织",
    probability: 4,
    impact: 5,
    urgency: 4,
    piScore: 20,
    priorityScore: 80,
    status: "tracking",
    responseStrategyType: "缓解",
    responseStrategy: "建立关键知识文档、交叉培训和备份负责人，核心任务按周复核。",
    preventiveAction: "关键模块双人备份，关键接口和部署流程纳入知识库。",
    contingencyPlan: "若核心人员离岗，启动备份负责人接管并调整非关键任务资源。",
    trigger: "核心人员请假/离岗超过3个工作日，或关键任务连续两周未达成。",
    trackingMethod: "周会检查关键任务完成率和备份交接清单。",
    owner: "项目经理",
    dueDate: "2026-07-10",
    nextReviewDate: "2026-07-03",
    closingCriteria: "关键模块完成评审，备份人员可独立完成部署和故障处理。",
    linkedModule: "执行",
    evidence: "人员和资源风险：核心人员辞职、调动会影响连续性。",
    createdAt: "2026-04-01",
  },
  {
    id: "R002",
    projectName: "质量监测平台",
    description: "客户决策组对原型和规格审核周期长，导致需求冻结和验收节点后移",
    category: "客户",
    stage: "规划",
    source: "风险种类和识别清单 / 客户决策组",
    impactArea: "工期",
    probability: 3,
    impact: 4,
    urgency: 4,
    piScore: 12,
    priorityScore: 48,
    status: "response-planned",
    responseStrategyType: "缓解",
    responseStrategy: "建立客户评审日历、默认确认规则和升级路径。",
    preventiveAction: "在计划中锁定每轮评审输入/输出和确认人。",
    contingencyPlan: "若客户逾期确认，提交阶段例外并冻结不影响主链路的需求。",
    trigger: "任一评审材料超过5个工作日未反馈。",
    trackingMethod: "每周跟踪客户评审状态和决策阻塞项。",
    owner: "客户成功负责人",
    dueDate: "2026-07-15",
    nextReviewDate: "2026-07-02",
    closingCriteria: "核心需求、原型、验收标准均取得客户书面确认。",
    linkedModule: "规划",
    evidence: "客户决策组审核/答复时间比预期长会导致进度计划延长。",
    createdAt: "2026-04-15",
  },
  {
    id: "R003",
    projectName: "智慧作业区域平台",
    description: "合同回款节点与验收证据不匹配，尾款存在逾期风险",
    category: "合同",
    stage: "监控",
    source: "飞书项目台账 / 回款分组",
    impactArea: "回款",
    probability: 4,
    impact: 4,
    urgency: 5,
    piScore: 16,
    priorityScore: 80,
    status: "tracking",
    responseStrategyType: "上报",
    responseStrategy: "同步验收证据、付款条件和客户确认记录，必要时进入PMO治理例会。",
    preventiveAction: "所有验收项在执行阶段就绑定回款节点和证明材料。",
    contingencyPlan: "若尾款逾期，启动商务、交付、客户成功联合催收机制。",
    trigger: "应收金额超过100万且到期前7天仍缺验收/付款确认。",
    trackingMethod: "监控中心和项目组合看板每周检查应收、风险趋势和验收状态。",
    owner: "商务负责人",
    dueDate: "2026-07-30",
    nextReviewDate: "2026-07-05",
    closingCriteria: "尾款回收或形成经批准的收款计划。",
    linkedModule: "合同回款",
    evidence: "客户/合同风险会影响验收、回款和收尾闭环。",
    createdAt: "2026-04-20",
  },
  {
    id: "R004",
    projectName: "区域数据治理项目",
    description: "测试和质量保证不足，前期缺陷延迟暴露，可能造成返工和验收延期",
    category: "质量",
    stage: "执行",
    source: "项目风险核查表 / 综合技术开发能力",
    impactArea: "质量",
    probability: 3,
    impact: 4,
    urgency: 3,
    piScore: 12,
    priorityScore: 36,
    status: "analyzing",
    responseStrategyType: "缓解",
    responseStrategy: "补充评审、测试计划和缺陷趋势跟踪，关键交付物必须有质量证据。",
    preventiveAction: "需求、设计、核心代码和测试报告进入同行评审。",
    contingencyPlan: "若缺陷密度超过阈值，暂停新增范围，优先修复关键缺陷。",
    trigger: "关键缺陷连续两周未下降，或测试通过率低于80%。",
    trackingMethod: "质量模块每周输出缺陷趋势和评审完成率。",
    owner: "质量负责人",
    dueDate: "2026-07-20",
    nextReviewDate: "2026-07-04",
    closingCriteria: "核心场景测试通过，严重缺陷清零，验收证据齐套。",
    linkedModule: "质量",
    evidence: "前期质量保证不真实会导致后期重复工作。",
    createdAt: "2026-04-25",
  },
];

export function getRiskColor(score: number): { bg: string; border: string; text: string } {
  const level = getRiskLevel(score);
  if (level === "high") return { bg: "rgba(239,68,68,0.15)", border: "#ef4444", text: "#ef4444" };
  if (level === "medium") return { bg: "rgba(245,158,11,0.15)", border: "#f59e0b", text: "#f59e0b" };
  return { bg: "rgba(34,197,94,0.15)", border: "#22c55e", text: "#22c55e" };
}

export function generateMatrixGrid(risks: Risk[]): Record<string, Risk[]> {
  const grid: Record<string, Risk[]> = {};
  for (let p = 5; p >= 1; p--) {
    for (let i = 5; i >= 1; i--) {
      const key = `${p}-${i}`;
      grid[key] = risks.filter(r => r.probability === p && r.impact === i);
    }
  }
  return grid;
}
