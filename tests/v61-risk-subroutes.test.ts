import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const ROOT = new URL("../", import.meta.url);

const ROUTES: Array<{
  path: string;
  operations: Array<"read" | "create" | "transition" | "delete">;
  jsonReads?: number;
}> = [
  { path: "src/app/api/risk/analyze/route.ts", operations: ["create"], jsonReads: 1 },
  { path: "src/app/api/risk/sensitivity-impact/route.ts", operations: ["read"] },
  { path: "src/app/api/risk/retrospective/assets/export/route.ts", operations: ["read", "transition"], jsonReads: 1 },
  { path: "src/app/api/risk/retrospective/assets/governance/followups/evidence-chain/route.ts", operations: ["read", "create", "transition"], jsonReads: 2 },
  { path: "src/app/api/risk/retrospective/assets/governance/followups/feishu-sync/route.ts", operations: ["transition"], jsonReads: 1 },
  { path: "src/app/api/risk/retrospective/assets/governance/followups/operation-history/governance-workflow/route.ts", operations: ["create"], jsonReads: 1 },
  { path: "src/app/api/risk/retrospective/assets/governance/followups/operation-history/route.ts", operations: ["read", "create", "transition"], jsonReads: 2 },
  { path: "src/app/api/risk/retrospective/assets/governance/followups/route.ts", operations: ["read", "create", "transition"], jsonReads: 2 },
  { path: "src/app/api/risk/retrospective/assets/governance/followups/weekly-reminder/route.ts", operations: ["transition"], jsonReads: 1 },
  { path: "src/app/api/risk/retrospective/assets/governance/route.ts", operations: ["read"] },
  { path: "src/app/api/risk/retrospective/assets/quality/route.ts", operations: ["read"] },
  { path: "src/app/api/risk/retrospective/assets/route.ts", operations: ["read", "create", "transition"], jsonReads: 1 },
];

function read(path: string): string {
  return readFileSync(new URL(path, ROOT), "utf8");
}

function count(source: string, pattern: RegExp): number {
  return [...source.matchAll(pattern)].length;
}

test("V6.1 风险子接口全部接入统一业务上下文门禁", () => {
  for (const route of ROUTES) {
    const source = read(route.path);
    assert.match(source, /import\s*\{[^}]*authorizeRiskRequest[^}]*\}\s*from\s*"@\/features\/risk\/access"/, `${route.path} 未导入统一风险门禁`);
    for (const operation of route.operations) {
      assert.match(
        source,
        new RegExp(`authorizeRiskRequest\\(request,\\s*"${operation}"\\)`),
        `${route.path} 缺少 ${operation} 授权`,
      );
    }
    assert.match(source, /!\w+\.ok[\s\S]{0,220}\w+\.status/, `${route.path} 没有原样返回授权失败状态码`);
    assert.doesNotMatch(source, /process\.env\.AUTH_REQUIRED/, `${route.path} 仍保留可绕过统一上下文的旧认证分支`);
  }
});

test("每个风险子接口处理器最多读取一次请求体", () => {
  for (const route of ROUTES) {
    if (route.jsonReads === undefined) continue;
    const source = read(route.path);
    assert.equal(
      count(source, /request\.json\s*\(/g),
      route.jsonReads,
      `${route.path} 的 request.json() 次数异常`,
    );
  }
});

test("复盘资产新增与状态流转在单次读取请求体后分流授权", () => {
  const source = read("src/app/api/risk/retrospective/assets/route.ts");
  const bodyRead = source.indexOf("await request.json()");
  const createGate = source.indexOf('authorizeRiskRequest(request, "create")');
  const transitionGate = source.indexOf('authorizeRiskRequest(request, "transition")');
  assert.ok(bodyRead >= 0 && createGate > bodyRead && transitionGate > bodyRead);
});
