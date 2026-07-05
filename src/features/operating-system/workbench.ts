import { buildDashboardData, normalizeProjectRows } from "../dashboard/normalizer.ts";
import type { DashboardData } from "../dashboard/types.ts";
import { FeishuBaseClient } from "../feishu/client.ts";
import type { FeishuConfig } from "../feishu/config.ts";
import { deriveWorkbenchSummary, type HealthStatus, type WorkbenchSummary } from "../pmo-operating-system.ts";
import {
  buildRiskRetrospectiveGovernanceFollowupWorkbench,
  type RiskRetrospectiveGovernanceFollowupRecord,
  type RiskRetrospectiveGovernanceFollowupWorkbench,
} from "../risk/retrospective-governance-followup-workbench.ts";
import { buildRiskIntegrationDashboard, type RiskIntegrationDashboard } from "../risk/integration.ts";
import { recordMatchesProjectGrant, type ProjectAccessGrant } from "../security/authorization.ts";
import type { Risk, RiskImpactArea } from "../../lib/risk.ts";

export interface WorkbenchUser {
  id?: string;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  role?: "admin" | "user";
}

export interface MyWorkbenchProject {
  id: string;
  name: string;
  owner: string;
  status: string;
  stage: string;
  progress: number;
  health: HealthStatus;
  riskLevel: string;
  nextMilestone: string;
  source: string;
}

export interface MyWorkbenchRisk {
  id: string;
  projectName: string;
  description: string;
  severity: "高" | "中" | "低";
  status: string;
  owner: string;
  dueDate: string;
  nextAction: string;
  source: string;
}

export interface MyWorkbenchTodo {
  id: string;
  type: "任务" | "里程碑" | "风险复核";
  title: string;
  projectName: string;
  owner: string;
  dueDate: string;
  daysLeft: number | null;
  status: string;
  priority: "P0" | "P1" | "P2";
  source: string;
  action: string;
}

export interface MyBusinessReminder {
  id: string;
  projectName: string;
  customer: string;
  amount: number;
  dueDate: string;
  daysLeft: number | null;
  status: string;
  source: string;
  action: string;
}

export interface WorkbenchEvidence {
  source: "feishu" | "sample" | "missing";
  generatedAt: string;
  userScope: "admin-all" | "matched-owner" | "authorized-project" | "unmatched-owner" | "anonymous";
  matchedBy: string[];
  scanned: {
    projects: number;
    risks: number;
    tasks: number;
    milestones: number;
    payments: number;
  };
  included: {
    projects: number;
    risks: number;
    todos: number;
    businessReminders: number;
  };
}

export interface OperationalWorkbench extends WorkbenchSummary {
  myProjects: MyWorkbenchProject[];
  myRisks: MyWorkbenchRisk[];
  todayTodos: MyWorkbenchTodo[];
  businessReminders: MyBusinessReminder[];
  riskIntegration: RiskIntegrationDashboard;
  riskRetrospectiveGovernanceFollowups: RiskRetrospectiveGovernanceFollowupWorkbench;
  evidence: WorkbenchEvidence;
}

type RawRecord = Record<string, unknown>;

const COMPLETE_STATUS_KEYWORDS = ["已完成", "完成", "已关闭", "关闭", "已结项", "结项", "closed", "done", "completed"];
const ACTIVE_RISK_STATUS_KEYWORDS = ["已识别", "分析", "应对", "监控", "跟踪", "升级", "identified", "analyzing", "response", "monitoring", "tracking"];
const PRIORITY_SCORE: Record<"P0" | "P1" | "P2", number> = { P0: 3, P1: 2, P2: 1 };

function scalar(value: unknown): unknown {
  if (Array.isArray(value)) {
    const first = value[0];
    if (typeof first === "object" && first !== null && "text" in first) return (first as { text: unknown }).text;
    if (typeof first === "object" && first !== null && "name" in first) return (first as { name: unknown }).name;
    return first;
  }
  return value;
}

export function normalizeWorkbenchFields(fields: RawRecord): RawRecord {
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, scalar(value)]));
}

function text(record: RawRecord, names: string[], fallback = ""): string {
  for (const name of names) {
    const raw = record[name];
    if (raw !== undefined && raw !== null && raw !== "") return String(raw).trim();
  }
  return fallback;
}

