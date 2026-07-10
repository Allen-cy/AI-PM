import type { BusinessRole } from "../operating-model/context.ts";

export type LifecycleObjectType =
  | "project"
  | "plan_baseline"
  | "deliverable"
  | "change"
  | "reporting"
  | "closure";

export type LifecycleEvidenceExpiryAction = "block_transition" | "reopen_object" | "warn";

export interface EvidenceRequirement {
  id: string;
  objectType: LifecycleObjectType;
  fromStatus: string;
  toStatus: string;
  evidenceType: string;
  minimumCount: number;
  verifierRoles: BusinessRole[];
  validityDays: number | null;
  expiryAction: LifecycleEvidenceExpiryAction;
  active: boolean;
}

export interface LifecycleEvidence {
  id: string;
  evidenceType: string;
  verifiedAt: string | null;
  verifiedBy: string | null;
  verifiedByRole: BusinessRole | null;
  validUntil: string | null;
}

export interface LifecycleTransitionRequest {
  objectType: LifecycleObjectType;
  objectId: string;
  action: string;
  businessRole: BusinessRole;
  idempotencyKey: string;
  comment: string;
  evidenceIds: string[];
}

export interface LifecycleTransitionPlan {
  fromStatus: string;
  toStatus: string;
  action: string;
  requiredEvidenceTypes: string[];
  acceptedEvidenceIds: string[];
}

export interface LifecycleEvidenceRegistration {
  objectType: LifecycleObjectType;
  objectId: string;
  evidenceType: string;
  sourceType: string;
  sourceId: string;
  sourceUrl: string;
  title: string;
  version: string;
  validUntil: string | null;
}

type TransitionDefinition = {
  to: string;
  roles: readonly BusinessRole[];
};

const TRANSITIONS: Record<LifecycleObjectType, Record<string, Record<string, TransitionDefinition>>> = {
  project: {
    proposed: {
      approve: { to: "approved", roles: ["pmo", "sponsor", "ceo"] },
      reject: { to: "rejected", roles: ["pmo", "sponsor"] },
    },
    rejected: { revise: { to: "proposed", roles: ["pm", "operations"] } },
    approved: { activate: { to: "active", roles: ["pm", "pmo"] } },
    active: {
      suspend: { to: "suspended", roles: ["pmo", "sponsor", "ceo"] },
      start_closure: { to: "closing", roles: ["pm", "pmo"] },
      terminate: { to: "terminated", roles: ["sponsor", "ceo"] },
    },
    suspended: {
      resume: { to: "active", roles: ["pmo", "sponsor"] },
      terminate: { to: "terminated", roles: ["sponsor", "ceo"] },
    },
    closing: { close: { to: "closed", roles: ["pmo", "sponsor"] } },
    closed: { reopen: { to: "active", roles: ["pmo", "sponsor"] } },
    terminated: { reopen: { to: "suspended", roles: ["ceo", "sponsor"] } },
  },
  plan_baseline: {
    draft: { submit: { to: "submitted", roles: ["pm"] } },
    submitted: {
      approve: { to: "approved", roles: ["pmo", "sponsor"] },
      request_rework: { to: "draft", roles: ["pmo", "sponsor"] },
    },
    approved: { supersede: { to: "superseded", roles: ["pmo"] } },
  },
  deliverable: {
    planned: { start: { to: "in_progress", roles: ["pm"] } },
    in_progress: { submit: { to: "submitted", roles: ["pm"] } },
    submitted: {
      accept: { to: "accepted", roles: ["pmo", "operations", "business_owner", "sponsor"] },
      reject: { to: "rejected", roles: ["pmo", "operations", "business_owner"] },
    },
    rejected: { revise: { to: "in_progress", roles: ["pm"] } },
    accepted: { reopen: { to: "in_progress", roles: ["pmo", "business_owner"] } },
  },
  change: {
    draft: { submit: { to: "submitted", roles: ["pm", "operations"] } },
    submitted: {
      approve: { to: "approved", roles: ["pmo", "sponsor", "ceo"] },
      reject: { to: "rejected", roles: ["pmo", "sponsor"] },
    },
    approved: { implement: { to: "implemented", roles: ["pm", "operations"] } },
    implemented: { close: { to: "closed", roles: ["pmo"] } },
    rejected: { revise: { to: "draft", roles: ["pm", "operations"] } },
  },
  reporting: {
    draft: { submit: { to: "submitted", roles: ["pm", "operations"] } },
    submitted: {
      freeze: { to: "frozen", roles: ["pmo"] },
      request_rework: { to: "draft", roles: ["pmo"] },
    },
    frozen: { acknowledge: { to: "acknowledged", roles: ["pmo", "ceo", "sponsor"] } },
  },
  closure: {
    draft: { submit: { to: "submitted", roles: ["pm", "operations"] } },
    submitted: {
      approve: { to: "approved", roles: ["pmo", "sponsor"] },
      request_rework: { to: "draft", roles: ["pmo", "sponsor"] },
    },
    approved: { archive: { to: "archived", roles: ["pmo"] } },
  },
};

const OBJECT_TYPES = Object.keys(TRANSITIONS) as LifecycleObjectType[];
const BUSINESS_ROLES: BusinessRole[] = ["pm", "operations", "pmo", "ceo", "sponsor", "business_owner", "finance", "quality"];

