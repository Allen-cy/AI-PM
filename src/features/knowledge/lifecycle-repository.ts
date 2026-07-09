import { createHash } from "node:crypto";
import { getAuthSupabase, isAuthStorageConfigured, type AppUser } from "../auth/server.ts";
import type {
  KnowledgeImpactModule,
  KnowledgeLifecycleAction,
  KnowledgeOperationDashboard,
  KnowledgeOperationItem,
} from "./operations.ts";

const SQL_FILE = "supabase-v5352-knowledge-lifecycle.sql";

export interface KnowledgeImpactReviewRecord {
  id: string;
  pageId: string;
  title?: string | null;
  moduleName: string;
  priority: "P0" | "P1" | "P2";
  status: "待复核" | "处理中" | "已关闭" | "无需处理";
  ownerName: string;
  dueDate: string;
  reviewOutput: string;
  closureEvidence?: string | null;
  reviewerName?: string | null;
  reviewedAt?: string | null;
}

export type KnowledgeLifecyclePersistenceResult =
  | {
      status: "succeeded";
      summary: {
        persistedItems: number;
        persistedVersions: number;
        openImpactReviews: number;
        closedImpactReviews: number;
      };
      impactReviews: KnowledgeImpactReviewRecord[];
      latestEvents: Array<{ id: string; pageId: string; eventType: string; actorName?: string | null; createdAt: string }>;
    }
  | { status: "not_configured"; warning: string; migration: string; impactReviews: []; latestEvents: [] }
  | { status: "failed"; warning: string; impactReviews: []; latestEvents: [] };

export type KnowledgeLifecycleSyncResult =
  | {
      status: "succeeded";
      syncedItems: number;
      syncedVersions: number;
      syncedImpactReviews: number;
      requestId: string;
    }
  | { status: "not_configured"; warning: string; migration: string; requestId: string }
  | { status: "failed"; warning: string; requestId: string };

export type KnowledgeImpactReviewTransitionResult =
  | { status: "succeeded"; review: KnowledgeImpactReviewRecord; requestId: string }
  | { status: "not_configured"; warning: string; migration: string; requestId: string }
  | { status: "not_found"; warning: string; requestId: string }
  | { status: "failed"; warning: string; requestId: string };

function isMissingTableError(message?: string): boolean {
  return Boolean(
    message?.includes("knowledge_items")
    || message?.includes("knowledge_item_versions")
    || message?.includes("knowledge_lifecycle_events")
    || message?.includes("knowledge_impact_reviews")
    || message?.includes("relation")
    || message?.includes("does not exist"),
  );
}

function notConfigured() {
  return {
    status: "not_configured" as const,
    warning: "Supabase 尚未创建知识生命周期表。",
    migration: SQL_FILE,
  };
}

function actorName(user: AppUser | null): string {
  return user?.name || user?.email || user?.phone || "系统";
}

function hashItem(item: KnowledgeOperationItem): string {
  return createHash("sha256")
    .update(JSON.stringify({
      pageId: item.pageId,
      title: item.title,
      status: item.status,
      domains: item.domains,
      tags: item.tags,
      sourceRefs: item.sourceRefs,
      impactedModules: item.impactedModules,
      linkedTemplates: item.linkedTemplates,
      version: item.version,
    }))
    .digest("hex");
}

