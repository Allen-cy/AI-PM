import assert from "node:assert/strict";
import test from "node:test";

import { runFeishuReconcile } from "../src/features/feishu/reconcile-service.ts";
import { readFeishuConfig } from "../src/features/feishu/config.ts";

function config() {
  const value = readFeishuConfig({
    FEISHU_APP_ID: "app-test",
    FEISHU_APP_SECRET: "secret",
    FEISHU_BASE_TOKEN: "base-test",
    FEISHU_PROJECT_TABLE_ID: "tbl-project",
    FEISHU_TASK_TABLE_ID: "tbl-task",
  });
  assert.ok(value);
  return value;
}

test("reconciliation always applies projects first and excludes quarantined spaces from tombstone evidence", async () => {
  const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const supabase = {
    async rpc(name: string, args: Record<string, unknown>) {
      rpcCalls.push({ name, args });
      if (name === "begin_feishu_reconcile_batch_tx") {
        return { data: { batch_id: "batch-1", status: "running", created: true, completed_domains: [] }, error: null };
      }
      if (name === "finalize_feishu_reconcile_batch_tx") {
        return { data: { id: "batch-1", status: "completed_with_warnings", total_records: 3, quarantined_records: 1 }, error: null };
      }
      return { data: { status: "succeeded" }, error: null };
    },
  };
  const pages = {
    project: {
      records: [
        { recordId: "rec-project-production", fields: { 数据分类: "正式", 项目编号: "P-001", 项目名称: "真实项目" } },
        { recordId: "rec-project-sample", fields: { 数据分类: "样例", 项目编号: "S-001", 项目名称: "样例项目" } },
      ],
      hasMore: false,
    },
    task: {
      records: [{ recordId: "rec-task-1", fields: { 数据分类: "正式", 关联项目记录ID: "rec-project-production", 任务名称: "任务一" } }],
      hasMore: false,
    },
  };
  const client = {
    async listRecordsPage(domain: "project" | "task") {
      return pages[domain];
    },
  };

  const result = await runFeishuReconcile({
    config: config(),
    supabase,
    client,
    orgId: "00000000-0000-0000-0000-000000000001",
    dataClass: "production",
    sourceScope: "organization",
    sourceUserId: null,
    triggerType: "manual",
    domains: ["task", "project"],
    idempotencyKey: "manual-key-1",
    expectedVersion: 0,
    actorUserId: "00000000-0000-0000-0000-000000000002",
    requestId: "request-1",
    sourceCheckpoint: "2026-07-13T12:00:00.000Z",
  });

  const apply = rpcCalls.filter(call => call.name === "apply_feishu_reconcile_domain_tx");
  assert.deepEqual(apply.map(call => call.args.p_domain), ["project", "task"]);
  assert.deepEqual(apply[0].args.p_seen_record_ids, ["rec-project-production"]);
  assert.equal((apply[0].args.p_records as unknown[]).length, 2);
  assert.equal(result.source.type, "feishu");
  assert.equal(result.source.container, "飞书多维表格");
  assert.doesNotMatch(JSON.stringify(result), /base-test|secret/);
  assert.equal(result.data_quality.quarantined, 1);
});

test("a completed idempotent batch returns without reading Feishu again", async () => {
  let readCount = 0;
  const supabase = {
    async rpc(name: string) {
      assert.equal(name, "begin_feishu_reconcile_batch_tx");
      return {
        data: {
          batch_id: "batch-existing",
          status: "completed",
          created: false,
          completed_domains: ["project"],
          counts: { total: 1, inserted: 1, updated: 0, unchanged: 0, tombstoned: 0, quarantined: 0, failed: 0 },
        },
        error: null,
      };
    },
  };
  const result = await runFeishuReconcile({
    config: config(),
    supabase,
    client: { async listRecordsPage() { readCount += 1; return { records: [], hasMore: false }; } },
    orgId: "00000000-0000-0000-0000-000000000001",
    dataClass: "production",
    sourceScope: "organization",
    sourceUserId: null,
    triggerType: "manual",
    domains: ["project"],
    idempotencyKey: "manual-key-existing",
    expectedVersion: 0,
    actorUserId: null,
    requestId: "request-existing",
    sourceCheckpoint: "2026-07-13T12:00:00.000Z",
  });

  assert.equal(readCount, 0);
  assert.equal(result.replayed, true);
  assert.equal(result.batch_id, "batch-existing");
});
