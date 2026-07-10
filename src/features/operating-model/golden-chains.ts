import type { BusinessRole } from "./context.ts";

export type GoldenChainKey = "A" | "B" | "C" | "D" | "E";
export type GoldenChainRunStatus = "draft" | "ready" | "running" | "verification" | "passed" | "failed" | "blocked" | "cancelled";
export type GoldenChainRunAction = "prepare" | "start" | "submit_verification" | "pass" | "fail" | "block" | "resume" | "cancel" | "retry";
export type GoldenChainStepStatus = "pending" | "in_progress" | "submitted" | "verified" | "failed";
export type GoldenChainStepAction = "start" | "submit" | "verify" | "reject" | "retry";

export type GoldenChainArtifactType =
  | "project_fact_snapshot"
  | "metric_observation"
  | "lifecycle_state"
  | "lifecycle_event"
  | "management_signal"
  | "business_forecast"
  | "object_impact_package"
  | "reporting_snapshot"
  | "decision_brief"
  | "management_decision"
  | "decision_receipt"
  | "unified_action_item"
  | "feishu_confirmation"
  | "effect_review"
  | "benefit_baseline"
  | "benefit_review"
  | "resource_capacity_snapshot"
  | "closure_assessment"
  | "retrospective"
  | "knowledge_item"
  | "knowledge_reuse_event";

export interface GoldenChainArtifactReference {
  objectType: GoldenChainArtifactType;
  objectId: string;
  sourceType: "supabase" | "feishu" | "obsidian" | "external";
  dataClass: string;
  verifiedAt: string;
  evidenceId?: string;
  sourceUrl?: string;
  metadata?: Record<string, unknown>;
}

export interface GoldenChainParticipantBinding {
  businessRole: BusinessRole;
  userId: string;
  assignmentId: string;
}

export interface GoldenChainDefinition {
  key: GoldenChainKey;
  label: string;
  objective: string;
  roles: BusinessRole[];
  steps: Array<{
    key: string;
    label: string;
    actorRoles: BusinessRole[];
    requiredArtifactTypes: GoldenChainArtifactType[];
    output: string;
  }>;
  failurePaths: Array<{ key: string; label: string }>;
}

