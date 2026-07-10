import { createHash } from "node:crypto";

import { getAuthSupabase, getCurrentUser } from "@/features/auth/server";
import {
  GOLDEN_CHAIN_DEFINITIONS,
  buildGoldenChainReadiness,
  parseGoldenChainArtifactReferences,
  validateGoldenChainArtifactReferences,
  validateGoldenChainParticipantBindings,
  type GoldenChainKey,
  type GoldenChainParticipantBinding,
} from "@/features/operating-model/golden-chains";
import { resolveBusinessContext, type BusinessRole, type SubjectScope } from "@/features/operating-model/context";
import { authorizeBusinessOperation } from "@/features/operating-model/authorization-persistence";
import { listBusinessRoleAssignments, loadContextProjectIdentityMappings } from "@/features/operating-model/persistence";
import { writeOperationAudit } from "@/features/security/repository";

export const runtime = "nodejs";

const DATA_CLASSES = new Set(["production", "sample", "test", "diagnostic", "unclassified"]);
const CHAIN_KEYS = new Set<GoldenChainKey>(["A", "B", "C", "D", "E"]);
const BUSINESS_ROLES = new Set<BusinessRole>(["pm", "operations", "pmo", "ceo", "sponsor", "business_owner", "finance", "quality"]);
const SUBJECT_SCOPES = new Set<SubjectScope>(["project", "portfolio", "organization", "customer", "contract"]);

function json(body: unknown, status: number, requestId: string) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store", "X-Request-Id": requestId } });
}

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function hasSecret(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasSecret);
  if (!value || typeof value !== "object") return false;
  return Object.entries(value as Record<string, unknown>).some(([key, nested]) => /secret|token|password|api.?key|credential/i.test(key) || hasSecret(nested));
}

function requestFingerprint(value: unknown): string {
  function ordered(input: unknown): unknown {
    if (Array.isArray(input)) return input.map(ordered);
    if (!input || typeof input !== "object") return input;
    return Object.fromEntries(Object.entries(input as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, nested]) => [key, ordered(nested)]));
  }
  return createHash("sha256").update(JSON.stringify(ordered(value))).digest("hex");
}

async function scopeFor(request: Request) {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "UNAUTHORIZED", status: 401 } as const;
  const url = new URL(request.url);
  const role = text(url.searchParams.get("role")) as BusinessRole;
  const orgId = text(url.searchParams.get("org_id"));
  const subjectScope = text(url.searchParams.get("subject_scope")) as SubjectScope;
  const subjectId = text(url.searchParams.get("subject_id"));
  const dataClass = text(url.searchParams.get("data_class") || "production");
  const projectId = text(url.searchParams.get("project_id"));
  if (!BUSINESS_ROLES.has(role) || !orgId || !SUBJECT_SCOPES.has(subjectScope) || !subjectId || !DATA_CLASSES.has(dataClass) || !projectId) {
    return { ok: false, error: "GOLDEN_CHAIN_CONTEXT_REQUIRED", status: 400 } as const;
  }
  const assignments = await listBusinessRoleAssignments(user.id);
  if (assignments.status !== "succeeded") return { ok: false, error: "P17_STORAGE_NOT_CONFIGURED", detail: assignments.warning, status: 503 } as const;
  const context = resolveBusinessContext({
    user: { id: user.id, systemRole: user.role }, assignments: assignments.data ?? [],
    requestedRole: role, requestedOrgId: orgId, requestedSubjectScope: subjectScope, requestedSubjectId: subjectId,
  });
  if (!context) return { ok: false, error: "BUSINESS_CONTEXT_FORBIDDEN", status: 403 } as const;
  const mappings = await loadContextProjectIdentityMappings({ context, dataClass: dataClass as "production" | "sample" | "test" | "diagnostic" | "unclassified" });
  if (mappings.status !== "succeeded") return { ok: false, error: "PROJECT_SCOPE_MAPPING_FAILED", detail: mappings.warning, status: mappings.status === "not_configured" ? 503 : 500 } as const;
  if (!(mappings.data ?? []).some(item => item.projectId === projectId)) return { ok: false, error: "PROJECT_OUTSIDE_CONTEXT", status: 403 } as const;
  const project = await getAuthSupabase().from("projects").select("id,org_id,data_class,project_level,name,oa_no,status").eq("id", projectId).eq("org_id", orgId).eq("data_class", dataClass).maybeSingle();
  if (project.error) return { ok: false, error: "PROJECT_SCOPE_LOAD_FAILED", detail: project.error.message, status: 500 } as const;
  if (!project.data) return { ok: false, error: "PROJECT_NOT_FOUND", status: 404 } as const;
  const authorization = await authorizeBusinessOperation({
    user, context,
    request: { objectType: "project", action: "read", objectState: text(project.data.status) || "*", projectLevel: text(project.data.project_level) || "*", decisionLevel: "project", amount: null },
    resourceId: projectId, requestId: crypto.randomUUID(),
  });
  if (authorization.status !== "succeeded") return { ok: false, error: "AUTHORIZATION_POLICY_UNAVAILABLE", detail: authorization.warning, status: authorization.status === "not_configured" ? 503 : 500 } as const;
  if (!authorization.decision.allowed) return { ok: false, error: "PROJECT_READ_FORBIDDEN", denialCode: authorization.decision.code, status: 403 } as const;
  return { ok: true, user, role, context, dataClass, projectId, project: project.data } as const;
}

