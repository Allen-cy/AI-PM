import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pageSource = readFileSync(new URL("../src/app/admin/security/risk-quarantine/page.tsx", import.meta.url), "utf8");
const stylesSource = readFileSync(new URL("../src/app/admin/security/risk-quarantine/page.module.css", import.meta.url), "utf8");
const securityPageSource = readFileSync(new URL("../src/app/admin/security/page.tsx", import.meta.url), "utf8");

test("V6.1 risk quarantine console loads the governed context and pending queue", () => {
  assert.match(pageSource, /loadCurrentBusinessContextSearchParams/);
  assert.match(pageSource, /preferredRole:\s*"pmo"[\s\S]*preferredSubjectScope:\s*"organization"/);
  assert.match(pageSource, /\/api\/context\/current\?\$\{params\.toString\(\)\}/);
  assert.match(pageSource, /\/api\/risk\/quarantine\?\$\{queueParams\.toString\(\)\}/);
  assert.match(pageSource, /queueParams\.set\("quarantine_status",\s*"pending"\)/);
  assert.match(pageSource, /当前业务上下文没有可授权项目/);
  assert.match(pageSource, /尚未分配有效业务角色|没有隔离队列治理权限|无权访问风险隔离治理队列/);
});

test("V6.1 risk quarantine resolution uses an authorized project selector and optimistic version", () => {
  assert.match(pageSource, /<select[\s\S]*?selectedProjectId/);
  assert.match(pageSource, /availableProjects\.map/);
  assert.match(pageSource, /method:\s*"PATCH"/);
  assert.match(pageSource, /expected_version:\s*item\.version/);
  assert.match(pageSource, /idempotency_key:/);
  assert.match(pageSource, /resolution_note:\s*resolutionNote/);
  assert.doesNotMatch(pageSource, /请输入[^"\n]*(?:UUID|JSON)/);
});

test("V6.1 risk quarantine console is discoverable and mobile-safe", () => {
  assert.match(securityPageSource, /href="\/admin\/security\/risk-quarantine"/);
  assert.match(pageSource, /href="\/admin\/security"/);
  assert.match(pageSource, /href="\/"/);
  assert.match(stylesSource, /@media\s*\(max-width:\s*600px\)/);
  assert.match(stylesSource, /min-width:\s*0/);
  assert.doesNotMatch(stylesSource, /min-width:\s*[4-9]\d\dpx/);
});
