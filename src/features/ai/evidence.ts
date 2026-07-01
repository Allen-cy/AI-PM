export type AiEvidenceScene = "business_case" | "risk_scan" | "execution_summary" | "workbench_suggestion" | "report" | "general";
export type AiEvidenceStatus = "generated" | "fallback" | "failed";
export type AiEvidenceConfidence = "high" | "medium" | "low";

export interface AiEvidenceBasisItem {
  label: string;
  detail: string;
  source: "user_input" | "feishu" | "rag" | "rule" | "system_template" | "model_output";
}

export interface AiEvidenceSourceRef {
  type: "project" | "risk" | "task" | "milestone" | "payment" | "knowledge" | "form" | "system";
  id?: string;
  name?: string;
  field?: string;
}

export interface AiSuggestedAction {
  title: string;
  owner?: string;
  dueDate?: string;
  priority: "P0" | "P1" | "P2";
  sourceReason: string;
}

export interface AiEvidence {
  id: string;
  scene: AiEvidenceScene;
  title: string;
  model: string;
  status: AiEvidenceStatus;
  confidence: AiEvidenceConfidence;
  inputSummary: string;
  outputSummary: string;
  basis: AiEvidenceBasisItem[];
  sourceRefs: AiEvidenceSourceRef[];
  citations: string[];
  suggestedActions: AiSuggestedAction[];
  generatedAt: string;
  auditId?: string;
  auditStatus?: "succeeded" | "skipped" | "failed";
  auditWarning?: string;
}

export interface BusinessCaseEvidenceInput {
  projectName: string;
  projectType: string;
  projectLevel: string;
  sponsor: string;
  businessJustification: string;
  recommendation: string;
}

export interface RiskScanEvidenceInput {
  projectName?: string;
  stage?: string;
  description: string;
  riskCount: number;
  model: string;
  status: AiEvidenceStatus;
  reason?: string;
}

export interface ExecutionSummaryEvidenceInput {
  projectId?: string;
  taskCount: number;
  blockedTaskCount: number;
  deliverableCount: number;
  pendingDeliverableCount: number;
  model: string;
  status: AiEvidenceStatus;
}

function evidenceId(scene: AiEvidenceScene): string {
  const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `AIE-${scene}-${Date.now()}-${suffix}`;
}

function clip(text: string, max = 500): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

function tomorrowDate(days = 1): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

export function createAiEvidence(input: Omit<AiEvidence, "id" | "generatedAt"> & { id?: string; generatedAt?: string }): AiEvidence {
  return {
    id: input.id || evidenceId(input.scene),
    scene: input.scene,
    title: input.title,
    model: input.model,
    status: input.status,
    confidence: input.confidence,
    inputSummary: input.inputSummary,
    outputSummary: input.outputSummary,
    basis: input.basis,
    sourceRefs: input.sourceRefs,
    citations: input.citations,
    suggestedActions: input.suggestedActions,
    generatedAt: input.generatedAt || new Date().toISOString(),
    auditId: input.auditId,
    auditStatus: input.auditStatus,
    auditWarning: input.auditWarning,
  };
}

export function withAuditResult(evidence: AiEvidence, audit: { id?: string; status: "succeeded" | "skipped" | "failed"; warning?: string }): AiEvidence {
  return {
    ...evidence,
    auditId: audit.id,
    auditStatus: audit.status,
    auditWarning: audit.warning,
  };
}

export function buildBusinessCaseEvidence(input: BusinessCaseEvidenceInput): AiEvidence {
  const hasBusinessInput = Boolean(input.businessJustification.trim());
  return createAiEvidence({
    scene: "business_case",
    title: `${input.projectName || "未命名项目"}商业论证生成依据`,
    model: "rule-assisted-template",
    status: "generated",
    confidence: hasBusinessInput ? "medium" : "low",
    inputSummary: clip([
      `项目名称：${input.projectName || "未填写"}`,
      `类型/等级：${input.projectType}/${input.projectLevel}`,
      `发起人：${input.sponsor || "未填写"}`,
      `业务立项理由：${input.businessJustification || "未填写"}`,
    ].join("；")),
    outputSummary: `生成商业论证草案，建议为「${input.recommendation}」。正式提交前需要人工复核成本、收益、风险和阶段门条件。`,
    basis: [
      { label: "用户输入", detail: "项目名称、类型、等级、发起人、业务立项理由。", source: "user_input" },
      { label: "方法论结构", detail: "商业论证按市场机会、成本收益、风险评估、立项建议组织。", source: "system_template" },
      { label: "人工边界", detail: "不会自动读取外部市场数据、财务系统或飞书合同回款明细。", source: "rule" },
    ],
    sourceRefs: [
      { type: "form", name: input.projectName || "立项表单", field: "商业论证" },
      { type: "knowledge", name: "PMO商业论证结构" },
    ],
    citations: ["立项信息表单", "PMO商业论证模板", "持续商业论证原则"],
    suggestedActions: [
      {
        title: "复核商业论证中的投资、收益、回收期和风险假设",
        owner: input.sponsor || "项目发起人",
        dueDate: tomorrowDate(2),
        priority: input.projectLevel === "S" ? "P0" : "P1",
        sourceReason: "AI商业论证只能生成草案，正式立项前必须人工确认关键假设。",
      },
    ],
  });
}