type Scope = Extract<Awaited<ReturnType<typeof scopeFor>>, { ok: true }>;

async function authorizeMutation(scope: Scope, action: "create" | "execute" | "verify", state: string, resourceId: string, requestId: string) {
  return authorizeBusinessOperation({
    user: scope.user, context: scope.context,
    request: { objectType: "golden_chain", action, objectState: state || "*", projectLevel: text(scope.project.project_level) || "*", decisionLevel: "project", amount: null },
    resourceId, requestId,
  });
}

async function loadRunBundle(scope: Scope, runId: string) {
  const supabase = getAuthSupabase();
  const run = await supabase.from("golden_chain_runs").select("*").eq("id", runId).eq("org_id", scope.context.orgId).eq("project_id", scope.projectId).eq("data_class", scope.dataClass).maybeSingle();
  if (run.error) throw run.error;
  if (!run.data) return null;
  const [participants, steps, failurePaths, events] = await Promise.all([
    supabase.from("golden_chain_run_participants").select("*").eq("run_id", runId).eq("org_id", scope.context.orgId).eq("project_id", scope.projectId).eq("data_class", scope.dataClass).order("created_at"),
    supabase.from("golden_chain_steps").select("*").eq("run_id", runId).eq("org_id", scope.context.orgId).eq("project_id", scope.projectId).eq("data_class", scope.dataClass).order("sequence_no"),
    supabase.from("golden_chain_failure_paths").select("*").eq("run_id", runId).eq("org_id", scope.context.orgId).eq("project_id", scope.projectId).eq("data_class", scope.dataClass).order("created_at"),
    supabase.from("golden_chain_events").select("*").eq("run_id", runId).eq("org_id", scope.context.orgId).eq("project_id", scope.projectId).eq("data_class", scope.dataClass).order("created_at", { ascending: false }).limit(300),
  ]);
  const error = participants.error || steps.error || failurePaths.error || events.error;
  if (error) throw error;
  return { run: run.data, participants: participants.data ?? [], steps: steps.data ?? [], failure_paths: failurePaths.data ?? [], events: events.data ?? [] };
}

async function loadDataset(scope: Scope, requestedRunId = "") {
  const supabase = getAuthSupabase();
  const [runs, assignments] = await Promise.all([
    supabase.from("golden_chain_runs").select("*").eq("org_id", scope.context.orgId).eq("project_id", scope.projectId).eq("data_class", scope.dataClass).order("updated_at", { ascending: false }).limit(50),
    supabase.from("user_business_roles").select("id,user_id,business_role,subject_scope,subject_id,valid_from,valid_until,status").eq("org_id", scope.context.orgId).eq("status", "active"),
  ]);
  const error = runs.error || assignments.error;
  if (error) throw error;
  const userIds = [...new Set((assignments.data ?? []).map(item => String(item.user_id)))];
  const users = userIds.length > 0
    ? await supabase.from("app_users").select("id,name").in("id", userIds)
    : { data: [], error: null };
  if (users.error) throw users.error;
  const nameById = new Map((users.data ?? []).map(item => [String(item.id), text(item.name) || "未命名用户"]));
  const now = Date.now();
  const participantCandidates = (assignments.data ?? []).filter(item => {
    const starts = new Date(String(item.valid_from)).getTime();
    const ends = item.valid_until ? new Date(String(item.valid_until)).getTime() : null;
    return Number.isFinite(starts) && starts <= now && (ends === null || (Number.isFinite(ends) && ends >= now));
  }).map(item => ({
    assignment_id: item.id, user_id: item.user_id, user_name: nameById.get(String(item.user_id)) || "未命名用户",
    business_role: item.business_role, subject_scope: item.subject_scope, subject_id: item.subject_id,
  }));
  const runId = requestedRunId || text(runs.data?.[0]?.id);
  const selected = runId ? await loadRunBundle(scope, runId) : null;
  return { runs: runs.data ?? [], selected, participant_candidates: participantCandidates };
}