export const GOLDEN_CHAIN_DEFINITIONS: Record<GoldenChainKey, GoldenChainDefinition> = {
  A: {
    key: "A",
    label: "延期影响回款",
    objective: "从里程碑延期事实，经经营影响、PMO升级和CEO决策，闭环到执行及效果复核。",
    roles: ["pm", "operations", "pmo", "ceo"],
    steps: [
      { key: "freeze_facts", label: "冻结项目、基线、里程碑和回款条件", actorRoles: ["pm", "operations"], requiredArtifactTypes: ["project_fact_snapshot", "metric_observation"], output: "带时间戳的同一项目事实快照" },
      { key: "confirm_delay", label: "PM确认延期及交付影响", actorRoles: ["pm"], requiredArtifactTypes: ["management_signal", "lifecycle_event"], output: "已验证进度信号和生命周期事件" },
      { key: "confirm_cash_impact", label: "运营确认验收与现金影响", actorRoles: ["operations"], requiredArtifactTypes: ["business_forecast", "object_impact_package"], output: "现金预测和待确认影响包" },
      { key: "pmo_review", label: "PMO校验、去重并形成决策包", actorRoles: ["pmo"], requiredArtifactTypes: ["reporting_snapshot", "decision_brief"], output: "冻结依据和正式决策诉求" },
      { key: "authorized_decision", label: "授权决策人作出结论并留回执", actorRoles: ["ceo"], requiredArtifactTypes: ["management_decision", "decision_receipt"], output: "有理由、条件、期限和复审日的正式决策" },
      { key: "execute", label: "PM/运营接收并执行下行动作", actorRoles: ["pm", "operations"], requiredArtifactTypes: ["unified_action_item", "feishu_confirmation"], output: "责任到人、可追踪的执行及飞书回执" },
      { key: "effect_review", label: "PMO复核指标变化和关闭效果", actorRoles: ["pmo"], requiredArtifactTypes: ["effect_review", "metric_observation"], output: "达标关闭或重新升级" },
    ],
    failurePaths: [
      { key: "pm_denies", label: "PM否认AI/规则判断" },
      { key: "duplicate_signal", label: "重复信号幂等去重" },
      { key: "request_more_evidence", label: "决策人要求补证据" },
      { key: "feishu_failure", label: "飞书写入失败与恢复" },
      { key: "overdue_action", label: "行动逾期升级" },
      { key: "unauthorized_access", label: "越权访问被拒绝并审计" },
    ],
  },
  B: {
    key: "B",
    label: "毛利失守",
    objective: "从EAC变化和财务实际，形成毛利预警、处置方案、决策与基线/合同影响闭环。",
    roles: ["pm", "operations", "finance", "pmo", "ceo"],
    steps: [
      { key: "freeze_finance_basis", label: "冻结合同、BAC、AC、EAC和财务口径", actorRoles: ["finance", "operations"], requiredArtifactTypes: ["project_fact_snapshot", "metric_observation"], output: "币种、税制、期间和版本清晰的业财快照" },
      { key: "update_forecast", label: "PM/运营提交EAC和毛利预测变化", actorRoles: ["pm", "operations"], requiredArtifactTypes: ["business_forecast", "management_signal"], output: "经人工确认的毛利异常" },
      { key: "finance_verify", label: "财务确认实际与预测口径", actorRoles: ["finance"], requiredArtifactTypes: ["metric_observation", "decision_receipt"], output: "财务确认回执" },
      { key: "prepare_options", label: "PMO形成索赔、范围、成本或资源方案", actorRoles: ["pmo"], requiredArtifactTypes: ["decision_brief", "object_impact_package"], output: "带量化影响的备选方案" },
      { key: "decide", label: "授权决策并转译行动", actorRoles: ["ceo", "pmo"], requiredArtifactTypes: ["management_decision", "unified_action_item"], output: "决策、责任人和验收标准" },
      { key: "review_margin", label: "复核新预测和毛利恢复效果", actorRoles: ["finance", "pmo"], requiredArtifactTypes: ["effect_review", "metric_observation"], output: "毛利效果结论或重新升级" },
    ],
    failurePaths: [
      { key: "currency_conflict", label: "币种或税口径冲突" },
      { key: "finance_rejects", label: "财务拒绝确认" },
      { key: "stale_forecast", label: "预测版本过期" },
      { key: "unauthorized_amount", label: "超金额授权被拒绝" },
    ],
  },
  C: {
    key: "C",
    label: "收益失效与项目退出",
    objective: "从S/A项目收益缺口，完成三方复核、CEO取舍、退出义务和价值复盘。",
    roles: ["business_owner", "finance", "pmo", "ceo"],
    steps: [
      { key: "freeze_benefit_baseline", label: "冻结收益基线、Owner、G6和退出标准", actorRoles: ["business_owner", "finance", "pmo"], requiredArtifactTypes: ["benefit_baseline", "project_fact_snapshot"], output: "完整且已批准的价值基线" },
      { key: "review_benefit_gap", label: "业务Owner、财务和PMO复核收益缺口", actorRoles: ["business_owner", "finance", "pmo"], requiredArtifactTypes: ["benefit_review", "management_signal"], output: "三方复核结论和升级信号" },
      { key: "exit_decision", label: "CEO/组合委员会决定继续、转向、暂停或终止", actorRoles: ["ceo"], requiredArtifactTypes: ["decision_brief", "management_decision"], output: "正式组合取舍" },
      { key: "handover_exit", label: "下行资源释放、合同义务和沟通行动", actorRoles: ["pmo", "business_owner", "finance"], requiredArtifactTypes: ["object_impact_package", "unified_action_item"], output: "退出交接清单和责任行动" },
      { key: "review_exit_effect", label: "复核损失控制和价值结论", actorRoles: ["pmo", "finance"], requiredArtifactTypes: ["effect_review", "benefit_review"], output: "退出效果与剩余义务结论" },
    ],
    failurePaths: [
      { key: "insufficient_data", label: "数据不足拒绝确定性结论" },
      { key: "unauthorized_decision", label: "无授权决策被拒绝" },
      { key: "open_contract_obligation", label: "未关闭合同义务阻止退出完成" },
      { key: "missing_exit_criteria", label: "历史基线缺退出条件时停止硬化" },
    ],
  },
  D: {
    key: "D",
    label: "跨项目资源冲突",
    objective: "把资源容量冲突转成多项目方案、授权优先级、影响包、行动和效果复核。",
    roles: ["pm", "pmo", "ceo"],
    steps: [
      { key: "freeze_capacity", label: "冻结项目优先级、资源容量和里程碑预测", actorRoles: ["pm", "pmo"], requiredArtifactTypes: ["resource_capacity_snapshot", "project_fact_snapshot"], output: "覆盖全部受影响项目的容量快照" },
      { key: "detect_conflict", label: "确认跨项目冲突和第三项目影响", actorRoles: ["pmo"], requiredArtifactTypes: ["management_signal", "object_impact_package"], output: "去重后的组合例外和影响范围" },
      { key: "prepare_portfolio_options", label: "形成优先级、替代资源和延期方案", actorRoles: ["pmo"], requiredArtifactTypes: ["decision_brief", "reporting_snapshot"], output: "包含机会成本的组合方案" },
      { key: "portfolio_decision", label: "授权人选择优先级与资源方案", actorRoles: ["ceo"], requiredArtifactTypes: ["management_decision", "decision_receipt"], output: "正式组合资源决策" },
      { key: "apply_to_projects", label: "各项目接收资源和里程碑影响", actorRoles: ["pm"], requiredArtifactTypes: ["object_impact_package", "unified_action_item"], output: "每个受影响项目的待确认变更" },
      { key: "capacity_effect_review", label: "复核冲突解除和项目影响", actorRoles: ["pmo"], requiredArtifactTypes: ["effect_review", "resource_capacity_snapshot"], output: "容量效果结论或再次取舍" },
    ],
    failurePaths: [
      { key: "stale_capacity", label: "容量数据过期" },
      { key: "assignee_rejects", label: "被调人员拒收" },
      { key: "third_project_impact", label: "方案影响第三项目" },
      { key: "delegation_expired", label: "决策代理授权过期" },
    ],
  },
  E: {
    key: "E",
    label: "项目收尾形成组织知识",
    objective: "从三类关闭门禁，经复盘评审到知识发布、后续复用和效果验证。",
    roles: ["pm", "operations", "finance", "business_owner", "pmo", "quality"],
    steps: [
      { key: "closure_inputs", label: "提交交付、验收、财务、风险、归档和移交证据", actorRoles: ["pm", "operations", "finance", "business_owner"], requiredArtifactTypes: ["project_fact_snapshot", "lifecycle_state"], output: "各责任角色确认的收尾输入" },
      { key: "closure_gate", label: "PMO/质量执行正式收尾门禁", actorRoles: ["pmo", "quality"], requiredArtifactTypes: ["closure_assessment", "unified_action_item"], output: "门禁结论和补正行动" },
      { key: "retrospective", label: "PM提交复盘事实、根因、决策和效果", actorRoles: ["pm"], requiredArtifactTypes: ["retrospective", "effect_review"], output: "有证据和适用边界的复盘" },
      { key: "knowledge_review", label: "PMO/质量评审并发布知识", actorRoles: ["pmo", "quality"], requiredArtifactTypes: ["knowledge_item", "decision_receipt"], output: "版本化知识、改进项或规则建议" },
      { key: "knowledge_reuse", label: "后续项目采用并复核效果", actorRoles: ["pm", "pmo"], requiredArtifactTypes: ["knowledge_reuse_event", "effect_review"], output: "真实复用与效果记录" },
    ],
    failurePaths: [
      { key: "partial_acceptance", label: "部分验收阻止正式关闭" },
      { key: "disputed_receivable", label: "争议款阻止财务关闭" },
      { key: "expired_evidence", label: "证据过期触发重新补证" },
      { key: "knowledge_rejected", label: "知识候选被驳回" },
      { key: "project_reopened", label: "项目关闭后重新打开" },
    ],
  },
};

