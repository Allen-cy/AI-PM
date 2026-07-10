import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";

import {
  evaluateLifecycleTransition,
  canVerifyLifecycleEvidence,
  parseLifecycleEvidenceRegistration,
  parseLifecycleTransitionRequest,
  type EvidenceRequirement,
} from "../src/features/lifecycle-loop/domain.ts";
import {
  parseFeedbackCorrectionRequest,
  transitionFeedbackCorrection,
} from "../src/features/lifecycle-loop/corrections.ts";
import {
  buildFeedbackCorrectionInsert,
  mapLifecycleState,
} from "../src/features/lifecycle-loop/repository.ts";

const APPROVAL_REQUIREMENT: EvidenceRequirement = {
  id: "requirement-1",
  objectType: "project",
  fromStatus: "proposed",
  toStatus: "approved",
  evidenceType: "project_charter",
  minimumCount: 1,
  verifierRoles: ["pmo", "sponsor"],
  validityDays: 365,
  expiryAction: "block_transition",
  active: true,
};

test("lifecycle transition rejects state jumps and requires verified unexpired evidence", () => {
  assert.throws(() => evaluateLifecycleTransition({
    objectType: "project",
    currentStatus: "proposed",
    action: "activate",
    actorBusinessRole: "pm",
    requirements: [],
    evidence: [],
    now: new Date("2026-07-10T00:00:00.000Z"),
  }), /LIFECYCLE_TRANSITION_NOT_ALLOWED/);

  assert.throws(() => evaluateLifecycleTransition({
    objectType: "project",
    currentStatus: "proposed",
    action: "approve",
    actorBusinessRole: "pmo",
    requirements: [APPROVAL_REQUIREMENT],
    evidence: [],
    now: new Date("2026-07-10T00:00:00.000Z"),
  }), /LIFECYCLE_EVIDENCE_REQUIRED:project_charter/);

  assert.throws(() => evaluateLifecycleTransition({
    objectType: "project",
    currentStatus: "proposed",
    action: "approve",
    actorBusinessRole: "pmo",
    requirements: [APPROVAL_REQUIREMENT],
    evidence: [{
      id: "evidence-1",
      evidenceType: "project_charter",
      verifiedAt: "2026-07-01T00:00:00.000Z",
      validUntil: "2026-07-09T23:59:59.000Z",
      verifiedBy: "reviewer-1",
      verifiedByRole: "pmo",
    }],
    now: new Date("2026-07-10T00:00:00.000Z"),
  }), /LIFECYCLE_EVIDENCE_EXPIRED:project_charter/);
});

test("lifecycle transition returns an auditable plan only for authorized actor and complete evidence", () => {
  assert.throws(() => evaluateLifecycleTransition({
    objectType: "project",
    currentStatus: "proposed",
    action: "approve",
    actorBusinessRole: "pm",
    requirements: [APPROVAL_REQUIREMENT],
    evidence: [{
      id: "evidence-1",
      evidenceType: "project_charter",
      verifiedAt: "2026-07-01T00:00:00.000Z",
      validUntil: "2027-07-01T00:00:00.000Z",
      verifiedBy: "reviewer-1",
      verifiedByRole: "pmo",
    }],
    now: new Date("2026-07-10T00:00:00.000Z"),
  }), /LIFECYCLE_ACTOR_FORBIDDEN/);

  assert.deepEqual(evaluateLifecycleTransition({
    objectType: "project",
    currentStatus: "proposed",
    action: "approve",
    actorBusinessRole: "pmo",
    requirements: [APPROVAL_REQUIREMENT],
    evidence: [{
      id: "evidence-1",
      evidenceType: "project_charter",
      verifiedAt: "2026-07-01T00:00:00.000Z",
      validUntil: "2027-07-01T00:00:00.000Z",
      verifiedBy: "reviewer-1",
      verifiedByRole: "pmo",
    }],
    now: new Date("2026-07-10T00:00:00.000Z"),
  }), {
    fromStatus: "proposed",
    toStatus: "approved",
    action: "approve",
    requiredEvidenceTypes: ["project_charter"],
    acceptedEvidenceIds: ["evidence-1"],
  });
});

test("evidence verified by a role outside the requirement matrix cannot release the gate", () => {
  assert.throws(() => evaluateLifecycleTransition({
    objectType: "project",
    currentStatus: "proposed",
    action: "approve",
    actorBusinessRole: "pmo",
    requirements: [APPROVAL_REQUIREMENT],
    evidence: [{
      id: "evidence-1",
      evidenceType: "project_charter",
      verifiedAt: "2026-07-01T00:00:00.000Z",
      validUntil: "2027-07-01T00:00:00.000Z",
      verifiedBy: "reviewer-1",
      verifiedByRole: "pm",
    }],
    now: new Date("2026-07-10T00:00:00.000Z"),
  }), /LIFECYCLE_EVIDENCE_VERIFIER_FORBIDDEN:project_charter/);
});

