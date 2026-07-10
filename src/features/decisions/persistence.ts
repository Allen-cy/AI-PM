import { getAuthSupabase, isAuthStorageConfigured, type AppUser } from "../auth/server.ts";
import { writeOperationAudit } from "../security/repository.ts";
import type { BusinessRole, SubjectScope } from "../operating-model/context.ts";
import {
  parseDecisionBriefInput,
  transitionDecisionBrief,
  validateDecisionOutcome,
  type DecisionBriefInput,
  type DecisionBriefStatus,
  type DecisionWorkflowStatus,
  type DecisionOutcome,
  type DecisionMode,
  type DecisionLevel,
  type DecisionAuthorityMode,
  type StandardDecisionType,
  validateMeetingConclusions,
} from "./domain.ts";

export interface DecisionPersistenceResult<T> {
  status: "succeeded" | "not_configured" | "not_found" | "conflict" | "failed";
  data?: T;
  warning?: string;
}

export interface DecisionBriefRecord {
  id: string;
  orgId: string;
  subjectScope: SubjectScope;
  subjectId: string;
  projectId: string | null;
  dataClass: "production" | "sample" | "test" | "diagnostic" | "unclassified";
  status: DecisionBriefStatus;
  workflowStatus: DecisionWorkflowStatus;
  title: string;
  decisionQuestion: string;
  options: Array<{ key: string; label: string; consequences: string }>;
  recommendation: string;
  evidence: Array<Record<string, unknown>>;
  impactSummary: string;
  requestedDecisionAt: string;
  executionDueAt: string;
  acceptanceCriteria: string;
  meetingId: string | null;
  reportingSnapshotId: string | null;
  sourceSignalIds: string[];
  recipientUserIds: string[];
  decisionTargetUserId: string | null;
  submittedBy: string | null;
  submittedAt: string | null;
  decidedAt: string | null;
  distributedAt: string | null;
  effectReviewedAt: string | null;
  closedAt: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  version: number;
  decisionType: StandardDecisionType;
  decisionMode: DecisionMode;
  decisionLevel: DecisionLevel;
  authorityMode: DecisionAuthorityMode;
  committeeId: string | null;
  structuredInput: Record<string, unknown>;
  emergencyTrigger: string | null;
  responseSlaMinutes: number | null;
  slaPolicyVersion: string | null;
  definitionVersion: string;
  downstreamActionTemplates: Array<Record<string, unknown>>;
  reviewMetrics: string[];
  revocationConditions: string[];
  reviewPlan: Record<string, unknown>;
  reopenedFromBriefId: string | null;
  reopenedAt: string | null;
}

export interface ReportingSnapshotInput {
  orgId: string;
  subjectScope: SubjectScope;
  subjectId: string;
  snapshotType: "daily" | "weekly" | "monthly" | "quarterly" | "ad_hoc";
  periodStart: string;
  periodEnd: string;
  dataClass: DecisionBriefRecord["dataClass"];
  metrics: Record<string, unknown>;
  exceptions: Array<Record<string, unknown>>;
  narrative: string;
  sourceSnapshotAt: string;
  sourceDefinition: Record<string, unknown>;
  submittedToUserId?: string | null;
}

export interface GovernanceMeetingInput {
  orgId: string;
  subjectScope: Extract<SubjectScope, "project" | "portfolio" | "organization">;
  subjectId: string;
  meetingType: "weekly_portfolio" | "monthly_operating" | "quarterly_portfolio" | "decision" | "ad_hoc";
  title: string;
  scheduledAt: string;
  attendeeUserIds: string[];
  agenda: Array<Record<string, unknown>>;
  reportingSnapshotIds: string[];
  dataClass: DecisionBriefRecord["dataClass"];
  timezone?: string;
  workingCalendarKey?: string;
}

export interface DecisionParticipant {
  userId: string;
  name: string;
  businessRole: BusinessRole;
  canReceiveDecisionPackage: boolean;
  canReceiveReport: boolean;
}

