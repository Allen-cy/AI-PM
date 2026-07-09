import { NextResponse } from "next/server";
import { getCurrentUser } from "@/features/auth/server";
import {
  createKnowledgeOutputReference,
  createKnowledgeImpactReviewActionItems,
  loadKnowledgeReferenceAuditWorkbench,
  loadKnowledgeGovernanceWorkbench,
  loadKnowledgeChangeControl,
  loadKnowledgeLifecyclePersistence,
  persistKnowledgeAuditPackage,
  persistKnowledgeChangeReport,
  queueKnowledgeSubscriptionReminders,
  recordKnowledgeSubscriptionDeliveryReceipt,
  recordKnowledgeTemplateUsage,
  syncKnowledgeLifecycleFromDashboard,
  transitionKnowledgeItemStatus,
  transitionKnowledgeImpactReview,
  updateKnowledgeSubscriptionStatus,
  upsertKnowledgeTemplateDirectoryItem,
  upsertKnowledgeSubscription,
  type KnowledgeLifecycleItemStatus,
  type KnowledgeOutputType,
  type KnowledgeDeliveryStatus,
  type KnowledgeSubscriptionStatus,
  type KnowledgeTemplateUsageEventType,
} from "@/features/knowledge/lifecycle-repository";
import { buildKnowledgeOperationDashboard } from "@/features/knowledge/operations";
import { writeOperationAudit } from "@/features/security/repository";

function json(body: unknown, status = 200, requestId = crypto.randomUUID()) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Request-Id": requestId,
    },
  });
}

function statusCode(status: string): number {
  if (status === "succeeded") return 200;
  if (status === "not_configured") return 503;
  if (status === "not_found") return 404;
  return 400;
}

function isReviewStatus(value: unknown): value is "待复核" | "处理中" | "已关闭" | "无需处理" {
  return value === "待复核" || value === "处理中" || value === "已关闭" || value === "无需处理";
}

function isKnowledgeItemStatus(value: unknown): value is KnowledgeLifecycleItemStatus {
  return value === "draft" || value === "reviewed" || value === "published" || value === "deprecated" || value === "archived";
}

function isSubscriptionStatus(value: unknown): value is KnowledgeSubscriptionStatus {
  return value === "active" || value === "paused" || value === "cancelled";
}

function isNotificationChannel(value: unknown): value is "in_app" | "feishu" | "email" {
  return value === "in_app" || value === "feishu" || value === "email";
}

function isOutputType(value: unknown): value is KnowledgeOutputType {
  return value === "ai_answer" || value === "report" || value === "governance" || value === "risk" || value === "template" || value === "other";
}

function isTemplateUsageEventType(value: unknown): value is KnowledgeTemplateUsageEventType {
  return value === "download" || value === "reference" || value === "import" || value === "export";
}

function isDeliveryStatus(value: unknown): value is KnowledgeDeliveryStatus {
  return value === "queued" || value === "sent" || value === "read" || value === "handled" || value === "failed" || value === "cancelled";
}

