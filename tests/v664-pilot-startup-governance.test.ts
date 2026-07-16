import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  buildFeishuClassificationCsv,
  buildFeishuClassificationSummary,
  recommendFeishuDataClass,
  type FeishuQuarantineSourceRow,
} from "../src/features/feishu/quarantine-governance.ts";

function row(overrides: Partial<FeishuQuarantineSourceRow> = {}): FeishuQuarantineSourceRow {
  return {
    id: "q-1",
    domain: "project",
    source_record_id: "rec-1",
    external_project_code: "PRJ-001",
    reason_code: "DATA_CLASS_MISMATCH",
    reason_detail: "记录未进入请求的数据空间。",
    status: "pending",
    occurrence_count: 2,
    last_seen_at: "2026-07-16T01:00:00.000Z",
    source_payload: { 项目名称: "示例项目" },
    ...overrides,
  };
}

test("V6.6.4 quarantine governance keeps sample markers out of production", () => {
  const recommendation = recommendFeishuDataClass(row({ source_payload: { 项目名称: "样例项目", 样例来源: "用户提供的样例数据源", 测试批次: "demo-1" } }));
  assert.equal(recommendation.recommendedDataClass, "sample");
  assert.equal(recommendation.canBecomeFormalProject, false);
  assert.equal(recommendation.requiredChineseField, "数据分类");
  assert.match(recommendation.basis.join("；"), /不得自动进入正式数据空间/);
});

test("V6.6.4 only accepts production when Feishu explicitly says so", () => {
  const explicit = recommendFeishuDataClass(row({ source_payload: { 项目名称: "真实客户项目", 数据分类: "正式" } }));
  const unknown = recommendFeishuDataClass(row({ source_payload: { 项目名称: "来源待确认" } }));
  assert.equal(explicit.recommendedDataClass, "production");
  assert.equal(explicit.canBecomeFormalProject, true);
  assert.equal(unknown.recommendedDataClass, "unclassified");
  assert.equal(unknown.canBecomeFormalProject, false);
  assert.match(unknown.basis.join("；"), /禁止自动推断为正式/);
});

test("V6.6.4 classification export is Chinese, complete and spreadsheet-safe", () => {
  const items = [
    recommendFeishuDataClass(row({ source_payload: { 项目名称: "样例项目", 样例来源: "样例.xlsx" } })),
    recommendFeishuDataClass(row({ id: "q-2", source_record_id: "rec-2", source_payload: { 项目名称: "待确认项目" } })),
  ];
  const summary = buildFeishuClassificationSummary(items);
  const csv = buildFeishuClassificationCsv(items);
  assert.equal(summary.total, 2);
  assert.equal(summary.formalProjectCandidates, 0);
  assert.equal(summary.requiresManualDecision, 1);
  assert.ok(csv.startsWith("\uFEFF"));
  assert.match(csv, /飞书必填中文字段/);
  assert.match(csv, /数据分类/);
  assert.match(csv, /样例项目/);
});

test("V6.6.4 exposes an organization-PMO governance API and actionable pages", () => {
  const route = readFileSync(new URL("../src/app/api/integrations/feishu/quarantine-governance/route.ts", import.meta.url), "utf8");
  const governancePage = readFileSync(new URL("../src/app/integration-center/data-governance/page.tsx", import.meta.url), "utf8");
  const integrationPage = readFileSync(new URL("../src/app/integration-center/page.tsx", import.meta.url), "utf8");
  const pilotRoute = readFileSync(new URL("../src/app/api/operations-center/pilot-acceptance/route.ts", import.meta.url), "utf8");
  const pilotPage = readFileSync(new URL("../src/app/operations-center/pilot-acceptance/page.tsx", import.meta.url), "utf8");

  assert.match(route, /role !== "pmo"/);
  assert.match(route, /context\.subjectScope !== "organization"/);
  assert.match(route, /\.eq\("org_id", access\.orgId\)/);
  assert.match(route, /\.eq\("data_class", access\.dataClass\)/);
  assert.match(route, /source_payload/);
  assert.doesNotMatch(route, /export async function POST/);
  assert.match(governancePage, /系统只依据飞书原始字段给出分类建议/);
  assert.match(governancePage, /下载分类治理 CSV/);
  assert.match(integrationPage, /\/integration-center\/data-governance/);
  assert.match(pilotRoute, /format"\) === "startup-pack"/);
  assert.match(pilotRoute, /系统不会代替四位真实用户签字/);
  assert.match(pilotPage, /下载正式试点启动包/);
});