function storageMissing(message: string): boolean {
  return /relation .* does not exist|schema cache|Could not find the table|decision_briefs|reporting_snapshots|governance_meetings|decision_committees|decision_evidence_requests|decision_execution_actions|decision_sla_escalations/i.test(message);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asRecords(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter(item => item && typeof item === "object" && !Array.isArray(item)) as Array<Record<string, unknown>> : [];
}

function asStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

function mapBrief(row: Record<string, unknown>): DecisionBriefRecord {
  return {
    id: String(row.id),
    orgId: String(row.org_id),
    subjectScope: String(row.subject_scope) as SubjectScope,
    subjectId: String(row.subject_id),
    projectId: row.project_id ? String(row.project_id) : null,
    dataClass: String(row.data_class || "unclassified") as DecisionBriefRecord["dataClass"],
    status: String(row.status) as DecisionBriefStatus,
    workflowStatus: String(row.workflow_status || (row.status === "submitted" ? "pending_decision" : row.status)) as DecisionWorkflowStatus,
    title: String(row.title),
    decisionQuestion: String(row.decision_question),
    options: asRecords(row.options) as DecisionBriefRecord["options"],
    recommendation: String(row.recommendation),
    evidence: asRecords(row.evidence),
    impactSummary: String(row.impact_summary),
    requestedDecisionAt: String(row.requested_decision_at),
    executionDueAt: String(row.execution_due_at),
    acceptanceCriteria: String(row.acceptance_criteria),
    meetingId: row.meeting_id ? String(row.meeting_id) : null,
    reportingSnapshotId: row.reporting_snapshot_id ? String(row.reporting_snapshot_id) : null,
    sourceSignalIds: asStrings(row.source_signal_ids),
    recipientUserIds: asStrings(row.recipient_user_ids),
    decisionTargetUserId: row.decision_target_user_id ? String(row.decision_target_user_id) : null,
    submittedBy: row.submitted_by ? String(row.submitted_by) : null,
    submittedAt: row.submitted_at ? String(row.submitted_at) : null,
    decidedAt: row.decided_at ? String(row.decided_at) : null,
    distributedAt: row.distributed_at ? String(row.distributed_at) : null,
    effectReviewedAt: row.effect_reviewed_at ? String(row.effect_reviewed_at) : null,
    closedAt: row.closed_at ? String(row.closed_at) : null,
    createdBy: String(row.created_by),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    version: Number(row.version || 1),
    decisionType: String(row.decision_type || "continue") as StandardDecisionType,
    decisionMode: String(row.decision_mode || "routine") as DecisionMode,
    decisionLevel: String(row.decision_level || "executive") as DecisionLevel,
    authorityMode: String(row.authority_mode || "individual") as DecisionAuthorityMode,
    committeeId: row.committee_id ? String(row.committee_id) : null,
    structuredInput: asRecord(row.structured_input),
    emergencyTrigger: row.emergency_trigger ? String(row.emergency_trigger) : null,
    responseSlaMinutes: row.response_sla_minutes === null || row.response_sla_minutes === undefined ? null : Number(row.response_sla_minutes),
    slaPolicyVersion: row.sla_policy_version ? String(row.sla_policy_version) : null,
    definitionVersion: String(row.definition_version || "P21-v1"),
    downstreamActionTemplates: asRecords(row.downstream_action_templates),
    reviewMetrics: asStrings(row.review_metrics),
    revocationConditions: asStrings(row.revocation_conditions),
    reviewPlan: asRecord(row.review_plan),
    reopenedFromBriefId: row.reopened_from_brief_id ? String(row.reopened_from_brief_id) : null,
    reopenedAt: row.reopened_at ? String(row.reopened_at) : null,
  };
}

async function audit(input: {
  actor: AppUser;
  action: string;
  briefId: string;
  summary: string;
  role: BusinessRole;
  requestId: string;
  detail?: Record<string, unknown>;
}) {
  await writeOperationAudit({
    user: input.actor,
    action: input.action,
    resourceType: "decision_brief",
    resourceId: input.briefId,
    status: "succeeded",
    severity: input.action.includes("decide") || input.action.includes("close") ? "high" : "medium",
    summary: input.summary,
    detail: { actorBusinessRole: input.role, ...input.detail },
    requestId: input.requestId,
  });
}

export async function listDecisionWorkspace(input: {
  orgId: string;
  subjectScope: SubjectScope;
  subjectId: string;
  dataClass: DecisionBriefRecord["dataClass"];
  actorUserId: string;
  actorBusinessRole: BusinessRole;
}): Promise<DecisionPersistenceResult<{
  briefs: DecisionBriefRecord[];
  decisions: Record<string, unknown>[];
  receipts: Record<string, unknown>[];
  effectReviews: Record<string, unknown>[];
  executionActions: Record<string, unknown>[];
  executionActionLinks: Record<string, unknown>[];
  evidenceRequests: Record<string, unknown>[];
  votes: Record<string, unknown>[];
  committees: Record<string, unknown>[];
  authorityResponses: Record<string, unknown>[];
  slaEscalations: Record<string, unknown>[];
  decisionDefinitions: Record<string, unknown>[];
  slaPolicies: Record<string, unknown>[];
  participants: DecisionParticipant[];
  managementEscalations: Record<string, unknown>[];
}>> {
  if (!isAuthStorageConfigured()) return { status: "not_configured", warning: "AUTH_STORAGE_NOT_CONFIGURED" };
  const supabase = getAuthSupabase();
  const briefQuery = supabase.from("decision_briefs").select("*")
    .eq("org_id", input.orgId).eq("subject_scope", input.subjectScope).eq("subject_id", input.subjectId)
    .eq("data_class", input.dataClass).order("updated_at", { ascending: false }).limit(100);
  const [briefResult, scopedRoles, reportingTargets, escalationResult, committeeResult, definitionResult, slaPolicyResult] = await Promise.all([
    briefQuery,
    supabase.from("user_business_roles").select("user_id,business_role")
      .eq("org_id", input.orgId).eq("subject_scope", input.subjectScope).eq("subject_id", input.subjectId).eq("status", "active"),
    ["pm", "operations", "pmo"].includes(input.actorBusinessRole)
      ? supabase.from("business_reporting_relationships").select("to_user_id,to_business_role")
        .eq("org_id", input.orgId).eq("subject_scope", input.subjectScope).eq("subject_id", input.subjectId)
        .eq("from_user_id", input.actorUserId).eq("from_business_role", input.actorBusinessRole).eq("status", "active")
      : Promise.resolve({ data: [], error: null }),
    input.actorBusinessRole === "pmo"
      ? supabase.from("management_escalations").select("id,signal_id,status,escalation_level,reason,impact,due_at,created_at")
        .eq("org_id", input.orgId).eq("subject_scope", input.subjectScope).eq("subject_id", input.subjectId)
        .eq("target_user_id", input.actorUserId).eq("status", "pending_decision_brief").order("due_at", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    supabase.from("decision_committees").select("*")
      .eq("org_id", input.orgId).eq("subject_scope", input.subjectScope).eq("subject_id", input.subjectId)
      .eq("data_class", input.dataClass).order("updated_at", { ascending: false }),
    supabase.from("decision_type_definitions").select("*")
      .or(`org_id.eq.${input.orgId},org_id.is.null`).eq("status", "active").order("decision_type", { ascending: true }),
    supabase.from("decision_sla_policies").select("*")
      .or(`org_id.eq.${input.orgId},org_id.is.null`).eq("status", "active").order("decision_level", { ascending: true }),
  ]);
  if (briefResult.error) return { status: storageMissing(briefResult.error.message) ? "not_configured" : "failed", warning: briefResult.error.message };
  const initialError = scopedRoles.error || reportingTargets.error || escalationResult.error || committeeResult.error || definitionResult.error || slaPolicyResult.error;
  if (initialError) return { status: storageMissing(initialError.message) ? "not_configured" : "failed", warning: initialError.message };
  const roleRows = scopedRoles.data ?? [];
  const decisionTargetIds = new Set((reportingTargets.data ?? []).filter(row => ["ceo", "sponsor"].includes(String(row.to_business_role))).map(row => String(row.to_user_id)));
  const reportTargetIds = new Set((reportingTargets.data ?? []).filter(row => row.to_business_role === "pmo").map(row => String(row.to_user_id)));
  const participantIds = [...new Set(roleRows.map(row => String(row.user_id)))];
  const users = participantIds.length > 0 ? await supabase.from("app_users").select("id,name").in("id", participantIds) : { data: [], error: null };
  if (users.error) return { status: "failed", warning: users.error.message };
  const names = new Map((users.data ?? []).map(row => [String(row.id), String(row.name || "未命名用户")]));
  const participants: DecisionParticipant[] = roleRows.map(row => ({
    userId: String(row.user_id),
    name: names.get(String(row.user_id)) || "未命名用户",
    businessRole: String(row.business_role) as BusinessRole,
    canReceiveDecisionPackage: ["ceo", "sponsor"].includes(String(row.business_role)) && decisionTargetIds.has(String(row.user_id)),
    canReceiveReport: String(row.business_role) === "pmo" && reportTargetIds.has(String(row.user_id)),
  }));
  const allBriefs = (briefResult.data ?? []).map(row => mapBrief(row as Record<string, unknown>));
  const managementEscalations = (escalationResult.data ?? []) as Record<string, unknown>[];
  const allBriefIds = allBriefs.map(item => item.id);
  const emptyData = {
    briefs: [], decisions: [], receipts: [], effectReviews: [], executionActions: [], executionActionLinks: [],
    evidenceRequests: [], votes: [], committees: [], authorityResponses: [], slaEscalations: [],
    decisionDefinitions: (definitionResult.data ?? []) as Record<string, unknown>[], slaPolicies: (slaPolicyResult.data ?? []) as Record<string, unknown>[],
    participants, managementEscalations,
  };
  if (allBriefIds.length === 0) return { status: "succeeded", data: emptyData };
  const committeeIds = (committeeResult.data ?? []).map(row => String(row.id));
  const [decisions, receipts, reviews, evidenceRequests, votes, authorityResponses, slaEscalations, actionLinks, committeeMembers] = await Promise.all([
    supabase.from("decisions").select("*").in("brief_id", allBriefIds).order("decided_at", { ascending: false }),
    supabase.from("decision_receipts").select("*").in("brief_id", allBriefIds).order("updated_at", { ascending: false }),
    supabase.from("decision_effect_reviews").select("*").in("brief_id", allBriefIds).order("updated_at", { ascending: false }),
    supabase.from("decision_evidence_requests").select("*").in("brief_id", allBriefIds).order("created_at", { ascending: false }),
    supabase.from("decision_votes").select("*").in("brief_id", allBriefIds).order("voted_at", { ascending: false }),
    supabase.from("decision_authority_responses").select("*").in("brief_id", allBriefIds).order("created_at", { ascending: false }),
    supabase.from("decision_sla_escalations").select("*").in("brief_id", allBriefIds).order("due_at", { ascending: true }),
    supabase.from("decision_execution_actions").select("*").in("brief_id", allBriefIds),
    committeeIds.length > 0
      ? supabase.from("decision_committee_members").select("*").in("committee_id", committeeIds).eq("status", "active")
      : Promise.resolve({ data: [], error: null }),
  ]);
  const error = decisions.error || receipts.error || reviews.error || evidenceRequests.error || votes.error || authorityResponses.error || slaEscalations.error || actionLinks.error || committeeMembers.error;
  if (error) return { status: storageMissing(error.message) ? "not_configured" : "failed", warning: error.message };
  const memberCommitteeIds = new Set((committeeMembers.data ?? []).filter(row => row.user_id === input.actorUserId && row.business_role === input.actorBusinessRole).map(row => String(row.committee_id)));
  const actorReceiptBriefIds = new Set((receipts.data ?? []).filter(row => row.recipient_user_id === input.actorUserId && row.recipient_business_role === input.actorBusinessRole).map(row => String(row.brief_id)));
  const visibleBriefs = input.actorBusinessRole === "pmo" ? allBriefs
    : ["ceo", "sponsor"].includes(input.actorBusinessRole)
      ? allBriefs.filter(item => item.decisionTargetUserId === input.actorUserId || (item.committeeId && memberCommitteeIds.has(item.committeeId)))
      : allBriefs.filter(item => actorReceiptBriefIds.has(item.id));
  const visibleBriefIds = new Set(visibleBriefs.map(item => item.id));
  const visibleReceipts = (receipts.data ?? []).filter(row => visibleBriefIds.has(String(row.brief_id)) && (input.actorBusinessRole === "pmo" || (row.recipient_user_id === input.actorUserId && row.recipient_business_role === input.actorBusinessRole)));
  const visibleReceiptIds = new Set(visibleReceipts.map(row => String(row.id)));
  const visibleLinks = (actionLinks.data ?? []).filter(row => visibleBriefIds.has(String(row.brief_id)) && (input.actorBusinessRole === "pmo" || visibleReceiptIds.has(String(row.receipt_id))));
  const actionIds = [...new Set(visibleLinks.map(row => String(row.action_item_id)).filter(Boolean))];
  const actions = actionIds.length > 0 ? await supabase.from("unified_action_items").select("id,source_id,title,status,owner_user_id,due_date,acceptance_criteria,evidence,close_evidence,effect_review,metadata,data_class,updated_at").in("id", actionIds) : { data: [], error: null };
  if (actions.error) return { status: storageMissing(actions.error.message) ? "not_configured" : "failed", warning: actions.error.message };
  const visibleCommittees = (committeeResult.data ?? []).filter(row => input.actorBusinessRole === "pmo" || memberCommitteeIds.has(String(row.id)));
  return {
    status: "succeeded",
    data: {
      briefs: visibleBriefs,
      decisions: (decisions.data ?? []).filter(row => visibleBriefIds.has(String(row.brief_id))) as Record<string, unknown>[],
      receipts: visibleReceipts as Record<string, unknown>[],
      effectReviews: (reviews.data ?? []).filter(row => visibleBriefIds.has(String(row.brief_id)) && (input.actorBusinessRole === "pmo" || row.submitted_by === input.actorUserId)) as Record<string, unknown>[],
      executionActions: (actions.data ?? []) as Record<string, unknown>[],
      executionActionLinks: visibleLinks as Record<string, unknown>[],
      evidenceRequests: (evidenceRequests.data ?? []).filter(row => visibleBriefIds.has(String(row.brief_id)) && (input.actorBusinessRole === "pmo" || row.requested_by === input.actorUserId)) as Record<string, unknown>[],
      votes: (votes.data ?? []).filter(row => visibleBriefIds.has(String(row.brief_id))) as Record<string, unknown>[],
      committees: visibleCommittees as Record<string, unknown>[],
      authorityResponses: (authorityResponses.data ?? []).filter(row => visibleBriefIds.has(String(row.brief_id))) as Record<string, unknown>[],
      slaEscalations: (slaEscalations.data ?? []).filter(row => visibleBriefIds.has(String(row.brief_id))) as Record<string, unknown>[],
      decisionDefinitions: (definitionResult.data ?? []) as Record<string, unknown>[],
      slaPolicies: (slaPolicyResult.data ?? []) as Record<string, unknown>[],
      participants,
      managementEscalations,
    },
  };
}

export async function getDecisionBrief(id: string): Promise<DecisionPersistenceResult<DecisionBriefRecord>> {
  if (!isAuthStorageConfigured()) return { status: "not_configured", warning: "AUTH_STORAGE_NOT_CONFIGURED" };
  const { data, error } = await getAuthSupabase().from("decision_briefs").select("*").eq("id", id).maybeSingle();
  if (error) return { status: storageMissing(error.message) ? "not_configured" : "failed", warning: error.message };
  if (!data) return { status: "not_found", warning: "决策包不存在。" };
  return { status: "succeeded", data: mapBrief(data as Record<string, unknown>) };
}

export async function createDecisionBrief(input: {
  resource: { orgId: string; subjectScope: SubjectScope; subjectId: string; projectId?: string | null; dataClass: DecisionBriefRecord["dataClass"] };
  brief: unknown;
  actor: AppUser;
  actorBusinessRole: BusinessRole;
  requestId: string;
}): Promise<DecisionPersistenceResult<DecisionBriefRecord>> {
  if (!isAuthStorageConfigured()) return { status: "not_configured", warning: "AUTH_STORAGE_NOT_CONFIGURED" };
  let brief: DecisionBriefInput;
  try { brief = parseDecisionBriefInput(input.brief); }
  catch (error) { return { status: "conflict", warning: error instanceof Error ? error.message : "决策包不完整。" }; }
  const supabase = getAuthSupabase();
  const now = new Date().toISOString();
  const [definitionResult, slaResult, snapshotResult, meetingResult, committeeResult] = await Promise.all([
    supabase.from("decision_type_definitions").select("*")
      .or(`org_id.eq.${input.resource.orgId},org_id.is.null`).eq("decision_type", brief.decisionType)
      .eq("decision_level", brief.decisionLevel).eq("status", "active").lte("effective_from", now)
      .or(`effective_until.is.null,effective_until.gte.${now}`),
    supabase.from("decision_sla_policies").select("*")
      .or(`org_id.eq.${input.resource.orgId},org_id.is.null`).eq("decision_mode", brief.decisionMode)
      .eq("decision_level", brief.decisionLevel).eq("status", "active").lte("effective_from", now)
      .or(`effective_until.is.null,effective_until.gte.${now}`),
    brief.reportingSnapshotId
      ? supabase.from("reporting_snapshots").select("id,status,org_id,subject_scope,subject_id,data_class")
        .eq("id", brief.reportingSnapshotId).eq("org_id", input.resource.orgId).eq("subject_scope", input.resource.subjectScope)
        .eq("subject_id", input.resource.subjectId).eq("data_class", input.resource.dataClass).eq("status", "frozen").maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    brief.meetingId
      ? supabase.from("governance_meetings").select("id,status,org_id,subject_scope,subject_id,data_class,agenda_frozen_at")
        .eq("id", brief.meetingId).eq("org_id", input.resource.orgId).eq("subject_scope", input.resource.subjectScope)
        .eq("subject_id", input.resource.subjectId).eq("data_class", input.resource.dataClass)
        .in("status", ["agenda_frozen", "in_progress", "minutes_pending", "actions_pending", "effect_review", "closed"]).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    brief.authorityMode === "committee" && brief.committeeId
      ? supabase.from("decision_committees").select("id,status,decision_levels")
        .eq("id", brief.committeeId).eq("org_id", input.resource.orgId).eq("subject_scope", input.resource.subjectScope)
        .eq("subject_id", input.resource.subjectId).eq("data_class", input.resource.dataClass).eq("status", "active").maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  const configError = definitionResult.error || slaResult.error || snapshotResult.error || meetingResult.error || committeeResult.error;
  if (configError) return { status: storageMissing(configError.message) ? "not_configured" : "failed", warning: configError.message };
  const chooseScoped = (rows: Array<Record<string, unknown>>) => rows.find(row => String(row.org_id || "") === input.resource.orgId) ?? rows.find(row => !row.org_id);
  const definition = chooseScoped((definitionResult.data ?? []) as Array<Record<string, unknown>>);
  const slaPolicy = chooseScoped((slaResult.data ?? []) as Array<Record<string, unknown>>);
  if (!definition) return { status: "not_configured", warning: `决策类型 ${brief.decisionType}/${brief.decisionLevel} 尚无已生效的版本定义。` };
  if (!slaPolicy) return { status: "not_configured", warning: `决策SLA ${brief.decisionMode}/${brief.decisionLevel} 尚未配置。` };
  const requiredFields = asStrings(definition.required_input_fields);
  const missingField = requiredFields.find(field => !String(brief.structuredInput[field] ?? "").trim());
  if (missingField) return { status: "conflict", warning: `标准决策输入缺少 ${missingField}。` };
  if (brief.reportingSnapshotId && !snapshotResult.data) return { status: "conflict", warning: "关联汇报快照不存在、未冻结或不属于当前业务主体/数据分类。" };
  if (brief.meetingId && !meetingResult.data) return { status: "conflict", warning: "关联会议尚未冻结议程，或不属于当前业务主体/数据分类。" };
  if (brief.authorityMode === "committee") {
    const levels = asStrings(committeeResult.data ? (committeeResult.data as Record<string, unknown>).decision_levels : []);
    if (!committeeResult.data || !levels.includes(brief.decisionLevel)) return { status: "conflict", warning: "决策委员会未生效、作用域不匹配或不具备当前决策层级授权。" };
  }
  const configuredSla = Number(slaPolicy.response_sla_minutes);
  const responseSlaMinutes = brief.decisionMode === "emergency" && brief.responseSlaMinutes
    ? Math.min(configuredSla, brief.responseSlaMinutes)
    : configuredSla;
  const sourceSignalIds = [...new Set(brief.sourceSignalIds ?? [])];
  let escalationRows: Array<Record<string, unknown>> = [];
  if (sourceSignalIds.length > 0) {
    const escalationResult = await supabase.from("management_escalations").select("id,signal_id,target_user_id,status")
      .eq("org_id", input.resource.orgId).eq("subject_scope", input.resource.subjectScope).eq("subject_id", input.resource.subjectId)
      .eq("target_user_id", input.actor.id).eq("status", "pending_decision_brief").in("signal_id", sourceSignalIds);
    if (escalationResult.error) return { status: storageMissing(escalationResult.error.message) ? "not_configured" : "failed", warning: escalationResult.error.message };
    escalationRows = (escalationResult.data ?? []) as Record<string, unknown>[];
    if (new Set(escalationRows.map(row => String(row.signal_id))).size !== sourceSignalIds.length) return { status: "conflict", warning: "只能纳入已指派给当前PMO且待编制决策包的管理升级。" };
  }
  const { data, error } = await supabase.from("decision_briefs").insert({
    org_id: input.resource.orgId,
    subject_scope: input.resource.subjectScope,
    subject_id: input.resource.subjectId,
    project_id: input.resource.projectId ?? null,
    data_class: input.resource.dataClass,
    status: "draft",
    workflow_status: "draft",
    title: brief.title,
    decision_question: brief.decisionQuestion,
    options: brief.options,
    recommendation: brief.recommendation,
    evidence: brief.evidence,
    impact_summary: brief.impactSummary,
    requested_decision_at: brief.requestedDecisionAt,
    execution_due_at: brief.executionDueAt,
    acceptance_criteria: brief.acceptanceCriteria,
    meeting_id: brief.meetingId ?? null,
    reporting_snapshot_id: brief.reportingSnapshotId ?? null,
    source_signal_ids: sourceSignalIds,
    recipient_user_ids: brief.recipientUserIds ?? [],
    decision_target_user_id: brief.decisionTargetUserId ?? null,
    created_by: input.actor.id,
    updated_by: input.actor.id,
    decision_type: brief.decisionType,
    decision_mode: brief.decisionMode,
    decision_level: brief.decisionLevel,
    authority_mode: brief.authorityMode,
    committee_id: brief.committeeId ?? null,
    structured_input: brief.structuredInput,
    emergency_trigger: brief.emergencyTrigger ?? null,
    response_sla_minutes: responseSlaMinutes,
    sla_policy_version: String(slaPolicy.version),
    definition_version: String(definition.version),
    downstream_action_templates: asRecords(definition.downstream_action_templates),
    review_metrics: asStrings(definition.review_metrics),
    revocation_conditions: asStrings(definition.revocation_conditions),
    review_plan: brief.reviewPlan,
  }).select("*").single();
  if (error) return { status: storageMissing(error.message) ? "not_configured" : "failed", warning: error.message };
  if (escalationRows.length > 0) {
    const linked = await supabase.from("management_escalations").update({ status: "brief_created", decision_brief_id: data.id })
      .in("id", escalationRows.map(row => String(row.id))).eq("status", "pending_decision_brief").select("id");
    if (linked.error || (linked.data ?? []).length !== escalationRows.length) {
      await supabase.from("decision_briefs").delete().eq("id", data.id).eq("status", "draft");
      return { status: linked.error ? "failed" : "conflict", warning: linked.error?.message || "管理升级已被其他决策包占用，请刷新后重试。" };
    }
  }
  await audit({ actor: input.actor, action: "decision_brief_create", briefId: data.id, summary: `决策包已创建：${brief.title}`, role: input.actorBusinessRole, requestId: input.requestId });
  return { status: "succeeded", data: mapBrief(data as Record<string, unknown>) };
}

export async function submitDecisionBrief(input: {
  brief: DecisionBriefRecord;
  targetUserId: string;
  actor: AppUser;
  actorBusinessRole: BusinessRole;
  requestId: string;
}): Promise<DecisionPersistenceResult<DecisionBriefRecord>> {
  if (!isAuthStorageConfigured()) return { status: "not_configured", warning: "AUTH_STORAGE_NOT_CONFIGURED" };
  try { transitionDecisionBrief(input.brief.status, "submit"); }
  catch (error) { return { status: "conflict", warning: error instanceof Error ? error.message : "状态不允许提交。" }; }
  if (!["draft", "reopened"].includes(input.brief.workflowStatus)) return { status: "conflict", warning: `决策工作流状态 ${input.brief.workflowStatus} 不允许提交。` };
  const supabase = getAuthSupabase();
  const now = new Date().toISOString();
  let targetUserId: string | null = null;
  let targetRole: string | null = null;
  if (input.brief.authorityMode === "individual") {
    if (!input.targetUserId) return { status: "conflict", warning: "个人决策必须选择有效授权决策人。" };
    const relation = await supabase.from("business_reporting_relationships").select("id,to_business_role")
      .eq("org_id", input.brief.orgId).eq("subject_scope", input.brief.subjectScope).eq("subject_id", input.brief.subjectId)
      .eq("from_user_id", input.actor.id).eq("from_business_role", "pmo")
      .eq("to_user_id", input.targetUserId).in("to_business_role", ["ceo", "sponsor"])
      .in("relationship_type", ["reports_to", "escalates_to"]).eq("status", "active")
      .lte("valid_from", now).or(`valid_until.is.null,valid_until.gte.${now}`).limit(1).maybeSingle();
    if (relation.error) return { status: storageMissing(relation.error.message) ? "not_configured" : "failed", warning: relation.error.message };
    if (!relation.data) return { status: "conflict", warning: "未配置当前主体的PMO→CEO/Sponsor有效汇报关系，不能提交决策包。" };
    targetUserId = input.targetUserId;
    targetRole = String(relation.data.to_business_role);
  } else {
    const committee = await supabase.from("decision_committees").select("id,status")
      .eq("id", input.brief.committeeId || "").eq("org_id", input.brief.orgId).eq("subject_scope", input.brief.subjectScope)
      .eq("subject_id", input.brief.subjectId).eq("data_class", input.brief.dataClass).eq("status", "active").maybeSingle();
    if (committee.error) return { status: storageMissing(committee.error.message) ? "not_configured" : "failed", warning: committee.error.message };
    if (!committee.data) return { status: "conflict", warning: "决策委员会已失效或不属于当前主体/数据分类。" };
  }
  const configuredDeadline = new Date(Date.now() + Number(input.brief.responseSlaMinutes || 1440) * 60_000).toISOString();
  const requestedDeadline = new Date(input.brief.requestedDecisionAt).getTime() <= new Date(configuredDeadline).getTime()
    ? input.brief.requestedDecisionAt : configuredDeadline;
  const { data, error } = await supabase.from("decision_briefs").update({
    status: "submitted", workflow_status: "pending_decision", decision_target_user_id: targetUserId, submitted_by: input.actor.id,
    submitted_at: now, requested_decision_at: requestedDeadline, updated_by: input.actor.id, updated_at: now, version: input.brief.version + 1,
  }).eq("id", input.brief.id).eq("status", "draft").eq("workflow_status", input.brief.workflowStatus).eq("version", input.brief.version).select("*").maybeSingle();
  if (error) return { status: storageMissing(error.message) ? "not_configured" : "failed", warning: error.message };
  if (!data) return { status: "conflict", warning: "决策包已被其他操作更新，请刷新后重试。" };
  await supabase.from("decision_events").insert({ brief_id: input.brief.id, event_type: "submit", from_status: input.brief.workflowStatus, to_status: "pending_decision", actor_user_id: input.actor.id, actor_business_role: input.actorBusinessRole, detail: { authority_mode: input.brief.authorityMode, target_user_id: targetUserId, target_business_role: targetRole, committee_id: input.brief.committeeId, requested_decision_at: requestedDeadline, sla_policy_version: input.brief.slaPolicyVersion }, request_id: input.requestId });
  await audit({ actor: input.actor, action: "decision_brief_submit", briefId: input.brief.id, summary: "决策包已按授权关系提交", role: input.actorBusinessRole, requestId: input.requestId, detail: { authorityMode: input.brief.authorityMode, targetUserId, targetRole, committeeId: input.brief.committeeId } });
  return { status: "succeeded", data: mapBrief(data as Record<string, unknown>) };
}

export async function decideDecisionBrief(input: {
  brief: DecisionBriefRecord;
  outcome: DecisionOutcome;
  selectedOptionKey?: string | null;
  rationale?: string | null;
  conditions?: string | null;
  effectiveAt?: string | null;
  actor: AppUser;
  actorBusinessRole: BusinessRole;
  requestId: string;
}): Promise<DecisionPersistenceResult<{ brief: DecisionBriefRecord; decision: Record<string, unknown> }>> {
  if (!isAuthStorageConfigured()) return { status: "not_configured", warning: "AUTH_STORAGE_NOT_CONFIGURED" };
  if (input.brief.authorityMode === "committee") return { status: "conflict", warning: "委员会决策必须通过实名投票达到法定人数，不能由单人直接代替。" };
  if (input.brief.workflowStatus !== "pending_decision") return { status: "conflict", warning: `决策工作流状态 ${input.brief.workflowStatus} 不允许决策。` };
  try {
    transitionDecisionBrief(input.brief.status, "decide");
    validateDecisionOutcome(input);
  } catch (error) { return { status: "conflict", warning: error instanceof Error ? error.message : "决策输入不合法。" }; }
  const { data, error } = await getAuthSupabase().rpc("decide_decision_brief_tx", {
    p_brief_id: input.brief.id,
    p_expected_status: input.brief.status,
    p_outcome: input.outcome,
    p_selected_option_key: input.selectedOptionKey || "",
    p_rationale: input.rationale,
    p_conditions: input.conditions || null,
    p_effective_at: input.effectiveAt || null,
    p_actor_user_id: input.actor.id,
    p_actor_business_role: input.actorBusinessRole,
    p_request_id: input.requestId,
  });
  if (error) return { status: /CONFLICT|OPTION|ROLE/i.test(error.message) ? "conflict" : storageMissing(error.message) ? "not_configured" : "failed", warning: error.message };
  const payload = asRecord(data);
  if (!payload.brief || !payload.decision) return { status: "failed", warning: "决策事务未返回完整结果。" };
  await audit({ actor: input.actor, action: "decision_brief_decide", briefId: input.brief.id, summary: `CEO决策已生效：${input.outcome}`, role: input.actorBusinessRole, requestId: input.requestId, detail: { outcome: input.outcome } });
  return { status: "succeeded", data: { brief: mapBrief(payload.brief as Record<string, unknown>), decision: payload.decision as Record<string, unknown> } };
}

export async function distributeDecisionBrief(input: {
  brief: DecisionBriefRecord;
  recipients: Array<{ userId: string; businessRole: Extract<BusinessRole, "pm" | "operations" | "business_owner" | "finance" | "quality"> }>;
  actor: AppUser;
  actorBusinessRole: BusinessRole;
  requestId: string;
}): Promise<DecisionPersistenceResult<DecisionBriefRecord>> {
  if (!isAuthStorageConfigured()) return { status: "not_configured", warning: "AUTH_STORAGE_NOT_CONFIGURED" };
  try { transitionDecisionBrief(input.brief.status, "distribute"); }
  catch (error) { return { status: "conflict", warning: error instanceof Error ? error.message : "状态不允许下发。" }; }
  const recipients = input.recipients.filter(item => item.userId && ["pm", "operations", "business_owner", "finance", "quality"].includes(item.businessRole));
  if (recipients.length === 0) return { status: "conflict", warning: "至少需要一位下行接收人。" };
  const supabase = getAuthSupabase();
  const now = new Date().toISOString();
  const roleRows = await supabase.from("user_business_roles").select("user_id,business_role")
    .eq("org_id", input.brief.orgId).eq("subject_scope", input.brief.subjectScope).eq("subject_id", input.brief.subjectId)
    .eq("status", "active").lte("valid_from", now).or(`valid_until.is.null,valid_until.gte.${now}`)
    .in("user_id", [...new Set(recipients.map(item => item.userId))]);
  if (roleRows.error) return { status: storageMissing(roleRows.error.message) ? "not_configured" : "failed", warning: roleRows.error.message };
  const valid = new Set((roleRows.data ?? []).map(row => `${row.user_id}:${row.business_role}`));
  const invalid = recipients.find(item => !valid.has(`${item.userId}:${item.businessRole}`));
  if (invalid) return { status: "conflict", warning: `接收人 ${invalid.userId} 缺少当前主体的 ${invalid.businessRole} 有效业务角色。` };
  const { data, error } = await supabase.rpc("distribute_decision_brief_tx", {
    p_brief_id: input.brief.id,
    p_expected_status: input.brief.status,
    p_recipients: recipients.map(item => ({ user_id: item.userId, business_role: item.businessRole })),
    p_actor_user_id: input.actor.id,
    p_actor_business_role: input.actorBusinessRole,
    p_request_id: input.requestId,
  });
  if (error) return { status: /CONFLICT|RECIPIENT|ROLE/i.test(error.message) ? "conflict" : storageMissing(error.message) ? "not_configured" : "failed", warning: error.message };
  await audit({ actor: input.actor, action: "decision_brief_distribute", briefId: input.brief.id, summary: "决策已下发并创建回执", role: input.actorBusinessRole, requestId: input.requestId, detail: { recipientCount: recipients.length } });
  return { status: "succeeded", data: mapBrief(data as Record<string, unknown>) };
}

export async function acknowledgeDecisionReceipt(input: {
  briefId: string;
  receiptId: string;
  status: "acknowledged" | "disputed";
  response: string;
  actor: AppUser;
  actorBusinessRole: BusinessRole;
  requestId: string;
}): Promise<DecisionPersistenceResult<Record<string, unknown>>> {
  if (!isAuthStorageConfigured()) return { status: "not_configured", warning: "AUTH_STORAGE_NOT_CONFIGURED" };
  if (!input.response.trim()) return { status: "conflict", warning: "回执说明为必填字段。" };
  const { data, error } = await getAuthSupabase().rpc("acknowledge_decision_receipt_tx", {
    p_brief_id: input.briefId, p_receipt_id: input.receiptId, p_status: input.status,
    p_response: input.response.trim(), p_actor_user_id: input.actor.id,
    p_actor_business_role: input.actorBusinessRole, p_request_id: input.requestId,
  });
  if (error) return { status: /RECEIPT|ACTION|ROLE|CONFLICT/i.test(error.message) ? "conflict" : storageMissing(error.message) ? "not_configured" : "failed", warning: error.message };
  await writeOperationAudit({ user: input.actor, action: `decision_receipt_${input.status}`, resourceType: "decision_receipt", resourceId: input.receiptId, status: "succeeded", severity: input.status === "disputed" ? "high" : "medium", summary: input.status === "acknowledged" ? "决策下行回执已确认" : "决策下行回执有异议", detail: { briefId: input.briefId, actorBusinessRole: input.actorBusinessRole }, requestId: input.requestId });
  return { status: "succeeded", data: asRecord(data) };
}

export async function transitionDecisionExecution(input: {
  brief: DecisionBriefRecord;
  briefId: string;
  receiptId: string;
  actionId: string;
  operation: "start_execution" | "submit_execution_evidence";
  evidence?: Array<Record<string, unknown>>;
  comment: string;
  actor: AppUser;
  actorBusinessRole: BusinessRole;
  requestId: string;
}): Promise<DecisionPersistenceResult<Record<string, unknown>>> {
  if (!isAuthStorageConfigured()) return { status: "not_configured", warning: "AUTH_STORAGE_NOT_CONFIGURED" };
  if (!input.comment.trim()) return { status: "conflict", warning: "执行进展说明为必填字段。" };
  const evidence = input.evidence ?? [];
  if (input.operation === "submit_execution_evidence") {
    if (evidence.length === 0 || evidence.some(item => !String(item.source_type || "").trim() || !String(item.source_id || "").trim() || !String(item.title || "").trim())) {
      return { status: "conflict", warning: "提交执行结果必须包含可追溯证据。" };
    }
  }
  const { data, error } = await getAuthSupabase().rpc("transition_decision_execution_action_tx", {
    p_brief_id: input.briefId, p_receipt_id: input.receiptId, p_action_id: input.actionId,
    p_org_id: input.brief.orgId, p_subject_scope: input.brief.subjectScope, p_subject_id: input.brief.subjectId, p_data_class: input.brief.dataClass,
    p_operation: input.operation, p_evidence: evidence, p_comment: input.comment.trim(),
    p_actor_user_id: input.actor.id, p_actor_business_role: input.actorBusinessRole,
    p_request_id: input.requestId,
  });
  if (error) return { status: /RECEIPT|ACTION|ROLE|CONFLICT|EVIDENCE/i.test(error.message) ? "conflict" : storageMissing(error.message) ? "not_configured" : "failed", warning: error.message };
  return { status: "succeeded", data: asRecord(data) };
}

export async function submitDecisionEffectReview(input: {
  brief: DecisionBriefRecord;
  expectedEffect: string;
  actualEffect: string;
  outcome: "achieved" | "partially_achieved" | "not_achieved" | "too_early";
  metrics: Record<string, unknown>;
  evidence: Array<Record<string, unknown>>;
  actor: AppUser;
  actorBusinessRole: BusinessRole;
  requestId: string;
}): Promise<DecisionPersistenceResult<Record<string, unknown>>> {
  if (!isAuthStorageConfigured()) return { status: "not_configured", warning: "AUTH_STORAGE_NOT_CONFIGURED" };
  if (!(input.expectedEffect.trim() && input.actualEffect.trim()) || input.evidence.length === 0) return { status: "conflict", warning: "效果复核必须包含预期、实际效果和至少一条证据。" };
  if (!["executing", "effect_review"].includes(input.brief.workflowStatus)) return { status: "conflict", warning: `决策工作流状态 ${input.brief.workflowStatus} 不允许提交效果复核。` };
  const supabase = getAuthSupabase();
  const decision = await supabase.from("decisions").select("id").eq("brief_id", input.brief.id).maybeSingle();
  if (decision.error || !decision.data) return { status: decision.error ? "failed" : "not_found", warning: decision.error?.message || "决策记录不存在。" };
  const receipt = await supabase.from("decision_receipts").select("id,status,action_item_id")
    .eq("decision_id", decision.data.id).eq("recipient_user_id", input.actor.id).eq("recipient_business_role", input.actorBusinessRole).maybeSingle();
  if (receipt.error) return { status: storageMissing(receipt.error.message) ? "not_configured" : "failed", warning: receipt.error.message };
  if (!receipt.data || receipt.data.status !== "acknowledged") return { status: "conflict", warning: "DECISION_RECEIPT_ACK_REQUIRED：请先确认决策回执，再提交效果复核。" };
  const links = await supabase.from("decision_execution_actions").select("action_item_id")
    .eq("brief_id", input.brief.id).eq("receipt_id", receipt.data.id).eq("org_id", input.brief.orgId)
    .eq("subject_scope", input.brief.subjectScope).eq("subject_id", input.brief.subjectId).eq("data_class", input.brief.dataClass);
  if (links.error) return { status: storageMissing(links.error.message) ? "not_configured" : "failed", warning: links.error.message };
  const actionIds = (links.data ?? []).map(item => String(item.action_item_id));
  const executions = actionIds.length > 0 ? await supabase.from("unified_action_items").select("id,status").in("id", actionIds) : { data: [], error: null };
  if (executions.error) return { status: storageMissing(executions.error.message) ? "not_configured" : "failed", warning: executions.error.message };
  if (actionIds.length === 0 || (executions.data ?? []).length !== actionIds.length || (executions.data ?? []).some(item => item.status !== "evidence_submitted")) return { status: "conflict", warning: "DECISION_EXECUTION_EVIDENCE_REQUIRED：请先完成所有决策行动模板并提交可追溯证据。" };
  const existingReview = await supabase.from("decision_effect_reviews").select("id")
    .eq("brief_id", input.brief.id).eq("submitted_by", input.actor.id)
    .eq("submitted_business_role", input.actorBusinessRole).in("status", ["submitted", "approved"]).limit(1).maybeSingle();
  if (existingReview.error) return { status: storageMissing(existingReview.error.message) ? "not_configured" : "failed", warning: existingReview.error.message };
  if (existingReview.data) return { status: "conflict", warning: "当前执行人已提交待复核或已通过的效果记录。" };
  const { data, error } = await supabase.from("decision_effect_reviews").insert({
    decision_id: decision.data.id, brief_id: input.brief.id, expected_effect: input.expectedEffect.trim(), actual_effect: input.actualEffect.trim(),
    outcome: input.outcome, metrics: input.metrics, evidence: input.evidence, submitted_by: input.actor.id, submitted_business_role: input.actorBusinessRole,
  }).select("*").single();
  if (error) return { status: storageMissing(error.message) ? "not_configured" : "failed", warning: error.message };
  if (input.brief.status === "distributed") await supabase.from("decision_briefs").update({ status: "effect_review_pending", workflow_status: "effect_review", updated_by: input.actor.id, updated_at: new Date().toISOString(), version: input.brief.version + 1 }).eq("id", input.brief.id).eq("status", "distributed").eq("workflow_status", input.brief.workflowStatus);
  await supabase.from("decision_events").insert({ brief_id: input.brief.id, event_type: "submit_effect_review", from_status: input.brief.workflowStatus, to_status: "effect_review", actor_user_id: input.actor.id, actor_business_role: input.actorBusinessRole, detail: { review_id: data.id, execution_action_ids: actionIds, review_metrics: input.brief.reviewMetrics }, request_id: input.requestId });
  return { status: "succeeded", data: data as Record<string, unknown> };
}

export async function reviewDecisionEffect(input: {
  brief: DecisionBriefRecord;
  reviewId: string;
  approved: boolean;
  comment: string;
  actor: AppUser;
  actorBusinessRole: BusinessRole;
  requestId: string;
}): Promise<DecisionPersistenceResult<DecisionBriefRecord>> {
  if (!isAuthStorageConfigured()) return { status: "not_configured", warning: "AUTH_STORAGE_NOT_CONFIGURED" };
  if (input.brief.status !== "effect_review_pending" || input.brief.workflowStatus !== "effect_review") return { status: "conflict", warning: "当前不在效果复核审核阶段。" };
  if (!input.comment.trim()) return { status: "conflict", warning: "效果复核审核意见为必填字段。" };
  const supabase = getAuthSupabase();
  const { data: review, error } = await supabase.from("decision_effect_reviews").update({
    status: input.approved ? "approved" : "rejected", reviewed_by: input.actor.id, reviewed_at: new Date().toISOString(), review_comment: input.comment.trim(), updated_at: new Date().toISOString(),
  }).eq("id", input.reviewId).eq("brief_id", input.brief.id).eq("status", "submitted").select("*").maybeSingle();
  if (error) return { status: storageMissing(error.message) ? "not_configured" : "failed", warning: error.message };
  if (!review) return { status: "conflict", warning: "复核记录不存在或已处理。" };
  let next = "effect_review_pending";
  if (input.approved) {
    const [receipts, approvedReviews] = await Promise.all([
      supabase.from("decision_receipts").select("recipient_user_id,recipient_business_role").eq("brief_id", input.brief.id),
      supabase.from("decision_effect_reviews").select("submitted_by,submitted_business_role").eq("brief_id", input.brief.id).eq("status", "approved"),
    ]);
    const gateError = receipts.error || approvedReviews.error;
    if (gateError) return { status: storageMissing(gateError.message) ? "not_configured" : "failed", warning: gateError.message };
    const approved = new Set((approvedReviews.data ?? []).map(item => `${item.submitted_by}:${item.submitted_business_role}`));
    if ((receipts.data ?? []).length > 0 && (receipts.data ?? []).every(item => approved.has(`${item.recipient_user_id}:${item.recipient_business_role}`))) next = "effect_reviewed";
  }
  const briefResult = await supabase.from("decision_briefs").update({ status: next, workflow_status: "effect_review", effect_reviewed_at: input.approved ? new Date().toISOString() : null, updated_by: input.actor.id, updated_at: new Date().toISOString(), version: input.brief.version + 1 }).eq("id", input.brief.id).eq("status", "effect_review_pending").eq("workflow_status", "effect_review").eq("version", input.brief.version).select("*").single();
  if (briefResult.error) return { status: "failed", warning: briefResult.error.message };
  await supabase.from("decision_events").insert({ brief_id: input.brief.id, event_type: input.approved ? "approve_effect_review" : "reject_effect_review", from_status: "effect_review_pending", to_status: next, actor_user_id: input.actor.id, actor_business_role: input.actorBusinessRole, detail: { review_id: input.reviewId }, request_id: input.requestId });
  return { status: "succeeded", data: mapBrief(briefResult.data as Record<string, unknown>) };
}

export async function closeDecisionBrief(input: { brief: DecisionBriefRecord; actor: AppUser; actorBusinessRole: BusinessRole; requestId: string }): Promise<DecisionPersistenceResult<DecisionBriefRecord>> {
  if (!isAuthStorageConfigured()) return { status: "not_configured", warning: "AUTH_STORAGE_NOT_CONFIGURED" };
  const { data, error } = await getAuthSupabase().rpc("close_decision_brief_tx", { p_brief_id: input.brief.id, p_actor_user_id: input.actor.id, p_actor_business_role: input.actorBusinessRole, p_request_id: input.requestId });
  if (error) return { status: /REQUIRED|PENDING|ROLE|CONFLICT/i.test(error.message) ? "conflict" : storageMissing(error.message) ? "not_configured" : "failed", warning: error.message };
  await audit({ actor: input.actor, action: "decision_brief_close", briefId: input.brief.id, summary: "决策下行回执与效果复核已完成，决策闭环", role: input.actorBusinessRole, requestId: input.requestId });
  return { status: "succeeded", data: mapBrief(data as Record<string, unknown>) };
}

export async function requestDecisionEvidence(input: {
  brief: DecisionBriefRecord;
  requiredItems: string[];
  reason: string;
  dueAt: string;
  actor: AppUser;
  actorBusinessRole: BusinessRole;
  requestId: string;
}): Promise<DecisionPersistenceResult<Record<string, unknown>>> {
  if (!isAuthStorageConfigured()) return { status: "not_configured", warning: "AUTH_STORAGE_NOT_CONFIGURED" };
  const requiredItems = [...new Set(input.requiredItems.map(item => item.trim()).filter(Boolean))];
  if (requiredItems.length === 0 || !input.reason.trim() || !Number.isFinite(new Date(input.dueAt).getTime())) return { status: "conflict", warning: "补证要求、原因和截止时间为必填项。" };
  const { data, error } = await getAuthSupabase().rpc("request_decision_evidence_tx", {
    p_brief_id: input.brief.id, p_org_id: input.brief.orgId, p_subject_scope: input.brief.subjectScope,
    p_subject_id: input.brief.subjectId, p_data_class: input.brief.dataClass, p_required_items: requiredItems,
    p_reason: input.reason.trim(), p_due_at: input.dueAt, p_actor_user_id: input.actor.id,
    p_actor_business_role: input.actorBusinessRole, p_request_id: input.requestId,
  });
  if (error) return { status: /CONFLICT|ROLE|SCOPE|DATA_CLASS|INVALID|REQUIRED/i.test(error.message) ? "conflict" : storageMissing(error.message) ? "not_configured" : "failed", warning: error.message };
  await audit({ actor: input.actor, action: "decision_request_evidence", briefId: input.brief.id, summary: "授权决策人已退回补证", role: input.actorBusinessRole, requestId: input.requestId, detail: { requiredItems, dueAt: input.dueAt } });
  return { status: "succeeded", data: asRecord(data) };
}

export async function respondDecisionEvidence(input: {
  brief: DecisionBriefRecord;
  evidenceRequestId: string;
  operation: "submit" | "accept" | "reject";
  response: string;
  evidence: Array<Record<string, unknown>>;
  actor: AppUser;
  actorBusinessRole: BusinessRole;
  requestId: string;
}): Promise<DecisionPersistenceResult<Record<string, unknown>>> {
  if (!isAuthStorageConfigured()) return { status: "not_configured", warning: "AUTH_STORAGE_NOT_CONFIGURED" };
  if (!input.response.trim()) return { status: "conflict", warning: "补证回复/复核意见为必填项。" };
  if (input.operation === "submit" && (input.evidence.length === 0 || input.evidence.some(item => !String(item.source_type || "").trim() || !String(item.source_id || "").trim() || !String(item.title || "").trim()))) return { status: "conflict", warning: "提交补证必须包含可追溯的来源类型、记录ID和标题。" };
  const { data, error } = await getAuthSupabase().rpc("respond_decision_evidence_tx", {
    p_brief_id: input.brief.id, p_request_id_value: input.evidenceRequestId, p_org_id: input.brief.orgId,
    p_subject_scope: input.brief.subjectScope, p_subject_id: input.brief.subjectId, p_data_class: input.brief.dataClass,
    p_operation: input.operation, p_response: input.response.trim(), p_evidence: input.evidence,
    p_actor_user_id: input.actor.id, p_actor_business_role: input.actorBusinessRole, p_operation_request_id: input.requestId,
  });
  if (error) return { status: /CONFLICT|ROLE|SCOPE|DATA_CLASS|INVALID|REQUIRED|FORBIDDEN/i.test(error.message) ? "conflict" : storageMissing(error.message) ? "not_configured" : "failed", warning: error.message };
  return { status: "succeeded", data: asRecord(data) };
}

export async function castDecisionVote(input: {
  brief: DecisionBriefRecord;
  vote: "approve" | "reject" | "abstain";
  selectedOptionKey?: string | null;
  rationale: string;
  actor: AppUser;
  actorBusinessRole: BusinessRole;
  requestId: string;
}): Promise<DecisionPersistenceResult<Record<string, unknown>>> {
  if (!isAuthStorageConfigured()) return { status: "not_configured", warning: "AUTH_STORAGE_NOT_CONFIGURED" };
  if (!input.rationale.trim()) return { status: "conflict", warning: "委员会投票必须填写理由。" };
  const { data, error } = await getAuthSupabase().rpc("cast_decision_vote_tx", {
    p_brief_id: input.brief.id, p_org_id: input.brief.orgId, p_subject_scope: input.brief.subjectScope,
    p_subject_id: input.brief.subjectId, p_data_class: input.brief.dataClass, p_vote: input.vote,
    p_selected_option_key: input.selectedOptionKey || "", p_rationale: input.rationale.trim(),
    p_actor_user_id: input.actor.id, p_actor_business_role: input.actorBusinessRole, p_request_id: input.requestId,
  });
  if (error) return { status: /CONFLICT|ROLE|SCOPE|DATA_CLASS|INVALID|FORBIDDEN|RECUSED|OPTION/i.test(error.message) ? "conflict" : storageMissing(error.message) ? "not_configured" : "failed", warning: error.message };
  await audit({ actor: input.actor, action: `decision_committee_vote_${input.vote}`, briefId: input.brief.id, summary: input.vote === "abstain" ? "委员会成员已弃权" : "委员会成员已实名投票", role: input.actorBusinessRole, requestId: input.requestId });
  return { status: "succeeded", data: asRecord(data) };
}

export async function recordDecisionAuthorityResponse(input: {
  brief: DecisionBriefRecord;
  responseType: "declined" | "abstained" | "recused";
  reason: string;
  actor: AppUser;
  actorBusinessRole: BusinessRole;
  requestId: string;
}): Promise<DecisionPersistenceResult<Record<string, unknown>>> {
  if (!isAuthStorageConfigured()) return { status: "not_configured", warning: "AUTH_STORAGE_NOT_CONFIGURED" };
  if (!input.reason.trim()) return { status: "conflict", warning: "拒绝、弃权或回避必须说明原因。" };
  const { data, error } = await getAuthSupabase().rpc("record_decision_authority_response_tx", {
    p_brief_id: input.brief.id, p_org_id: input.brief.orgId, p_subject_scope: input.brief.subjectScope,
    p_subject_id: input.brief.subjectId, p_data_class: input.brief.dataClass, p_response_type: input.responseType,
    p_reason: input.reason.trim(), p_actor_user_id: input.actor.id, p_actor_business_role: input.actorBusinessRole, p_request_id: input.requestId,
  });
  if (error) return { status: /CONFLICT|ROLE|SCOPE|DATA_CLASS|INVALID|FORBIDDEN/i.test(error.message) ? "conflict" : storageMissing(error.message) ? "not_configured" : "failed", warning: error.message };
  return { status: "succeeded", data: asRecord(data) };
}

export async function reassignDecisionAuthority(input: {
  brief: DecisionBriefRecord;
  targetUserId: string;
  targetBusinessRole: "ceo" | "sponsor";
  reason: string;
  actor: AppUser;
  actorBusinessRole: BusinessRole;
  requestId: string;
}): Promise<DecisionPersistenceResult<DecisionBriefRecord>> {
  if (!isAuthStorageConfigured()) return { status: "not_configured", warning: "AUTH_STORAGE_NOT_CONFIGURED" };
  const { data, error } = await getAuthSupabase().rpc("reassign_decision_authority_tx", {
    p_brief_id: input.brief.id, p_org_id: input.brief.orgId, p_subject_scope: input.brief.subjectScope,
    p_subject_id: input.brief.subjectId, p_data_class: input.brief.dataClass, p_target_user_id: input.targetUserId,
    p_target_business_role: input.targetBusinessRole, p_reason: input.reason.trim(), p_actor_user_id: input.actor.id,
    p_actor_business_role: input.actorBusinessRole, p_request_id: input.requestId,
  });
  if (error) return { status: /CONFLICT|ROLE|SCOPE|DATA_CLASS|INVALID|FORBIDDEN|RELATIONSHIP/i.test(error.message) ? "conflict" : storageMissing(error.message) ? "not_configured" : "failed", warning: error.message };
  return { status: "succeeded", data: mapBrief(asRecord(data)) };
}

export async function reopenDecisionBrief(input: {
  brief: DecisionBriefRecord;
  triggeredCondition: string;
  reason: string;
  evidence: Array<Record<string, unknown>>;
  actor: AppUser;
  actorBusinessRole: BusinessRole;
  requestId: string;
}): Promise<DecisionPersistenceResult<Record<string, unknown>>> {
  if (!isAuthStorageConfigured()) return { status: "not_configured", warning: "AUTH_STORAGE_NOT_CONFIGURED" };
  const { data, error } = await getAuthSupabase().rpc("reopen_decision_brief_tx", {
    p_brief_id: input.brief.id, p_org_id: input.brief.orgId, p_subject_scope: input.brief.subjectScope,
    p_subject_id: input.brief.subjectId, p_data_class: input.brief.dataClass, p_triggered_condition: input.triggeredCondition.trim(),
    p_reason: input.reason.trim(), p_evidence: input.evidence, p_actor_user_id: input.actor.id,
    p_actor_business_role: input.actorBusinessRole, p_request_id: input.requestId,
  });
  if (error) return { status: /CONFLICT|ROLE|SCOPE|DATA_CLASS|REQUIRED|CONDITION/i.test(error.message) ? "conflict" : storageMissing(error.message) ? "not_configured" : "failed", warning: error.message };
  return { status: "succeeded", data: asRecord(data) };
}

export async function createDecisionCommittee(input: {
  orgId: string; subjectScope: Extract<SubjectScope, "project" | "portfolio" | "organization">; subjectId: string;
  dataClass: DecisionBriefRecord["dataClass"]; name: string; decisionLevels: DecisionLevel[]; chairUserId: string;
  quorum: number; minApprovals: number; members: Array<{ user_id: string; business_role: "ceo" | "sponsor"; member_role: "chair" | "voter" | "observer"; delegated_from_user_id?: string | null }>;
  validUntil: string | null; actor: AppUser; actorBusinessRole: BusinessRole; requestId: string;
}): Promise<DecisionPersistenceResult<Record<string, unknown>>> {
  if (!isAuthStorageConfigured()) return { status: "not_configured", warning: "AUTH_STORAGE_NOT_CONFIGURED" };
  const { data, error } = await getAuthSupabase().rpc("create_decision_committee_tx", {
    p_org_id: input.orgId, p_subject_scope: input.subjectScope, p_subject_id: input.subjectId, p_data_class: input.dataClass,
    p_name: input.name.trim(), p_decision_levels: input.decisionLevels, p_chair_user_id: input.chairUserId,
    p_quorum: input.quorum, p_min_approvals: input.minApprovals, p_members: input.members,
    p_valid_until: input.validUntil, p_actor_user_id: input.actor.id, p_actor_business_role: input.actorBusinessRole,
    p_request_id: input.requestId,
  });
  if (error) return { status: /ROLE|SCOPE|INVALID|REQUIRED|MEMBER|CHAIR/i.test(error.message) ? "conflict" : storageMissing(error.message) ? "not_configured" : "failed", warning: error.message };
  return { status: "succeeded", data: asRecord(data) };
}

export async function listReportingSnapshots(input: { orgId: string; subjectScope: SubjectScope; subjectId: string; dataClass: DecisionBriefRecord["dataClass"] }): Promise<DecisionPersistenceResult<Record<string, unknown>[]>> {
  if (!isAuthStorageConfigured()) return { status: "not_configured", warning: "AUTH_STORAGE_NOT_CONFIGURED" };
  const { data, error } = await getAuthSupabase().from("reporting_snapshots").select("*,reporting_receipts(*),reporting_snapshot_events(*)").eq("org_id", input.orgId).eq("subject_scope", input.subjectScope).eq("subject_id", input.subjectId).eq("data_class", input.dataClass).order("period_start", { ascending: false }).limit(100);
  if (error) return { status: storageMissing(error.message) ? "not_configured" : "failed", warning: error.message };
  return { status: "succeeded", data: (data ?? []) as Record<string, unknown>[] };
}

export async function getReportingSnapshot(id: string): Promise<DecisionPersistenceResult<Record<string, unknown>>> {
  if (!isAuthStorageConfigured()) return { status: "not_configured", warning: "AUTH_STORAGE_NOT_CONFIGURED" };
  const { data, error } = await getAuthSupabase().from("reporting_snapshots").select("*").eq("id", id).maybeSingle();
  if (error) return { status: storageMissing(error.message) ? "not_configured" : "failed", warning: error.message };
  if (!data) return { status: "not_found", warning: "汇报快照不存在。" };
  return { status: "succeeded", data: data as Record<string, unknown> };
}

export async function acceptReportingSnapshot(input: { snapshotId: string; actor: AppUser; actorBusinessRole: BusinessRole }): Promise<DecisionPersistenceResult<Record<string, unknown>>> {
  if (!isAuthStorageConfigured()) return { status: "not_configured", warning: "AUTH_STORAGE_NOT_CONFIGURED" };
  const snapshot = await getReportingSnapshot(input.snapshotId);
  if (snapshot.status !== "succeeded" || !snapshot.data) return snapshot;
  return transitionReportingSnapshotState({ snapshot: snapshot.data, operation: "freeze", reason: "PMO已接收并冻结作为会议/决策依据", dueAt: null, actor: input.actor, actorBusinessRole: input.actorBusinessRole, requestId: crypto.randomUUID() });
}

export async function createReportingSnapshot(input: { snapshot: ReportingSnapshotInput; actor: AppUser; actorBusinessRole: BusinessRole; requestId: string }): Promise<DecisionPersistenceResult<Record<string, unknown>>> {
  if (!isAuthStorageConfigured()) return { status: "not_configured", warning: "AUTH_STORAGE_NOT_CONFIGURED" };
  const sourceDefinition = asRecord(input.snapshot.sourceDefinition);
  if (!input.snapshot.narrative.trim() || Object.keys(sourceDefinition).length === 0 || !Number.isFinite(new Date(input.snapshot.sourceSnapshotAt).getTime())) return { status: "conflict", warning: "汇报快照必须包含真实数据来源、数据时点与业务摘要。" };
  const { data, error } = await getAuthSupabase().rpc("create_reporting_snapshot_tx", {
    p_org_id: input.snapshot.orgId, p_subject_scope: input.snapshot.subjectScope, p_subject_id: input.snapshot.subjectId,
    p_data_class: input.snapshot.dataClass, p_snapshot_type: input.snapshot.snapshotType,
    p_period_start: input.snapshot.periodStart, p_period_end: input.snapshot.periodEnd, p_metrics: input.snapshot.metrics,
    p_exceptions: input.snapshot.exceptions, p_narrative: input.snapshot.narrative.trim(), p_source_snapshot_at: input.snapshot.sourceSnapshotAt,
    p_source_definition: sourceDefinition, p_submitted_to_user_id: input.snapshot.submittedToUserId ?? null,
    p_actor_user_id: input.actor.id, p_actor_business_role: input.actorBusinessRole, p_request_id: input.requestId,
  });
  if (error) return { status: storageMissing(error.message) ? "not_configured" : "failed", warning: error.message };
  return { status: "succeeded", data: data as Record<string, unknown> };
}

export async function transitionReportingSnapshotState(input: {
  snapshot: Record<string, unknown>;
  operation: "submit" | "return" | "resubmit" | "freeze" | "supersede";
  reason: string;
  dueAt: string | null;
  actor: AppUser;
  actorBusinessRole: BusinessRole;
  requestId: string;
}): Promise<DecisionPersistenceResult<Record<string, unknown>>> {
  if (!isAuthStorageConfigured()) return { status: "not_configured", warning: "AUTH_STORAGE_NOT_CONFIGURED" };
  const { data, error } = await getAuthSupabase().rpc("transition_reporting_snapshot_tx", {
    p_snapshot_id: String(input.snapshot.id), p_org_id: String(input.snapshot.org_id),
    p_subject_scope: String(input.snapshot.subject_scope), p_subject_id: String(input.snapshot.subject_id),
    p_data_class: String(input.snapshot.data_class), p_expected_status: String(input.snapshot.status),
    p_operation: input.operation, p_reason: input.reason.trim() || null, p_due_at: input.dueAt,
    p_actor_user_id: input.actor.id, p_actor_business_role: input.actorBusinessRole, p_request_id: input.requestId,
  });
  if (error) return { status: /CONFLICT|ROLE|SCOPE|DATA_CLASS|INVALID|REQUIRED|RECIPIENT|RELATIONSHIP/i.test(error.message) ? "conflict" : storageMissing(error.message) ? "not_configured" : "failed", warning: error.message };
  return { status: "succeeded", data: asRecord(data) };
}

export async function listGovernanceMeetings(input: { orgId: string; subjectScope: SubjectScope; subjectId: string; dataClass: DecisionBriefRecord["dataClass"] }): Promise<DecisionPersistenceResult<Record<string, unknown>[]>> {
  if (!isAuthStorageConfigured()) return { status: "not_configured", warning: "AUTH_STORAGE_NOT_CONFIGURED" };
  const { data, error } = await getAuthSupabase().from("governance_meetings").select("*,governance_meeting_delegates(*),meeting_conclusion_outputs(*),meeting_review_plans(*)").eq("org_id", input.orgId).eq("subject_scope", input.subjectScope).eq("subject_id", input.subjectId).eq("data_class", input.dataClass).order("scheduled_at", { ascending: false }).limit(100);
  if (error) return { status: storageMissing(error.message) ? "not_configured" : "failed", warning: error.message };
  return { status: "succeeded", data: (data ?? []) as Record<string, unknown>[] };
}

export async function getGovernanceMeeting(id: string): Promise<DecisionPersistenceResult<Record<string, unknown>>> {
  if (!isAuthStorageConfigured()) return { status: "not_configured", warning: "AUTH_STORAGE_NOT_CONFIGURED" };
  const { data, error } = await getAuthSupabase().from("governance_meetings").select("*").eq("id", id).maybeSingle();
  if (error) return { status: storageMissing(error.message) ? "not_configured" : "failed", warning: error.message };
  if (!data) return { status: "not_found", warning: "治理会议不存在。" };
  return { status: "succeeded", data: data as Record<string, unknown> };
}

export async function createGovernanceMeeting(input: { meeting: GovernanceMeetingInput; actor: AppUser; actorBusinessRole: BusinessRole }): Promise<DecisionPersistenceResult<Record<string, unknown>>> {
  if (!isAuthStorageConfigured()) return { status: "not_configured", warning: "AUTH_STORAGE_NOT_CONFIGURED" };
  if (!input.meeting.title.trim() || !Number.isFinite(new Date(input.meeting.scheduledAt).getTime()) || input.meeting.agenda.length === 0) return { status: "conflict", warning: "治理会议必须包含标题、时间和议程。" };
  const { data, error } = await getAuthSupabase().from("governance_meetings").insert({
    org_id: input.meeting.orgId, subject_scope: input.meeting.subjectScope, subject_id: input.meeting.subjectId,
    meeting_type: input.meeting.meetingType, title: input.meeting.title.trim(), scheduled_at: input.meeting.scheduledAt,
    chair_user_id: input.actor.id, attendee_user_ids: input.meeting.attendeeUserIds,
    agenda: input.meeting.agenda, reporting_snapshot_ids: input.meeting.reportingSnapshotIds, created_by: input.actor.id,
    data_class: input.meeting.dataClass, timezone: input.meeting.timezone || "Asia/Shanghai", working_calendar_key: input.meeting.workingCalendarKey || "CN-standard",
  }).select("*").single();
  if (error) return { status: storageMissing(error.message) ? "not_configured" : "failed", warning: error.message };
  return { status: "succeeded", data: data as Record<string, unknown> };
}

export async function recordGovernanceMeetingOutcome(input: { meeting: Record<string, unknown>; minutes: string; conclusions: Array<Record<string, unknown>>; actor: AppUser; actorBusinessRole: BusinessRole; requestId: string }): Promise<DecisionPersistenceResult<Record<string, unknown>>> {
  if (!isAuthStorageConfigured()) return { status: "not_configured", warning: "AUTH_STORAGE_NOT_CONFIGURED" };
  let conclusions;
  try { conclusions = validateMeetingConclusions(input.conclusions); }
  catch (error) { return { status: "conflict", warning: error instanceof Error ? error.message : "会议结论格式不合法。" }; }
  const { data, error } = await getAuthSupabase().rpc("record_governance_meeting_outcome_tx", {
    p_meeting_id: String(input.meeting.id), p_org_id: String(input.meeting.org_id), p_subject_scope: String(input.meeting.subject_scope),
    p_subject_id: String(input.meeting.subject_id), p_data_class: String(input.meeting.data_class), p_expected_status: String(input.meeting.status),
    p_minutes: input.minutes.trim(), p_conclusions: conclusions, p_actor_user_id: input.actor.id,
    p_actor_business_role: input.actorBusinessRole, p_request_id: input.requestId,
  });
  if (error) return { status: /CONFLICT|ROLE|SCOPE|DATA_CLASS|INVALID|REQUIRED|OWNER/i.test(error.message) ? "conflict" : storageMissing(error.message) ? "not_configured" : "failed", warning: error.message };
  return { status: "succeeded", data: asRecord(data) };
}

export async function transitionGovernanceMeetingState(input: { meeting: Record<string, unknown>; operation: string; reason: string; rescheduledAt: string | null; impactedDecisionIds: string[]; actor: AppUser; actorBusinessRole: BusinessRole; requestId: string }): Promise<DecisionPersistenceResult<Record<string, unknown>>> {
  if (!isAuthStorageConfigured()) return { status: "not_configured", warning: "AUTH_STORAGE_NOT_CONFIGURED" };
  const { data, error } = await getAuthSupabase().rpc("transition_governance_meeting_tx", {
    p_meeting_id: String(input.meeting.id), p_org_id: String(input.meeting.org_id), p_subject_scope: String(input.meeting.subject_scope),
    p_subject_id: String(input.meeting.subject_id), p_data_class: String(input.meeting.data_class), p_expected_status: String(input.meeting.status),
    p_operation: input.operation, p_reason: input.reason.trim() || null, p_rescheduled_at: input.rescheduledAt,
    p_impacted_decision_ids: input.impactedDecisionIds, p_actor_user_id: input.actor.id, p_actor_business_role: input.actorBusinessRole, p_request_id: input.requestId,
  });
  if (error) return { status: /CONFLICT|ROLE|SCOPE|DATA_CLASS|INVALID|REQUIRED|FROZEN|REVIEW|DELEGATION/i.test(error.message) ? "conflict" : storageMissing(error.message) ? "not_configured" : "failed", warning: error.message };
  return { status: "succeeded", data: asRecord(data) };
}

export async function reviewGovernanceMeetingOutput(input: { meeting: Record<string, unknown>; reviewPlanId: string; result: string; approved: boolean; actor: AppUser; actorBusinessRole: BusinessRole; requestId: string }): Promise<DecisionPersistenceResult<Record<string, unknown>>> {
  if (!isAuthStorageConfigured()) return { status: "not_configured", warning: "AUTH_STORAGE_NOT_CONFIGURED" };
  if (input.actorBusinessRole !== "pmo" || String(input.meeting.status) !== "effect_review" || !input.result.trim()) return { status: "conflict", warning: "只有PMO可在效果复核阶段提交有结论的复核。" };
  const { data, error } = await getAuthSupabase().from("meeting_review_plans").update({ status: input.approved ? "accepted" : "rejected", result: { conclusion: input.result.trim() }, reviewed_by: input.actor.id, reviewed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", input.reviewPlanId).eq("meeting_id", input.meeting.id).eq("org_id", input.meeting.org_id).eq("subject_scope", input.meeting.subject_scope).eq("subject_id", input.meeting.subject_id).eq("data_class", input.meeting.data_class).in("status", ["planned", "due", "submitted", "rejected"]).select("*").maybeSingle();
  if (error) return { status: storageMissing(error.message) ? "not_configured" : "failed", warning: error.message };
  if (!data) return { status: "conflict", warning: "复审计划不存在、已处理或不属于当前主体/数据分类。" };
  await writeOperationAudit({ user: input.actor, action: input.approved ? "meeting_output_review_accepted" : "meeting_output_review_rejected", resourceType: "meeting_review_plan", resourceId: input.reviewPlanId, status: "succeeded", severity: "medium", summary: "会议输出效果复核已记录", detail: { meetingId: input.meeting.id, actorBusinessRole: input.actorBusinessRole, result: input.result.trim() }, requestId: input.requestId });
  return { status: "succeeded", data: data as Record<string, unknown> };
}

export async function assignGovernanceMeetingDelegate(input: { meeting: Record<string, unknown>; absentUserId: string; absentBusinessRole: BusinessRole; proxyUserId: string; proxyBusinessRole: BusinessRole; reason: string; validFrom: string; validUntil: string; actor: AppUser }): Promise<DecisionPersistenceResult<Record<string, unknown>>> {
  if (!isAuthStorageConfigured()) return { status: "not_configured", warning: "AUTH_STORAGE_NOT_CONFIGURED" };
  if (input.actor.id !== input.absentUserId && input.actor.role !== "admin") return { status: "conflict", warning: "缺席代理必须由缺席人本人或系统管理员限时授权。" };
  const supabase = getAuthSupabase();
  const role = await supabase.from("user_business_roles").select("id").eq("org_id", String(input.meeting.org_id)).eq("subject_scope", String(input.meeting.subject_scope)).eq("subject_id", String(input.meeting.subject_id)).eq("user_id", input.proxyUserId).eq("business_role", input.proxyBusinessRole).eq("status", "active").limit(1).maybeSingle();
  if (role.error) return { status: storageMissing(role.error.message) ? "not_configured" : "failed", warning: role.error.message };
  if (!role.data) return { status: "conflict", warning: "代理人在当前主体下没有有效业务角色。" };
  const { data, error } = await supabase.from("governance_meeting_delegates").insert({ meeting_id: input.meeting.id, org_id: input.meeting.org_id, subject_scope: input.meeting.subject_scope, subject_id: input.meeting.subject_id, data_class: input.meeting.data_class, absent_user_id: input.absentUserId, proxy_user_id: input.proxyUserId, absent_business_role: input.absentBusinessRole, proxy_business_role: input.proxyBusinessRole, reason: input.reason.trim(), valid_from: input.validFrom, valid_until: input.validUntil, granted_by: input.actor.id }).select("*").single();
  if (error) return { status: /duplicate|constraint/i.test(error.message) ? "conflict" : storageMissing(error.message) ? "not_configured" : "failed", warning: error.message };
  return { status: "succeeded", data: data as Record<string, unknown> };
}
