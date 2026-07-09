import { NextResponse } from "next/server";
import { getCurrentUser } from "@/features/auth/server";
import {
  loadKnowledgeLifecyclePersistence,
  syncKnowledgeLifecycleFromDashboard,
  transitionKnowledgeImpactReview,
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

export async function GET() {
  const requestId = crypto.randomUUID();
  const user = await getCurrentUser();
  const dashboard = buildKnowledgeOperationDashboard();
  const persistence = user
    ? await loadKnowledgeLifecyclePersistence(30)
    : { status: "unauthorized", warning: "登录后可查看知识生命周期持久化状态和影响复核记录。", impactReviews: [], latestEvents: [] };
  return json({ request_id: requestId, ...dashboard, persistence }, 200, requestId);
}

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  const user = await getCurrentUser();
  if (!user) return json({ error: "UNAUTHORIZED", request_id: requestId }, 401, requestId);

  const body = await request.json().catch(() => ({})) as { confirm?: boolean };
  if (body.confirm !== true) {
    return json({
      error: "CONFIRM_REQUIRED",
      warning: "同步知识生命周期持久化表前必须显式 confirm=true。",
      request_id: requestId,
    }, 400, requestId);
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
    reviewId?: string;
    status?: unknown;
    closureEvidence?: string;
    reviewOutput?: string;
  };
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
