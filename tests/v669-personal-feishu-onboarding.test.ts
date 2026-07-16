import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { organizationScopeAlignmentStep } from "../src/features/feishu/connection-test.ts";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("organization scope alignment fails closed for a different Base", () => {
  const result = organizationScopeAlignmentStep({
    requested: true,
    organizationConfigured: true,
    sameBase: false,
    mismatchedTables: [],
  });
  assert.equal(result.status, "failed");
  assert.equal(result.code, "PERSONAL_ORGANIZATION_BASE_MISMATCH");
});

test("organization scope alignment identifies mismatched Chinese business tables", () => {
  const result = organizationScopeAlignmentStep({
    requested: true,
    organizationConfigured: true,
    sameBase: true,
    mismatchedTables: ["project", "syncLedger"],
  });
  assert.equal(result.status, "failed");
  assert.match(result.detail, /project/);
  assert.match(result.detail, /syncLedger/);
});

test("personal Feishu test route validates organization membership and exact scope", () => {
  const route = read("src/app/api/user/feishu-connection/test/route.ts");
  assert.match(route, /listBusinessRoleAssignments/);
  assert.match(route, /getOrganizationFeishuConfig/);
  assert.match(route, /organizationScopeAlignmentStep/);
  assert.match(route, /PERSONAL_ORGANIZATION_SCOPE_FORBIDDEN/);
});

test("user center exposes organization mapping reuse notification receiver and mobile layout", () => {
  const account = read("src/app/account/page.tsx");
  assert.match(account, /复制组织八表映射/);
  assert.match(account, /notificationReceiveIdType/);
  assert.match(account, /notificationReceiveId/);
  assert.match(account, /account-responsive-grid/);
  assert.match(account, /@media \(max-width: 760px\)/);
});

test("personal connection GET returns only non-secret organization onboarding template", () => {
  const route = read("src/app/api/user/feishu-connection/route.ts");
  assert.match(route, /organizationTemplate/);
  assert.match(route, /tableMapping/);
  assert.doesNotMatch(route, /organizationTemplate:[^\n]*baseToken/);
});
