import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildDataClassificationWritebackPayload,
  dataClassificationPayloadMatchesDraft,
  validateDataClassificationDecision,
} from "../src/features/feishu/classification-writeback.ts";
import { validateFeishuActionBody } from "../src/features/feishu/action-payload.ts";

const read = (relative: string) => readFileSync(new URL(`../${relative}`, import.meta.url), "utf8");

test("V6.6.6 classification decision never promotes sample or test markers to production", () => {
  assert.throws(() => validateDataClassificationDecision({
    targetDataClass: "production",
    reason: "拟作为正式试点项目。",
    productionAcknowledged: true,
    sourcePayload: { 项目名称: "样例项目", 样例来源: "历史模板" },
  }), /样例或测试标记/);
  assert.throws(() => validateDataClassificationDecision({
    targetDataClass: "production",
    reason: "拟作为正式试点项目。",
    productionAcknowledged: false,
    sourcePayload: { 项目名称: "客户项目" },
  }), /显式确认/);
  assert.equal(validateDataClassificationDecision({
    targetDataClass: "sample",
    reason: "来源为历史演示台账。",
    productionAcknowledged: false,
    sourcePayload: { 项目名称: "样例项目", 样例来源: "历史模板" },
  }).targetChineseValue, "样例");
});

test("V6.6.6 builds a Chinese-field classification payload without inventing a project id", () => {
  const draft = {
    id: "66666666-6666-4666-8666-666666666666",
    orgId: "11111111-1111-4111-8111-111111111111",
    quarantineId: "22222222-2222-4222-8222-222222222222",
    domain: "project" as const,
    sourceRecordId: "rec-project-1",
    targetDataClass: "sample" as const,
    targetChineseValue: "样例" as const,
    expectedChineseValue: null,
    version: 1,
  };
  const payload = buildDataClassificationWritebackPayload(draft);
  assert.deepEqual(payload.fields, { 数据分类: "样例" });
  assert.deepEqual(payload.expected_fields, { 数据分类: null });
  assert.equal(payload.classification_draft_id, draft.id);
  assert.equal(payload.data_class, "unclassified");
  assert.equal(Object.hasOwn(payload, "project_id"), false);
  assert.equal(validateFeishuActionBody(payload).actionType, "base_record_update");
  assert.equal(dataClassificationPayloadMatchesDraft(payload, draft), true);
});

test("V6.6.6 migration persists a service-only atomic classification and confirmation workflow", () => {
  const sql = read("supabase/migrations/20260716152000_v666_data_classification_writeback.sql");
  for (const token of [
    "feishu_data_classification_drafts",
    "create_v666_data_classification_draft_tx",
    "claim_v666_data_classification_writeback_tx",
    "finalize_v666_data_classification_writeback_tx",
    "cancel_v666_data_classification_writeback_tx",
    "V666_SAMPLE_TO_PRODUCTION_FORBIDDEN",
    "enable row level security",
    "from public,anon,authenticated",
    "to service_role",
  ]) assert.match(sql, new RegExp(token, "i"));
});

test("V6.6.6 API and UI create a confirmation queue instead of directly writing Feishu", () => {
  const route = read("src/app/api/integrations/feishu/quarantine-governance/route.ts");
  const page = read("src/app/integration-center/data-governance/page.tsx");
  const confirm = read("src/app/api/integrations/feishu/actions/confirmations/[id]/confirm/route.ts");
  const cancel = read("src/app/api/integrations/feishu/actions/confirmations/[id]/cancel/route.ts");
  assert.match(route, /export async function POST/);
  assert.match(route, /createDataClassificationDraft/);
  assert.match(route, /production_acknowledged/);
  assert.match(page, /创建写回确认/);
  assert.match(page, /classificationDraft/);
  assert.match(confirm, /executeDataClassificationWriteback/);
  assert.match(cancel, /cancelDataClassificationWriteback/);
  assert.doesNotMatch(route, /updateRecord\(/);
});