const GOLDEN_CHAIN_ARTIFACT_TYPES = new Set<GoldenChainArtifactType>([
  "project_fact_snapshot", "metric_observation", "lifecycle_state", "lifecycle_event",
  "management_signal", "business_forecast", "object_impact_package", "reporting_snapshot",
  "decision_brief", "management_decision", "decision_receipt", "unified_action_item",
  "feishu_confirmation", "effect_review", "benefit_baseline", "benefit_review",
  "resource_capacity_snapshot", "closure_assessment", "retrospective", "knowledge_item",
  "knowledge_reuse_event",
]);
const GOLDEN_CHAIN_SOURCE_TYPES = new Set<GoldenChainArtifactReference["sourceType"]>(["supabase", "feishu", "obsidian", "external"]);

function requiredText(record: Record<string, unknown>, key: string): string {
  const value = String(record[key] ?? "").trim();
  if (!value) throw new Error("ARTIFACT_REFERENCE_FIELDS_REQUIRED");
  return value;
}

export function parseGoldenChainArtifactReferences(value: unknown): GoldenChainArtifactReference[] {
  if (!Array.isArray(value)) throw new Error("ARTIFACT_REFERENCES_ARRAY_REQUIRED");
  return value.map(item => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("ARTIFACT_REFERENCE_OBJECT_REQUIRED");
    const record = item as Record<string, unknown>;
    const objectType = requiredText(record, "objectType") as GoldenChainArtifactType;
    const sourceType = requiredText(record, "sourceType") as GoldenChainArtifactReference["sourceType"];
    if (!GOLDEN_CHAIN_ARTIFACT_TYPES.has(objectType)) throw new Error("ARTIFACT_TYPE_INVALID");
    if (!GOLDEN_CHAIN_SOURCE_TYPES.has(sourceType)) throw new Error("ARTIFACT_SOURCE_TYPE_INVALID");
    const metadata = record.metadata;
    if (metadata !== undefined && (!metadata || typeof metadata !== "object" || Array.isArray(metadata))) throw new Error("ARTIFACT_METADATA_OBJECT_REQUIRED");
    const reference: GoldenChainArtifactReference = {
      objectType,
      objectId: requiredText(record, "objectId"),
      sourceType,
      dataClass: requiredText(record, "dataClass"),
      verifiedAt: requiredText(record, "verifiedAt"),
    };
    const evidenceId = String(record.evidenceId ?? "").trim();
    const sourceUrl = String(record.sourceUrl ?? "").trim();
    if (evidenceId) reference.evidenceId = evidenceId;
    if (sourceUrl) reference.sourceUrl = sourceUrl;
    if (metadata !== undefined) reference.metadata = metadata as Record<string, unknown>;
    return reference;
  });
}

