import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const financeRouteSource = readFileSync(
  new URL("../src/app/api/finance/route.ts", import.meta.url),
  "utf8",
);

test("finance cockpit fails closed when the Feishu source is unavailable", () => {
  assert.doesNotMatch(financeRouteSource, /DEFAULT_DASHBOARD_DATA/);
  assert.match(financeRouteSource, /FINANCE_DATA_SOURCE_UNAVAILABLE/);
  assert.match(financeRouteSource, /status:\s*"not_configured"[\s\S]*?status:\s*503/);
  assert.match(financeRouteSource, /status:\s*"error"[\s\S]*?status:\s*503/);
});
