import { createHash } from "node:crypto";
import { getAuthSupabase, isAuthStorageConfigured, type AppUser } from "../auth/server.ts";
import type {
  KnowledgeImpactModule,
  KnowledgeImpactPriority,
  KnowledgeLifecycleAction,
  KnowledgeOperationDashboard,
  KnowledgeOperationItem,
} from "./operations.ts";

const SQL_FILE = "supabase-v5352-knowledge-lifecycle.sql";
const ACTION_SQL_FILE = "supabase-v530-issue-change-action-chain.sql";
const KNOWLEDGE_ACTION_SOURCE_PREFIX = "knowledge-impact-review:";

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

export type KnowledgeVersionChangeType = "新增" | "已更新" | "已删除" | "无变化";

export interface KnowledgeVersionDiffRecord {
  pageId: string;
  title: string;
  changeType: KnowledgeVersionChangeType;
  priority: KnowledgeImpactPriority;
  ownerName: string;
  previousVersionLabel?: string | null;
  currentVersionLabel?: string | null;
  previousSnapshotVersion?: string | null;
  currentSnapshotVersion?: string | null;
  impactedModules: string[];
  linkedTemplates: string[];
  sourceRefs: string[];
  dueDate: string;
  changeSummary: string;
  reviewOutput: string;
}

export interface KnowledgeSubscriptionReminderDraft {
  id: string;
  subscriberName: string;
  moduleName: string;
  domain?: string | null;
  notificationChannel: "in_app" | "feishu" | "email";
  priority: KnowledgeImpactPriority;
  relatedPageIds: string[];
  title: string;
  message: string;
  dueDate: string;
  actionRequired: string;
}

export interface KnowledgeImpactReviewActionCandidate {
  reviewId: string;
  sourceId: string;
  pageId: string;
  title: string;
  moduleName: string;
  priority: "P0" | "P1";
  status: "待复核" | "处理中";
  ownerName: string;
  dueDate: string;
  reviewOutput: string;
}

export type KnowledgeChangeControlResult =
  | {
      status: "succeeded";
      summary: {
        comparedItems: number;
        additions: number;
        modifications: number;
        removals: number;
        unchanged: number;
        activeSubscriptions: number;
        reminderDrafts: number;
        p0p1ActionCandidates: number;
      };
      versionDiffs: KnowledgeVersionDiffRecord[];
      subscriptionReminders: KnowledgeSubscriptionReminderDraft[];
      actionCandidates: KnowledgeImpactReviewActionCandidate[];
    }
  | { status: "not_configured"; warning: string; migration: string; versionDiffs: []; subscriptionReminders: []; actionCandidates: [] }
  | { status: "failed"; warning: string; versionDiffs: []; subscriptionReminders: []; actionCandidates: [] };

export interface KnowledgeUnifiedActionRecord {
  id: string;
  sourceId: string | null;
  title: string;
  owner: string | null;
  dueDate: string | null;
  status: string;
  priority: KnowledgeImpactPriority;
}

export type KnowledgeImpactReviewActionCreationResult =
  | {
      status: "succeeded";
      createdActions: number;
      skippedExisting: number;
      actionItems: KnowledgeUnifiedActionRecord[];
      requestId: string;
    }
  | { status: "not_configured"; warning: string; migration: string; requestId: string }
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

function isMissingActionTableError(message?: string): boolean {
  return Boolean(
    message?.includes("unified_action_items")
    || message?.includes("issue_change_events")
    || message?.includes("relation")
    || message?.includes("does not exist"),
  );
}

