import { getAuthSupabase, isAuthStorageConfigured, type AppUser } from "../auth/server.ts";
import type { BusinessRole } from "../operating-model/context.ts";
import type { PersistenceResult } from "../operating-model/persistence.ts";
import { writeOperationAudit } from "../security/repository.ts";
import {
  canTransitionFeedbackCorrection,
  transitionFeedbackCorrection,
  type FeedbackCorrectionAction,
  type FeedbackCorrectionRequest,
  type FeedbackCorrectionStatus,
} from "./corrections.ts";
import {
  evaluateLifecycleTransition,
  initialLifecycleStatus,
  type EvidenceRequirement,
  type LifecycleEvidenceRegistration,
  type LifecycleEvidence,
  type LifecycleObjectType,
  type LifecycleTransitionRequest,
} from "./domain.ts";
import {
  buildFeedbackCorrectionInsert,
  mapLifecycleState,
  type LifecycleStateProjection,
} from "./repository.ts";

export type LifecycleStateRecord = LifecycleStateProjection;

export interface LifecycleEventRecord {
  id: string;
  lifecycleStateId: string;
  projectId: string;
  objectType: LifecycleObjectType;
  objectId: string;
  eventType: string;
  fromStatus: string | null;
  toStatus: string;
  actorUserId: string;
  actorBusinessRole: BusinessRole;
  comment: string | null;
  requiredEvidenceTypes: string[];
  acceptedEvidenceIds: string[];
  createdAt: string;
}

