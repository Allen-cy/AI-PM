import { createHash } from "node:crypto";
import { getAuthSupabase, isAuthStorageConfigured, type AppUser } from "../auth/server.ts";
import { createFeishuActionConfirmation } from "../feishu/action-confirmations.ts";
import { templateCatalog } from "../../lib/template-center.ts";
import type {
  KnowledgeImpactModule,
  KnowledgeImpactPriority,
  KnowledgeLifecycleAction,
  KnowledgeOperationDashboard,
  KnowledgeOperationItem,
} from "./operations.ts";

const SQL_FILE = "supabase-v5352-knowledge-lifecycle.sql";
const ACTION_SQL_FILE = "supabase-v530-issue-change-action-chain.sql";
const GOVERNANCE_SQL_FILE = "supabase-v5354-knowledge-governance-operations.sql";
const REFERENCE_AUDIT_SQL_FILE = "supabase-v5355-v5358-knowledge-reference-template-audit.sql";
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

export type KnowledgeLifecycleItemStatus = "draft" | "reviewed" | "published" | "deprecated" | "archived";
export type KnowledgeSubscriptionStatus = "active" | "paused" | "cancelled";
export type KnowledgeNotificationStatus = "draft" | "queued" | "sent" | "failed" | "cancelled";

export interface KnowledgeLifecycleItemRecord {
  id: string;
  pageId: string;
  title: string;
  knowledgeType: string;
  status: KnowledgeLifecycleItemStatus;
  ownerName: string;
  currentVersionLabel?: string | null;
  lifecycleHealth: KnowledgeOperationItem["lifecycleHealth"];
  expiresAt?: string | null;
  domains: string[];
  tags: string[];
  sourceRefs: string[];
  impactedModules: string[];
  linkedTemplates: string[];
  updatedAt?: string | null;
}