export async function GET() {
  const requestId = crypto.randomUUID();
  const user = await getCurrentUser();
  const dashboard = buildKnowledgeOperationDashboard();
  const persistence = user
    ? await loadKnowledgeLifecyclePersistence(30)
    : { status: "unauthorized", warning: "登录后可查看知识生命周期持久化状态和影响复核记录。", impactReviews: [], latestEvents: [] };
  const changeControl = user
    ? await loadKnowledgeChangeControl({ dashboard, limit: 40 })
    : { status: "unauthorized", warning: "登录后可查看知识版本差异、订阅提醒和行动项候选。", versionDiffs: [], subscriptionReminders: [], actionCandidates: [] };
  const governance = user
    ? await loadKnowledgeGovernanceWorkbench({ dashboard, user, limit: 40 })
    : { status: "unauthorized", warning: "登录后可维护知识状态、订阅提醒和知识变更报告。", items: [], subscriptions: [], notifications: [], latestReports: [], changeReportPreview: null };
  const referenceAudit = user
    ? await loadKnowledgeReferenceAuditWorkbench({ dashboard, user, limit: 40 })
    : {
        status: "unauthorized",
        warning: "登录后可维护知识版本引用链、模板目录、投递回执和审计包。",
        outputReferences: [],
        referenceCandidates: [],
        templateDirectory: [],
        templateUsageEvents: [],
        deliveryReceipts: [],
        recentNotifications: [],
        auditPackages: [],
        auditPackagePreview: null,
      };
  return json({ request_id: requestId, ...dashboard, persistence, changeControl, governance, referenceAudit }, 200, requestId);
}

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  const user = await getCurrentUser();
  if (!user) return json({ error: "UNAUTHORIZED", request_id: requestId }, 401, requestId);

  const body = await request.json().catch(() => ({})) as {
    action?: string;
    confirm?: boolean;
    reviewIds?: string[];
    reminderIds?: string[];
    feishuReceiveId?: string;
    feishuReceiveIdType?: "chat_id" | "open_id";
    subscriptionId?: string;
    moduleName?: string;
    domain?: string;
    notificationChannel?: unknown;
    subscriberName?: string;
    subscriptionStatus?: unknown;
    outputType?: unknown;
    outputId?: string;
    outputTitle?: string;
    pageId?: string;
    citationText?: string;
    confidence?: number;
    templateKey?: string;
    title?: string;
    category?: string;
    source?: string;
    description?: string;
    lifecycleStatus?: "draft" | "active" | "reviewing" | "deprecated" | "archived";
    ownerName?: string;
    linkedKnowledgePageIds?: string[];
    templateEventType?: unknown;
    outputReferenceType?: string;
    notificationId?: string;
    deliveryStatus?: unknown;
    deliveredTo?: string;
  };
  if (body.confirm !== true) {
    return json({
      error: "CONFIRM_REQUIRED",
      warning: "执行知识生命周期写入动作前必须显式 confirm=true。",
      request_id: requestId,
    }, 400, requestId);
  }

  if (body.action === "create_action_items") {
    const result = await createKnowledgeImpactReviewActionItems({
      reviewIds: Array.isArray(body.reviewIds) ? body.reviewIds : undefined,
      user,
      requestId,
    });
    await writeOperationAudit({
      user,
      action: "knowledge_impact_review_create_action_items",
      resourceType: "knowledge_impact_review",
      status: result.status === "succeeded" ? "succeeded" : "failed",
      severity: result.status === "succeeded" ? "low" : "medium",
      summary: result.status === "succeeded"
        ? `知识影响复核已生成 ${result.createdActions} 条统一行动项，跳过 ${result.skippedExisting} 条已存在行动项。`
        : result.warning,
      detail: result.status === "succeeded"
        ? { created_actions: result.createdActions, skipped_existing: result.skippedExisting, action_item_ids: result.actionItems.map(item => item.id) }
        : { migration: "migration" in result ? result.migration : undefined },
      requestId,
    });
    return json({ request_id: requestId, ...result }, statusCode(result.status), requestId);
  }

  if (body.action === "upsert_subscription") {
    if (!body.moduleName || !isNotificationChannel(body.notificationChannel)) {
      return json({ error: "INVALID_SUBSCRIPTION", warning: "请提供订阅模块和通知通道：in_app、feishu、email。", request_id: requestId }, 400, requestId);
    }
    const result = await upsertKnowledgeSubscription({
      id: body.subscriptionId,
      moduleName: body.moduleName,
      domain: body.domain,
      notificationChannel: body.notificationChannel,
      subscriberName: body.subscriberName,
      status: isSubscriptionStatus(body.subscriptionStatus) ? body.subscriptionStatus : "active",
      user,
      requestId,
    });
    await writeOperationAudit({
      user,
      action: "knowledge_subscription_upsert",
      resourceType: "knowledge_subscription",
      resourceId: result.status === "succeeded" ? result.subscription.id : body.subscriptionId,
      status: result.status === "succeeded" ? "succeeded" : "failed",
      severity: result.status === "succeeded" ? "low" : "medium",
      summary: result.status === "succeeded" ? `知识订阅已保存：${result.subscription.moduleName}。` : result.warning,
      detail: result.status === "succeeded" ? { channel: result.subscription.notificationChannel, status: result.subscription.status } : { migration: "migration" in result ? result.migration : undefined },
      requestId,
    });
    return json({ request_id: requestId, ...result }, statusCode(result.status), requestId);
  }

  if (body.action === "update_subscription_status") {
    if (!body.subscriptionId || !isSubscriptionStatus(body.subscriptionStatus)) {
      return json({ error: "INVALID_SUBSCRIPTION_STATUS", warning: "请提供 subscriptionId 和有效状态：active、paused、cancelled。", request_id: requestId }, 400, requestId);
    }
    const result = await updateKnowledgeSubscriptionStatus({
      id: body.subscriptionId,
      status: body.subscriptionStatus,
      user,
      requestId,
    });
    await writeOperationAudit({
      user,
      action: "knowledge_subscription_status_update",
      resourceType: "knowledge_subscription",
      resourceId: body.subscriptionId,
      status: result.status === "succeeded" ? "succeeded" : "failed",
      severity: result.status === "succeeded" ? "low" : "medium",
      summary: result.status === "succeeded" ? `知识订阅状态更新为 ${result.subscription.status}。` : result.warning,
      detail: { target_status: body.subscriptionStatus },
      requestId,
    });
    return json({ request_id: requestId, ...result }, statusCode(result.status), requestId);
  }

  if (body.action === "send_subscription_reminders") {
    const dashboard = buildKnowledgeOperationDashboard();
    const result = await queueKnowledgeSubscriptionReminders({
      dashboard,
      user,
      requestId,
      reminderIds: Array.isArray(body.reminderIds) ? body.reminderIds : undefined,
      feishuReceiveId: body.feishuReceiveId,
      feishuReceiveIdType: body.feishuReceiveIdType === "open_id" ? "open_id" : "chat_id",
    });
    await writeOperationAudit({
      user,
      action: "knowledge_subscription_reminders_queue",
      resourceType: "knowledge_subscription_notification",
      status: result.status === "succeeded" ? "succeeded" : "failed",
      severity: result.status === "succeeded" ? "low" : "medium",
      summary: result.status === "succeeded"
        ? `知识订阅提醒已生成 ${result.queuedNotifications} 条记录，飞书待确认 ${result.feishuConfirmations} 条。`
        : result.warning,
      detail: result.status === "succeeded"
        ? { queued_notifications: result.queuedNotifications, feishu_confirmations: result.feishuConfirmations }
        : { migration: "migration" in result ? result.migration : undefined },
      requestId,
    });
    return json({ request_id: requestId, ...result }, statusCode(result.status), requestId);
  }

  if (body.action === "generate_change_report") {
    const dashboard = buildKnowledgeOperationDashboard();
    const result = await persistKnowledgeChangeReport({ dashboard, user, requestId });
    await writeOperationAudit({
      user,
      action: "knowledge_change_report_generate",
      resourceType: "knowledge_change_report",
      resourceId: result.status === "succeeded" ? result.report.id : null,
      status: result.status === "succeeded" ? "succeeded" : "failed",
      severity: result.status === "succeeded" ? "low" : "medium",
      summary: result.status === "succeeded" ? `知识变更报告已生成：${result.report.title}。` : result.warning,
      detail: result.status === "succeeded" ? { report_period: result.report.reportPeriod } : { migration: "migration" in result ? result.migration : undefined },
      requestId,
    });
    return json({ request_id: requestId, ...result }, statusCode(result.status), requestId);
  }

  if (body.action === "create_output_reference") {
    if (!isOutputType(body.outputType) || !body.outputId || !body.outputTitle || !body.moduleName || !body.pageId) {
      return json({ error: "INVALID_OUTPUT_REFERENCE", warning: "请提供 outputType、outputId、outputTitle、moduleName 和 pageId。", request_id: requestId }, 400, requestId);
    }
    const result = await createKnowledgeOutputReference({
      outputType: body.outputType,
      outputId: body.outputId,
      outputTitle: body.outputTitle,
      moduleName: body.moduleName,
      pageId: body.pageId,
      citationText: body.citationText,
      confidence: body.confidence,
      user,
      requestId,
    });
    await writeOperationAudit({
      user,
      action: "knowledge_output_reference_create",
      resourceType: "knowledge_output_reference",
      resourceId: result.status === "succeeded" ? result.reference.id : body.outputId,
      status: result.status === "succeeded" ? "succeeded" : "failed",
      severity: result.status === "succeeded" ? "low" : "medium",
      summary: result.status === "succeeded" ? `知识输出引用已创建：${result.reference.outputTitle}。` : result.warning,
      detail: result.status === "succeeded" ? { output_type: result.reference.outputType, page_id: result.reference.pageId, version_label: result.reference.versionLabel } : { migration: "migration" in result ? result.migration : undefined },
      requestId,
    });
    return json({ request_id: requestId, ...result }, statusCode(result.status), requestId);
  }

  if (body.action === "upsert_template_directory_item") {
    if (!body.templateKey) {
      return json({ error: "INVALID_TEMPLATE_DIRECTORY_ITEM", warning: "请提供 templateKey。", request_id: requestId }, 400, requestId);
    }
    const result = await upsertKnowledgeTemplateDirectoryItem({
      templateKey: body.templateKey,
      title: body.title,
      category: body.category,
      source: body.source,
      description: body.description,
      lifecycleStatus: body.lifecycleStatus,
      ownerName: body.ownerName,
      linkedKnowledgePageIds: Array.isArray(body.linkedKnowledgePageIds) ? body.linkedKnowledgePageIds : undefined,
      user,
      requestId,
    });
    await writeOperationAudit({
      user,
      action: "knowledge_template_directory_upsert",
      resourceType: "knowledge_template_directory_item",
      resourceId: result.status === "succeeded" ? result.template.id : body.templateKey,
      status: result.status === "succeeded" ? "succeeded" : "failed",
      severity: result.status === "succeeded" ? "low" : "medium",
      summary: result.status === "succeeded" ? `模板/最佳实践目录已保存：${result.template.title}。` : result.warning,
      detail: result.status === "succeeded" ? { template_key: result.template.templateKey, linked_knowledge_page_ids: result.template.linkedKnowledgePageIds } : { migration: "migration" in result ? result.migration : undefined },
      requestId,
    });
    return json({ request_id: requestId, ...result }, statusCode(result.status), requestId);
  }

  if (body.action === "record_template_usage") {
    if (!body.templateKey || !isTemplateUsageEventType(body.templateEventType)) {
      return json({ error: "INVALID_TEMPLATE_USAGE", warning: "请提供 templateKey 和 templateEventType：download、reference、import、export。", request_id: requestId }, 400, requestId);
    }
    const result = await recordKnowledgeTemplateUsage({
      templateKey: body.templateKey,
      eventType: body.templateEventType,
      outputType: body.outputReferenceType,
      outputId: body.outputId,
      user,
      requestId,
    });
    await writeOperationAudit({
      user,
      action: "knowledge_template_usage_record",
      resourceType: "knowledge_template_usage_event",
      resourceId: result.status === "succeeded" ? result.event.id : body.templateKey,
      status: result.status === "succeeded" ? "succeeded" : "failed",
      severity: result.status === "succeeded" ? "low" : "medium",
      summary: result.status === "succeeded" ? `模板使用事件已记录：${result.template.title}/${result.event.eventType}。` : result.warning,
      detail: result.status === "succeeded" ? { template_key: result.template.templateKey, event_type: result.event.eventType } : { migration: "migration" in result ? result.migration : undefined },
      requestId,
    });
    return json({ request_id: requestId, ...result }, statusCode(result.status), requestId);
  }

  if (body.action === "record_subscription_delivery_receipt") {
    if (!body.notificationId || !isNotificationChannel(body.notificationChannel) || !isDeliveryStatus(body.deliveryStatus)) {
      return json({ error: "INVALID_DELIVERY_RECEIPT", warning: "请提供 notificationId、notificationChannel 和 deliveryStatus。", request_id: requestId }, 400, requestId);
    }
    const result = await recordKnowledgeSubscriptionDeliveryReceipt({
      notificationId: body.notificationId,
      deliveryChannel: body.notificationChannel,
      deliveryStatus: body.deliveryStatus,
      deliveredTo: body.deliveredTo,
      user,
      requestId,
    });
    await writeOperationAudit({
      user,
      action: "knowledge_subscription_delivery_receipt_record",
      resourceType: "knowledge_subscription_delivery_receipt",
      resourceId: result.status === "succeeded" ? result.receipt.id : body.notificationId,
      status: result.status === "succeeded" ? "succeeded" : "failed",
      severity: result.status === "succeeded" ? "low" : "medium",
      summary: result.status === "succeeded" ? `订阅投递回执已记录：${result.receipt.deliveryChannel}/${result.receipt.deliveryStatus}。` : result.warning,
      detail: result.status === "succeeded" ? { notification_id: result.receipt.notificationId, delivery_status: result.receipt.deliveryStatus } : { migration: "migration" in result ? result.migration : undefined },
      requestId,
    });
    return json({ request_id: requestId, ...result }, statusCode(result.status), requestId);
  }

  if (body.action === "generate_knowledge_audit_package") {
    const dashboard = buildKnowledgeOperationDashboard();
    const result = await persistKnowledgeAuditPackage({ dashboard, user, requestId });
    await writeOperationAudit({
      user,
      action: "knowledge_audit_package_generate",
      resourceType: "knowledge_audit_package",
      resourceId: result.status === "succeeded" ? result.package.id : null,
      status: result.status === "succeeded" ? "succeeded" : "failed",
      severity: result.status === "succeeded" ? "low" : "medium",
      summary: result.status === "succeeded" ? `知识运营审计包已生成：${result.package.title}。` : result.warning,
      detail: result.status === "succeeded" ? { package_period: result.package.packagePeriod } : { migration: "migration" in result ? result.migration : undefined },
      requestId,
    });
    return json({ request_id: requestId, ...result }, statusCode(result.status), requestId);
  }

  const dashboard = buildKnowledgeOperationDashboard();
  const result = await syncKnowledgeLifecycleFromDashboard({ dashboard, user, requestId });
  await writeOperationAudit({
    user,
    action: "knowledge_lifecycle_sync",
    resourceType: "knowledge_lifecycle",
    status: result.status === "succeeded" ? "succeeded" : "failed",
    severity: result.status === "succeeded" ? "low" : "medium",
    summary: result.status === "succeeded"
      ? `同步 ${result.syncedItems} 条知识生命周期记录。`
      : result.warning,
    detail: result.status === "succeeded"
      ? { synced_items: result.syncedItems, synced_versions: result.syncedVersions, synced_impact_reviews: result.syncedImpactReviews }
      : { migration: "migration" in result ? result.migration : undefined },
    requestId,
  });

  return json({ request_id: requestId, ...result }, statusCode(result.status), requestId);
}

