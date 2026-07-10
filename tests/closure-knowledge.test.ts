import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import { canReviewClosureAssessment, evaluateClosureGate } from "../src/features/operating-model/closure-knowledge.ts";

test("closure gate blocks operational financial evidence and handover gaps", () => {
  const gate = evaluateClosureGate({ openTasks: 2, unacceptedDeliverables: 1, openHighRisks: 1, openIssues: 0, pendingChanges: 1, acceptanceEvidence: 0, outstandingReceivable: 100_000, archiveEvidence: 0, handoverEvidence: 0, benefitBaselineRequired: true, benefitBaselineCount: 0 });
  assert.equal(gate.ready, false);
  assert.equal(gate.blockers.length, 9);
  assert.ok(gate.blockers.some(item => item.code === "OUTSTANDING_RECEIVABLE"));
  assert.ok(gate.blockers.some(item => item.code === "KNOWLEDGE_HANDOVER_MISSING"));
});

test("closure gate passes only with all required facts and evidence", () => {
  const gate = evaluateClosureGate({ openTasks: 0, unacceptedDeliverables: 0, openHighRisks: 0, openIssues: 0, pendingChanges: 0, acceptanceEvidence: 1, outstandingReceivable: 0, archiveEvidence: 1, handoverEvidence: 1, benefitBaselineRequired: true, benefitBaselineCount: 1 });
  assert.equal(gate.ready, true); assert.deepEqual(gate.blockers, []);
});

test("formal closure approval requires a ready submitted assessment and an accountable reviewer", () => {
  assert.equal(canReviewClosureAssessment({ status: "submitted", ready: true, role: "pmo", currentGateReady: true }), true);
  assert.equal(canReviewClosureAssessment({ status: "submitted", ready: true, role: "pm", currentGateReady: true }), false);
  assert.equal(canReviewClosureAssessment({ status: "submitted", ready: true, role: "pmo", currentGateReady: false }), false);
  assert.equal(canReviewClosureAssessment({ status: "approved", ready: true, role: "sponsor", currentGateReady: true }), false);
});

test("P24 persists closure assessments knowledge candidates reuse and change impacts", () => {
  const migrations = new URL("../supabase/migrations/", import.meta.url); const name = readdirSync(migrations).find(item => item.endsWith("_p24_closure_knowledge_reuse.sql")); assert.ok(name);
  const sql = readFileSync(new URL(name, migrations), "utf8"); for (const table of ["project_closure_assessments", "knowledge_reuse_events", "knowledge_change_impact_links"]) assert.match(sql, new RegExp(`create table if not exists public\\.${table}`, "i"));
  const route = readFileSync("src/app/api/closure-knowledge/route.ts", "utf8"); const page = readFileSync("src/app/closure-knowledge/page.tsx", "utf8");
  assert.match(route, /loadContextProjectIdentityMappings/); assert.match(route, /review_closure/); assert.doesNotMatch(route, /mock|demo|DEFAULT_/i);
  assert.match(sql, /enforce_p24_project_close_gate/i); assert.match(page, /收尾门禁与知识复用中心/); assert.match(page, /知识候选/);
});
