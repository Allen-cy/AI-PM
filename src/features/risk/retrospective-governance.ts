import { createClient } from "@supabase/supabase-js";
import {
  buildRiskRetrospectiveAssetDuplicateWarnings,
  type RiskRetrospectiveAssetRecord,
} from "./retrospective-assets.ts";
import {
  buildRiskRetrospectiveQualityDashboard,
  type RiskRetrospectiveQualityDashboard,
} from "./retrospective-quality.ts";

export type RiskRetrospectiveGovernanceAction = "edit" | "merge" | "archive" | "review" | "publish";

export interface RiskRetrospectiveGovernanceLog {
  id: string;
  assetId: string | null;
  targetAssetId: string | null;
  action: RiskRetrospectiveGovernanceAction;
  actionLabel: string;
  actionSummary: string;
  beforeTitle: string | null;
  afterTitle: string | null;
  beforeStatus: string | null;
  afterStatus: string | null;
  beforeSnapshot: unknown;
  afterSnapshot: unknown;
  performedByName: string | null;
  requestId: string | null;
  createdAt: string;
}

export interface RiskRetrospectiveGovernanceEffectItem {
  logId: string;
  action: RiskRetrospectiveGovernanceAction;
  actionLabel: string;
  assetTitle: string;
  createdAt: string;
  beforeScore: number | null;
  afterScore: number | null;
  qualityDelta: number;
  beforeGrade: string | null;
  afterGrade: string | null;
  ragReferenceDelta: number;
  duplicateRiskDelta: number;
  effectConclusion: string;
}

export type RiskRetrospectiveGovernanceActionItemPriority = "high" | "medium" | "low";

export interface RiskRetrospectiveGovernanceActionItem {
  id: string;
  sourceLogId: string;
  assetTitle: string;
  reason: string;
  actionRequired: string;
  owner: string;
  deadline: string;
  priority: RiskRetrospectiveGovernanceActionItemPriority;
  status: "pending_review";
  closingCriteria: string;
  reminderText: string;
}

export interface RiskRetrospectiveGovernanceEffect {
  monthlyActions: number;
  qualityScoreLift: number;
  improvedActions: number;
  unchangedActions: number;
  declinedActions: number;
  referencedAssets: number;
  ragReferenceGrowth: number;
  duplicateRiskReduction: number;
  latestEffectAt: string | null;
  items: RiskRetrospectiveGovernanceEffectItem[];
  actionItems: RiskRetrospectiveGovernanceActionItem[];
  reminders: RiskRetrospectiveGovernanceActionItem[];
}

export interface RiskRetrospectiveGovernanceDashboard {
  summary: {
    totalLogs: number;
    editActions: number;
    mergeActions: number;
    statusActions: number;
    touchedAssets: number;
    latestActionAt: string | null;
    currentAverageQualityScore: number;
  };
  logs: RiskRetrospectiveGovernanceLog[];
  effect: RiskRetrospectiveGovernanceEffect;
  reportMarkdown: string;
  boundary: string;
}

export type RiskRetrospectiveGovernanceLogListResult =
  | { status: "succeeded"; logs: RiskRetrospectiveGovernanceLog[] }
  | { status: "not_configured"; logs: RiskRetrospectiveGovernanceLog[]; warning: string }
  | { status: "failed"; logs: RiskRetrospectiveGovernanceLog[]; warning: string };

const GOVERNANCE_SQL_FILE = "supabase-v5334-risk-retrospective-governance.sql";

function isStorageConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error("Supabase auth storage is not configured");
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function isMissingGovernanceLogTableError(message?: string): boolean {
  const normalized = (message ?? "").toLowerCase();
  return normalized.includes("risk_retrospective_asset_governance_logs")
    && (
      normalized.includes("does not exist")
      || normalized.includes("relation")
      || normalized.includes("schema cache")
      || normalized.includes("could not find")
    );
}

function actionLabel(action: RiskRetrospectiveGovernanceAction): string {
  return {
    edit: "补充编辑",
    merge: "合并资产",
    archive: "撤回归档",
    review: "恢复待发布",
    publish: "发布RAG",
  }[action];
}

function snapshotText(row: Record<string, unknown>, key: "before_snapshot" | "after_snapshot", field: string): string | null {
  const snapshot = row[key];
  if (!snapshot || typeof snapshot !== "object") return null;
  const value = (snapshot as Record<string, unknown>)[field];
  return value === undefined || value === null ? null : String(value);
}

