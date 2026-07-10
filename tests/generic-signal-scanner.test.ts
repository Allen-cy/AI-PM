import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { evaluateMetricSignal, parseProjectLevelMetricSignalRules } from "../src/features/operating-model/signal-scanner.ts";

test("P18 generic scanner evaluates cost cash benefit and other rule-backed signals", () => {
  const signal = evaluateMetricSignal({
    observationId: "o-1", orgId: "org-1", projectId: "p-1", projectLevel: "A", dataClass: "production",
    metricKey: "eac_variance_percent", currentValue: 18, baselineValue: 0, latestForecastValue: 18,
    periodKey: "2026-07", observedAt: "2026-07-10T08:00:00Z", freshnessStatus: "fresh", trustStatus: "trusted",
    sourceType: "finance", sourceId: "cost-1", ownerUserId: "pm-1",
  }, {
    version: "COST-v1", signalType: "cost", metricKey: "eac_variance_percent", comparison: "greater_than",
    yellowThreshold: 10, redThreshold: 15, routeOnYellow: "action", routeOnRed: "escalation", reviewAfterMinutes: 1440,
  }, new Date("2026-07-10T09:00:00Z"));
  assert.equal(signal?.severity, "critical");
  assert.equal(signal?.route, "escalation");
  assert.equal(signal?.dedupKey, "cost:project:p-1:2026-07");
  assert.equal(signal?.ownerUserId, "pm-1");
});

test("P18 stale or untrusted observations become data-quality signals instead of green business signals", () => {
  const signal = evaluateMetricSignal({
    observationId: "o-2", orgId: "org-1", projectId: "p-1", projectLevel: "S", dataClass: "production",
    metricKey: "cash_received", currentValue: 100, baselineValue: 100, latestForecastValue: 100,
    periodKey: "2026-07", observedAt: "2026-07-01T00:00:00Z", freshnessStatus: "stale", trustStatus: "untrusted",
    sourceType: "finance", sourceId: "cash-1", ownerUserId: "finance-1",
  }, { version: "CASH-v1", signalType: "cash", metricKey: "cash_received", comparison: "less_than", yellowThreshold: 90, redThreshold: 70, routeOnYellow: "action", routeOnRed: "escalation", reviewAfterMinutes: 60 }, new Date("2026-07-10T09:00:00Z"));
  assert.equal(signal?.signalType, "data_quality");
  assert.equal(signal?.trustStatus, "untrusted");
  assert.equal(signal?.route, "action");
});

test("P18 scanner refuses signals without an accountable owner", () => {
  assert.throws(() => evaluateMetricSignal({ observationId:"o",orgId:"org",projectId:"p",projectLevel:"B",dataClass:"production",metricKey:"risk",currentValue:5,baselineValue:0,latestForecastValue:5,periodKey:"2026-W28",observedAt:"2026-07-10T00:00:00Z",freshnessStatus:"fresh",trustStatus:"trusted",sourceType:"risk",sourceId:"r",ownerUserId:null }, { version:"RISK-v1",signalType:"risk",metricKey:"risk",comparison:"greater_than",yellowThreshold:3,redThreshold:4,routeOnYellow:"action",routeOnRed:"escalation",reviewAfterMinutes:60 }, new Date()));
});

test("P18 scanner consumes the active P20 project-level rule matrix", () => {
  const rules = parseProjectLevelMetricSignalRules({
    matrixVersion: "PMO-2026-07",
    projectLevel: "A",
    rules: {
      A: { signalRules: [
        { signalType: "cost", metricKey: "eac_variance_percent", metricVersion: "v2", comparison: "greater_than", yellowThreshold: 10, redThreshold: 15, dataFreshnessHours: 24, escalationLevel: "L3" },
        { signalType: "cash", metricKey: "cash_collection_rate", metricVersion: "v1", comparison: "less_than", yellowThreshold: 90, redThreshold: 70, dataFreshnessHours: 48, escalationLevel: "L2" },
        { signalType: "milestone_delay", metricKey: "milestone_schedule_variance", metricVersion: "v1", comparison: "greater_than", yellowThreshold: 2, redThreshold: 5, dataFreshnessHours: 24, escalationLevel: "L2" },
      ] },
    },
  });
  assert.equal(rules.length, 2);
  assert.equal(rules[0].version, "PMO-2026-07:A:cost:eac_variance_percent:v2");
  assert.equal(rules[0].routeOnRed, "escalation");
  assert.equal(rules[1].comparison, "less_than");
  assert.equal(rules[1].yellowThreshold, 90);
  assert.equal(rules[1].redThreshold, 70);
});

test("P18 generic signal scan API is scoped, rule-backed and transactional", () => {
  const route = readFileSync("src/app/api/management/signals/scan/route.ts", "utf8");
  const sql = readFileSync("supabase/migrations/20260710130000_p17_p18_operating_contracts.sql", "utf8");
  assert.match(route, /loadContextProjectIdentityMappings/);
  assert.match(route, /management_rule_versions/);
  assert.match(route, /project_level_rule_matrices/);
  assert.match(route, /metric_observations/);
  assert.match(route, /upsert_generic_management_signal_tx/);
  assert.match(route, /fallback_used\s*:\s*false/);
  assert.match(sql, /create or replace function public\.upsert_generic_management_signal_tx/i);
  const pmoPage = readFileSync("src/app/pmo/control-center/page.tsx", "utf8");
  assert.match(pmoPage, /\/api\/management\/signals\/scan/);
});