export function validateGoldenChainParticipantBindings(key: GoldenChainKey, bindings: ReadonlyArray<GoldenChainParticipantBinding>): string[] {
  const errors = new Set<string>();
  const definition = GOLDEN_CHAIN_DEFINITIONS[key];
  if (!definition) return ["GOLDEN_CHAIN_KEY_INVALID"];
  const counts = new Map<string, number>();
  for (const binding of bindings) {
    if (!String(binding.userId || "").trim() || !String(binding.assignmentId || "").trim()) errors.add("PARTICIPANT_IDENTITY_REQUIRED");
    counts.set(binding.businessRole, (counts.get(binding.businessRole) ?? 0) + 1);
    if (!definition.roles.includes(binding.businessRole)) errors.add("PARTICIPANT_ROLE_NOT_IN_CHAIN");
  }
  if ([...counts.values()].some(count => count > 1)) errors.add("PARTICIPANT_ROLE_DUPLICATED");
  if (definition.roles.some(role => !counts.has(role))) errors.add("PARTICIPANT_ROLE_MISSING");
  return [...errors];
}

const RUN_TRANSITIONS: Record<GoldenChainRunStatus, Partial<Record<GoldenChainRunAction, GoldenChainRunStatus>>> = {
  draft: { prepare: "ready", cancel: "cancelled" },
  ready: { start: "running", block: "blocked", cancel: "cancelled" },
  running: { submit_verification: "verification", block: "blocked", cancel: "cancelled" },
  verification: { pass: "passed", fail: "failed", block: "blocked" },
  passed: {},
  failed: { retry: "running", cancel: "cancelled" },
  blocked: { resume: "running", cancel: "cancelled" },
  cancelled: {},
};

const STEP_TRANSITIONS: Record<GoldenChainStepStatus, Partial<Record<GoldenChainStepAction, GoldenChainStepStatus>>> = {
  pending: { start: "in_progress" },
  in_progress: { submit: "submitted" },
  submitted: { verify: "verified", reject: "failed" },
  verified: {},
  failed: { retry: "in_progress" },
};

