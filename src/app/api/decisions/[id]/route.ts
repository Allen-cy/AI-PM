import { requireAuthenticatedApiUser } from "@/features/auth/server";
import { resolveRequestedDecisionContext } from "@/features/decisions/access";
import { canPerformDecisionOperation, type DecisionOperation } from "@/features/decisions/domain";
import {
  acknowledgeDecisionReceipt,
  closeDecisionBrief,
  castDecisionVote,
  decideDecisionBrief,
  distributeDecisionBrief,
  getDecisionBrief,
  reviewDecisionEffect,
  requestDecisionEvidence,
  respondDecisionEvidence,
  recordDecisionAuthorityResponse,
  reassignDecisionAuthority,
  reopenDecisionBrief,
  submitDecisionBrief,
  submitDecisionEffectReview,
  transitionDecisionExecution,
} from "@/features/decisions/persistence";
import { type BusinessRole } from "@/features/operating-model/context";
import { listBusinessRoleAssignments } from "@/features/operating-model/persistence";

export const runtime = "nodejs";

const ACTIONS = new Set<DecisionOperation>(["submit", "decide", "distribute", "acknowledge", "start_execution", "submit_execution_evidence", "submit_effect_review", "approve_effect_review", "close", "request_evidence", "resubmit_evidence", "review_evidence", "vote", "decline", "reassign", "reopen"]);

function json(body: unknown, status = 200, requestId = crypto.randomUUID()) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store", "X-Request-Id": requestId } });
}