export interface FeedbackCorrectionRecord {
  id: string;
  orgId: string;
  projectId: string;
  targetType: FeedbackCorrectionRequest["targetType"];
  targetId: string;
  correctionType: FeedbackCorrectionRequest["correctionType"];
  status: FeedbackCorrectionStatus;
  reasonCode: string;
  reasonDetail: string;
  proposedCorrection: Record<string, unknown>;
  appliedCorrection: Record<string, unknown>;
  correctionOwnerUserId: string;
  dueAt: string;
  resubmissionPath: string;
  submittedBy: string;
  submittedBusinessRole: BusinessRole;
  triagedBy: string | null;
  verifiedBy: string | null;
  closedAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectLifecycleData {
  project: Record<string, unknown>;
  states: LifecycleStateRecord[];
  events: LifecycleEventRecord[];
  exceptions: Record<string, unknown>[];
  corrections: FeedbackCorrectionRecord[];
  evidenceRequirements: EvidenceRequirement[];
  evidence: Record<string, unknown>[];
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : [];
}

function isP18Missing(message: string): boolean {
  return /project_lifecycle_|feedback_correction_|evidence_requirements|transition_project_lifecycle_tx|transition_feedback_correction_tx|initialize_project_lifecycle_tx|schema cache|Could not find the table|relation .* does not exist/i.test(message);
}

function failure<T>(message: string): PersistenceResult<T> {
  if (/project_closure_assessments|P24_FORMAL_CLOSE_GATE/i.test(message)) {
    return { status: "not_configured", warning: "请先执行P24收尾门禁与知识复用数据库迁移。" };
  }
  return {
    status: isP18Missing(message) ? "not_configured" : "failed",
    warning: isP18Missing(message) ? "请先执行P18生命周期与证据矩阵数据库迁移。" : message,
  };
}

function mapLifecycleEvent(row: Record<string, unknown>): LifecycleEventRecord {
  return {
    id: String(row.id),
    lifecycleStateId: String(row.lifecycle_state_id),
    projectId: String(row.project_id),
    objectType: String(row.object_type) as LifecycleObjectType,
    objectId: String(row.object_id),
    eventType: String(row.event_type),
    fromStatus: row.from_status ? String(row.from_status) : null,
    toStatus: String(row.to_status),
    actorUserId: String(row.actor_user_id),
    actorBusinessRole: String(row.actor_business_role) as BusinessRole,
    comment: row.comment ? String(row.comment) : null,
    requiredEvidenceTypes: strings(row.required_evidence_types),
    acceptedEvidenceIds: strings(row.accepted_evidence_ids),
    createdAt: String(row.created_at),
  };
}

function mapEvidenceRequirement(row: Record<string, unknown>): EvidenceRequirement {
  return {
    id: String(row.id),
    objectType: String(row.object_type) as LifecycleObjectType,
    fromStatus: String(row.from_status),
    toStatus: String(row.to_status),
    evidenceType: String(row.evidence_type),
    minimumCount: Number(row.minimum_count || 1),
    verifierRoles: strings(row.verifier_roles) as BusinessRole[],
    validityDays: row.validity_days === null || row.validity_days === undefined ? null : Number(row.validity_days),
    expiryAction: String(row.expiry_action || "block_transition") as EvidenceRequirement["expiryAction"],
    active: Boolean(row.active),
  };
}

function mapFeedbackCorrection(row: Record<string, unknown>): FeedbackCorrectionRecord {
  return {
    id: String(row.id),
    orgId: String(row.org_id),
    projectId: String(row.project_id),
    targetType: String(row.target_type) as FeedbackCorrectionRecord["targetType"],
    targetId: String(row.target_id),
    correctionType: String(row.correction_type) as FeedbackCorrectionRecord["correctionType"],
    status: String(row.status) as FeedbackCorrectionStatus,
    reasonCode: String(row.reason_code),
    reasonDetail: String(row.reason_detail),
    proposedCorrection: object(row.proposed_correction),
    appliedCorrection: object(row.applied_correction),
    correctionOwnerUserId: String(row.correction_owner_user_id),
    dueAt: String(row.due_at),
    resubmissionPath: String(row.resubmission_path),
    submittedBy: String(row.submitted_by),
    submittedBusinessRole: String(row.submitted_business_role) as BusinessRole,
    triagedBy: row.triaged_by ? String(row.triaged_by) : null,
    verifiedBy: row.verified_by ? String(row.verified_by) : null,
    closedAt: row.closed_at ? String(row.closed_at) : null,
    version: Number(row.version),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export async function loadEvidenceRequirements(input: {
  orgId: string;
  objectType?: LifecycleObjectType;
  fromStatus?: string;
  toStatus?: string;
}): Promise<PersistenceResult<EvidenceRequirement[]>> {
  if (!isAuthStorageConfigured()) return { status: "not_configured", warning: "AUTH_STORAGE_NOT_CONFIGURED" };
  let query = getAuthSupabase().from("evidence_requirements").select("*")
    .eq("active", true)
    .or(`org_id.eq.${input.orgId},org_id.is.null`)
    .lte("effective_from", new Date().toISOString())
    .or(`effective_until.is.null,effective_until.gte.${new Date().toISOString()}`)
    .order("org_id", { ascending: false, nullsFirst: false })
    .order("version", { ascending: false });
  if (input.objectType) query = query.eq("object_type", input.objectType);
  if (input.fromStatus) query = query.eq("from_status", input.fromStatus);
  if (input.toStatus) query = query.eq("to_status", input.toStatus);
  const { data, error } = await query;
  if (error) return failure(error.message);
  const unique = new Map<string, EvidenceRequirement>();
  for (const row of data ?? []) {
    const requirement = mapEvidenceRequirement(row as Record<string, unknown>);
    const key = `${requirement.objectType}:${requirement.fromStatus}:${requirement.toStatus}:${requirement.evidenceType}`;
    if (!unique.has(key)) unique.set(key, requirement);
  }
  return { status: "succeeded", data: [...unique.values()] };
}

export async function loadProjectLifecycle(projectId: string): Promise<PersistenceResult<ProjectLifecycleData>> {
  if (!isAuthStorageConfigured()) return { status: "not_configured", warning: "AUTH_STORAGE_NOT_CONFIGURED" };
  const supabase = getAuthSupabase();
  const project = await supabase.from("projects").select("id,org_id,name,oa_no,status,data_class,updated_at").eq("id", projectId).maybeSingle();
  if (project.error) return failure(project.error.message);
  if (!project.data) return { status: "not_found", warning: "项目不存在。" };
  const orgId = String(project.data.org_id);
  const [states, events, exceptions, corrections, requirements, evidence] = await Promise.all([
    supabase.from("project_lifecycle_states").select("*").eq("project_id", projectId).order("updated_at", { ascending: false }),
    supabase.from("project_lifecycle_events").select("*").eq("project_id", projectId).order("created_at", { ascending: false }).limit(300),
    supabase.from("management_signals").select("id,signal_type,severity,status,title,summary,owner_user_id,due_at,route,impact,updated_at").eq("project_id", projectId).neq("status", "closed").order("updated_at", { ascending: false }),
    supabase.from("feedback_correction_events").select("*").eq("project_id", projectId).order("updated_at", { ascending: false }).limit(200),
    loadEvidenceRequirements({ orgId }),
    supabase.from("evidence_links").select("*").eq("org_id", orgId).eq("subject_type", "project").eq("subject_id", projectId).order("created_at", { ascending: false }),
  ]);
  const queryError = [states, events, exceptions, corrections, evidence].find(result => result.error)?.error;
  if (queryError) return failure(queryError.message);
  if (requirements.status !== "succeeded") return { status: requirements.status, warning: requirements.warning };
  return {
    status: "succeeded",
    data: {
      project: project.data as Record<string, unknown>,
      states: (states.data ?? []).map(row => mapLifecycleState(row as Record<string, unknown>)),
      events: (events.data ?? []).map(row => mapLifecycleEvent(row as Record<string, unknown>)),
      exceptions: (exceptions.data ?? []) as Record<string, unknown>[],
      corrections: (corrections.data ?? []).map(row => mapFeedbackCorrection(row as Record<string, unknown>)),
      evidenceRequirements: requirements.data ?? [],
      evidence: (evidence.data ?? []) as Record<string, unknown>[],
    },
  };
}

export async function initializeProjectLifecycle(input: {
  orgId: string;
  projectId: string;
  dataClass: LifecycleStateRecord["dataClass"];
  actor: AppUser;
  actorBusinessRole: BusinessRole;
  idempotencyKey: string;
  requestId: string;
  comment?: string;
}): Promise<PersistenceResult<{ state: LifecycleStateRecord; event: LifecycleEventRecord }>> {
  if (!isAuthStorageConfigured()) return { status: "not_configured", warning: "AUTH_STORAGE_NOT_CONFIGURED" };
  const { data, error } = await getAuthSupabase().rpc("initialize_project_lifecycle_tx", {
    p_org_id: input.orgId,
    p_project_id: input.projectId,
    p_data_class: input.dataClass,
    p_actor_user_id: input.actor.id,
    p_actor_business_role: input.actorBusinessRole,
    p_idempotency_key: input.idempotencyKey,
    p_request_id: input.requestId,
    p_comment: input.comment || null,
  });
  if (error) {
    if (/P18_LIFECYCLE_ALREADY_INITIALIZED|duplicate/i.test(error.message)) return { status: "conflict", warning: "该项目已初始化生命周期。" };
    return failure(error.message);
  }
  const payload = data as { state?: Record<string, unknown>; event?: Record<string, unknown> } | null;
  if (!payload?.state || !payload.event) return { status: "failed", warning: "生命周期初始化事务未返回完整结果。" };
  const result = { state: mapLifecycleState(payload.state), event: mapLifecycleEvent(payload.event) };
  await writeOperationAudit({
    user: input.actor,
    action: "project_lifecycle_initialize",
    resourceType: "project",
    resourceId: input.projectId,
    status: "succeeded",
    summary: "初始化项目生命周期",
    detail: { businessRole: input.actorBusinessRole, dataClass: input.dataClass },
    requestId: input.requestId,
  });
  return { status: "succeeded", data: result };
}

export async function transitionProjectLifecycle(input: {
  stateId: string;
  expectedProjectId: string;
  transition: LifecycleTransitionRequest;
  actor: AppUser;
  requestId: string;
}): Promise<PersistenceResult<{ state: LifecycleStateRecord; event: LifecycleEventRecord }>> {
  if (!isAuthStorageConfigured()) return { status: "not_configured", warning: "AUTH_STORAGE_NOT_CONFIGURED" };
  const supabase = getAuthSupabase();
  const stateResult = await supabase.from("project_lifecycle_states").select("*").eq("id", input.stateId).maybeSingle();
  if (stateResult.error) return failure(stateResult.error.message);
  if (!stateResult.data) return { status: "not_found", warning: "生命周期对象不存在。" };
  const state = mapLifecycleState(stateResult.data as Record<string, unknown>);
  if (state.projectId !== input.expectedProjectId) {
    return { status: "not_found", warning: "生命周期对象不存在或不属于当前项目。" };
  }
  if (state.objectType !== input.transition.objectType || state.objectId !== input.transition.objectId) {
    return { status: "conflict", warning: "请求对象与当前生命周期状态不匹配。" };
  }
  if (state.objectType === "project" && state.status === "closing" && input.transition.action === "close") {
    const closureGate = await supabase.from("project_closure_assessments")
      .select("id")
      .eq("org_id", state.orgId)
      .eq("project_id", state.projectId)
      .eq("data_class", state.dataClass)
      .eq("ready", true)
      .eq("status", "approved")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (closureGate.error) return failure(closureGate.error.message);
    if (!closureGate.data) return { status: "conflict", warning: "P24_FORMAL_CLOSE_GATE_NOT_APPROVED" };
  }
  const requirements = await loadEvidenceRequirements({ orgId: state.orgId, objectType: state.objectType, fromStatus: state.status });
  if (requirements.status !== "succeeded") return { status: requirements.status, warning: requirements.warning };
  let evidence: LifecycleEvidence[] = [];
  if (input.transition.evidenceIds.length > 0) {
    const evidenceResult = await supabase.from("evidence_links")
      .select("id,evidence_type,verified_at,verified_by,valid_until,metadata")
      .eq("org_id", state.orgId)
      .eq("subject_type", "project")
      .eq("subject_id", state.projectId)
      .in("id", input.transition.evidenceIds);
    if (evidenceResult.error) return failure(evidenceResult.error.message);
    evidence = (evidenceResult.data ?? []).flatMap(row => {
      const metadata = object(row.metadata);
      if (String(metadata.lifecycle_object_type || "") !== state.objectType
        || String(metadata.lifecycle_object_id || "") !== state.objectId) return [];
      return [{
        id: String(row.id), evidenceType: String(row.evidence_type), verifiedAt: row.verified_at,
        verifiedBy: row.verified_by,
        verifiedByRole: metadata.verified_business_role
          ? String(metadata.verified_business_role) as BusinessRole
          : null,
        validUntil: row.valid_until,
      }];
    });
  }
  let plan;
  try {
    plan = evaluateLifecycleTransition({
      objectType: state.objectType,
      currentStatus: state.status,
      action: input.transition.action,
      actorBusinessRole: input.transition.businessRole,
      requirements: requirements.data ?? [],
      evidence,
    });
  } catch (error) {
    return { status: "conflict", warning: error instanceof Error ? error.message : "生命周期状态转换不允许。" };
  }
  const result = await supabase.rpc("transition_project_lifecycle_tx", {
    p_state_id: state.id,
    p_expected_status: state.status,
    p_expected_version: state.version,
    p_next_status: plan.toStatus,
    p_action: plan.action,
    p_actor_user_id: input.actor.id,
    p_actor_business_role: input.transition.businessRole,
    p_comment: input.transition.comment || null,
    p_required_evidence_types: plan.requiredEvidenceTypes,
    p_accepted_evidence_ids: plan.acceptedEvidenceIds,
    p_idempotency_key: input.transition.idempotencyKey,
    p_request_id: input.requestId,
  });
  if (result.error) {
    if (/P18_LIFECYCLE_CONFLICT|P18_EVIDENCE_GATE_FAILED|P24_FORMAL_CLOSE_GATE_NOT_APPROVED|duplicate|serialization|40001/i.test(result.error.message)) {
      return { status: "conflict", warning: result.error.message };
    }
    return failure(result.error.message);
  }
  const payload = result.data as { state?: Record<string, unknown>; event?: Record<string, unknown> } | null;
  if (!payload?.state || !payload.event) return { status: "failed", warning: "生命周期事务未返回完整结果。" };
  await writeOperationAudit({
    user: input.actor,
    action: `project_lifecycle_${plan.action}`,
    resourceType: state.objectType,
    resourceId: state.objectId,
    status: "succeeded",
    severity: plan.toStatus === "terminated" || plan.toStatus === "suspended" ? "high" : "medium",
    summary: `生命周期状态：${state.status} → ${plan.toStatus}`,
    detail: { projectId: state.projectId, evidenceIds: plan.acceptedEvidenceIds, businessRole: input.transition.businessRole },
    requestId: input.requestId,
  });
  return { status: "succeeded", data: { state: mapLifecycleState(payload.state), event: mapLifecycleEvent(payload.event) } };
}

export async function initializeLifecycleObject(input: {
  orgId: string;
  projectId: string;
  objectType: Exclude<LifecycleObjectType, "project">;
  objectId: string;
  ownerUserId?: string | null;
  dueAt?: string | null;
  dataClass: LifecycleStateRecord["dataClass"];
  sourceType?: string | null;
  sourceId?: string | null;
  title?: string | null;
  actor: AppUser;
  actorBusinessRole: BusinessRole;
  idempotencyKey: string;
  requestId: string;
  comment?: string;
}): Promise<PersistenceResult<{ state: LifecycleStateRecord; event: LifecycleEventRecord }>> {
  if (!isAuthStorageConfigured()) return { status: "not_configured", warning: "AUTH_STORAGE_NOT_CONFIGURED" };
  if (input.objectType !== "closure" && (!input.sourceType?.trim() || !input.sourceId?.trim())) return { status: "conflict", warning: "非收尾对象必须提供稳定业务来源类型和来源ID。" };
  if (input.dueAt && !Number.isFinite(new Date(input.dueAt).getTime())) return { status: "conflict", warning: "对象截止时间不合法。" };
  const { data, error } = await getAuthSupabase().rpc("initialize_lifecycle_object_tx", {
    p_org_id: input.orgId,
    p_project_id: input.projectId,
    p_object_type: input.objectType,
    p_object_id: input.objectId,
    p_initial_status: initialLifecycleStatus(input.objectType),
    p_owner_user_id: input.ownerUserId || null,
    p_due_at: input.dueAt || null,
    p_data_class: input.dataClass,
    p_metadata: { source_type: input.sourceType || "project_closure", source_id: input.sourceId || input.objectId, title: input.title || input.objectId },
    p_actor_user_id: input.actor.id,
    p_actor_business_role: input.actorBusinessRole,
    p_idempotency_key: input.idempotencyKey,
    p_request_id: input.requestId,
    p_comment: input.comment || null,
  });
  if (error) {
    if (/ALREADY_INITIALIZED|duplicate/i.test(error.message)) return { status: "conflict", warning: "该业务对象已经纳入生命周期。" };
    return failure(error.message);
  }
  const payload = data as { state?: Record<string, unknown>; event?: Record<string, unknown> } | null;
  if (!payload?.state || !payload.event) return { status: "failed", warning: "对象生命周期初始化事务未返回完整结果。" };
  const result = { state: mapLifecycleState(payload.state), event: mapLifecycleEvent(payload.event) };
  await writeOperationAudit({ user: input.actor, action: "lifecycle_object_initialize", resourceType: input.objectType, resourceId: input.objectId, status: "succeeded", summary: `纳入生命周期：${input.objectType}`, detail: { projectId: input.projectId, sourceType: input.sourceType, sourceId: input.sourceId, businessRole: input.actorBusinessRole }, requestId: input.requestId });
  return { status: "succeeded", data: result };
}

async function correctionTargetExists(input: FeedbackCorrectionRequest, orgId: string): Promise<PersistenceResult<boolean>> {
  const supabase = getAuthSupabase();
  let query;
  if (input.targetType === "management_signal") query = supabase.from("management_signals").select("id").eq("id", input.targetId).eq("project_id", input.projectId);
  else if (input.targetType === "lifecycle_state") query = supabase.from("project_lifecycle_states").select("id").eq("id", input.targetId).eq("project_id", input.projectId);
  else if (input.targetType === "action") query = supabase.from("unified_action_items").select("id").eq("id", input.targetId).eq("project_id", input.projectId);
  else if (input.targetType === "rule") query = supabase.from("management_rule_versions").select("id").eq("id", input.targetId).or(`org_id.eq.${orgId},org_id.is.null`);
  else if (input.targetType === "forecast") query = supabase.from("business_forecast_versions").select("id").eq("id", input.targetId).eq("org_id", orgId).eq("project_id", input.projectId);
  else if (input.targetType === "ai_evaluation") query = supabase.from("ai_assistant_evaluations").select("id").eq("id", input.targetId).eq("org_id", orgId).eq("subject_scope", "project").eq("subject_id", input.projectId);
  else return { status: "conflict", warning: `当前版本尚无${input.targetType}的可核验事实源，不允许创建孤立纠偏。` };
  const { data, error } = await query.maybeSingle();
  if (error) return failure(error.message);
  return data ? { status: "succeeded", data: true } : { status: "not_found", warning: "纠偏目标不存在或不属于当前项目。" };
}

export async function createFeedbackCorrection(input: {
  correction: FeedbackCorrectionRequest;
  orgId: string;
  actor: AppUser;
  requestId: string;
}): Promise<PersistenceResult<FeedbackCorrectionRecord>> {
  if (!isAuthStorageConfigured()) return { status: "not_configured", warning: "AUTH_STORAGE_NOT_CONFIGURED" };
  const target = await correctionTargetExists(input.correction, input.orgId);
  if (target.status !== "succeeded") return { status: target.status, warning: target.warning };
  const supabase = getAuthSupabase();
  const payload = buildFeedbackCorrectionInsert(input.correction, { orgId: input.orgId, submittedBy: input.actor.id });
  const { data, error } = await supabase.from("feedback_correction_events")
    .upsert(payload, { onConflict: "org_id,idempotency_key", ignoreDuplicates: true })
    .select("*")
    .maybeSingle();
  if (error) return failure(error.message);
  const row = data || (await supabase.from("feedback_correction_events").select("*")
    .eq("org_id", input.orgId).eq("idempotency_key", input.correction.idempotencyKey).single()).data;
  if (!row) return { status: "failed", warning: "纠偏事件未能创建或读回。" };
  await writeOperationAudit({
    user: input.actor,
    action: "feedback_correction_submit",
    resourceType: input.correction.targetType,
    resourceId: input.correction.targetId,
    status: "succeeded",
    severity: "medium",
    summary: `提交人工纠偏：${input.correction.correctionType}`,
    detail: { projectId: input.correction.projectId, reasonCode: input.correction.reasonCode, ownerUserId: input.correction.correctionOwnerUserId },
    requestId: input.requestId,
  });
  return { status: "succeeded", data: mapFeedbackCorrection(row as Record<string, unknown>) };
}

export async function listFeedbackCorrections(input: {
  projectId: string;
  status?: FeedbackCorrectionStatus;
}): Promise<PersistenceResult<FeedbackCorrectionRecord[]>> {
  if (!isAuthStorageConfigured()) return { status: "not_configured", warning: "AUTH_STORAGE_NOT_CONFIGURED" };
  let query = getAuthSupabase().from("feedback_correction_events").select("*")
    .eq("project_id", input.projectId).order("updated_at", { ascending: false }).limit(200);
  if (input.status) query = query.eq("status", input.status);
  const { data, error } = await query;
  if (error) return failure(error.message);
  return { status: "succeeded", data: (data ?? []).map(row => mapFeedbackCorrection(row as Record<string, unknown>)) };
}

export async function getFeedbackCorrection(correctionId: string): Promise<PersistenceResult<FeedbackCorrectionRecord>> {
  if (!isAuthStorageConfigured()) return { status: "not_configured", warning: "AUTH_STORAGE_NOT_CONFIGURED" };
  const { data, error } = await getAuthSupabase().from("feedback_correction_events").select("*").eq("id", correctionId).maybeSingle();
  if (error) return failure(error.message);
  if (!data) return { status: "not_found", warning: "纠偏事件不存在。" };
  return { status: "succeeded", data: mapFeedbackCorrection(data as Record<string, unknown>) };
}

export async function registerLifecycleEvidence(input: {
  orgId: string;
  projectId: string;
  registration: LifecycleEvidenceRegistration;
  actor: AppUser;
  actorBusinessRole: BusinessRole;
  requestId: string;
}): Promise<PersistenceResult<Record<string, unknown>>> {
  if (!isAuthStorageConfigured()) return { status: "not_configured", warning: "AUTH_STORAGE_NOT_CONFIGURED" };
  const payload = {
    org_id: input.orgId,
    subject_type: "project",
    subject_id: input.projectId,
    evidence_type: input.registration.evidenceType,
    source_type: input.registration.sourceType,
    source_id: input.registration.sourceId,
    source_url: input.registration.sourceUrl,
    title: input.registration.title,
    version: input.registration.version,
    valid_until: input.registration.validUntil,
    metadata: {
      lifecycle_object_type: input.registration.objectType,
      lifecycle_object_id: input.registration.objectId,
      registered_by: input.actor.id,
      registered_business_role: input.actorBusinessRole,
    },
  };
  const { data, error } = await getAuthSupabase().from("evidence_links")
    .upsert(payload, { onConflict: "org_id,subject_type,subject_id,source_type,source_id,version" })
    .select("*")
    .single();
  if (error) return failure(error.message);
  await writeOperationAudit({
    user: input.actor,
    action: "lifecycle_evidence_register",
    resourceType: input.registration.objectType,
    resourceId: input.registration.objectId,
    status: "succeeded",
    summary: `登记生命周期证据：${input.registration.title}`,
    detail: { projectId: input.projectId, evidenceType: input.registration.evidenceType, evidenceId: data.id },
    requestId: input.requestId,
  });
  return { status: "succeeded", data: data as Record<string, unknown> };
}

export async function verifyLifecycleEvidence(input: {
  orgId: string;
  projectId: string;
  evidenceId: string;
  actor: AppUser;
  actorBusinessRole: BusinessRole;
  requestId: string;
}): Promise<PersistenceResult<Record<string, unknown>>> {
  if (!isAuthStorageConfigured()) return { status: "not_configured", warning: "AUTH_STORAGE_NOT_CONFIGURED" };
  const supabase = getAuthSupabase();
  const current = await supabase.from("evidence_links").select("*")
    .eq("id", input.evidenceId).eq("org_id", input.orgId)
    .eq("subject_type", "project").eq("subject_id", input.projectId).maybeSingle();
  if (current.error) return failure(current.error.message);
  if (!current.data) return { status: "not_found", warning: "证据不存在或不属于当前项目。" };
  if (current.data.valid_until && new Date(current.data.valid_until).getTime() < Date.now()) {
    return { status: "conflict", warning: "证据已过期，请先登记新版本。" };
  }
  const { data, error } = await supabase.from("evidence_links").update({
    verified_by: input.actor.id,
    verified_at: new Date().toISOString(),
    metadata: { ...object(current.data.metadata), verified_business_role: input.actorBusinessRole },
  }).eq("id", input.evidenceId).select("*").single();
  if (error) return failure(error.message);
  await writeOperationAudit({
    user: input.actor,
    action: "lifecycle_evidence_verify",
    resourceType: "evidence",
    resourceId: input.evidenceId,
    status: "succeeded",
    summary: `核验生命周期证据：${String(current.data.title)}`,
    detail: { projectId: input.projectId, businessRole: input.actorBusinessRole },
    requestId: input.requestId,
  });
  return { status: "succeeded", data: data as Record<string, unknown> };
}

export async function transitionFeedbackCorrectionRecord(input: {
  correctionId: string;
  action: FeedbackCorrectionAction;
  actor: AppUser;
  actorBusinessRole: BusinessRole;
  comment?: string;
  reasonCode?: string;
  appliedCorrection?: Record<string, unknown>;
  requestId: string;
}): Promise<PersistenceResult<FeedbackCorrectionRecord>> {
  if (!isAuthStorageConfigured()) return { status: "not_configured", warning: "AUTH_STORAGE_NOT_CONFIGURED" };
  if (!canTransitionFeedbackCorrection(input.actorBusinessRole, input.action)) return { status: "conflict", warning: "当前业务角色无权执行该纠偏动作。" };
  const supabase = getAuthSupabase();
  const currentResult = await supabase.from("feedback_correction_events").select("*").eq("id", input.correctionId).maybeSingle();
  if (currentResult.error) return failure(currentResult.error.message);
  if (!currentResult.data) return { status: "not_found", warning: "纠偏事件不存在。" };
  const current = mapFeedbackCorrection(currentResult.data as Record<string, unknown>);
  if (input.action === "submit_correction" && (!input.appliedCorrection || Object.keys(input.appliedCorrection).length === 0)) {
    return { status: "conflict", warning: "重新提交前必须填写已实施的纠偏结果。" };
  }
  if (["reject", "request_rework"].includes(input.action) && !input.comment?.trim()) {
    return { status: "conflict", warning: "退回或驳回必须填写原因。" };
  }
  let next: FeedbackCorrectionStatus;
  try {
    next = transitionFeedbackCorrection(current.status, input.action);
  } catch (error) {
    return { status: "conflict", warning: error instanceof Error ? error.message : "纠偏状态转换不允许。" };
  }
  const { data, error } = await supabase.rpc("transition_feedback_correction_tx", {
    p_correction_id: current.id,
    p_expected_status: current.status,
    p_expected_version: current.version,
    p_next_status: next,
    p_action: input.action,
    p_actor_user_id: input.actor.id,
    p_actor_business_role: input.actorBusinessRole,
    p_comment: input.comment || null,
    p_reason_code: input.reasonCode || null,
    p_applied_correction: input.appliedCorrection ?? {},
    p_request_id: input.requestId,
  });
  if (error) {
    if (/P18_(?:CORRECTION_CONFLICT|INDEPENDENT_VERIFIER_REQUIRED|CORRECTION_TARGET_|APPLIED_CORRECTION_REQUIRED)|duplicate|serialization|40001/i.test(error.message)) return { status: "conflict", warning: error.message };
    return failure(error.message);
  }
  await writeOperationAudit({
    user: input.actor,
    action: `feedback_correction_${input.action}`,
    resourceType: current.targetType,
    resourceId: current.targetId,
    status: "succeeded",
    severity: input.action === "verify" ? "medium" : "low",
    summary: `纠偏状态：${current.status} → ${next}`,
    detail: { correctionId: current.id, projectId: current.projectId, businessRole: input.actorBusinessRole },
    requestId: input.requestId,
  });
  return { status: "succeeded", data: mapFeedbackCorrection(data as Record<string, unknown>) };
}
