import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import type { RagCitation, RagDocument } from "../rag/types.ts";
import type { Risk } from "../../lib/risk.ts";
import type { RiskRetrospectiveKnowledgeCard } from "./retrospective.ts";

interface AssetActor {
  id?: string | null;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
}

export type RiskRetrospectiveAssetStatus = "draft" | "reviewed" | "published" | "archived";

export interface RiskRetrospectiveAssetRecord extends RiskRetrospectiveKnowledgeCard {
  id: string;
  assetKey: string;
  sourceRiskCode?: string;
  status: RiskRetrospectiveAssetStatus;
  applicability: string;
  version: number;
  createdByName: string | null;
  confirmedByName: string | null;
  confirmedAt: string | null;
  publishedAt: string | null;
  archivedAt: string | null;
  ragReferenceCount: number;
  lastRagReferencedAt: string | null;
  lastExportedAt: string | null;
  lastExportSha256: string | null;
  createdAt: string;
  updatedAt: string;
}

export type RiskRetrospectiveAssetListResult =
  | { status: "succeeded"; assets: RiskRetrospectiveAssetRecord[] }
  | { status: "not_configured"; assets: RiskRetrospectiveAssetRecord[]; warning: string }
  | { status: "failed"; assets: RiskRetrospectiveAssetRecord[]; warning: string };

export type RiskRetrospectiveAssetMutationResult =
  | { status: "succeeded"; asset: RiskRetrospectiveAssetRecord }
  | { status: "not_configured"; warning: string }
  | { status: "failed"; warning: string };

export type RiskRetrospectiveRagDocumentsResult =
  | { status: "succeeded"; documents: RagDocument[] }
  | { status: "not_configured"; documents: RagDocument[]; warning: string }
  | { status: "failed"; documents: RagDocument[]; warning: string };

export interface RiskRetrospectiveRecommendation {
  id: string;
  projectName: string;
  currentRiskDescription: string;
  sourceAssetTitle: string;
  sourceProjectName: string;
  sourceRiskId: string;
  matchReason: string;
  recommendedWarningRule: string;
  reusablePractice: string;
  score: number;
}

export interface RiskRetrospectiveAssetDuplicateWarning {
  type: "same_title" | "same_source_risk" | "same_content" | "same_export_hash";
  groupKey: string;
  assetIds: string[];
  titles: string[];
  message: string;
}

export type RiskRetrospectiveAssetUsageResult =
  | { status: "succeeded"; recorded: number }
  | { status: "skipped"; warning: string; recorded: number }
  | { status: "failed"; warning: string; recorded: number };

const SQL_FILE = "supabase-v5330-risk-retrospective-assets.sql";
const VALUE_SQL_FILE = "supabase-v5332-risk-retrospective-value.sql";

function isRiskRetrospectiveAssetStorageConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function getRiskRetrospectiveAssetSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error("Supabase auth storage is not configured");
  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function actorName(user: AssetActor | null): string | null {
  return user?.name || user?.email || user?.phone || null;
}

function clean(value: unknown): string {
  return String(value ?? "").trim();
}

function normalizeForDuplicate(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{Script=Han}a-z0-9]+/gu, "")
    .trim();
}

