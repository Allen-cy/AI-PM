import type { DashboardData } from "./dashboard/types.ts";

export type HealthStatus = "ok" | "warning" | "error" | "unknown";

export interface OperatingDependency {
  key: string;
  name: string;
  category: "data" | "ai" | "knowledge" | "storage";
  description: string;
  owner: string;
  action: string;
}

export interface DataQualityRule {
  id: string;
  name: string;
  scope: string;
  severity: "high" | "medium" | "low";
  description: string;
  nextAction: string;
}

export interface GovernanceWorkflow {
  id: string;
  name: string;
  stage: string;
  owner: string;
  approver: string;
  trigger: string;
  inputs: string[];
  outputs: string[];
  states: string[];
  deadlineRule: string;
  auditTrail: string;
}

export interface WorkbenchAction {
  id: string;
  priority: "P0" | "P1" | "P2";
  title: string;
  owner: "项目经理" | "PMO" | "管理层";
  due: string;
  source: string;
  action: string;
}

export interface WorkbenchSummary {
  kpis: Array<{ label: string; value: string; hint: string; status: HealthStatus }>;
  actions: WorkbenchAction[];
  keyProjects: Array<{ name: string; status: string; progress: string; risk: string; next: string }>;
  aiSuggestions: Array<{ title: string; basis: string; confirmation: string }>;
}

export const operatingDependencies: OperatingDependency[] = [
  {
    key: "feishu",
    name: "飞书项目台账",
    category: "data",
    description: "项目、风险、合同、回款、任务等实时业务数据源。",
    owner: "PMO/管理员",
    action: "检查应用权限、Base Token、表ID和字段映射。",
  },
  {
    key: "supabase",
    name: "Supabase 业务库",
    category: "storage",
    description: "用户、审批、风险闭环、治理流程和审计数据的持久化底座。",
    owner: "管理员",
    action: "检查 URL、Service Role、表结构和 RLS 策略。",
  },
  {
    key: "ai-model",
    name: "AI 模型路由",
    category: "ai",
    description: "商业论证、风险扫描、状态摘要、报告生成等智能能力。",
    owner: "用户/管理员",
    action: "检查当前模型、配置来源和用户自定义模型设置。",
  },
  {
    key: "rag",
    name: "RAG 知识库",
    category: "knowledge",
    description: "项目管理方法论、模板和最佳实践问答依据。",
    owner: "PMO",
    action: "检查索引版本、语料数量、检索模式和引用质量。",
  },
];

export const dataQualityRules: DataQualityRule[] = [
  {
    id: "missing-owner",
    name: "项目责任人缺失",
    scope: "项目台账",
    severity: "high",
    description: "项目没有项目经理或责任人时，无法形成任务、风险和审批闭环。",
    nextAction: "在飞书项目台账补充项目经理/责任人字段。",
  },
  {
    id: "missing-deadline",
    name: "关键截止日期缺失",
    scope: "里程碑/任务/风险",
    severity: "high",
    description: "没有 deadline 的事项无法进入今日待办和超期预警。",
    nextAction: "补齐计划完成、风险复核日期、行动项截止日期。",
  },
  {
    id: "invalid-status",
    name: "状态口径不一致",
    scope: "项目台账/风险/任务",
    severity: "medium",
    description: "状态字段不统一会导致看板和工作台统计失真。",
    nextAction: "统一状态枚举，如待立项、进行中、已暂停、已关闭。",
  },
  {
    id: "finance-mismatch",
    name: "合同与回款口径不一致",
    scope: "合同/回款",
    severity: "medium",
    description: "合同额、已回款、应收金额不一致会影响经营看板。",
    nextAction: "检查合同金额、回款金额、应收金额和到期日。",
  },
  {
    id: "risk-without-action",
    name: "高风险缺少应对动作",
    scope: "风险登记册",
    severity: "high",
    description: "高风险如果没有责任人、应对措施和复核日期，无法闭环。",
    nextAction: "为高风险补充责任人、应对策略、触发条件和复核日期。",
  },
];

