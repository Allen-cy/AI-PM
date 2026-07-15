export const REQUIRED_INBOX_SOURCES = [
  "risk",
  "joint_check",
  "operating_calendar",
  "governance_approval",
  "management_signal",
  "ai_recommendation",
  "decision_receipt",
  "feishu_confirmation",
  "formal_output",
  "cross_role_flow",
] as const;

export type RequiredInboxType = typeof REQUIRED_INBOX_SOURCES[number];
export type InboxPriority = "critical" | "high" | "medium" | "low";

export interface CollaborationInboxItem {
  id: string;
  type: RequiredInboxType | "action" | "closure_review" | "benefit_review" | "correction" | "report_receipt" | "evidence_review" | "data_quality" | "governance_action" | "capacity_conflict" | "project_dependency";
  title: string;
  status: string;
  projectId: string | null;
  projectName: string | null;
  dueAt: string | null;
  priority: InboxPriority;
  actionUrl: string;
  sourceId: string;
  sourceType: string;
  sourceUpdatedAt: string | null;
  dataClass: string;
  receiptStatus?: "unread" | "read" | "snoozed" | "acknowledged";
  receiptVersion?: number;
}

export interface InboxSummary {
  total: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  overdue: number;
  unread: number;
}

function overdue(item: CollaborationInboxItem, now: Date): boolean {
  if (!item.dueAt) return false;
  const due = new Date(item.dueAt).getTime();
  return Number.isFinite(due) && due < now.getTime();
}

export function sortAndSummarizeInbox(items: CollaborationInboxItem[], now = new Date()): { items: CollaborationInboxItem[]; summary: InboxSummary } {
  const rank: Record<InboxPriority, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  const sorted = [...items].sort((a, b) => rank[a.priority] - rank[b.priority] || String(a.dueAt || "9999").localeCompare(String(b.dueAt || "9999")) || a.title.localeCompare(b.title, "zh-CN"));
  return {
    items: sorted,
    summary: {
      total: sorted.length,
      critical: sorted.filter(item => item.priority === "critical").length,
      high: sorted.filter(item => item.priority === "high").length,
      medium: sorted.filter(item => item.priority === "medium").length,
      low: sorted.filter(item => item.priority === "low").length,
      overdue: sorted.filter(item => overdue(item, now)).length,
      unread: sorted.filter(item => !item.receiptStatus || item.receiptStatus === "unread").length,
    },
  };
}
