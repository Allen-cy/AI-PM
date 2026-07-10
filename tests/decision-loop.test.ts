import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  canPerformDecisionOperation,
  parseDecisionBriefInput,
  transitionDecisionBrief,
  validateDecisionOutcome,
  type DecisionBriefStatus,
} from "../src/features/decisions/domain.ts";

const ROOT = process.cwd();

test("PMO can submit a complete decision package but cannot decide it", () => {
  assert.equal(canPerformDecisionOperation("pmo", "submit"), true);
  assert.equal(canPerformDecisionOperation("pmo", "decide"), false);
  assert.equal(transitionDecisionBrief("draft", "submit"), "submitted");
});

test("CEO can decide only a submitted package", () => {
  assert.equal(canPerformDecisionOperation("ceo", "decide"), true);
  assert.equal(transitionDecisionBrief("submitted", "decide"), "decided");
  assert.throws(() => transitionDecisionBrief("draft", "decide"), /draft/);
});

test("decision package requires options, recommendation, evidence and requested deadline", () => {
  assert.throws(() => parseDecisionBriefInput({ title: "是否投资" }), /备选方案/);
  const parsed = parseDecisionBriefInput({
    title: "是否投资",
    decisionQuestion: "是否进入下一阶段？",
    options: [{ key: "A", label: "继续", consequences: "增加投入" }, { key: "B", label: "暂停", consequences: "延后收益" }],
    recommendation: "A",
    evidence: [{ source_type: "reporting_snapshot", source_id: "snapshot-1", title: "月度经营快照" }],
    requestedDecisionAt: "2026-07-12T10:00:00+08:00",
    executionDueAt: "2026-07-20T18:00:00+08:00",
    acceptanceCriteria: "资源调整完成并恢复里程碑预测",
    impactSummary: "影响回款与关键里程碑",
  });
  assert.equal(parsed.options.length, 2);
  assert.equal(parsed.recommendation, "A");
});

test("CEO outcome must identify an option unless deferred", () => {
  assert.throws(() => validateDecisionOutcome({ outcome: "approved", selectedOptionKey: "" }), /选定方案/);
  assert.doesNotThrow(() => validateDecisionOutcome({ outcome: "deferred", selectedOptionKey: "", rationale: "等待客户确认" }));
});

test("distribution and closure require receipt and effect-review gates", () => {
  let status: DecisionBriefStatus = transitionDecisionBrief("decided", "distribute");
  assert.equal(status, "distributed");
  assert.throws(() => transitionDecisionBrief(status, "close"), /效果复核/);
  status = transitionDecisionBrief(status, "submit_effect_review");
  assert.equal(status, "effect_review_pending");
  status = transitionDecisionBrief(status, "approve_effect_review");
  assert.equal(status, "effect_reviewed");
  assert.equal(transitionDecisionBrief(status, "close"), "closed");
});

test("PMO accepts upward reporting while execution roles must acknowledge before effect review", () => {
  assert.equal(canPerformDecisionOperation("pmo", "accept_report"), true);
  assert.equal(canPerformDecisionOperation("pm", "accept_report"), false);
  const source = fs.readFileSync(path.join(ROOT, "src/features/decisions/persistence.ts"), "utf8");
  assert.match(source, /DECISION_RECEIPT_ACK_REQUIRED/);
});

test("P21/P22 migration creates real reporting, meeting, decision, receipt and review stores with service-only grants", () => {
  const migrationDir = path.join(ROOT, "supabase/migrations");
  const migration = fs.readdirSync(migrationDir)
    .filter(name => name.includes("p21_p22_decision_loop"))
    .map(name => fs.readFileSync(path.join(migrationDir, name), "utf8"))
    .join("\n");
  for (const table of ["reporting_snapshots", "governance_meetings", "decision_briefs", "decisions", "decision_receipts", "decision_effect_reviews"]) {
    assert.match(migration, new RegExp(`create table if not exists public\\.${table}`));
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`));
  }
  assert.match(migration, /revoke all on table public\.decision_briefs from anon, authenticated/i);
  assert.match(migration, /grant select, insert, update, delete on table public\.decision_briefs to service_role/i);
  assert.match(migration, /alter table public\.management_escalations[\s\S]*decision_brief_id/i);
  assert.match(migration, /update public\.management_escalations set status='resolved'/i);
  assert.match(migration, /action_item_id uuid references public\.unified_action_items/i);
  assert.match(migration, /insert into public\.unified_action_items/i);
  assert.match(migration, /create or replace function public\.transition_decision_action_tx/i);
  assert.match(migration, /DECISION_EXECUTION_EVIDENCE_REQUIRED/i);
});

test("PMO decision packages consume only assigned pending management escalations", () => {
  const source = fs.readFileSync(path.join(ROOT, "src/features/decisions/persistence.ts"), "utf8");
  assert.match(source, /from\("management_escalations"\)/);
  assert.match(source, /target_user_id/);
  assert.match(source, /brief_created/);
});

test("a disputed downstream receipt can be acknowledged after resolution instead of deadlocking closure", () => {
  const source = fs.readFileSync(path.join(ROOT, "src/features/decisions/persistence.ts"), "utf8");
  const migration = fs.readdirSync(path.join(ROOT, "supabase/migrations")).filter(name => name.includes("p21_p22_decision_loop")).map(name => fs.readFileSync(path.join(ROOT, "supabase/migrations", name), "utf8")).join("\n");
  assert.match(source, /acknowledge_decision_receipt_tx/);
  assert.match(migration, /v_receipt\.status not in \('pending','disputed'\)/);
});

test("decision APIs require authenticated users and explicit business-role authorization", () => {
  const routePaths = [
    "src/app/api/decisions/route.ts",
    "src/app/api/decisions/[id]/route.ts",
    "src/app/api/reporting/snapshots/route.ts",
    "src/app/api/governance/meetings/route.ts",
  ];
  for (const routePath of routePaths) {
    const source = fs.readFileSync(path.join(ROOT, routePath), "utf8");
    assert.match(source, /requireAuthenticatedApiUser/);
    assert.match(source, /listBusinessRoleAssignments/);
    assert.match(source, /canPerformDecisionOperation|canPerformBusinessAction/);
    assert.doesNotMatch(source, /mock|demo|sample data|DEFAULT_/i);
  }
});

test("decision center exposes the six-step loop and records meeting outputs through real APIs", () => {
  const source = fs.readFileSync(path.join(ROOT, "src/app/decision-center/page.tsx"), "utf8");
  for (const label of ["业务快照", "PMO会议", "决策包", "CEO决策", "下行回执", "效果复核"]) assert.match(source, new RegExp(label));
  assert.match(source, /api\/reporting\/snapshots/);
  assert.match(source, /api\/governance\/meetings/);
  assert.match(source, /action:\s*"record"/);
  assert.match(source, /api\/decisions/);
  assert.match(source, /start_execution/);
  assert.match(source, /submit_execution_evidence/);
});