export const governanceWorkflows: GovernanceWorkflow[] = [
  {
    id: "project-initiation-review",
    name: "项目立项评审",
    stage: "启动阶段",
    owner: "项目经理",
    approver: "PMO/业务负责人",
    trigger: "新项目进入正式立项前。",
    inputs: ["商业论证", "项目申请信息", "预算/收益假设", "关键干系人"],
    outputs: ["立项评审结论", "项目章程草案", "是否进入启动阶段"],
    states: ["待提交", "待评审", "需补充", "已通过", "已驳回"],
    deadlineRule: "提交后 3 个工作日内完成评审。",
    auditTrail: "记录提交人、评审人、意见、结论和版本。",
  },
  {
    id: "stage-gate-review",
    name: "阶段门评审",
    stage: "全生命周期",
    owner: "项目经理",
    approver: "PMO/项目委员会",
    trigger: "项目进入下一阶段前。",
    inputs: ["阶段成果", "进度/成本/质量数据", "风险问题清单", "下一阶段计划"],
    outputs: ["阶段门结论", "整改行动项", "下一阶段授权"],
    states: ["待准备", "待评审", "有条件通过", "已通过", "暂停"],
    deadlineRule: "计划阶段结束前至少 2 个工作日发起。",
    auditTrail: "记录阶段基线、评审证据、整改项和关闭记录。",
  },
  {
    id: "change-control",
    name: "变更评审",
    stage: "执行/监控阶段",
    owner: "项目经理",
    approver: "变更控制委员会/PMO",
    trigger: "范围、成本、进度、质量或合同口径发生变化。",
    inputs: ["变更原因", "影响分析", "备选方案", "客户/业务确认"],
    outputs: ["变更审批结论", "更新后的基线", "行动项"],
    states: ["待申请", "影响分析中", "待审批", "已批准", "已拒绝", "已实施"],
    deadlineRule: "重大变更 5 个工作日内完成审批。",
    auditTrail: "记录变更前后基线、审批意见和实施证据。",
  },
  {
    id: "risk-escalation",
    name: "风险升级评审",
    stage: "监控阶段",
    owner: "风险责任人",
    approver: "PMO/项目负责人",
    trigger: "高风险、风险恶化或触发条件出现。",
    inputs: ["风险登记记录", "触发证据", "影响评估", "应对建议"],
    outputs: ["升级结论", "应急计划", "责任人和 deadline"],
    states: ["已识别", "待升级", "已升级", "应对中", "已关闭"],
    deadlineRule: "高风险触发后 1 个工作日内升级。",
    auditTrail: "记录风险状态、应对动作、复核结果和关闭依据。",
  },
  {
    id: "project-closure",
    name: "项目收尾验收",
    stage: "收尾阶段",
    owner: "项目经理",
    approver: "客户/业务负责人/PMO",
    trigger: "项目交付完成并准备验收归档。",
    inputs: ["验收材料", "合同/回款状态", "遗留问题", "经验教训"],
    outputs: ["验收结论", "归档清单", "复盘报告", "回款跟进事项"],
    states: ["待验收", "验收中", "需整改", "已验收", "已归档"],
    deadlineRule: "交付完成后 5 个工作日内发起验收。",
    auditTrail: "记录验收意见、整改记录、归档材料和复盘结论。",
  },
];

export function statusLabel(status: HealthStatus): string {
  if (status === "ok") return "正常";
  if (status === "warning") return "需关注";
  if (status === "error") return "异常";
  return "待检查";
}

