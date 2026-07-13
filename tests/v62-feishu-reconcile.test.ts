import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  FEISHU_RECONCILE_DOMAINS,
  buildReconcileIdempotencyKey,
  canonicalRowHash,
  classifyFeishuDataClass,
  normalizeFeishuRecord,
  projectReferenceFromFields,
} from "../src/features/feishu/reconcile-contract.ts";

test("V6.2 exposes exactly the eight governed Feishu reconciliation domains", () => {
  assert.deepEqual(FEISHU_RECONCILE_DOMAINS, [
    "project", "milestone", "task", "risk", "contract", "payment", "cost", "syncLedger",
  ]);
});

test("data class is explicit and sample or test records cannot silently enter production", () => {
  assert.equal(classifyFeishuDataClass({ 数据分类: "正式" }), "production");
  assert.equal(classifyFeishuDataClass({ 样例来源: "作业帮样例" }), "sample");
  assert.equal(classifyFeishuDataClass({ 测试批次: "V6.2" }), "test");
  assert.equal(classifyFeishuDataClass({ 项目名称: "测试项目", 数据分类: "正式" }), "production");
  assert.equal(classifyFeishuDataClass({ 项目名称: "普通项目" }), "unclassified");
});

test("project relationship uses Feishu record id or project code and never project name", () => {
  assert.deepEqual(projectReferenceFromFields({ 关联项目记录ID: [{ record_id: "rec-project-1" }] }), {
    sourceRecordId: "rec-project-1",
    projectCode: null,
  });
  assert.deepEqual(projectReferenceFromFields({ 项目编号: "P-001" }), {
    sourceRecordId: null,
    projectCode: "P-001",
  });
  assert.deepEqual(projectReferenceFromFields({ 项目名称: "重名项目" }), {
    sourceRecordId: null,
    projectCode: null,
  });
});

test("normalization returns stable internal fields, Chinese labels, source metadata and quality issues", async () => {
  const project = await normalizeFeishuRecord("project", {
    recordId: "rec-project-1",
    updatedAt: "2026-07-13T00:00:00.000Z",
    fields: {
      数据分类: "正式",
      项目编号: "P-001",
      项目名称: "统一数据底座",
      项目状态: "进行中",
      当前进度: 0.6,
      重点项目标记: "是",
    },
  }, { sourceContainerId: "base-1", requestedDataClass: "production" });

  assert.equal(project.payload.project_code, "P-001");
  assert.equal(project.payload.project_name, "统一数据底座");
  assert.equal(project.payload.progress, 60);
  assert.equal(project.payload.is_key_project, true);
  assert.equal(project.source.record_id, "rec-project-1");
  assert.equal(project.source.container_id, "base-1");
  assert.equal(project.source.updated_at, "2026-07-13T00:00:00.000Z");
  assert.equal(project.labels.project_code, "项目编号");
  assert.equal(project.quality.status, "ready");
  assert.match(project.row_hash, /^[a-f0-9]{64}$/);

  const orphanTask = await normalizeFeishuRecord("task", {
    recordId: "rec-task-1",
    fields: { 数据分类: "正式", 项目名称: "不能按名称关联", 任务名称: "任务A" },
  }, { sourceContainerId: "base-1", requestedDataClass: "production" });
  assert.equal(orphanTask.project_reference.sourceRecordId, null);
  assert.equal(orphanTask.project_reference.projectCode, null);
  assert.equal(orphanTask.quality.status, "quarantine");
  assert.ok(orphanTask.quality.issues.some(issue => issue.code === "PROJECT_REFERENCE_REQUIRED"));
});

test("canonical row hash and idempotency key are deterministic", async () => {
  assert.equal(await canonicalRowHash({ b: 2, a: 1 }), await canonicalRowHash({ a: 1, b: 2 }));
  assert.equal(
    await buildReconcileIdempotencyKey({ orgId: "o", dataClass: "production", sourceContainerId: "b", domains: ["risk", "project"], sourceCheckpoint: "2026-07-13" }),
    await buildReconcileIdempotencyKey({ orgId: "o", dataClass: "production", sourceContainerId: "b", domains: ["project", "risk"], sourceCheckpoint: "2026-07-13" }),
  );
});