export function buildRiskScanEvidence(input: RiskScanEvidenceInput): AiEvidence {
  return createAiEvidence({
    scene: "risk_scan",
    title: `${input.projectName || "未指定项目"}风险扫描依据`,
    model: input.model,
    status: input.status,
    confidence: input.status === "generated" ? "medium" : "low",
    inputSummary: clip(`阶段：${input.stage || "未指定"}；项目事实：${input.description}`),
    outputSummary: `生成 ${input.riskCount} 条候选风险。${input.reason || "需要项目经理确认概率、影响、责任人、deadline 和应对动作。"}`,
    basis: [
      { label: "用户输入", detail: "项目事实描述、项目名称和当前阶段。", source: "user_input" },
      { label: "风险模板", detail: "风险核查表、风险种类清单、风险登记册字段结构。", source: "system_template" },
      { label: "生成边界", detail: "候选风险不等于正式风险，保存后仍需项目经理确认。", source: "rule" },
    ],
    sourceRefs: [
      { type: "form", name: input.projectName || "风险扫描输入", field: "项目事实描述" },
      { type: "knowledge", name: "风险核查清单/风险登记册模板" },
    ],
    citations: ["风险核查清单", "风险种类和识别清单", "项目风险跟踪管理模板"],
    suggestedActions: [
      {
        title: "复核AI风险扫描结果并补齐责任人、deadline和应对措施",
        owner: "项目经理",
        dueDate: tomorrowDate(1),
        priority: input.riskCount > 3 ? "P0" : "P1",
        sourceReason: `AI扫描生成${input.riskCount}条候选风险，需要人工确认后纳入正式管理闭环。`,
      },
    ],
  });
}

export function buildExecutionSummaryEvidence(input: ExecutionSummaryEvidenceInput): AiEvidence {
  const hasBlocker = input.blockedTaskCount > 0 || input.pendingDeliverableCount > 0;
  return createAiEvidence({
    scene: "execution_summary",
    title: `${input.projectId || "执行与交付"}状态摘要依据`,
    model: input.model,
    status: input.status,
    confidence: input.taskCount + input.deliverableCount > 0 ? "medium" : "low",
    inputSummary: `项目ID：${input.projectId || "未填写"}；任务${input.taskCount}项，阻塞${input.blockedTaskCount}项；交付物${input.deliverableCount}项，待推进/待验收${input.pendingDeliverableCount}项。`,
    outputSummary: hasBlocker ? "生成执行状态摘要，并识别阻塞任务、待验收交付物和建议动作。" : "生成执行状态摘要，当前未发现明确阻塞。仍需持续复核状态数据。",
    basis: [
      { label: "任务事实", detail: `任务${input.taskCount}项，阻塞${input.blockedTaskCount}项。`, source: "user_input" },
      { label: "交付物事实", detail: `交付物${input.deliverableCount}项，待推进/待验收${input.pendingDeliverableCount}项。`, source: "user_input" },
      { label: "管理规则", detail: "阻塞任务和待验收交付物优先进入行动项跟踪。", source: "rule" },
    ],
    sourceRefs: [
      { type: "task", name: "执行任务列表" },
      { type: "system", name: "执行与交付页面输入" },
    ],
    citations: ["执行任务列表", "交付物列表", "执行状态摘要规则"],
    suggestedActions: [
      {
        title: hasBlocker ? "处理执行阻塞并补充恢复计划" : "复核执行状态和交付物验收证据",
        owner: "项目经理",
        dueDate: tomorrowDate(1),
        priority: hasBlocker ? "P0" : "P1",
        sourceReason: hasBlocker ? "存在阻塞任务或待验收交付物。" : "未发现阻塞，但仍需要保持状态数据及时更新。",
      },
    ],
  });
}
