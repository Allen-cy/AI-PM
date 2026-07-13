import type { RiskRepositoryScope } from "../../lib/risk-repository.ts";

export function resolveIssueChangeProjectIds(scope: RiskRepositoryScope): string[] {
  const allowed = [...new Set(scope.projectIds.map(String).map(value => value.trim()).filter(Boolean))];
  const requested = String(scope.requestedProjectId ?? "").trim();
  if (!requested) return allowed;
  if (!allowed.includes(requested)) throw new Error("PROJECT_OUTSIDE_CONTEXT");
  return [requested];
}

export function issueChangeRecordBelongsToScope(
  record: { orgId?: string | null; projectId?: string | null; dataClass?: string | null },
  scope: RiskRepositoryScope,
): boolean {
  return record.orgId === scope.orgId
    && record.dataClass === scope.dataClass
    && Boolean(record.projectId && resolveIssueChangeProjectIds(scope).includes(record.projectId));
}
