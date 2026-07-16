import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { dataClassificationFeishuScopeMatches } from "../src/features/feishu/classification-writeback.ts";
import { runFeishuTargetedReconcile } from "../src/features/feishu/reconcile-service.ts";
import type { FeishuConfig } from "../src/features/feishu/config.ts";

const read = (relative: string) => readFileSync(new URL(`../${relative}`, import.meta.url), "utf8");

function config(baseToken = "base-org", project = "tbl-project", ledger = "tbl-ledger"): FeishuConfig {
  return {
    appId: "app-id",
    appSecret: "secret",
    baseToken,
    allowedEventTypes: ["im.message.receive_v1"],
    tables: { project, syncLedger: ledger },
    publicSummary: { identity: "bot", baseConfigured: true, configuredTables: ["project", "syncLedger"] },
  };
}

test("V6.6.7 only allows a personal write into the organization's exact Base and table mapping", () => {
  const organization = config();
  assert.equal(dataClassificationFeishuScopeMatches(config(), organization, "project"), true);
  assert.equal(dataClassificationFeishuScopeMatches(config("other-base"), organization, "project"), false);
  assert.equal(dataClassificationFeishuScopeMatches(config("base-org", "other-table"), organization, "project"), false);
  assert.equal(dataClassificationFeishuScopeMatches(config("base-org", "tbl-project", "other-ledger"), organization, "project"), false);
});

test("V6.6.7 targeted reconcile mirrors exactly one classified record without tombstoning the domain", async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const supabase = {
    rpc: async (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args });
      if (name === "begin_feishu_reconcile_batch_tx") return { data: { batch_id: "batch-1", status: "running", completed_domains: [] }, error: null };
      if (name === "apply_feishu_reconcile_domain_tx") return { data: { batch_id: "batch-1", status: "running" }, error: null };
      if (name === "finalize_feishu_reconcile_batch_tx") return {
        data: {
          id: "batch-1", status: "completed", total_records: 1, inserted_records: 1,
          updated_records: 0, unchanged_records: 0, tombstoned_records: 0,
          quarantined_records: 0, failed_records: 0,
        },
        error: null,
      };
      return { data: null, error: { message: `unexpected rpc ${name}` } };
    },
  };
  const result = await runFeishuTargetedReconcile({
    config: config(),
    supabase,
    client: {
      getRecord: async () => ({
        recordId: "rec-project-1",
        updatedAt: "2026-07-16T12:00:00.000Z",
        fields: { 数据分类: "样例", 项目编号: "SAMPLE-001", 项目名称: "样例项目" },
      }),
    },
    orgId: "11111111-1111-4111-8111-111111111111",
    dataClass: "sample",
    sourceScope: "organization",
    sourceUserId: null,
    triggerType: "verification",
    domain: "project",
    sourceRecordId: "rec-project-1",
    idempotencyKey: "classification-reconcile:draft-1:v1:a1",
    expectedVersion: 0,
    actorUserId: "22222222-2222-4222-8222-222222222222",
    requestId: "request-1",
    sourceCheckpoint: "classification:draft-1:v1:a1",
  });
  assert.equal(result.status, "completed");
  assert.equal(result.source.snapshot, "targeted");
  assert.equal(result.counts.inserted, 1);
  const begin = calls.find(call => call.name === "begin_feishu_reconcile_batch_tx");
  const apply = calls.find(call => call.name === "apply_feishu_reconcile_domain_tx");
  assert.ok(begin);
  assert.ok(apply);
  assert.match(String(begin.args.p_request_fingerprint), /^[a-f0-9]{64}$/);
  assert.equal(apply.args.p_full_snapshot, false);
  assert.deepEqual(apply.args.p_seen_record_ids, ["rec-project-1"]);
  const records = apply.args.p_records as Array<Record<string, unknown>>;
  assert.equal(records.length, 1);
  assert.equal(records[0].data_class, "sample");
});

test("V6.6.7 targeted reconcile rejects a record returned outside the requested source id", async () => {
  const supabase = {
    rpc: async (name: string) => {
      if (name === "begin_feishu_reconcile_batch_tx") return { data: { batch_id: "batch-2", status: "running", completed_domains: [] }, error: null };
      if (name === "fail_feishu_reconcile_batch_tx") return { data: { id: "batch-2", status: "failed" }, error: null };
      return { data: null, error: { message: `unexpected rpc ${name}` } };
    },
  };
  await assert.rejects(() => runFeishuTargetedReconcile({
    config: config(),
    supabase,
    client: { getRecord: async () => ({ recordId: "rec-other", fields: { 数据分类: "样例", 项目编号: "OTHER", 项目名称: "越界记录" } }) },
    orgId: "11111111-1111-4111-8111-111111111111",
    dataClass: "sample",
    sourceScope: "organization",
    sourceUserId: null,
    triggerType: "verification",
    domain: "project",
    sourceRecordId: "rec-project-1",
    idempotencyKey: "classification-reconcile:draft-2:v1:a1",
    expectedVersion: 0,
    actorUserId: "22222222-2222-4222-8222-222222222222",
    requestId: "request-2",
    sourceCheckpoint: "classification:draft-2:v1:a1",
  }), (error: unknown) => error instanceof Error && error.message.includes("记录范围与申请不一致"));
});

test("V6.6.7 classification executor requires targeted mirror success before closing the confirmation", () => {
  const executor = read("src/features/feishu/classification-writeback-executor.ts");
  const service = read("src/features/feishu/reconcile-service.ts");
  assert.match(executor, /getOrganizationFeishuConfig/);
  assert.match(executor, /dataClassificationFeishuScopeMatches/);
  assert.match(executor, /runFeishuTargetedReconcile/);
  assert.match(executor, /classification-reconcile:[^\n]+claimed\.data\.attempt/);
  assert.match(executor, /reconcile\.counts\.failed/);
  assert.match(executor, /reconcile\.counts\.quarantined/);
  assert.match(executor, /ledgerShouldFail = false/);
  assert.match(executor, /V667_TARGET_RECORD_NOT_MIRRORED/);
  assert.match(service, /p_full_snapshot: fullSnapshot/);
  assert.match(service, /source_record_ids: sourceRecordIds/);
  assert.match(service, /TARGET_RECORD_SCOPE_MISMATCH/);
});
