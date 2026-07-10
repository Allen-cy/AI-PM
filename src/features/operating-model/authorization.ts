import { businessAssignmentCoversResource, type BusinessContext, type SubjectScope } from "./context.ts";

export type BusinessAction =
  | "project.read"
  | "milestone.update"
  | "operations.update"
  | "signal.verify"
  | "signal.review"
  | "signal.escalate"
  | "decision.view"
  | "decision.decide"
  | "action.execute"
  | "role.assign";

export interface BusinessResourceScope {
  orgId: string;
  subjectScope: SubjectScope;
  subjectId: string;
  ancestorSubjectIds?: Partial<Record<SubjectScope, string[]>>;
}

const ROLE_ACTIONS: Record<BusinessContext["businessRole"], ReadonlySet<BusinessAction>> = {
  pm: new Set(["project.read", "milestone.update", "signal.verify", "action.execute"]),
  operations: new Set(["project.read", "operations.update", "signal.verify", "action.execute"]),
  pmo: new Set(["project.read", "signal.review", "signal.escalate", "decision.view", "role.assign"]),
  ceo: new Set(["project.read", "decision.view", "decision.decide"]),
  sponsor: new Set(["project.read", "signal.review", "decision.view", "decision.decide"]),
  business_owner: new Set(["project.read", "operations.update", "signal.verify", "decision.view"]),
  finance: new Set(["project.read", "operations.update", "signal.verify", "decision.view"]),
  quality: new Set(["project.read", "signal.verify", "signal.review"]),
};

const ROLE_FIELD_PREFIXES: Record<BusinessContext["businessRole"], readonly string[]> = {
  pm: ["project.", "delivery.", "risk.", "action.", "evidence.", "operations.acceptance", "finance.contract_amount", "finance.collection_rate"],
  operations: ["project.", "delivery.", "operations.", "risk.", "action.", "evidence.", "finance.contract_amount", "finance.receivable", "finance.collection", "finance.margin_forecast"],
  pmo: ["project.", "delivery.", "operations.", "risk.", "action.", "evidence.", "governance.", "finance.", "decision."],
  ceo: ["project.", "delivery.", "operations.", "risk.", "action.", "evidence.", "governance.", "finance.", "decision.", "portfolio."],
  sponsor: ["project.", "delivery.", "operations.", "risk.", "action.", "evidence.", "governance.", "finance.contract_amount", "finance.collection_rate", "decision."],
  business_owner: ["project.", "delivery.", "operations.", "risk.", "action.", "evidence.", "finance.contract_amount", "finance.receivable", "finance.collection_rate"],
  finance: ["project.", "operations.", "finance.", "action.", "evidence.", "decision.financial_impact"],
  quality: ["project.", "delivery.", "risk.", "quality.", "action.", "evidence.", "governance."],
};

function scopeMatches(context: BusinessContext, resource: BusinessResourceScope): boolean {
  return businessAssignmentCoversResource({
    id: context.assignmentId,
    userId: context.actorUserId,
    businessRole: context.businessRole,
    orgId: context.orgId,
    subjectScope: context.subjectScope,
    subjectId: context.subjectId,
    status: "active",
    validFrom: "1970-01-01T00:00:00.000Z",
    validUntil: null,
  }, resource);
}

export function canPerformBusinessAction(
  context: BusinessContext,
  action: BusinessAction,
  resource: BusinessResourceScope,
): boolean {
  if (!scopeMatches(context, resource)) return false;
  return ROLE_ACTIONS[context.businessRole].has(action);
}

export function canReadBusinessField(
  context: BusinessContext,
  field: string,
  resource: BusinessResourceScope,
): boolean {
  if (!scopeMatches(context, resource)) return false;
  return ROLE_FIELD_PREFIXES[context.businessRole].some(prefix => field === prefix || field.startsWith(prefix));
}

export function filterBusinessRecordFields<T extends Record<string, unknown>>(
  context: BusinessContext,
  record: T,
  resource: BusinessResourceScope,
  fieldMap: Partial<Record<keyof T, string>>,
): Partial<T> {
  const output: Partial<T> = {};
  for (const [key, value] of Object.entries(record) as Array<[keyof T, T[keyof T]]>) {
    const field = fieldMap[key];
    if (field && canReadBusinessField(context, field, resource)) output[key] = value;
  }
  return output;
}
