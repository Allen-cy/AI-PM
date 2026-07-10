export interface ProjectIdentity {
  projectId: string;
  orgId: string;
  projectCode: string | null;
  projectName: string;
  status: "draft" | "active" | "suspended" | "closed" | "merged";
  externalMappings: Array<{
    sourceType: string;
    sourceId: string;
  }>;
}

export interface ProjectIdentityLookup {
  orgId: string;
  sourceType: string;
  sourceId: string;
  projectCode?: string | null;
  projectName?: string | null;
}

export function findProjectIdentityMatch(
  identities: ProjectIdentity[],
  lookup: ProjectIdentityLookup,
): ProjectIdentity | null {
  const sameOrg = identities.filter(identity => identity.orgId === lookup.orgId);
  const sourceMatch = sameOrg.find(identity => identity.externalMappings.some(mapping => (
    mapping.sourceType === lookup.sourceType && mapping.sourceId === lookup.sourceId
  )));
  if (sourceMatch) return sourceMatch;

  const code = lookup.projectCode?.trim().toLowerCase();
  if (!code) return null;
  return sameOrg.find(identity => identity.projectCode?.trim().toLowerCase() === code) ?? null;
}
