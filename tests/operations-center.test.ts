import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";

import {
  buildEnterpriseCapabilityGates,
  buildOperationalMetrics,
  buildRoleOnboardingGuide,
} from "../src/features/operating-model/operations-center.ts";

test("P25 role onboarding guide only completes verified or explicitly acknowledged setup", () => {
  const guide = buildRoleOnboardingGuide({
    businessRole: "pm",
    dataClass: "production",
    roleAssignmentActive: true,
    feishuConfigured: true,
    aiConfigured: false,
    projectMappingCount: 2,
    acknowledgements: { data_class: "production" },
  });

  assert.equal(guide.steps.length, 5);
  assert.equal(guide.steps.find(item => item.key === "business_role")?.completed, true);
  assert.equal(guide.steps.find(item => item.key === "ai_model")?.completed, false);
  assert.equal(guide.steps.find(item => item.key === "data_class")?.completed, true);
  assert.equal(guide.completedCount, 4);
  assert.equal(guide.status, "in_progress");
  assert.ok(guide.goldenChain.some(item => item.includes("提交")));
});

test("P25 metrics are calculated from observed source rows and keep missing sources unavailable", () => {
  const metrics = buildOperationalMetrics({
    now: new Date("2026-07-10T12:00:00Z"),
    syncLogs: [
      { status: "succeeded", source: "feishu", createdAt: "2026-07-10T11:30:00Z" },
      { status: "failed", source: "feishu", createdAt: "2026-07-10T11:00:00Z" },
      { status: "succeeded", source: "ai_model", createdAt: "2026-07-10T11:59:00Z" },
    ],
    confirmations: [
      { status: "pending_confirmation", createdAt: "2026-07-10T10:00:00Z" },
      { status: "succeeded", createdAt: "2026-07-10T09:00:00Z" },
    ],
    decisions: [
      { status: "decided", requestedDecisionAt: "2026-07-10T10:00:00Z", decidedAt: "2026-07-10T09:00:00Z" },
      { status: "submitted", requestedDecisionAt: "2026-07-10T11:00:00Z", decidedAt: null },
    ],
    actions: [
      { status: "closed", createdAt: "2026-07-01T00:00:00Z", closedAt: "2026-07-09T00:00:00Z" },
      { status: "in_progress", createdAt: "2026-07-02T00:00:00Z", closedAt: null },
    ],
    aiEvaluations: [
      { verdict: "false_positive" },
      { verdict: "accurate" },
    ],
    roleAssignments: [
      { userId: "u1", businessRole: "pm" },
      { userId: "u2", businessRole: "pmo" },
    ],
    roleActivities: [{ userId: "u1", businessRole: "pm", occurredAt: "2026-07-09T00:00:00Z" }],
  });

  assert.equal(metrics.find(item => item.key === "data_freshness_minutes")?.value, 30);
  assert.equal(metrics.find(item => item.key === "integration_success_rate")?.value, 66.7);
  assert.equal(metrics.find(item => item.key === "confirmation_queue_backlog")?.value, 1);
  assert.equal(metrics.find(item => item.key === "decision_sla_rate")?.value, 50);
  assert.equal(metrics.find(item => item.key === "action_closure_rate")?.value, 50);
  assert.equal(metrics.find(item => item.key === "ai_error_rate")?.value, 50);
  assert.equal(metrics.find(item => item.key === "role_adoption_rate")?.value, 50);

  const empty = buildOperationalMetrics({
    now: new Date("2026-07-10T12:00:00Z"),
    syncLogs: [], confirmations: [], decisions: [], actions: [], aiEvaluations: [], roleAssignments: [], roleActivities: [],
  });
  assert.ok(empty.every(item => item.availability === "unavailable"));
  assert.ok(empty.every(item => item.value === null));
});

test("P25 enterprise capabilities are explicit gates and never imply an untested integration", () => {
  const gates = buildEnterpriseCapabilityGates([
    { capabilityKey: "sso", status: "configured", evidence: [], lastTestedAt: null },
    { capabilityKey: "attachment_storage", status: "tested", evidence: [{ type: "test", id: "e1" }], lastTestedAt: "2026-07-10T00:00:00Z" },
  ]);
  assert.equal(gates.find(item => item.capabilityKey === "sso")?.enabled, false);
  assert.equal(gates.find(item => item.capabilityKey === "attachment_storage")?.enabled, false);
  assert.equal(gates.find(item => item.capabilityKey === "electronic_signature")?.status, "not_configured");
});

test("P25 migration API and page expose persistent operations without mock fallback", () => {
  const migrations = new URL("../supabase/migrations/", import.meta.url);
  const name = readdirSync(migrations).find(item => item.endsWith("_p25_operations_center.sql"));
  assert.ok(name);
  const sql = readFileSync(new URL(name, migrations), "utf8");
  for (const table of [
    "role_onboarding_states",
    "pilot_programs",
    "operational_metric_snapshots",
    "operational_incidents",
    "enterprise_capability_gates",
    "quarterly_value_reviews",
  ]) {
    assert.match(sql, new RegExp(`create table if not exists public\\.${table}`, "i"));
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`, "i"));
  }
  assert.match(sql, /idempotency_key text not null/i);
  assert.match(sql, /grant select,insert,update,delete[\s\S]*to service_role/i);
  const route = readFileSync("src/app/api/operations-center/route.ts", "utf8");
  const page = readFileSync("src/app/operations-center/page.tsx", "utf8");
  assert.match(route, /loadContextProjectIdentityMappings/);
  assert.match(route, /integration_sync_logs/);
  assert.match(route, /feishu_action_confirmations/);
  assert.match(route, /decision_briefs/);
  assert.match(route, /unified_action_items/);
  assert.match(route, /ai_assistant_evaluations/);
  assert.match(route, /golden_chain_runs/);
  assert.match(route, /PILOT_GOLDEN_CHAINS_NOT_PASSED/);
  assert.match(route, /\["A",\s*"B",\s*"C",\s*"D",\s*"E"\]/);
  assert.match(route, /OPERATIONS_SOURCE_TABLE_UNAVAILABLE/);
  assert.match(route, /IDEMPOTENCY_KEY_PAYLOAD_CONFLICT/);
  assert.doesNotMatch(route, /mock|demo|DEFAULT_/i);
  assert.match(page, /采用、可靠性与企业化运营中心/);
  assert.match(page, /首次使用向导/);
  assert.match(page, /黄金链路验收台/);
  assert.doesNotMatch(page, /placeholder="黄金链路结果/);
});
