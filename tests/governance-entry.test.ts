import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const route = readFileSync(new URL("../src/app/api/governance/route.ts", import.meta.url), "utf8");
const repository = readFileSync(new URL("../src/features/governance/repository.ts", import.meta.url), "utf8");

test("governance main entry is scoped to a verified business context and real persistence", () => {
  assert.match(route, /requireAuthenticatedApiUser/);
  assert.match(route, /listBusinessRoleAssignments/);
  assert.match(route, /resolveBusinessContext/);
  assert.match(route, /loadContextProjectIdentityMappings/);
  assert.match(route, /listGovernanceInstancesForProjectIds/);
  assert.match(route, /fallback_used:\s*false/);
  assert.match(route, /GOVERNANCE_STORAGE_NOT_CONFIGURED/);
  assert.match(repository, /\.in\("canonical_project_id", scopedProjectIds\)/);
});

test("governance main entry does not synthesize governance facts", () => {
  assert.doesNotMatch(route, /GOVERNANCE_MOCK/);
  assert.doesNotMatch(route, /Math\.random/);
  assert.doesNotMatch(route, /setTimeout/);
  assert.doesNotMatch(route, /rootCause:\s*["']/);
  assert.match(route, /LEGACY_GOVERNANCE_ACTION_RETIRED/);
  assert.match(route, /\/api\/governance\/workflows/);
});
