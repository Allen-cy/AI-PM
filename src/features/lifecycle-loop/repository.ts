import type { FeedbackCorrectionRequest } from "./corrections.ts";
import type { LifecycleObjectType } from "./domain.ts";

export interface LifecycleStateProjection {
  id: string;
  orgId: string;
  projectId: string;
  objectType: LifecycleObjectType;
  objectId: string;
  status: string;
  ownerUserId: string | null;
  dueAt: string | null;
  dataClass: "production" | "sample" | "test" | "diagnostic" | "unclassified";
  version: number;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function mapLifecycleState(row: Record<string, unknown>): LifecycleStateProjection {
  return {
    id: String(row.id),
    orgId: String(row.org_id),
    projectId: String(row.project_id),
    objectType: String(row.object_type) as LifecycleObjectType,
    objectId: String(row.object_id),
    status: String(row.status),
    ownerUserId: row.owner_user_id ? String(row.owner_user_id) : null,
    dueAt: row.due_at ? String(row.due_at) : null,
    dataClass: String(row.data_class || "unclassified") as LifecycleStateProjection["dataClass"],
    version: Number(row.version),
    metadata: object(row.metadata),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export function buildFeedbackCorrectionInsert(
  input: FeedbackCorrectionRequest,
  scope: { orgId: string; submittedBy: string },
): Record<string, unknown> {
  return {
    org_id: scope.orgId,
    project_id: input.projectId,
    target_type: input.targetType,
    target_id: input.targetId,
    correction_type: input.correctionType,
    status: "submitted",
    reason_code: input.reasonCode,
    reason_detail: input.reasonDetail,
    proposed_correction: input.proposedCorrection,
    correction_owner_user_id: input.correctionOwnerUserId,
    due_at: input.dueAt,
    resubmission_path: input.resubmissionPath,
    submitted_by: scope.submittedBy,
    submitted_business_role: input.businessRole,
    idempotency_key: input.idempotencyKey,
  };
}