test("all lifecycle object families expose explicit state machines", () => {
  const cases = [
    ["plan_baseline", "submitted", "approve", "approved"],
    ["deliverable", "submitted", "accept", "accepted"],
    ["change", "submitted", "approve", "approved"],
    ["reporting", "submitted", "freeze", "frozen"],
    ["closure", "submitted", "approve", "approved"],
  ] as const;
  for (const [objectType, currentStatus, action, toStatus] of cases) {
    assert.equal(evaluateLifecycleTransition({
      objectType,
      currentStatus,
      action,
      actorBusinessRole: "pmo",
      requirements: [],
      evidence: [],
      now: new Date("2026-07-10T00:00:00.000Z"),
    }).toStatus, toStatus);
  }
});

test("lifecycle transition request requires stable object identity and an idempotency key", () => {
  assert.deepEqual(parseLifecycleTransitionRequest({
    object_type: "deliverable",
    object_id: "deliverable-1",
    action: "submit",
    business_role: "pm",
    idempotency_key: "delivery:deliverable-1:submit:v1",
    comment: "交付物已完成内部复核",
    evidence_ids: ["evidence-1"],
  }), {
    objectType: "deliverable",
    objectId: "deliverable-1",
    action: "submit",
    businessRole: "pm",
    idempotencyKey: "delivery:deliverable-1:submit:v1",
    comment: "交付物已完成内部复核",
    evidenceIds: ["evidence-1"],
  });
  assert.throws(() => parseLifecycleTransitionRequest({ object_type: "project" }), /必填/);
});

test("evidence registration keeps source identity separate from human verification", () => {
  assert.deepEqual(parseLifecycleEvidenceRegistration({
    object_type: "project",
    object_id: "project-1",
    evidence_type: "project_charter",
    source_type: "feishu_drive",
    source_id: "file-1",
    source_url: "https://example.invalid/file-1",
    title: "项目章程v1",
    version: "1",
    valid_until: "2027-07-10T00:00:00.000Z",
  }), {
    objectType: "project",
    objectId: "project-1",
    evidenceType: "project_charter",
    sourceType: "feishu_drive",
    sourceId: "file-1",
    sourceUrl: "https://example.invalid/file-1",
    title: "项目章程v1",
    version: "1",
    validUntil: "2027-07-10T00:00:00.000Z",
  });
  assert.equal(canVerifyLifecycleEvidence("pm"), false);
  assert.equal(canVerifyLifecycleEvidence("pmo"), true);
  assert.equal(canVerifyLifecycleEvidence("business_owner"), true);
});

test("human correction input requires reason owner deadline proposal and resubmission path", () => {
  assert.deepEqual(parseFeedbackCorrectionRequest({
    project_id: "project-1",
    target_type: "management_signal",
    target_id: "signal-1",
    correction_type: "false_positive",
    reason_code: "SOURCE_FACT_INCORRECT",
    reason_detail: "飞书基线日期读取了历史版本",
    proposed_correction: { forecast_due_date: "2026-07-21" },
    correction_owner_user_id: "pm-1",
    due_at: "2026-07-12T09:00:00.000Z",
    resubmission_path: "/projects/project-1/lifecycle",
    business_role: "pm",
    idempotency_key: "signal-1:correction:source-fact:v1",
  }), {
    projectId: "project-1",
    targetType: "management_signal",
    targetId: "signal-1",
    correctionType: "false_positive",
    reasonCode: "SOURCE_FACT_INCORRECT",
    reasonDetail: "飞书基线日期读取了历史版本",
    proposedCorrection: { forecast_due_date: "2026-07-21" },
    correctionOwnerUserId: "pm-1",
    dueAt: "2026-07-12T09:00:00.000Z",
    resubmissionPath: "/projects/project-1/lifecycle",
    businessRole: "pm",
    idempotencyKey: "signal-1:correction:source-fact:v1",
  });
  assert.throws(() => parseFeedbackCorrectionRequest({
    project_id: "project-1",
    target_type: "management_signal",
    target_id: "signal-1",
    correction_type: "false_positive",
  }), /必填/);
});

test("feedback correction is human-reviewed and cannot silently close", () => {
  assert.equal(transitionFeedbackCorrection("submitted", "accept"), "correction_in_progress");
  assert.equal(transitionFeedbackCorrection("correction_in_progress", "submit_correction"), "pending_verification");
  assert.equal(transitionFeedbackCorrection("pending_verification", "verify"), "closed");
  assert.equal(transitionFeedbackCorrection("pending_verification", "request_rework"), "correction_in_progress");
  assert.equal(transitionFeedbackCorrection("submitted", "reject"), "rejected");
  assert.throws(() => transitionFeedbackCorrection("submitted", "verify"), /CORRECTION_TRANSITION_NOT_ALLOWED/);
});

