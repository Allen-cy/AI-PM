import type { Risk, RiskStatus, RiskWorkflowEvent } from "../../lib/risk.ts";
import { getRiskLevel, statusLabels } from "../../lib/risk.ts";

export type RiskClosureDecision = "approved" | "conditional";

export interface RiskClosureReviewInput {
  closureEvidence: string;
  reviewOpinion: string;
  reviewer: string;
  reviewedAt: string;
  closureDecision: RiskClosureDecision;
  dependencyDisposition: string;
  residualRisk?: string;
  followUpAction?: string;
  followUpOwner?: string;
  followUpDeadline?: string;
  lessonsLearned?: string;
}

export interface RiskClosurePackage {
  riskId: string;
  riskCode?: string;
  projectName: string;
  riskDescription: string;
  closureDecision: RiskClosureDecision;
  closureDecisionLabel: string;
  reviewer: string;
  reviewedAt: string;
  closureEvidence: string;
  reviewOpinion: string;
  dependencyDisposition: string;
  residualRisk: string;
  followUpAction: string;
  followUpOwner: string;
  followUpDeadline: string;
  lessonsLearned: string;
  inputSummary: string;
  outputSummary: string;
  actionRequired: string;
  evidenceText: string;
  reportFact: string;
}

export interface RiskClosureDashboard {
  generatedAt: string;
  summary: {
    totalRisks: number;
    closedRisks: number;
    closedWithEvidence: number;
    closureGaps: number;
    readyForClosure: number;
    highRiskClosed: number;
    conditionalClosures: number;
  };
  closurePackages: RiskClosurePackage[];
  closureGaps: Array<{
    riskId: string;
    riskCode?: string;
    projectName: string;
    riskDescription: string;
    status: RiskStatus;
    reason: string;
    nextAction: string;
  }>;
  reportFacts: string[];
  boundary: string;
}

function clean(value: unknown): string {
  return String(value ?? "").trim();
}

function isDateLike(value: string): boolean {
  if (!value) return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime());
}

function decisionLabel(decision: RiskClosureDecision): string {
  return decision === "conditional" ? "有条件关闭" : "批准关闭";
}

function parseClosureField(evidence: string | undefined, label: string): string {
  if (!evidence) return "";
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = evidence.match(new RegExp(`${escaped}[:：]\\s*([^\\n]+)`));
  return match?.[1]?.trim() ?? "";
}

function latestClosureEvent(risk: Risk, events: RiskWorkflowEvent[]): RiskWorkflowEvent | undefined {
  return events.find(event => (
    event.toStatus === "closed"
    && (event.riskId === risk.id || event.riskCode === risk.riskCode)
  ));
}

export function normalizeClosureInput(input?: Partial<RiskClosureReviewInput>): RiskClosureReviewInput {
  return {
    closureEvidence: clean(input?.closureEvidence),
    reviewOpinion: clean(input?.reviewOpinion),
    reviewer: clean(input?.reviewer),
    reviewedAt: clean(input?.reviewedAt),
    closureDecision: input?.closureDecision === "conditional" ? "conditional" : "approved",
    dependencyDisposition: clean(input?.dependencyDisposition),
    residualRisk: clean(input?.residualRisk),
    followUpAction: clean(input?.followUpAction),
    followUpOwner: clean(input?.followUpOwner),
    followUpDeadline: clean(input?.followUpDeadline),
    lessonsLearned: clean(input?.lessonsLearned),
  };
}

export function validateRiskClosureReview(risk: Risk, input?: Partial<RiskClosureReviewInput>): string[] {
  const closure = normalizeClosureInput(input);
  const errors: string[] = [];
  if (!risk.closingCriteria?.trim()) errors.push("关闭前必须先维护风险关闭条件。");
  if (!closure.closureEvidence) errors.push("关闭风险必须提交关闭证据。");
  if (!closure.reviewOpinion) errors.push("关闭风险必须填写复核意见。");
  if (!closure.reviewer) errors.push("关闭风险必须填写复核人。");
  if (!isDateLike(closure.reviewedAt)) errors.push("关闭风险必须填写有效复核日期。");
  if (!closure.dependencyDisposition) errors.push("关闭风险必须说明关联行动项、治理流程、回款/里程碑影响已处理或明确豁免。");
  if (closure.closureDecision === "conditional") {
    if (!closure.followUpAction) errors.push("有条件关闭必须填写后续动作。");
    if (!closure.followUpOwner) errors.push("有条件关闭必须填写后续动作责任人。");
    if (!isDateLike(closure.followUpDeadline || "")) errors.push("有条件关闭必须填写有效后续动作期限。");
  }
  return errors;
}