function parseParticipants(value: unknown): GoldenChainParticipantBinding[] {
  if (!Array.isArray(value)) throw new Error("PARTICIPANTS_ARRAY_REQUIRED");
  return value.map(item => {
    const row = object(item);
    return { businessRole: text(row.business_role ?? row.businessRole) as BusinessRole, userId: text(row.user_id ?? row.userId), assignmentId: text(row.assignment_id ?? row.assignmentId) };
  });
}

function parseFailureEvidence(value: unknown) {
  if (!Array.isArray(value) || value.length === 0) throw new Error("FAILURE_PATH_STRUCTURED_EVIDENCE_REQUIRED");
  return value.map(item => {
    const row = object(item);
    const evidence = { type: text(row.type), id: text(row.id), source: text(row.source), observedAt: text(row.observedAt ?? row.observed_at) };
    if (!evidence.type || !evidence.id || !evidence.source || !Number.isFinite(new Date(evidence.observedAt).getTime())) throw new Error("FAILURE_PATH_STRUCTURED_EVIDENCE_REQUIRED");
    if (hasSecret(row)) throw new Error("EVIDENCE_SECRET_METADATA_FORBIDDEN");
    return evidence;
  });
}

function readinessFrom(bundle: NonNullable<Awaited<ReturnType<typeof loadRunBundle>>>) {
  const key = text(bundle.run.chain_key) as GoldenChainKey;
  return buildGoldenChainReadiness(key, {
    dataClass: text(bundle.run.data_class), sourceSnapshotAt: bundle.run.source_snapshot_at ? text(bundle.run.source_snapshot_at) : null,
    participantRoles: bundle.participants.map(item => text(item.business_role)),
    steps: bundle.steps.map(item => ({
      key: text(item.step_key), status: text(item.status),
      artifactReferences: parseGoldenChainArtifactReferences(item.artifact_references),
    })),
    failurePathResults: bundle.failure_paths.map(item => ({ key: text(item.path_key), status: text(item.status), evidence: Array.isArray(item.evidence) ? item.evidence : [] })),
  });
}

