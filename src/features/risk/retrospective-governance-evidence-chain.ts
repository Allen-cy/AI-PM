import type { AppUser } from "../auth/server.ts";
import {
  getGovernanceInstanceBundle,
  listGovernanceInstances,
} from "../governance/repository.ts";
import {
  isTerminalGovernanceState,
  type GovernanceActionRecord,
  type GovernanceEventRecord,
  type GovernanceInstanceRecord,
} from "../governance/model.ts";
import {
  getRiskRetrospectiveGovernanceFollowup,
  transitionRiskRetrospectiveGovernanceFollowup,
  type RiskRetrospectiveGovernanceFollowupRecord,
  type RiskRetrospectiveGovernanceFollowupStatus,
} from "./retrospective-governance-followups.ts";
import {
  getRiskRetrospectiveGovernanceReminderLog,
  type RiskRetrospectiveGovernanceReminderLog,
} from "./retrospective-governance-operations.ts";
import {
  buildKnowledgeGovernanceWritebackRecommendation,
  type KnowledgeGovernanceFollowupWritebackRecommendation,
} from "./retrospective-governance-evidence-chain-model.ts";

export type KnowledgeGovernanceEvidenceLinkStatus = "active" | "pending_review" | "applied" | "rejected";
export type KnowledgeGovernanceEvidenceReviewStatus = "pending" | "approved" | "rejected";

