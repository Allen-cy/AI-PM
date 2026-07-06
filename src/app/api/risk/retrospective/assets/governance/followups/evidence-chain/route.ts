import { getCurrentUser } from "@/features/auth/server";
import {
  applyKnowledgeGovernanceEvidenceRecommendation,
  getKnowledgeGovernanceEvidenceChain,
  saveKnowledgeGovernanceEvidenceRecommendation,
} from "@/features/risk/retrospective-governance-evidence-chain";
import { writeOperationAudit } from "@/features/security/repository";

export const runtime = "nodejs";

type RecommendationBody = {
  governanceInstanceId?: string;
  followupId?: string;
  reminderLogId?: string;
  targetFollowupStatus?: "处理中" | "待验收" | "已关闭";
  closureNote?: string;
  reviewResult?: string;
};

type ApplyBody = RecommendationBody & {
  evidenceLinkId?: string;
  confirm?: boolean;
  reviewNote?: string;
};

function jsonResponse(body: unknown, status = 200, requestId = crypto.randomUUID()) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store", "X-Request-Id": requestId },
  });
}

function statusCode(status?: string): number {
  if (status === "succeeded" || status === "confirmation_required") return 200;
  if (status === "not_configured") return 503;
  if (status === "not_found") return 404;
  if (status === "unauthorized") return 401;
  return 400;
}

function normalizeTargetStatus(value: unknown): "处理中" | "待验收" | "已关闭" | undefined {
  return value === "处理中" || value === "待验收" || value === "已关闭" ? value : undefined;
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export async function GET(request: Request): Promise<Response> {
  const requestId = crypto.randomUUID();
  const url = new URL(request.url);
  const result = await getKnowledgeGovernanceEvidenceChain({
    governanceInstanceId: url.searchParams.get("governanceInstanceId") || url.searchParams.get("instanceId"),
    followupId: url.searchParams.get("followupId"),
    reminderLogId: url.searchParams.get("reminderLogId"),
  });
  return jsonResponse({ request_id: requestId, ...result }, statusCode(result.status), requestId);
}

export async function POST(request: Request): Promise<Response> {
  const requestId = crypto.randomUUID();
  const user = await getCurrentUser();
  if (process.env.AUTH_REQUIRED === "true" && !user) {
    return jsonResponse({ request_id: requestId, status: "unauthorized", warning: "请先登录后再生成知识治理反写建议。" }, 401, requestId);
  }

  let body: RecommendationBody;
  try {
    body = await request.json() as RecommendationBody;
  } catch {
    return jsonResponse({ request_id: requestId, status: "failed", warning: "请求 JSON 格式错误。" }, 400, requestId);
  }

  const result = await saveKnowledgeGovernanceEvidenceRecommendation({
    governanceInstanceId: text(body.governanceInstanceId),
    followupId: text(body.followupId),
    reminderLogId: text(body.reminderLogId),
    override: {
      targetFollowupStatus: normalizeTargetStatus(body.targetFollowupStatus),
      closureNote: text(body.closureNote),
      reviewResult: text(body.reviewResult),
    },
    user,
    requestId,
  });
  if (result.status === "confirmation_required") {
    await writeOperationAudit({
      user,
      action: "risk_retrospective_governance_evidence_recommendation",
      resourceType: "risk_retrospective_governance_evidence_link",
      resourceId: result.evidenceLink.id,
      status: "succeeded",
      severity: result.gaps.some(gap => gap.severity === "high") ? "medium" : "low",
      summary: `知识治理证据链反写建议已生成：${result.chain.governanceInstance?.title || result.evidenceLink.id}`,
      detail: {
        evidence_link_id: result.evidenceLink.id,
        followup_id: result.chain.followup?.id,
        governance_instance_id: result.chain.governanceInstance?.id,
        target_followup_status: result.recommendation.targetFollowupStatus,
        gaps: result.gaps,
      },
      requestId,
    });
  }
  return jsonResponse({ request_id: requestId, ...result }, statusCode(result.status), requestId);
}

export async function PATCH(request: Request): Promise<Response> {
  const requestId = crypto.randomUUID();
  const user = await getCurrentUser();
  if (process.env.AUTH_REQUIRED === "true" && !user) {
    return jsonResponse({ request_id: requestId, status: "unauthorized", warning: "请先登录后再反写知识治理待办。" }, 401, requestId);
  }

  let body: ApplyBody;
  try {
    body = await request.json() as ApplyBody;
  } catch {
    return jsonResponse({ request_id: requestId, status: "failed", warning: "请求 JSON 格式错误。" }, 400, requestId);
  }

  const result = await applyKnowledgeGovernanceEvidenceRecommendation({
    evidenceLinkId: text(body.evidenceLinkId),
    governanceInstanceId: text(body.governanceInstanceId),
    followupId: text(body.followupId),
    confirm: body.confirm === true,
    targetFollowupStatus: normalizeTargetStatus(body.targetFollowupStatus),
    closureNote: text(body.closureNote),
    reviewResult: text(body.reviewResult),
    reviewNote: text(body.reviewNote),
    user,
    requestId,
  });
  if (result.status === "succeeded") {
    await writeOperationAudit({
      user,
      action: "risk_retrospective_governance_evidence_apply",
      resourceType: "risk_retrospective_governance_evidence_link",
      resourceId: result.evidenceLink.id,
      status: "succeeded",
      severity: result.followup.status === "已关闭" ? "medium" : "low",
      summary: `知识治理证据链已反写二次治理待办：${result.followup.assetTitle} / ${result.followup.status}`,
      detail: {
        evidence_link_id: result.evidenceLink.id,
        followup_id: result.followup.id,
        governance_instance_id: result.chain.governanceInstance?.id,
        target_followup_status: result.recommendation.targetFollowupStatus,
        boundary: result.recommendation.boundary,
      },
      requestId,
    });
  }
  return jsonResponse({ request_id: requestId, ...result }, statusCode(result.status), requestId);
}
