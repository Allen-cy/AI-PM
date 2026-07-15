import type { BusinessRole } from "../operating-model/context.ts";

export type CrossRoleFlowState =
  | "submitted_to_pmo"
  | "pmo_reviewed"
  | "report_frozen"
  | "decision_submitted"
  | "decision_made"
  | "action_dispatched"
  | "receipt_acknowledged"
  | "effect_reviewed"
  | "closed"
  | "cancelled";

export type CrossRoleFlowOperation =
  | "pmo_review"
  | "freeze_report"
  | "submit_decision"
  | "record_decision"
  | "dispatch_action"
  | "acknowledge_receipt"
  | "review_effect"
  | "close"
  | "cancel";

type Transition = { from: CrossRoleFlowState; operation: CrossRoleFlowOperation; roles: BusinessRole[]; to: CrossRoleFlowState };

export const CROSS_ROLE_TRANSITIONS: Transition[] = [
  { from: "submitted_to_pmo", operation: "pmo_review", roles: ["pmo"], to: "pmo_reviewed" },
  { from: "pmo_reviewed", operation: "freeze_report", roles: ["pmo"], to: "report_frozen" },
  { from: "report_frozen", operation: "submit_decision", roles: ["pmo"], to: "decision_submitted" },
  { from: "decision_submitted", operation: "record_decision", roles: ["ceo", "sponsor"], to: "decision_made" },
  { from: "decision_made", operation: "dispatch_action", roles: ["pmo", "ceo", "sponsor"], to: "action_dispatched" },
  { from: "action_dispatched", operation: "acknowledge_receipt", roles: ["pm", "operations", "business_owner", "finance", "quality"], to: "receipt_acknowledged" },
  { from: "receipt_acknowledged", operation: "review_effect", roles: ["pmo"], to: "effect_reviewed" },
  { from: "effect_reviewed", operation: "close", roles: ["pmo", "ceo", "sponsor"], to: "closed" },
];

const cancellable = new Set<CrossRoleFlowState>(["submitted_to_pmo", "pmo_reviewed", "report_frozen", "decision_submitted"]);

export function nextCrossRoleState(
  state: CrossRoleFlowState,
  operation: CrossRoleFlowOperation,
  role: BusinessRole,
): CrossRoleFlowState | null {
  if (operation === "cancel" && cancellable.has(state) && ["pmo", "ceo", "sponsor"].includes(role)) return "cancelled";
  return CROSS_ROLE_TRANSITIONS.find(item => item.from === state && item.operation === operation && item.roles.includes(role))?.to ?? null;
}

export function allowedCrossRoleOperations(state: CrossRoleFlowState, role: BusinessRole): CrossRoleFlowOperation[] {
  const operations = CROSS_ROLE_TRANSITIONS.filter(item => item.from === state && item.roles.includes(role)).map(item => item.operation);
  if (cancellable.has(state) && ["pmo", "ceo", "sponsor"].includes(role)) operations.push("cancel");
  return operations;
}

export const CROSS_ROLE_STATE_LABEL: Record<CrossRoleFlowState, string> = {
  submitted_to_pmo: "已提交 PMO",
  pmo_reviewed: "PMO 已复核",
  report_frozen: "汇报已冻结",
  decision_submitted: "已提交 CEO 决策",
  decision_made: "CEO 已决策",
  action_dispatched: "行动已下发",
  receipt_acknowledged: "执行人已回执",
  effect_reviewed: "效果已复核",
  closed: "闭环完成",
  cancelled: "已取消",
};

export const CROSS_ROLE_OPERATION_LABEL: Record<CrossRoleFlowOperation, string> = {
  pmo_review: "PMO复核",
  freeze_report: "冻结汇报",
  submit_decision: "提交决策",
  record_decision: "记录决策",
  dispatch_action: "下发行动",
  acknowledge_receipt: "执行回执",
  review_effect: "效果复核",
  close: "关闭闭环",
  cancel: "取消流转",
};
