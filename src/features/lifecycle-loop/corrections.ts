import type { BusinessRole } from "../operating-model/context.ts";

export type FeedbackCorrectionType =
  | "false_positive"
  | "business_fact_denial"
  | "evidence_requested"
  | "action_rejected"
  | "state_correction";

export type FeedbackCorrectionStatus =
  | "submitted"
  | "correction_in_progress"
  | "pending_verification"
  | "closed"
  | "rejected";

export type FeedbackCorrectionAction = "accept" | "reject" | "submit_correction" | "verify" | "request_rework";

export interface FeedbackCorrectionRequest {
  projectId: string;
  targetType: "management_signal" | "lifecycle_state" | "forecast" | "rule" | "ai_evaluation" | "action";
  targetId: string;
  correctionType: FeedbackCorrectionType;
  reasonCode: string;
  reasonDetail: string;
  proposedCorrection: Record<string, unknown>;
  correctionOwnerUserId: string;
  dueAt: string;
  resubmissionPath: string;
  businessRole: BusinessRole;
  idempotencyKey: string;
}

const CORRECTION_TYPES: FeedbackCorrectionType[] = ["false_positive", "business_fact_denial", "evidence_requested", "action_rejected", "state_correction"];
const TARGET_TYPES: FeedbackCorrectionRequest["targetType"][] = ["management_signal", "lifecycle_state", "forecast", "rule", "ai_evaluation", "action"];
const BUSINESS_ROLES: BusinessRole[] = ["pm", "operations", "pmo", "ceo", "sponsor", "business_owner", "finance", "quality"];

const TRANSITIONS: Record<FeedbackCorrectionStatus, Partial<Record<FeedbackCorrectionAction, FeedbackCorrectionStatus>>> = {
  submitted: { accept: "correction_in_progress", reject: "rejected" },
  correction_in_progress: { submit_correction: "pending_verification" },
  pending_verification: { verify: "closed", request_rework: "correction_in_progress" },
  closed: {},
  rejected: {},
};

function requiredText(record: Record<string, unknown>, key: string): string {
  const value = String(record[key] ?? "").trim();
  if (!value) throw new Error(`${key}为必填字段`);
  return value;
}

export function parseFeedbackCorrectionRequest(value: unknown): FeedbackCorrectionRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("请求体为必填对象");
  const record = value as Record<string, unknown>;
  const targetType = requiredText(record, "target_type") as FeedbackCorrectionRequest["targetType"];
  const correctionType = requiredText(record, "correction_type") as FeedbackCorrectionType;
  const businessRole = requiredText(record, "business_role") as BusinessRole;
  if (!TARGET_TYPES.includes(targetType)) throw new Error("target_type不合法");
  if (!CORRECTION_TYPES.includes(correctionType)) throw new Error("correction_type不合法");
  if (!BUSINESS_ROLES.includes(businessRole)) throw new Error("business_role不合法");
  const dueAt = requiredText(record, "due_at");
  if (!Number.isFinite(new Date(dueAt).getTime())) throw new Error("due_at不合法");
  const proposedCorrection = record.proposed_correction;
  if (!proposedCorrection || typeof proposedCorrection !== "object" || Array.isArray(proposedCorrection)) {
    throw new Error("proposed_correction为必填对象");
  }
  const reasonCode = requiredText(record, "reason_code");
  if (!/^[A-Z0-9_:-]{3,80}$/.test(reasonCode)) throw new Error("reason_code不合法");
  const resubmissionPath = requiredText(record, "resubmission_path");
  if (!resubmissionPath.startsWith("/")) throw new Error("resubmission_path必须为系统内路径");
  return {
    projectId: requiredText(record, "project_id"),
    targetType,
    targetId: requiredText(record, "target_id"),
    correctionType,
    reasonCode,
    reasonDetail: requiredText(record, "reason_detail"),
    proposedCorrection: proposedCorrection as Record<string, unknown>,
    correctionOwnerUserId: requiredText(record, "correction_owner_user_id"),
    dueAt,
    resubmissionPath,
    businessRole,
    idempotencyKey: requiredText(record, "idempotency_key"),
  };
}

export function transitionFeedbackCorrection(
  status: FeedbackCorrectionStatus,
  action: FeedbackCorrectionAction,
): FeedbackCorrectionStatus {
  const next = TRANSITIONS[status]?.[action];
  if (!next) throw new Error(`CORRECTION_TRANSITION_NOT_ALLOWED:${status}:${action}`);
  return next;
}

export function canTransitionFeedbackCorrection(role: BusinessRole, action: FeedbackCorrectionAction): boolean {
  if (action === "accept" || action === "reject") return role === "pmo" || role === "quality";
  if (action === "verify" || action === "request_rework") return role === "pmo" || role === "quality" || role === "business_owner";
  return role === "pm" || role === "operations" || role === "pmo" || role === "quality";
}

