import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import type { RiskRetrospectiveAssetRecord } from "./retrospective-assets.ts";

interface SyncActor {
  id?: string | null;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
}

export interface RiskRetrospectiveSyncLog {
  id: string;
  assetIds: string[];
  assetCount: number;
  targetSpace: string;
  targetPath: string;
  exportStatus: "exported" | "failed";
  markdownTitle: string;
  markdownSha256: string | null;
  warning: string | null;
  exportedByName: string | null;
  requestId: string | null;
  createdAt: string;
}

export interface RiskRetrospectiveKnowledgeExport {
  title: string;
  targetPath: string;
  markdown: string;
  sha256: string;
  assetIds: string[];
  assetCount: number;
}

export type RiskRetrospectiveSyncPersistResult =
  | { status: "succeeded"; log: RiskRetrospectiveSyncLog }
  | { status: "skipped"; warning: string }
  | { status: "failed"; warning: string };

export type RiskRetrospectiveSyncLogListResult =
  | { status: "succeeded"; logs: RiskRetrospectiveSyncLog[] }
  | { status: "not_configured"; logs: RiskRetrospectiveSyncLog[]; warning: string }
  | { status: "failed"; logs: RiskRetrospectiveSyncLog[]; warning: string };

const SQL_FILE = "supabase-v5331-risk-retrospective-knowledge-sync.sql";
const DEFAULT_TARGET_PATH = "09-产品与集成/AI-PMO系统增强路线图/风险复盘资产库/风险复盘组织过程资产.md";

function actorName(user: SyncActor | null): string | null {
  return user?.name || user?.email || user?.phone || null;
}

function isStorageConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase auth storage is not configured");
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function isMissingSyncTableError(message?: string): boolean {
  const normalized = (message ?? "").toLowerCase();
  return normalized.includes("risk_retrospective_asset_sync_logs")
    && (
      normalized.includes("does not exist")
      || normalized.includes("relation")
      || normalized.includes("schema cache")
      || normalized.includes("could not find the table")
    );
}