test("V6.2 migration defines governed mirror, ledger, quarantine and atomic reconciliation", () => {
  const sql = readFileSync("supabase/migrations/20260713210000_v62_feishu_real_data_foundation.sql", "utf8");
  for (const table of [
    "project_milestones", "feishu_sync_ledger_mirror", "feishu_reconcile_batches",
    "feishu_reconcile_items", "feishu_reconcile_quarantine", "feishu_reconcile_cursors",
  ]) {
    assert.match(sql, new RegExp(`create table if not exists public\\.${table}`, "i"));
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`, "i"));
    assert.match(sql, new RegExp(`revoke all on table public\\.${table} from public, anon, authenticated`, "i"));
  }
  for (const table of ["projects", "tasks", "risks", "contracts", "payment_milestones", "cost_records"]) {
    assert.match(sql, new RegExp(`alter table public\\.${table}[\\s\\S]*source_record_id`, "i"));
    assert.match(sql, new RegExp(`alter table public\\.${table}[\\s\\S]*source_updated_at`, "i"));
    assert.match(sql, new RegExp(`alter table public\\.${table}[\\s\\S]*row_hash`, "i"));
    assert.match(sql, new RegExp(`alter table public\\.${table}[\\s\\S]*version`, "i"));
  }
  assert.match(sql, /uuid_generate_v5/i);
  assert.match(sql, /create or replace function public\.begin_feishu_reconcile_batch_tx/i);
  assert.match(sql, /create or replace function public\.apply_feishu_reconcile_domain_tx/i);
  assert.match(sql, /create or replace function public\.finalize_feishu_reconcile_batch_tx/i);
  assert.match(sql, /on conflict[\s\S]*source_record_id/i);
  assert.match(sql, /is_source_deleted/i);
  assert.doesNotMatch(sql, /delete\s+from\s+public\.(projects|project_milestones|tasks|risks|contracts|payment_milestones|cost_records|feishu_sync_ledger_mirror)/i);
});

test("V6.2 security follow-up grants the trigger function only to the service role", () => {
  const sql = readFileSync("supabase/migrations/20260713213000_v62_reconcile_trigger_security_fix.sql", "utf8");
  assert.match(sql, /revoke all on function public\.enforce_v62_project_scope\(\) from public, anon, authenticated/i);
  assert.match(sql, /grant execute on function public\.enforce_v62_project_scope\(\) to service_role/i);
  assert.doesNotMatch(sql, /drop\s+(table|schema|column)|truncate|delete\s+from/i);
});

test("manual and cron routes enforce context, idempotency, version and eight-domain reconciliation", () => {
  const manual = readFileSync("src/app/api/integrations/feishu/reconcile/route.ts", "utf8");
  const cron = readFileSync("src/app/api/cron/feishu-reconcile/route.ts", "utf8");
  const service = readFileSync("src/features/feishu/reconcile-service.ts", "utf8");
  assert.match(manual, /resolveBusinessContext/);
  assert.match(manual, /idempotency_key/);
  assert.match(manual, /expected_version/);
  assert.match(manual, /data_class/);
  assert.match(manual, /subject_scope/);
  assert.match(manual, /business_role/);
  assert.match(cron, /timingSafeEqual/);
  assert.match(cron, /CRON_SECRET/);
  assert.match(service, /FEISHU_RECONCILE_DOMAINS/);
  assert.match(service, /listRecordsPage/);
  assert.match(service, /apply_feishu_reconcile_domain_tx/);
  assert.match(service, /finalize_feishu_reconcile_batch_tx/);
});

test("integration center displays reconciliation source, freshness and quality without UUID input", () => {
  const page = readFileSync("src/app/integration-center/page.tsx", "utf8");
  assert.match(page, /飞书真实数据对账/);
  assert.match(page, /数据来源/);
  assert.match(page, /最近更新时间/);
  assert.match(page, /数据质量/);
  assert.match(page, /\/api\/integrations\/feishu\/reconcile/);
  assert.doesNotMatch(page, /请输入.*UUID/);
});