test("lifecycle persistence preserves stable project scope and human correction ownership", () => {
  assert.deepEqual(mapLifecycleState({
    id: "state-1",
    org_id: "org-1",
    project_id: "project-1",
    object_type: "project",
    object_id: "project-1",
    status: "active",
    owner_user_id: "pm-1",
    due_at: null,
    data_class: "production",
    version: 3,
    metadata: {},
    created_at: "2026-07-01T00:00:00.000Z",
    updated_at: "2026-07-10T00:00:00.000Z",
  }), {
    id: "state-1",
    orgId: "org-1",
    projectId: "project-1",
    objectType: "project",
    objectId: "project-1",
    status: "active",
    ownerUserId: "pm-1",
    dueAt: null,
    dataClass: "production",
    version: 3,
    metadata: {},
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-10T00:00:00.000Z",
  });

  const payload = buildFeedbackCorrectionInsert({
    projectId: "project-1",
    targetType: "management_signal",
    targetId: "signal-1",
    correctionType: "false_positive",
    reasonCode: "SOURCE_FACT_INCORRECT",
    reasonDetail: "基线版本错误",
    proposedCorrection: { baseline_version: "v2" },
    correctionOwnerUserId: "pm-1",
    dueAt: "2026-07-12T09:00:00.000Z",
    resubmissionPath: "/projects/project-1/lifecycle",
    businessRole: "pm",
    idempotencyKey: "signal-1:correction:v1",
  }, { orgId: "org-1", submittedBy: "user-1" });
  assert.equal(payload.org_id, "org-1");
  assert.equal(payload.project_id, "project-1");
  assert.equal(payload.correction_owner_user_id, "pm-1");
  assert.equal(payload.status, "submitted");
  assert.equal(payload.idempotency_key, "signal-1:correction:v1");
});

test("P18 migration creates lifecycle correction and evidence-matrix tables as service-only RLS objects", () => {
  const migrationsDirectory = new URL("../supabase/migrations/", import.meta.url);
  const migrationName = readdirSync(migrationsDirectory).find(name => name.endsWith("_p18_lifecycle_feedback_evidence.sql"));
  assert.ok(migrationName);
  const sql = readFileSync(new URL(migrationName!, migrationsDirectory), "utf8");

  for (const table of [
    "project_lifecycle_states",
    "project_lifecycle_events",
    "feedback_correction_events",
    "evidence_requirements",
  ]) {
    assert.match(sql, new RegExp(`create table if not exists (?:public\\.)?${table}`, "i"));
    assert.match(sql, new RegExp(`alter table (?:public\\.)?${table} enable row level security`, "i"));
    assert.match(sql, new RegExp(`grant .* on (?:table )?(?:public\\.)?${table} to service_role`, "i"));
    assert.match(sql, new RegExp(`revoke all on (?:table )?(?:public\\.)?${table} from anon, authenticated`, "i"));
  }
  assert.match(sql, /create or replace function public\.transition_project_lifecycle_tx/i);
  assert.match(sql, /create or replace function public\.initialize_lifecycle_object_tx/i);
  assert.match(sql, /P18_STABLE_SOURCE_REQUIRED/i);
  assert.match(sql, /create or replace function public\.transition_feedback_correction_tx/i);
  assert.match(sql, /idempotency_key/i);
  assert.match(sql, /required_evidence_types/i);
  assert.match(sql, /evidence\.subject_id\s*=\s*v_state\.project_id::text/i);
  assert.match(sql, /evidence\.metadata->>'lifecycle_object_id'\s*=\s*v_state\.object_id/i);
  assert.doesNotMatch(sql, /create policy\s+"?public (read|insert|update|write)/i);
});

test("lifecycle APIs fail closed and never contain demo fallback data", () => {
  for (const path of [
    "../src/app/api/projects/[id]/lifecycle/route.ts",
    "../src/app/api/projects/[id]/lifecycle/transitions/route.ts",
    "../src/app/api/feedback-corrections/route.ts",
  ]) {
    const source = readFileSync(new URL(path, import.meta.url), "utf8");
    assert.match(source, /getCurrentUser/);
    assert.match(source, /fallback_used:\s*false/);
    assert.doesNotMatch(source, /(demo|mock|sample|DEFAULT_)/i);
  }
  const transition = readFileSync(new URL("../src/app/api/projects/[id]/lifecycle/transitions/route.ts", import.meta.url), "utf8");
  assert.match(transition, /expectedProjectId:\s*projectId/);
});

test("lifecycle workspace exposes state transition evidence and human correction operations", () => {
  const source = readFileSync(new URL("../src/app/projects/[id]/lifecycle/page.tsx", import.meta.url), "utf8");
  assert.match(source, /项目全生命周期纵向闭环/);
  assert.match(source, /lifecycle\/transitions/);
  assert.match(source, /lifecycle\/evidence/);
  assert.match(source, /api\/feedback-corrections/);
  assert.match(source, /证据门禁矩阵/);
  assert.match(source, /人工反馈与纠偏/);
  assert.match(source, /纳入生命周期/);
});