function requiredText(record: Record<string, unknown>, key: string): string {
  const value = String(record[key] ?? "").trim();
  if (!value) throw new Error(`${key}为必填字段`);
  return value;
}

export function parseLifecycleTransitionRequest(value: unknown): LifecycleTransitionRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("请求体为必填对象");
  const record = value as Record<string, unknown>;
  const objectType = requiredText(record, "object_type") as LifecycleObjectType;
  const businessRole = requiredText(record, "business_role") as BusinessRole;
  if (!OBJECT_TYPES.includes(objectType)) throw new Error("object_type不合法");
  if (!BUSINESS_ROLES.includes(businessRole)) throw new Error("business_role不合法");
  const evidenceIds = record.evidence_ids ?? [];
  if (!Array.isArray(evidenceIds) || evidenceIds.some(item => !String(item).trim())) throw new Error("evidence_ids必须为非空ID数组");
  const idempotencyKey = requiredText(record, "idempotency_key");
  if (idempotencyKey.length > 200) throw new Error("idempotency_key超过200字符");
  return {
    objectType,
    objectId: requiredText(record, "object_id"),
    action: requiredText(record, "action"),
    businessRole,
    idempotencyKey,
    comment: String(record.comment ?? "").trim(),
    evidenceIds: [...new Set(evidenceIds.map(item => String(item).trim()))],
  };
}

export function parseLifecycleEvidenceRegistration(value: unknown): LifecycleEvidenceRegistration {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("请求体为必填对象");
  const record = value as Record<string, unknown>;
  const objectType = requiredText(record, "object_type") as LifecycleObjectType;
  if (!OBJECT_TYPES.includes(objectType)) throw new Error("object_type不合法");
  const sourceUrl = requiredText(record, "source_url");
  try {
    const parsed = new URL(sourceUrl);
    if (!(["https:", "http:"].includes(parsed.protocol))) throw new Error("protocol");
  } catch {
    throw new Error("source_url不合法");
  }
  const validUntil = record.valid_until ? String(record.valid_until).trim() : null;
  if (validUntil && !Number.isFinite(new Date(validUntil).getTime())) throw new Error("valid_until不合法");
  return {
    objectType,
    objectId: requiredText(record, "object_id"),
    evidenceType: requiredText(record, "evidence_type"),
    sourceType: requiredText(record, "source_type"),
    sourceId: requiredText(record, "source_id"),
    sourceUrl,
    title: requiredText(record, "title"),
    version: requiredText(record, "version"),
    validUntil,
  };
}

export function canVerifyLifecycleEvidence(role: BusinessRole): boolean {
  return ["pmo", "sponsor", "business_owner", "finance", "quality"].includes(role);
}

export function evaluateLifecycleTransition(input: {
  objectType: LifecycleObjectType;
  currentStatus: string;
  action: string;
  actorBusinessRole: BusinessRole;
  requirements: EvidenceRequirement[];
  evidence: LifecycleEvidence[];
  now?: Date;
}): LifecycleTransitionPlan {
  const definition = TRANSITIONS[input.objectType]?.[input.currentStatus]?.[input.action];
  if (!definition) throw new Error(`LIFECYCLE_TRANSITION_NOT_ALLOWED:${input.objectType}:${input.currentStatus}:${input.action}`);
  if (!definition.roles.includes(input.actorBusinessRole)) throw new Error(`LIFECYCLE_ACTOR_FORBIDDEN:${input.actorBusinessRole}`);
  const requirements = input.requirements.filter(requirement =>
    requirement.active
    && requirement.objectType === input.objectType
    && requirement.fromStatus === input.currentStatus
    && requirement.toStatus === definition.to,
  );
  const now = (input.now ?? new Date()).getTime();
  const accepted = new Set<string>();
  for (const requirement of requirements) {
    const candidates = input.evidence.filter(item =>
      item.evidenceType === requirement.evidenceType && Boolean(item.verifiedAt && item.verifiedBy),
    );
    const verifiedByAllowedRole = candidates.filter(item =>
      requirement.verifierRoles.length === 0 || Boolean(item.verifiedByRole && requirement.verifierRoles.includes(item.verifiedByRole)),
    );
    if (candidates.length >= requirement.minimumCount && verifiedByAllowedRole.length < requirement.minimumCount) {
      throw new Error(`LIFECYCLE_EVIDENCE_VERIFIER_FORBIDDEN:${requirement.evidenceType}`);
    }
    const valid = verifiedByAllowedRole.filter(item => !item.validUntil || new Date(item.validUntil).getTime() >= now);
    if (valid.length < requirement.minimumCount) {
      if (verifiedByAllowedRole.length >= requirement.minimumCount) throw new Error(`LIFECYCLE_EVIDENCE_EXPIRED:${requirement.evidenceType}`);
      throw new Error(`LIFECYCLE_EVIDENCE_REQUIRED:${requirement.evidenceType}`);
    }
    valid.slice(0, requirement.minimumCount).forEach(item => accepted.add(item.id));
  }
  return {
    fromStatus: input.currentStatus,
    toStatus: definition.to,
    action: input.action,
    requiredEvidenceTypes: [...new Set(requirements.map(item => item.evidenceType))],
    acceptedEvidenceIds: [...accepted],
  };
}

export function initialLifecycleStatus(objectType: LifecycleObjectType): string {
  return objectType === "project" ? "proposed"
    : objectType === "deliverable" ? "planned"
      : "draft";
}