export function buildRiskClosurePackage(risk: Risk, input: Partial<RiskClosureReviewInput>): RiskClosurePackage {
  const closure = normalizeClosureInput(input);
  const residualRisk = closure.residualRisk || "无新增剩余风险，按项目常规复盘跟踪。";
  const followUpAction = closure.closureDecision === "conditional"
    ? closure.followUpAction || "补齐有条件关闭后的剩余动作。"
    : closure.followUpAction || "纳入项目复盘和组织过程资产。";
  const followUpOwner = closure.followUpOwner || closure.reviewer;
  const followUpDeadline = closure.followUpDeadline || closure.reviewedAt;
  const lessonsLearned = closure.lessonsLearned || "关闭后在项目复盘中沉淀风险触发器、应对动作有效性和预警阈值。";
  const label = decisionLabel(closure.closureDecision);
  return {
    riskId: risk.id,
    riskCode: risk.riskCode,
    projectName: risk.projectName,
    riskDescription: risk.description,
    closureDecision: closure.closureDecision,
    closureDecisionLabel: label,
    reviewer: closure.reviewer,
    reviewedAt: closure.reviewedAt,
    closureEvidence: closure.closureEvidence,
    reviewOpinion: closure.reviewOpinion,
    dependencyDisposition: closure.dependencyDisposition,
    residualRisk,
    followUpAction,
    followUpOwner,
    followUpDeadline,
    lessonsLearned,
    inputSummary: `关闭申请：关闭条件「${risk.closingCriteria}」；依赖处置「${closure.dependencyDisposition}」；剩余风险「${residualRisk}」。`,
    outputSummary: `关闭复核：${label}；复核意见「${closure.reviewOpinion}」；复核人${closure.reviewer}，复核日期${closure.reviewedAt}。`,
    actionRequired: `${followUpAction}；责任人：${followUpOwner}；deadline：${followUpDeadline}。`,
    evidenceText: [
      `关闭证据：${closure.closureEvidence}`,
      `复核意见：${closure.reviewOpinion}`,
      `复核人：${closure.reviewer}`,
      `复核日期：${closure.reviewedAt}`,
      `关闭结论：${label}`,
      `依赖处置：${closure.dependencyDisposition}`,
      `剩余风险：${residualRisk}`,
      `后续动作：${followUpAction}`,
      `经验教训：${lessonsLearned}`,
    ].join("\n"),
    reportFact: `${risk.projectName}风险「${risk.description}」已${label}，证据为${closure.closureEvidence}；复核意见：${closure.reviewOpinion}。`,
  };
}

export function riskHasClosureEvidence(risk: Risk, events: RiskWorkflowEvent[] = []): boolean {
  const event = latestClosureEvent(risk, events);
  return Boolean(
    (event?.evidence && event.outputSummary)
    || (parseClosureField(risk.evidence, "关闭证据") && parseClosureField(risk.evidence, "复核意见")),
  );
}

export function buildRiskClosureDashboard(risks: Risk[], events: RiskWorkflowEvent[] = []): RiskClosureDashboard {
  const closedRisks = risks.filter(risk => risk.status === "closed");
  const closurePackages = closedRisks
    .map(risk => {
      const event = latestClosureEvent(risk, events);
      const evidence = event?.evidence || risk.evidence || "";
      const reviewOpinion = event?.outputSummary || parseClosureField(evidence, "复核意见");
      const reviewer = event?.owner || parseClosureField(evidence, "复核人") || risk.actionOwner || risk.owner || "未指定";
      const reviewedAt = event?.createdAt?.slice(0, 10) || parseClosureField(evidence, "复核日期") || risk.updatedAt?.slice(0, 10) || "";
      if (!evidence || !reviewOpinion) return null;
      return buildRiskClosurePackage(risk, {
        closureEvidence: parseClosureField(evidence, "关闭证据") || evidence.split("\n")[0] || evidence,
        reviewOpinion,
        reviewer,
        reviewedAt,
        closureDecision: evidence.includes("有条件关闭") ? "conditional" : "approved",
        dependencyDisposition: parseClosureField(evidence, "依赖处置") || "关闭事件已记录，依赖处置见复核意见。",
        residualRisk: parseClosureField(evidence, "剩余风险"),
        followUpAction: parseClosureField(evidence, "后续动作") || event?.actionRequired,
        followUpOwner: event?.owner,
        followUpDeadline: event?.deadline,
        lessonsLearned: parseClosureField(evidence, "经验教训"),
      });
    })
    .filter((item): item is RiskClosurePackage => Boolean(item));

  const closureGaps = risks
    .filter(risk => {
      if (risk.status === "closed") return !riskHasClosureEvidence(risk, events);
      return risk.status === "resolved";
    })
    .map(risk => ({
      riskId: risk.id,
      riskCode: risk.riskCode,
      projectName: risk.projectName,
      riskDescription: risk.description,
      status: risk.status,
      reason: risk.status === "closed"
        ? "历史关闭风险缺少结构化关闭证据或复核意见。"
        : "风险已解决但尚未提交关闭证据和复核意见。",
      nextAction: risk.status === "closed"
        ? "补录关闭证据包，或退回跟踪状态重新复核。"
        : "提交关闭证据、复核意见、依赖处置说明后再关闭。",
    }));

  const readyForClosure = risks.filter(risk => (
    risk.status === "resolved"
    && Boolean(risk.closingCriteria?.trim())
    && Boolean(risk.evidence?.trim())
  )).length;
  const reportFacts = [
    ...closurePackages
      .filter(item => item.closureDecision === "conditional" || getRiskLevel(risks.find(risk => risk.id === item.riskId)?.piScore ?? 0) === "high")
      .slice(0, 6)
      .map(item => `风险关闭：${item.reportFact}`),
    ...closureGaps.slice(0, 4).map(item => `风险关闭缺口：${item.projectName} / ${statusLabels[item.status]} / ${item.reason}`),
  ];

  return {
    generatedAt: new Date().toISOString(),
    summary: {
      totalRisks: risks.length,
      closedRisks: closedRisks.length,
      closedWithEvidence: closurePackages.length,
      closureGaps: closureGaps.length,
      readyForClosure,
      highRiskClosed: closedRisks.filter(risk => getRiskLevel(risk.piScore) === "high").length,
      conditionalClosures: closurePackages.filter(item => item.closureDecision === "conditional").length,
    },
    closurePackages,
    closureGaps,
    reportFacts,
    boundary: "风险关闭证据包只记录关闭申请、复核意见、依赖处置和后续动作；关闭动作必须由使用者提交证据并确认，不允许系统自动关闭风险。",
  };
}
