import type { RiskDataScope } from "../risk/scope.ts";
import type { Confidentiality, RagDocument } from "../rag/types.ts";

export type DynamicKnowledgeResult = { status: "succeeded" | "failed"; documents: RagDocument[]; warning?: string };

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).map(item => item.trim()).filter(Boolean) : [];
}

function confidentiality(value: unknown): Confidentiality {
  const normalized = String(value || "internal") as Confidentiality;
  return ["public", "internal", "confidential", "restricted"].includes(normalized) ? normalized : "internal";
}

function metadataContent(title: string, metadata: Record<string, unknown>): string {
  const parts = [
    title,
    String(metadata.summary || ""),
    String(metadata.observed_effect || ""),
    String(metadata.applicability_conditions || ""),
    String(metadata.review_note || ""),
  ].map(item => item.trim()).filter(Boolean);
  return [...new Set(parts)].join("\n\n");
}

export async function listPublishedDynamicKnowledgeDocuments(scope: RiskDataScope): Promise<DynamicKnowledgeResult> {
  try {
    const auth = await import("../auth/server.ts");
    const supabase = auth.getAuthSupabase();
    const [items, outputs] = await Promise.all([
      supabase.from("knowledge_items")
        .select("id,page_id,title,knowledge_type,status,owner_name,domains,tags,source_refs,confidentiality,metadata,updated_at")
        .eq("status", "published").order("updated_at", { ascending: false }).limit(200),
      supabase.from("formal_business_outputs")
        .select("id,subject_scope,subject_id,project_id,title,content,structured_payload,source_definition,source_snapshot_at,status,data_class")
        .eq("org_id", scope.orgId).eq("data_class", scope.dataClass).eq("output_type", "knowledge_asset").eq("status", "published")
        .order("source_snapshot_at", { ascending: false }).limit(100),
    ]);
    const error = items.error || outputs.error;
    if (error) return { status: "failed", documents: [], warning: error.message };
    const allowedProjects = new Set(scope.projectIds);
    const documents: RagDocument[] = [];
    for (const row of items.data ?? []) {
      const metadata = (row.metadata ?? {}) as Record<string, unknown>;
      if (String(metadata.org_id || "") !== scope.orgId || String(metadata.data_class || scope.dataClass) !== scope.dataClass) continue;
      const sourceProjectId = String(metadata.source_project_id || "");
      if (sourceProjectId && !allowedProjects.has(sourceProjectId)) continue;
      const content = metadataContent(String(row.title), metadata);
      if (!content) continue;
      documents.push({
        page_id: `dynamic-knowledge:${row.page_id}`,
        title: String(row.title),
        type: String(row.knowledge_type || "dynamic_knowledge"),
        status: "published",
        authority: String(row.owner_name || "知识评审人"),
        confidentiality: confidentiality(row.confidentiality),
        domains: strings(row.domains), aliases: [], tags: strings(row.tags), source_refs: strings(row.source_refs), content,
      });
    }
    for (const row of outputs.data ?? []) {
      const projectId = String(row.project_id || "");
      if (projectId && !allowedProjects.has(projectId)) continue;
      documents.push({
        page_id: `formal-knowledge:${row.id}`,
        title: String(row.title), type: "formal_knowledge_asset", status: "published", authority: "AI-PMO正式成果评审",
        confidentiality: "internal", domains: ["project-management"], aliases: [], tags: ["动态知识", "正式成果"],
        source_refs: [`formal_business_output:${row.id}`, `source_snapshot_at:${row.source_snapshot_at}`], content: String(row.content),
      });
    }
    return { status: "succeeded", documents };
  } catch (error) {
    return { status: "failed", documents: [], warning: error instanceof Error ? error.message : "DYNAMIC_KNOWLEDGE_LOAD_FAILED" };
  }
}
