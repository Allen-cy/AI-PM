import type {
  RiskRetrospectiveGovernanceFollowupFeishuSyncStatus,
  RiskRetrospectiveGovernanceFollowupRecord,
  RiskRetrospectiveGovernanceFollowupStatus,
} from "./retrospective-governance-followups.ts";
import type { RiskRetrospectiveGovernanceActionItemPriority } from "./retrospective-governance.ts";

export type { RiskRetrospectiveGovernanceFollowupRecord };

export interface RiskRetrospectiveGovernanceFollowupWorkbenchUser {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  role?: "admin" | "user";
}

export interface RiskRetrospectiveGovernanceFollowupWorkbenchItem {
  id: string;
  assetTitle: string;
  reason: string;
  actionRequired: string;
  ownerName: string;
  dueDate: string;
  daysLeft: number | null;
  priority: "P0" | "P1" | "P2";
  status: RiskRetrospectiveGovernanceFollowupStatus;
  closingCriteria: string;
  feishuSyncStatus: RiskRetrospectiveGovernanceFollowupFeishuSyncStatus;
  feishuTaskUrl: string | null;
  source: string;
  action: string;
  actionDraft: {
    title: string;
    owner: string;
    dueDate: string;
    priority: "P0" | "P1" | "P2";
    projectName: string;
    sourceType: "governance";
    sourceId: string;
    sourceReason: string;
  };
}

export interface RiskRetrospectiveGovernanceFollowupWorkbench {
  summary: {
    totalOpen: number;
    myPending: number;
    overdue: number;
    dueSoon: number;
    highPriority: number;
    waitingFeishuConfirmation: number;
  };
  workItems: RiskRetrospectiveGovernanceFollowupWorkbenchItem[];
  warning?: string;
  boundary: string;
}

const PRIORITY_MAP: Record<RiskRetrospectiveGovernanceActionItemPriority, "P0" | "P1" | "P2"> = {
  high: "P0",
  medium: "P1",
  low: "P2",
};
const WORKBENCH_PRIORITY_SCORE: Record<"P0" | "P1" | "P2", number> = { P0: 3, P1: 2, P2: 1 };

function parseDateOnly(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00+08:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function daysLeft(value: string): number | null {
  const parsed = parseDateOnly(value);
  if (!parsed) return null;
  const now = new Date();
  const today = new Date(`${now.toLocaleDateString("sv-SE", { timeZone: "Asia/Shanghai" })}T00:00:00+08:00`);
  return Math.ceil((parsed.getTime() - today.getTime()) / 86_400_000);
}

function normalizeToken(value?: string | null): string {
  return (value ?? "").replace(/\s/g, "").toLowerCase();
}

function userTokens(user?: RiskRetrospectiveGovernanceFollowupWorkbenchUser | null): string[] {
  return [user?.name, user?.email, user?.phone]
    .map(normalizeToken)
    .filter(Boolean);
}

function followupMatchesUser(item: RiskRetrospectiveGovernanceFollowupRecord, user?: RiskRetrospectiveGovernanceFollowupWorkbenchUser | null): boolean {
  if (!user) return false;
  if (user.role === "admin") return true;
  const tokens = userTokens(user);
  if (tokens.length === 0) return false;
  const owner = normalizeToken(item.ownerName);
  const creator = normalizeToken(item.createdByName);
  return tokens.some(token => owner.includes(token) || creator.includes(token));
}

function mapWorkbenchPriority(priority: RiskRetrospectiveGovernanceActionItemPriority): "P0" | "P1" | "P2" {
  return PRIORITY_MAP[priority] ?? "P1";
}

export function buildRiskRetrospectiveGovernanceFollowupWorkbench(input: {
  followups: RiskRetrospectiveGovernanceFollowupRecord[];
  user?: RiskRetrospectiveGovernanceFollowupWorkbenchUser | null;
  warning?: string;
}): RiskRetrospectiveGovernanceFollowupWorkbench {
  const openFollowups = input.followups.filter(item => item.status !== "已关闭");
  const scopedFollowups = input.user?.role === "admin"
    ? openFollowups
    : openFollowups.filter(item => followupMatchesUser(item, input.user));
  const workItems = scopedFollowups
    .map(item => {
      const left = daysLeft(item.dueDate);
      const priority = mapWorkbenchPriority(item.priority);
      return {
        id: item.id,
        assetTitle: item.assetTitle,
        reason: item.reason,
        actionRequired: item.actionRequired,
        ownerName: item.ownerName || "PMO知识管理员",
        dueDate: item.dueDate || "未设定",
        daysLeft: left,
        priority,
        status: item.status,
        closingCriteria: item.closingCriteria,
        feishuSyncStatus: item.feishuSyncStatus,
        feishuTaskUrl: item.feishuTaskUrl,
        source: "风险复盘资产二次治理待办",
        action: item.status === "待复核"
          ? "先复核低效果原因，确认是否需要补充编辑、合并、撤回或重新发布。"
          : item.status === "待验收"
            ? "复核关闭标准，确认质量分、RAG引用或重复风险是否已经改善。"
            : "推进二次治理动作，补齐证据并准备验收。",
        actionDraft: {
          title: `[知识治理] ${item.assetTitle}`,
          owner: item.ownerName || "PMO知识管理员",
          dueDate: item.dueDate,
          priority,
          projectName: "风险复盘资产治理",
          sourceType: "governance" as const,
          sourceId: `risk-retro-governance-followup-${item.id}`,
          sourceReason: [
            `来源：风险复盘资产二次治理待办 ${item.id}`,
            `原因：${item.reason}`,
            `处理动作：${item.actionRequired}`,
            `关闭标准：${item.closingCriteria}`,
          ].join("\n"),
        },
      };
    })
    .sort((a, b) => WORKBENCH_PRIORITY_SCORE[b.priority] - WORKBENCH_PRIORITY_SCORE[a.priority] || (a.daysLeft ?? 99) - (b.daysLeft ?? 99))
    .slice(0, 12);

  return {
    summary: {
      totalOpen: openFollowups.length,
      myPending: workItems.length,
      overdue: workItems.filter(item => item.daysLeft !== null && item.daysLeft < 0).length,
      dueSoon: workItems.filter(item => item.daysLeft !== null && item.daysLeft >= 0 && item.daysLeft <= 7).length,
      highPriority: workItems.filter(item => item.priority === "P0").length,
      waitingFeishuConfirmation: workItems.filter(item => item.feishuSyncStatus === "待确认").length,
    },
    workItems,
    warning: input.warning,
    boundary: "工作台只展示已保存的二次治理待办；运行时派生但未保存的待办仍需先在风险管理页点击“保存待办”。转统一行动项和写入飞书任务均需人工确认。",
  };
}