export function transitionGoldenChainRun(status: GoldenChainRunStatus, action: GoldenChainRunAction): GoldenChainRunStatus {
  const next = RUN_TRANSITIONS[status]?.[action];
  if (!next) throw new Error(`GOLDEN_CHAIN_RUN_TRANSITION_FORBIDDEN:${status}:${action}`);
  return next;
}

export function transitionGoldenChainStep(status: GoldenChainStepStatus, action: GoldenChainStepAction): GoldenChainStepStatus {
  const next = STEP_TRANSITIONS[status]?.[action];
  if (!next) throw new Error(`GOLDEN_CHAIN_STEP_TRANSITION_FORBIDDEN:${status}:${action}`);
  return next;
}

function hasSecret(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasSecret);
  if (!value || typeof value !== "object") return false;
  return Object.entries(value as Record<string, unknown>).some(([key, nested]) => /secret|token|password|api.?key|credential/i.test(key) || hasSecret(nested));
}

export function validateGoldenChainArtifactReferences(references: ReadonlyArray<GoldenChainArtifactReference>, expectedDataClass: string): string[] {
  const errors = new Set<string>();
  for (const reference of references) {
    if (!reference.objectId?.trim()) errors.add("ARTIFACT_ID_REQUIRED");
    if (reference.dataClass !== expectedDataClass) errors.add("ARTIFACT_DATA_CLASS_MISMATCH");
    if (!Number.isFinite(new Date(reference.verifiedAt).getTime())) errors.add("ARTIFACT_VERIFICATION_TIME_INVALID");
    if (reference.metadata && hasSecret(reference.metadata)) errors.add("ARTIFACT_SECRET_METADATA_FORBIDDEN");
  }
  return [...errors];
}

export function buildGoldenChainReadiness(key: GoldenChainKey, input: {
  dataClass: string;
  sourceSnapshotAt: string | null;
  participantRoles: ReadonlyArray<string>;
  steps: ReadonlyArray<{
    key: string;
    status: string;
    artifactReferences: ReadonlyArray<GoldenChainArtifactReference>;
  }>;
  failurePathResults: ReadonlyArray<{
    key: string;
    status: string;
    evidence: ReadonlyArray<unknown>;
  }>;
}) {
  const definition = GOLDEN_CHAIN_DEFINITIONS[key];
  const blockers: Array<{ code: string; detail: string }> = [];
  if (input.dataClass !== "production") blockers.push({ code: "PRODUCTION_DATA_REQUIRED", detail: "黄金链路只接受明确标记的正式数据。" });
  if (!input.sourceSnapshotAt || !Number.isFinite(new Date(input.sourceSnapshotAt).getTime())) blockers.push({ code: "SOURCE_SNAPSHOT_REQUIRED", detail: "必须冻结可追溯的初始事实快照。" });

  for (const role of definition.roles) {
    if (!input.participantRoles.includes(role)) blockers.push({ code: "PARTICIPANT_ROLE_MISSING", detail: `缺少 ${role} 角色参与者。` });
  }
  for (const contract of definition.steps) {
    const actual = input.steps.find(step => step.key === contract.key);
    if (!actual) {
      blockers.push({ code: "GOLDEN_STEP_MISSING", detail: `缺少步骤：${contract.label}。` });
      continue;
    }
    if (actual.status !== "verified") blockers.push({ code: "GOLDEN_STEP_NOT_VERIFIED", detail: `${contract.label}尚未独立验证。` });
    const actualTypes = new Set(actual.artifactReferences.map(item => item.objectType));
    for (const type of contract.requiredArtifactTypes) {
      if (!actualTypes.has(type)) blockers.push({ code: "REQUIRED_ARTIFACT_MISSING", detail: `${contract.label}缺少 ${type} 结构化引用。` });
    }
    for (const error of validateGoldenChainArtifactReferences(actual.artifactReferences, input.dataClass)) {
      blockers.push({ code: error, detail: `${contract.label}的成果引用不符合验收契约。` });
    }
  }
  for (const contract of definition.failurePaths) {
    const actual = input.failurePathResults.find(result => result.key === contract.key);
    if (!actual || actual.status !== "passed" || actual.evidence.length === 0) blockers.push({ code: "FAILURE_PATH_NOT_VERIFIED", detail: `失败路径“${contract.label}”尚未通过并留证。` });
  }
  return { canPass: blockers.length === 0, blockers, definition };
}