function actionNotConfigured(requestId: string) {
  return {
    status: "not_configured" as const,
    warning: "Supabase 尚未创建统一行动项表，无法把知识影响复核转为行动项。",
    migration: ACTION_SQL_FILE,
    requestId,
  };
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function metadataObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function priorityForChange(item: KnowledgeOperationItem, changeType: KnowledgeVersionChangeType): KnowledgeImpactPriority {
  if (changeType === "已删除") return "P0";
  if (item.lifecycleHealth === "已过期" || item.impactedModules.includes("PMO治理中心")) return "P0";
  if (changeType === "已更新" || item.lifecycleHealth === "即将过期" || item.linkedTemplates.length > 0 || item.impactedModules.length >= 3) return "P1";
  return "P2";
}

function actionSourceId(reviewId: string): string {
  return `${KNOWLEDGE_ACTION_SOURCE_PREFIX}${reviewId}`;
}

function mapUnifiedAction(row: Record<string, unknown>): KnowledgeUnifiedActionRecord {
  return {
    id: String(row.id),
    sourceId: typeof row.source_id === "string" ? row.source_id : null,
    title: String(row.title || ""),
    owner: typeof row.owner === "string" ? row.owner : null,
    dueDate: typeof row.due_date === "string" ? row.due_date : null,
    status: String(row.status || "open"),
    priority: String(row.priority || "P1") as KnowledgeImpactPriority,
  };
}

export async function loadKnowledgeChangeControl(input: {
  dashboard: KnowledgeOperationDashboard;
  limit?: number;
}): Promise<KnowledgeChangeControlResult> {
  if (!hasEnvironment()) return { ...notConfigured(), versionDiffs: [], subscriptionReminders: [], actionCandidates: [] };
  const supabase = getAuthSupabase();
  const limit = input.limit ?? 50;

  const [items, versions, subscriptions, reviews] = await Promise.all([
    supabase
      .from("knowledge_items")
      .select("id,page_id,title,status,owner_name,current_version_label,lifecycle_health,domains,tags,source_refs,metadata,updated_at")
      .order("updated_at", { ascending: false })
      .limit(500),
    supabase
      .from("knowledge_item_versions")
      .select("id,knowledge_item_id,page_id,version_label,snapshot_index_version,content_sha256,change_summary,source_refs,metadata,created_at")
      .order("created_at", { ascending: false })
      .limit(800),
    supabase
      .from("knowledge_subscriptions")
      .select("id,subscriber_name,module_name,domain,notification_channel,status")
      .eq("status", "active")
      .limit(200),
    supabase
      .from("knowledge_impact_reviews")
      .select("id,module_name,priority,status,owner_name,due_date,review_output,knowledge_items(page_id,title)")
      .in("status", ["待复核", "处理中"])
      .in("priority", ["P0", "P1"])
      .order("due_date", { ascending: true })
      .limit(50),
  ]);

  const firstError = items.error || versions.error || subscriptions.error || reviews.error;
  if (firstError) {
    return isMissingTableError(firstError.message)
      ? { ...notConfigured(), versionDiffs: [], subscriptionReminders: [], actionCandidates: [] }
      : { status: "failed", warning: firstError.message, versionDiffs: [], subscriptionReminders: [], actionCandidates: [] };
  }

  const persistedItems = new Map<string, Record<string, unknown>>();
  for (const row of items.data ?? []) {
    const record = row as Record<string, unknown>;
    persistedItems.set(String(record.page_id || ""), record);
  }

  const latestVersionByPageId = new Map<string, Record<string, unknown>>();
  for (const row of versions.data ?? []) {
    const record = row as Record<string, unknown>;
    const pageId = String(record.page_id || "");
    if (pageId && !latestVersionByPageId.has(pageId)) latestVersionByPageId.set(pageId, record);
  }

  const currentPageIds = new Set(input.dashboard.items.map(item => item.pageId));
  const versionDiffs: KnowledgeVersionDiffRecord[] = input.dashboard.items.map(item => {
    const previous = latestVersionByPageId.get(item.pageId);
    const previousHash = typeof previous?.content_sha256 === "string" ? previous.content_sha256 : null;
    const changeType: KnowledgeVersionChangeType = !previous
      ? "新增"
      : previousHash !== hashItem(item)
        ? "已更新"
        : "无变化";
    return {
      pageId: item.pageId,
      title: item.title,
      changeType,
      priority: priorityForChange(item, changeType),
      ownerName: item.owner,
      previousVersionLabel: typeof previous?.version_label === "string" ? previous.version_label : null,
      currentVersionLabel: item.version,
      previousSnapshotVersion: typeof previous?.snapshot_index_version === "string" ? previous.snapshot_index_version : null,
      currentSnapshotVersion: input.dashboard.indexVersion,
      impactedModules: item.impactedModules,
      linkedTemplates: item.linkedTemplates,
      sourceRefs: item.sourceRefs,
      dueDate: item.lifecycleHealth === "已过期" ? datePlus(3) : datePlus(14),
      changeSummary: changeType === "无变化" ? "当前快照与上一持久化版本一致。" : item.changeSummary,
      reviewOutput: item.reviewOutput,
    };
  });

  for (const item of persistedItems.values()) {
    const pageId = String(item.page_id || "");
    if (!pageId || currentPageIds.has(pageId)) continue;
    const metadata = metadataObject(item.metadata);
    versionDiffs.push({
      pageId,
      title: String(item.title || pageId),
      changeType: "已删除",
      priority: "P0",
      ownerName: String(item.owner_name || "知识库管理员"),
      previousVersionLabel: typeof item.current_version_label === "string" ? item.current_version_label : null,
      currentVersionLabel: null,
      previousSnapshotVersion: null,
      currentSnapshotVersion: input.dashboard.indexVersion,
      impactedModules: toStringArray(metadata.impacted_modules),
      linkedTemplates: toStringArray(metadata.linked_templates),
      sourceRefs: toStringArray(item.source_refs),
      dueDate: datePlus(3),
      changeSummary: "该知识条目存在于持久化表，但已不在当前 RAG 快照中，需要确认是归档、撤回还是索引缺失。",
      reviewOutput: "确认该知识是否应归档；如果仍有效，需要补回 RAG 索引并说明原因。",
    });
  }

  const actionableDiffs = versionDiffs
    .filter(diff => diff.changeType !== "无变化")
    .sort((a, b) => a.priority.localeCompare(b.priority) || a.dueDate.localeCompare(b.dueDate));

  const activeSubscriptions = (subscriptions.data ?? []).map(row => row as Record<string, unknown>);
  const subscriptionReminders = activeSubscriptions.flatMap(subscription => {
    const moduleName = String(subscription.module_name || "");
    const domain = typeof subscription.domain === "string" ? subscription.domain : null;
    const channel = String(subscription.notification_channel || "in_app") as KnowledgeSubscriptionReminderDraft["notificationChannel"];
    const matched = actionableDiffs.filter(diff => {
      const moduleMatched = moduleName ? diff.impactedModules.includes(moduleName) || moduleName === "全部模块" : false;
      const domainMatched = domain ? diff.sourceRefs.join(" ").includes(domain) || diff.linkedTemplates.includes(domain) : false;
      return moduleMatched || domainMatched;
    });
    if (matched.length === 0) return [];
    const topPriority = matched.some(item => item.priority === "P0") ? "P0" : matched.some(item => item.priority === "P1") ? "P1" : "P2";
    return [{
      id: `knowledge-subscription-reminder-${String(subscription.id)}`,
      subscriberName: String(subscription.subscriber_name || "订阅人"),
      moduleName,
      domain,
      notificationChannel: channel,
      priority: topPriority,
      relatedPageIds: matched.slice(0, 8).map(item => item.pageId),
      title: `${moduleName || domain || "知识订阅"} 知识变更提醒`,
      message: `检测到 ${matched.length} 条知识发生新增、更新或撤出，请复核相关模块输出口径。`,
      dueDate: topPriority === "P0" ? datePlus(3) : datePlus(7),
      actionRequired: "确认订阅模块是否需要更新报告模板、AI提示词、治理流程或业务看板说明。",
    } satisfies KnowledgeSubscriptionReminderDraft];
  });

  const actionCandidates: KnowledgeImpactReviewActionCandidate[] = (reviews.data ?? [])
    .map(row => mapImpactReview(row as Record<string, unknown>))
    .filter(review => (review.priority === "P0" || review.priority === "P1") && (review.status === "待复核" || review.status === "处理中"))
    .map(review => ({
      reviewId: review.id,
      sourceId: actionSourceId(review.id),
      pageId: review.pageId,
      title: `复核知识影响：${review.moduleName} · ${review.title || review.pageId}`,
      moduleName: review.moduleName,
      priority: review.priority as "P0" | "P1",
      status: review.status as "待复核" | "处理中",
      ownerName: review.ownerName,
      dueDate: review.dueDate,
      reviewOutput: review.reviewOutput,
    }));

  return {
    status: "succeeded",
    summary: {
      comparedItems: versionDiffs.length,
      additions: versionDiffs.filter(diff => diff.changeType === "新增").length,
      modifications: versionDiffs.filter(diff => diff.changeType === "已更新").length,
      removals: versionDiffs.filter(diff => diff.changeType === "已删除").length,
      unchanged: versionDiffs.filter(diff => diff.changeType === "无变化").length,
      activeSubscriptions: activeSubscriptions.length,
      reminderDrafts: subscriptionReminders.length,
      p0p1ActionCandidates: actionCandidates.length,
    },
    versionDiffs: actionableDiffs.slice(0, limit),
    subscriptionReminders: subscriptionReminders.slice(0, limit),
    actionCandidates: actionCandidates.slice(0, limit),
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

export async function createKnowledgeImpactReviewActionItems(input: {
  reviewIds?: string[];
  user: AppUser | null;
  requestId: string;
  limit?: number;
}): Promise<KnowledgeImpactReviewActionCreationResult> {
  if (!hasEnvironment()) return actionNotConfigured(input.requestId);
  const supabase = getAuthSupabase();
  const requestedIds = (input.reviewIds ?? []).filter(Boolean);
  const limit = input.limit ?? 20;

  let reviewQuery = supabase
    .from("knowledge_impact_reviews")
    .select("id,module_name,priority,status,owner_name,due_date,review_output,knowledge_item_id,knowledge_items(page_id,title)")
    .in("status", ["待复核", "处理中"])
    .in("priority", ["P0", "P1"])
    .order("due_date", { ascending: true })
    .limit(limit);

  if (requestedIds.length > 0) {
    reviewQuery = reviewQuery.in("id", requestedIds);
  }

  const { data: reviewData, error: reviewError } = await reviewQuery;
  if (reviewError) {
    return isMissingTableError(reviewError.message)
      ? { ...notConfigured(), requestId: input.requestId }
      : { status: "failed", warning: reviewError.message, requestId: input.requestId };
  }

  const reviews = (reviewData ?? [])
    .map(row => mapImpactReview(row as Record<string, unknown>))
    .filter(review => review.priority === "P0" || review.priority === "P1");
  if (reviews.length === 0) {
    return { status: "succeeded", createdActions: 0, skippedExisting: 0, actionItems: [], requestId: input.requestId };
  }

  const sourceIds = reviews.map(review => actionSourceId(review.id));
  const { data: existingData, error: existingError } = await supabase
    .from("unified_action_items")
    .select("id,source_id,title,owner,due_date,status,priority")
    .eq("source_type", "governance")
    .in("source_id", sourceIds);

  if (existingError) {
    return isMissingActionTableError(existingError.message)
      ? actionNotConfigured(input.requestId)
      : { status: "failed", warning: existingError.message, requestId: input.requestId };
  }

  const existingSourceIds = new Set((existingData ?? []).map(row => String((row as Record<string, unknown>).source_id || "")));
  const rowsToInsert = reviews
    .filter(review => !existingSourceIds.has(actionSourceId(review.id)))
    .map(review => ({
      source_type: "governance",
      source_id: actionSourceId(review.id),
      project_name: null,
      title: `复核知识影响：${review.moduleName} · ${review.title || review.pageId}`,
      owner: review.ownerName,
      due_date: review.dueDate || datePlus(7),
      status: "open",
      priority: review.priority,
      created_by: input.user?.id ?? null,
      created_by_name: actorName(input.user),
      metadata: {
        source: "knowledge_lifecycle",
        review_id: review.id,
        page_id: review.pageId,
        module_name: review.moduleName,
        review_output: review.reviewOutput,
      },
    }));

  let createdActions: KnowledgeUnifiedActionRecord[] = [];
  if (rowsToInsert.length > 0) {
    const { data: insertedData, error: insertError } = await supabase
      .from("unified_action_items")
      .insert(rowsToInsert)
      .select("id,source_id,title,owner,due_date,status,priority");

    if (insertError) {
      return isMissingActionTableError(insertError.message)
        ? actionNotConfigured(input.requestId)
        : { status: "failed", warning: insertError.message, requestId: input.requestId };
    }

    createdActions = (insertedData ?? []).map(row => mapUnifiedAction(row as Record<string, unknown>));

    await supabase.from("knowledge_lifecycle_events").insert(createdActions.map(action => ({
      page_id: rowsToInsert.find(row => row.source_id === action.sourceId)?.metadata.page_id ?? "",
      event_type: "review_submitted",
      actor_id: input.user?.id ?? null,
      actor_name: actorName(input.user),
      event_status: "succeeded",
      review_note: `知识影响复核已转为统一行动项：${action.title}`,
      request_id: input.requestId,
      metadata: {
        unified_action_id: action.id,
        source_id: action.sourceId,
      },
    })));
  }

  return {
    status: "succeeded",
    createdActions: createdActions.length,
    skippedExisting: existingSourceIds.size,
    actionItems: [
      ...(existingData ?? []).map(row => mapUnifiedAction(row as Record<string, unknown>)),
      ...createdActions,
    ],
    requestId: input.requestId,
  };
}