function sha256(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

function mapLog(row: Record<string, unknown>): RiskRetrospectiveSyncLog {
  return {
    id: String(row.id),
    assetIds: Array.isArray(row.asset_ids) ? row.asset_ids.map(String) : [],
    assetCount: Number(row.asset_count ?? 0),
    targetSpace: String(row.target_space ?? "AI-PMO-SYS"),
    targetPath: String(row.target_path ?? ""),
    exportStatus: String(row.export_status ?? "exported") as RiskRetrospectiveSyncLog["exportStatus"],
    markdownTitle: String(row.markdown_title ?? ""),
    markdownSha256: row.markdown_sha256 ? String(row.markdown_sha256) : null,
    warning: row.warning ? String(row.warning) : null,
    exportedByName: row.exported_by_name ? String(row.exported_by_name) : null,
    requestId: row.request_id ? String(row.request_id) : null,
    createdAt: String(row.created_at ?? ""),
  };
}

function assetSection(asset: RiskRetrospectiveAssetRecord, index: number): string[] {
  return [
    `## ${index + 1}. ${asset.title}`,
    "",
    `- 状态：${asset.status}`,
    `- 来源项目：${asset.projectName}`,
    `- 来源风险：${asset.sourceRiskCode || asset.sourceRiskId}`,
    `- 风险描述：${asset.riskDescription}`,
    `- 风险类别：${asset.category}`,
    `- 影响领域：${asset.impactArea}`,
    `- 风险等级：${asset.severity}`,
    `- 适用范围：${asset.applicability}`,
    "",
    "### 触发器",
    asset.trigger || "未填写",
    "",
    "### 有效应对",
    asset.effectiveResponse || "未填写",
    "",
    "### 经验教训",
    asset.lessonLearned || "未填写",
    "",
    "### 早期预警规则",
    asset.earlyWarningRule || "未填写",
    "",
    "### 可复用做法",
    asset.reusablePractice || "未填写",
    "",
    "### 关闭与复核证据",
    `- 关闭证据：${asset.closingEvidence || "未填写"}`,
    `- 复核意见：${asset.reviewOpinion || "未填写"}`,
    "",
    `标签：${asset.tags.join("、") || "风险复盘"}`,
    "",
  ];
}

export function buildRiskRetrospectiveKnowledgeExport(
  assets: RiskRetrospectiveAssetRecord[],
  targetPath = DEFAULT_TARGET_PATH,
): RiskRetrospectiveKnowledgeExport {
  const reusableAssets = assets.filter(asset => asset.status === "published" || asset.status === "reviewed");
  const title = "风险复盘组织过程资产";
  const markdown = [
    "---",
    `title: ${title}`,
    "type: risk-retrospective-assets",
    "status: reviewed",
    "confidentiality: internal",
    "domains:",
    "  - risk",
    "  - PMO",
    "  - retrospective",
    "tags:",
    "  - 风险复盘",
    "  - 组织过程资产",
    "  - AI-PMO",
    "---",
    "",
    `# ${title}`,
    "",
    "> 本文件由 AI-PMO 系统根据已确认/已发布风险复盘资产生成。正式纳入 AI-PMO-SYS 知识库前，仍需要 PMO 复核适用范围和敏感信息。",
    "",
    "## 概览",
    "",
    `- 资产数量：${reusableAssets.length}`,
    `- 已发布资产：${reusableAssets.filter(asset => asset.status === "published").length}`,
    `- 生成时间：${new Date().toISOString()}`,
    `- 建议路径：${targetPath}`,
    "",
    "## 资产目录",
    "",
    ...reusableAssets.map((asset, index) => `- ${index + 1}. ${asset.title}（${asset.projectName} / ${asset.category} / ${asset.impactArea}）`),
    "",
    ...reusableAssets.flatMap(assetSection),
    "## 使用边界",
    "",
    "- 本文件用于风险识别、风险复盘、同类项目预警和 PMO 组织过程资产沉淀。",
    "- 复盘内容来自项目关闭证据和人工复核意见；不替代复盘会正式结论。",
    "- 引用到具体客户、合同、回款或缺陷信息时，需要按组织密级规则复核后再公开发布。",
  ].join("\n");

  return {
    title,
    targetPath,
    markdown,
    sha256: sha256(markdown),
    assetIds: reusableAssets.map(asset => asset.id),
    assetCount: reusableAssets.length,
  };
}

export async function persistRiskRetrospectiveSyncLog(input: {
  knowledgeExport: RiskRetrospectiveKnowledgeExport;
  user: SyncActor | null;
  requestId?: string;
  warning?: string;
}): Promise<RiskRetrospectiveSyncPersistResult> {
  if (!isStorageConfigured()) {
    return { status: "skipped", warning: "Supabase 未配置，风险复盘资产导出审计未持久化。" };
  }

  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("risk_retrospective_asset_sync_logs")
      .insert({
        asset_ids: input.knowledgeExport.assetIds,
        asset_count: input.knowledgeExport.assetCount,
        target_space: "AI-PMO-SYS",
        target_path: input.knowledgeExport.targetPath,
        export_status: input.warning ? "failed" : "exported",
        markdown_title: input.knowledgeExport.title,
        markdown_sha256: input.knowledgeExport.sha256,
        warning: input.warning ?? null,
        exported_by: input.user?.id ?? null,
        exported_by_name: actorName(input.user),
        request_id: input.requestId ?? null,
        metadata: {
          source: "risk_retrospective_assets_export",
          asset_count: input.knowledgeExport.assetCount,
        },
      })
      .select("id,asset_ids,asset_count,target_space,target_path,export_status,markdown_title,markdown_sha256,warning,exported_by_name,request_id,created_at")
      .single();

    if (error) {
      return {
        status: isMissingSyncTableError(error.message) ? "skipped" : "failed",
        warning: isMissingSyncTableError(error.message)
          ? `风险复盘资产导出审计 SQL 未执行：请在 Supabase SQL Editor 执行 ${SQL_FILE}。`
          : error.message,
      };
    }
    return { status: "succeeded", log: mapLog(data as unknown as Record<string, unknown>) };
  } catch (error) {
    return {
      status: "failed",
      warning: error instanceof Error ? error.message : "风险复盘资产导出审计写入失败。",
    };
  }
}

export async function listRiskRetrospectiveSyncLogs(limit = 20): Promise<RiskRetrospectiveSyncLogListResult> {
  if (!isStorageConfigured()) {
    return { status: "not_configured", logs: [], warning: "Supabase 未配置，无法读取风险复盘资产导出审计。" };
  }

  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("risk_retrospective_asset_sync_logs")
      .select("id,asset_ids,asset_count,target_space,target_path,export_status,markdown_title,markdown_sha256,warning,exported_by_name,request_id,created_at")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      return {
        status: isMissingSyncTableError(error.message) ? "not_configured" : "failed",
        logs: [],
        warning: isMissingSyncTableError(error.message)
          ? `风险复盘资产导出审计 SQL 未执行：请在 Supabase SQL Editor 执行 ${SQL_FILE}。`
          : error.message,
      };
    }
    return { status: "succeeded", logs: (data ?? []).map(row => mapLog(row as unknown as Record<string, unknown>)) };
  } catch (error) {
    return {
      status: "failed",
      logs: [],
      warning: error instanceof Error ? error.message : "读取风险复盘资产导出审计失败。",
    };
  }
}
