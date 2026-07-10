export type SystemRole = "admin" | "user";

export type BusinessRole =
  | "pm"
  | "operations"
  | "pmo"
  | "ceo"
  | "sponsor"
  | "business_owner"
  | "finance"
  | "quality";

export type SubjectScope = "project" | "portfolio" | "organization" | "customer" | "contract";

export interface BusinessRoleAssignment {
  id: string;
  userId: string;
  businessRole: BusinessRole;
  orgId: string;
  subjectScope: SubjectScope;
  subjectId: string;
  status: "active" | "suspended" | "revoked" | "expired";
  validFrom: string;
  validUntil: string | null;
  delegatedFromUserId?: string | null;
}

export interface BusinessContext {
  actorUserId: string;
  systemRole: SystemRole;
  businessRole: BusinessRole;
  orgId: string;
  subjectScope: SubjectScope;
  subjectId: string;
  assignmentId: string;
}

export interface BusinessResourceRelationship {
  orgId: string;
  subjectScope: SubjectScope;
  subjectId: string;
  ancestorSubjectIds?: Partial<Record<SubjectScope, string[]>>;
}

export interface ResolveBusinessContextInput {
  user: { id: string; systemRole: SystemRole };
  assignments: BusinessRoleAssignment[];
  requestedRole: BusinessRole;
  requestedOrgId: string;
  requestedSubjectScope: SubjectScope;
  requestedSubjectId: string;
  now?: Date;
}

export interface BusinessRoleAssignmentInput {
  userId: string;
  businessRole: BusinessRole;
  orgId: string;
  subjectScope: SubjectScope;
  subjectId: string;
  validFrom: string;
  validUntil: string | null;
  delegatedFromUserId: string | null;
  assignmentReason: string | null;
}

const BUSINESS_ROLES: BusinessRole[] = ["pm", "operations", "pmo", "ceo", "sponsor", "business_owner", "finance", "quality"];
const SUBJECT_SCOPES: SubjectScope[] = ["project", "portfolio", "organization", "customer", "contract"];

function assignmentText(record: Record<string, unknown>, key: string): string {
  const value = String(record[key] ?? "").trim();
  if (!value) throw new Error(`${key}为必填字段`);
  return value;
}

export function parseBusinessRoleAssignmentInput(value: unknown): BusinessRoleAssignmentInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("请求体为必填对象");
  const record = value as Record<string, unknown>;
  const businessRole = assignmentText(record, "businessRole") as BusinessRole;
  const subjectScope = assignmentText(record, "subjectScope") as SubjectScope;
  if (!BUSINESS_ROLES.includes(businessRole)) throw new Error("businessRole不合法");
  if (!SUBJECT_SCOPES.includes(subjectScope)) throw new Error("subjectScope不合法");
  const validFrom = assignmentText(record, "validFrom");
  const validUntil = record.validUntil ? String(record.validUntil) : null;
  const start = new Date(validFrom).getTime();
  const end = validUntil ? new Date(validUntil).getTime() : null;
  if (!Number.isFinite(start) || (end !== null && (!Number.isFinite(end) || end < start))) throw new Error("角色有效期不合法");
  return {
    userId: assignmentText(record, "userId"),
    businessRole,
    orgId: assignmentText(record, "orgId"),
    subjectScope,
    subjectId: assignmentText(record, "subjectId"),
    validFrom,
    validUntil,
    delegatedFromUserId: record.delegatedFromUserId ? String(record.delegatedFromUserId) : null,
    assignmentReason: record.assignmentReason ? String(record.assignmentReason).trim() : null,
  };
}

function assignmentIsEffective(assignment: BusinessRoleAssignment, now: Date): boolean {
  if (assignment.status !== "active") return false;
  const startsAt = new Date(assignment.validFrom).getTime();
  const endsAt = assignment.validUntil ? new Date(assignment.validUntil).getTime() : null;
  if (!Number.isFinite(startsAt) || startsAt > now.getTime()) return false;
  return endsAt === null || (Number.isFinite(endsAt) && endsAt >= now.getTime());
}

export function businessAssignmentCoversResource(
  assignment: BusinessRoleAssignment,
  resource: BusinessResourceRelationship,
): boolean {
  if (assignment.orgId !== resource.orgId) return false;
  if (assignment.subjectScope === resource.subjectScope && assignment.subjectId === resource.subjectId) return true;
  if (assignment.subjectScope === "organization" && assignment.subjectId === resource.orgId) return true;
  return resource.ancestorSubjectIds?.[assignment.subjectScope]?.includes(assignment.subjectId) === true;
}

export function resolveBusinessContextForResource(input: {
  user: { id: string; systemRole: SystemRole };
  assignments: BusinessRoleAssignment[];
  requestedRole: BusinessRole;
  resource: BusinessResourceRelationship;
  now?: Date;
}): BusinessContext | null {
  const now = input.now ?? new Date();
  const assignment = input.assignments.find(item => (
    item.userId === input.user.id
    && item.businessRole === input.requestedRole
    && assignmentIsEffective(item, now)
    && businessAssignmentCoversResource(item, input.resource)
  ));
  if (!assignment) return null;
  return {
    actorUserId: input.user.id,
    systemRole: input.user.systemRole,
    businessRole: assignment.businessRole,
    orgId: assignment.orgId,
    subjectScope: assignment.subjectScope,
    subjectId: assignment.subjectId,
    assignmentId: assignment.id,
  };
}

export function resolveBusinessContext(input: ResolveBusinessContextInput): BusinessContext | null {
  const now = input.now ?? new Date();
  const assignment = input.assignments.find(item => (
    item.userId === input.user.id
    && item.businessRole === input.requestedRole
    && item.orgId === input.requestedOrgId
    && item.subjectScope === input.requestedSubjectScope
    && item.subjectId === input.requestedSubjectId
    && assignmentIsEffective(item, now)
  ));
  if (!assignment) return null;

  return {
    actorUserId: input.user.id,
    systemRole: input.user.systemRole,
    businessRole: assignment.businessRole,
    orgId: assignment.orgId,
    subjectScope: assignment.subjectScope,
    subjectId: assignment.subjectId,
    assignmentId: assignment.id,
  };
}