export interface KnowledgeGovernanceEvidenceLink {
  id: string;
  sourceFollowupId: string | null;
  reminderLogId: string | null;
  unifiedActionId: string | null;
  governanceInstanceId: string;
  linkType: "knowledge_governance_escalation";
  status: KnowledgeGovernanceEvidenceLinkStatus;
  closureRecommendation: string | null;
  reviewerName: string | null;
  reviewStatus: KnowledgeGovernanceEvidenceReviewStatus;
  reviewNote: string | null;
  appliedAt: string | null;
  requestId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeGovernanceUnifiedActionNode {
  id: string;
  title: string;
  owner: string | null;
  dueDate: string | null;
  status: string;
  priority: string;
  closeEvidence: string | null;
  sourceType: string | null;
  sourceId: string | null;
  updatedAt: string;
}

export interface KnowledgeGovernanceEvidenceTimelineItem {
  at: string;
  type: "followup" | "reminder" | "unified_action" | "governance_event" | "evidence_link";
  title: string;
  actor?: string | null;
  evidence?: string | null;
}

export interface KnowledgeGovernanceEvidenceGap {
  code: string;
  severity: "high" | "medium" | "low";
  message: string;
}

export interface KnowledgeGovernanceEvidenceChain {
  followup?: RiskRetrospectiveGovernanceFollowupRecord;
  reminderLog?: RiskRetrospectiveGovernanceReminderLog;
  unifiedAction?: KnowledgeGovernanceUnifiedActionNode | null;
  governanceInstance?: GovernanceInstanceRecord;
  governanceEvents: GovernanceEventRecord[];
  governanceActions: GovernanceActionRecord[];
  evidenceLink?: KnowledgeGovernanceEvidenceLink | null;
}

export type KnowledgeGovernanceEvidenceChainResult =
  | {
      status: "succeeded";
      chain: KnowledgeGovernanceEvidenceChain;
      timeline: KnowledgeGovernanceEvidenceTimelineItem[];
      gaps: KnowledgeGovernanceEvidenceGap[];
      recommendation?: KnowledgeGovernanceFollowupWritebackRecommendation;
      warning?: string;
    }
  | { status: "not_configured" | "not_found" | "failed"; warning: string };

export type KnowledgeGovernanceEvidenceRecommendationResult =
  | {
      status: "confirmation_required";
      confirmationRequired: true;
      chain: KnowledgeGovernanceEvidenceChain;
      timeline: KnowledgeGovernanceEvidenceTimelineItem[];
      gaps: KnowledgeGovernanceEvidenceGap[];
      recommendation: KnowledgeGovernanceFollowupWritebackRecommendation;
      evidenceLink: KnowledgeGovernanceEvidenceLink;
      boundary: string;
      warning?: string;
    }
  | { status: "not_configured" | "not_found" | "failed"; warning: string };

export type KnowledgeGovernanceEvidenceApplyResult =
  | {
      status: "succeeded";
      followup: RiskRetrospectiveGovernanceFollowupRecord;
      evidenceLink: KnowledgeGovernanceEvidenceLink;
      recommendation: KnowledgeGovernanceFollowupWritebackRecommendation;
      chain: KnowledgeGovernanceEvidenceChain;
      timeline: KnowledgeGovernanceEvidenceTimelineItem[];
      gaps: KnowledgeGovernanceEvidenceGap[];
    }
  | { status: "confirmation_required"; confirmationRequired: true; recommendation: KnowledgeGovernanceFollowupWritebackRecommendation; boundary: string }
  | { status: "not_configured" | "not_found" | "failed"; warning: string };

const EVIDENCE_LINK_TABLE = "risk_retrospective_governance_evidence_links";
const SQL_FILE = "supabase-v5347-knowledge-governance-evidence-chain.sql";
const FOLLOWUP_SOURCE_PREFIX = "risk-retro-governance-followup-";

async function authStorageConfigured(): Promise<boolean> {
  const auth = await import("../auth/server.ts");
  return auth.isAuthStorageConfigured();
}

async function authSupabase() {
  const auth = await import("../auth/server.ts");
  return auth.getAuthSupabase();
}

function isMissingEvidenceLinkTableError(message?: string): boolean {
  const normalized = (message ?? "").toLowerCase();
  return normalized.includes(EVIDENCE_LINK_TABLE)
    && (
      normalized.includes("does not exist")
      || normalized.includes("relation")
      || normalized.includes("schema cache")
      || normalized.includes("could not find")
    );
}

function sqlWarning(message?: string): string {
  return isMissingEvidenceLinkTableError(message)
    ? `知识治理证据链 SQL 未执行：请在 Supabase SQL Editor 执行 ${SQL_FILE}。`
    : message || "知识治理证据链处理失败。";
}

function actorName(user: AppUser | null): string | null {
  return user?.name || user?.email || user?.phone || null;
}

function mapEvidenceLink(row: Record<string, unknown>): KnowledgeGovernanceEvidenceLink {
  return {
    id: String(row.id),
    sourceFollowupId: typeof row.source_followup_id === "string" ? row.source_followup_id : null,
    reminderLogId: typeof row.reminder_log_id === "string" ? row.reminder_log_id : null,
    unifiedActionId: typeof row.unified_action_id === "string" ? row.unified_action_id : null,
    governanceInstanceId: String(row.governance_instance_id),
    linkType: "knowledge_governance_escalation",
    status: String(row.status || "active") as KnowledgeGovernanceEvidenceLinkStatus,
    closureRecommendation: typeof row.closure_recommendation === "string" ? row.closure_recommendation : null,
    reviewerName: typeof row.reviewer_name === "string" ? row.reviewer_name : null,
    reviewStatus: String(row.review_status || "pending") as KnowledgeGovernanceEvidenceReviewStatus,
    reviewNote: typeof row.review_note === "string" ? row.review_note : null,
    appliedAt: typeof row.applied_at === "string" ? row.applied_at : null,
    requestId: typeof row.request_id === "string" ? row.request_id : null,
    metadata: typeof row.metadata === "object" && row.metadata !== null ? row.metadata as Record<string, unknown> : {},
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
  };
}

function mapUnifiedAction(row: Record<string, unknown>): KnowledgeGovernanceUnifiedActionNode {
  return {
    id: String(row.id),
    title: String(row.title ?? ""),
    owner: typeof row.owner === "string" ? row.owner : null,
    dueDate: typeof row.due_date === "string" ? row.due_date : null,
    status: String(row.status ?? ""),
    priority: String(row.priority ?? ""),
    closeEvidence: typeof row.close_evidence === "string" ? row.close_evidence : null,
    sourceType: typeof row.source_type === "string" ? row.source_type : null,
    sourceId: typeof row.source_id === "string" ? row.source_id : null,
    updatedAt: String(row.updated_at ?? row.created_at ?? ""),
  };
}

function evidenceLinkSelectColumns(): string {
  return [
    "id",
    "source_followup_id",
    "reminder_log_id",
    "unified_action_id",
    "governance_instance_id",
    "link_type",
    "status",
    "closure_recommendation",
    "reviewer_name",
    "review_status",
    "review_note",
    "applied_at",
    "request_id",
    "metadata",
    "created_at",
    "updated_at",
  ].join(",");
}

function appendText(existing: string | null | undefined, addition: string): string {
  const existingText = existing?.trim();
  const additionText = addition.trim();
  if (!existingText) return additionText;
  if (existingText.includes(additionText)) return existingText;
  return `${existingText}\n\n${additionText}`;
}

function terminalRejectedState(state: string): boolean {
  return ["已驳回", "已拒绝", "暂停"].includes(state);
}

function buildTimeline(chain: KnowledgeGovernanceEvidenceChain): KnowledgeGovernanceEvidenceTimelineItem[] {
  const items: KnowledgeGovernanceEvidenceTimelineItem[] = [];
  if (chain.followup) {
    items.push({
      at: chain.followup.createdAt,
      type: "followup",
      title: `二次治理待办创建：${chain.followup.assetTitle}`,
      actor: chain.followup.createdByName,
      evidence: chain.followup.reason,
    });
  }
  if (chain.reminderLog) {
    items.push({
      at: chain.reminderLog.updatedAt || chain.reminderLog.createdAt,
      type: "reminder",
      title: `运营提醒：${chain.reminderLog.title} / ${chain.reminderLog.status}`,
      actor: chain.reminderLog.createdByName,
      evidence: chain.reminderLog.closureNote || chain.reminderLog.actionRequired,
    });
  }
  if (chain.unifiedAction) {
    items.push({
      at: chain.unifiedAction.updatedAt,
      type: "unified_action",
      title: `统一行动项：${chain.unifiedAction.title} / ${chain.unifiedAction.status}`,
      actor: chain.unifiedAction.owner,
      evidence: chain.unifiedAction.closeEvidence,
    });
  }
  for (const event of chain.governanceEvents) {
    items.push({
      at: event.createdAt,
      type: "governance_event",
      title: `治理流程事件：${event.eventType} / ${event.fromState || "-"} → ${event.toState}`,
      actor: event.actorName,
      evidence: event.comment || event.decision,
    });
  }
  if (chain.evidenceLink) {
    items.push({
      at: chain.evidenceLink.updatedAt,
      type: "evidence_link",
      title: `证据链状态：${chain.evidenceLink.status} / ${chain.evidenceLink.reviewStatus}`,
      actor: chain.evidenceLink.reviewerName,
      evidence: chain.evidenceLink.reviewNote || chain.evidenceLink.closureRecommendation,
    });
  }
  return items
    .filter(item => item.at)
    .sort((a, b) => a.at.localeCompare(b.at));
}

function buildGaps(chain: KnowledgeGovernanceEvidenceChain): KnowledgeGovernanceEvidenceGap[] {
  const gaps: KnowledgeGovernanceEvidenceGap[] = [];
  if (!chain.followup) gaps.push({ code: "missing_followup", severity: "high", message: "未找到来源二次治理待办，不能反写关闭证据。" });
  if (!chain.governanceInstance) gaps.push({ code: "missing_governance_instance", severity: "high", message: "未找到治理流程实例。" });
  if (!chain.reminderLog) gaps.push({ code: "missing_reminder_log", severity: "medium", message: "未找到知识治理运营提醒日志，提醒来源证据不完整。" });
  if (!chain.unifiedAction) gaps.push({ code: "missing_unified_action", severity: "low", message: "未找到关联统一行动项；如果升级时未创建行动项，可仅通过治理流程闭环。" });
  if (chain.governanceInstance && !isTerminalGovernanceState(chain.governanceInstance.state) && !terminalRejectedState(chain.governanceInstance.state)) {
    gaps.push({ code: "governance_not_terminal", severity: "medium", message: "治理流程尚未到达关闭、通过、归档或驳回等明确结果状态。" });
  }
  if (chain.governanceInstance && !chain.governanceInstance.outputSummary?.trim()) {
    gaps.push({ code: "missing_governance_output", severity: "medium", message: "治理流程缺少输出成果摘要，反写证据不足。" });
  }
  if (!chain.evidenceLink) gaps.push({ code: "missing_evidence_link", severity: "low", message: "尚未保存证据链索引；生成反写建议后会创建。" });
  return gaps;
}

async function findUnifiedActionByFollowupId(followupId: string): Promise<KnowledgeGovernanceUnifiedActionNode | null> {
  if (!await authStorageConfigured()) return null;
  const supabase = await authSupabase();
  const { data, error } = await supabase
    .from("unified_action_items")
    .select("id,title,owner,due_date,status,priority,close_evidence,source_type,source_id,created_at,updated_at")
    .eq("source_type", "governance")
    .eq("source_id", `${FOLLOWUP_SOURCE_PREFIX}${followupId}`)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return mapUnifiedAction(data as unknown as Record<string, unknown>);
}

async function findEvidenceLink(input: {
  governanceInstanceId?: string | null;
  followupId?: string | null;
}): Promise<{ status: "succeeded"; link: KnowledgeGovernanceEvidenceLink | null } | { status: "not_configured" | "failed"; warning: string }> {
  if (!await authStorageConfigured()) return { status: "not_configured", warning: "Supabase 未配置，无法读取知识治理证据链。" };
  if (!input.governanceInstanceId && !input.followupId) return { status: "succeeded", link: null };
  try {
    const supabase = await authSupabase();
    let query = supabase
      .from(EVIDENCE_LINK_TABLE)
      .select(evidenceLinkSelectColumns())
      .order("updated_at", { ascending: false })
      .limit(1);
    if (input.governanceInstanceId && input.followupId) {
      query = query.eq("governance_instance_id", input.governanceInstanceId).eq("source_followup_id", input.followupId);
    } else if (input.governanceInstanceId) {
      query = query.eq("governance_instance_id", input.governanceInstanceId);
    } else if (input.followupId) {
      query = query.eq("source_followup_id", input.followupId);
    }
    const { data, error } = await query.maybeSingle();
    if (error) {
      return {
        status: isMissingEvidenceLinkTableError(error.message) ? "not_configured" : "failed",
        warning: sqlWarning(error.message),
      };
    }
    return { status: "succeeded", link: data ? mapEvidenceLink(data as unknown as Record<string, unknown>) : null };
  } catch (error) {
    return { status: "failed", warning: error instanceof Error ? error.message : "读取知识治理证据链失败。" };
  }
}

async function resolveGovernanceInstance(input: {
  governanceInstanceId?: string | null;
  followupId?: string | null;
  reminderLogId?: string | null;
}): Promise<Awaited<ReturnType<typeof getGovernanceInstanceBundle>>> {
  if (input.governanceInstanceId) return getGovernanceInstanceBundle(input.governanceInstanceId);
  const list = await listGovernanceInstances(200);
  if (list.status !== "succeeded") {
    return { status: list.status, events: [], actions: [], warning: list.warning };
  }
  const instance = list.instances.find(item => (
    (input.followupId && item.sourceLinkId === input.followupId)
    || (input.reminderLogId && item.sourceId === input.reminderLogId)
  ));
  if (!instance) return { status: "not_found", events: [], actions: [], warning: "未找到关联治理流程实例。" };
  return getGovernanceInstanceBundle(instance.id);
}

export async function getKnowledgeGovernanceEvidenceChain(input: {
  governanceInstanceId?: string | null;
  followupId?: string | null;
  reminderLogId?: string | null;
}): Promise<KnowledgeGovernanceEvidenceChainResult> {
  if (!await authStorageConfigured()) return { status: "not_configured", warning: "Supabase 未配置，无法读取知识治理证据链。" };
  const governance = await resolveGovernanceInstance(input);
  if (governance.status !== "succeeded") {
    return { status: governance.status, warning: governance.warning || "未找到关联治理流程实例。" };
  }
  if (!governance.instance) return { status: "not_found", warning: "未找到关联治理流程实例。" };
  const sourceFollowupId = input.followupId || governance.instance.sourceLinkId || null;
  const sourceReminderId = input.reminderLogId || (governance.instance.sourceType === "risk_retrospective_governance_reminder" ? governance.instance.sourceId : null);
  const [followupResult, reminderResult, evidenceResult] = await Promise.all([
    sourceFollowupId ? getRiskRetrospectiveGovernanceFollowup(sourceFollowupId) : Promise.resolve(null),
    sourceReminderId ? getRiskRetrospectiveGovernanceReminderLog(sourceReminderId) : Promise.resolve(null),
    findEvidenceLink({ governanceInstanceId: governance.instance.id, followupId: sourceFollowupId }),
  ]);
  if (followupResult && followupResult.status !== "succeeded") {
    return { status: followupResult.status, warning: followupResult.warning };
  }
  if (reminderResult && reminderResult.status !== "succeeded") {
    return { status: reminderResult.status, warning: reminderResult.warning };
  }
  const evidenceWarning = evidenceResult.status !== "succeeded" ? evidenceResult.warning : undefined;
  const unifiedAction = sourceFollowupId ? await findUnifiedActionByFollowupId(sourceFollowupId) : null;
  const chain: KnowledgeGovernanceEvidenceChain = {
    followup: followupResult?.status === "succeeded" ? followupResult.followup : undefined,
    reminderLog: reminderResult?.status === "succeeded" ? reminderResult.log : undefined,
    unifiedAction,
    governanceInstance: governance.instance,
    governanceEvents: governance.events,
    governanceActions: governance.actions,
    evidenceLink: evidenceResult.status === "succeeded" ? evidenceResult.link : null,
  };
  return {
    status: "succeeded",
    chain,
    timeline: buildTimeline(chain),
    gaps: buildGaps(chain),
    recommendation: buildKnowledgeGovernanceWritebackRecommendation({
      followup: chain.followup,
      reminderLog: chain.reminderLog,
      governanceInstance: chain.governanceInstance,
      governanceEvents: chain.governanceEvents,
      governanceActions: chain.governanceActions,
    }),
    warning: evidenceWarning,
  };
}

export async function saveKnowledgeGovernanceEvidenceRecommendation(input: {
  governanceInstanceId?: string | null;
  followupId?: string | null;
  reminderLogId?: string | null;
  override?: Parameters<typeof buildKnowledgeGovernanceWritebackRecommendation>[0]["override"];
  user: AppUser | null;
  requestId?: string;
}): Promise<KnowledgeGovernanceEvidenceRecommendationResult> {
  const chainResult = await getKnowledgeGovernanceEvidenceChain(input);
  if (chainResult.status !== "succeeded") return chainResult;
  if (!chainResult.chain.governanceInstance || !chainResult.chain.followup) {
    return { status: "not_found", warning: "缺少治理流程或二次治理待办，无法生成可反写的证据链。" };
  }
  if (!await authStorageConfigured()) return { status: "not_configured", warning: "Supabase 未配置，无法保存知识治理证据链。" };
  const recommendation = buildKnowledgeGovernanceWritebackRecommendation({
    followup: chainResult.chain.followup,
    reminderLog: chainResult.chain.reminderLog,
    governanceInstance: chainResult.chain.governanceInstance,
    governanceEvents: chainResult.chain.governanceEvents,
    governanceActions: chainResult.chain.governanceActions,
    override: input.override,
  });
  try {
    const supabase = await authSupabase();
    const { data, error } = await supabase
      .from(EVIDENCE_LINK_TABLE)
      .upsert({
        source_followup_id: chainResult.chain.followup.id,
        reminder_log_id: chainResult.chain.reminderLog?.id ?? null,
        unified_action_id: chainResult.chain.unifiedAction?.id ?? null,
        governance_instance_id: chainResult.chain.governanceInstance.id,
        link_type: "knowledge_governance_escalation",
        status: "pending_review",
        closure_recommendation: recommendation.closureNote,
        reviewer_id: input.user?.id ?? null,
        reviewer_name: actorName(input.user),
        review_status: "pending",
        review_note: recommendation.reviewResult,
        request_id: input.requestId ?? null,
        metadata: {
          recommendation,
          gaps: chainResult.gaps,
          source_summary: chainResult.chain.governanceInstance.sourceSummary,
          boundary: recommendation.boundary,
        },
        updated_at: new Date().toISOString(),
      }, { onConflict: "governance_instance_id,source_followup_id" })
      .select(evidenceLinkSelectColumns())
      .maybeSingle();
    if (error || !data) {
      return {
        status: error && isMissingEvidenceLinkTableError(error.message) ? "not_configured" : "failed",
        warning: sqlWarning(error?.message),
      };
    }
    const evidenceLink = mapEvidenceLink(data as unknown as Record<string, unknown>);
    const chain = { ...chainResult.chain, evidenceLink };
    return {
      status: "confirmation_required",
      confirmationRequired: true,
      chain,
      timeline: buildTimeline(chain),
      gaps: buildGaps(chain),
      recommendation,
      evidenceLink,
      boundary: recommendation.boundary,
      warning: chainResult.warning,
    };
  } catch (error) {
    return { status: "failed", warning: error instanceof Error ? error.message : "保存知识治理反写建议失败。" };
  }
}

export async function applyKnowledgeGovernanceEvidenceRecommendation(input: {
  evidenceLinkId?: string | null;
  governanceInstanceId?: string | null;
  followupId?: string | null;
  confirm?: boolean;
  targetFollowupStatus?: Extract<RiskRetrospectiveGovernanceFollowupStatus, "处理中" | "待验收" | "已关闭">;
  closureNote?: string | null;
  reviewResult?: string | null;
  reviewNote?: string | null;
  user: AppUser | null;
  requestId?: string;
}): Promise<KnowledgeGovernanceEvidenceApplyResult> {
  const recommendationResult = await saveKnowledgeGovernanceEvidenceRecommendation({
    governanceInstanceId: input.governanceInstanceId,
    followupId: input.followupId,
    override: {
      targetFollowupStatus: input.targetFollowupStatus,
      closureNote: input.closureNote || undefined,
      reviewResult: input.reviewResult || undefined,
    },
    user: input.user,
    requestId: input.requestId,
  });
  if (recommendationResult.status !== "confirmation_required") return recommendationResult;
  if (input.confirm !== true) {
    return {
      status: "confirmation_required",
      confirmationRequired: true,
      recommendation: recommendationResult.recommendation,
      boundary: recommendationResult.boundary,
    };
  }
  const followup = recommendationResult.chain.followup;
  if (!followup) return { status: "not_found", warning: "缺少二次治理待办，无法反写。" };
  const recommendation = recommendationResult.recommendation;
  const nextClosureNote = appendText(followup.closureNote, recommendation.closureNote);
  const nextReviewResult = appendText(followup.reviewResult, recommendation.reviewResult);
  const updateResult = await transitionRiskRetrospectiveGovernanceFollowup({
    id: followup.id,
    status: recommendation.targetFollowupStatus,
    closureNote: nextClosureNote,
    reviewResult: nextReviewResult,
  });
  if (updateResult.status !== "succeeded") return updateResult;

  try {
    const supabase = await authSupabase();
    const { data, error } = await supabase
      .from(EVIDENCE_LINK_TABLE)
      .update({
        status: "applied",
        review_status: "approved",
        reviewer_id: input.user?.id ?? null,
        reviewer_name: actorName(input.user),
        review_note: input.reviewNote?.trim() || recommendation.reviewResult,
        closure_recommendation: recommendation.closureNote,
        applied_at: new Date().toISOString(),
        request_id: input.requestId ?? null,
        metadata: {
          ...(recommendationResult.evidenceLink.metadata ?? {}),
          recommendation,
          applied_followup_status: updateResult.followup.status,
          applied_boundary: "本次反写由用户显式确认触发，未静默覆盖已有关闭证据。",
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", recommendationResult.evidenceLink.id)
      .select(evidenceLinkSelectColumns())
      .maybeSingle();
    if (error || !data) {
      return {
        status: error && isMissingEvidenceLinkTableError(error.message) ? "not_configured" : "failed",
        warning: sqlWarning(error?.message),
      };
    }
    const evidenceLink = mapEvidenceLink(data as unknown as Record<string, unknown>);
    const chain = {
      ...recommendationResult.chain,
      followup: updateResult.followup,
      evidenceLink,
    };
    return {
      status: "succeeded",
      followup: updateResult.followup,
      evidenceLink,
      recommendation,
      chain,
      timeline: buildTimeline(chain),
      gaps: buildGaps(chain),
    };
  } catch (error) {
    return { status: "failed", warning: error instanceof Error ? error.message : "应用知识治理反写建议失败。" };
  }
}
