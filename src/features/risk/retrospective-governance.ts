import { createClient } from "@supabase/supabase-js";
import type { RiskRetrospectiveAssetRecord } from "./retrospective-assets.ts";
import type { RiskRetrospectiveQualityDashboard } from "./retrospective-quality.ts";

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
  performedByName: string | null;
  requestId: string | null;
  createdAt: string;
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

export function buildRiskRetrospectiveGovernanceDashboard(input: {
  assets: RiskRetrospectiveAssetRecord[];
  logs: RiskRetrospectiveGovernanceLog[];
  quality: RiskRetrospectiveQualityDashboard | null;
}): RiskRetrospectiveGovernanceDashboard {
  const touchedAssets = new Set(input.logs.flatMap(log => [log.assetId, log.targetAssetId]).filter(Boolean));
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
    reportMarkdown,
    boundary: "治理审计台用于追踪资产补充、合并、发布、撤回和恢复动作；报告可下载用于 PMO 知识治理复盘。",
  };
}
