import {
  isTerminalGovernanceState,
  type GovernanceInstanceRecord,
} from "./model.ts";

export type GovernanceSlaStatus = "未设截止" | "未到期" | "即将到期" | "今日到期" | "已逾期" | "已完成";
export type GovernanceSlaSeverity = "ok" | "warning" | "critical" | "done";
export type GovernanceWorkItemRole = "责任人" | "审批人" | "创建人" | "管理员";

export interface GovernanceSlaInfo {
  status: GovernanceSlaStatus;
  severity: GovernanceSlaSeverity;
  daysLeft: number | null;
  label: string;
  nextAction: string;
}

export interface GovernanceWorkItem {
  id: string;
  workflowName: string;
  projectName: string;
  title: string;
  state: string;
  owner: string;
  approver: string;
  priority: GovernanceInstanceRecord["priority"];
  deadline: string | null;
  role: GovernanceWorkItemRole;
  sla: GovernanceSlaInfo;
  action: string;
}

export interface GovernanceSlaSummary {
  totalOpen: number;
  overdue: number;
  dueToday: number;
  dueSoon: number;
  missingDeadline: number;
  myPending: number;
}

export interface GovernanceSlaDashboard {
  summary: GovernanceSlaSummary;
  workItems: GovernanceWorkItem[];
}

export interface GovernanceSlaUser {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  role?: "admin" | "user" | string | null;
}

function parseDateOnly(value?: string | null): Date | null {
  if (!value) return null;
  const normalized = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return null;
  const parsed = new Date(`${normalized}T00:00:00+08:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function todayInChina(now: Date): Date {
  return new Date(`${now.toLocaleDateString("sv-SE", { timeZone: "Asia/Shanghai" })}T00:00:00+08:00`);
}

function daysLeft(deadline?: string | null, now = new Date()): number | null {
  const parsed = parseDateOnly(deadline);
  if (!parsed) return null;
  return Math.ceil((parsed.getTime() - todayInChina(now).getTime()) / 86_400_000);
}

function textIncludesToken(text: string, tokens: string[]): boolean {
  const normalized = text.replace(/\s/g, "").toLowerCase();
  return tokens.some(token => normalized.includes(token.replace(/\s/g, "").toLowerCase()));
}

function userTokens(user?: GovernanceSlaUser | null): string[] {
  return [user?.name, user?.email, user?.phone]
    .map(value => value?.trim())
    .filter((value): value is string => Boolean(value));
}

export function deriveGovernanceSla(instance: GovernanceInstanceRecord, now = new Date()): GovernanceSlaInfo {
  if (isTerminalGovernanceState(instance.state)) {
    return {
      status: "已完成",
      severity: "done",
      daysLeft: null,
      label: "已完成",
      nextAction: "保留输出成果和审计记录，进入归档或复盘。",
    };
  }

  const remaining = daysLeft(instance.deadline, now);
  if (remaining === null) {
    return {
      status: "未设截止",
      severity: "warning",
      daysLeft: null,
      label: "未设 SLA",
      nextAction: "补充治理截止日期，避免流程长期悬空。",
    };
  }
  if (remaining < 0) {
    return {
      status: "已逾期",
      severity: "critical",
      daysLeft: remaining,
      label: `逾期 ${Math.abs(remaining)} 天`,
      nextAction: "立即补充处理意见、输出成果或升级 PMO 协调。",
    };
  }
  if (remaining === 0) {
    return {
      status: "今日到期",
      severity: "critical",
      daysLeft: remaining,
      label: "今天到期",
      nextAction: "今天完成审批、退回补充或明确新的行动项。",
    };
  }
  if (remaining <= 2) {
    return {
      status: "即将到期",
      severity: "warning",
      daysLeft: remaining,
      label: `${remaining} 天内到期`,
      nextAction: "提前确认输入材料、审批人时间和输出成果。",
    };
  }
  return {
    status: "未到期",
    severity: "ok",
    daysLeft: remaining,
    label: `${remaining} 天后到期`,
    nextAction: "按计划推进，保持审计记录完整。",
  };
}

export function matchGovernanceWorkItemRole(
  instance: GovernanceInstanceRecord,
  user?: GovernanceSlaUser | null,
): GovernanceWorkItemRole | null {
  if (user?.role === "admin") return "管理员";
  const tokens = userTokens(user);
  if (tokens.length === 0) return null;
  if (textIncludesToken(instance.owner, tokens)) return "责任人";
  if (textIncludesToken(instance.approver, tokens)) return "审批人";
  if (instance.createdByName && textIncludesToken(instance.createdByName, tokens)) return "创建人";
  return null;
}

export function buildGovernanceSlaDashboard(
  instances: GovernanceInstanceRecord[],
  user?: GovernanceSlaUser | null,
  now = new Date(),
): GovernanceSlaDashboard {
  const activeInstances = instances.filter(instance => !isTerminalGovernanceState(instance.state));
  const withSla = activeInstances.map(instance => ({ instance, sla: deriveGovernanceSla(instance, now) }));
  const workItems = withSla
    .map(({ instance, sla }) => {
      const role = matchGovernanceWorkItemRole(instance, user);
      if (!role) return null;
      return {
        id: instance.id,
        workflowName: instance.workflowName,
        projectName: instance.projectName,
        title: instance.title,
        state: instance.state,
        owner: instance.owner,
        approver: instance.approver,
        priority: instance.priority,
        deadline: instance.deadline ?? null,
        role,
        sla,
        action: sla.nextAction,
      } satisfies GovernanceWorkItem;
    })
    .filter((item): item is GovernanceWorkItem => Boolean(item))
    .sort((a, b) => {
      const severityScore: Record<GovernanceSlaSeverity, number> = { critical: 0, warning: 1, ok: 2, done: 3 };
      const severityDelta = severityScore[a.sla.severity] - severityScore[b.sla.severity];
      if (severityDelta !== 0) return severityDelta;
      const aDays = a.sla.daysLeft ?? Number.MAX_SAFE_INTEGER;
      const bDays = b.sla.daysLeft ?? Number.MAX_SAFE_INTEGER;
      return aDays - bDays;
    });

  return {
    summary: {
      totalOpen: activeInstances.length,
      overdue: withSla.filter(item => item.sla.status === "已逾期").length,
      dueToday: withSla.filter(item => item.sla.status === "今日到期").length,
      dueSoon: withSla.filter(item => item.sla.status === "即将到期").length,
      missingDeadline: withSla.filter(item => item.sla.status === "未设截止").length,
      myPending: workItems.length,
    },
    workItems,
  };
}
