import type { Risk, RiskWorkflowEvent } from "../../lib/risk.ts";
import { categoryLabels, getRiskLevel, impactAreaLabels } from "../../lib/risk.ts";
import {
  buildRiskClosureDashboard,
  type RiskClosureDashboard,
  type RiskClosurePackage,
} from "./closure.ts";

export interface RiskRetrospectiveKnowledgeCard {
  id: string;
  title: string;
  projectName: string;
  riskDescription: string;
  category: string;
  impactArea: string;
  severity: "high" | "medium" | "low";
  trigger: string;
  effectiveResponse: string;
  closingEvidence: string;
  reviewOpinion: string;
  lessonLearned: string;
  earlyWarningRule: string;
  reusablePractice: string;
  tags: string[];
  sourceRiskId: string;
}

export interface RiskRetrospectiveEarlyWarningRule {
  id: string;
  title: string;
  rule: string;
  projectName: string;
  trigger: string;
  sourceRiskId: string;
  suggestedOwner: string;
  severity: "high" | "medium" | "low";
}

export interface RiskRetrospectiveMissingLesson {
  riskId: string;
  riskCode?: string;
  projectName: string;
  riskDescription: string;
  reason: string;
  nextAction: string;
}

export interface RiskRetrospectiveDashboard {
  generatedAt: string;
  summary: {
    closedRisks: number;
    retrospectiveCandidates: number;
    highRiskRetrospectives: number;
    knowledgeCards: number;
    warningRules: number;
    missingLessons: number;
  };
  knowledgeCards: RiskRetrospectiveKnowledgeCard[];
  earlyWarningRules: RiskRetrospectiveEarlyWarningRule[];
  missingLessons: RiskRetrospectiveMissingLesson[];
  markdown: string;
  reportFacts: string[];
  boundary: string;
}

const DEFAULT_LESSON_MARKER = "关闭后在项目复盘中沉淀";

