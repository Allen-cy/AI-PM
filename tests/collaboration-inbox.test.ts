import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("role collaboration inbox aggregates only authenticated scoped real work", () => {
  const route = readFileSync("src/app/api/collaboration-inbox/route.ts", "utf8");
  const page = readFileSync("src/app/collaboration-inbox/page.tsx", "utf8");
  const home = readFileSync("src/app/page.tsx", "utf8");
  assert.match(route, /getCurrentUser/);
  assert.match(route, /resolveBusinessContext/);
  assert.match(route, /loadContextProjectIdentityMappings/);
  assert.match(route, /decision_receipts/);
  assert.match(route, /project_closure_assessments/);
  assert.match(route, /benefit_realization_reviews/);
  assert.match(route, /fallback_used:\s*false/);
  assert.doesNotMatch(route, /mock|demo|DEFAULT_/i);
  assert.match(page, /协作待办与审批收件箱/);
  assert.match(page, /发起人、业务负责人、财务和质量角色/);
  assert.match(home, /\/collaboration-inbox/);
});