export async function PATCH(request: Request) {
  const requestId = crypto.randomUUID();
  const user = await getCurrentUser();
  if (!user) return json({ error: "UNAUTHORIZED", request_id: requestId }, 401, requestId);

  const body = await request.json().catch(() => ({})) as {
    target?: string;
    pageId?: string;
    reviewId?: string;
    status?: unknown;
    closureEvidence?: string;
    reviewOutput?: string;
    reviewNote?: string;
    versionLabel?: string;
    title?: string;
    ownerName?: string;
    expiresAt?: string;
  };
  if (body.target === "knowledge_item") {
    if (!body.pageId || !isKnowledgeItemStatus(body.status)) {
      return json({
        error: "INVALID_KNOWLEDGE_ITEM_TRANSITION",
        warning: "请提供 pageId 和有效知识状态：draft、reviewed、published、deprecated、archived。",
        request_id: requestId,
      }, 400, requestId);
    }
    if (!body.reviewNote?.trim()) {
      return json({
        error: "REVIEW_NOTE_REQUIRED",
        warning: "知识条目状态流转必须填写复核/审批意见。",
        request_id: requestId,
      }, 400, requestId);
    }
    const result = await transitionKnowledgeItemStatus({
      pageId: body.pageId,
      status: body.status,
      reviewNote: body.reviewNote,
      versionLabel: body.versionLabel,
      title: body.title,
      ownerName: body.ownerName,
      expiresAt: body.expiresAt,
      user,
      requestId,
    });
    await writeOperationAudit({
      user,
      action: "knowledge_item_status_transition",
      resourceType: "knowledge_item",
      resourceId: body.pageId,
      status: result.status === "succeeded" ? "succeeded" : "failed",
      severity: result.status === "succeeded" ? "low" : "medium",
      summary: result.status === "succeeded" ? `知识条目状态更新为 ${result.item.status}。` : result.warning,
      detail: { target_status: body.status },
      requestId,
    });
    return json({ request_id: requestId, ...result }, statusCode(result.status), requestId);
  }

  if (!body.reviewId || !isReviewStatus(body.status)) {
    return json({
      error: "INVALID_REVIEW_TRANSITION",
      warning: "请提供 reviewId 和有效状态：待复核、处理中、已关闭、无需处理。",
      request_id: requestId,
    }, 400, requestId);
  }
  if ((body.status === "已关闭" || body.status === "无需处理") && !body.closureEvidence?.trim()) {
    return json({
      error: "CLOSURE_EVIDENCE_REQUIRED",
      warning: "关闭或标记无需处理时必须填写复核结论/关闭证据。",
      request_id: requestId,
    }, 400, requestId);
  }

  const result = await transitionKnowledgeImpactReview({
    reviewId: body.reviewId,
    status: body.status,
    closureEvidence: body.closureEvidence,
    reviewOutput: body.reviewOutput,
    user,
    requestId,
  });
  await writeOperationAudit({
    user,
    action: "knowledge_impact_review_transition",
    resourceType: "knowledge_impact_review",
    resourceId: body.reviewId,
    status: result.status === "succeeded" ? "succeeded" : "failed",
    severity: result.status === "succeeded" ? "low" : "medium",
    summary: result.status === "succeeded" ? `知识影响复核更新为 ${result.review.status}。` : result.warning,
    detail: { target_status: body.status },
    requestId,
  });

  return json({ request_id: requestId, ...result }, statusCode(result.status), requestId);
}