function datePlus(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function actionForItem(actions: KnowledgeLifecycleAction[], pageId: string): KnowledgeLifecycleAction | undefined {
  return actions.find(action => action.sourceDocumentId === pageId);
}

function impactForModule(modules: KnowledgeImpactModule[], moduleName: string): KnowledgeImpactModule | undefined {
  return modules.find(item => item.module === moduleName);
}

function mapImpactReview(row: Record<string, unknown>): KnowledgeImpactReviewRecord {
  const item = row.knowledge_items && typeof row.knowledge_items === "object"
    ? row.knowledge_items as Record<string, unknown>
    : {};
  return {
    id: String(row.id),
    pageId: String(item.page_id || row.page_id || ""),
    title: typeof item.title === "string" ? item.title : null,
    moduleName: String(row.module_name || ""),
    priority: String(row.priority || "P2") as KnowledgeImpactReviewRecord["priority"],
    status: String(row.status || "待复核") as KnowledgeImpactReviewRecord["status"],
    ownerName: String(row.owner_name || "知识库管理员"),
    dueDate: String(row.due_date || ""),
    reviewOutput: String(row.review_output || ""),
    closureEvidence: typeof row.closure_evidence === "string" ? row.closure_evidence : null,
    reviewerName: typeof row.reviewer_name === "string" ? row.reviewer_name : null,
    reviewedAt: typeof row.reviewed_at === "string" ? row.reviewed_at : null,
  };
}

function hasEnvironment(): boolean {
  return isAuthStorageConfigured();
}

export async function loadKnowledgeLifecyclePersistence(limit = 20): Promise<KnowledgeLifecyclePersistenceResult> {
  if (!hasEnvironment()) return { ...notConfigured(), impactReviews: [], latestEvents: [] };
  const supabase = getAuthSupabase();

  const [items, versions, reviews, events] = await Promise.all([
    supabase.from("knowledge_items").select("id", { count: "exact", head: true }),
    supabase.from("knowledge_item_versions").select("id", { count: "exact", head: true }),
    supabase
      .from("knowledge_impact_reviews")
      .select("id,module_name,priority,status,owner_name,due_date,review_output,closure_evidence,reviewer_name,reviewed_at,knowledge_items(page_id,title)")
      .order("updated_at", { ascending: false })
      .limit(limit),
    supabase
      .from("knowledge_lifecycle_events")
      .select("id,page_id,event_type,actor_name,created_at")
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  const firstError = items.error || versions.error || reviews.error || events.error;
  if (firstError) {
    return isMissingTableError(firstError.message)
      ? { ...notConfigured(), impactReviews: [], latestEvents: [] }
      : { status: "failed", warning: firstError.message, impactReviews: [], latestEvents: [] };
  }

  const reviewRows = (reviews.data ?? []).map(row => mapImpactReview(row as Record<string, unknown>));
  return {
    status: "succeeded",
    summary: {
      persistedItems: items.count ?? 0,
      persistedVersions: versions.count ?? 0,
      openImpactReviews: reviewRows.filter(row => row.status === "待复核" || row.status === "处理中").length,
      closedImpactReviews: reviewRows.filter(row => row.status === "已关闭" || row.status === "无需处理").length,
    },
    impactReviews: reviewRows,
    latestEvents: (events.data ?? []).map(row => ({
      id: String(row.id),
      pageId: String(row.page_id || ""),
      eventType: String(row.event_type || ""),
      actorName: typeof row.actor_name === "string" ? row.actor_name : null,
      createdAt: String(row.created_at || ""),
    })),
  };
}

export async function syncKnowledgeLifecycleFromDashboard(input: {
  dashboard: KnowledgeOperationDashboard;
  user: AppUser | null;
  requestId: string;
}): Promise<KnowledgeLifecycleSyncResult> {
  if (!hasEnvironment()) return { ...notConfigured(), requestId: input.requestId };
  const supabase = getAuthSupabase();
  let syncedItems = 0;
  let syncedVersions = 0;
  let syncedImpactReviews = 0;

  for (const item of input.dashboard.items) {
    const { data: itemRow, error: itemError } = await supabase
      .from("knowledge_items")
      .upsert({
        page_id: item.pageId,
        title: item.title,
        knowledge_type: item.type,
        status: item.status,
        owner_name: item.owner,
        domains: item.domains,
        tags: item.tags,
        source_refs: item.sourceRefs,
        confidentiality: item.confidentiality,
        current_version_label: item.version,
        applicable_scenarios: item.domains,
        expires_at: item.expiresAt,
        lifecycle_health: item.lifecycleHealth,
        metadata: {
          impacted_modules: item.impactedModules,
          linked_templates: item.linkedTemplates,
          change_summary: item.changeSummary,
        },
        updated_by: input.user?.id ?? null,
        updated_by_name: actorName(input.user),
      }, { onConflict: "page_id" })
      .select("id,status")
      .single();

    if (itemError) {
      return isMissingTableError(itemError.message)
        ? { ...notConfigured(), requestId: input.requestId }
        : { status: "failed", warning: itemError.message, requestId: input.requestId };
    }
    syncedItems += 1;

    const knowledgeItemId = String(itemRow.id);
    const { data: versionRow, error: versionError } = await supabase
      .from("knowledge_item_versions")
      .upsert({
        knowledge_item_id: knowledgeItemId,
        page_id: item.pageId,
        version_label: item.version,
        snapshot_index_version: input.dashboard.indexVersion,
        content_sha256: hashItem(item),
        change_summary: item.changeSummary,
        source_refs: item.sourceRefs,
        metadata: {
          review_output: item.reviewOutput,
          lifecycle_health: item.lifecycleHealth,
        },
        created_by: input.user?.id ?? null,
        created_by_name: actorName(input.user),
      }, { onConflict: "page_id,version_label" })
      .select("id")
      .single();

    if (versionError) {
      return isMissingTableError(versionError.message)
        ? { ...notConfigured(), requestId: input.requestId }
        : { status: "failed", warning: versionError.message, requestId: input.requestId };
    }
    syncedVersions += 1;

    const action = actionForItem(input.dashboard.lifecycleActions, item.pageId);
    for (const moduleName of item.impactedModules) {
      const impact = impactForModule(input.dashboard.impactModules, moduleName);
      const { error: reviewError } = await supabase
        .from("knowledge_impact_reviews")
        .upsert({
          knowledge_item_id: knowledgeItemId,
          source_version_id: String(versionRow.id),
          module_name: moduleName,
          priority: impact?.priority ?? "P2",
          status: "待复核",
          owner_name: action?.owner ?? item.owner,
          due_date: action?.dueDate ?? datePlus(14),
          review_output: action?.output ?? item.reviewOutput,
          metadata: {
            source_document_id: item.pageId,
            source_version: item.version,
            reason: impact?.reason ?? item.changeSummary,
          },
          request_id: input.requestId,
        }, { onConflict: "knowledge_item_id,module_name,source_version_id" });

      if (reviewError) {
        return isMissingTableError(reviewError.message)
          ? { ...notConfigured(), requestId: input.requestId }
          : { status: "failed", warning: reviewError.message, requestId: input.requestId };
      }
      syncedImpactReviews += 1;
    }

    await supabase.from("knowledge_lifecycle_events").insert({
      knowledge_item_id: knowledgeItemId,
      page_id: item.pageId,
      event_type: "sync_snapshot",
      from_status: null,
      to_status: item.status,
      actor_id: input.user?.id ?? null,
      actor_name: actorName(input.user),
      event_status: "succeeded",
      review_note: "同步当前 RAG 快照到知识生命周期持久化表。",
      request_id: input.requestId,
      metadata: { index_version: input.dashboard.indexVersion, lifecycle_health: item.lifecycleHealth },
    });
  }

  return { status: "succeeded", syncedItems, syncedVersions, syncedImpactReviews, requestId: input.requestId };
}

export async function transitionKnowledgeImpactReview(input: {
  reviewId: string;
  status: KnowledgeImpactReviewRecord["status"];
  closureEvidence?: string;
  reviewOutput?: string;
  user: AppUser | null;
  requestId: string;
}): Promise<KnowledgeImpactReviewTransitionResult> {
  if (!hasEnvironment()) return { ...notConfigured(), requestId: input.requestId };
  const supabase = getAuthSupabase();
  const closing = input.status === "已关闭" || input.status === "无需处理";
  const { data, error } = await supabase
    .from("knowledge_impact_reviews")
    .update({
      status: input.status,
      closure_evidence: input.closureEvidence ?? null,
      review_output: input.reviewOutput ?? undefined,
      reviewer_id: closing ? input.user?.id ?? null : null,
      reviewer_name: closing ? actorName(input.user) : null,
      reviewed_at: closing ? new Date().toISOString() : null,
      request_id: input.requestId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.reviewId)
    .select("id,module_name,priority,status,owner_name,due_date,review_output,closure_evidence,reviewer_name,reviewed_at,knowledge_item_id,knowledge_items(page_id,title)")
    .maybeSingle();

  if (error) {
    return isMissingTableError(error.message)
      ? { ...notConfigured(), requestId: input.requestId }
      : { status: "failed", warning: error.message, requestId: input.requestId };
  }
  if (!data) return { status: "not_found", warning: "知识影响复核记录不存在。", requestId: input.requestId };

  const row = data as Record<string, unknown>;
  const item = row.knowledge_items && typeof row.knowledge_items === "object" ? row.knowledge_items as Record<string, unknown> : {};
  await supabase.from("knowledge_lifecycle_events").insert({
    knowledge_item_id: typeof row.knowledge_item_id === "string" ? row.knowledge_item_id : null,
    page_id: String(item.page_id || ""),
    event_type: "review_submitted",
    actor_id: input.user?.id ?? null,
    actor_name: actorName(input.user),
    event_status: "succeeded",
    review_note: input.closureEvidence || input.reviewOutput || `影响复核状态更新为 ${input.status}`,
    request_id: input.requestId,
    metadata: { impact_review_id: input.reviewId, status: input.status },
  });

  return { status: "succeeded", review: mapImpactReview(row), requestId: input.requestId };
}
