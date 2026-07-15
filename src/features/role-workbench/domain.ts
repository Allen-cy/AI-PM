import type { BusinessRole } from "../operating-model/context.ts";

export type PrimaryWorkbenchRole = Extract<BusinessRole, "pm" | "operations" | "pmo" | "ceo">;
export type WorkbenchDataClass = "production" | "sample" | "test" | "diagnostic" | "unclassified";

export interface RoleWorkbenchProject {
  id: string;
  name: string;
  projectLevel: string | null;
  progress: number;
  status: string;
  health: string;
  benefitForecast: number;
  cashForecast: number;
}

export interface RoleWorkbenchTask {
  id: string;
  projectId: string;
  title: string;
  status: string;
  dueAt: string | null;
  ownerUserId: string | null;
  critical: boolean;
}

export interface RoleWorkbenchMilestone {
  id: string;
  projectId: string;
  title: string;
  status: string;
  dueAt: string | null;
}

export interface RoleWorkbenchRisk {
  id: string;
  projectId: string;
  title: string;
  status: string;
  severity: string;
  ownerUserId: string | null;
  dueAt: string | null;
}

export interface RoleWorkbenchAction {
  id: string;
  projectId: string;
  title: string;
  status: string;
  priority: string;
  ownerUserId: string | null;
  reviewerUserId: string | null;
  dueAt: string | null;
}

export interface RoleWorkbenchCommercialItem {
  id: string;
  projectId: string;
  type: "contract" | "acceptance" | "invoice" | "receivable" | "payment" | "cost";
  status: string;
  amount: number;
  dueAt: string | null;
}

export interface RoleWorkbenchQualityItem {
  id: string;
  projectId: string;
  title: string;
  status: string;
  severity: string;
  dueAt: string | null;
}

export interface RoleWorkbenchGovernanceItem {
  id: string;
  projectId: string | null;
  type: "management_signal" | "data_quality" | "capacity_conflict" | "project_dependency" | "governance_action" | "joint_check";
  title: string;
  status: string;
  severity: string;
  dueAt: string | null;
}

export interface RoleWorkbenchDecision {
  id: string;
  projectId: string | null;
  title: string;
  status: string;
  requestedDecisionAt: string | null;
}

export interface RoleWorkbenchFormalOutput {
  id: string;
  projectId: string | null;
  title: string;
  outputType: string;
  status: string;
  generatedAt: string;
}

export interface RoleWorkbenchInput {
  role: PrimaryWorkbenchRole;
  actorUserId: string;
  generatedAt: string;
  projects: RoleWorkbenchProject[];
  tasks: RoleWorkbenchTask[];
  milestones: RoleWorkbenchMilestone[];
  risks: RoleWorkbenchRisk[];
  actions: RoleWorkbenchAction[];
  commercial: RoleWorkbenchCommercialItem[];
  quality: RoleWorkbenchQualityItem[];
  governance: RoleWorkbenchGovernanceItem[];
  decisions: RoleWorkbenchDecision[];
  formalOutputs: RoleWorkbenchFormalOutput[];
}

export interface RoleWorkbench {
  role: PrimaryWorkbenchRole;
  title: string;
  promise: string;
  focus: string[];
  generatedAt: string;
  sections: {
    projects: RoleWorkbenchProject[];
    todayActions: Array<RoleWorkbenchTask | RoleWorkbenchRisk | RoleWorkbenchAction>;
    criticalPath: RoleWorkbenchTask[];
    milestones: RoleWorkbenchMilestone[];
    risks: RoleWorkbenchRisk[];
    formalOutputs: RoleWorkbenchFormalOutput[];
    commercialFlow: RoleWorkbenchCommercialItem[];
    qualityAndAcceptance: RoleWorkbenchQualityItem[];
    exceptionPool: Array<RoleWorkbenchGovernanceItem | RoleWorkbenchRisk | RoleWorkbenchQualityItem>;
    decisionInbox: RoleWorkbenchDecision[];
  };
  executiveSummary: {
    strategicProjects: number;
    redProjects: number;
    cashForecast: number;
    benefitForecast: number;
    majorRisks: number;
    pendingDecisions: number;
  };
}