export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  const scope = await scopeFor(request);
  if (!scope.ok) return json({ error: scope.error, detail: "detail" in scope ? scope.detail : undefined, denial_code: "denialCode" in scope ? scope.denialCode : undefined, request_id: requestId }, scope.status, requestId);
  try {
    const runId = text(new URL(request.url).searchParams.get("run_id"));
    const dataset = await loadDataset(scope, runId);
    const readiness = dataset.selected ? readinessFrom(dataset.selected) : null;
    await writeOperationAudit({ user: scope.user, action: "golden_chain_read", resourceType: "golden_chain_run", resourceId: runId || scope.projectId, status: "succeeded", summary: "读取黄金链路验收数据", detail: { context: scope.context, projectId: scope.projectId, dataClass: scope.dataClass }, requestId });
    return json({ status: "succeeded", context: scope.context, data_class: scope.dataClass, project: scope.project, definitions: GOLDEN_CHAIN_DEFINITIONS, ...dataset, readiness, source: { type: "supabase", fallback_used: false }, request_id: requestId }, 200, requestId);
  } catch (error) {
    return json({ error: "GOLDEN_CHAIN_STORAGE_UNAVAILABLE", detail: error instanceof Error ? error.message : "unknown", required_migration: "20260710220000_p25_golden_chain_execution.sql", request_id: requestId }, 503, requestId);
  }
}

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  const scope = await scopeFor(request);
  if (!scope.ok) return json({ error: scope.error, detail: "detail" in scope ? scope.detail : undefined, denial_code: "denialCode" in scope ? scope.denialCode : undefined, request_id: requestId }, scope.status, requestId);
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; } catch { return json({ error: "INVALID_JSON", request_id: requestId }, 400, requestId); }
  const operation = text(body.operation);
  const runId = text(body.run_id);
  const expectedStatus = text(body.expected_status);
  const expectedVersion = Number(body.expected_version);
  const actionKind: "create" | "execute" | "verify" = operation === "create_run" ? "create"
    : operation === "transition_step" && ["verify", "reject"].includes(text(body.action)) ? "verify"
      : operation === "transition_failure_path" && ["verify_pass", "verify_fail"].includes(text(body.action)) ? "verify"
        : operation === "transition_run" && ["pass", "fail"].includes(text(body.action)) ? "verify" : "execute";
  const authorization = await authorizeMutation(scope, actionKind, expectedStatus || "draft", runId || scope.projectId, requestId);
  if (authorization.status !== "succeeded") return json({ error: "AUTHORIZATION_POLICY_UNAVAILABLE", detail: authorization.warning, request_id: requestId }, authorization.status === "not_configured" ? 503 : 500, requestId);
  if (!authorization.decision.allowed) return json({ error: "GOLDEN_CHAIN_OPERATION_FORBIDDEN", denial_code: authorization.decision.code, request_id: requestId }, 403, requestId);

  const supabase = getAuthSupabase();
  try {
    let resourceId = runId;
    if (operation === "create_run") {
      const chainKey = text(body.chain_key) as GoldenChainKey;
      if (!CHAIN_KEYS.has(chainKey)) return json({ error: "GOLDEN_CHAIN_KEY_INVALID", request_id: requestId }, 400, requestId);
      const participants = parseParticipants(body.participants);
      const participantErrors = validateGoldenChainParticipantBindings(chainKey, participants);
      if (participantErrors.length > 0) return json({ error: "GOLDEN_CHAIN_PARTICIPANTS_INVALID", blockers: participantErrors, request_id: requestId }, 400, requestId);
      const definition = GOLDEN_CHAIN_DEFINITIONS[chainKey];
      const idempotencyKey = text(body.idempotency_key);
      if (!idempotencyKey) return json({ error: "GOLDEN_CHAIN_IDEMPOTENCY_REQUIRED", request_id: requestId }, 400, requestId);
      const sourceSnapshotAt = text(body.source_snapshot_at);
      if (sourceSnapshotAt && !Number.isFinite(new Date(sourceSnapshotAt).getTime())) return json({ error: "SOURCE_SNAPSHOT_INVALID", request_id: requestId }, 400, requestId);
      const fingerprintInput = { projectId: scope.projectId, chainKey, dataClass: scope.dataClass, sourceSnapshotAt: sourceSnapshotAt || null, participants: [...participants].sort((left, right) => left.businessRole.localeCompare(right.businessRole)) };
      const created = await supabase.rpc("create_golden_chain_run_tx", {
        p_org_id: scope.context.orgId, p_project_id: scope.projectId, p_chain_key: chainKey, p_data_class: scope.dataClass,
        p_source_snapshot_at: sourceSnapshotAt || null,
        p_participants: participants.map(item => ({ businessRole: item.businessRole, userId: item.userId, assignmentId: item.assignmentId })),
        p_steps: definition.steps.map(step => ({ key: step.key, label: step.label, actorRoles: step.actorRoles, requiredArtifactTypes: step.requiredArtifactTypes })),
        p_failure_paths: definition.failurePaths.map(path => ({ key: path.key, label: path.label })),
        p_actor_user_id: scope.user.id, p_actor_business_role: scope.role, p_actor_assignment_id: scope.context.assignmentId,
        p_idempotency_key: idempotencyKey, p_request_fingerprint: requestFingerprint(fingerprintInput), p_request_id: text(body.request_id) || requestId,
      });
      if (created.error) throw created.error;
      resourceId = text(object(object(created.data).run).id);
    } else if (operation === "transition_step") {
      const stepId = text(body.step_id); const action = text(body.action);
      if (!stepId || !expectedStatus || !Number.isInteger(expectedVersion) || expectedVersion < 1 || !["start", "submit", "verify", "reject", "retry"].includes(action)) return json({ error: "GOLDEN_CHAIN_STEP_INPUT_REQUIRED", request_id: requestId }, 400, requestId);
      let references: ReturnType<typeof parseGoldenChainArtifactReferences> = [];
      if (action === "submit") {
        references = parseGoldenChainArtifactReferences(body.artifact_references);
        const referenceErrors = validateGoldenChainArtifactReferences(references, scope.dataClass);
        if (referenceErrors.length > 0) return json({ error: "GOLDEN_CHAIN_ARTIFACTS_INVALID", blockers: referenceErrors, request_id: requestId }, 400, requestId);
      }
      const transitioned = await supabase.rpc("transition_golden_chain_step_tx", {
        p_step_id: stepId, p_expected_status: expectedStatus, p_expected_version: expectedVersion, p_action: action,
        p_actor_user_id: scope.user.id, p_actor_business_role: scope.role, p_artifact_references: references,
        p_comment: text(body.comment) || null, p_request_id: text(body.request_id) || `${stepId}:${action}:${expectedVersion}`,
      });
      if (transitioned.error) throw transitioned.error;
    } else if (operation === "transition_failure_path") {
      const failurePathId = text(body.failure_path_id); const action = text(body.action);
      if (!failurePathId || !expectedStatus || !Number.isInteger(expectedVersion) || expectedVersion < 1 || !["submit", "verify_pass", "verify_fail", "retry"].includes(action)) return json({ error: "GOLDEN_CHAIN_FAILURE_PATH_INPUT_REQUIRED", request_id: requestId }, 400, requestId);
      const evidence = action === "submit" ? parseFailureEvidence(body.evidence) : [];
      const transitioned = await supabase.rpc("verify_golden_chain_failure_path_tx", {
        p_failure_path_id: failurePathId, p_expected_status: expectedStatus, p_expected_version: expectedVersion, p_action: action,
        p_actor_user_id: scope.user.id, p_actor_business_role: scope.role, p_evidence: evidence,
        p_comment: text(body.comment) || null, p_request_id: text(body.request_id) || `${failurePathId}:${action}:${expectedVersion}`,
      });
      if (transitioned.error) throw transitioned.error;
    } else if (operation === "transition_run") {
      const action = text(body.action);
      if (!runId || !expectedStatus || !Number.isInteger(expectedVersion) || expectedVersion < 1 || !["prepare", "start", "submit_verification", "pass", "fail", "block", "resume", "cancel", "retry"].includes(action)) return json({ error: "GOLDEN_CHAIN_RUN_INPUT_REQUIRED", request_id: requestId }, 400, requestId);
      if (action === "pass") {
        const bundle = await loadRunBundle(scope, runId);
        if (!bundle) return json({ error: "GOLDEN_CHAIN_RUN_NOT_FOUND", request_id: requestId }, 404, requestId);
        const readiness = readinessFrom(bundle);
        if (!readiness.canPass) return json({ error: "GOLDEN_CHAIN_NOT_READY", blockers: readiness.blockers, request_id: requestId }, 409, requestId);
      }
      const sourceSnapshotAt = text(body.source_snapshot_at);
      const transitioned = await supabase.rpc("transition_golden_chain_run_tx", {
        p_run_id: runId, p_expected_status: expectedStatus, p_expected_version: expectedVersion, p_action: action,
        p_actor_user_id: scope.user.id, p_actor_business_role: scope.role,
        p_source_snapshot_at: sourceSnapshotAt || null, p_reason: text(body.reason) || null,
        p_request_id: text(body.request_id) || `${runId}:${action}:${expectedVersion}`,
      });
      if (transitioned.error) throw transitioned.error;
    } else {
      return json({ error: "UNSUPPORTED_OPERATION", request_id: requestId }, 400, requestId);
    }
    const dataset = await loadDataset(scope, resourceId);
    await writeOperationAudit({ user: scope.user, action: `golden_chain_${operation}`, resourceType: "golden_chain_run", resourceId: resourceId || scope.projectId, status: "succeeded", severity: "medium", summary: `黄金链路动作已保存：${operation}`, detail: { context: scope.context, projectId: scope.projectId, dataClass: scope.dataClass, operation, action: text(body.action) || null }, requestId });
    return json({ status: "succeeded", ...dataset, readiness: dataset.selected ? readinessFrom(dataset.selected) : null, source: { type: "supabase", fallback_used: false }, request_id: requestId }, operation === "create_run" ? 201 : 200, requestId);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "unknown";
    const status = /NOT_FOUND/i.test(detail) ? 404 : /FORBIDDEN|ROLE_|ASSIGNMENT|PARTICIPANT|INDEPENDENT/i.test(detail) ? 403 : /CONFLICT|TRANSITION|NOT_READY|NOT_VERIFIED|REQUIRED|INVALID|MISMATCH|MISSING|PRODUCTION_DATA/i.test(detail) ? 409 : /does not exist|schema cache/i.test(detail) ? 503 : 500;
    return json({ error: "GOLDEN_CHAIN_OPERATION_FAILED", detail, required_migration: status === 503 ? "20260710220000_p25_golden_chain_execution.sql" : undefined, request_id: requestId }, status, requestId);
  }
}