function hashText(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function assetKey(sourceRiskId: string): string {
  return `risk-retrospective:${sourceRiskId}`;
}

function isMissingAssetTableError(message?: string): boolean {
  const normalized = (message ?? "").toLowerCase();
  return normalized.includes("risk_retrospective_assets")
    && (
      normalized.includes("does not exist")
      || normalized.includes("relation")
      || normalized.includes("schema cache")
      || normalized.includes("could not find the table")
    );
}

function isMissingValueMetricColumnsError(message?: string): boolean {
  const normalized = (message ?? "").toLowerCase();
  return valueMetricColumns().some(column => normalized.includes(column))
    && (
      normalized.includes("does not exist")
      || normalized.includes("schema cache")
      || normalized.includes("could not find")
      || normalized.includes("column")
    );
}

function baseSelectColumns(): string[] {
  return [
    "id",
    "asset_key",
    "source_risk_id",
    "source_risk_code",
    "project_name",
    "title",
    "risk_description",
    "category",
    "impact_area",
    "severity",
    "trigger",
    "effective_response",
    "closing_evidence",
    "review_opinion",
    "lesson_learned",
    "early_warning_rule",
    "reusable_practice",
    "tags",
    "status",
    "applicability",
    "version",
    "created_by_name",
    "confirmed_by_name",
    "confirmed_at",
    "published_at",
    "archived_at",
    "created_at",
    "updated_at",
  ];
}

function valueMetricColumns(): string[] {
  return [
    "rag_reference_count",
    "last_rag_referenced_at",
    "last_exported_at",
    "last_export_sha256",
  ];
}

function selectColumns(includeValueMetrics = true): string {
  return [
    ...baseSelectColumns(),
    ...(includeValueMetrics ? valueMetricColumns() : []),
  ].join(",");
}

function asTags(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

function assetContentFingerprint(asset: RiskRetrospectiveAssetRecord): string {
  return hashText([
    asset.riskDescription,
    asset.trigger,
    asset.effectiveResponse,
    asset.lessonLearned,
    asset.earlyWarningRule,
    asset.reusablePractice,
  ].map(normalizeForDuplicate).filter(Boolean).join("|"));
}

function duplicateWarningsBy(
  assets: RiskRetrospectiveAssetRecord[],
  type: RiskRetrospectiveAssetDuplicateWarning["type"],
  getGroupKey: (asset: RiskRetrospectiveAssetRecord) => string,
  label: string,
): RiskRetrospectiveAssetDuplicateWarning[] {
  const groups = new Map<string, RiskRetrospectiveAssetRecord[]>();
  for (const asset of assets) {
    const groupKey = getGroupKey(asset);
    if (!groupKey) continue;
    groups.set(groupKey, [...(groups.get(groupKey) ?? []), asset]);
  }
  return [...groups.entries()]
    .filter(([, group]) => group.length > 1)
    .map(([groupKey, group]) => ({
      type,
      groupKey,
      assetIds: group.map(asset => asset.id),
      titles: [...new Set(group.map(asset => asset.title))],
      message: `${label}重复：${group.map(asset => `${asset.title}（${asset.projectName}）`).join("、")}。建议合并同源经验，或撤回低质量重复资产。`,
    }));
}

function mapAsset(row: Record<string, unknown>): RiskRetrospectiveAssetRecord {
  return {
    id: String(row.id),
    assetKey: String(row.asset_key ?? ""),
    sourceRiskId: String(row.source_risk_id ?? ""),
    sourceRiskCode: row.source_risk_code ? String(row.source_risk_code) : undefined,
    projectName: String(row.project_name ?? ""),
    title: String(row.title ?? ""),
    riskDescription: String(row.risk_description ?? ""),
    category: String(row.category ?? ""),
    impactArea: String(row.impact_area ?? ""),
    severity: String(row.severity ?? "medium") as RiskRetrospectiveAssetRecord["severity"],
    trigger: String(row.trigger ?? ""),
    effectiveResponse: String(row.effective_response ?? ""),
    closingEvidence: String(row.closing_evidence ?? ""),
    reviewOpinion: String(row.review_opinion ?? ""),
    lessonLearned: String(row.lesson_learned ?? ""),
    earlyWarningRule: String(row.early_warning_rule ?? ""),
    reusablePractice: String(row.reusable_practice ?? ""),
    tags: asTags(row.tags),
    status: String(row.status ?? "reviewed") as RiskRetrospectiveAssetStatus,
    applicability: String(row.applicability ?? ""),
    version: Number(row.version ?? 1),
    createdByName: row.created_by_name ? String(row.created_by_name) : null,
    confirmedByName: row.confirmed_by_name ? String(row.confirmed_by_name) : null,
    confirmedAt: row.confirmed_at ? String(row.confirmed_at) : null,
    publishedAt: row.published_at ? String(row.published_at) : null,
    archivedAt: row.archived_at ? String(row.archived_at) : null,
    ragReferenceCount: Number(row.rag_reference_count ?? 0),
    lastRagReferencedAt: row.last_rag_referenced_at ? String(row.last_rag_referenced_at) : null,
    lastExportedAt: row.last_exported_at ? String(row.last_exported_at) : null,
    lastExportSha256: row.last_export_sha256 ? String(row.last_export_sha256) : null,
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
  };
}

export function buildRiskRetrospectiveAssetDraft(
  card: RiskRetrospectiveKnowledgeCard,
  input?: {
    sourceRiskCode?: string;
    status?: RiskRetrospectiveAssetStatus;
    applicability?: string;
    version?: number;
    createdByName?: string | null;
    confirmedByName?: string | null;
    confirmedAt?: string | null;
    publishedAt?: string | null;
    archivedAt?: string | null;
    createdAt?: string;
    updatedAt?: string;
  },
): RiskRetrospectiveAssetRecord {
  const now = new Date().toISOString();
  return {
    ...card,
    id: card.id,
    assetKey: assetKey(card.sourceRiskId),
    sourceRiskCode: input?.sourceRiskCode,
    status: input?.status ?? "reviewed",
    applicability: clean(input?.applicability) || "适用于同类客户、同类阶段、同类影响领域的项目风险识别、监控和复盘。",
    version: input?.version ?? 1,
    createdByName: input?.createdByName ?? null,
    confirmedByName: input?.confirmedByName ?? null,
    confirmedAt: input?.confirmedAt ?? null,
    publishedAt: input?.publishedAt ?? null,
    archivedAt: input?.archivedAt ?? null,
    ragReferenceCount: 0,
    lastRagReferencedAt: null,
    lastExportedAt: null,
    lastExportSha256: null,
    createdAt: input?.createdAt ?? now,
    updatedAt: input?.updatedAt ?? now,
  };
}

export function riskRetrospectiveAssetToRagDocument(asset: RiskRetrospectiveAssetRecord): RagDocument {
  return {
    page_id: `RISK-RETRO-${asset.assetKey.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "")}`,
    title: asset.title,
    type: "risk-retrospective-asset",
    status: asset.status === "published" ? "published" : "reviewed",
    authority: "PMO风险复盘资产",
    confidentiality: "internal",
    domains: ["risk", "PMO", "retrospective", asset.category, asset.impactArea].filter(Boolean),
    aliases: [
      asset.projectName,
      asset.riskDescription,
      asset.trigger,
      "风险复盘",
      "组织过程资产",
      "同类项目预警",
    ].filter(Boolean),
    tags: asset.tags,
    source_refs: [asset.id, asset.assetKey, asset.sourceRiskId, asset.sourceRiskCode].filter(Boolean) as string[],
    content: [
      `# ${asset.title}`,
      "",
      `项目：${asset.projectName}`,
      `风险：${asset.riskDescription}`,
      `风险类别：${asset.category}`,
      `影响领域：${asset.impactArea}`,
      `风险等级：${asset.severity}`,
      `触发器：${asset.trigger}`,
      `有效应对：${asset.effectiveResponse}`,
      `关闭证据：${asset.closingEvidence}`,
      `复核意见：${asset.reviewOpinion}`,
      `经验教训：${asset.lessonLearned}`,
      `早期预警规则：${asset.earlyWarningRule}`,
      `可复用做法：${asset.reusablePractice}`,
      `适用范围：${asset.applicability}`,
      `来源风险：${asset.sourceRiskCode || asset.sourceRiskId}`,
    ].join("\n"),
  };
}

function payloadFromCard(card: RiskRetrospectiveKnowledgeCard, user: AssetActor | null, status: RiskRetrospectiveAssetStatus) {
  const name = actorName(user);
  const now = new Date().toISOString();
  return {
    asset_key: assetKey(card.sourceRiskId),
    source_risk_id: card.sourceRiskId,
    project_name: card.projectName,
    title: card.title,
    risk_description: card.riskDescription,
    category: card.category,
    impact_area: card.impactArea,
    severity: card.severity,
    trigger: card.trigger,
    effective_response: card.effectiveResponse,
    closing_evidence: card.closingEvidence,
    review_opinion: card.reviewOpinion,
    lesson_learned: card.lessonLearned,
    early_warning_rule: card.earlyWarningRule,
    reusable_practice: card.reusablePractice,
    tags: card.tags,
    status,
    applicability: "适用于同类客户、同类阶段、同类影响领域的项目风险识别、监控和复盘。",
    metadata: {
      source: "risk_retrospective_dashboard",
      source_risk_id: card.sourceRiskId,
    },
    created_by: user?.id ?? null,
    created_by_name: name,
    confirmed_by: user?.id ?? null,
    confirmed_by_name: name,
    confirmed_at: now,
  };
}

export async function listRiskRetrospectiveAssets(
  status?: RiskRetrospectiveAssetStatus | "all",
  limit = 50,
): Promise<RiskRetrospectiveAssetListResult> {
  if (!isRiskRetrospectiveAssetStorageConfigured()) {
    return { status: "not_configured", assets: [], warning: "Supabase 未配置，无法读取风险复盘资产。" };
  }

  try {
    const supabase = getRiskRetrospectiveAssetSupabase();
    const buildQuery = (includeValueMetrics: boolean) => {
      let query = supabase
        .from("risk_retrospective_assets")
        .select(selectColumns(includeValueMetrics))
        .order("updated_at", { ascending: false })
        .limit(limit);
      if (status && status !== "all") query = query.eq("status", status);
      return query;
    };
    const query = buildQuery(true);
    let { data, error } = await query;

    if (error && isMissingValueMetricColumnsError(error.message)) {
      const fallback = await buildQuery(false);
      data = fallback.data;
      error = fallback.error;
      if (!error) {
        return {
          status: "succeeded",
          assets: (data ?? []).map(row => mapAsset(row as unknown as Record<string, unknown>)),
        };
      }
    }

    if (error) {
      return {
        status: isMissingAssetTableError(error.message) ? "not_configured" : "failed",
        assets: [],
        warning: isMissingAssetTableError(error.message)
          ? `风险复盘资产 SQL 未执行：请在 Supabase SQL Editor 执行 ${SQL_FILE}。`
          : isMissingValueMetricColumnsError(error.message)
            ? `风险复盘资产价值度量 SQL 未执行：请在 Supabase SQL Editor 执行 ${VALUE_SQL_FILE}。`
            : error.message,
      };
    }

    return { status: "succeeded", assets: (data ?? []).map(row => mapAsset(row as unknown as Record<string, unknown>)) };
  } catch (error) {
    return {
      status: "failed",
      assets: [],
      warning: error instanceof Error ? error.message : "读取风险复盘资产失败。",
    };
  }
}

async function selectAssetById(id: string): Promise<RiskRetrospectiveAssetRecord | null> {
  const supabase = getRiskRetrospectiveAssetSupabase();
  const { data, error } = await supabase
    .from("risk_retrospective_assets")
    .select(selectColumns())
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  return mapAsset(data as unknown as Record<string, unknown>);
}

export async function confirmRiskRetrospectiveAsset(
  card: RiskRetrospectiveKnowledgeCard,
  user: AssetActor | null,
): Promise<RiskRetrospectiveAssetMutationResult> {
  if (!isRiskRetrospectiveAssetStorageConfigured()) {
    return { status: "not_configured", warning: "Supabase 未配置，无法保存风险复盘资产。" };
  }

  try {
    const supabase = getRiskRetrospectiveAssetSupabase();
    const { data, error } = await supabase
      .from("risk_retrospective_assets")
      .upsert(payloadFromCard(card, user, "reviewed"), { onConflict: "asset_key" })
      .select(selectColumns(false))
      .single();

    if (error) {
      return {
        status: isMissingAssetTableError(error.message) ? "not_configured" : "failed",
        warning: isMissingAssetTableError(error.message)
          ? `风险复盘资产 SQL 未执行：请在 Supabase SQL Editor 执行 ${SQL_FILE}。`
          : error.message,
      };
    }
    return { status: "succeeded", asset: mapAsset(data as unknown as Record<string, unknown>) };
  } catch (error) {
    return {
      status: "failed",
      warning: error instanceof Error ? error.message : "保存风险复盘资产失败。",
    };
  }
}

export async function updateRiskRetrospectiveAssetStatus(
  id: string,
  status: RiskRetrospectiveAssetStatus,
  user: AssetActor | null,
): Promise<RiskRetrospectiveAssetMutationResult> {
  if (!isRiskRetrospectiveAssetStorageConfigured()) {
    return { status: "not_configured", warning: "Supabase 未配置，无法更新风险复盘资产。" };
  }

  const now = new Date().toISOString();
  const update: Record<string, unknown> = { status };
  if (status === "published") update.published_at = now;
  if (status === "archived") update.archived_at = now;
  if (status === "reviewed") {
    update.confirmed_by = user?.id ?? null;
    update.confirmed_by_name = actorName(user);
    update.confirmed_at = now;
  }

  try {
    const supabase = getRiskRetrospectiveAssetSupabase();
    const { data, error } = await supabase
      .from("risk_retrospective_assets")
      .update(update)
      .eq("id", id)
      .select(selectColumns(false))
      .single();

    if (error) {
      return {
        status: isMissingAssetTableError(error.message) ? "not_configured" : "failed",
        warning: isMissingAssetTableError(error.message)
          ? `风险复盘资产 SQL 未执行：请在 Supabase SQL Editor 执行 ${SQL_FILE}。`
          : error.message,
      };
    }
    return { status: "succeeded", asset: mapAsset(data as unknown as Record<string, unknown>) };
  } catch (error) {
    return {
      status: "failed",
      warning: error instanceof Error ? error.message : "更新风险复盘资产失败。",
    };
  }
}

export async function listPublishedRiskRetrospectiveRagDocuments(): Promise<RiskRetrospectiveRagDocumentsResult> {
  const result = await listRiskRetrospectiveAssets("published", 100);
  if (result.status !== "succeeded") {
    return { status: result.status, documents: [], warning: result.warning };
  }
  return {
    status: "succeeded",
    documents: result.assets.map(riskRetrospectiveAssetToRagDocument),
  };
}

export function buildRiskRetrospectiveAssetDuplicateWarnings(
  assets: RiskRetrospectiveAssetRecord[],
): RiskRetrospectiveAssetDuplicateWarning[] {
  const reusableAssets = assets.filter(asset => asset.status !== "archived");
  return [
    ...duplicateWarningsBy(
      reusableAssets,
      "same_title",
      asset => normalizeForDuplicate(asset.title),
      "标题",
    ),
    ...duplicateWarningsBy(
      reusableAssets,
      "same_source_risk",
      asset => normalizeForDuplicate(asset.sourceRiskCode || asset.sourceRiskId),
      "来源风险",
    ),
    ...duplicateWarningsBy(
      reusableAssets,
      "same_content",
      assetContentFingerprint,
      "复盘内容",
    ),
    ...duplicateWarningsBy(
      reusableAssets,
      "same_export_hash",
      asset => asset.lastExportSha256 ?? "",
      "最近导出哈希",
    ),
  ];
}

function citationAssetId(citation: RagCitation): string | null {
  const candidate = citation.source_ids.find(source => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(source));
  return candidate ?? null;
}

export async function recordRiskRetrospectiveRagUsage(input: {
  query: string;
  citations: RagCitation[];
  requestId: string;
  user?: AssetActor | null;
}): Promise<RiskRetrospectiveAssetUsageResult> {
  const citations = input.citations.filter(citation => citation.page_id.startsWith("RISK-RETRO-"));
  if (citations.length === 0) return { status: "succeeded", recorded: 0 };
  if (!isRiskRetrospectiveAssetStorageConfigured()) {
    return { status: "skipped", warning: "Supabase 未配置，无法记录风险复盘资产 RAG 引用。", recorded: 0 };
  }

  try {
    const supabase = getRiskRetrospectiveAssetSupabase();
    let recorded = 0;
    for (const citation of citations) {
      const assetId = citationAssetId(citation);
      const assetKeyRef = citation.source_ids.find(source => source.startsWith("risk-retrospective:")) ?? null;
      if (!assetId) continue;
      const current = await selectAssetById(assetId);
      if (!current) continue;
      const now = new Date().toISOString();
      const { error: updateError } = await supabase
        .from("risk_retrospective_assets")
        .update({
          rag_reference_count: current.ragReferenceCount + 1,
          last_rag_referenced_at: now,
        })
        .eq("id", assetId);
      if (updateError) {
        return {
          status: isMissingValueMetricColumnsError(updateError.message) ? "skipped" : "failed",
          warning: isMissingValueMetricColumnsError(updateError.message)
            ? `风险复盘资产价值度量 SQL 未执行：请在 Supabase SQL Editor 执行 ${VALUE_SQL_FILE}。`
            : updateError.message,
          recorded,
        };
      }
      const { error: insertError } = await supabase
        .from("risk_retrospective_asset_usage_logs")
        .insert({
          asset_id: assetId,
          asset_key: assetKeyRef ?? current.assetKey,
          page_id: citation.page_id,
          title: citation.document,
          query: input.query,
          trace_id: input.requestId,
          relevance: citation.relevance,
          excerpt: citation.excerpt,
          referenced_by: input.user?.id ?? null,
          referenced_by_name: actorName(input.user ?? null),
        });
      if (insertError) {
        return {
          status: isMissingValueMetricColumnsError(insertError.message) || insertError.message.toLowerCase().includes("risk_retrospective_asset_usage_logs") ? "skipped" : "failed",
          warning: insertError.message.toLowerCase().includes("risk_retrospective_asset_usage_logs")
            ? `风险复盘资产价值度量 SQL 未执行：请在 Supabase SQL Editor 执行 ${VALUE_SQL_FILE}。`
            : insertError.message,
          recorded,
        };
      }
      recorded += 1;
    }
    return { status: "succeeded", recorded };
  } catch (error) {
    return {
      status: "failed",
      warning: error instanceof Error ? error.message : "记录风险复盘资产 RAG 引用失败。",
      recorded: 0,
    };
  }
}

export async function recordRiskRetrospectiveAssetExportMetrics(input: {
  assetIds: string[];
  sha256: string;
}): Promise<RiskRetrospectiveAssetUsageResult> {
  const assetIds = input.assetIds.filter(id => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(id));
  if (assetIds.length === 0) return { status: "succeeded", recorded: 0 };
  if (!isRiskRetrospectiveAssetStorageConfigured()) {
    return { status: "skipped", warning: "Supabase 未配置，无法记录风险复盘资产导出指标。", recorded: 0 };
  }

  try {
    const supabase = getRiskRetrospectiveAssetSupabase();
    const { error } = await supabase
      .from("risk_retrospective_assets")
      .update({
        last_exported_at: new Date().toISOString(),
        last_export_sha256: input.sha256,
      })
      .in("id", assetIds);
    if (error) {
      return {
        status: isMissingValueMetricColumnsError(error.message) ? "skipped" : "failed",
        warning: isMissingValueMetricColumnsError(error.message)
          ? `风险复盘资产价值度量 SQL 未执行：请在 Supabase SQL Editor 执行 ${VALUE_SQL_FILE}。`
          : error.message,
        recorded: 0,
      };
    }
    return { status: "succeeded", recorded: assetIds.length };
  } catch (error) {
    return {
      status: "failed",
      warning: error instanceof Error ? error.message : "记录风险复盘资产导出指标失败。",
      recorded: 0,
    };
  }
}

export function buildRiskRetrospectiveRecommendations(
  risks: Risk[],
  assets: RiskRetrospectiveAssetRecord[],
): RiskRetrospectiveRecommendation[] {
  const activeRisks = risks.filter(risk => risk.status !== "closed" && risk.status !== "resolved");
  const reusableAssets = assets.filter(asset => asset.status === "published" || asset.status === "reviewed");
  return activeRisks
    .flatMap(risk => reusableAssets.map(asset => {
      let score = 0;
      const reasons: string[] = [];
      if (asset.category.includes(risk.category) || risk.category.includes(asset.category.replace(/风险$/u, ""))) {
        score += 3;
        reasons.push(`风险类别相近：${risk.category}`);
      }
      if (asset.impactArea === risk.impactArea) {
        score += 4;
        reasons.push(`影响领域一致：${risk.impactArea}`);
      }
      if (asset.severity === "high" && risk.piScore >= 16) {
        score += 2;
        reasons.push("均为高风险场景");
      }
      if (asset.tags.some(tag => risk.description.includes(tag) || risk.trigger.includes(tag))) {
        score += 2;
        reasons.push("触发器或描述命中历史标签");
      }
      if (score === 0) return null;
      return {
        id: `${risk.id}-${asset.id}`,
        projectName: risk.projectName,
        currentRiskDescription: risk.description,
        sourceAssetTitle: asset.title,
        sourceProjectName: asset.projectName,
        sourceRiskId: asset.sourceRiskId,
        matchReason: reasons.join("；"),
        recommendedWarningRule: asset.earlyWarningRule,
        reusablePractice: asset.reusablePractice,
        score,
      };
    }))
    .filter((item): item is RiskRetrospectiveRecommendation => Boolean(item))
    .sort((a, b) => b.score - a.score || a.projectName.localeCompare(b.projectName, "zh-CN"))
    .slice(0, 10);
}
