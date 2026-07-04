import {
  buildRiskRetrospectiveAssetDuplicateWarnings,
  type RiskRetrospectiveAssetDuplicateWarning,
  type RiskRetrospectiveAssetRecord,
} from "./retrospective-assets.ts";

export type RiskRetrospectiveQualityGrade = "A" | "B" | "C" | "D";

export interface RiskRetrospectiveQualityItem {
  assetId: string;
  title: string;
  projectName: string;
  status: RiskRetrospectiveAssetRecord["status"];
  score: number;
  grade: RiskRetrospectiveQualityGrade;
  issues: string[];
  suggestedActions: string[];
  governanceOwner: string;
  governanceDeadline: string;
  duplicateWarningMessages: string[];
  referenceValue: "high" | "medium" | "low";
  suggestedDisposition: "keep" | "enrich" | "merge_or_archive" | "archive";
}

export interface RiskRetrospectiveQualityDashboard {
  summary: {
    totalAssets: number;
    averageScore: number;
    highQualityAssets: number;
    needsGovernance: number;
    duplicateRiskAssets: number;
    lowReusePublishedAssets: number;
  };
  items: RiskRetrospectiveQualityItem[];
  governanceQueue: RiskRetrospectiveQualityItem[];
  duplicateWarnings: RiskRetrospectiveAssetDuplicateWarning[];
  boundary: string;
}

function hasText(value: string | null | undefined): boolean {
  return Boolean(value?.trim());
}

function dateByOffset(days: number, now = new Date()): string {
  const date = new Date(now);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function grade(score: number): RiskRetrospectiveQualityGrade {
  if (score >= 85) return "A";
  if (score >= 70) return "B";
  if (score >= 55) return "C";
  return "D";
}

function referenceValue(asset: RiskRetrospectiveAssetRecord): RiskRetrospectiveQualityItem["referenceValue"] {
  if (asset.ragReferenceCount >= 3) return "high";
  if (asset.ragReferenceCount > 0 || asset.status === "published") return "medium";
  return "low";
}

function duplicateMessagesForAsset(
  asset: RiskRetrospectiveAssetRecord,
  warnings: RiskRetrospectiveAssetDuplicateWarning[],
): string[] {
  return warnings
    .filter(warning => warning.assetIds.includes(asset.id))
    .map(warning => warning.message);
}

function qualityIssues(asset: RiskRetrospectiveAssetRecord, duplicateMessages: string[]): string[] {
  const issues: string[] = [];
  if (!hasText(asset.closingEvidence)) issues.push("缺少关闭证据，不能支撑组织过程资产复用。");
  if (!hasText(asset.reviewOpinion)) issues.push("缺少复核意见，未形成 PMO 审核口径。");
  if (!hasText(asset.lessonLearned)) issues.push("缺少经验教训，后续项目难以复用。");
  if (!hasText(asset.earlyWarningRule)) issues.push("缺少早期预警规则，不能转化为监控动作。");
  if (!hasText(asset.reusablePractice)) issues.push("缺少可复用做法，无法指导同类项目行动。");
  if (!hasText(asset.applicability)) issues.push("缺少适用范围，容易被误用到不适用项目。");
  if (duplicateMessages.length > 0) issues.push("存在重复资产风险，需要合并、撤回或补充差异说明。");
  if (asset.status === "published" && asset.ragReferenceCount === 0) issues.push("已发布但暂无 RAG 引用，应复核标题、标签和预警规则可检索性。");
  return issues;
}

function scoreAsset(asset: RiskRetrospectiveAssetRecord, issues: string[]): number {
  let score = 100;
  score -= issues.length * 8;
  if (asset.status === "archived") score -= 15;
  if (asset.ragReferenceCount >= 3) score += 8;
  if (asset.ragReferenceCount >= 1) score += 4;
  if (asset.status === "published") score += 3;
  if (asset.status === "draft") score -= 10;
  return Math.max(0, Math.min(100, score));
}

function suggestedActions(
  asset: RiskRetrospectiveAssetRecord,
  issues: string[],
  duplicateMessages: string[],
): string[] {
  const actions: string[] = [];
  if (duplicateMessages.length > 0) actions.push("与重复资产对比，保留证据更完整的一条；其余撤回或合并。");
  if (issues.some(issue => issue.includes("关闭证据"))) actions.push("补充验收单、会议纪要、回款承诺或缺陷关闭记录等关闭证据。");
  if (issues.some(issue => issue.includes("经验教训"))) actions.push("补充可复用经验教训，明确下次项目应提前做什么。");
  if (issues.some(issue => issue.includes("预警规则"))) actions.push("补充可监控的早期预警规则，例如阈值、触发条件和责任人。");
  if (issues.some(issue => issue.includes("适用范围"))) actions.push("补充适用项目类型、阶段、客户或影响领域边界。");
  if (asset.status === "published" && asset.ragReferenceCount === 0) actions.push("优化标题、标签和别名，或撤回低复用资产。");
  if (actions.length === 0) actions.push("保持发布状态，定期观察 RAG 引用次数和同类项目命中情况。");
  return actions;
}

function disposition(score: number, duplicateMessages: string[], asset: RiskRetrospectiveAssetRecord): RiskRetrospectiveQualityItem["suggestedDisposition"] {
  if (asset.status === "archived") return "archive";
  if (duplicateMessages.length > 0) return "merge_or_archive";
  if (score < 70) return "enrich";
  return "keep";
}

export function buildRiskRetrospectiveQualityDashboard(
  assets: RiskRetrospectiveAssetRecord[],
  now = new Date(),
): RiskRetrospectiveQualityDashboard {
  const duplicateWarnings = buildRiskRetrospectiveAssetDuplicateWarnings(assets);
  const items = assets.map(asset => {
    const duplicateWarningMessages = duplicateMessagesForAsset(asset, duplicateWarnings);
    const issues = qualityIssues(asset, duplicateWarningMessages);
    const score = scoreAsset(asset, issues);
    return {
      assetId: asset.id,
      title: asset.title,
      projectName: asset.projectName,
      status: asset.status,
      score,
      grade: grade(score),
      issues,
      suggestedActions: suggestedActions(asset, issues, duplicateWarningMessages),
      governanceOwner: "PMO知识管理员",
      governanceDeadline: dateByOffset(score < 55 ? 7 : 14, now),
      duplicateWarningMessages,
      referenceValue: referenceValue(asset),
      suggestedDisposition: disposition(score, duplicateWarningMessages, asset),
    };
  }).sort((a, b) => a.score - b.score || a.title.localeCompare(b.title, "zh-CN"));

  const governanceQueue = items.filter(item => (
    item.score < 85
    || item.duplicateWarningMessages.length > 0
    || item.suggestedDisposition !== "keep"
  ));
  const averageScore = items.length === 0 ? 0 : Math.round(items.reduce((sum, item) => sum + item.score, 0) / items.length);

  return {
    summary: {
      totalAssets: items.length,
      averageScore,
      highQualityAssets: items.filter(item => item.score >= 85).length,
      needsGovernance: governanceQueue.length,
      duplicateRiskAssets: items.filter(item => item.duplicateWarningMessages.length > 0).length,
      lowReusePublishedAssets: assets.filter(asset => asset.status === "published" && asset.ragReferenceCount === 0).length,
    },
    items,
    governanceQueue,
    duplicateWarnings,
    boundary: "质量评分用于 PMO 知识治理排队和复盘资产维护，不自动删除、合并或撤回资产；所有治理动作仍需管理员人工确认。",
  };
}
