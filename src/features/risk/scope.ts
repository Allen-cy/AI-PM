import type { BusinessRole, SubjectScope, SystemRole } from "../operating-model/context.ts";
import type { ManagementSignalRecord } from "../operating-model/persistence.ts";

export type RiskDataClass = ManagementSignalRecord["dataClass"];

export interface RiskDataScope {
  orgId: string;
  dataClass: RiskDataClass;
  projectIds: string[];
  requestedProjectId?: string;
}

export interface RiskAccessScope extends RiskDataScope {
  actorUserId: string;
  systemRole: SystemRole;
  businessRole: BusinessRole;
  subjectScope: SubjectScope;
  subjectId: string;
  sourceRecordIds: string[];
  externalProjectCodes: string[];
}

const DATA_CLASSES: RiskDataClass[] = ["production", "sample", "test", "diagnostic", "unclassified"];

export function normalizeRiskDataClass(value: unknown): RiskDataClass {
  const dataClass = String(value ?? "").trim() as RiskDataClass;
  if (!DATA_CLASSES.includes(dataClass)) throw new Error("DATA_CLASS_INVALID");
  return dataClass;
}

export function resolveRequestedRiskProjectIds(scope: RiskDataScope, requestedProjectId?: string | null): string[] {
  const allowed = [...new Set(scope.projectIds.filter(Boolean))];
  const requested = String(requestedProjectId ?? "").trim();
  if (!requested) return allowed;
  if (!allowed.includes(requested)) throw new Error("PROJECT_OUTSIDE_CONTEXT");
  return [requested];
}

export function filterRiskScopedProjectRecords<T extends { 项目编号: string }>(
  records: T[],
  scope: Pick<RiskAccessScope, "sourceRecordIds" | "externalProjectCodes">,
): T[] {
  const allowed = new Set([
    ...scope.sourceRecordIds,
    ...scope.externalProjectCodes,
  ].map(value => value.trim().toLowerCase()).filter(Boolean));
  if (allowed.size === 0) return [];
  return records.filter(record => allowed.has(String(record.项目编号 || "").trim().toLowerCase()));
}