export interface KnowledgeSubscriptionRecord {
  id: string;
  subscriberId?: string | null;
  subscriberName?: string | null;
  moduleName: string;
  domain?: string | null;
  notificationChannel: KnowledgeSubscriptionReminderDraft["notificationChannel"];
  status: KnowledgeSubscriptionStatus;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface KnowledgeNotificationRecord {
  id: string;
  subscriptionId?: string | null;
  subscriberName?: string | null;
  moduleName: string;
  domain?: string | null;
  notificationChannel: KnowledgeSubscriptionReminderDraft["notificationChannel"];
  title: string;
  priority: KnowledgeImpactPriority;
  status: KnowledgeNotificationStatus;
  relatedPageIds: string[];
  feishuConfirmationId?: string | null;
  createdAt?: string | null;
  sentAt?: string | null;
}

export interface KnowledgeChangeReportRecord {
  id?: string;
  reportPeriod: string;
  title: string;
  markdown: string;
  summary: Record<string, unknown>;
  createdAt?: string | null;
}

export type KnowledgeGovernanceWorkbenchResult =
  | {
      status: "succeeded";
      summary: {
        managedItems: number;
        activeSubscriptions: number;
        queuedNotifications: number;
        latestReports: number;
      };
      items: KnowledgeLifecycleItemRecord[];
      subscriptions: KnowledgeSubscriptionRecord[];
      notifications: KnowledgeNotificationRecord[];
      latestReports: KnowledgeChangeReportRecord[];
      changeReportPreview: KnowledgeChangeReportRecord;
    }
  | {
      status: "not_configured";
      warning: string;
      migration: string;
      items: [];
      subscriptions: [];
      notifications: [];
      latestReports: [];
      changeReportPreview: null;
    }
  | { status: "failed"; warning: string; items: []; subscriptions: []; notifications: []; latestReports: []; changeReportPreview: null };

export type KnowledgeItemTransitionResult =
  | { status: "succeeded"; item: KnowledgeLifecycleItemRecord; requestId: string }
  | { status: "not_configured"; warning: string; migration: string; requestId: string }
  | { status: "not_found"; warning: string; requestId: string }
  | { status: "failed"; warning: string; requestId: string };

export type KnowledgeSubscriptionMutationResult =
  | { status: "succeeded"; subscription: KnowledgeSubscriptionRecord; requestId: string }
  | { status: "not_configured"; warning: string; migration: string; requestId: string }
  | { status: "not_found"; warning: string; requestId: string }
  | { status: "failed"; warning: string; requestId: string };

export type KnowledgeSubscriptionReminderSendResult =
  | {
      status: "succeeded";
      queuedNotifications: number;
      feishuConfirmations: number;
      notifications: KnowledgeNotificationRecord[];
      requestId: string;
    }
  | { status: "not_configured"; warning: string; migration: string; requestId: string }
  | { status: "failed"; warning: string; requestId: string };

export type KnowledgeChangeReportPersistResult =
  | { status: "succeeded"; report: KnowledgeChangeReportRecord; requestId: string }
  | { status: "not_configured"; warning: string; migration: string; requestId: string }
  | { status: "failed"; warning: string; requestId: string };

export type KnowledgeOutputType = "ai_answer" | "report" | "governance" | "risk" | "template" | "other";
export type KnowledgeTemplateUsageEventType = "download" | "reference" | "import" | "export";
export type KnowledgeDeliveryStatus = "queued" | "sent" | "read" | "handled" | "failed" | "cancelled";

export interface KnowledgeOutputReferenceRecord {
  id: string;
  outputType: KnowledgeOutputType;
  outputId: string;
  outputTitle: string;
  moduleName: string;
  pageId: string;
  knowledgeItemId?: string | null;
  knowledgeVersionId?: string | null;
  versionLabel?: string | null;
  citationText: string;
  confidence: number;
  referenceStatus: "active" | "stale" | "superseded" | "revoked";
  createdByName?: string | null;
  createdAt?: string | null;
}

export interface KnowledgeTemplateDirectoryRecord {
  id: string;
  templateKey: string;
  title: string;
  category: string;
  source: string;
  description: string;
  lifecycleStatus: "draft" | "active" | "reviewing" | "deprecated" | "archived";
  ownerName: string;
  linkedKnowledgePageIds: string[];
  downloadCount: number;
  referenceCount: number;
  lastUsedAt?: string | null;
  updatedAt?: string | null;
}

export interface KnowledgeTemplateUsageEventRecord {
  id: string;
  templateKey: string;
  eventType: KnowledgeTemplateUsageEventType;
  actorName?: string | null;
  outputType?: string | null;
  outputId?: string | null;
  createdAt?: string | null;
}

export interface KnowledgeSubscriptionDeliveryReceiptRecord {
  id: string;
  notificationId?: string | null;
  deliveryChannel: KnowledgeNotificationRecord["notificationChannel"];
  deliveryStatus: KnowledgeDeliveryStatus;
  deliveredTo?: string | null;
  handledByName?: string | null;
  occurredAt?: string | null;
}

export interface KnowledgeAuditPackageRecord {
  id?: string;
  packageType: "knowledge_operations" | "pmo_audit" | "release_handoff";
  packagePeriod: string;
  title: string;
  markdown: string;
  summary: Record<string, unknown>;
  createdAt?: string | null;
}

export interface KnowledgeReferenceCandidate {
  outputType: KnowledgeOutputType;
  outputTitle: string;
  moduleName: string;
  pageId: string;
  versionLabel: string;
  suggestedReason: string;
}

export type KnowledgeReferenceAuditWorkbenchResult =
  | {
      status: "succeeded";
      summary: {
        outputReferences: number;
        managedTemplates: number;
        templateDownloads: number;
        templateReferences: number;
        deliveryReceipts: number;
        handledDeliveries: number;
        auditPackages: number;
      };
      outputReferences: KnowledgeOutputReferenceRecord[];
      referenceCandidates: KnowledgeReferenceCandidate[];
      templateDirectory: KnowledgeTemplateDirectoryRecord[];
      templateUsageEvents: KnowledgeTemplateUsageEventRecord[];
      deliveryReceipts: KnowledgeSubscriptionDeliveryReceiptRecord[];
      recentNotifications: KnowledgeNotificationRecord[];
      auditPackages: KnowledgeAuditPackageRecord[];
      auditPackagePreview: KnowledgeAuditPackageRecord;
    }
  | {
      status: "not_configured";
      warning: string;
      migration: string;
      outputReferences: [];
      referenceCandidates: [];
      templateDirectory: [];
      templateUsageEvents: [];
      deliveryReceipts: [];
      recentNotifications: [];
      auditPackages: [];
      auditPackagePreview: null;
    }
  | {
      status: "failed";
      warning: string;
      outputReferences: [];
      referenceCandidates: [];
      templateDirectory: [];
      templateUsageEvents: [];
      deliveryReceipts: [];
      recentNotifications: [];
      auditPackages: [];
      auditPackagePreview: null;
    };

export type KnowledgeOutputReferenceMutationResult =
  | { status: "succeeded"; reference: KnowledgeOutputReferenceRecord; requestId: string }
  | { status: "not_configured"; warning: string; migration: string; requestId: string }
  | { status: "not_found"; warning: string; requestId: string }
  | { status: "failed"; warning: string; requestId: string };

export type KnowledgeTemplateDirectoryMutationResult =
  | { status: "succeeded"; template: KnowledgeTemplateDirectoryRecord; requestId: string }
  | { status: "not_configured"; warning: string; migration: string; requestId: string }
  | { status: "not_found"; warning: string; requestId: string }
  | { status: "failed"; warning: string; requestId: string };

export type KnowledgeTemplateUsageMutationResult =
  | { status: "succeeded"; template: KnowledgeTemplateDirectoryRecord; event: KnowledgeTemplateUsageEventRecord; requestId: string }
  | { status: "not_configured"; warning: string; migration: string; requestId: string }
  | { status: "not_found"; warning: string; requestId: string }
  | { status: "failed"; warning: string; requestId: string };

export type KnowledgeDeliveryReceiptMutationResult =
  | { status: "succeeded"; receipt: KnowledgeSubscriptionDeliveryReceiptRecord; requestId: string }
  | { status: "not_configured"; warning: string; migration: string; requestId: string }
  | { status: "not_found"; warning: string; requestId: string }
  | { status: "failed"; warning: string; requestId: string };

export type KnowledgeAuditPackagePersistResult =
  | { status: "succeeded"; package: KnowledgeAuditPackageRecord; requestId: string }
  | { status: "not_configured"; warning: string; migration: string; requestId: string }
  | { status: "failed"; warning: string; requestId: string };

export type KnowledgeMarkdownDownloadResult =
  | { status: "succeeded"; title: string; filename: string; markdown: string }
  | { status: "not_configured"; warning: string; migration: string }
  | { status: "not_found"; warning: string }
  | { status: "failed"; warning: string };

function isMissingTableError(message?: string): boolean {
  return Boolean(
    message?.includes("knowledge_items")
    || message?.includes("knowledge_item_versions")
    || message?.includes("knowledge_lifecycle_events")
    || message?.includes("knowledge_impact_reviews")
    || message?.includes("knowledge_subscription_notifications")
    || message?.includes("knowledge_change_reports")
    || message?.includes("knowledge_output_references")
    || message?.includes("knowledge_template_directory_items")
    || message?.includes("knowledge_template_usage_events")
    || message?.includes("knowledge_subscription_delivery_receipts")
    || message?.includes("knowledge_audit_packages")
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

function governanceNotConfigured(requestId?: string) {
  return {
    status: "not_configured" as const,
    warning: "Supabase 尚未创建知识治理运营表，无法记录订阅通知和知识变更报告。",
    migration: GOVERNANCE_SQL_FILE,
    ...(requestId ? { requestId } : {}),
  };
}

function referenceAuditNotConfigured(requestId?: string) {
  return {
    status: "not_configured" as const,
    warning: "Supabase 尚未创建知识引用链、模板目录和审计包表。",
    migration: REFERENCE_AUDIT_SQL_FILE,
    ...(requestId ? { requestId } : {}),
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

function statusToHealth(status: KnowledgeLifecycleItemStatus): KnowledgeOperationItem["lifecycleHealth"] {
  if (status === "archived") return "已归档";
  if (status === "deprecated") return "已过期";
  if (status === "draft") return "待复核";
  return "正常";
}

function eventTypeForStatus(status: KnowledgeLifecycleItemStatus): string {
  if (status === "published") return "publish";
  if (status === "archived") return "archive";
  if (status === "reviewed") return "restore";
  return "status_transition";
}

function mapLifecycleItem(row: Record<string, unknown>): KnowledgeLifecycleItemRecord {
  const metadata = metadataObject(row.metadata);
  return {
    id: String(row.id),
    pageId: String(row.page_id || ""),
    title: String(row.title || ""),
    knowledgeType: String(row.knowledge_type || "general"),
    status: String(row.status || "reviewed") as KnowledgeLifecycleItemStatus,
    ownerName: String(row.owner_name || "知识库管理员"),
    currentVersionLabel: typeof row.current_version_label === "string" ? row.current_version_label : null,
    lifecycleHealth: String(row.lifecycle_health || "正常") as KnowledgeOperationItem["lifecycleHealth"],
    expiresAt: typeof row.expires_at === "string" ? row.expires_at : null,
    domains: toStringArray(row.domains),
    tags: toStringArray(row.tags),
    sourceRefs: toStringArray(row.source_refs),
    impactedModules: toStringArray(metadata.impacted_modules),
    linkedTemplates: toStringArray(metadata.linked_templates),
    updatedAt: typeof row.updated_at === "string" ? row.updated_at : null,
  };
}

function mapSubscription(row: Record<string, unknown>): KnowledgeSubscriptionRecord {
  return {
    id: String(row.id),
    subscriberId: typeof row.subscriber_id === "string" ? row.subscriber_id : null,
    subscriberName: typeof row.subscriber_name === "string" ? row.subscriber_name : null,
    moduleName: String(row.module_name || ""),
    domain: typeof row.domain === "string" ? row.domain : null,
    notificationChannel: String(row.notification_channel || "in_app") as KnowledgeSubscriptionRecord["notificationChannel"],
    status: String(row.status || "active") as KnowledgeSubscriptionStatus,
    createdAt: typeof row.created_at === "string" ? row.created_at : null,
    updatedAt: typeof row.updated_at === "string" ? row.updated_at : null,
  };
}

function mapNotification(row: Record<string, unknown>): KnowledgeNotificationRecord {
  return {
    id: String(row.id),
    subscriptionId: typeof row.subscription_id === "string" ? row.subscription_id : null,
    subscriberName: typeof row.subscriber_name === "string" ? row.subscriber_name : null,
    moduleName: String(row.module_name || ""),
    domain: typeof row.domain === "string" ? row.domain : null,
    notificationChannel: String(row.notification_channel || "in_app") as KnowledgeNotificationRecord["notificationChannel"],
    title: String(row.title || ""),
    priority: String(row.priority || "P1") as KnowledgeImpactPriority,
    status: String(row.status || "queued") as KnowledgeNotificationStatus,
    relatedPageIds: toStringArray(row.related_page_ids),
    feishuConfirmationId: typeof row.feishu_confirmation_id === "string" ? row.feishu_confirmation_id : null,
    createdAt: typeof row.created_at === "string" ? row.created_at : null,
    sentAt: typeof row.sent_at === "string" ? row.sent_at : null,
  };
}

function mapChangeReport(row: Record<string, unknown>): KnowledgeChangeReportRecord {
  return {
    id: String(row.id),
    reportPeriod: String(row.report_period || ""),
    title: String(row.title || ""),
    markdown: String(row.markdown || ""),
    summary: metadataObject(row.summary),
    createdAt: typeof row.created_at === "string" ? row.created_at : null,
  };
}

function mapOutputReference(row: Record<string, unknown>): KnowledgeOutputReferenceRecord {
  return {
    id: String(row.id),
    outputType: String(row.output_type || "other") as KnowledgeOutputType,
    outputId: String(row.output_id || ""),
    outputTitle: String(row.output_title || ""),
    moduleName: String(row.module_name || ""),
    pageId: String(row.page_id || ""),
    knowledgeItemId: typeof row.knowledge_item_id === "string" ? row.knowledge_item_id : null,
    knowledgeVersionId: typeof row.knowledge_version_id === "string" ? row.knowledge_version_id : null,
    versionLabel: typeof row.version_label === "string" ? row.version_label : null,
    citationText: String(row.citation_text || ""),
    confidence: Number(row.confidence ?? 0.8),
    referenceStatus: String(row.reference_status || "active") as KnowledgeOutputReferenceRecord["referenceStatus"],
    createdByName: typeof row.created_by_name === "string" ? row.created_by_name : null,
    createdAt: typeof row.created_at === "string" ? row.created_at : null,
  };
}

function mapTemplateDirectoryRecord(row: Record<string, unknown>): KnowledgeTemplateDirectoryRecord {
  return {
    id: String(row.id),
    templateKey: String(row.template_key || ""),
    title: String(row.title || ""),
    category: String(row.category || "governance"),
    source: String(row.source || "AI-PMO"),
    description: String(row.description || ""),
    lifecycleStatus: String(row.lifecycle_status || "active") as KnowledgeTemplateDirectoryRecord["lifecycleStatus"],
    ownerName: String(row.owner_name || "知识库管理员"),
    linkedKnowledgePageIds: toStringArray(row.linked_knowledge_page_ids),
    downloadCount: Number(row.download_count || 0),
    referenceCount: Number(row.reference_count || 0),
    lastUsedAt: typeof row.last_used_at === "string" ? row.last_used_at : null,
    updatedAt: typeof row.updated_at === "string" ? row.updated_at : null,
  };
}

function mapTemplateUsageEvent(row: Record<string, unknown>): KnowledgeTemplateUsageEventRecord {
  return {
    id: String(row.id),
    templateKey: String(row.template_key || ""),
    eventType: String(row.event_type || "reference") as KnowledgeTemplateUsageEventType,
    actorName: typeof row.actor_name === "string" ? row.actor_name : null,
    outputType: typeof row.output_type === "string" ? row.output_type : null,
    outputId: typeof row.output_id === "string" ? row.output_id : null,
    createdAt: typeof row.created_at === "string" ? row.created_at : null,
  };
}

function mapDeliveryReceipt(row: Record<string, unknown>): KnowledgeSubscriptionDeliveryReceiptRecord {
  return {
    id: String(row.id),
    notificationId: typeof row.notification_id === "string" ? row.notification_id : null,
    deliveryChannel: String(row.delivery_channel || "in_app") as KnowledgeSubscriptionDeliveryReceiptRecord["deliveryChannel"],
    deliveryStatus: String(row.delivery_status || "queued") as KnowledgeDeliveryStatus,
    deliveredTo: typeof row.delivered_to === "string" ? row.delivered_to : null,
    handledByName: typeof row.handled_by_name === "string" ? row.handled_by_name : null,
    occurredAt: typeof row.occurred_at === "string" ? row.occurred_at : null,
  };
}

function mapAuditPackage(row: Record<string, unknown>): KnowledgeAuditPackageRecord {
  return {
    id: String(row.id),
    packageType: String(row.package_type || "knowledge_operations") as KnowledgeAuditPackageRecord["packageType"],
    packagePeriod: String(row.package_period || ""),
    title: String(row.title || ""),
    markdown: String(row.markdown || ""),
    summary: metadataObject(row.summary),
    createdAt: typeof row.created_at === "string" ? row.created_at : null,
  };
}

function templateCatalogFallback(templateKey: string): KnowledgeTemplateDirectoryRecord | null {
  const template = templateCatalog.find(item => item.id === templateKey);
  if (!template) return null;
  return {
    id: `runtime-${template.id}`,
    templateKey: template.id,
    title: template.title,
    category: template.category,
    source: template.source,
    description: template.description,
    lifecycleStatus: "active",
    ownerName: "知识库管理员",
    linkedKnowledgePageIds: [],
    downloadCount: 0,
    referenceCount: 0,
    lastUsedAt: null,
    updatedAt: null,
  };
}

function runtimeTemplateDirectory(dashboard: KnowledgeOperationDashboard): KnowledgeTemplateDirectoryRecord[] {
  const linkedByTemplate = new Map<string, string[]>();
  for (const item of dashboard.items) {
    for (const templateKey of item.linkedTemplates) {
      linkedByTemplate.set(templateKey, [...(linkedByTemplate.get(templateKey) ?? []), item.pageId]);
    }
  }
  return templateCatalog.map(template => ({
    id: `runtime-${template.id}`,
    templateKey: template.id,
    title: template.title,
    category: template.category,
    source: template.source,
    description: template.description,
    lifecycleStatus: "active",
    ownerName: "知识库管理员",
    linkedKnowledgePageIds: linkedByTemplate.get(template.id) ?? [],
    downloadCount: 0,
    referenceCount: 0,
    lastUsedAt: null,
    updatedAt: null,
  }));
}

function referenceCandidates(dashboard: KnowledgeOperationDashboard): KnowledgeReferenceCandidate[] {
  const mapType = (moduleName: string): KnowledgeOutputType => {
    if (moduleName.includes("报告")) return "report";
    if (moduleName.includes("治理")) return "governance";
    if (moduleName.includes("风险")) return "risk";
    if (moduleName.includes("模板")) return "template";
    if (moduleName.includes("问答") || moduleName.includes("AI")) return "ai_answer";
    return "other";
  };
  return dashboard.items
    .filter(item => item.impactedModules.length > 0)
    .slice(0, 12)
    .flatMap(item => item.impactedModules.slice(0, 2).map(moduleName => ({
      outputType: mapType(moduleName),
      outputTitle: `${moduleName}输出口径引用：${item.title}`,
      moduleName,
      pageId: item.pageId,
      versionLabel: item.version,
      suggestedReason: `该知识影响 ${moduleName}，后续输出应绑定 ${item.version}，避免引用旧口径。`,
    })));
}

function reportPeriod(date = new Date()): string {
  const year = date.getUTCFullYear();
  const start = new Date(Date.UTC(year, 0, 1));
  const day = Math.floor((date.getTime() - start.getTime()) / 86_400_000) + 1;
  const week = Math.ceil(day / 7);
  return `${year}-W${String(week).padStart(2, "0")}`;
}

function buildKnowledgeChangeReportMarkdown(input: {
  changeControl: Extract<KnowledgeChangeControlResult, { status: "succeeded" }>;
  notifications: KnowledgeNotificationRecord[];
  actor: string;
  generatedAt?: Date;
}): KnowledgeChangeReportRecord {
  const generatedAt = input.generatedAt ?? new Date();
  const period = reportPeriod(generatedAt);
  const lines = [
    `# 知识变更周报（${period}）`,
    "",
    `生成时间：${generatedAt.toISOString()}`,
    `生成人：${input.actor}`,
    "",
    "## 一、变更摘要",
    "",
    `- 对比条目：${input.changeControl.summary.comparedItems}`,
    `- 新增：${input.changeControl.summary.additions}`,
    `- 更新：${input.changeControl.summary.modifications}`,
    `- 撤出：${input.changeControl.summary.removals}`,
    `- P0/P1行动候选：${input.changeControl.summary.p0p1ActionCandidates}`,
    `- 订阅提醒草稿：${input.changeControl.summary.reminderDrafts}`,
    "",
    "## 二、重点知识差异",
    "",
    ...(
      input.changeControl.versionDiffs.length === 0
        ? ["- 本期未发现需要人工处理的知识差异。"]
        : input.changeControl.versionDiffs.slice(0, 12).map(item => `- [${item.priority}] ${item.changeType}｜${item.pageId}｜${item.title}｜责任人：${item.ownerName}｜deadline：${item.dueDate}`)
    ),
    "",
    "## 三、订阅提醒与发送记录",
    "",
    ...(
      input.notifications.length === 0
        ? ["- 暂无已生成的订阅通知记录。"]
        : input.notifications.slice(0, 12).map(item => `- [${item.status}] ${item.notificationChannel}｜${item.title}｜${item.subscriberName || "未指定"}｜${item.relatedPageIds.join("、") || "无关联页"}`)
    ),
    "",
    "## 四、后续动作",
    "",
    "- PMO/知识管理员复核 P0/P1 差异是否需要调整报告、AI提示词、治理流程或模板目录。",
    "- 模块负责人按订阅提醒确认是否需要更新本模块输出口径。",
    "- 已生成统一行动项的复核任务，必须在统一行动项闭环中补充关闭证据。",
  ];

  return {
    reportPeriod: period,
    title: `知识变更周报-${period}`,
    markdown: lines.join("\n"),
    summary: input.changeControl.summary,
    createdAt: generatedAt.toISOString(),
  };
}

function buildKnowledgeAuditPackageMarkdown(input: {
  outputReferences: KnowledgeOutputReferenceRecord[];
  templateDirectory: KnowledgeTemplateDirectoryRecord[];
  templateUsageEvents: KnowledgeTemplateUsageEventRecord[];
  deliveryReceipts: KnowledgeSubscriptionDeliveryReceiptRecord[];
  notifications: KnowledgeNotificationRecord[];
  changeReports: KnowledgeChangeReportRecord[];
  actor: string;
  generatedAt?: Date;
}): KnowledgeAuditPackageRecord {
  const generatedAt = input.generatedAt ?? new Date();
  const period = reportPeriod(generatedAt);
  const templateDownloads = input.templateDirectory.reduce((sum, item) => sum + item.downloadCount, 0);
  const templateReferences = input.templateDirectory.reduce((sum, item) => sum + item.referenceCount, 0);
  const handledDeliveries = input.deliveryReceipts.filter(item => item.deliveryStatus === "handled").length;
  const lines = [
    `# PMO知识运营审计包-${period}`,
    "",
    `生成时间：${generatedAt.toISOString()}`,
    `生成人：${input.actor}`,
    "",
    "## 一、审计范围",
    "",
    "- 知识版本引用链：AI问答、报告、治理结论、风险输出等是否绑定具体知识版本。",
    "- 模板/最佳实践目录：模板是否有责任人、关联知识页、下载/引用统计。",
    "- 订阅投递闭环：站内、飞书、邮件提醒是否有发送、阅读、处理或失败回执。",
    "- 知识变更报告：本期知识变更周报和历史报告是否可下载归档。",
    "",
    "## 二、关键统计",
    "",
    `- 输出引用记录：${input.outputReferences.length} 条`,
    `- 模板目录：${input.templateDirectory.length} 项，下载 ${templateDownloads} 次，引用 ${templateReferences} 次`,
    `- 订阅通知：${input.notifications.length} 条，投递回执 ${input.deliveryReceipts.length} 条，已处理 ${handledDeliveries} 条`,
    `- 知识变更报告：${input.changeReports.length} 份`,
    "",
    "## 三、知识版本引用链",
    "",
    ...(
      input.outputReferences.length === 0
        ? ["- 暂无已保存的输出引用记录。建议先为报告工厂、知识问答和治理结论绑定具体知识版本。"]
        : input.outputReferences.slice(0, 20).map(item => `- [${item.outputType}] ${item.outputTitle}｜模块：${item.moduleName}｜知识：${item.pageId}｜版本：${item.versionLabel || "未绑定"}｜状态：${item.referenceStatus}`)
    ),
    "",
    "## 四、模板与最佳实践目录",
    "",
    ...(
      input.templateDirectory.length === 0
        ? ["- 暂无模板目录记录。"]
        : input.templateDirectory.slice(0, 20).map(item => `- ${item.title}｜${item.templateKey}｜状态：${item.lifecycleStatus}｜责任人：${item.ownerName}｜下载：${item.downloadCount}｜引用：${item.referenceCount}｜关联知识：${item.linkedKnowledgePageIds.join("、") || "待补充"}`)
    ),
    "",
    "## 五、订阅通知投递闭环",
    "",
    ...(
      input.deliveryReceipts.length === 0
        ? ["- 暂无投递回执。站内/飞书/邮件通知生成后，需要补充发送、阅读、处理或失败状态。"]
        : input.deliveryReceipts.slice(0, 20).map(item => `- [${item.deliveryStatus}] ${item.deliveryChannel}｜通知：${item.notificationId || "未关联"}｜接收对象：${item.deliveredTo || "未记录"}｜处理人：${item.handledByName || "未处理"}｜时间：${item.occurredAt || "未记录"}`)
    ),
    "",
    "## 六、模板使用事件",
    "",
    ...(
      input.templateUsageEvents.length === 0
        ? ["- 暂无模板使用事件。"]
        : input.templateUsageEvents.slice(0, 20).map(item => `- ${item.eventType}｜${item.templateKey}｜输出：${item.outputType || "-"} ${item.outputId || ""}｜操作人：${item.actorName || "系统"}｜${item.createdAt || ""}`)
    ),
    "",
    "## 七、审计结论与后续动作",
    "",
    "- P0/P1 知识变更必须检查是否影响报告、治理流程、风险扫描和模板中心。",
    "- 任何 AI 或报告输出进入正式流转前，应在知识输出引用链中记录 page_id 与 version_label。",
    "- 飞书提醒继续保持待确认边界，确认执行后的结果通过投递回执反写。",
  ];
  return {
    packageType: "pmo_audit",
    packagePeriod: period,
    title: `PMO知识运营审计包-${period}`,
    markdown: lines.join("\n"),
    summary: {
      output_references: input.outputReferences.length,
      managed_templates: input.templateDirectory.length,
      template_downloads: templateDownloads,
      template_references: templateReferences,
      delivery_receipts: input.deliveryReceipts.length,
      handled_deliveries: handledDeliveries,
      change_reports: input.changeReports.length,
    },
    createdAt: generatedAt.toISOString(),
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

export async function loadKnowledgeGovernanceWorkbench(input: {
  dashboard: KnowledgeOperationDashboard;
  user: AppUser | null;
  limit?: number;
}): Promise<KnowledgeGovernanceWorkbenchResult> {
  if (!hasEnvironment()) return { ...governanceNotConfigured(), items: [], subscriptions: [], notifications: [], latestReports: [], changeReportPreview: null };
  const supabase = getAuthSupabase();
  const limit = input.limit ?? 30;

  const changeControl = await loadKnowledgeChangeControl({ dashboard: input.dashboard, limit });
  if (changeControl.status !== "succeeded") {
    return {
      status: changeControl.status,
      warning: changeControl.warning,
      migration: "migration" in changeControl ? changeControl.migration : GOVERNANCE_SQL_FILE,
      items: [],
      subscriptions: [],
      notifications: [],
      latestReports: [],
      changeReportPreview: null,
    } as KnowledgeGovernanceWorkbenchResult;
  }

  const [items, subscriptions, notifications, reports] = await Promise.all([
    supabase
      .from("knowledge_items")
      .select("id,page_id,title,knowledge_type,status,owner_name,current_version_label,lifecycle_health,expires_at,domains,tags,source_refs,metadata,updated_at")
      .order("updated_at", { ascending: false })
      .limit(limit),
    supabase
      .from("knowledge_subscriptions")
      .select("id,subscriber_id,subscriber_name,module_name,domain,notification_channel,status,created_at,updated_at")
      .order("updated_at", { ascending: false })
      .limit(limit),
    supabase
      .from("knowledge_subscription_notifications")
      .select("id,subscription_id,subscriber_name,module_name,domain,notification_channel,title,priority,status,related_page_ids,feishu_confirmation_id,created_at,sent_at")
      .order("created_at", { ascending: false })
      .limit(limit),
    supabase
      .from("knowledge_change_reports")
      .select("id,report_period,title,markdown,summary,created_at")
      .order("created_at", { ascending: false })
      .limit(8),
  ]);

  const firstError = items.error || subscriptions.error || notifications.error || reports.error;
  if (firstError) {
    return isMissingTableError(firstError.message)
      ? { ...governanceNotConfigured(), items: [], subscriptions: [], notifications: [], latestReports: [], changeReportPreview: null }
      : { status: "failed", warning: firstError.message, items: [], subscriptions: [], notifications: [], latestReports: [], changeReportPreview: null };
  }

  const notificationRows = (notifications.data ?? []).map(row => mapNotification(row as Record<string, unknown>));
  return {
    status: "succeeded",
    summary: {
      managedItems: items.data?.length ?? 0,
      activeSubscriptions: (subscriptions.data ?? []).filter(row => (row as Record<string, unknown>).status === "active").length,
      queuedNotifications: notificationRows.filter(row => row.status === "queued").length,
      latestReports: reports.data?.length ?? 0,
    },
    items: (items.data ?? []).map(row => mapLifecycleItem(row as Record<string, unknown>)),
    subscriptions: (subscriptions.data ?? []).map(row => mapSubscription(row as Record<string, unknown>)),
    notifications: notificationRows,
    latestReports: (reports.data ?? []).map(row => mapChangeReport(row as Record<string, unknown>)),
    changeReportPreview: buildKnowledgeChangeReportMarkdown({
      changeControl,
      notifications: notificationRows,
      actor: actorName(input.user),
    }),
  };
}

export async function loadKnowledgeReferenceAuditWorkbench(input: {
  dashboard: KnowledgeOperationDashboard;
  user: AppUser | null;
  limit?: number;
}): Promise<KnowledgeReferenceAuditWorkbenchResult> {
  if (!hasEnvironment()) {
    return {
      ...referenceAuditNotConfigured(),
      outputReferences: [],
      referenceCandidates: [],
      templateDirectory: [],
      templateUsageEvents: [],
      deliveryReceipts: [],
      recentNotifications: [],
      auditPackages: [],
      auditPackagePreview: null,
    };
  }
  const supabase = getAuthSupabase();
  const limit = input.limit ?? 30;

  const [references, templates, usageEvents, deliveryReceipts, notifications, auditPackages, changeReports] = await Promise.all([
    supabase
      .from("knowledge_output_references")
      .select("id,output_type,output_id,output_title,module_name,page_id,knowledge_item_id,knowledge_version_id,version_label,citation_text,confidence,reference_status,created_by_name,created_at")
      .order("created_at", { ascending: false })
      .limit(limit),
    supabase
      .from("knowledge_template_directory_items")
      .select("id,template_key,title,category,source,description,lifecycle_status,owner_name,linked_knowledge_page_ids,download_count,reference_count,last_used_at,updated_at")
      .order("updated_at", { ascending: false })
      .limit(200),
    supabase
      .from("knowledge_template_usage_events")
      .select("id,template_key,event_type,actor_name,output_type,output_id,created_at")
      .order("created_at", { ascending: false })
      .limit(limit),
    supabase
      .from("knowledge_subscription_delivery_receipts")
      .select("id,notification_id,delivery_channel,delivery_status,delivered_to,handled_by_name,occurred_at")
      .order("occurred_at", { ascending: false })
      .limit(limit),
    supabase
      .from("knowledge_subscription_notifications")
      .select("id,subscription_id,subscriber_name,module_name,domain,notification_channel,title,priority,status,related_page_ids,feishu_confirmation_id,created_at,sent_at")
      .order("created_at", { ascending: false })
      .limit(limit),
    supabase
      .from("knowledge_audit_packages")
      .select("id,package_type,package_period,title,markdown,summary,created_at")
      .order("created_at", { ascending: false })
      .limit(8),
    supabase
      .from("knowledge_change_reports")
      .select("id,report_period,title,markdown,summary,created_at")
      .order("created_at", { ascending: false })
      .limit(8),
  ]);

  const firstError = references.error || templates.error || usageEvents.error || deliveryReceipts.error || notifications.error || auditPackages.error || changeReports.error;
  if (firstError) {
    return isMissingTableError(firstError.message)
      ? {
          ...referenceAuditNotConfigured(),
          outputReferences: [],
          referenceCandidates: [],
          templateDirectory: [],
          templateUsageEvents: [],
          deliveryReceipts: [],
          recentNotifications: [],
          auditPackages: [],
          auditPackagePreview: null,
        }
      : {
          status: "failed",
          warning: firstError.message,
          outputReferences: [],
          referenceCandidates: [],
          templateDirectory: [],
          templateUsageEvents: [],
          deliveryReceipts: [],
          recentNotifications: [],
          auditPackages: [],
          auditPackagePreview: null,
        };
  }

  const outputReferenceRows = (references.data ?? []).map(row => mapOutputReference(row as Record<string, unknown>));
  const persistedTemplates = (templates.data ?? []).map(row => mapTemplateDirectoryRecord(row as Record<string, unknown>));
  const templateByKey = new Map(runtimeTemplateDirectory(input.dashboard).map(item => [item.templateKey, item]));
  for (const item of persistedTemplates) templateByKey.set(item.templateKey, item);
  const templateDirectory = [...templateByKey.values()].sort((a, b) => b.referenceCount - a.referenceCount || b.downloadCount - a.downloadCount || a.title.localeCompare(b.title));
  const templateUsageRows = (usageEvents.data ?? []).map(row => mapTemplateUsageEvent(row as Record<string, unknown>));
  const deliveryReceiptRows = (deliveryReceipts.data ?? []).map(row => mapDeliveryReceipt(row as Record<string, unknown>));
  const notificationRows = (notifications.data ?? []).map(row => mapNotification(row as Record<string, unknown>));
  const auditPackageRows = (auditPackages.data ?? []).map(row => mapAuditPackage(row as Record<string, unknown>));
  const changeReportRows = (changeReports.data ?? []).map(row => mapChangeReport(row as Record<string, unknown>));
  const auditPackagePreview = buildKnowledgeAuditPackageMarkdown({
    outputReferences: outputReferenceRows,
    templateDirectory,
    templateUsageEvents: templateUsageRows,
    deliveryReceipts: deliveryReceiptRows,
    notifications: notificationRows,
    changeReports: changeReportRows,
    actor: actorName(input.user),
  });

  return {
    status: "succeeded",
    summary: {
      outputReferences: outputReferenceRows.length,
      managedTemplates: persistedTemplates.length,
      templateDownloads: templateDirectory.reduce((sum, item) => sum + item.downloadCount, 0),
      templateReferences: templateDirectory.reduce((sum, item) => sum + item.referenceCount, 0),
      deliveryReceipts: deliveryReceiptRows.length,
      handledDeliveries: deliveryReceiptRows.filter(item => item.deliveryStatus === "handled").length,
      auditPackages: auditPackageRows.length,
    },
    outputReferences: outputReferenceRows,
    referenceCandidates: referenceCandidates(input.dashboard),
    templateDirectory,
    templateUsageEvents: templateUsageRows,
    deliveryReceipts: deliveryReceiptRows,
    recentNotifications: notificationRows,
    auditPackages: auditPackageRows,
    auditPackagePreview,
  };
}

export async function transitionKnowledgeItemStatus(input: {
  pageId: string;
  status: KnowledgeLifecycleItemStatus;
  reviewNote: string;
  user: AppUser | null;
  requestId: string;
  versionLabel?: string;
  title?: string;
  ownerName?: string;
  expiresAt?: string;
}): Promise<KnowledgeItemTransitionResult> {
  if (!hasEnvironment()) return { ...notConfigured(), requestId: input.requestId };
  const note = input.reviewNote.trim();
  if (!note) return { status: "failed", warning: "知识状态流转必须填写复核/审批意见。", requestId: input.requestId };
  const supabase = getAuthSupabase();
  const { data: current, error: currentError } = await supabase
    .from("knowledge_items")
    .select("id,page_id,title,knowledge_type,status,owner_name,current_version_label,lifecycle_health,expires_at,domains,tags,source_refs,metadata,updated_at")
    .eq("page_id", input.pageId)
    .maybeSingle();

  if (currentError) {
    return isMissingTableError(currentError.message)
      ? { ...notConfigured(), requestId: input.requestId }
      : { status: "failed", warning: currentError.message, requestId: input.requestId };
  }
  if (!current) return { status: "not_found", warning: "知识条目不存在，请先同步当前快照。", requestId: input.requestId };

  const currentRecord = current as Record<string, unknown>;
  const fromStatus = String(currentRecord.status || "reviewed") as KnowledgeLifecycleItemStatus;
  const nextVersionLabel = input.versionLabel?.trim()
    || (input.status === "published"
      ? `${String(currentRecord.current_version_label || input.pageId)}.${new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 12)}`
      : String(currentRecord.current_version_label || ""));

  const { data, error } = await supabase
    .from("knowledge_items")
    .update({
      title: input.title?.trim() || currentRecord.title,
      status: input.status,
      owner_name: input.ownerName?.trim() || currentRecord.owner_name,
      current_version_label: nextVersionLabel || currentRecord.current_version_label,
      expires_at: input.expiresAt || currentRecord.expires_at || null,
      lifecycle_health: statusToHealth(input.status),
      updated_by: input.user?.id ?? null,
      updated_by_name: actorName(input.user),
      updated_at: new Date().toISOString(),
      metadata: {
        ...metadataObject(currentRecord.metadata),
        last_transition_note: note,
        last_transition_by: actorName(input.user),
        last_transition_at: new Date().toISOString(),
      },
    })
    .eq("page_id", input.pageId)
    .select("id,page_id,title,knowledge_type,status,owner_name,current_version_label,lifecycle_health,expires_at,domains,tags,source_refs,metadata,updated_at")
    .single();

  if (error) {
    return isMissingTableError(error.message)
      ? { ...notConfigured(), requestId: input.requestId }
      : { status: "failed", warning: error.message, requestId: input.requestId };
  }

  if (input.status === "published") {
    await supabase.from("knowledge_item_versions").insert({
      knowledge_item_id: String(currentRecord.id),
      page_id: input.pageId,
      version_label: nextVersionLabel || `${input.pageId}.${Date.now()}`,
      snapshot_index_version: "manual-transition",
      content_sha256: createHash("sha256").update(JSON.stringify({ ...data, note })).digest("hex"),
      change_summary: note,
      source_refs: toStringArray(currentRecord.source_refs),
      metadata: { transition: "publish", from_status: fromStatus, to_status: input.status },
      created_by: input.user?.id ?? null,
      created_by_name: actorName(input.user),
    });
  }

  await supabase.from("knowledge_lifecycle_events").insert({
    knowledge_item_id: String(currentRecord.id),
    page_id: input.pageId,
    event_type: eventTypeForStatus(input.status),
    from_status: fromStatus,
    to_status: input.status,
    actor_id: input.user?.id ?? null,
    actor_name: actorName(input.user),
    event_status: "succeeded",
    review_note: note,
    request_id: input.requestId,
    metadata: { version_label: nextVersionLabel || null },
  });

  return { status: "succeeded", item: mapLifecycleItem(data as Record<string, unknown>), requestId: input.requestId };
}

export async function upsertKnowledgeSubscription(input: {
  id?: string;
  moduleName: string;
  domain?: string;
  notificationChannel: KnowledgeSubscriptionRecord["notificationChannel"];
  subscriberName?: string;
  status?: KnowledgeSubscriptionStatus;
  user: AppUser | null;
  requestId: string;
}): Promise<KnowledgeSubscriptionMutationResult> {
  if (!hasEnvironment()) return { ...notConfigured(), requestId: input.requestId };
  const moduleName = input.moduleName.trim();
  if (!moduleName) return { status: "failed", warning: "订阅模块不能为空。", requestId: input.requestId };
  const supabase = getAuthSupabase();
  const payload = {
    subscriber_id: input.user?.id ?? null,
    subscriber_name: input.subscriberName?.trim() || actorName(input.user),
    module_name: moduleName,
    domain: input.domain?.trim() || null,
    notification_channel: input.notificationChannel,
    status: input.status ?? "active",
    updated_at: new Date().toISOString(),
  };
  const query = input.id
    ? supabase.from("knowledge_subscriptions").update(payload).eq("id", input.id)
    : supabase.from("knowledge_subscriptions").insert(payload);
  const { data, error } = await query
    .select("id,subscriber_id,subscriber_name,module_name,domain,notification_channel,status,created_at,updated_at")
    .maybeSingle();

  if (error) {
    return isMissingTableError(error.message)
      ? { ...notConfigured(), requestId: input.requestId }
      : { status: "failed", warning: error.message, requestId: input.requestId };
  }
  if (!data) return { status: "not_found", warning: "知识订阅记录不存在。", requestId: input.requestId };

  const subscription = mapSubscription(data as Record<string, unknown>);
  await supabase.from("knowledge_lifecycle_events").insert({
    page_id: `subscription:${subscription.id}`,
    event_type: input.id ? "subscription_updated" : "subscription_created",
    actor_id: input.user?.id ?? null,
    actor_name: actorName(input.user),
    event_status: "succeeded",
    review_note: `知识订阅已${input.id ? "更新" : "创建"}：${subscription.moduleName}`,
    request_id: input.requestId,
    metadata: { subscription_id: subscription.id, channel: subscription.notificationChannel, domain: subscription.domain },
  });

  return { status: "succeeded", subscription, requestId: input.requestId };
}

export async function updateKnowledgeSubscriptionStatus(input: {
  id: string;
  status: KnowledgeSubscriptionStatus;
  user: AppUser | null;
  requestId: string;
}): Promise<KnowledgeSubscriptionMutationResult> {
  if (!hasEnvironment()) return { ...notConfigured(), requestId: input.requestId };
  const supabase = getAuthSupabase();
  const { data, error } = await supabase
    .from("knowledge_subscriptions")
    .update({ status: input.status, updated_at: new Date().toISOString() })
    .eq("id", input.id)
    .select("id,subscriber_id,subscriber_name,module_name,domain,notification_channel,status,created_at,updated_at")
    .maybeSingle();

  if (error) {
    return isMissingTableError(error.message)
      ? { ...notConfigured(), requestId: input.requestId }
      : { status: "failed", warning: error.message, requestId: input.requestId };
  }
  if (!data) return { status: "not_found", warning: "知识订阅记录不存在。", requestId: input.requestId };

  const subscription = mapSubscription(data as Record<string, unknown>);
  await supabase.from("knowledge_lifecycle_events").insert({
    page_id: `subscription:${subscription.id}`,
    event_type: "subscription_updated",
    actor_id: input.user?.id ?? null,
    actor_name: actorName(input.user),
    event_status: "succeeded",
    review_note: `知识订阅状态更新为 ${subscription.status}`,
    request_id: input.requestId,
    metadata: { subscription_id: subscription.id, status: subscription.status },
  });

  return { status: "succeeded", subscription, requestId: input.requestId };
}

function subscriptionIdFromReminder(reminderId: string): string {
  return reminderId.replace(/^knowledge-subscription-reminder-/, "");
}

export async function queueKnowledgeSubscriptionReminders(input: {
  dashboard: KnowledgeOperationDashboard;
  user: AppUser | null;
  requestId: string;
  reminderIds?: string[];
  feishuReceiveId?: string;
  feishuReceiveIdType?: "chat_id" | "open_id";
}): Promise<KnowledgeSubscriptionReminderSendResult> {
  if (!hasEnvironment()) return { ...governanceNotConfigured(), requestId: input.requestId };
  const changeControl = await loadKnowledgeChangeControl({ dashboard: input.dashboard, limit: 80 });
  if (changeControl.status !== "succeeded") {
    return "migration" in changeControl
      ? { ...governanceNotConfigured(), warning: changeControl.warning, requestId: input.requestId }
      : { status: "failed", warning: changeControl.warning, requestId: input.requestId };
  }

  const reminderIdSet = new Set(input.reminderIds ?? []);
  const reminders = changeControl.subscriptionReminders
    .filter(reminder => reminderIdSet.size === 0 || reminderIdSet.has(reminder.id));
  if (reminders.length === 0) {
    return { status: "succeeded", queuedNotifications: 0, feishuConfirmations: 0, notifications: [], requestId: input.requestId };
  }

  const supabase = getAuthSupabase();
  const created: KnowledgeNotificationRecord[] = [];
  let feishuConfirmations = 0;

  for (const reminder of reminders) {
    let feishuConfirmationId: string | null = null;
    let notificationStatus: KnowledgeNotificationStatus = "queued";

    if (reminder.notificationChannel === "feishu") {
      if (!input.feishuReceiveId?.trim()) {
        notificationStatus = "draft";
      } else {
        const queued = await createFeishuActionConfirmation({
          user: input.user,
          source: "user_center",
          sourcePage: "/knowledge/operations",
          requestId: input.requestId,
          payload: {
            type: "message",
            idempotency_key: `knowledge-reminder-${reminder.id}-${input.requestId}`,
            receive_id_type: input.feishuReceiveIdType ?? "chat_id",
            receive_id: input.feishuReceiveId.trim(),
            text: [
              reminder.title,
              "",
              reminder.message,
              `优先级：${reminder.priority}`,
              `截止日期：${reminder.dueDate}`,
              `相关知识：${reminder.relatedPageIds.join("、") || "无"}`,
              `处理要求：${reminder.actionRequired}`,
            ].join("\n"),
            source_page: "/knowledge/operations",
          },
        });
        if (queued.status === "succeeded") {
          feishuConfirmationId = queued.confirmation.id;
          feishuConfirmations += 1;
        } else {
          notificationStatus = "failed";
        }
      }
    }

    const { data, error } = await supabase
      .from("knowledge_subscription_notifications")
      .insert({
        subscription_id: subscriptionIdFromReminder(reminder.id),
        subscriber_id: input.user?.id ?? null,
        subscriber_name: reminder.subscriberName,
        module_name: reminder.moduleName,
        domain: reminder.domain ?? null,
        notification_channel: reminder.notificationChannel,
        title: reminder.title,
        message: reminder.message,
        related_page_ids: reminder.relatedPageIds,
        action_required: reminder.actionRequired,
        priority: reminder.priority,
        status: notificationStatus,
        feishu_confirmation_id: feishuConfirmationId,
        sent_by: input.user?.id ?? null,
        sent_by_name: actorName(input.user),
        sent_at: notificationStatus === "queued" && reminder.notificationChannel !== "feishu" ? new Date().toISOString() : null,
        request_id: input.requestId,
        metadata: {
          reminder_id: reminder.id,
          due_date: reminder.dueDate,
          feishu_receive_id_type: input.feishuReceiveIdType ?? null,
          delivery_boundary: reminder.notificationChannel === "feishu"
            ? "已进入飞书写入待确认队列，需用户在集成中心确认后才外发。"
            : "当前记录为系统内通知发送记录。",
        },
      })
      .select("id,subscription_id,subscriber_name,module_name,domain,notification_channel,title,priority,status,related_page_ids,feishu_confirmation_id,created_at,sent_at")
      .single();

    if (error) {
      return isMissingTableError(error.message)
        ? { ...governanceNotConfigured(), requestId: input.requestId }
        : { status: "failed", warning: error.message, requestId: input.requestId };
    }

    const notification = mapNotification(data as Record<string, unknown>);
    created.push(notification);
    await supabase.from("knowledge_lifecycle_events").insert({
      page_id: `subscription:${notification.subscriptionId || reminder.id}`,
      event_type: notificationStatus === "queued" ? "subscription_notification_queued" : "subscription_notification_sent",
      actor_id: input.user?.id ?? null,
      actor_name: actorName(input.user),
      event_status: notificationStatus === "failed" ? "failed" : "succeeded",
      review_note: `${reminder.notificationChannel}提醒已${notificationStatus === "draft" ? "生成草稿" : notificationStatus === "failed" ? "生成失败" : "进入发送队列"}：${reminder.title}`,
      request_id: input.requestId,
      metadata: {
        notification_id: notification.id,
        reminder_id: reminder.id,
        feishu_confirmation_id: feishuConfirmationId,
      },
    });
  }

  return {
    status: "succeeded",
    queuedNotifications: created.length,
    feishuConfirmations,
    notifications: created,
    requestId: input.requestId,
  };
}

export async function persistKnowledgeChangeReport(input: {
  dashboard: KnowledgeOperationDashboard;
  user: AppUser | null;
  requestId: string;
}): Promise<KnowledgeChangeReportPersistResult> {
  if (!hasEnvironment()) return { ...governanceNotConfigured(), requestId: input.requestId };
  const supabase = getAuthSupabase();
  const governance = await loadKnowledgeGovernanceWorkbench({ dashboard: input.dashboard, user: input.user, limit: 80 });
  if (governance.status !== "succeeded") {
    return "migration" in governance
      ? { ...governanceNotConfigured(), warning: governance.warning, requestId: input.requestId }
      : { status: "failed", warning: governance.warning, requestId: input.requestId };
  }

  const report = governance.changeReportPreview;
  const { data, error } = await supabase
    .from("knowledge_change_reports")
    .insert({
      report_period: report.reportPeriod,
      title: report.title,
      markdown: report.markdown,
      summary: report.summary,
      generated_by: input.user?.id ?? null,
      generated_by_name: actorName(input.user),
      request_id: input.requestId,
    })
    .select("id,report_period,title,markdown,summary,created_at")
    .single();

  if (error) {
    return isMissingTableError(error.message)
      ? { ...governanceNotConfigured(), requestId: input.requestId }
      : { status: "failed", warning: error.message, requestId: input.requestId };
  }

  const persisted = mapChangeReport(data as Record<string, unknown>);
  await supabase.from("knowledge_lifecycle_events").insert({
    page_id: `report:${persisted.id}`,
    event_type: "change_report_generated",
    actor_id: input.user?.id ?? null,
    actor_name: actorName(input.user),
    event_status: "succeeded",
    review_note: `知识变更报告已生成：${persisted.title}`,
    request_id: input.requestId,
    metadata: { report_id: persisted.id, report_period: persisted.reportPeriod },
  });

  return { status: "succeeded", report: persisted, requestId: input.requestId };
}

export async function createKnowledgeOutputReference(input: {
  outputType: KnowledgeOutputType;
  outputId: string;
  outputTitle: string;
  moduleName: string;
  pageId: string;
  citationText?: string;
  confidence?: number;
  user: AppUser | null;
  requestId: string;
}): Promise<KnowledgeOutputReferenceMutationResult> {
  if (!hasEnvironment()) return { ...referenceAuditNotConfigured(), requestId: input.requestId };
  const outputId = input.outputId.trim();
  const outputTitle = input.outputTitle.trim();
  const moduleName = input.moduleName.trim();
  const pageId = input.pageId.trim();
  if (!outputId || !outputTitle || !moduleName || !pageId) {
    return { status: "failed", warning: "输出ID、输出标题、模块名称和知识 pageId 均不能为空。", requestId: input.requestId };
  }
  const supabase = getAuthSupabase();
  const { data: item, error: itemError } = await supabase
    .from("knowledge_items")
    .select("id,page_id,title,current_version_label")
    .eq("page_id", pageId)
    .maybeSingle();
  if (itemError) {
    return isMissingTableError(itemError.message)
      ? { ...referenceAuditNotConfigured(), requestId: input.requestId }
      : { status: "failed", warning: itemError.message, requestId: input.requestId };
  }
  if (!item) return { status: "not_found", warning: "知识条目不存在，请先在知识生命周期运营页同步当前 RAG 快照。", requestId: input.requestId };

  const { data: version, error: versionError } = await supabase
    .from("knowledge_item_versions")
    .select("id,version_label")
    .eq("page_id", pageId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (versionError) {
    return isMissingTableError(versionError.message)
      ? { ...referenceAuditNotConfigured(), requestId: input.requestId }
      : { status: "failed", warning: versionError.message, requestId: input.requestId };
  }

  const itemRecord = item as Record<string, unknown>;
  const versionRecord = version as Record<string, unknown> | null;
  const versionLabel = typeof versionRecord?.version_label === "string"
    ? versionRecord.version_label
    : typeof itemRecord.current_version_label === "string"
      ? itemRecord.current_version_label
      : null;
  const { data, error } = await supabase
    .from("knowledge_output_references")
    .upsert({
      output_type: input.outputType,
      output_id: outputId,
      output_title: outputTitle,
      module_name: moduleName,
      page_id: pageId,
      knowledge_item_id: String(itemRecord.id),
      knowledge_version_id: typeof versionRecord?.id === "string" ? versionRecord.id : null,
      version_label: versionLabel,
      citation_text: input.citationText?.trim() || `输出「${outputTitle}」引用知识「${String(itemRecord.title || pageId)}」版本 ${versionLabel || "未设置"}。`,
      confidence: Math.max(0, Math.min(1, Number(input.confidence ?? 0.8))),
      reference_status: "active",
      created_by: input.user?.id ?? null,
      created_by_name: actorName(input.user),
      request_id: input.requestId,
      metadata: { source: "knowledge_operations_reference_audit" },
      updated_at: new Date().toISOString(),
    }, { onConflict: "output_type,output_id,page_id,version_label" })
    .select("id,output_type,output_id,output_title,module_name,page_id,knowledge_item_id,knowledge_version_id,version_label,citation_text,confidence,reference_status,created_by_name,created_at")
    .single();

  if (error) {
    return isMissingTableError(error.message)
      ? { ...referenceAuditNotConfigured(), requestId: input.requestId }
      : { status: "failed", warning: error.message, requestId: input.requestId };
  }

  const reference = mapOutputReference(data as Record<string, unknown>);
  await supabase.from("knowledge_lifecycle_events").insert({
    knowledge_item_id: String(itemRecord.id),
    page_id: pageId,
    event_type: "output_reference_created",
    actor_id: input.user?.id ?? null,
    actor_name: actorName(input.user),
    event_status: "succeeded",
    review_note: `输出引用已绑定知识版本：${outputTitle}`,
    request_id: input.requestId,
    metadata: { reference_id: reference.id, output_type: reference.outputType, output_id: reference.outputId, version_label: reference.versionLabel },
  });

  return { status: "succeeded", reference, requestId: input.requestId };
}

export async function upsertKnowledgeTemplateDirectoryItem(input: {
  templateKey: string;
  title?: string;
  category?: string;
  source?: string;
  description?: string;
  lifecycleStatus?: KnowledgeTemplateDirectoryRecord["lifecycleStatus"];
  ownerName?: string;
  linkedKnowledgePageIds?: string[];
  user: AppUser | null;
  requestId: string;
}): Promise<KnowledgeTemplateDirectoryMutationResult> {
  if (!hasEnvironment()) return { ...referenceAuditNotConfigured(), requestId: input.requestId };
  const templateKey = input.templateKey.trim();
  if (!templateKey) return { status: "failed", warning: "模板 key 不能为空。", requestId: input.requestId };
  const fallback = templateCatalogFallback(templateKey);
  const supabase = getAuthSupabase();
  const { data, error } = await supabase
    .from("knowledge_template_directory_items")
    .upsert({
      template_key: templateKey,
      title: input.title?.trim() || fallback?.title || templateKey,
      category: input.category?.trim() || fallback?.category || "governance",
      source: input.source?.trim() || fallback?.source || "AI-PMO",
      description: input.description?.trim() || fallback?.description || "",
      lifecycle_status: input.lifecycleStatus ?? fallback?.lifecycleStatus ?? "active",
      owner_name: input.ownerName?.trim() || fallback?.ownerName || actorName(input.user),
      linked_knowledge_page_ids: input.linkedKnowledgePageIds ?? fallback?.linkedKnowledgePageIds ?? [],
      updated_by: input.user?.id ?? null,
      updated_by_name: actorName(input.user),
      created_by: input.user?.id ?? null,
      created_by_name: actorName(input.user),
      request_id: input.requestId,
      updated_at: new Date().toISOString(),
    }, { onConflict: "template_key" })
    .select("id,template_key,title,category,source,description,lifecycle_status,owner_name,linked_knowledge_page_ids,download_count,reference_count,last_used_at,updated_at")
    .single();

  if (error) {
    return isMissingTableError(error.message)
      ? { ...referenceAuditNotConfigured(), requestId: input.requestId }
      : { status: "failed", warning: error.message, requestId: input.requestId };
  }

  const template = mapTemplateDirectoryRecord(data as Record<string, unknown>);
  await supabase.from("knowledge_lifecycle_events").insert({
    page_id: `template:${template.templateKey}`,
    event_type: "template_directory_upserted",
    actor_id: input.user?.id ?? null,
    actor_name: actorName(input.user),
    event_status: "succeeded",
    review_note: `模板/最佳实践目录已保存：${template.title}`,
    request_id: input.requestId,
    metadata: { template_key: template.templateKey, linked_knowledge_page_ids: template.linkedKnowledgePageIds },
  });

  return { status: "succeeded", template, requestId: input.requestId };
}

export async function recordKnowledgeTemplateUsage(input: {
  templateKey: string;
  eventType: KnowledgeTemplateUsageEventType;
  outputType?: string;
  outputId?: string;
  user: AppUser | null;
  requestId: string;
}): Promise<KnowledgeTemplateUsageMutationResult> {
  if (!hasEnvironment()) return { ...referenceAuditNotConfigured(), requestId: input.requestId };
  const templateKey = input.templateKey.trim();
  if (!templateKey) return { status: "failed", warning: "模板 key 不能为空。", requestId: input.requestId };
  const supabase = getAuthSupabase();
  const { data: current, error: currentError } = await supabase
    .from("knowledge_template_directory_items")
    .select("id,template_key,title,category,source,description,lifecycle_status,owner_name,linked_knowledge_page_ids,download_count,reference_count,last_used_at,updated_at")
    .eq("template_key", templateKey)
    .maybeSingle();
  if (currentError) {
    return isMissingTableError(currentError.message)
      ? { ...referenceAuditNotConfigured(), requestId: input.requestId }
      : { status: "failed", warning: currentError.message, requestId: input.requestId };
  }
  let template = current ? mapTemplateDirectoryRecord(current as Record<string, unknown>) : null;
  if (!template) {
    const created = await upsertKnowledgeTemplateDirectoryItem({ templateKey, user: input.user, requestId: input.requestId });
    if (created.status !== "succeeded") return created;
    template = created.template;
  }

  const nextDownloadCount = template.downloadCount + (input.eventType === "download" ? 1 : 0);
  const nextReferenceCount = template.referenceCount + (input.eventType === "reference" ? 1 : 0);
  const { data: updated, error: updateError } = await supabase
    .from("knowledge_template_directory_items")
    .update({
      download_count: nextDownloadCount,
      reference_count: nextReferenceCount,
      last_used_at: new Date().toISOString(),
      updated_by: input.user?.id ?? null,
      updated_by_name: actorName(input.user),
      updated_at: new Date().toISOString(),
    })
    .eq("template_key", templateKey)
    .select("id,template_key,title,category,source,description,lifecycle_status,owner_name,linked_knowledge_page_ids,download_count,reference_count,last_used_at,updated_at")
    .single();
  if (updateError) {
    return isMissingTableError(updateError.message)
      ? { ...referenceAuditNotConfigured(), requestId: input.requestId }
      : { status: "failed", warning: updateError.message, requestId: input.requestId };
  }

  const { data: eventData, error: eventError } = await supabase
    .from("knowledge_template_usage_events")
    .insert({
      template_item_id: template.id.startsWith("runtime-") ? null : template.id,
      template_key: templateKey,
      event_type: input.eventType,
      actor_id: input.user?.id ?? null,
      actor_name: actorName(input.user),
      output_type: input.outputType?.trim() || null,
      output_id: input.outputId?.trim() || null,
      request_id: input.requestId,
      metadata: { source: "knowledge_operations_template_usage" },
    })
    .select("id,template_key,event_type,actor_name,output_type,output_id,created_at")
    .single();
  if (eventError) {
    return isMissingTableError(eventError.message)
      ? { ...referenceAuditNotConfigured(), requestId: input.requestId }
      : { status: "failed", warning: eventError.message, requestId: input.requestId };
  }

  const updatedTemplate = mapTemplateDirectoryRecord(updated as Record<string, unknown>);
  const event = mapTemplateUsageEvent(eventData as Record<string, unknown>);
  await supabase.from("knowledge_lifecycle_events").insert({
    page_id: `template:${templateKey}`,
    event_type: "template_usage_recorded",
    actor_id: input.user?.id ?? null,
    actor_name: actorName(input.user),
    event_status: "succeeded",
    review_note: `模板使用事件已记录：${templateKey} / ${input.eventType}`,
    request_id: input.requestId,
    metadata: { template_key: templateKey, event_id: event.id, event_type: input.eventType },
  });

  return { status: "succeeded", template: updatedTemplate, event, requestId: input.requestId };
}

export async function recordKnowledgeSubscriptionDeliveryReceipt(input: {
  notificationId: string;
  deliveryChannel: KnowledgeNotificationRecord["notificationChannel"];
  deliveryStatus: KnowledgeDeliveryStatus;
  deliveredTo?: string;
  user: AppUser | null;
  requestId: string;
}): Promise<KnowledgeDeliveryReceiptMutationResult> {
  if (!hasEnvironment()) return { ...referenceAuditNotConfigured(), requestId: input.requestId };
  const notificationId = input.notificationId.trim();
  if (!notificationId) return { status: "failed", warning: "notificationId 不能为空。", requestId: input.requestId };
  const supabase = getAuthSupabase();
  const { data: notification, error: notificationError } = await supabase
    .from("knowledge_subscription_notifications")
    .select("id,title,status,page_id:related_page_ids")
    .eq("id", notificationId)
    .maybeSingle();
  if (notificationError) {
    return isMissingTableError(notificationError.message)
      ? { ...referenceAuditNotConfigured(), requestId: input.requestId }
      : { status: "failed", warning: notificationError.message, requestId: input.requestId };
  }
  if (!notification) return { status: "not_found", warning: "知识订阅通知记录不存在。", requestId: input.requestId };

  const { data, error } = await supabase
    .from("knowledge_subscription_delivery_receipts")
    .insert({
      notification_id: notificationId,
      delivery_channel: input.deliveryChannel,
      delivery_status: input.deliveryStatus,
      delivered_to: input.deliveredTo?.trim() || null,
      handled_by: input.deliveryStatus === "handled" ? input.user?.id ?? null : null,
      handled_by_name: input.deliveryStatus === "handled" ? actorName(input.user) : null,
      request_id: input.requestId,
      metadata: { source: "knowledge_operations_delivery_receipt" },
    })
    .select("id,notification_id,delivery_channel,delivery_status,delivered_to,handled_by_name,occurred_at")
    .single();
  if (error) {
    return isMissingTableError(error.message)
      ? { ...referenceAuditNotConfigured(), requestId: input.requestId }
      : { status: "failed", warning: error.message, requestId: input.requestId };
  }

  if (input.deliveryStatus === "sent" || input.deliveryStatus === "failed" || input.deliveryStatus === "cancelled") {
    await supabase
      .from("knowledge_subscription_notifications")
      .update({
        status: input.deliveryStatus === "sent" ? "sent" : input.deliveryStatus,
        sent_at: input.deliveryStatus === "sent" ? new Date().toISOString() : undefined,
        updated_at: new Date().toISOString(),
      })
      .eq("id", notificationId);
  }

  const receipt = mapDeliveryReceipt(data as Record<string, unknown>);
  await supabase.from("knowledge_lifecycle_events").insert({
    page_id: `subscription-notification:${notificationId}`,
    event_type: "subscription_delivery_recorded",
    actor_id: input.user?.id ?? null,
    actor_name: actorName(input.user),
    event_status: input.deliveryStatus === "failed" ? "failed" : "succeeded",
    review_note: `知识订阅投递回执：${input.deliveryChannel}/${input.deliveryStatus}`,
    request_id: input.requestId,
    metadata: { notification_id: notificationId, receipt_id: receipt.id, delivery_status: input.deliveryStatus },
  });

  return { status: "succeeded", receipt, requestId: input.requestId };
}

export async function persistKnowledgeAuditPackage(input: {
  dashboard: KnowledgeOperationDashboard;
  user: AppUser | null;
  requestId: string;
}): Promise<KnowledgeAuditPackagePersistResult> {
  if (!hasEnvironment()) return { ...referenceAuditNotConfigured(), requestId: input.requestId };
  const workbench = await loadKnowledgeReferenceAuditWorkbench({ dashboard: input.dashboard, user: input.user, limit: 80 });
  if (workbench.status !== "succeeded") {
    return workbench.status === "not_configured"
      ? { ...referenceAuditNotConfigured(), warning: workbench.warning, requestId: input.requestId }
      : { status: "failed", warning: workbench.warning, requestId: input.requestId };
  }
  const auditPackage = workbench.auditPackagePreview;
  const supabase = getAuthSupabase();
  const { data, error } = await supabase
    .from("knowledge_audit_packages")
    .insert({
      package_type: auditPackage.packageType,
      package_period: auditPackage.packagePeriod,
      title: auditPackage.title,
      markdown: auditPackage.markdown,
      summary: auditPackage.summary,
      generated_by: input.user?.id ?? null,
      generated_by_name: actorName(input.user),
      request_id: input.requestId,
    })
    .select("id,package_type,package_period,title,markdown,summary,created_at")
    .single();
  if (error) {
    return isMissingTableError(error.message)
      ? { ...referenceAuditNotConfigured(), requestId: input.requestId }
      : { status: "failed", warning: error.message, requestId: input.requestId };
  }

  const persisted = mapAuditPackage(data as Record<string, unknown>);
  await supabase.from("knowledge_lifecycle_events").insert({
    page_id: `audit-package:${persisted.id}`,
    event_type: "audit_package_generated",
    actor_id: input.user?.id ?? null,
    actor_name: actorName(input.user),
    event_status: "succeeded",
    review_note: `知识运营审计包已生成：${persisted.title}`,
    request_id: input.requestId,
    metadata: { audit_package_id: persisted.id, package_period: persisted.packagePeriod },
  });

  return { status: "succeeded", package: persisted, requestId: input.requestId };
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

function safeFilename(name: string): string {
  return name.replace(/[\\/:*?"<>|\s]+/g, "-").replace(/-+/g, "-").slice(0, 120) || "knowledge-download";
}

export async function getKnowledgeAuditPackageDownload(id: string): Promise<KnowledgeMarkdownDownloadResult> {
  if (!hasEnvironment()) return referenceAuditNotConfigured();
  const supabase = getAuthSupabase();
  const { data, error } = await supabase
    .from("knowledge_audit_packages")
    .select("id,package_type,package_period,title,markdown,summary,created_at")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    return isMissingTableError(error.message)
      ? referenceAuditNotConfigured()
      : { status: "failed", warning: error.message };
  }
  if (!data) return { status: "not_found", warning: "知识运营审计包不存在。" };
  const record = mapAuditPackage(data as Record<string, unknown>);
  return {
    status: "succeeded",
    title: record.title,
    filename: `${safeFilename(record.title)}.md`,
    markdown: record.markdown,
  };
}

export async function getKnowledgeChangeReportDownload(id: string): Promise<KnowledgeMarkdownDownloadResult> {
  if (!hasEnvironment()) return governanceNotConfigured();
  const supabase = getAuthSupabase();
  const { data, error } = await supabase
    .from("knowledge_change_reports")
    .select("id,report_period,title,markdown,summary,created_at")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    return isMissingTableError(error.message)
      ? governanceNotConfigured()
      : { status: "failed", warning: error.message };
  }
  if (!data) return { status: "not_found", warning: "知识变更报告不存在。" };
  const record = mapChangeReport(data as Record<string, unknown>);
  return {
    status: "succeeded",
    title: record.title,
    filename: `${safeFilename(record.title)}.md`,
    markdown: record.markdown,
  };
}