function mapGovernanceLog(row: Record<string, unknown>): RiskRetrospectiveGovernanceLog {
  const action = String(row.action ?? "edit") as RiskRetrospectiveGovernanceAction;
  return {
    id: String(row.id),
    assetId: row.asset_id ? String(row.asset_id) : null,
    targetAssetId: row.target_asset_id ? String(row.target_asset_id) : null,
    action,
    actionLabel: actionLabel(action),
    actionSummary: String(row.action_summary ?? ""),
    beforeTitle: snapshotText(row, "before_snapshot", "title"),
    afterTitle: snapshotText(row, "after_snapshot", "title"),
    beforeStatus: snapshotText(row, "before_snapshot", "status"),
    afterStatus: snapshotText(row, "after_snapshot", "status"),
    beforeSnapshot: row.before_snapshot ?? null,
    afterSnapshot: row.after_snapshot ?? null,
    performedByName: row.performed_by_name ? String(row.performed_by_name) : null,
    requestId: row.request_id ? String(row.request_id) : null,
    createdAt: String(row.created_at ?? ""),
  };
}

export async function listRiskRetrospectiveGovernanceLogs(input?: {
  limit?: number;
  action?: RiskRetrospectiveGovernanceAction | "all";
  assetId?: string;
}): Promise<RiskRetrospectiveGovernanceLogListResult> {
  if (!isStorageConfigured()) {
    return { status: "not_configured", logs: [], warning: "Supabase 未配置，无法读取风险复盘资产治理审计。" };
  }

  try {
    const supabase = getSupabase();
    let query = supabase
      .from("risk_retrospective_asset_governance_logs")
      .select("id,asset_id,target_asset_id,action,action_summary,before_snapshot,after_snapshot,performed_by_name,request_id,created_at")
      .order("created_at", { ascending: false })
      .limit(input?.limit ?? 50);
    if (input?.action && input.action !== "all") query = query.eq("action", input.action);
    if (input?.assetId) query = query.or(`asset_id.eq.${input.assetId},target_asset_id.eq.${input.assetId}`);

    const { data, error } = await query;
    if (error) {
      return {
        status: isMissingGovernanceLogTableError(error.message) ? "not_configured" : "failed",
        logs: [],
        warning: isMissingGovernanceLogTableError(error.message)
          ? `风险复盘资产治理审计 SQL 未执行：请在 Supabase SQL Editor 执行 ${GOVERNANCE_SQL_FILE}。`
          : error.message,
      };
    }
    return { status: "succeeded", logs: (data ?? []).map(row => mapGovernanceLog(row as unknown as Record<string, unknown>)) };
  } catch (error) {
    return {
      status: "failed",
      logs: [],
      warning: error instanceof Error ? error.message : "读取风险复盘资产治理审计失败。",
    };
  }
}