const ROLE_META: Record<PrimaryWorkbenchRole, { title: string; promise: string; focus: string[] }> = {
  pm: {
    title: "项目经理工作台",
    promise: "只填写变化，集中处理我的项目、关键路径、里程碑、风险、交付与正式汇报。",
    focus: ["今日行动", "关键路径", "里程碑", "重大风险", "正式汇报"],
  },
  operations: {
    title: "运营工作台",
    promise: "围绕验收、开票、应收、回款和现金，把阻塞、责任人、证据与关闭结果放在一条链上。",
    focus: ["验收", "开票", "应收", "回款", "现金与收益"],
  },
  pmo: {
    title: "PMO治理工作台",
    promise: "只运营例外，通过红黄灯、数据质量、资源冲突、治理SLA、会议与决策包推动组合闭环。",
    focus: ["组合例外", "数据质量", "资源冲突", "治理SLA", "决策包"],
  },
  ceo: {
    title: "CEO经营决策摘要",
    promise: "一页看到战略项目、现金、收益、重大风险和待决策事项，并持续查看执行回执与效果。",
    focus: ["战略项目", "现金", "收益", "重大风险", "待决策"],
  },
};

const OPEN = new Set(["open", "identified", "monitoring", "tracking", "assigned", "accepted", "in_progress", "evidence_submitted", "submitted", "pending", "blocked", "overdue", "未完成", "进行中"]);

function isOpen(status: string): boolean {
  const normalized = status.trim().toLowerCase();
  return OPEN.has(normalized) || !["closed", "done", "completed", "cancelled", "resolved", "已完成", "已关闭"].includes(normalized);
}

function dueSort<T extends { dueAt: string | null }>(items: T[]): T[] {
  return [...items].sort((a, b) => String(a.dueAt || "9999").localeCompare(String(b.dueAt || "9999")));
}

export function buildRoleWorkbench(input: RoleWorkbenchInput): RoleWorkbench {
  const meta = ROLE_META[input.role];
  const myTasks = input.tasks.filter(item => item.ownerUserId === input.actorUserId && isOpen(item.status));
  const myRisks = input.risks.filter(item => item.ownerUserId === input.actorUserId && isOpen(item.status));
  const myActions = input.actions.filter(item => (item.ownerUserId === input.actorUserId || item.reviewerUserId === input.actorUserId) && isOpen(item.status));
  const todayActions = dueSort([...myTasks, ...myRisks, ...myActions]);
  const exceptionPool = dueSort([
    ...input.governance.filter(item => isOpen(item.status)),
    ...input.risks.filter(item => isOpen(item.status) && ["high", "critical", "高", "重大"].includes(item.severity)),
    ...input.quality.filter(item => isOpen(item.status) && ["high", "critical", "高", "重大"].includes(item.severity)),
  ]);
  const strategic = input.projects.filter(project => ["S", "A", "重点", "战略"].includes(project.projectLevel || ""));
  const decisions = dueSort(input.decisions.filter(item => isOpen(item.status)).map(item => ({ ...item, dueAt: item.requestedDecisionAt }))).map(({ dueAt: _dueAt, ...item }) => item);

  return {
    role: input.role,
    title: meta.title,
    promise: meta.promise,
    focus: meta.focus,
    generatedAt: input.generatedAt,
    sections: {
      projects: input.projects,
      todayActions,
      criticalPath: dueSort(input.tasks.filter(item => item.critical && isOpen(item.status))),
      milestones: dueSort(input.milestones.filter(item => isOpen(item.status))),
      risks: dueSort(input.risks.filter(item => isOpen(item.status))),
      formalOutputs: [...input.formalOutputs].sort((a, b) => b.generatedAt.localeCompare(a.generatedAt)),
      commercialFlow: dueSort(input.commercial.filter(item => isOpen(item.status))),
      qualityAndAcceptance: dueSort(input.quality.filter(item => isOpen(item.status))),
      exceptionPool,
      decisionInbox: decisions,
    },
    executiveSummary: {
      strategicProjects: strategic.length,
      redProjects: input.projects.filter(project => ["red", "critical", "红", "红灯"].includes(project.health)).length,
      cashForecast: strategic.reduce((sum, project) => sum + project.cashForecast, 0),
      benefitForecast: strategic.reduce((sum, project) => sum + project.benefitForecast, 0),
      majorRisks: input.risks.filter(item => isOpen(item.status) && ["high", "critical", "高", "重大"].includes(item.severity)).length,
      pendingDecisions: decisions.length,
    },
  };
}