function compact(value: unknown, fallback = "未填写"): string {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function normalizeTag(value: string): string {
  return value.replace(/\s+/g, "").replace(/[，。；、]/g, "");
}

function findRiskForPackage(risks: Risk[], item: RiskClosurePackage): Risk | undefined {
  return risks.find(risk => risk.id === item.riskId || risk.riskCode === item.riskCode);
}

function isExplicitLesson(item: RiskClosurePackage): boolean {
  const lesson = item.lessonsLearned.trim();
  return Boolean(lesson) && !lesson.includes(DEFAULT_LESSON_MARKER);
}

function deriveWarningRule(risk: Risk, item: RiskClosurePackage): string {
  const trigger = compact(risk.trigger, risk.description);
  const impactArea = impactAreaLabels[risk.impactArea] ?? risk.impactArea;
  const owner = compact(risk.owner || item.followUpOwner, "项目经理");
  return `当${impactArea}出现「${trigger}」且概率或影响评分连续上升时，由${owner}在下一次复核前完成应对有效性检查，并同步关联模块。`;
}

function deriveReusablePractice(risk: Risk, item: RiskClosurePackage): string {
  const response = compact(risk.responseStrategy, item.followUpAction);
  const preventiveAction = compact(risk.preventiveAction, "在阶段门检查中前置验证触发器和责任人。");
  return `复用做法：${response}；前置动作：${preventiveAction}；关闭时必须保留证据、依赖处置和复核意见。`;
}

function buildKnowledgeCard(risk: Risk, item: RiskClosurePackage): RiskRetrospectiveKnowledgeCard {
  const severity = getRiskLevel(risk.piScore);
  const trigger = compact(risk.trigger, risk.description);
  const category = categoryLabels[risk.category] ?? risk.category;
  const impactArea = impactAreaLabels[risk.impactArea] ?? risk.impactArea;
  const earlyWarningRule = deriveWarningRule(risk, item);
  return {
    id: `retrospective-${item.riskId}`,
    title: `${risk.projectName} · ${category}复盘卡`,
    projectName: risk.projectName,
    riskDescription: risk.description,
    category,
    impactArea,
    severity,
    trigger,
    effectiveResponse: compact(risk.responseStrategy, item.followUpAction),
    closingEvidence: item.closureEvidence,
    reviewOpinion: item.reviewOpinion,
    lessonLearned: item.lessonsLearned,
    earlyWarningRule,
    reusablePractice: deriveReusablePractice(risk, item),
    tags: [
      normalizeTag(category),
      normalizeTag(impactArea),
      severity === "high" ? "高风险复盘" : "风险复盘",
      item.closureDecision === "conditional" ? "有条件关闭" : "批准关闭",
    ],
    sourceRiskId: item.riskId,
  };
}

function buildMarkdown(dashboard: Omit<RiskRetrospectiveDashboard, "markdown">): string {
  return [
    "# 风险复盘清单与组织过程资产",
    "",
    `生成时间：${dashboard.generatedAt}`,
    "",
    "## 一、复盘概览",
    `- 已关闭风险：${dashboard.summary.closedRisks}`,
    `- 可形成复盘资产：${dashboard.summary.retrospectiveCandidates}`,
    `- 高风险复盘：${dashboard.summary.highRiskRetrospectives}`,
    `- 知识卡片：${dashboard.summary.knowledgeCards}`,
    `- 早期预警规则：${dashboard.summary.warningRules}`,
    `- 待补复盘：${dashboard.summary.missingLessons}`,
    "",
    "## 二、风险复盘知识卡",
    ...(dashboard.knowledgeCards.length > 0
      ? dashboard.knowledgeCards.flatMap(card => [
        `### ${card.title}`,
        `- 项目：${card.projectName}`,
        `- 风险：${card.riskDescription}`,
        `- 类型/影响：${card.category} / ${card.impactArea}`,
        `- 触发器：${card.trigger}`,
        `- 有效应对：${card.effectiveResponse}`,
        `- 关闭证据：${card.closingEvidence}`,
        `- 复核意见：${card.reviewOpinion}`,
        `- 经验教训：${card.lessonLearned}`,
        `- 可复用做法：${card.reusablePractice}`,
        "",
      ])
      : ["暂无可沉淀的风险复盘知识卡。", ""]),
    "## 三、早期预警规则",
    ...(dashboard.earlyWarningRules.length > 0
      ? dashboard.earlyWarningRules.map(rule => `- ${rule.title}：${rule.rule}`)
      : ["- 暂无早期预警规则。"]),
    "",
    "## 四、待补复盘事项",
    ...(dashboard.missingLessons.length > 0
      ? dashboard.missingLessons.map(item => `- ${item.projectName} / ${item.riskDescription}：${item.reason}；下一步：${item.nextAction}`)
      : ["- 暂无待补复盘事项。"]),
    "",
    "## 五、使用边界",
    dashboard.boundary,
  ].join("\n");
}

export function buildRiskRetrospectiveDashboard(
  risks: Risk[],
  events: RiskWorkflowEvent[] = [],
  closureDashboard?: RiskClosureDashboard,
): RiskRetrospectiveDashboard {
  const closure = closureDashboard ?? buildRiskClosureDashboard(risks, events);
  const candidates = closure.closurePackages
    .map(item => ({ item, risk: findRiskForPackage(risks, item) }))
    .filter((entry): entry is { item: RiskClosurePackage; risk: Risk } => Boolean(entry.risk));

  const knowledgeCards = candidates.map(entry => buildKnowledgeCard(entry.risk, entry.item));
  const earlyWarningRules: RiskRetrospectiveEarlyWarningRule[] = knowledgeCards.map(card => ({
    id: `warning-${card.sourceRiskId}`,
    title: `${card.projectName} · ${card.impactArea}预警`,
    rule: card.earlyWarningRule,
    projectName: card.projectName,
    trigger: card.trigger,
    sourceRiskId: card.sourceRiskId,
    suggestedOwner: candidates.find(entry => entry.item.riskId === card.sourceRiskId)?.risk.owner ?? "项目经理",
    severity: card.severity,
  }));
  const missingLessons: RiskRetrospectiveMissingLesson[] = [
    ...candidates
      .filter(entry => !isExplicitLesson(entry.item))
      .map(entry => ({
        riskId: entry.risk.id,
        riskCode: entry.risk.riskCode,
        projectName: entry.risk.projectName,
        riskDescription: entry.risk.description,
        reason: "关闭证据包缺少明确的经验教训，当前只能生成通用复盘建议。",
        nextAction: "由风险责任人补充触发器、有效动作、无效动作和下次预警阈值。",
      })),
    ...closure.closureGaps.map(item => ({
      riskId: item.riskId,
      riskCode: item.riskCode,
      projectName: item.projectName,
      riskDescription: item.riskDescription,
      reason: item.reason,
      nextAction: `先补齐关闭证据，再进入复盘沉淀。${item.nextAction}`,
    })),
  ];

  const boundary = "风险复盘资产来自已关闭风险的证据包和人工复核意见；AI只负责整理、提炼和生成预警建议，不替代复盘会确认，也不自动写入知识库或飞书。";
  const reportFacts = [
    `风险复盘资产：已形成${knowledgeCards.length}张知识卡，${earlyWarningRules.length}条预警规则，待补复盘${missingLessons.length}项。`,
    ...knowledgeCards.slice(0, 5).map(card => `复盘卡：${card.projectName} / ${card.category} / 经验教训：${card.lessonLearned}`),
    ...missingLessons.slice(0, 3).map(item => `复盘缺口：${item.projectName} / ${item.reason}`),
  ];
  const dashboardWithoutMarkdown = {
    generatedAt: new Date().toISOString(),
    summary: {
      closedRisks: closure.summary.closedRisks,
      retrospectiveCandidates: candidates.length,
      highRiskRetrospectives: knowledgeCards.filter(item => item.severity === "high").length,
      knowledgeCards: knowledgeCards.length,
      warningRules: earlyWarningRules.length,
      missingLessons: missingLessons.length,
    },
    knowledgeCards,
    earlyWarningRules,
    missingLessons,
    reportFacts,
    boundary,
  };

  return {
    ...dashboardWithoutMarkdown,
    markdown: buildMarkdown(dashboardWithoutMarkdown),
  };
}
