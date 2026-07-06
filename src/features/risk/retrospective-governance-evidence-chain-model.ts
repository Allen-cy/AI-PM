import {
  isTerminalGovernanceState,
  type GovernanceActionRecord,
  type GovernanceEventRecord,
  type GovernanceInstanceRecord,
} from "../governance/model.ts";
import type { RiskRetrospectiveGovernanceFollowupRecord, RiskRetrospectiveGovernanceFollowupStatus } from "./retrospective-governance-followups.ts";
import type { RiskRetrospectiveGovernanceReminderLog } from "./retrospective-governance-operations.ts";

export interface KnowledgeGovernanceFollowupWritebackRecommendation {
  targetFollowupStatus: Extract<RiskRetrospectiveGovernanceFollowupStatus, "处理中" | "待验收" | "已关闭">;
  closureNote: string;
  reviewResult: string;
  evidenceSummary: string;
  sourceEvents: string[];
  riskWarnings: string[];
  boundary: string;
}

function terminalRejectedState(state: string): boolean {
  return ["已驳回", "已拒绝", "暂停"].includes(state);
}

export function buildKnowledgeGovernanceWritebackRecommendation(input: {
  followup?: RiskRetrospectiveGovernanceFollowupRecord;
  reminderLog?: RiskRetrospectiveGovernanceReminderLog;
  governanceInstance?: GovernanceInstanceRecord;
  governanceEvents?: GovernanceEventRecord[];
  governanceActions?: GovernanceActionRecord[];
  override?: {
    targetFollowupStatus?: Extract<RiskRetrospectiveGovernanceFollowupStatus, "处理中" | "待验收" | "已关闭">;
    closureNote?: string;
    reviewResult?: string;
  };
}): KnowledgeGovernanceFollowupWritebackRecommendation {
  const instance = input.governanceInstance;
  const followup = input.followup;
  const events = input.governanceEvents ?? [];
  const latestEvent = events[events.length - 1];
  const state = instance?.state ?? "未创建治理流程";
  const targetFollowupStatus = input.override?.targetFollowupStatus
    ?? (terminalRejectedState(state) ? "处理中" : isTerminalGovernanceState(state) ? "待验收" : "处理中");
  const sourceEvents = events.slice(-5).map(event => `${event.createdAt}｜${event.actorName || "系统"}｜${event.eventType}｜${event.fromState || "-"} → ${event.toState}｜${event.comment || event.decision || "无备注"}`);
  const actionEvidence = (input.governanceActions ?? [])
    .filter(action => action.closeEvidence)
    .map(action => `${action.title}：${action.closeEvidence}`)
    .slice(0, 3);
  const evidenceSummary = [
    `治理流程：${instance?.workflowName || "未找到"} / ${instance?.title || "未找到"}`,
    `当前状态：${state}`,
    `来源待办：${followup?.assetTitle || "未找到二次治理待办"}`,
    `来源提醒：${input.reminderLog?.title || "未找到运营提醒"}`,
    latestEvent ? `最近事件：${latestEvent.eventType}，${latestEvent.comment || latestEvent.decision || "无备注"}` : "最近事件：暂无",
    ...actionEvidence.map(item => `行动项证据：${item}`),
  ].join("\n");
  const riskWarnings = [
    !followup ? "缺少二次治理待办，不能直接反写。" : "",
    !instance ? "缺少治理流程实例，不能判断治理结果。" : "",
    instance && !isTerminalGovernanceState(state) && !terminalRejectedState(state)
      ? "治理流程尚未到达终态，只能建议保持处理中。"
      : "",
    followup?.status === "已关闭" ? "二次治理待办已经关闭，反写时只能追加复核说明，不能覆盖原关闭证据。" : "",
  ].filter(Boolean);
  const generatedClosureNote = [
    "【治理流程反写建议】",
    `建议状态：${targetFollowupStatus}`,
    evidenceSummary,
  ].join("\n");
  const generatedReviewResult = [
    `PMO复核建议：治理流程当前为“${state}”，建议将二次治理待办更新为“${targetFollowupStatus}”。`,
    targetFollowupStatus === "待验收" ? "请责任人补齐关闭证据后再最终关闭。" : "请继续推进治理应对，不建议直接关闭。",
  ].join("\n");
  return {
    targetFollowupStatus,
    closureNote: input.override?.closureNote?.trim() || generatedClosureNote,
    reviewResult: input.override?.reviewResult?.trim() || generatedReviewResult,
    evidenceSummary,
    sourceEvents,
    riskWarnings,
    boundary: "仅生成反写建议；必须由PMO或授权用户显式确认后，才会反写二次治理待办状态和证据。",
  };
}
