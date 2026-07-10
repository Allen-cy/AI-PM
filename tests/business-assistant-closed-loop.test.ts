import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildPmOperationsJointChecks, materializeCadenceOccurrences } from "../src/features/operating-assistant/joint-checks.ts";

test("P19 joint check links delivery acceptance billing receivable and delay cash impact by project id", () => {
  const result = buildPmOperationsJointChecks({
    evaluatedAt: "2026-07-10T09:00:00+08:00",
    pm: {
      projects: [{ projectId: "p-1", projectName: "重点项目", externalProjectCode: "P001", commitment: { customerDueDate: "2026-07-20", forecastDueDate: "2026-08-10", status: "执行中", progress: 80, sourceRecordId: "pr-1" } }],
      milestones: [{ projectId: "p-1", projectName: "重点项目", sourceRecordId: "m-1", name: "上线", baselineDate: "2026-07-15", forecastDate: "2026-07-18", status: "已完成", owner: "PM" }],
    },
    operations: {
      acceptances: [{ projectId: "p-1", projectName: "重点项目", sourceRecordId: "pr-1", status: "待验收", plannedDate: "2026-07-21", actualDate: null }],
      invoices: [],
      receivables: [{ projectId: "p-1", projectName: "重点项目", sourceRecordId: "pay-1", contractCode: "C001", receivableAmount: 100, collectedAmount: 0, outstandingAmount: 100, plannedCollectionDate: "2026-08-01" }],
    },
  });
  assert.deepEqual(result.items.map(item => item.checkType).sort(), ["delay_cash_impact", "delivery_acceptance_gap"]);
  assert.equal(result.items.every(item => item.projectId === "p-1" && item.factReferences.length >= 2), true);
  assert.equal(result.dataGaps.length, 0);
});

test("P19 joint check reports missing operating facts instead of returning green", () => {
  const result = buildPmOperationsJointChecks({ evaluatedAt: "2026-07-10T09:00:00Z", pm: { projects: [], milestones: [] }, operations: { acceptances: [], invoices: [], receivables: [] } });
  assert.equal(result.items.length, 0);
  assert.equal(result.dataGaps.length > 0, true);
});

test("P19 operating calendar materializes daily weekly monthly and event work without fixed sample tasks", () => {
  const result = materializeCadenceOccurrences([
    { id: "d", cadenceType: "daily", dayOfWeek: null, dayOfMonth: null, eventKey: null },
    { id: "w", cadenceType: "weekly", dayOfWeek: 5, dayOfMonth: null, eventKey: null },
    { id: "m", cadenceType: "monthly", dayOfWeek: null, dayOfMonth: 10, eventKey: null },
    { id: "e", cadenceType: "event", dayOfWeek: null, dayOfMonth: null, eventKey: "milestone_changed" },
  ], new Date("2026-07-10T08:00:00+08:00"), ["milestone_changed"]);
  assert.deepEqual(result.map(item => item.definitionId).sort(), ["d", "e", "m", "w"]);
});

test("P19 joint-check and operating-calendar persistence are scoped and action producing", () => {
  const sql = readFileSync("supabase/migrations/20260710131000_p19_joint_checks_calendar.sql", "utf8");
  for (const table of ["business_joint_check_runs", "business_joint_check_items", "business_operating_cadences", "business_operating_occurrences"])
    assert.match(sql, new RegExp(`create table if not exists public\\.${table}`, "i"));
  assert.match(sql, /create or replace function public\.transition_business_joint_check_tx/i);
  assert.match(sql, /unified_action_items/i);
  assert.match(sql, /create or replace function public\.materialize_business_operating_calendar_tx/i);
  const route = readFileSync("src/app/api/business-assistant/operations-loop/route.ts", "utf8");
  const page = readFileSync("src/app/business-assistant/operations-loop/page.tsx", "utf8");
  assert.match(route, /resolveBusinessAssistantAccess/);
  assert.match(route, /fallback_used: false/);
  assert.match(page, /PM 与运营联合检查/);
  assert.match(page, /日\/周\/月\/事件运行日历/);
});