function resultStatus(status: string): number {
  return status === "succeeded" ? 200 : status === "not_found" ? 404 : status === "conflict" ? 409 : status === "not_configured" ? 503 : 500;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const requestId = crypto.randomUUID();
  const user = await requireAuthenticatedApiUser();
  if (!user) return json({ error: "UNAUTHORIZED", request_id: requestId }, 401, requestId);
  const { id } = await params;
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; }
  catch { return json({ error: "INVALID_JSON", request_id: requestId }, 400, requestId); }
  const action = String(body.action || "") as DecisionOperation;
  const role = String(body.business_role ?? body.businessRole ?? "") as BusinessRole;
  if (!ACTIONS.has(action)) return json({ error: "DECISION_ACTION_INVALID", request_id: requestId }, 400, requestId);
  const briefResult = await getDecisionBrief(id);
  if (briefResult.status !== "succeeded" || !briefResult.data) return json({ error: "DECISION_BRIEF_UNAVAILABLE", detail: briefResult.warning, request_id: requestId }, resultStatus(briefResult.status), requestId);
  const brief = briefResult.data;
  const dataClass = String(body.data_class ?? body.dataClass ?? brief.dataClass);
  if (dataClass !== brief.dataClass) return json({ error: "DECISION_DATA_CLASS_MISMATCH", request_id: requestId }, 409, requestId);
  const assignments = await listBusinessRoleAssignments(user.id);
  if (assignments.status !== "succeeded") return json({ error: "P17_STORAGE_NOT_CONFIGURED", detail: assignments.warning, request_id: requestId }, 503, requestId);
  const context = await resolveRequestedDecisionContext({ user, assignments: assignments.data ?? [], role, orgId: brief.orgId, subjectScope: brief.subjectScope, subjectId: brief.subjectId });
  if (!context || !canPerformDecisionOperation(role, action)) return json({ error: "DECISION_ACTION_FORBIDDEN", request_id: requestId }, 403, requestId);

  let result;
  if (action === "submit") {
    result = await submitDecisionBrief({ brief, targetUserId: String(body.target_user_id || ""), actor: user, actorBusinessRole: role, requestId });
  } else if (action === "decide") {
    result = await decideDecisionBrief({ brief, outcome: String(body.outcome || "") as never, selectedOptionKey: String(body.selected_option_key || "") || null, rationale: String(body.rationale || "") || null, conditions: String(body.conditions || "") || null, effectiveAt: String(body.effective_at || "") || null, actor: user, actorBusinessRole: role, requestId });
  } else if (action === "distribute") {
    const recipients = Array.isArray(body.recipients) ? body.recipients.map(item => {
      const record = item && typeof item === "object" ? item as Record<string, unknown> : {};
      return { userId: String(record.user_id || ""), businessRole: String(record.business_role || "") as never };
    }) : [];
    result = await distributeDecisionBrief({ brief, recipients, actor: user, actorBusinessRole: role, requestId });
  } else if (action === "acknowledge") {
    result = await acknowledgeDecisionReceipt({ briefId: brief.id, receiptId: String(body.receipt_id || ""), status: body.disputed === true ? "disputed" : "acknowledged", response: String(body.response || ""), actor: user, actorBusinessRole: role, requestId });
  } else if (action === "start_execution" || action === "submit_execution_evidence") {
    result = await transitionDecisionExecution({ brief, briefId: brief.id, receiptId: String(body.receipt_id || ""), actionId: String(body.action_item_id || ""), operation: action, comment: String(body.comment || ""), evidence: Array.isArray(body.evidence) ? body.evidence.filter(item => item && typeof item === "object") as Array<Record<string, unknown>> : [], actor: user, actorBusinessRole: role, requestId });
  } else if (action === "submit_effect_review") {
    result = await submitDecisionEffectReview({ brief, expectedEffect: String(body.expected_effect || ""), actualEffect: String(body.actual_effect || ""), outcome: String(body.effect_outcome || "") as never, metrics: body.metrics && typeof body.metrics === "object" ? body.metrics as Record<string, unknown> : {}, evidence: Array.isArray(body.evidence) ? body.evidence.filter(item => item && typeof item === "object") as Array<Record<string, unknown>> : [], actor: user, actorBusinessRole: role, requestId });
  } else if (action === "approve_effect_review") {
    result = await reviewDecisionEffect({ brief, reviewId: String(body.review_id || ""), approved: body.approved !== false, comment: String(body.comment || ""), actor: user, actorBusinessRole: role, requestId });
  } else if (action === "request_evidence") {
    result = await requestDecisionEvidence({ brief, requiredItems: Array.isArray(body.required_items) ? body.required_items.map(String) : [], reason: String(body.reason || ""), dueAt: String(body.due_at || ""), actor: user, actorBusinessRole: role, requestId });
  } else if (action === "resubmit_evidence" || action === "review_evidence") {
    result = await respondDecisionEvidence({ brief, evidenceRequestId: String(body.evidence_request_id || ""), operation: action === "resubmit_evidence" ? "submit" : body.approved === false ? "reject" : "accept", response: String(body.response || body.comment || ""), evidence: Array.isArray(body.evidence) ? body.evidence.filter(item => item && typeof item === "object") as Array<Record<string, unknown>> : [], actor: user, actorBusinessRole: role, requestId });
  } else if (action === "vote") {
    result = await castDecisionVote({ brief, vote: String(body.vote || "") as "approve" | "reject" | "abstain", selectedOptionKey: String(body.selected_option_key || "") || null, rationale: String(body.rationale || ""), actor: user, actorBusinessRole: role, requestId });
  } else if (action === "decline") {
    result = await recordDecisionAuthorityResponse({ brief, responseType: body.recused === true ? "recused" : "declined", reason: String(body.reason || ""), actor: user, actorBusinessRole: role, requestId });
  } else if (action === "reassign") {
    result = await reassignDecisionAuthority({ brief, targetUserId: String(body.target_user_id || ""), targetBusinessRole: String(body.target_business_role || "") as "ceo" | "sponsor", reason: String(body.reason || ""), actor: user, actorBusinessRole: role, requestId });
  } else if (action === "reopen") {
    result = await reopenDecisionBrief({ brief, triggeredCondition: String(body.triggered_condition || ""), reason: String(body.reason || ""), evidence: Array.isArray(body.evidence) ? body.evidence.filter(item => item && typeof item === "object") as Array<Record<string, unknown>> : [], actor: user, actorBusinessRole: role, requestId });
  } else {
    result = await closeDecisionBrief({ brief, actor: user, actorBusinessRole: role, requestId });
  }
  return json({ request_id: requestId, action, status: result.status, result: result.data, warning: result.warning }, resultStatus(result.status), requestId);
}
