import { getAuthSupabase, isAuthStorageConfigured, type AppUser } from "../auth/server.ts";
import type { AiEvidence, AiEvidenceBasisItem, AiEvidenceSourceRef, AiSuggestedAction } from "./evidence.ts";

export interface AiEvidenceAuditRecord extends AiEvidence {
  createdByName?: string | null;
}

export type AiEvidencePersistResult =
  | { status: "succeeded"; id: string }
  | { status: "skipped"; warning: string }
  | { status: "failed"; warning: string };

function isMissingTableError(message?: string): boolean {
  return Boolean(message?.includes("ai_evidence_audits") || message?.includes("relation") || message?.includes("does not exist"));
}

function actorName(user: AppUser | null): string {
  return user?.name || user?.email || user?.phone || "系统";
}

function safeArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

function mapRow(row: Record<string, unknown>): AiEvidenceAuditRecord {
  return {
    id: String(row.id),
    scene: String(row.scene) as AiEvidence["scene"],
    title: String(row.title),
    model: String(row.model),
    status: String(row.status || "generated") as AiEvidence["status"],
    confidence: String(row.confidence || "medium") as AiEvidence["confidence"],
    inputSummary: row.input_summary ? String(row.input_summary) : "",
    outputSummary: row.output_summary ? String(row.output_summary) : "",
    basis: safeArray<AiEvidenceBasisItem>(row.basis),
    sourceRefs: safeArray<AiEvidenceSourceRef>(row.source_refs),
    citations: safeArray<string>(row.citations),
    suggestedActions: safeArray<AiSuggestedAction>(row.suggested_actions),
    generatedAt: String(row.created_at),
    auditId: String(row.id),
    auditStatus: "succeeded",
    createdByName: row.created_by_name ? String(row.created_by_name) : null,
  };
}

export async function persistAiEvidence(input: {
  evidence: AiEvidence;
  user: AppUser | null;
  requestId?: string;
  metadata?: Record<string, unknown>;
}): Promise<AiEvidencePersistResult> {
  if (!isAuthStorageConfigured()) {
    return { status: "skipped", warning: "Supabase 未配置，AI依据审计未持久化。" };
  }

  try {
    const supabase = getAuthSupabase();
    const { data, error } = await supabase
      .from("ai_evidence_audits")
      .insert({
        scene: input.evidence.scene,
        title: input.evidence.title,
        model: input.evidence.model,
        status: input.evidence.status,
        confidence: input.evidence.confidence,
        input_summary: input.evidence.inputSummary,
        output_summary: input.evidence.outputSummary,
        basis: input.evidence.basis,
        citations: input.evidence.citations,
        source_refs: input.evidence.sourceRefs,
        suggested_actions: input.evidence.suggestedActions,
        request_id: input.requestId || null,
        created_by: input.user?.id ?? null,
        created_by_name: actorName(input.user),
        metadata: input.metadata ?? {},
      })
      .select("id")
      .maybeSingle();

    if (error || !data) {
      return {
        status: isMissingTableError(error?.message) ? "skipped" : "failed",
        warning: isMissingTableError(error?.message)
          ? "请在 Supabase SQL Editor 执行 supabase-v531-ai-evidence-audit.sql。"
          : error?.message || "AI依据审计写入失败。",
      };
    }

    return { status: "succeeded", id: String(data.id) };
  } catch (error) {
    return {
      status: "failed",
      warning: error instanceof Error ? error.message : "AI依据审计写入失败。",
    };
  }
}

export async function listAiEvidenceAudits(limit = 30): Promise<{
  status: "succeeded" | "not_configured" | "failed";
  audits: AiEvidenceAuditRecord[];
  warning?: string;
}> {
  if (!isAuthStorageConfigured()) {
    return { status: "not_configured", audits: [], warning: "Supabase 未配置，无法读取AI依据审计。" };
  }

  try {
    const supabase = getAuthSupabase();
    const { data, error } = await supabase
      .from("ai_evidence_audits")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      return {
        status: isMissingTableError(error.message) ? "not_configured" : "failed",
        audits: [],
        warning: isMissingTableError(error.message)
          ? "请在 Supabase SQL Editor 执行 supabase-v531-ai-evidence-audit.sql。"
          : error.message,
      };
    }

    return { status: "succeeded", audits: (data ?? []).map(item => mapRow(item as Record<string, unknown>)) };
  } catch (error) {
    return {
      status: "failed",
      audits: [],
      warning: error instanceof Error ? error.message : "AI依据审计读取失败。",
    };
  }
}