function markdownTable(rows: string[][]): string[] {
  if (rows.length === 0) return ["暂无记录。"];
  const header = rows[0];
  return [
    `| ${header.join(" | ")} |`,
    `| ${header.map(() => "---").join(" | ")} |`,
    ...rows.slice(1).map(row => `| ${row.map(cell => String(cell).replace(/\|/g, "｜")).join(" | ")} |`),
  ];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasAssetShape(value: unknown): value is RiskRetrospectiveAssetRecord {
  return isRecord(value) && typeof value.id === "string" && typeof value.title === "string";
}

function activeAssets(assets: RiskRetrospectiveAssetRecord[]): RiskRetrospectiveAssetRecord[] {
  const active = assets.filter(asset => asset.status !== "archived");
  return active.length > 0 ? active : assets;
}

function snapshotAssets(snapshot: unknown): RiskRetrospectiveAssetRecord[] {
  if (hasAssetShape(snapshot)) return [snapshot];
  if (!isRecord(snapshot)) return [];
  return [snapshot.source, snapshot.target].filter(hasAssetShape);
}

function snapshotTitle(log: RiskRetrospectiveGovernanceLog, afterAssets: RiskRetrospectiveAssetRecord[], beforeAssets: RiskRetrospectiveAssetRecord[]): string {
  const activeAfter = activeAssets(afterAssets);
  return log.afterTitle
    || activeAfter[0]?.title
    || log.beforeTitle
    || activeAssets(beforeAssets)[0]?.title
    || log.assetId
    || "未知资产";
}

function averageQuality(assets: RiskRetrospectiveAssetRecord[]): { score: number | null; grade: string | null } {
  const scopedAssets = activeAssets(assets);
  if (scopedAssets.length === 0) return { score: null, grade: null };
  const dashboard = buildRiskRetrospectiveQualityDashboard(scopedAssets);
  if (dashboard.items.length === 0) return { score: null, grade: null };
  const score = dashboard.summary.averageScore;
  return {
    score,
    grade: dashboard.items.length === 1
      ? dashboard.items[0]?.grade ?? null
      : score >= 85
        ? "A"
        : score >= 70
          ? "B"
          : score >= 55
            ? "C"
            : "D",
  };
}

function sumRagReferences(assets: RiskRetrospectiveAssetRecord[]): number {
  return activeAssets(assets).reduce((sum, asset) => sum + asset.ragReferenceCount, 0);
}

function duplicateRiskCount(assets: RiskRetrospectiveAssetRecord[]): number {
  return buildRiskRetrospectiveAssetDuplicateWarnings(assets).length;
}

function effectConclusion(item: Omit<RiskRetrospectiveGovernanceEffectItem, "effectConclusion">): string {
  if (item.qualityDelta > 0 && item.duplicateRiskDelta > 0) return "质量提升且重复风险下降，治理动作产生正向复用价值。";
  if (item.qualityDelta > 0) return "资产完整度提升，建议继续观察 RAG 引用是否增长。";
  if (item.duplicateRiskDelta > 0) return "重复风险下降，资产库更利于检索和复用。";
  if (item.ragReferenceDelta > 0) return "治理后引用增加，复用价值开始体现。";
  if (item.qualityDelta < 0) return "质量分下降，需复核是否因撤回、归档或字段缺失导致。";
  return "暂未看到质量或复用指标变化，建议在后续使用中继续观察。";
}

function monthKey(value: Date): string {
  return value.toISOString().slice(0, 7);
}

function dateByOffset(days: number, from = new Date()): string {
  const date = new Date(from);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function itemDate(item: RiskRetrospectiveGovernanceEffectItem): Date {
  const date = new Date(item.createdAt);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function actionItemReason(item: RiskRetrospectiveGovernanceEffectItem): string | null {
  if (item.qualityDelta < 0) return "治理后质量分下降，需要复核字段完整性、归档原因和是否误撤回高价值资产。";
  if ((item.afterScore ?? 100) < 70) return "治理后质量分仍低于70，尚未达到可稳定复用的组织过程资产标准。";
  if (item.qualityDelta === 0 && (item.afterScore ?? 0) < 85) return "治理后质量分未改善，需确认补充动作是否真正解决关闭证据、经验教训或预警规则缺口。";
  if ((item.action === "publish" || item.action === "review") && item.ragReferenceDelta <= 0) return "资产已进入可复用状态但暂无 RAG 引用增长，需要优化标题、标签、别名或适用范围。";
  if (item.action === "merge" && item.duplicateRiskDelta <= 0) return "合并动作后重复风险未下降，需要复核主资产选择和源资产归档是否完整。";
  return null;
}

function actionItemPriority(item: RiskRetrospectiveGovernanceEffectItem, reason: string): RiskRetrospectiveGovernanceActionItemPriority {
  if (item.qualityDelta < 0 || reason.includes("低于70")) return "high";
  if (reason.includes("重复风险") || reason.includes("暂无 RAG 引用")) return "medium";
  return "low";
}

function actionItemRequired(reason: string): string {
  if (reason.includes("质量分下降")) return "重新打开复盘资产，核对关闭证据、经验教训、预警规则和状态变更依据，必要时补充后再发布。";
  if (reason.includes("低于70")) return "补齐关闭证据、复核意见、经验教训、早期预警规则、可复用做法和适用范围。";
  if (reason.includes("未改善")) return "对照治理前后快照逐项检查差异，补充能改变质量评分的实质字段。";
  if (reason.includes("RAG 引用")) return "优化资产标题、标签、别名、适用范围和预警规则，并在知识问答中做一次验证检索。";
  if (reason.includes("重复风险")) return "复核重复资产组，保留证据最完整的主资产，撤回或合并低质量重复项。";
  return "PMO知识管理员复核治理动作有效性，并给出二次治理结论。";
}

function closingCriteria(reason: string): string {
  if (reason.includes("RAG 引用")) return "资产能被知识问答命中，或 PMO 确认该资产暂不需要进入 RAG 推荐。";
  if (reason.includes("重复风险")) return "重复资产提示下降，或 PMO 在资产中补充差异化适用说明。";
  return "二次治理后质量分提升至70以上，且关键字段不再缺失。";
}

function buildActionItems(items: RiskRetrospectiveGovernanceEffectItem[]): RiskRetrospectiveGovernanceActionItem[] {
  return items.flatMap(item => {
    const reason = actionItemReason(item);
    if (!reason) return [];
    const priority = actionItemPriority(item, reason);
    const deadline = dateByOffset(priority === "high" ? 3 : priority === "medium" ? 7 : 14, itemDate(item));
    return [{
      id: `risk-retro-governance-action:${item.logId}`,
      sourceLogId: item.logId,
      assetTitle: item.assetTitle,
      reason,
      actionRequired: actionItemRequired(reason),
      owner: "PMO知识管理员",
      deadline,
      priority,
      status: "pending_review" as const,
      closingCriteria: closingCriteria(reason),
      reminderText: `${deadline} 前完成「${item.assetTitle}」二次治理：${reason}`,
    }];
  }).sort((a, b) => {
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    return priorityOrder[a.priority] - priorityOrder[b.priority] || a.deadline.localeCompare(b.deadline);
  });
}

export function buildRiskRetrospectiveGovernanceEffect(input: {
  logs: RiskRetrospectiveGovernanceLog[];
  currentAssets?: RiskRetrospectiveAssetRecord[];
  now?: Date;
}): RiskRetrospectiveGovernanceEffect {
  const now = input.now ?? new Date();
  const currentMonth = monthKey(now);
  const items = input.logs.map(log => {
    const beforeAssets = snapshotAssets(log.beforeSnapshot);
    const afterAssets = snapshotAssets(log.afterSnapshot);
    const beforeQuality = averageQuality(beforeAssets);
    const afterQuality = averageQuality(afterAssets);
    const qualityDelta = beforeQuality.score === null || afterQuality.score === null ? 0 : afterQuality.score - beforeQuality.score;
    const ragReferenceDelta = sumRagReferences(afterAssets) - sumRagReferences(beforeAssets);
    const duplicateRiskDelta = duplicateRiskCount(beforeAssets) - duplicateRiskCount(afterAssets);
    const itemWithoutConclusion = {
      logId: log.id,
      action: log.action,
      actionLabel: log.actionLabel,
      assetTitle: snapshotTitle(log, afterAssets, beforeAssets),
      createdAt: log.createdAt,
      beforeScore: beforeQuality.score,
      afterScore: afterQuality.score,
      qualityDelta,
      beforeGrade: beforeQuality.grade,
      afterGrade: afterQuality.grade,
      ragReferenceDelta,
      duplicateRiskDelta,
    };
    return {
      ...itemWithoutConclusion,
      effectConclusion: effectConclusion(itemWithoutConclusion),
    };
  });
  const actionItems = buildActionItems(items);
  return {
    monthlyActions: input.logs.filter(log => log.createdAt.startsWith(currentMonth)).length,
    qualityScoreLift: items.reduce((sum, item) => sum + item.qualityDelta, 0),
    improvedActions: items.filter(item => item.qualityDelta > 0).length,
    unchangedActions: items.filter(item => item.qualityDelta === 0).length,
    declinedActions: items.filter(item => item.qualityDelta < 0).length,
    referencedAssets: new Set([
      ...(input.currentAssets ?? []).filter(asset => asset.ragReferenceCount > 0).map(asset => asset.id),
      ...input.logs
        .flatMap(log => snapshotAssets(log.afterSnapshot))
        .filter(asset => asset.ragReferenceCount > 0)
        .map(asset => asset.id),
    ]).size,
    ragReferenceGrowth: items.reduce((sum, item) => sum + item.ragReferenceDelta, 0),
    duplicateRiskReduction: items.reduce((sum, item) => sum + item.duplicateRiskDelta, 0),
    latestEffectAt: items[0]?.createdAt ?? null,
    items,
    actionItems,
    reminders: actionItems.slice(0, 5),
  };
}

export function buildRiskRetrospectiveGovernanceDashboard(input: {
  assets: RiskRetrospectiveAssetRecord[];
  logs: RiskRetrospectiveGovernanceLog[];
  quality: RiskRetrospectiveQualityDashboard | null;
}): RiskRetrospectiveGovernanceDashboard {
  const touchedAssets = new Set(input.logs.flatMap(log => [log.assetId, log.targetAssetId]).filter(Boolean));
  const effect = buildRiskRetrospectiveGovernanceEffect({ logs: input.logs, currentAssets: input.assets });
  const summary = {
    totalLogs: input.logs.length,
    editActions: input.logs.filter(log => log.action === "edit").length,
    mergeActions: input.logs.filter(log => log.action === "merge").length,
    statusActions: input.logs.filter(log => log.action === "publish" || log.action === "archive" || log.action === "review").length,
    touchedAssets: touchedAssets.size,
    latestActionAt: input.logs[0]?.createdAt ?? null,
    currentAverageQualityScore: input.quality?.summary.averageScore ?? 0,
  };
  const qualityRows = input.quality?.items.slice(0, 8).map(item => [
    item.title,
    `${item.grade}/${item.score}`,
    item.suggestedDisposition,
    item.governanceOwner,
    item.governanceDeadline,
  ]) ?? [];
  const effectRows = effect.items.slice(0, 12).map(item => [
    item.createdAt.slice(0, 10),
    item.actionLabel,
    item.assetTitle,
    item.beforeScore === null ? "暂无" : String(item.beforeScore),
    item.afterScore === null ? "暂无" : String(item.afterScore),
    item.qualityDelta > 0 ? `+${item.qualityDelta}` : String(item.qualityDelta),
    item.effectConclusion,
  ]);
  const actionItemRows = effect.actionItems.slice(0, 12).map(item => [
    item.priority === "high" ? "高" : item.priority === "medium" ? "中" : "低",
    item.assetTitle,
    item.owner,
    item.deadline,
    item.reason,
    item.closingCriteria,
  ]);
  const logRows = input.logs.slice(0, 12).map(log => [
    log.createdAt.slice(0, 10),
    log.actionLabel,
    log.afterTitle || log.beforeTitle || log.assetId || "未知资产",
    log.performedByName || "系统",
    log.actionSummary,
  ]);
  const reportMarkdown = [
    "# 风险复盘资产治理报告",
    "",
    "## 概览",
    "",
    `- 当前资产数：${input.assets.length}`,
    `- 治理动作数：${summary.totalLogs}`,
    `- 补充编辑：${summary.editActions}`,
    `- 合并资产：${summary.mergeActions}`,
    `- 状态动作：${summary.statusActions}`,
    `- 涉及资产：${summary.touchedAssets}`,
    `- 当前质量均分：${summary.currentAverageQualityScore}`,
    `- 最近动作时间：${summary.latestActionAt || "暂无"}`,
    "",
    "## 治理效果趋势",
    "",
    `- 本月治理动作：${effect.monthlyActions}`,
    `- 质量分净变化：${effect.qualityScoreLift > 0 ? `+${effect.qualityScoreLift}` : effect.qualityScoreLift}`,
    `- 质量提升动作：${effect.improvedActions}`,
    `- 质量下降动作：${effect.declinedActions}`,
    `- 被 RAG 引用资产数：${effect.referencedAssets}`,
    `- RAG 引用增长：${effect.ragReferenceGrowth > 0 ? `+${effect.ragReferenceGrowth}` : effect.ragReferenceGrowth}`,
    `- 重复风险下降：${effect.duplicateRiskReduction}`,
    `- 二次治理待办：${effect.actionItems.length}`,
    "",
    ...markdownTable([["日期", "动作", "资产", "治理前", "治理后", "变化", "结论"], ...effectRows]),
    "",
    "## 二次治理待办",
    "",
    ...markdownTable([["优先级", "资产", "责任人", "Deadline", "原因", "关闭标准"], ...actionItemRows]),
    "",
    "## 质量治理队列",
    "",
    ...markdownTable([["资产", "质量", "处置建议", "责任人", "Deadline"], ...qualityRows]),
    "",
    "## 治理动作审计",
    "",
    ...markdownTable([["日期", "动作", "资产", "执行人", "摘要"], ...logRows]),
    "",
    "## 使用边界",
    "",
    "- 本报告用于 PMO 复盘资产治理追踪，不替代正式复盘会议纪要。",
    "- 合并、撤回和补充动作应由管理员人工确认后执行。",
  ].join("\n");

  return {
    summary,
    logs: input.logs,
    effect,
    reportMarkdown,
    boundary: "治理审计台用于追踪资产补充、合并、发布、撤回和恢复动作；报告可下载用于 PMO 知识治理复盘。",
  };
}