function numeric(record: RawRecord, names: string[], fallback = 0): number {
  for (const name of names) {
    const raw = record[name];
    if (typeof raw === "number" && Number.isFinite(raw)) return raw;
    if (typeof raw === "string" && raw.trim()) {
      const parsed = Number(raw.replace(/[,%￥¥万\s]/g, ""));
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function parseDateLike(raw: unknown): Date | null {
  if (!raw) return null;
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) return raw;
  const textValue = String(raw).trim();
  if (!textValue) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(textValue)) {
    const parsed = new Date(`${textValue}T00:00:00+08:00`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (/^\d{8}$/.test(textValue)) {
    const parsed = new Date(`${textValue.slice(0, 4)}-${textValue.slice(4, 6)}-${textValue.slice(6, 8)}T00:00:00+08:00`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  const numericValue = typeof raw === "number" ? raw : /^\d+$/.test(textValue) ? Number(textValue) : null;
  if (numericValue !== null && Number.isFinite(numericValue)) {
    if (numericValue > 1_000_000_000_000) {
      const parsed = new Date(numericValue);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }
    if (numericValue > 1_000_000_000) {
      const parsed = new Date(numericValue * 1000);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }
    if (numericValue > 20_000 && numericValue < 80_000) {
      const parsed = new Date(Math.round((numericValue - 25569) * 86_400_000));
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }
  }
  const parsed = new Date(textValue);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function dateText(record: RawRecord, names: string[]): string {
  for (const name of names) {
    const raw = record[name];
    const parsed = parseDateLike(raw);
    if (parsed) return parsed.toISOString().slice(0, 10);
    if (raw !== undefined && raw !== null && raw !== "") return String(raw);
  }
  return "未设定";
}

function daysLeftFromDate(value: string): number | null {
  const parsed = parseDateLike(value);
  if (!parsed) return null;
  const today = new Date();
  const todayChina = new Date(`${today.toLocaleDateString("sv-SE", { timeZone: "Asia/Shanghai" })}T00:00:00+08:00`);
  return Math.ceil((parsed.getTime() - todayChina.getTime()) / 86_400_000);
}

function statusComplete(status: string): boolean {
  const normalized = status.toLowerCase();
  return COMPLETE_STATUS_KEYWORDS.some(keyword => normalized.includes(keyword.toLowerCase()));
}

function activeRiskStatus(status: string): boolean {
  if (!status) return true;
  if (statusComplete(status)) return false;
  const normalized = status.toLowerCase();
  return ACTIVE_RISK_STATUS_KEYWORDS.some(keyword => normalized.includes(keyword.toLowerCase())) || !statusComplete(status);
}

function userTokens(user?: WorkbenchUser | null): string[] {
  return [user?.name, user?.email, user?.phone]
    .map(value => value?.trim())
    .filter((value): value is string => Boolean(value));
}

function includesAnyToken(value: string, tokens: string[]): boolean {
  const normalized = value.replace(/\s/g, "").toLowerCase();
  return tokens.some(token => normalized.includes(token.replace(/\s/g, "").toLowerCase()));
}

function ownerText(record: RawRecord): string {
  return text(record, ["项目经理", "项目负责人", "责任人", "Owner", "owner", "任务负责人", "风险责任人", "负责人"], "未指定");
}

function recordMatchesUser(record: RawRecord, user?: WorkbenchUser | null): boolean {
  if (!user) return false;
  if (user.role === "admin") return true;
  const tokens = userTokens(user);
  if (tokens.length === 0) return false;
  return includesAnyToken(ownerText(record), tokens);
}

function recordMatchesGrant(record: RawRecord, grants: ProjectAccessGrant[] = []): boolean {
  return recordMatchesProjectGrant(record, grants);
}

function priorityByDue(daysLeft: number | null, fallback: "P0" | "P1" | "P2" = "P2"): "P0" | "P1" | "P2" {
  if (daysLeft !== null && daysLeft < 0) return "P0";
  if (daysLeft !== null && daysLeft <= 1) return "P0";
  if (daysLeft !== null && daysLeft <= 7) return "P1";
  return fallback;
}

function severityFromValue(value: string | number): "高" | "中" | "低" {
  if (typeof value === "number") {
    if (value >= 12) return "高";
    if (value >= 6) return "中";
    return "低";
  }
  if (value.includes("高")) return "高";
  if (value.includes("中")) return "中";
  return "低";
}

function projectName(record: RawRecord, fallback = "未命名项目"): string {
  return text(record, ["项目名称", "项目", "商机项目名称", "合同名称"], fallback);
}

function buildDashboardFromRecords(projects: RawRecord[]): DashboardData | null {
  const rows = normalizeProjectRows(projects);
  if (rows.length === 0) return null;
  return buildDashboardData(rows, {
    type: "feishu",
    name: "飞书智能表",
    note: `工作台实时读取项目台账 ${projects.length} 条。`,
  });
}

function mapProject(record: RawRecord, index: number): MyWorkbenchProject {
  const progressRaw = numeric(record, ["当前进度", "完成度", "完成进度"], 0);
  const progress = clamp(Math.round(progressRaw > 1 ? progressRaw : progressRaw * 100), 0, 100);
  const riskLevel = text(record, ["风险等级", "严重度"], "低");
  const health: HealthStatus = riskLevel === "高" || progress < 50 ? "error" : riskLevel === "中" || progress < 80 ? "warning" : "ok";
  return {
    id: text(record, ["项目编号", "project_id", "OA单据编号"], `project-${index + 1}`),
    name: projectName(record, `项目${index + 1}`),
    owner: ownerText(record),
    status: text(record, ["项目状态", "当前状态", "状态"], progress >= 100 ? "已完成" : "进行中"),
    stage: text(record, ["当前阶段", "项目阶段", "阶段"], "未标注阶段"),
    progress,
    health,
    riskLevel,
    nextMilestone: text(record, ["下一里程碑", "下一个里程碑", "计划完成"], dateText(record, ["计划完成", "计划交付时间", "截止时间"])),
    source: "飞书项目台账",
  };
}

function mapRisk(record: RawRecord, index: number): MyWorkbenchRisk {
  const score = numeric(record, ["风险值", "风险评分"], 0);
  const severity = severityFromValue(text(record, ["风险等级", "严重度"], score ? String(score) : "低") || score);
  return {
    id: text(record, ["风险编号", "风险ID", "risk_id"], `risk-${index + 1}`),
    projectName: projectName(record, "未关联项目"),
    description: text(record, ["风险描述", "风险事项", "描述"], `风险${index + 1}`),
    severity,
    status: text(record, ["状态", "风险状态"], "已识别"),
    owner: ownerText(record),
    dueDate: dateText(record, ["复核日期", "下次复核日期", "截止日期", "deadline"]),
    nextAction: text(record, ["应对措施", "响应措施", "行动计划", "下一步动作"], "补充应对措施、责任人和复核日期。"),
    source: "飞书风险登记册",
  };
}

function mapTaskTodo(record: RawRecord, index: number): MyWorkbenchTodo {
  const dueDate = dateText(record, ["计划完成", "截止日期", "deadline", "到期日期"]);
  const daysLeft = daysLeftFromDate(dueDate);
  return {
    id: text(record, ["任务编号", "任务ID", "task_id"], `task-${index + 1}`),
    type: "任务",
    title: text(record, ["任务名称", "事项", "待办事项"], `任务${index + 1}`),
    projectName: projectName(record, "未关联项目"),
    owner: ownerText(record),
    dueDate,
    daysLeft,
    status: text(record, ["任务状态", "状态"], "未开始"),
    priority: priorityByDue(daysLeft),
    source: "飞书任务表",
    action: daysLeft !== null && daysLeft < 0 ? "已逾期，需更新状态、阻塞原因和恢复计划。" : "确认今日推进动作和完成证据。",
  };
}

function mapMilestoneTodo(record: RawRecord, index: number): MyWorkbenchTodo {
  const dueDate = dateText(record, ["计划完成", "截止日期", "deadline", "到期日期"]);
  const daysLeft = daysLeftFromDate(dueDate);
  return {
    id: text(record, ["里程碑编号", "里程碑ID", "milestone_id"], `milestone-${index + 1}`),
    type: "里程碑",
    title: text(record, ["里程碑名称", "阶段门", "事项"], `里程碑${index + 1}`),
    projectName: projectName(record, "未关联项目"),
    owner: ownerText(record),
    dueDate,
    daysLeft,
    status: text(record, ["里程碑状态", "状态"], "未开始"),
    priority: priorityByDue(daysLeft),
    source: "飞书里程碑表",
    action: "准备阶段门证据，确认是否可以进入下一阶段。",
  };
}

function mapRiskReviewTodo(risk: MyWorkbenchRisk): MyWorkbenchTodo {
  const daysLeft = daysLeftFromDate(risk.dueDate);
  return {
    id: `risk-review-${risk.id}`,
    type: "风险复核",
    title: `复核风险：${risk.description}`,
    projectName: risk.projectName,
    owner: risk.owner,
    dueDate: risk.dueDate,
    daysLeft,
    status: risk.status,
    priority: risk.severity === "高" ? "P0" : priorityByDue(daysLeft, "P1"),
    source: risk.source,
    action: risk.nextAction,
  };
}

function riskImpactAreaFromText(value: string): RiskImpactArea {
  if (/回款|合同|应收|付款/.test(value)) return "回款";
  if (/进度|延期|里程碑|工期/.test(value)) return "工期";
  if (/质量|验收|缺陷/.test(value)) return "质量";
  if (/成本|费用|预算/.test(value)) return "费用";
  return "范围";
}

function workbenchRiskToRisk(risk: MyWorkbenchRisk): Risk {
  const impactArea = riskImpactAreaFromText(`${risk.description}${risk.nextAction}`);
  const piScore = risk.severity === "高" ? 20 : risk.severity === "中" ? 12 : 4;
  const urgency = risk.severity === "高" ? 5 : risk.severity === "中" ? 3 : 2;
  return {
    id: risk.id,
    riskCode: risk.id,
    projectName: risk.projectName,
    description: risk.description,
    category: impactArea === "回款" ? "财务" : impactArea === "工期" ? "进度" : impactArea === "质量" ? "质量" : "管理",
    stage: "监控",
    source: risk.source,
    impactArea,
    probability: risk.severity === "高" ? 4 : risk.severity === "中" ? 3 : 2,
    impact: risk.severity === "高" ? 5 : risk.severity === "中" ? 4 : 2,
    urgency,
    piScore,
    priorityScore: piScore * urgency,
    status: "tracking",
    responseStrategyType: risk.severity === "高" ? "上报" : "缓解",
    responseStrategy: risk.nextAction,
    preventiveAction: risk.nextAction,
    contingencyPlan: risk.nextAction,
    trigger: "工作台从风险登记册、任务、里程碑或回款数据中识别。",
    trackingMethod: "PM/PMO每日工作台复核。",
    owner: risk.owner,
    dueDate: risk.dueDate,
    nextReviewDate: risk.dueDate,
    closingCriteria: "应对动作完成并补充关闭证据。",
    linkedModule: impactArea === "回款" ? "合同回款" : "监控",
    evidence: risk.source,
    createdAt: new Date().toISOString().slice(0, 10),
  };
}

function mapPayment(record: RawRecord, index: number): MyBusinessReminder {
  const dueDate = dateText(record, ["到期日期", "回款到期日", "计划回款日期", "截止日期"]);
  const daysLeft = daysLeftFromDate(dueDate);
  return {
    id: text(record, ["回款编号", "payment_id", "节点编号"], `payment-${index + 1}`),
    projectName: projectName(record, "未关联项目"),
    customer: text(record, ["客户名称", "付款方", "合同方", "甲方"], "未填写客户"),
    amount: numeric(record, ["应收金额", "回款金额", "已回款金额", "应催账款"], 0),
    dueDate,
    daysLeft,
    status: text(record, ["回款状态", "状态"], "待跟进"),
    source: "飞书回款表",
    action: daysLeft !== null && daysLeft < 0 ? "回款已逾期，需确认验收、开票、客户付款条件和升级路径。" : "确认付款条件、验收材料和预计到账时间。",
  };
}

function actionDue(daysLeft: number | null): string {
  if (daysLeft === null) return "待补日期";
  if (daysLeft < 0) return `逾期 ${Math.abs(daysLeft)} 天`;
  if (daysLeft === 0) return "今天";
  if (daysLeft === 1) return "明天";
  return `${daysLeft} 天内`;
}

function buildOperationalActions(input: {
  projects: MyWorkbenchProject[];
  risks: MyWorkbenchRisk[];
  todos: MyWorkbenchTodo[];
  reminders: MyBusinessReminder[];
  riskRetrospectiveGovernanceFollowups?: RiskRetrospectiveGovernanceFollowupWorkbench;
}): OperationalWorkbench["actions"] {
  const actions: OperationalWorkbench["actions"] = [];
  const overdueTodos = input.todos.filter(item => item.daysLeft !== null && item.daysLeft < 0);
  const highRisks = input.risks.filter(item => item.severity === "高");
  const duePayments = input.reminders.filter(item => item.daysLeft !== null && item.daysLeft <= 7);
  const unhealthyProjects = input.projects.filter(item => item.health === "error" || item.health === "warning");
  const governanceFollowups = input.riskRetrospectiveGovernanceFollowups;

  if (overdueTodos.length > 0) {
    actions.push({
      id: "p3-overdue-todos",
      priority: "P0",
      title: `处理 ${overdueTodos.length} 个逾期任务/里程碑`,
      owner: "项目经理",
      due: "今天",
      source: "飞书任务表/里程碑表",
      action: "更新完成状态、阻塞原因、恢复计划和需要升级的事项。",
    });
  }
  if (highRisks.length > 0) {
    actions.push({
      id: "p3-high-risk-review",
      priority: "P0",
      title: `复核 ${highRisks.length} 个高风险事项`,
      owner: "项目经理",
      due: "今天",
      source: "飞书风险登记册",
      action: "确认应对措施、责任人、deadline、触发条件和关闭证据。",
    });
  }
  if (duePayments.length > 0) {
    actions.push({
      id: "p3-payment-followup",
      priority: "P1",
      title: `跟进 ${duePayments.length} 个临近或逾期回款节点`,
      owner: "项目经理",
      due: "本周",
      source: "飞书回款表/项目台账",
      action: "核对验收、开票、付款条件和客户侧阻塞点。",
    });
  }
  if (unhealthyProjects.length > 0) {
    actions.push({
      id: "p3-unhealthy-projects",
      priority: "P1",
      title: `复盘 ${unhealthyProjects.length} 个异常或预警项目`,
      owner: "PMO",
      due: "本周例会前",
      source: "飞书项目台账",
      action: "检查进度、风险、阶段门和回款是否需要升级处理。",
    });
  }
  if (governanceFollowups && governanceFollowups.summary.myPending > 0) {
    actions.push({
      id: "p3-risk-retro-governance-followups",
      priority: governanceFollowups.summary.highPriority > 0 || governanceFollowups.summary.overdue > 0 ? "P0" : "P1",
      title: `处理 ${governanceFollowups.summary.myPending} 个知识治理待办`,
      owner: "PMO",
      due: governanceFollowups.summary.overdue > 0 ? "今天" : "本周",
      source: "风险复盘资产二次治理待办",
      action: "复核低效果治理动作，确认补充编辑、合并、撤回、重新发布或转统一行动项。",
    });
  }
  if (actions.length === 0) {
    actions.push({
      id: "p3-weekly-operating-review",
      priority: "P2",
      title: "完成今日项目运营巡检",
      owner: "项目经理",
      due: "今天",
      source: "飞书项目/风险/任务/回款数据",
      action: "抽查数据完整性，确认本周关键交付、风险和回款节点。",
    });
  }
  return actions;
}

function buildAiSuggestions(input: {
  projects: MyWorkbenchProject[];
  risks: MyWorkbenchRisk[];
  todos: MyWorkbenchTodo[];
  reminders: MyBusinessReminder[];
  evidence: WorkbenchEvidence;
}): OperationalWorkbench["aiSuggestions"] {
  const p0Todos = input.todos.filter(item => item.priority === "P0").length;
  const highRisks = input.risks.filter(item => item.severity === "高").length;
  const overduePayments = input.reminders.filter(item => item.daysLeft !== null && item.daysLeft < 0).length;
  const unhealthyProjects = input.projects.filter(item => item.health !== "ok").length;

  const firstTitle = p0Todos + highRisks > 0
    ? "先处理逾期事项和高风险，再处理普通计划任务"
    : "今天以计划确认和数据完整性巡检为主";
  const secondTitle = overduePayments > 0
    ? "经营动作需要优先升级逾期回款节点"
    : "保持验收、合同和回款节点同步";
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 1);
  const due = dueDate.toISOString().slice(0, 10);

  return [
    {
      title: firstTitle,
      basis: `扫描项目${input.evidence.scanned.projects}条、风险${input.evidence.scanned.risks}条、任务${input.evidence.scanned.tasks}条、里程碑${input.evidence.scanned.milestones}条；P0事项${p0Todos}个，高风险${highRisks}个，预警项目${unhealthyProjects}个。`,
      confirmation: "AI建议只做排序辅助，项目经理需确认真实阻塞、责任人和完成证据。",
      actionTitle: p0Todos + highRisks > 0 ? "处理今日P0事项和高风险阻塞" : "完成今日计划确认和数据完整性巡检",
      priority: p0Todos + highRisks > 0 ? "P0" : "P1",
      owner: "项目经理/PMO",
      dueDate: due,
    },
    {
      title: secondTitle,
      basis: `扫描回款${input.evidence.scanned.payments}条，当前经营提醒${input.reminders.length}个，其中逾期${overduePayments}个。`,
      confirmation: "需要人工确认验收状态、客户付款条件、开票状态和合同条款。",
      actionTitle: overduePayments > 0 ? "升级逾期回款节点并确认付款障碍" : "同步验收、合同和回款节点状态",
      priority: overduePayments > 0 ? "P0" : "P1",
      owner: "项目经理/商务负责人",
      dueDate: due,
    },
  ];
}

function buildFallbackWorkbench(
  user?: WorkbenchUser | null,
  riskRetrospectiveGovernanceFollowups: RiskRetrospectiveGovernanceFollowupRecord[] = [],
  riskRetrospectiveGovernanceFollowupsWarning?: string,
): OperationalWorkbench {
  const base = deriveWorkbenchSummary(null);
  const followupWorkbench = buildRiskRetrospectiveGovernanceFollowupWorkbench({
    followups: riskRetrospectiveGovernanceFollowups,
    user,
    warning: riskRetrospectiveGovernanceFollowupsWarning,
  });
  const knowledgeGovernanceAction = followupWorkbench.summary.myPending > 0
    ? [{
        id: "p3-risk-retro-governance-followups",
        priority: followupWorkbench.summary.highPriority > 0 || followupWorkbench.summary.overdue > 0 ? "P0" as const : "P1" as const,
        title: `处理 ${followupWorkbench.summary.myPending} 个知识治理待办`,
        owner: "PMO" as const,
        due: followupWorkbench.summary.overdue > 0 ? "今天" : "本周",
        source: "风险复盘资产二次治理待办",
        action: "复核低效果治理动作，确认补充编辑、合并、撤回、重新发布或转统一行动项。",
      }]
    : [];
  return {
    ...base,
    kpis: [
      ...base.kpis,
      {
        label: "知识治理待办",
        value: String(followupWorkbench.summary.myPending),
        hint: followupWorkbench.warning || "来自已保存的风险复盘资产二次治理待办。",
        status: followupWorkbench.warning ? "warning" : followupWorkbench.summary.highPriority > 0 || followupWorkbench.summary.overdue > 0 ? "error" : followupWorkbench.summary.myPending > 0 ? "warning" : "ok",
      },
    ],
    actions: [...knowledgeGovernanceAction, ...base.actions],
    myProjects: [],
    myRisks: [],
    todayTodos: [],
    businessReminders: [],
    riskIntegration: buildRiskIntegrationDashboard({ risks: [], dashboard: null }),
    riskRetrospectiveGovernanceFollowups: followupWorkbench,
    evidence: {
      source: "missing",
      generatedAt: new Date().toISOString(),
      userScope: user ? "unmatched-owner" : "anonymous",
      matchedBy: userTokens(user),
      scanned: { projects: 0, risks: 0, tasks: 0, milestones: 0, payments: 0 },
      included: { projects: 0, risks: 0, todos: 0, businessReminders: 0 },
    },
  };
}

export function buildOperationalWorkbench(input: {
  user?: WorkbenchUser | null;
  projects: RawRecord[];
  risks: RawRecord[];
  tasks: RawRecord[];
  milestones: RawRecord[];
  payments: RawRecord[];
  dashboard?: DashboardData | null;
  projectAccessGrants?: ProjectAccessGrant[];
  riskRetrospectiveGovernanceFollowups?: RiskRetrospectiveGovernanceFollowupRecord[];
  riskRetrospectiveGovernanceFollowupsWarning?: string;
}): OperationalWorkbench {
  const dashboard = input.dashboard ?? buildDashboardFromRecords(input.projects);
  if (!dashboard && input.projects.length === 0 && input.risks.length === 0 && input.tasks.length === 0 && input.milestones.length === 0 && input.payments.length === 0) {
    return buildFallbackWorkbench(input.user, input.riskRetrospectiveGovernanceFollowups, input.riskRetrospectiveGovernanceFollowupsWarning);
  }

  const matchedProjects = input.user?.role === "admin"
    ? input.projects
    : input.projects.filter(record => recordMatchesUser(record, input.user) || recordMatchesGrant(record, input.projectAccessGrants));
  const matchedProjectNames = new Set(matchedProjects.map(record => projectName(record)).filter(Boolean));
  const includeByProject = (record: RawRecord) => matchedProjectNames.has(projectName(record));
  const includeRecord = (record: RawRecord) => input.user?.role === "admin" || recordMatchesUser(record, input.user) || recordMatchesGrant(record, input.projectAccessGrants) || includeByProject(record);

  const myProjects = matchedProjects
    .map(mapProject)
    .filter(project => !statusComplete(project.status))
    .sort((a, b) => (a.health === b.health ? b.progress - a.progress : a.health === "error" ? -1 : b.health === "error" ? 1 : a.health === "warning" ? -1 : 1))
    .slice(0, 8);

  const myRisks = input.risks
    .filter(includeRecord)
    .map(mapRisk)
    .filter(risk => activeRiskStatus(risk.status))
    .sort((a, b) => ({ 高: 3, 中: 2, 低: 1 }[b.severity] - { 高: 3, 中: 2, 低: 1 }[a.severity]))
    .slice(0, 8);

  const taskTodos = input.tasks
    .filter(includeRecord)
    .map(mapTaskTodo)
    .filter(todo => !statusComplete(todo.status) && (todo.daysLeft === null || todo.daysLeft <= 7));
  const milestoneTodos = input.milestones
    .filter(includeRecord)
    .map(mapMilestoneTodo)
    .filter(todo => !statusComplete(todo.status) && (todo.daysLeft === null || todo.daysLeft <= 7));
  const riskTodos = myRisks
    .filter(risk => risk.severity === "高" || daysLeftFromDate(risk.dueDate) === null || (daysLeftFromDate(risk.dueDate) ?? 99) <= 7)
    .map(mapRiskReviewTodo);
  const todayTodos = [...taskTodos, ...milestoneTodos, ...riskTodos]
    .sort((a, b) => PRIORITY_SCORE[b.priority] - PRIORITY_SCORE[a.priority] || (a.daysLeft ?? 99) - (b.daysLeft ?? 99))
    .slice(0, 10);

  const projectPaymentReminders = matchedProjects
    .filter(record => numeric(record, ["应收金额", "应催账款"], 0) > 0)
    .map((record, index) => mapPayment({
      ...record,
      回款状态: text(record, ["回款状态", "状态"], "项目台账应收"),
    }, index));
  const paymentReminders = input.payments
    .filter(includeRecord)
    .map(mapPayment);
  const businessReminders = [...paymentReminders, ...projectPaymentReminders]
    .filter(item => item.amount > 0 && (item.daysLeft === null || item.daysLeft <= 14 || item.status.includes("逾期")))
    .sort((a, b) => (a.daysLeft ?? 99) - (b.daysLeft ?? 99))
    .slice(0, 8);

  const riskIntegration = buildRiskIntegrationDashboard({
    risks: myRisks.map(workbenchRiskToRisk),
    dashboard,
    limit: 12,
  });
  const riskRetrospectiveGovernanceFollowups = buildRiskRetrospectiveGovernanceFollowupWorkbench({
    followups: input.riskRetrospectiveGovernanceFollowups ?? [],
    user: input.user,
    warning: input.riskRetrospectiveGovernanceFollowupsWarning,
  });
  const base = deriveWorkbenchSummary(dashboard);
  const evidence: WorkbenchEvidence = {
    source: "feishu",
    generatedAt: new Date().toISOString(),
    userScope: input.user?.role === "admin"
      ? "admin-all"
      : input.projectAccessGrants?.length
        ? "authorized-project"
        : myProjects.length + myRisks.length + todayTodos.length + businessReminders.length > 0
          ? "matched-owner"
          : input.user
            ? "unmatched-owner"
            : "anonymous",
    matchedBy: userTokens(input.user),
    scanned: {
      projects: input.projects.length,
      risks: input.risks.length,
      tasks: input.tasks.length,
      milestones: input.milestones.length,
      payments: input.payments.length,
    },
    included: {
      projects: myProjects.length,
      risks: myRisks.length,
      todos: todayTodos.length,
      businessReminders: businessReminders.length,
    },
  };

  return {
    ...base,
    kpis: [
      { label: "我的项目", value: String(myProjects.length), hint: evidence.userScope === "admin-all" ? "管理员视角显示全量未关闭项目。" : "按当前登录用户匹配项目经理/责任人字段。", status: myProjects.length > 0 ? "ok" : "unknown" },
      { label: "今日待办", value: String(todayTodos.length), hint: "来自任务、里程碑和风险复核。", status: todayTodos.some(item => item.priority === "P0") ? "error" : todayTodos.length > 0 ? "warning" : "ok" },
      { label: "重点风险", value: String(myRisks.filter(item => item.severity === "高").length), hint: "来自飞书风险登记册。", status: myRisks.some(item => item.severity === "高") ? "error" : myRisks.length > 0 ? "warning" : "ok" },
      { label: "经营提醒", value: String(businessReminders.length), hint: "来自回款表和项目台账应收字段。", status: businessReminders.some(item => item.daysLeft !== null && item.daysLeft < 0) ? "error" : businessReminders.length > 0 ? "warning" : "ok" },
      { label: "知识治理待办", value: String(riskRetrospectiveGovernanceFollowups.summary.myPending), hint: "来自已保存的风险复盘资产二次治理待办。", status: riskRetrospectiveGovernanceFollowups.summary.highPriority > 0 || riskRetrospectiveGovernanceFollowups.summary.overdue > 0 ? "error" : riskRetrospectiveGovernanceFollowups.summary.myPending > 0 ? "warning" : "ok" },
    ],
    actions: buildOperationalActions({ projects: myProjects, risks: myRisks, todos: todayTodos, reminders: businessReminders, riskRetrospectiveGovernanceFollowups }),
    myProjects,
    myRisks,
    todayTodos,
    businessReminders,
    riskIntegration,
    riskRetrospectiveGovernanceFollowups,
    evidence,
    aiSuggestions: buildAiSuggestions({ projects: myProjects, risks: myRisks, todos: todayTodos, reminders: businessReminders, evidence }),
  };
}

export async function loadOperationalWorkbenchFromFeishu(
  config: FeishuConfig,
  user?: WorkbenchUser | null,
  projectAccessGrants: ProjectAccessGrant[] = [],
  riskRetrospectiveGovernanceFollowups: RiskRetrospectiveGovernanceFollowupRecord[] = [],
  riskRetrospectiveGovernanceFollowupsWarning?: string,
): Promise<OperationalWorkbench> {
  const client = new FeishuBaseClient(config);
  const [projects, risks, tasks, milestones, payments] = await Promise.all([
    config.tables.project ? client.listRecords("project", 500).catch(() => []) : Promise.resolve([]),
    config.tables.risk ? client.listRecords("risk", 500).catch(() => []) : Promise.resolve([]),
    config.tables.task ? client.listRecords("task", 500).catch(() => []) : Promise.resolve([]),
    config.tables.milestone ? client.listRecords("milestone", 500).catch(() => []) : Promise.resolve([]),
    config.tables.payment ? client.listRecords("payment", 500).catch(() => []) : Promise.resolve([]),
  ]);

  const projectRows = projects.map(item => normalizeWorkbenchFields(item.fields));
  return buildOperationalWorkbench({
    user,
    projects: projectRows,
    risks: risks.map(item => normalizeWorkbenchFields(item.fields)),
    tasks: tasks.map(item => normalizeWorkbenchFields(item.fields)),
    milestones: milestones.map(item => normalizeWorkbenchFields(item.fields)),
    payments: payments.map(item => normalizeWorkbenchFields(item.fields)),
    dashboard: buildDashboardFromRecords(projectRows),
    projectAccessGrants,
    riskRetrospectiveGovernanceFollowups,
    riskRetrospectiveGovernanceFollowupsWarning,
  });
}

export function formatDueLabel(daysLeft: number | null): string {
  return actionDue(daysLeft);
}