export function deriveWorkbenchSummary(data: DashboardData | null): WorkbenchSummary {
  if (!data) {
    return {
      kpis: [
        { label: "项目数据", value: "待连接", hint: "登录后从飞书项目台账读取。", status: "unknown" },
        { label: "今日待办", value: "待生成", hint: "需要项目、任务、风险和回款数据。", status: "unknown" },
        { label: "重点风险", value: "待扫描", hint: "连接风险登记册后生成。", status: "unknown" },
        { label: "经营提醒", value: "待同步", hint: "连接合同与回款表后生成。", status: "unknown" },
      ],
      actions: [
        {
          id: "connect-feishu",
          priority: "P0",
          title: "完成飞书项目台账连接与字段映射检查",
          owner: "PMO",
          due: "今天",
          source: "系统配置",
          action: "进入数据与集成中心，检查飞书连接和数据质量。",
        },
      ],
      keyProjects: [],
      aiSuggestions: [
        {
          title: "先完成数据底座检查，再启用自动工作台",
          basis: "当前没有可用项目台账数据，系统不能可靠生成今日事项。",
          confirmation: "需要管理员或 PMO 确认飞书连接、字段映射和权限。",
        },
      ],
    };
  }

  const highRiskProjects = data.riskProjects.filter(project => project.severity === "高");
  const overdueOrDuePayments = data.upcomingPayments.filter(payment => payment.daysLeft <= 7);
  const keyProjects = data.keyProjects.slice(0, 5).map(project => ({
    name: project.name,
    status: project.status,
    progress: `执行${project.executionProgress}% / 监控${project.monitoringProgress}% / 收尾${project.closingProgress}%`,
    risk: `${project.riskLevel}风险 · ${project.riskType}`,
    next: project.dependencyNote,
  }));

  const actions: WorkbenchAction[] = [];
  if (highRiskProjects.length > 0) {
    actions.push({
      id: "review-high-risks",
      priority: "P0",
      title: `复核 ${highRiskProjects.length} 个高风险项目`,
      owner: "项目经理",
      due: "今天",
      source: "风险登记册/项目台账",
      action: "进入风险管理，补齐责任人、应对动作和复核日期。",
    });
  }
  if (overdueOrDuePayments.length > 0) {
    actions.push({
      id: "review-payments",
      priority: "P1",
      title: `跟进 ${overdueOrDuePayments.length} 个临近或逾期回款节点`,
      owner: "项目经理",
      due: "本周",
      source: "合同与回款表",
      action: "确认验收状态、付款条件和客户侧阻塞点。",
    });
  }
  if (data.keyProjects.length > 0) {
    actions.push({
      id: "review-key-project-chain",
      priority: "P1",
      title: "复核重点项目执行-监控-收尾进度链",
      owner: "PMO",
      due: "本周例会前",
      source: "项目组合看板",
      action: "检查重点项目是否存在阶段进度断点和依赖阻塞。",
    });
  }
  if (actions.length === 0) {
    actions.push({
      id: "weekly-health-review",
      priority: "P2",
      title: "完成本周项目组合健康复核",
      owner: "PMO",
      due: "本周",
      source: "项目组合看板",
      action: "抽查项目状态、风险、回款和阶段门一致性。",
    });
  }

  return {
    kpis: [
      { label: "项目总数", value: String(data.kpi.totalProjects), hint: data.source.name, status: "ok" },
      { label: "重点项目", value: String(data.keyProjects.length), hint: "按重点标记和风险规则识别。", status: data.keyProjects.length > 0 ? "warning" : "ok" },
      { label: "高风险项目", value: String(highRiskProjects.length), hint: "需要复核应对动作。", status: highRiskProjects.length > 0 ? "error" : "ok" },
      { label: "应收金额", value: `${data.kpi.receivable.toFixed(2)} 万`, hint: "来自项目台账经营字段。", status: data.kpi.receivable > 0 ? "warning" : "ok" },
    ],
    actions,
    keyProjects,
    aiSuggestions: [
      {
        title: highRiskProjects.length > 0 ? "优先处理高风险项目，再推进常规周报" : "本周重点放在阶段门和经营数据一致性复核",
        basis: `依据项目${data.kpi.totalProjects}个、重点项目${data.keyProjects.length}个、高风险项目${highRiskProjects.length}个、应收${data.kpi.receivable.toFixed(2)}万。`,
        confirmation: "AI 建议仅作为排序依据，项目经理/PMO 需确认真实阻塞和责任人。",
      },
      {
        title: overdueOrDuePayments.length > 0 ? "回款节点需要与验收状态联动跟进" : "保持合同、回款和验收字段同步",
        basis: `近期回款提醒${overdueOrDuePayments.length}项，回款率${data.kpi.collectionRate.toFixed(1)}%。`,
        confirmation: "需要人工确认客户侧付款条件、验收材料和合同条款。",
      },
    ],
  };
}
