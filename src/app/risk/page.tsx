"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { AiEvidence, AiSuggestedAction } from "@/features/ai/evidence";
import type { RiskClosureDashboard, RiskClosureDecision } from "@/features/risk/closure";
import type { RiskRetrospectiveGovernanceDashboard } from "@/features/risk/retrospective-governance";
import type { RiskRetrospectiveSyncLog } from "@/features/risk/retrospective-knowledge-sync";
import type { RiskRetrospectiveAssetDuplicateWarning, RiskRetrospectiveAssetEditPatch, RiskRetrospectiveAssetRecord, RiskRetrospectiveRecommendation } from "@/features/risk/retrospective-assets";
import type { RiskRetrospectiveQualityDashboard } from "@/features/risk/retrospective-quality";
import type { RiskRetrospectiveDashboard } from "@/features/risk/retrospective";
import {
  type LinkedModule,
  type Risk,
  type RiskCategory,
  type RiskImpactArea,
  type RiskStage,
  type RiskStatus,
  type RiskStrategy,
  type RiskWorkflowEvent,
  calculateRiskPriority,
  calculateRiskScore,
  categoryLabels,
  classifyRisks,
  generateMatrixGrid,
  getRiskColor,
  getRiskLevel,
  getWorkflowStepForStatus,
  impactAreaLabels,
  initialRisks,
  nextRiskStatus,
  responseStrategyGuidance,
  riskChecklistItems,
  riskLifecycleSteps,
  riskManagementRoles,
  stageGateRiskRequirements,
  statusLabels,
  statusOrder,
} from "@/lib/risk";

type ActiveTab = "overview" | "integration" | "list" | "checklist" | "matrix" | "workflow" | "response" | "closure" | "retrospective";

type RiskForm = Omit<Risk, "id" | "piScore" | "priorityScore" | "createdAt">;

type TransitionForm = {
  toStatus: RiskStatus;
  inputSummary: string;
  outputSummary: string;
  actionRequired: string;
  owner: string;
  deadline: string;
  evidence: string;
  closureEvidence: string;
  reviewOpinion: string;
  reviewer: string;
  reviewedAt: string;
  closureDecision: RiskClosureDecision;
  dependencyDisposition: string;
  residualRisk: string;
  followUpAction: string;
  followUpOwner: string;
  followUpDeadline: string;
  lessonsLearned: string;
};

type RetrospectiveAssetEditForm = Required<Pick<RiskRetrospectiveAssetEditPatch, "title" | "applicability" | "lessonLearned" | "earlyWarningRule" | "reusablePractice">> & {
  tagsText: string;
};

interface DashboardRiskRecord {
  项目编号?: string;
  项目名称?: string;
  项目状态?: string;
  风险类型?: string;
  风险等级?: "高" | "中" | "低";
  风险状态?: string;
  风险趋势?: string;
  进度偏差?: number;
  成本健康度?: number;
  应收金额?: number;
  到期日期?: string;
  是否重点项目?: boolean;
  重点项目原因?: string;
}

type RiskIntegration = {
  summary: {
    openRiskLinks: number;
    highSeverity: number;
    projectHealthImpacts: number;
    taskImpacts: number;
    milestoneImpacts: number;
    paymentImpacts: number;
    governanceEscalations: number;
    pendingConfirmation: number;
  };
  links: Array<{
    id: string;
    projectName: string;
    riskDescription: string;
    severity: "高" | "中" | "低";
    status: string;
    owner: string;
    deadline: string;
    dependencies: string[];
    impactedTargets: string[];
    suggestedWritebacks: Array<{ target: string; field: string; suggestedValue: string; reason: string; requiresConfirmation: boolean }>;
    actions: Array<{ id: string; title: string; owner: string; dueDate: string; priority: "P0" | "P1" | "P2"; targetModule: string; sourceReason: string; confirmationRequired: boolean }>;
    reportFact: string;
    writebackMode: string;
  }>;
  reportFacts: string[];
  boundary: string;
};

type RiskEscalationDraftType = "governance_workflow" | "unified_action";

type RiskEscalationDraft = {
  id: string;
  type: RiskEscalationDraftType;
  projectName: string;
  title: string;
  owner: string;
  deadline: string;
  priority: "P0" | "P1" | "P2";
  sourceReason: string;
  confirmationRequired: boolean;
  targetRoute: string;
  workflowId?: string;
  approver?: string;
  targetModule?: string;
};

type RiskEscalationDraftDashboard = {
  summary: {
    candidateRiskLinks: number;
    governanceDrafts: number;
    actionDrafts: number;
    highPriorityDrafts: number;
    pendingConfirmation: number;
  };
  governanceDrafts: RiskEscalationDraft[];
  actionDrafts: RiskEscalationDraft[];
  boundary: string;
};

const categories = Object.keys(categoryLabels) as RiskCategory[];
const impactAreas = Object.keys(impactAreaLabels) as RiskImpactArea[];
const stages: RiskStage[] = ["立项", "规划", "执行", "监控", "验收", "结项", "全生命周期"];
const strategies: RiskStrategy[] = ["规避", "缓解", "转移", "接受", "上报"];
const modules: LinkedModule[] = ["项目组合看板", "立项", "规划", "执行", "监控", "收尾", "合同回款", "质量", "资源"];
const priorityColor: Record<string, string> = {
  P0: "var(--red)",
  P1: "var(--amber)",
  P2: "var(--accent2)",
};

function dateByOffset(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function downloadText(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function defaultForm(): RiskForm {
  return {
    projectName: "",
    description: "",
    category: "需求",
    stage: "规划",
    source: "人工登记",
    impactArea: "范围",
    probability: 3,
    impact: 3,
    urgency: 3,
    status: "identified",
    responseStrategyType: "缓解",
    responseStrategy: "",
    preventiveAction: "",
    contingencyPlan: "",
    trigger: "",
    trackingMethod: "周会/监控中心定期复核风险状态、趋势和责任人行动。",
    owner: "",
    dueDate: dateByOffset(14),
    nextReviewDate: dateByOffset(7),
    closingCriteria: "",
    linkedModule: "规划",
    evidence: "",
  };
}

function withScores(form: RiskForm, id: string, createdAt: string): Risk {
  const piScore = calculateRiskScore(form.probability, form.impact);
  return {
    ...form,
    id,
    piScore,
    priorityScore: calculateRiskPriority(form.probability, form.impact, form.urgency),
    createdAt,
  };
}

function levelLabel(score: number): string {
  const level = getRiskLevel(score);
  if (level === "high") return "高";
  if (level === "medium") return "中";
  return "低";
}

function riskLevelClass(score: number): string {
  const level = getRiskLevel(score);
  if (level === "high") return "tag-amber";
  if (level === "medium") return "tag-blue";
  return "tag-green";
}

function inferCategory(type = ""): RiskCategory {
  if (type.includes("回款") || type.includes("合同")) return "合同";
  if (type.includes("进度") || type.includes("延期")) return "进度";
  if (type.includes("成本") || type.includes("财务")) return "财务";
  if (type.includes("质量") || type.includes("验收")) return "质量";
  if (type.includes("客户") || type.includes("需求")) return "客户";
  return "管理";
}

function stageFromStatus(status = ""): RiskStage {
  if (status.includes("立项") || status.includes("待启动")) return "立项";
  if (status.includes("规划")) return "规划";
  if (status.includes("验收")) return "验收";
  if (status.includes("结项") || status.includes("收尾") || status.includes("已验收")) return "结项";
  if (status.includes("监控")) return "监控";
  return "执行";
}

function scoreFromSeverity(severity?: "高" | "中" | "低"): Pick<Risk, "probability" | "impact" | "urgency"> {
  if (severity === "高") return { probability: 4, impact: 5, urgency: 5 };
  if (severity === "中") return { probability: 3, impact: 4, urgency: 4 };
  return { probability: 2, impact: 2, urgency: 2 };
}

function dashboardRecordToRisk(record: DashboardRiskRecord, index: number): Risk {
  const severityScores = scoreFromSeverity(record.风险等级);
  const riskType = record.风险类型 || (Number(record.进度偏差 ?? 0) < -5 ? "进度风险" : "综合风险");
  const impactArea: RiskImpactArea = riskType.includes("回款") || riskType.includes("合同")
    ? "回款"
    : riskType.includes("进度")
      ? "工期"
      : riskType.includes("质量")
        ? "质量"
        : "范围";
  const form: RiskForm = {
    projectName: record.项目名称 || "飞书项目台账项目",
    description: `${riskType}：${record.风险状态 || "由项目组合看板识别"}。${record.重点项目原因 ? `重点项目依据：${record.重点项目原因}。` : ""}`,
    category: inferCategory(riskType),
    stage: stageFromStatus(record.项目状态),
    source: "飞书项目台账 / 项目组合看板",
    impactArea,
    probability: severityScores.probability,
    impact: severityScores.impact,
    urgency: severityScores.urgency,
    status: "identified",
    responseStrategyType: record.风险等级 === "高" ? "上报" : "缓解",
    responseStrategy: "进入风险登记册后，由责任人确认应对动作，并同步到关联模块跟踪。",
    preventiveAction: "复核项目状态、进度偏差、成本健康度、应收金额和风险趋势，补齐阶段门证据。",
    contingencyPlan: "若风险继续恶化，提交PMO治理例会并调整范围、资源或回款计划。",
    trigger: "项目台账风险等级为高/中，或进度、成本、回款指标突破容差。",
    trackingMethod: "从项目组合看板和监控中心每周复核风险趋势。",
    owner: "项目经理",
    dueDate: record.到期日期 || dateByOffset(14),
    nextReviewDate: dateByOffset(7),
    closingCriteria: "风险指标恢复到可接受范围，或治理层批准的应对方案已落地。",
    linkedModule: impactArea === "回款" ? "合同回款" : impactArea === "质量" ? "质量" : "监控",
    evidence: `来自飞书项目台账：${record.项目编号 || "无编号"}`,
    workflowStep: "identify",
    currentInput: "飞书项目台账中的风险等级、进度偏差、应收金额、重点项目标记和项目状态。",
    currentOutput: "项目台账风险线索已转入风险登记册。",
    lastAction: "由项目经理确认风险等级、补齐应对计划并推进到分析环节。",
    actionOwner: "项目经理",
    actionDeadline: record.到期日期 || dateByOffset(7),
  };
  return withScores(form, `FS-${record.项目编号 || index + 1}`, new Date().toISOString().split("T")[0]);
}

function StatCard({ label, value, color, sub }: { label: string; value: string | number; color?: string; sub?: string }) {
  return (
    <div className="stat-card">
      <div className="stat-num" style={{ color: color || "var(--accent2)" }}>{value}</div>
      <div className="stat-label">{label}</div>
      {sub && <div style={{ marginTop: 6, fontSize: "0.68rem", color: "var(--text2)" }}>{sub}</div>}
    </div>
  );
}

function RiskBadge({ risk }: { risk: Risk }) {
  return <span className={`tag ${riskLevelClass(risk.piScore)}`}>{levelLabel(risk.piScore)}风险 · {risk.piScore}</span>;
}

function workflowPercent(status: RiskStatus): number {
  if (status === "closed") return 100;
  const active = statusOrder.filter(item => item !== "closed");
  const index = Math.max(0, active.indexOf(status));
  return Math.round(((index + 1) / active.length) * 100);
}

function StatusBadge({ status }: { status: RiskStatus }) {
  const colorMap: Record<RiskStatus, string> = {
    identified: "#3b82f6",
    analyzing: "#8b5cf6",
    "response-planned": "#06b6d4",
    "response-implementing": "#f97316",
    monitoring: "#14b8a6",
    tracking: "#f59e0b",
    resolved: "#22c55e",
    closed: "#64748b",
  };
  return (
    <span style={{
      padding: "4px 10px",
      borderRadius: 999,
      fontWeight: 700,
      fontSize: "0.72rem",
      background: `${colorMap[status]}18`,
      color: colorMap[status],
      whiteSpace: "nowrap",
    }}>
      {statusLabels[status]}
    </span>
  );
}

export default function RiskPage() {
  const [risks, setRisks] = useState<Risk[]>([]);
  const [workflowEvents, setWorkflowEvents] = useState<RiskWorkflowEvent[]>([]);
  const [activeTab, setActiveTab] = useState<ActiveTab>("overview");
  const [statusFilter, setStatusFilter] = useState<RiskStatus | "all">("all");
  const [categoryFilter, setCategoryFilter] = useState<RiskCategory | "all">("all");
  const [stageFilter, setStageFilter] = useState<RiskStage | "all">("all");
  const [loadingRisks, setLoadingRisks] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingRisk, setEditingRisk] = useState<Risk | null>(null);
  const [formData, setFormData] = useState<RiskForm>(defaultForm);
  const [transitioningRisk, setTransitioningRisk] = useState<Risk | null>(null);
  const [transitionForm, setTransitionForm] = useState<TransitionForm>(() => {
    const step = getWorkflowStepForStatus("analyzing");
    return {
      toStatus: "analyzing",
      inputSummary: step.input,
      outputSummary: step.output,
      actionRequired: step.requiredAction,
      owner: "项目经理",
      deadline: dateByOffset(7),
      evidence: "",
      closureEvidence: "",
      reviewOpinion: "",
      reviewer: "PMO",
      reviewedAt: new Date().toISOString().slice(0, 10),
      closureDecision: "approved",
      dependencyDisposition: "",
      residualRisk: "",
      followUpAction: "",
      followUpOwner: "",
      followUpDeadline: dateByOffset(7),
      lessonsLearned: "",
    };
  });
  const [projectDesc, setProjectDesc] = useState("");
  const [scanProjectName, setScanProjectName] = useState("");
  const [scanStage, setScanStage] = useState<RiskStage>("规划");
  const [scanning, setScanning] = useState(false);
  const [loadingFeishu, setLoadingFeishu] = useState(false);
  const [lastRiskEvidence, setLastRiskEvidence] = useState<AiEvidence | null>(null);
  const [riskIntegration, setRiskIntegration] = useState<RiskIntegration | null>(null);
  const [riskEscalation, setRiskEscalation] = useState<RiskEscalationDraftDashboard | null>(null);
  const [riskClosure, setRiskClosure] = useState<RiskClosureDashboard | null>(null);
  const [riskRetrospective, setRiskRetrospective] = useState<RiskRetrospectiveDashboard | null>(null);
  const [riskRetrospectiveAssets, setRiskRetrospectiveAssets] = useState<RiskRetrospectiveAssetRecord[]>([]);
  const [riskRetrospectiveRecommendations, setRiskRetrospectiveRecommendations] = useState<RiskRetrospectiveRecommendation[]>([]);
  const [riskRetrospectiveSyncLogs, setRiskRetrospectiveSyncLogs] = useState<RiskRetrospectiveSyncLog[]>([]);
  const [riskRetrospectiveDuplicateWarnings, setRiskRetrospectiveDuplicateWarnings] = useState<RiskRetrospectiveAssetDuplicateWarning[]>([]);
  const [riskRetrospectiveQuality, setRiskRetrospectiveQuality] = useState<RiskRetrospectiveQualityDashboard | null>(null);
  const [riskRetrospectiveGovernance, setRiskRetrospectiveGovernance] = useState<RiskRetrospectiveGovernanceDashboard | null>(null);
  const [retrospectiveAssetWarning, setRetrospectiveAssetWarning] = useState("");
  const [retrospectiveSyncWarning, setRetrospectiveSyncWarning] = useState("");
  const [retrospectiveGovernanceWarning, setRetrospectiveGovernanceWarning] = useState("");
  const [savingRetrospectiveAsset, setSavingRetrospectiveAsset] = useState<string | null>(null);
  const [editingRetrospectiveAssetId, setEditingRetrospectiveAssetId] = useState<string | null>(null);
  const [retrospectiveAssetEditForm, setRetrospectiveAssetEditForm] = useState<RetrospectiveAssetEditForm>({
    title: "",
    applicability: "",
    lessonLearned: "",
    earlyWarningRule: "",
    reusablePractice: "",
    tagsText: "",
  });
  const [exportingRetrospectiveAssets, setExportingRetrospectiveAssets] = useState(false);
  const [confirmingEscalationDraft, setConfirmingEscalationDraft] = useState<string | null>(null);
  const [confirmedEscalationDrafts, setConfirmedEscalationDrafts] = useState<Set<string>>(() => new Set());
  const [savingEvidenceAction, setSavingEvidenceAction] = useState<string | null>(null);
  const [evidenceActionMessage, setEvidenceActionMessage] = useState("");
  const [reviewNow] = useState(() => Date.now());
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function loadRisks() {
      setLoadingRisks(true);
      setError("");
      try {
        const response = await fetch("/api/risk", { cache: "no-store" });
        const data = await response.json() as { risks?: Risk[]; events?: RiskWorkflowEvent[]; warning?: string; error?: string; migrationHint?: string };
        if (!response.ok) throw new Error([data.error, data.migrationHint].filter(Boolean).join("；") || "风险登记册读取失败");
        const [integrationResponse, escalationResponse, closureResponse, retrospectiveResponse, retrospectiveAssetsResponse, retrospectiveRecommendationsResponse, retrospectiveExportResponse, retrospectiveQualityResponse, retrospectiveGovernanceResponse] = await Promise.all([
          fetch("/api/risk/integration", { cache: "no-store" }),
          fetch("/api/risk/escalation-drafts", { cache: "no-store" }),
          fetch("/api/risk/closure", { cache: "no-store" }),
          fetch("/api/risk/retrospective", { cache: "no-store" }),
          fetch("/api/risk/retrospective/assets", { cache: "no-store" }),
          fetch("/api/risk/retrospective/recommendations", { cache: "no-store" }),
          fetch("/api/risk/retrospective/assets/export", { cache: "no-store" }),
          fetch("/api/risk/retrospective/assets/quality", { cache: "no-store" }),
          fetch("/api/risk/retrospective/assets/governance", { cache: "no-store" }),
        ]);
        const integrationData = await integrationResponse.json().catch(() => ({})) as { risk_integration?: RiskIntegration };
        const escalationData = await escalationResponse.json().catch(() => ({})) as { risk_escalation?: RiskEscalationDraftDashboard };
        const closureData = await closureResponse.json().catch(() => ({})) as { risk_closure?: RiskClosureDashboard };
        const retrospectiveData = await retrospectiveResponse.json().catch(() => ({})) as { risk_retrospective?: RiskRetrospectiveDashboard };
        const retrospectiveAssetsData = await retrospectiveAssetsResponse.json().catch(() => ({})) as {
          assets?: RiskRetrospectiveAssetRecord[];
          duplicate_warnings?: RiskRetrospectiveAssetDuplicateWarning[];
          warning?: string;
        };
        const retrospectiveRecommendationsData = await retrospectiveRecommendationsResponse.json().catch(() => ({})) as { recommendations?: RiskRetrospectiveRecommendation[] };
        const retrospectiveExportData = await retrospectiveExportResponse.json().catch(() => ({})) as { logs?: RiskRetrospectiveSyncLog[]; warning?: string };
        const retrospectiveQualityData = await retrospectiveQualityResponse.json().catch(() => ({})) as { risk_retrospective_quality?: RiskRetrospectiveQualityDashboard };
        const retrospectiveGovernanceData = await retrospectiveGovernanceResponse.json().catch(() => ({})) as { risk_retrospective_governance?: RiskRetrospectiveGovernanceDashboard; warning?: string };
        if (cancelled) return;
        setRisks(Array.isArray(data.risks) ? data.risks : []);
        setWorkflowEvents(Array.isArray(data.events) ? data.events : []);
        setRiskIntegration(integrationData.risk_integration ?? null);
        setRiskEscalation(escalationData.risk_escalation ?? null);
        setRiskClosure(closureData.risk_closure ?? null);
        setRiskRetrospective(retrospectiveData.risk_retrospective ?? null);
        setRiskRetrospectiveAssets(Array.isArray(retrospectiveAssetsData.assets) ? retrospectiveAssetsData.assets : []);
        setRiskRetrospectiveDuplicateWarnings(Array.isArray(retrospectiveAssetsData.duplicate_warnings) ? retrospectiveAssetsData.duplicate_warnings : []);
        setRiskRetrospectiveRecommendations(Array.isArray(retrospectiveRecommendationsData.recommendations) ? retrospectiveRecommendationsData.recommendations : []);
        setRiskRetrospectiveSyncLogs(Array.isArray(retrospectiveExportData.logs) ? retrospectiveExportData.logs : []);
        setRiskRetrospectiveQuality(retrospectiveQualityData.risk_retrospective_quality ?? null);
        setRiskRetrospectiveGovernance(retrospectiveGovernanceData.risk_retrospective_governance ?? null);
        setRetrospectiveAssetWarning(retrospectiveAssetsData.warning || "");
        setRetrospectiveSyncWarning(retrospectiveExportData.warning || "");
        setRetrospectiveGovernanceWarning(retrospectiveGovernanceData.warning || "");
        setMessage(data.warning || "");
      } catch (e: unknown) {
        if (cancelled) return;
        setRisks(initialRisks);
        setError(`风险登记册读取失败，已展示本地样例：${e instanceof Error ? e.message : String(e)}`);
      } finally {
        if (!cancelled) setLoadingRisks(false);
      }
    }
    void loadRisks();
    return () => {
      cancelled = true;
    };
  }, []);

  const classified = useMemo(() => classifyRisks(risks), [risks]);
  const openRisks = risks.filter(risk => !["resolved", "closed"].includes(risk.status));
  const overdueReviews = openRisks.filter(risk => risk.nextReviewDate && new Date(risk.nextReviewDate).getTime() < reviewNow).length;
  const responsePlanMissing = openRisks.filter(risk => !risk.responseStrategy.trim() || !risk.owner.trim()).length;
  const matrixGrid = useMemo(() => generateMatrixGrid(risks), [risks]);

  const filteredRisks = risks.filter(risk => (
    (statusFilter === "all" || risk.status === statusFilter)
    && (categoryFilter === "all" || risk.category === categoryFilter)
    && (stageFilter === "all" || risk.stage === stageFilter)
  ));

  const responseRisks = [...openRisks].sort((a, b) => b.priorityScore - a.priorityScore).slice(0, 8);
  const latestEventByRisk = useMemo(() => {
    const map = new Map<string, RiskWorkflowEvent>();
    for (const event of workflowEvents) {
      const keys = [event.riskId, event.riskCode].filter(Boolean) as string[];
      for (const key of keys) {
        if (!map.has(key)) map.set(key, event);
      }
    }
    return map;
  }, [workflowEvents]);
  const retrospectiveAssetByRiskId = useMemo(() => {
    const map = new Map<string, RiskRetrospectiveAssetRecord>();
    for (const asset of riskRetrospectiveAssets) {
      map.set(asset.sourceRiskId, asset);
    }
    return map;
  }, [riskRetrospectiveAssets]);
  const duplicateMergeTargetByAssetId = useMemo(() => {
    const map = new Map<string, string>();
    for (const warning of riskRetrospectiveDuplicateWarnings) {
      const targetId = warning.assetIds[0];
      for (const assetId of warning.assetIds.slice(1)) {
        if (!map.has(assetId)) map.set(assetId, targetId);
      }
    }
    return map;
  }, [riskRetrospectiveDuplicateWarnings]);
  const retrospectiveAssetById = useMemo(() => {
    const map = new Map<string, RiskRetrospectiveAssetRecord>();
    for (const asset of riskRetrospectiveAssets) map.set(asset.id, asset);
    return map;
  }, [riskRetrospectiveAssets]);

  const handleSave = async () => {
    if (!formData.description.trim()) {
      setError("请填写风险描述");
      return;
    }
    if (!formData.owner.trim()) {
      setError("请填写责任人，风险没有责任人就无法闭环");
      return;
    }
    if (!formData.dueDate) {
      setError("请填写deadline，风险管理动作必须有到期日");
      return;
    }
    const saved = withScores(
      formData,
      editingRisk?.id || `R${String(risks.length + 1).padStart(3, "0")}`,
      editingRisk?.createdAt || new Date().toISOString().split("T")[0],
    );
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/risk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ risk: saved }),
      });
      const data = await response.json() as { risk?: Risk; error?: string; migrationHint?: string };
      if (!response.ok || !data.risk) throw new Error([data.error, data.migrationHint].filter(Boolean).join("；") || "风险保存失败");
      setRisks(prev => {
        const match = (risk: Risk) => risk.id === saved.id || risk.id === data.risk!.id || risk.riskCode === data.risk!.riskCode;
        return prev.some(match)
          ? prev.map(risk => match(risk) ? data.risk! : risk)
          : [data.risk!, ...prev];
      });
      setShowForm(false);
      setEditingRisk(null);
      setFormData(defaultForm());
      setMessage(editingRisk ? "风险已更新并持久化。" : "风险已加入登记册并持久化。");
    } catch (e: unknown) {
      setError(`风险保存失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (risk: Risk) => {
    setEditingRisk(risk);
    setFormData({
      projectName: risk.projectName,
      description: risk.description,
      category: risk.category,
      stage: risk.stage,
      source: risk.source,
      impactArea: risk.impactArea,
      probability: risk.probability,
      impact: risk.impact,
      urgency: risk.urgency,
      status: risk.status,
      responseStrategyType: risk.responseStrategyType,
      responseStrategy: risk.responseStrategy,
      preventiveAction: risk.preventiveAction,
      contingencyPlan: risk.contingencyPlan,
      trigger: risk.trigger,
      trackingMethod: risk.trackingMethod,
      owner: risk.owner,
      dueDate: risk.dueDate,
      nextReviewDate: risk.nextReviewDate,
      closingCriteria: risk.closingCriteria,
      linkedModule: risk.linkedModule,
      evidence: risk.evidence,
    });
    setShowForm(true);
    setError("");
  };

  const openTransition = (risk: Risk, toStatus: RiskStatus = nextRiskStatus(risk.status)) => {
    const step = getWorkflowStepForStatus(toStatus);
    setTransitioningRisk(risk);
    setTransitionForm({
      toStatus,
      inputSummary: risk.currentInput || step.input,
      outputSummary: risk.currentOutput || step.output,
      actionRequired: risk.lastAction || step.requiredAction,
      owner: risk.actionOwner || risk.owner || "项目经理",
      deadline: risk.actionDeadline || risk.dueDate || dateByOffset(7),
      evidence: risk.evidence || "",
      closureEvidence: "",
      reviewOpinion: "",
      reviewer: risk.actionOwner || risk.owner || "PMO",
      reviewedAt: new Date().toISOString().slice(0, 10),
      closureDecision: "approved",
      dependencyDisposition: "",
      residualRisk: "",
      followUpAction: "",
      followUpOwner: risk.actionOwner || risk.owner || "",
      followUpDeadline: dateByOffset(7),
      lessonsLearned: "",
    });
    setError("");
  };

  const handleTransition = async () => {
    if (!transitioningRisk) return;
    if (!transitionForm.owner.trim()) {
      setError("请填写责任人");
      return;
    }
    if (!transitionForm.deadline) {
      setError("请填写deadline");
      return;
    }
    if (transitionForm.toStatus === "closed") {
      if (!transitionForm.closureEvidence.trim() || !transitionForm.reviewOpinion.trim() || !transitionForm.reviewer.trim() || !transitionForm.reviewedAt || !transitionForm.dependencyDisposition.trim()) {
        setError("关闭风险必须补齐关闭证据、复核意见、复核人、复核日期和依赖处置说明。");
        return;
      }
      if (transitionForm.closureDecision === "conditional" && (!transitionForm.followUpAction.trim() || !transitionForm.followUpOwner.trim() || !transitionForm.followUpDeadline)) {
        setError("有条件关闭必须补齐后续动作、责任人和deadline。");
        return;
      }
    }
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/risk", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: transitioningRisk.id,
          toStatus: transitionForm.toStatus,
          inputSummary: transitionForm.inputSummary,
          outputSummary: transitionForm.outputSummary,
          actionRequired: transitionForm.actionRequired,
          owner: transitionForm.owner,
          deadline: transitionForm.deadline,
          evidence: transitionForm.evidence,
          closure: transitionForm.toStatus === "closed" ? {
            closureEvidence: transitionForm.closureEvidence,
            reviewOpinion: transitionForm.reviewOpinion,
            reviewer: transitionForm.reviewer,
            reviewedAt: transitionForm.reviewedAt,
            closureDecision: transitionForm.closureDecision,
            dependencyDisposition: transitionForm.dependencyDisposition,
            residualRisk: transitionForm.residualRisk,
            followUpAction: transitionForm.followUpAction,
            followUpOwner: transitionForm.followUpOwner,
            followUpDeadline: transitionForm.followUpDeadline,
            lessonsLearned: transitionForm.lessonsLearned,
          } : undefined,
        }),
      });
      const data = await response.json() as { risk?: Risk; event?: RiskWorkflowEvent; warning?: string; error?: string; migrationHint?: string };
      if (!response.ok || !data.risk || !data.event) throw new Error([data.error, data.migrationHint].filter(Boolean).join("；") || "状态流转失败");
      setRisks(prev => prev.map(risk => risk.id === transitioningRisk.id || risk.riskCode === transitioningRisk.riskCode ? data.risk! : risk));
      setWorkflowEvents(prev => [data.event!, ...prev.filter(event => event.id !== data.event!.id)]);
      if (data.risk.status === "closed") {
        void Promise.all([
          fetch("/api/risk/closure", { cache: "no-store" }),
          fetch("/api/risk/retrospective", { cache: "no-store" }),
          fetch("/api/risk/retrospective/assets", { cache: "no-store" }),
          fetch("/api/risk/retrospective/recommendations", { cache: "no-store" }),
          fetch("/api/risk/retrospective/assets/quality", { cache: "no-store" }),
          fetch("/api/risk/retrospective/assets/governance", { cache: "no-store" }),
        ])
          .then(async ([closureResponse, retrospectiveResponse, assetsResponse, recommendationsResponse, qualityResponse, governanceResponse]) => {
            const closurePayload = await closureResponse.json().catch(() => ({})) as { risk_closure?: RiskClosureDashboard };
            const retrospectivePayload = await retrospectiveResponse.json().catch(() => ({})) as { risk_retrospective?: RiskRetrospectiveDashboard };
            const assetsPayload = await assetsResponse.json().catch(() => ({})) as {
              assets?: RiskRetrospectiveAssetRecord[];
              duplicate_warnings?: RiskRetrospectiveAssetDuplicateWarning[];
              warning?: string;
            };
            const recommendationsPayload = await recommendationsResponse.json().catch(() => ({})) as { recommendations?: RiskRetrospectiveRecommendation[] };
            const qualityPayload = await qualityResponse.json().catch(() => ({})) as { risk_retrospective_quality?: RiskRetrospectiveQualityDashboard };
            const governancePayload = await governanceResponse.json().catch(() => ({})) as { risk_retrospective_governance?: RiskRetrospectiveGovernanceDashboard; warning?: string };
            setRiskClosure(closurePayload.risk_closure ?? null);
            setRiskRetrospective(retrospectivePayload.risk_retrospective ?? null);
            setRiskRetrospectiveAssets(Array.isArray(assetsPayload.assets) ? assetsPayload.assets : []);
            setRiskRetrospectiveDuplicateWarnings(Array.isArray(assetsPayload.duplicate_warnings) ? assetsPayload.duplicate_warnings : []);
            setRiskRetrospectiveRecommendations(Array.isArray(recommendationsPayload.recommendations) ? recommendationsPayload.recommendations : []);
            setRiskRetrospectiveQuality(qualityPayload.risk_retrospective_quality ?? null);
            setRiskRetrospectiveGovernance(governancePayload.risk_retrospective_governance ?? null);
            setRetrospectiveGovernanceWarning(governancePayload.warning || "");
            setRetrospectiveAssetWarning(assetsPayload.warning || "");
          })
          .catch(() => undefined);
      }
      setTransitioningRisk(null);
      setMessage(data.warning || `风险已流转到「${statusLabels[data.risk.status]}」，并记录工作流动作。`);
    } catch (e: unknown) {
      setError(`状态流转失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSaving(false);
    }
  };

  const refreshRetrospectiveAssets = async () => {
    const [response, recommendationsResponse, exportResponse, qualityResponse, governanceResponse] = await Promise.all([
      fetch("/api/risk/retrospective/assets", { cache: "no-store" }),
      fetch("/api/risk/retrospective/recommendations", { cache: "no-store" }),
      fetch("/api/risk/retrospective/assets/export", { cache: "no-store" }),
      fetch("/api/risk/retrospective/assets/quality", { cache: "no-store" }),
      fetch("/api/risk/retrospective/assets/governance", { cache: "no-store" }),
    ]);
    const payload = await response.json().catch(() => ({})) as {
      assets?: RiskRetrospectiveAssetRecord[];
      duplicate_warnings?: RiskRetrospectiveAssetDuplicateWarning[];
      warning?: string;
    };
    const recommendationsPayload = await recommendationsResponse.json().catch(() => ({})) as { recommendations?: RiskRetrospectiveRecommendation[] };
    const exportPayload = await exportResponse.json().catch(() => ({})) as { logs?: RiskRetrospectiveSyncLog[]; warning?: string };
    const qualityPayload = await qualityResponse.json().catch(() => ({})) as { risk_retrospective_quality?: RiskRetrospectiveQualityDashboard };
    const governancePayload = await governanceResponse.json().catch(() => ({})) as { risk_retrospective_governance?: RiskRetrospectiveGovernanceDashboard; warning?: string };
    setRiskRetrospectiveAssets(Array.isArray(payload.assets) ? payload.assets : []);
    setRiskRetrospectiveDuplicateWarnings(Array.isArray(payload.duplicate_warnings) ? payload.duplicate_warnings : []);
    setRiskRetrospectiveRecommendations(Array.isArray(recommendationsPayload.recommendations) ? recommendationsPayload.recommendations : []);
    setRiskRetrospectiveSyncLogs(Array.isArray(exportPayload.logs) ? exportPayload.logs : []);
    setRiskRetrospectiveQuality(qualityPayload.risk_retrospective_quality ?? null);
    setRiskRetrospectiveGovernance(governancePayload.risk_retrospective_governance ?? null);
    setRetrospectiveAssetWarning(payload.warning || "");
    setRetrospectiveSyncWarning(exportPayload.warning || "");
    setRetrospectiveGovernanceWarning(governancePayload.warning || "");
  };

  const mutateRetrospectiveAsset = async (input: {
    action: "confirm" | "publish" | "archive" | "review";
    card?: NonNullable<RiskRetrospectiveDashboard>["knowledgeCards"][number];
    id?: string;
    savingKey: string;
  }) => {
    setSavingRetrospectiveAsset(input.savingKey);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/risk/retrospective/assets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: input.action, card: input.card, id: input.id }),
      });
      const payload = await response.json().catch(() => ({})) as {
        asset?: RiskRetrospectiveAssetRecord;
        duplicate_warnings?: RiskRetrospectiveAssetDuplicateWarning[];
        governance_warning?: string;
        warning?: string;
        error?: string;
        status?: string;
      };
      if (!response.ok || payload.status === "failed" || payload.status === "not_configured") {
        throw new Error(payload.warning || payload.error || "风险复盘资产操作失败");
      }
      await refreshRetrospectiveAssets();
      if (Array.isArray(payload.duplicate_warnings)) setRiskRetrospectiveDuplicateWarnings(payload.duplicate_warnings);
      if (payload.governance_warning) setRetrospectiveAssetWarning(payload.governance_warning);
      const actionLabel = input.action === "confirm"
        ? "已确认为组织过程资产"
        : input.action === "publish"
          ? "已发布到 RAG 检索"
          : input.action === "archive"
            ? "已从 RAG 撤回"
            : "已恢复为待发布";
      setMessage(actionLabel);
    } catch (e: unknown) {
      setError(`风险复盘资产操作失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSavingRetrospectiveAsset(null);
    }
  };

  const openRetrospectiveAssetEdit = (asset: RiskRetrospectiveAssetRecord) => {
    setEditingRetrospectiveAssetId(asset.id);
    setRetrospectiveAssetEditForm({
      title: asset.title,
      applicability: asset.applicability,
      lessonLearned: asset.lessonLearned,
      earlyWarningRule: asset.earlyWarningRule,
      reusablePractice: asset.reusablePractice,
      tagsText: asset.tags.join("、"),
    });
    setError("");
  };

  const saveRetrospectiveAssetEdit = async (assetId: string) => {
    setSavingRetrospectiveAsset(assetId);
    setError("");
    setMessage("");
    try {
      const patch: RiskRetrospectiveAssetEditPatch = {
        title: retrospectiveAssetEditForm.title,
        applicability: retrospectiveAssetEditForm.applicability,
        lessonLearned: retrospectiveAssetEditForm.lessonLearned,
        earlyWarningRule: retrospectiveAssetEditForm.earlyWarningRule,
        reusablePractice: retrospectiveAssetEditForm.reusablePractice,
        tags: retrospectiveAssetEditForm.tagsText.split(/[、,，\n]/u).map(item => item.trim()).filter(Boolean),
      };
      const response = await fetch("/api/risk/retrospective/assets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update", id: assetId, patch }),
      });
      const payload = await response.json().catch(() => ({})) as {
        asset?: RiskRetrospectiveAssetRecord;
        duplicate_warnings?: RiskRetrospectiveAssetDuplicateWarning[];
        governance_warning?: string;
        warning?: string;
        error?: string;
        status?: string;
      };
      if (!response.ok || payload.status === "failed" || payload.status === "not_configured") {
        throw new Error(payload.warning || payload.error || "风险复盘资产编辑失败");
      }
      await refreshRetrospectiveAssets();
      if (Array.isArray(payload.duplicate_warnings)) setRiskRetrospectiveDuplicateWarnings(payload.duplicate_warnings);
      if (payload.governance_warning) setRetrospectiveAssetWarning(payload.governance_warning);
      setEditingRetrospectiveAssetId(null);
      setMessage("复盘资产已补充并写入治理审计。");
    } catch (e: unknown) {
      setError(`风险复盘资产编辑失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSavingRetrospectiveAsset(null);
    }
  };

  const mergeRetrospectiveAsset = async (assetId: string, targetId: string) => {
    setSavingRetrospectiveAsset(assetId);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/risk/retrospective/assets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "merge", id: assetId, targetId }),
      });
      const payload = await response.json().catch(() => ({})) as {
        asset?: RiskRetrospectiveAssetRecord;
        target_asset?: RiskRetrospectiveAssetRecord;
        duplicate_warnings?: RiskRetrospectiveAssetDuplicateWarning[];
        governance_warning?: string;
        warning?: string;
        error?: string;
        status?: string;
      };
      if (!response.ok || payload.status === "failed" || payload.status === "not_configured") {
        throw new Error(payload.warning || payload.error || "风险复盘资产合并失败");
      }
      await refreshRetrospectiveAssets();
      if (Array.isArray(payload.duplicate_warnings)) setRiskRetrospectiveDuplicateWarnings(payload.duplicate_warnings);
      if (payload.governance_warning) setRetrospectiveAssetWarning(payload.governance_warning);
      setMessage(`复盘资产已合并到主资产「${payload.target_asset?.title || "主资产"}」，源资产已归档。`);
    } catch (e: unknown) {
      setError(`风险复盘资产合并失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSavingRetrospectiveAsset(null);
    }
  };

  const exportRetrospectiveAssets = async () => {
    setExportingRetrospectiveAssets(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/risk/retrospective/assets/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(payload.error || "风险复盘资产导出失败");
      }
      const markdown = await response.text();
      downloadText("风险复盘组织过程资产.md", markdown);
      const auditWarning = decodeURIComponent(response.headers.get("x-risk-retrospective-audit-warning") || "");
      const metricWarning = decodeURIComponent(response.headers.get("x-risk-retrospective-metrics-warning") || "");
      const duplicateWarning = decodeURIComponent(response.headers.get("x-risk-retrospective-duplicate-warnings") || "");
      await refreshRetrospectiveAssets();
      if (auditWarning || metricWarning) setRetrospectiveSyncWarning([auditWarning, metricWarning].filter(Boolean).join("；"));
      if (duplicateWarning) setRetrospectiveAssetWarning(duplicateWarning);
      setMessage(`风险复盘资产已导出为 AI-PMO-SYS Markdown，资产数：${response.headers.get("x-risk-retrospective-asset-count") || "0"}。`);
    } catch (e: unknown) {
      setError(`风险复盘资产导出失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setExportingRetrospectiveAssets(false);
    }
  };

  const handleAIScan = async () => {
    if (!projectDesc.trim()) {
      setError("请填写项目事实描述，至少包含阶段、范围、进度、客户/合同或团队情况。");
      return;
    }
    setScanning(true);
    setError("");
    setMessage("");
    setEvidenceActionMessage("");
    try {
      const response = await fetch("/api/risk/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectDescription: projectDesc, projectName: scanProjectName, stage: scanStage }),
      });
      const data = await response.json() as { risks?: Risk[]; aiReasoning?: string; error?: string; evidence?: AiEvidence };
      setLastRiskEvidence(data.evidence ?? null);
      if (!response.ok || !Array.isArray(data.risks)) throw new Error(data.error || "AI风险扫描失败");
      const saveResponse = await fetch("/api/risk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ risks: data.risks }),
      });
      const savedPayload = await saveResponse.json() as { risks?: Risk[]; error?: string; migrationHint?: string };
      if (!saveResponse.ok || !Array.isArray(savedPayload.risks)) throw new Error([savedPayload.error, savedPayload.migrationHint].filter(Boolean).join("；") || "AI风险写入登记册失败");
      setRisks(prev => [...savedPayload.risks!, ...prev]);
      setProjectDesc("");
      setMessage(`已生成 ${savedPayload.risks.length} 条候选风险，并写入风险登记册。${data.aiReasoning ? ` ${data.aiReasoning}` : ""}`);
    } catch (e: unknown) {
      setError(`风险扫描失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setScanning(false);
    }
  };

  const convertEvidenceAction = async (action: AiSuggestedAction, index: number) => {
    if (!lastRiskEvidence) return;
    const actionKey = `${lastRiskEvidence.id}-${index}`;
    setSavingEvidenceAction(actionKey);
    setEvidenceActionMessage("");
    try {
      const response = await fetch("/api/issue-change", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operation: "create_action",
          title: action.title,
          owner: action.owner || "项目经理",
          dueDate: action.dueDate,
          priority: action.priority,
          projectName: scanProjectName || "风险管理",
          sourceType: "risk",
          sourceId: lastRiskEvidence.id,
          sourceReason: action.sourceReason,
        }),
      });
      const payload = await response.json().catch(() => ({})) as { action?: { id?: string }; error?: string; migrationHint?: string };
      if (!response.ok || !payload.action) throw new Error([payload.error, payload.migrationHint].filter(Boolean).join("；") || "行动项创建失败");
      setEvidenceActionMessage(`已转为问题/变更行动项：${payload.action.id || action.title}`);
    } catch (e: unknown) {
      setEvidenceActionMessage(`行动项创建失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSavingEvidenceAction(null);
    }
  };

  const confirmRiskEscalationDraft = async (draft: RiskEscalationDraft) => {
    setConfirmingEscalationDraft(draft.id);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/risk/escalation-drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draftId: draft.id, draftType: draft.type, confirm: true }),
      });
      const payload = await response.json().catch(() => ({})) as {
        status?: string;
        warning?: string;
        instance?: { id?: string; title?: string };
        action?: { id?: string; title?: string };
      };
      if (!response.ok || !["succeeded", "already_exists"].includes(payload.status || "")) {
        throw new Error(payload.warning || "风险升级草稿确认失败");
      }
      setConfirmedEscalationDrafts(current => new Set([...current, draft.id]));
      const targetName = draft.type === "governance_workflow" ? "治理流程" : "统一行动项";
      const createdId = payload.instance?.id || payload.action?.id || draft.title;
      setMessage(payload.status === "already_exists"
        ? `${targetName}已存在，未重复创建：${createdId}`
        : `已确认创建${targetName}：${createdId}`);
    } catch (e: unknown) {
      setError(`风险升级草稿确认失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setConfirmingEscalationDraft(null);
    }
  };

  const handleLoadDashboardRisks = async () => {
    setLoadingFeishu(true);
    setError("");
    setMessage("正在从飞书项目台账读取风险线索...");
    try {
      const response = await fetch("/api/dashboard/feishu", { cache: "no-store" });
      const payload = await response.json() as { data?: { records?: DashboardRiskRecord[] }; code?: string };
      if (!response.ok || !payload.data?.records) throw new Error(payload.code || `HTTP_${response.status}`);
      const mapped = payload.data.records
        .filter(record => record.是否重点项目 || record.风险等级 !== "低" || Number(record.进度偏差 ?? 0) < -5 || Number(record.应收金额 ?? 0) > 0)
        .slice(0, 12)
        .map(dashboardRecordToRisk);
      const saveResponse = await fetch("/api/risk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ risks: mapped }),
      });
      const savedPayload = await saveResponse.json() as { risks?: Risk[]; error?: string; migrationHint?: string };
      if (!saveResponse.ok || !Array.isArray(savedPayload.risks)) throw new Error([savedPayload.error, savedPayload.migrationHint].filter(Boolean).join("；") || "飞书风险线索写入登记册失败");
      setRisks(prev => {
        const existing = new Set(prev.flatMap(risk => [risk.id, risk.riskCode].filter(Boolean) as string[]));
        return [...savedPayload.risks!.filter(risk => !existing.has(risk.id) && !existing.has(risk.riskCode || "")), ...prev];
      });
      setMessage(`已从飞书项目台账导入并持久化 ${savedPayload.risks.length} 条风险线索；重复项目按风险编号合并，不覆盖人工登记内容。`);
    } catch (e: unknown) {
      setError(`飞书风险线索读取失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoadingFeishu(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", flexDirection: "column" }}>
      <header style={{
        borderBottom: "1px solid var(--border)",
        padding: "14px 32px",
        display: "flex",
        alignItems: "center",
        gap: 16,
        background: "var(--surface)",
      }}>
        <Link href="/" style={{ color: "var(--text2)", textDecoration: "none", fontSize: "0.85rem" }}>← 返回首页</Link>
        <span style={{ color: "var(--border)" }}>|</span>
        <span style={{ fontWeight: 700 }}>🔐 风险管理</span>
        <span className="tag tag-purple" style={{ fontSize: "0.7rem" }}>识别-分析-应对-跟踪闭环</span>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Link href="/risk/sensitivity" className="btn-secondary" style={{ textDecoration: "none", fontSize: "0.78rem", padding: "7px 10px" }}>敏感性分析</Link>
          <Link href="/risk/tracking" className="btn-secondary" style={{ textDecoration: "none", fontSize: "0.78rem", padding: "7px 10px" }}>风险跟踪管理</Link>
          <Link href="/issue-change" className="btn-secondary" style={{ textDecoration: "none", fontSize: "0.78rem", padding: "7px 10px" }}>问题/变更链路</Link>
          <Link href="/templates" className="btn-secondary" style={{ textDecoration: "none", fontSize: "0.78rem", padding: "7px 10px" }}>模板下载中心</Link>
        </div>
      </header>

      <main style={{ flex: 1, padding: "32px", maxWidth: 1440, margin: "0 auto", width: "100%" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 16, marginBottom: 24 }}>
          <StatCard label="风险总数" value={classified.total} sub="登记册总量" />
          <StatCard label="高风险" value={classified.high.length} color="#ef4444" sub="P×I ≥ 16" />
          <StatCard label="中风险" value={classified.medium.length} color="#f59e0b" sub="6 ≤ P×I < 16" />
          <StatCard label="待复核" value={overdueReviews} color="#8b5cf6" sub="复核日期已到期" />
          <StatCard label="应对缺口" value={responsePlanMissing} color="#ef4444" sub="缺责任人或应对计划" />
          <StatCard label="关闭缺口" value={riskClosure?.summary.closureGaps ?? 0} color="#f59e0b" sub="缺证据或待关闭" />
        </div>

        {(message || error) && (
          <div style={{
            marginBottom: 20,
            padding: "12px 16px",
            borderRadius: 10,
            border: `1px solid ${error ? "rgba(239,68,68,0.35)" : "rgba(59,130,246,0.25)"}`,
            background: error ? "rgba(239,68,68,0.1)" : "rgba(59,130,246,0.08)",
            color: error ? "var(--red)" : "var(--accent2)",
            fontSize: "0.82rem",
            lineHeight: 1.6,
          }}>
            {error || message}
          </div>
        )}

        <div style={{ display: "flex", gap: 0, marginBottom: 24, borderBottom: "1px solid var(--border)", overflowX: "auto" }}>
          {[
            { key: "overview", icon: "🧭", label: "总览闭环" },
            { key: "integration", icon: "🔗", label: "风险联动" },
            { key: "list", icon: "📋", label: "风险登记册" },
            { key: "checklist", icon: "✅", label: "核查清单" },
            { key: "matrix", icon: "🎯", label: "P-I矩阵" },
            { key: "workflow", icon: "🔁", label: "工作流追踪" },
            { key: "response", icon: "🛡️", label: "应对跟踪" },
            { key: "closure", icon: "🔒", label: "关闭证据" },
            { key: "retrospective", icon: "📚", label: "复盘资产" },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as ActiveTab)}
              style={{
                padding: "10px 22px",
                background: "none",
                border: "none",
                borderBottom: activeTab === tab.key ? "2px solid var(--purple)" : "2px solid transparent",
                color: activeTab === tab.key ? "var(--purple)" : "var(--text2)",
                fontWeight: activeTab === tab.key ? 800 : 500,
                fontSize: "0.85rem",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 8,
                whiteSpace: "nowrap",
              }}
            >
              <span>{tab.icon}</span> {tab.label}
            </button>
          ))}
        </div>

        {loadingRisks && (
          <div className="card" style={{ marginBottom: 20, color: "var(--text2)", fontSize: "0.86rem" }}>
            正在读取风险登记册...
          </div>
        )}

        {activeTab === "overview" && (
          <div style={{ display: "grid", gridTemplateColumns: "1.1fr 0.9fr", gap: 20 }}>
            <div className="card">
              <div style={{ fontSize: "0.85rem", fontWeight: 800, color: "var(--text2)", marginBottom: 16, textTransform: "uppercase", letterSpacing: "0.08em" }}>风险管理闭环设计</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 }}>
                {riskLifecycleSteps.map((step, index) => (
                  <div key={step.name} style={{ padding: 14, border: "1px solid var(--border)", borderRadius: 12, background: "var(--surface2)", minHeight: 218 }}>
                    <div style={{ width: 28, height: 28, borderRadius: "50%", display: "grid", placeItems: "center", background: "rgba(139,92,246,0.14)", color: "var(--purple)", fontWeight: 800, marginBottom: 10 }}>{index + 1}</div>
                    <div style={{ fontWeight: 800, marginBottom: 8 }}>{step.name} · {statusLabels[step.status]}</div>
                    <div style={{ color: "var(--text2)", fontSize: "0.75rem", lineHeight: 1.6 }}>{step.intent}</div>
                    <div style={{ marginTop: 10, color: "var(--text2)", fontSize: "0.72rem", lineHeight: 1.5 }}>
                      <strong style={{ color: "var(--text)" }}>输入：</strong>{step.input}
                    </div>
                    <div style={{ marginTop: 8, color: "var(--accent2)", fontSize: "0.72rem", lineHeight: 1.5 }}>
                      <strong>输出：</strong>{step.output}
                    </div>
                    <div style={{ marginTop: 8, color: "var(--amber)", fontSize: "0.72rem", lineHeight: 1.5 }}>
                      动作：{step.requiredAction}
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 18, padding: 14, borderRadius: 10, background: "rgba(51,112,255,0.08)", color: "var(--text2)", fontSize: "0.82rem", lineHeight: 1.7 }}>
                设计逻辑：风险不是孤立文本框。风险线索来自飞书项目台账、阶段门、计划、质量、合同回款和项目组合看板；AI 只负责辅助识别和补全文案，最终必须进入登记册、指定责任人、绑定模块、定期复核并以关闭条件收口。
              </div>
            </div>

            <div className="card">
              <div style={{ fontSize: "0.85rem", fontWeight: 800, color: "var(--text2)", marginBottom: 16, textTransform: "uppercase", letterSpacing: "0.08em" }}>阶段门风险要求</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {stageGateRiskRequirements.map(item => (
                  <div key={item.stage} style={{ display: "grid", gridTemplateColumns: "54px 1fr", gap: 10, paddingBottom: 10, borderBottom: "1px solid var(--border)" }}>
                    <span className="tag tag-blue" style={{ justifySelf: "start" }}>{item.stage}</span>
                    <span style={{ color: "var(--text2)", fontSize: "0.78rem", lineHeight: 1.6 }}>{item.requirement}</span>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 18 }}>
                <div style={{ fontSize: "0.8rem", fontWeight: 800, marginBottom: 10 }}>角色职责</div>
                {riskManagementRoles.map(item => (
                  <div key={item.role} style={{ marginBottom: 8, fontSize: "0.76rem", color: "var(--text2)", lineHeight: 1.5 }}>
                    <strong style={{ color: "var(--text)" }}>{item.role}：</strong>{item.responsibility}
                  </div>
                ))}
              </div>
            </div>
            <div className="card">
              <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", marginBottom: 16 }}>
                <div>
                  <div style={{ fontSize: "0.85rem", fontWeight: 800, color: "var(--text2)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.08em" }}>风险升级确认队列</div>
                  <p style={{ color: "var(--text2)", lineHeight: 1.7, fontSize: "0.84rem" }}>
                    高风险、逾期风险和需要上报的风险会先生成治理流程草稿或统一行动项草稿。只有点击确认后，系统才会写入 Supabase 并进入治理中心或问题-变更-行动项链路。
                  </p>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                  <Link href="/governance-workflows" className="btn-secondary" style={{ textDecoration: "none" }}>查看治理中心</Link>
                  <Link href="/issue-change" className="btn-secondary" style={{ textDecoration: "none" }}>查看行动项链路</Link>
                </div>
              </div>

              {!riskEscalation ? (
                <div style={{ color: "var(--text2)", lineHeight: 1.7 }}>正在生成风险升级草稿...</div>
              ) : (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, marginBottom: 16 }}>
                    {[
                      ["候选风险", riskEscalation.summary.candidateRiskLinks],
                      ["治理草稿", riskEscalation.summary.governanceDrafts],
                      ["行动项草稿", riskEscalation.summary.actionDrafts],
                      ["P0草稿", riskEscalation.summary.highPriorityDrafts],
                      ["待确认", riskEscalation.summary.pendingConfirmation],
                    ].map(([label, value]) => (
                      <div key={label} style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 10, padding: 12 }}>
                        <div style={{ color: "var(--text2)", fontSize: "0.74rem" }}>{label}</div>
                        <strong>{value}</strong>
                      </div>
                    ))}
                  </div>

                  <div style={{ display: "grid", gap: 14 }}>
                    {[...riskEscalation.governanceDrafts, ...riskEscalation.actionDrafts].length === 0 ? (
                      <div style={{ color: "var(--text2)", lineHeight: 1.7 }}>暂无需要升级确认的风险草稿。</div>
                    ) : (
                      <>
                        {riskEscalation.governanceDrafts.length > 0 && (
                          <div>
                            <div style={{ fontWeight: 800, marginBottom: 10 }}>治理流程草稿</div>
                            <div style={{ display: "grid", gap: 10 }}>
                              {riskEscalation.governanceDrafts.map(draft => (
                                <article key={draft.id} style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 12, padding: 14 }}>
                                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
                                    <div>
                                      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                                        <strong>{draft.title}</strong>
                                        <span className="tag tag-amber">{draft.priority}</span>
                                        <span className="tag tag-purple">风险升级评审</span>
                                      </div>
                                      <p style={{ color: "var(--text2)", lineHeight: 1.6, fontSize: "0.8rem", marginTop: 8 }}>
                                        {draft.projectName} · 责任人：{draft.owner} · 审批：{draft.approver || "PMO/项目负责人"} · deadline：{draft.deadline}
                                      </p>
                                      <p style={{ color: "var(--accent2)", lineHeight: 1.6, fontSize: "0.78rem", marginTop: 6 }}>{draft.sourceReason}</p>
                                    </div>
                                    <button
                                      className="btn-primary"
                                      disabled={confirmingEscalationDraft === draft.id || confirmedEscalationDrafts.has(draft.id)}
                                      onClick={() => void confirmRiskEscalationDraft(draft)}
                                    >
                                      {confirmedEscalationDrafts.has(draft.id) ? "已确认" : confirmingEscalationDraft === draft.id ? "确认中..." : "确认创建治理流程"}
                                    </button>
                                  </div>
                                </article>
                              ))}
                            </div>
                          </div>
                        )}

                        {riskEscalation.actionDrafts.length > 0 && (
                          <div>
                            <div style={{ fontWeight: 800, marginBottom: 10 }}>统一行动项草稿</div>
                            <div style={{ display: "grid", gap: 10 }}>
                              {riskEscalation.actionDrafts.map(draft => (
                                <article key={draft.id} style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 12, padding: 14 }}>
                                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
                                    <div>
                                      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                                        <strong>{draft.title}</strong>
                                        <span className="tag tag-blue">{draft.targetModule || "行动项"}</span>
                                        <span className="tag" style={{ background: `${priorityColor[draft.priority]}22`, color: priorityColor[draft.priority] }}>{draft.priority}</span>
                                      </div>
                                      <p style={{ color: "var(--text2)", lineHeight: 1.6, fontSize: "0.8rem", marginTop: 8 }}>
                                        {draft.projectName} · 责任人：{draft.owner} · deadline：{draft.deadline}
                                      </p>
                                      <p style={{ color: "var(--accent2)", lineHeight: 1.6, fontSize: "0.78rem", marginTop: 6 }}>{draft.sourceReason}</p>
                                    </div>
                                    <button
                                      className="btn-secondary"
                                      disabled={confirmingEscalationDraft === draft.id || confirmedEscalationDrafts.has(draft.id)}
                                      onClick={() => void confirmRiskEscalationDraft(draft)}
                                    >
                                      {confirmedEscalationDrafts.has(draft.id) ? "已确认" : confirmingEscalationDraft === draft.id ? "确认中..." : "确认创建行动项"}
                                    </button>
                                  </div>
                                </article>
                              ))}
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                  <div style={{ marginTop: 14, color: "var(--text2)", fontSize: "0.78rem", lineHeight: 1.6 }}>{riskEscalation.boundary}</div>
                </>
              )}
            </div>
          </div>
        )}

        {activeTab === "integration" && (
          <div style={{ display: "grid", gap: 20 }}>
            <div className="card">
              <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", marginBottom: 16 }}>
                <div>
                  <div style={{ fontSize: "0.85rem", fontWeight: 800, color: "var(--text2)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.08em" }}>风险与业务对象联动</div>
                  <p style={{ color: "var(--text2)", lineHeight: 1.7, fontSize: "0.84rem" }}>
                    该视图把风险登记册和项目台账中的风险线索，映射到项目健康、任务、里程碑、回款、治理工作流和报告工厂。系统只生成建议，写回飞书或改变主数据前必须人工确认。
                  </p>
                </div>
                <button className="btn-secondary" disabled={loadingFeishu} onClick={() => void handleLoadDashboardRisks()}>
                  {loadingFeishu ? "读取飞书中..." : "从飞书导入风险线索"}
                </button>
              </div>
              {!riskIntegration ? (
                <div style={{ color: "var(--text2)", lineHeight: 1.7 }}>正在读取风险联动包...</div>
              ) : (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10, marginBottom: 16 }}>
                    {[
                      ["联动风险", riskIntegration.summary.openRiskLinks],
                      ["高风险", riskIntegration.summary.highSeverity],
                      ["项目健康", riskIntegration.summary.projectHealthImpacts],
                      ["任务", riskIntegration.summary.taskImpacts],
                      ["里程碑", riskIntegration.summary.milestoneImpacts],
                      ["回款", riskIntegration.summary.paymentImpacts],
                      ["治理升级", riskIntegration.summary.governanceEscalations],
                      ["待确认写回", riskIntegration.summary.pendingConfirmation],
                    ].map(([label, value]) => (
                      <div key={label} style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 10, padding: 12 }}>
                        <div style={{ color: "var(--text2)", fontSize: "0.74rem" }}>{label}</div>
                        <strong>{value}</strong>
                      </div>
                    ))}
                  </div>

                  <div style={{ display: "grid", gap: 14 }}>
                    {riskIntegration.links.length === 0 ? (
                      <div style={{ color: "var(--text2)", lineHeight: 1.7 }}>暂无可联动风险。若实际存在风险，请先补齐风险登记册或飞书项目台账的风险字段。</div>
                    ) : (
                      riskIntegration.links.map(link => (
                        <article key={link.id} style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 12, padding: 16 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
                            <div>
                              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                                <strong>{link.projectName}</strong>
                                <span className={`tag ${link.severity === "高" ? "tag-amber" : link.severity === "中" ? "tag-blue" : "tag-green"}`}>{link.severity}风险</span>
                                <span className="tag tag-purple">{link.status}</span>
                              </div>
                              <p style={{ color: "var(--text2)", lineHeight: 1.6, fontSize: "0.82rem", marginTop: 8 }}>
                                {link.riskDescription} · 责任人：{link.owner} · deadline：{link.deadline}
                              </p>
                            </div>
                            <span className="tag tag-amber">{link.writebackMode === "manual_confirmation_required" ? "写回需确认" : "仅审计"}</span>
                          </div>

                          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginTop: 14 }}>
                            <div>
                              <div style={{ fontWeight: 800, fontSize: "0.8rem", marginBottom: 8 }}>影响对象</div>
                              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                {link.impactedTargets.map(target => <span key={target} className="tag tag-blue">{target}</span>)}
                              </div>
                              <ul style={{ color: "var(--text2)", lineHeight: 1.7, paddingLeft: 18, fontSize: "0.78rem", marginTop: 10 }}>
                                {link.dependencies.slice(0, 4).map(item => <li key={item}>{item}</li>)}
                              </ul>
                            </div>
                            <div>
                              <div style={{ fontWeight: 800, fontSize: "0.8rem", marginBottom: 8 }}>建议写回字段</div>
                              <ul style={{ color: "var(--text2)", lineHeight: 1.7, paddingLeft: 18, fontSize: "0.78rem" }}>
                                {link.suggestedWritebacks.slice(0, 4).map(item => (
                                  <li key={`${item.target}-${item.field}`}>{item.field} → <strong style={{ color: "var(--text)" }}>{item.suggestedValue}</strong></li>
                                ))}
                              </ul>
                            </div>
                            <div>
                              <div style={{ fontWeight: 800, fontSize: "0.8rem", marginBottom: 8 }}>下一步动作</div>
                              <ul style={{ color: "var(--text2)", lineHeight: 1.7, paddingLeft: 18, fontSize: "0.78rem" }}>
                                {link.actions.slice(0, 4).map(action => (
                                  <li key={action.id}><strong style={{ color: priorityColor[action.priority] }}>{action.priority}</strong> · {action.title} · {action.owner} · {action.dueDate}</li>
                                ))}
                              </ul>
                            </div>
                          </div>
                          <div style={{ marginTop: 12, color: "var(--accent2)", fontSize: "0.8rem", lineHeight: 1.6 }}>报告事实：{link.reportFact}</div>
                        </article>
                      ))
                    )}
                  </div>
                  <div style={{ marginTop: 14, color: "var(--text2)", fontSize: "0.78rem", lineHeight: 1.6 }}>{riskIntegration.boundary}</div>
                </>
              )}
            </div>
          </div>
        )}

        {activeTab === "list" && (
          <>
            <div className="card" style={{ marginBottom: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", marginBottom: 16 }}>
                <div>
                  <div style={{ fontSize: "0.85rem", fontWeight: 800, color: "var(--text2)", textTransform: "uppercase", letterSpacing: "0.08em" }}>风险识别入口</div>
                  <div style={{ marginTop: 6, color: "var(--text2)", fontSize: "0.78rem", lineHeight: 1.6 }}>
                    AI扫描用于生成候选风险；飞书导入用于把项目台账中的实时风险线索纳入登记册。
                  </div>
                </div>
                <button className="btn-secondary" disabled={loadingFeishu} onClick={() => void handleLoadDashboardRisks()}>
                  {loadingFeishu ? "读取飞书中..." : "从飞书项目台账导入风险线索"}
                </button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "180px 150px 1fr auto", gap: 12, alignItems: "start" }}>
                <input className="input" placeholder="项目名称（可选）" value={scanProjectName} onChange={e => setScanProjectName(e.target.value)} />
                <select className="input" value={scanStage} onChange={e => setScanStage(e.target.value as RiskStage)}>
                  {stages.map(stage => <option key={stage} value={stage}>{stage}</option>)}
                </select>
                <textarea
                  className="input"
                  rows={3}
                  placeholder="输入项目事实：阶段、目标/范围、计划偏差、客户/合同、团队资源、质量、供应商、回款等。AI会基于风险核查表和风险识别清单生成候选风险。"
                  value={projectDesc}
                  onChange={e => setProjectDesc(e.target.value)}
                  style={{ resize: "vertical", fontSize: "0.85rem" }}
                />
                <button className="btn-primary" onClick={handleAIScan} disabled={scanning} style={{ whiteSpace: "nowrap" }}>
                  {scanning ? "扫描中..." : "AI风险扫描"}
                </button>
              </div>
              {lastRiskEvidence && (
                <div style={{
                  marginTop: 14,
                  padding: "14px 16px",
                  borderRadius: 12,
                  border: "1px solid rgba(139,92,246,0.25)",
                  background: "rgba(139,92,246,0.08)",
                  fontSize: "0.8rem",
                  lineHeight: 1.7,
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 8 }}>
                    <div>
                      <div style={{ fontWeight: 800, color: "var(--purple)" }}>AI风险扫描依据</div>
                      <div style={{ color: "var(--text2)" }}>{lastRiskEvidence.inputSummary}</div>
                    </div>
                    <span className="tag tag-purple" style={{ whiteSpace: "nowrap" }}>
                      {lastRiskEvidence.model} · {lastRiskEvidence.status} · {lastRiskEvidence.confidence}
                    </span>
                  </div>
                  <div style={{ color: "var(--text)", marginBottom: 8 }}>{lastRiskEvidence.outputSummary}</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <div>
                      <div style={{ fontWeight: 800, color: "var(--text2)", marginBottom: 6 }}>依据来源</div>
                      {lastRiskEvidence.basis.map(item => (
                        <div key={`${item.source}-${item.label}`} style={{ color: "var(--text2)", marginBottom: 4 }}>
                          <strong style={{ color: "var(--text)" }}>{item.label}：</strong>{item.detail}
                        </div>
                      ))}
                      <div style={{ marginTop: 6, color: "var(--text2)" }}>
                        引用：{lastRiskEvidence.citations.join(" / ")}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontWeight: 800, color: "var(--text2)", marginBottom: 6 }}>建议动作</div>
                      {lastRiskEvidence.suggestedActions.map((action, index) => {
                        const actionKey = `${lastRiskEvidence.id}-${index}`;
                        return (
                          <div key={action.title} style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                            <span style={{ color: "var(--text2)" }}>
                              <strong style={{ color: "var(--amber)" }}>{action.priority}</strong> · {action.title} · {action.owner || "待定"} · {action.dueDate || "待定"}
                            </span>
                            <button className="btn-secondary" onClick={() => void convertEvidenceAction(action, index)} disabled={savingEvidenceAction === actionKey} style={{ fontSize: "0.72rem", padding: "4px 8px", whiteSpace: "nowrap" }}>
                              {savingEvidenceAction === actionKey ? "转入中..." : "转行动项"}
                            </button>
                          </div>
                        );
                      })}
                      <div style={{ color: lastRiskEvidence.auditStatus === "succeeded" ? "var(--green)" : "var(--amber)" }}>
                        审计状态：{lastRiskEvidence.auditStatus || "待写入"}
                        {lastRiskEvidence.auditId ? ` · ${lastRiskEvidence.auditId}` : ""}
                        {lastRiskEvidence.auditWarning ? ` · ${lastRiskEvidence.auditWarning}` : ""}
                      </div>
                      {evidenceActionMessage && <div style={{ marginTop: 8, color: evidenceActionMessage.includes("失败") ? "var(--red)" : "var(--green)" }}>{evidenceActionMessage}</div>}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, marginBottom: 16 }}>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <select className="input" value={statusFilter} onChange={e => setStatusFilter(e.target.value as RiskStatus | "all")} style={{ width: 150 }}>
                  <option value="all">全部状态</option>
                  {statusOrder.map(status => <option key={status} value={status}>{statusLabels[status]}</option>)}
                </select>
                <select className="input" value={categoryFilter} onChange={e => setCategoryFilter(e.target.value as RiskCategory | "all")} style={{ width: 180 }}>
                  <option value="all">全部类别</option>
                  {categories.map(category => <option key={category} value={category}>{categoryLabels[category]}</option>)}
                </select>
                <select className="input" value={stageFilter} onChange={e => setStageFilter(e.target.value as RiskStage | "all")} style={{ width: 150 }}>
                  <option value="all">全部阶段</option>
                  {stages.map(stage => <option key={stage} value={stage}>{stage}</option>)}
                </select>
              </div>
              <button className="btn-primary" onClick={() => { setEditingRisk(null); setFormData(defaultForm()); setShowForm(true); }}>
                + 添加风险
              </button>
            </div>

            <div className="card" style={{ padding: 0, overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
                <thead>
                  <tr style={{ background: "var(--surface2)", borderBottom: "1px solid var(--border)" }}>
                    {["项目/阶段", "风险描述", "类别/来源", "评分", "责任/复核", "模块/状态", "操作"].map(h => (
                      <th key={h} style={{ padding: "12px 14px", textAlign: "left", fontWeight: 800, color: "var(--text2)" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredRisks.map(risk => (
                    <tr key={risk.id} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={{ padding: "12px 14px", minWidth: 150 }}>
                        <div style={{ fontWeight: 800 }}>{risk.projectName || "未指定项目"}</div>
                        <div style={{ marginTop: 4, color: "var(--text2)", fontSize: "0.72rem" }}>{risk.riskCode || risk.id.slice(0, 8)} · {risk.stage}</div>
                      </td>
                      <td style={{ padding: "12px 14px", maxWidth: 320 }}>
                        <div style={{ fontWeight: 600, lineHeight: 1.5 }}>{risk.description}</div>
                        <div style={{ marginTop: 6, color: "var(--text2)", fontSize: "0.72rem" }}>触发器：{risk.trigger}</div>
                      </td>
                      <td style={{ padding: "12px 14px" }}>
                        <div className="tag tag-blue" style={{ marginBottom: 6 }}>{categoryLabels[risk.category]}</div>
                        <div style={{ color: "var(--text2)", fontSize: "0.72rem", lineHeight: 1.5 }}>{risk.source}</div>
                      </td>
                      <td style={{ padding: "12px 14px", minWidth: 120 }}>
                        <RiskBadge risk={risk} />
                        <div style={{ marginTop: 8, color: "var(--text2)", fontSize: "0.72rem" }}>P{risk.probability} × I{risk.impact} · U{risk.urgency}</div>
                        <div style={{ marginTop: 3, color: "var(--text2)", fontSize: "0.72rem" }}>优先级 {risk.priorityScore}</div>
                      </td>
                      <td style={{ padding: "12px 14px", minWidth: 140 }}>
                        <div style={{ fontWeight: 700 }}>{risk.owner || "未指定"}</div>
                        <div style={{ marginTop: 4, color: "var(--text2)", fontSize: "0.72rem" }}>下次复核：{risk.nextReviewDate}</div>
                        <div style={{ marginTop: 2, color: "var(--text2)", fontSize: "0.72rem" }}>到期：{risk.dueDate}</div>
                        <div style={{ marginTop: 2, color: "var(--amber)", fontSize: "0.72rem", lineHeight: 1.4 }}>
                          动作：{risk.lastAction || getWorkflowStepForStatus(risk.status).requiredAction}
                        </div>
                      </td>
                      <td style={{ padding: "12px 14px", minWidth: 130 }}>
                        <div className="tag" style={{ background: "rgba(139,92,246,0.13)", color: "var(--purple)", marginBottom: 8 }}>{risk.linkedModule}</div>
                        <StatusBadge status={risk.status} />
                      </td>
                      <td style={{ padding: "12px 14px" }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          <button onClick={() => handleEdit(risk)} style={{ background: "none", border: "none", color: "var(--accent2)", cursor: "pointer", textAlign: "left" }}>编辑</button>
                          {risk.status !== "closed" && (
                            <button onClick={() => openTransition(risk)} style={{ background: "none", border: "none", color: "var(--amber)", cursor: "pointer", textAlign: "left" }}>
                              推进到{statusLabels[nextRiskStatus(risk.status)]}
                            </button>
                          )}
                          {risk.status !== "closed" && (
                            <button onClick={() => openTransition(risk, "closed")} style={{ background: "none", border: "none", color: "var(--green)", cursor: "pointer", textAlign: "left" }}>关闭</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredRisks.length === 0 && (
                <div style={{ padding: 48, textAlign: "center", color: "var(--text2)" }}>暂无符合条件的风险。</div>
              )}
            </div>
          </>
        )}

        {activeTab === "checklist" && (
          <div className="card">
            <div style={{ fontSize: "0.85rem", fontWeight: 800, color: "var(--text2)", marginBottom: 14, textTransform: "uppercase", letterSpacing: "0.08em" }}>风险核查清单</div>
            <div style={{ color: "var(--text2)", fontSize: "0.8rem", lineHeight: 1.7, marginBottom: 18 }}>
              核查项来自项目风险核查表、风险种类和识别清单：用于阶段门、计划评审、周会和监控中心，不是一次性扫描。
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
              {riskChecklistItems.map(item => (
                <div key={item.id} style={{ padding: 14, border: "1px solid var(--border)", borderRadius: 12, background: "var(--surface2)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 10 }}>
                    <span className="tag tag-blue">{categoryLabels[item.category]}</span>
                    <span style={{ color: "var(--text2)", fontSize: "0.72rem" }}>{item.stage} · {item.linkedModule}</span>
                  </div>
                  <div style={{ fontWeight: 700, lineHeight: 1.5, marginBottom: 8 }}>{item.question}</div>
                  <div style={{ color: "var(--text2)", fontSize: "0.76rem", lineHeight: 1.6 }}>风险信号：{item.riskSignal}</div>
                  <button
                    className="btn-secondary"
                    style={{ marginTop: 12, fontSize: "0.75rem", padding: "6px 10px" }}
                    onClick={() => {
                      const form = defaultForm();
                      setFormData({
                        ...form,
                        description: `${item.riskSignal}：${item.question}`,
                        category: item.category,
                        stage: item.stage,
                        source: "风险核查清单",
                        linkedModule: item.linkedModule,
                        trigger: item.question,
                        responseStrategy: `针对“${item.riskSignal}”制定预防和应急行动。`,
                      });
                      setEditingRisk(null);
                      setShowForm(true);
                    }}
                  >
                    登记为风险
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === "matrix" && (
          <div className="card">
            <div style={{ fontSize: "0.85rem", fontWeight: 800, color: "var(--text2)", marginBottom: 18, textTransform: "uppercase", letterSpacing: "0.08em" }}>
              概率-影响矩阵（P-I Matrix）
            </div>
            <div style={{ display: "flex", gap: 24, marginBottom: 24, fontSize: "0.8rem", color: "var(--text2)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={{ width: 12, height: 12, borderRadius: 2, background: "#ef4444" }} />高风险 (16-25)</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={{ width: 12, height: 12, borderRadius: 2, background: "#f59e0b" }} />中风险 (6-15)</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={{ width: 12, height: 12, borderRadius: 2, background: "#22c55e" }} />低风险 (1-5)</div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "auto repeat(5, 1fr)", gridTemplateRows: "auto repeat(5, 1fr)", gap: 4, maxWidth: 780 }}>
              <div />
              {[1, 2, 3, 4, 5].map(i => (
                <div key={`impact-head-${i}`} style={{ textAlign: "center", fontWeight: 800, fontSize: "0.75rem", color: "var(--text2)", padding: "8px 4px" }}>
                  I={i}
                </div>
              ))}
              {[5, 4, 3, 2, 1].map(p => (
                <div key={`row-${p}`} style={{ display: "contents" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: "0.75rem", color: "var(--text2)", padding: 4 }}>
                    P={p}
                  </div>
                  {[1, 2, 3, 4, 5].map(i => {
                    const score = p * i;
                    const colors = getRiskColor(score);
                    const cellRisks = matrixGrid[`${p}-${i}`] || [];
                    return (
                      <div key={`${p}-${i}`} style={{
                        background: colors.bg,
                        border: `2px solid ${colors.border}`,
                        borderRadius: 10,
                        padding: 8,
                        minHeight: 74,
                        display: "flex",
                        flexDirection: "column",
                        gap: 5,
                      }}>
                        <div style={{ fontSize: "0.68rem", fontWeight: 800, color: colors.text, textAlign: "center" }}>{score}</div>
                        {cellRisks.slice(0, 2).map(risk => (
                          <button key={risk.id} style={{ fontSize: "0.65rem", padding: "3px 5px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", cursor: "pointer", color: "var(--text)" }} onClick={() => handleEdit(risk)}>
                            {risk.projectName.slice(0, 8)} · {risk.description.slice(0, 10)}
                          </button>
                        ))}
                        {cellRisks.length > 2 && <div style={{ fontSize: "0.62rem", color: "var(--text2)" }}>+{cellRisks.length - 2}</div>}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
            <div style={{ marginTop: 16, fontSize: "0.78rem", color: "var(--text2)" }}>
              矩阵说明：P=概率，I=影响。紧迫度 U 不改变矩阵位置，但会进入优先级分数 P×I×U，用于排序应对动作。
            </div>
          </div>
        )}

        {activeTab === "workflow" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 420px", gap: 20 }}>
            <div className="card">
              <div style={{ fontSize: "0.85rem", fontWeight: 800, color: "var(--text2)", marginBottom: 16, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                风险工作流状态
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {filteredRisks.map(risk => {
                  const step = getWorkflowStepForStatus(risk.status);
                  const latestEvent = latestEventByRisk.get(risk.id) || (risk.riskCode ? latestEventByRisk.get(risk.riskCode) : undefined);
                  return (
                    <div key={risk.id} style={{ border: "1px solid var(--border)", borderRadius: 12, padding: 14, background: "var(--surface2)" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 10 }}>
                        <div>
                          <div style={{ fontWeight: 800 }}>{risk.projectName || "未指定项目"} · {risk.description}</div>
                          <div style={{ marginTop: 5, color: "var(--text2)", fontSize: "0.72rem" }}>
                            {risk.riskCode || risk.id.slice(0, 8)} · 当前环节：{step.name} · 责任人：{risk.actionOwner || risk.owner || "未指定"} · deadline：{risk.actionDeadline || risk.dueDate || "未设置"}
                          </div>
                        </div>
                        <StatusBadge status={risk.status} />
                      </div>
                      <div style={{ height: 8, borderRadius: 999, background: "var(--surface)", overflow: "hidden", border: "1px solid var(--border)", marginBottom: 12 }}>
                        <div style={{ width: `${workflowPercent(risk.status)}%`, height: "100%", background: risk.status === "closed" ? "var(--green)" : "var(--purple)" }} />
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, fontSize: "0.76rem", color: "var(--text2)", lineHeight: 1.55 }}>
                        <div><strong style={{ color: "var(--text)" }}>输入：</strong>{risk.currentInput || step.input}</div>
                        <div><strong style={{ color: "var(--text)" }}>输出：</strong>{risk.currentOutput || step.output}</div>
                        <div><strong style={{ color: "var(--text)" }}>动作：</strong>{risk.lastAction || step.requiredAction}</div>
                      </div>
                      {latestEvent && (
                        <div style={{ marginTop: 10, padding: 10, borderRadius: 10, background: "var(--surface)", color: "var(--text2)", fontSize: "0.74rem", lineHeight: 1.6 }}>
                          最近流转：{latestEvent.fromStatus ? `${statusLabels[latestEvent.fromStatus]} → ` : ""}{statusLabels[latestEvent.toStatus]}；
                          {latestEvent.owner} 负责，{latestEvent.deadline || "未设deadline"} 前完成；
                          记录时间：{latestEvent.createdAt.slice(0, 16).replace("T", " ")}
                        </div>
                      )}
                      <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
                        {risk.status !== "closed" && (
                          <button className="btn-secondary" style={{ fontSize: "0.75rem", padding: "6px 10px" }} onClick={() => openTransition(risk)}>
                            推进到{statusLabels[nextRiskStatus(risk.status)]}
                          </button>
                        )}
                        {risk.status !== "closed" && (
                          <button className="btn-secondary" style={{ fontSize: "0.75rem", padding: "6px 10px" }} onClick={() => openTransition(risk, "closed")}>
                            关闭风险
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
                {filteredRisks.length === 0 && <div style={{ color: "var(--text2)" }}>暂无可追踪风险。</div>}
              </div>
            </div>

            <div className="card">
              <div style={{ fontSize: "0.85rem", fontWeight: 800, color: "var(--text2)", marginBottom: 14, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                状态变更审计
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {workflowEvents.slice(0, 12).map(event => (
                  <div key={event.id} style={{ padding: 12, border: "1px solid var(--border)", borderRadius: 10, background: "var(--surface2)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
                      <StatusBadge status={event.toStatus} />
                      <span style={{ color: "var(--text2)", fontSize: "0.7rem" }}>{event.createdAt.slice(0, 16).replace("T", " ")}</span>
                    </div>
                    <div style={{ color: "var(--text2)", fontSize: "0.74rem", lineHeight: 1.6 }}>
                      <div>输入：{event.inputSummary || "未记录"}</div>
                      <div>输出：{event.outputSummary || "未记录"}</div>
                      <div>动作：{event.actionRequired || "未记录"}</div>
                      <div>责任：{event.owner || "未指定"} · deadline：{event.deadline || "未设置"}</div>
                    </div>
                  </div>
                ))}
                {workflowEvents.length === 0 && (
                  <div style={{ color: "var(--text2)", fontSize: "0.8rem", lineHeight: 1.6 }}>
                    还没有状态变更记录。点击“推进流程”后会生成审计记录。
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === "closure" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 420px", gap: 20 }}>
            <div className="card">
              <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", marginBottom: 16 }}>
                <div>
                  <div style={{ fontSize: "0.85rem", fontWeight: 800, color: "var(--text2)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.08em" }}>风险关闭证据门禁</div>
                  <p style={{ color: "var(--text2)", fontSize: "0.82rem", lineHeight: 1.7 }}>
                    风险进入“已关闭”前必须提交关闭证据、复核意见、复核人、复核日期和依赖处置说明。系统不会自动关闭风险，所有关闭动作都写入工作流审计。
                  </p>
                </div>
                <Link href="/risk/tracking" className="btn-secondary" style={{ textDecoration: "none" }}>进入跟踪页</Link>
              </div>

              {!riskClosure ? (
                <div style={{ color: "var(--text2)", lineHeight: 1.7 }}>正在读取关闭证据包...</div>
              ) : (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10, marginBottom: 16 }}>
                    {[
                      ["已关闭", riskClosure.summary.closedRisks],
                      ["证据完整", riskClosure.summary.closedWithEvidence],
                      ["关闭缺口", riskClosure.summary.closureGaps],
                      ["待关闭", riskClosure.summary.readyForClosure],
                      ["条件关闭", riskClosure.summary.conditionalClosures],
                    ].map(([label, value]) => (
                      <div key={label} style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 10, padding: 12 }}>
                        <div style={{ color: "var(--text2)", fontSize: "0.74rem" }}>{label}</div>
                        <strong>{value}</strong>
                      </div>
                    ))}
                  </div>

                  <div style={{ display: "grid", gap: 12 }}>
                    <div style={{ fontWeight: 800 }}>关闭缺口</div>
                    {riskClosure.closureGaps.length === 0 ? (
                      <div style={{ color: "var(--text2)", lineHeight: 1.7, padding: 14, border: "1px dashed var(--border)", borderRadius: 12 }}>
                        当前没有关闭缺口。后续关闭风险仍需逐项提交证据和复核意见。
                      </div>
                    ) : riskClosure.closureGaps.map(item => (
                      <article key={item.riskId} style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 12, padding: 14 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 8 }}>
                          <strong>{item.projectName}</strong>
                          <StatusBadge status={item.status} />
                        </div>
                        <div style={{ color: "var(--text2)", fontSize: "0.78rem", lineHeight: 1.6 }}>{item.riskDescription}</div>
                        <div style={{ marginTop: 8, color: "var(--amber)", fontSize: "0.76rem", lineHeight: 1.6 }}>{item.reason}</div>
                        <div style={{ marginTop: 8, color: "var(--accent2)", fontSize: "0.76rem", lineHeight: 1.6 }}>{item.nextAction}</div>
                      </article>
                    ))}
                  </div>
                </>
              )}
            </div>

            <div className="card">
              <div style={{ fontSize: "0.85rem", fontWeight: 800, color: "var(--text2)", marginBottom: 14, textTransform: "uppercase", letterSpacing: "0.08em" }}>已形成关闭证据包</div>
              {!riskClosure || riskClosure.closurePackages.length === 0 ? (
                <div style={{ color: "var(--text2)", fontSize: "0.8rem", lineHeight: 1.7 }}>暂无结构化关闭证据包。</div>
              ) : (
                <div style={{ display: "grid", gap: 10 }}>
                  {riskClosure.closurePackages.slice(0, 8).map(item => (
                    <article key={item.riskId} style={{ padding: 12, border: "1px solid var(--border)", borderRadius: 10, background: "var(--surface2)" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
                        <strong style={{ fontSize: "0.82rem" }}>{item.projectName}</strong>
                        <span className={item.closureDecision === "conditional" ? "tag tag-amber" : "tag tag-green"}>{item.closureDecisionLabel}</span>
                      </div>
                      <div style={{ color: "var(--text2)", fontSize: "0.74rem", lineHeight: 1.6 }}>
                        <div>证据：{item.closureEvidence}</div>
                        <div>复核：{item.reviewer} · {item.reviewedAt}</div>
                        <div>意见：{item.reviewOpinion}</div>
                      </div>
                    </article>
                  ))}
                </div>
              )}
              <div style={{ marginTop: 14, padding: 12, borderRadius: 10, background: "rgba(59,130,246,0.08)", color: "var(--text2)", fontSize: "0.74rem", lineHeight: 1.6 }}>
                {riskClosure?.boundary || "关闭证据包必须由使用者提交并确认。"}
              </div>
            </div>
          </div>
        )}

        {activeTab === "retrospective" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 420px", gap: 20 }}>
            <div className="card">
              <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", marginBottom: 16 }}>
                <div>
                  <div style={{ fontSize: "0.85rem", fontWeight: 800, color: "var(--text2)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.08em" }}>风险复盘与组织过程资产</div>
                  <p style={{ color: "var(--text2)", fontSize: "0.82rem", lineHeight: 1.7 }}>
                    关闭后的风险不会停在“已关闭”。系统会基于关闭证据、复核意见和经验教训生成复盘知识卡、早期预警规则和待补复盘清单，供后续同类项目复用。
                  </p>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                  <button
                    className="btn-secondary"
                    onClick={() => downloadText("风险复盘清单与组织过程资产.md", riskRetrospective?.markdown || "# 风险复盘清单\n\n暂无风险复盘资产。")}
                  >
                    下载复盘清单
                  </button>
                  <button
                    className="btn-secondary"
                    onClick={() => downloadText("风险复盘资产治理报告.md", riskRetrospectiveGovernance?.reportMarkdown || "# 风险复盘资产治理报告\n\n暂无治理审计数据。")}
                  >
                    下载治理报告
                  </button>
                  <button
                    className="btn-primary"
                    disabled={exportingRetrospectiveAssets}
                    onClick={() => void exportRetrospectiveAssets()}
                  >
                    {exportingRetrospectiveAssets ? "导出中..." : "导出AI-PMO-SYS知识页"}
                  </button>
                </div>
              </div>

              {!riskRetrospective ? (
                <div style={{ color: "var(--text2)", lineHeight: 1.7 }}>正在读取风险复盘资产包...</div>
              ) : (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10, marginBottom: 16 }}>
                    {[
                      ["已关闭", riskRetrospective.summary.closedRisks],
                      ["可复盘", riskRetrospective.summary.retrospectiveCandidates],
                      ["高风险复盘", riskRetrospective.summary.highRiskRetrospectives],
                      ["知识卡片", riskRetrospective.summary.knowledgeCards],
                      ["预警规则", riskRetrospective.summary.warningRules],
                      ["待补复盘", riskRetrospective.summary.missingLessons],
                      ["已确认资产", riskRetrospectiveAssets.filter(asset => asset.status === "reviewed" || asset.status === "published").length],
                      ["已发布RAG", riskRetrospectiveAssets.filter(asset => asset.status === "published").length],
                      ["本月治理", riskRetrospectiveGovernance?.effect.monthlyActions ?? 0],
                      ["质量净提升", riskRetrospectiveGovernance?.effect.qualityScoreLift ?? 0],
                    ].map(([label, value]) => (
                      <div key={label} style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 10, padding: 12 }}>
                        <div style={{ color: "var(--text2)", fontSize: "0.74rem" }}>{label}</div>
                        <strong>{value}</strong>
                      </div>
                    ))}
                  </div>

                  {riskRetrospective.knowledgeCards.length === 0 ? (
                    <div style={{ color: "var(--text2)", lineHeight: 1.7, padding: 14, border: "1px dashed var(--border)", borderRadius: 12 }}>
                      暂无可沉淀的复盘知识卡。关闭风险时补齐关闭证据、复核意见和经验教训后会自动出现在这里。
                    </div>
                  ) : (
                    <div style={{ display: "grid", gap: 12 }}>
                      {riskRetrospective.knowledgeCards.map(card => {
                        const asset = retrospectiveAssetByRiskId.get(card.sourceRiskId);
                        const savingKey = asset?.id || card.sourceRiskId;
                        return (
                        <article key={card.id} style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 14, padding: 16 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 8 }}>
                            <div>
                              <strong>{card.title}</strong>
                              <div style={{ marginTop: 4, color: "var(--text2)", fontSize: "0.74rem" }}>{card.category} · {card.impactArea} · {card.severity === "high" ? "高风险" : card.severity === "medium" ? "中风险" : "低风险"}</div>
                            </div>
                            <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
                              <span className={card.severity === "high" ? "tag tag-red" : card.severity === "medium" ? "tag tag-amber" : "tag tag-green"}>{card.severity.toUpperCase()}</span>
                              {asset && <span className={asset.status === "published" ? "tag tag-green" : asset.status === "archived" ? "tag tag-amber" : "tag tag-purple"}>{asset.status === "published" ? "已发布RAG" : asset.status === "archived" ? "已撤回" : "已确认"}</span>}
                            </div>
                          </div>
                          <div style={{ color: "var(--text2)", fontSize: "0.78rem", lineHeight: 1.7 }}>
                            <div><strong style={{ color: "var(--text)" }}>触发器：</strong>{card.trigger}</div>
                            <div><strong style={{ color: "var(--text)" }}>有效应对：</strong>{card.effectiveResponse}</div>
                            <div><strong style={{ color: "var(--text)" }}>经验教训：</strong>{card.lessonLearned}</div>
                            <div><strong style={{ color: "var(--text)" }}>可复用做法：</strong>{card.reusablePractice}</div>
                          </div>
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
                            {card.tags.map(tag => <span key={tag} className="tag tag-purple">{tag}</span>)}
                          </div>
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
                            {!asset && (
                              <button
                                className="btn-primary"
                                disabled={savingRetrospectiveAsset === savingKey}
                                onClick={() => mutateRetrospectiveAsset({ action: "confirm", card, savingKey })}
                              >
                                {savingRetrospectiveAsset === savingKey ? "保存中..." : "确认为组织过程资产"}
                              </button>
                            )}
                            {asset?.status === "reviewed" && (
                              <button
                                className="btn-primary"
                                disabled={savingRetrospectiveAsset === savingKey}
                                onClick={() => mutateRetrospectiveAsset({ action: "publish", id: asset.id, savingKey })}
                              >
                                {savingRetrospectiveAsset === savingKey ? "发布中..." : "发布到RAG"}
                              </button>
                            )}
                            {asset?.status === "published" && (
                              <button
                                className="btn-secondary"
                                disabled={savingRetrospectiveAsset === savingKey}
                                onClick={() => mutateRetrospectiveAsset({ action: "archive", id: asset.id, savingKey })}
                              >
                                {savingRetrospectiveAsset === savingKey ? "撤回中..." : "从RAG撤回"}
                              </button>
                            )}
                            {asset?.status === "archived" && (
                              <button
                                className="btn-secondary"
                                disabled={savingRetrospectiveAsset === savingKey}
                                onClick={() => mutateRetrospectiveAsset({ action: "review", id: asset.id, savingKey })}
                              >
                                {savingRetrospectiveAsset === savingKey ? "恢复中..." : "恢复为待发布"}
                              </button>
                            )}
                          </div>
                        </article>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="card">
              <div style={{ fontSize: "0.85rem", fontWeight: 800, color: "var(--text2)", marginBottom: 14, textTransform: "uppercase", letterSpacing: "0.08em" }}>预警规则与待补复盘</div>
              {retrospectiveAssetWarning && (
                <div style={{ marginBottom: 12, padding: 10, borderRadius: 10, background: "rgba(245,158,11,0.1)", color: "var(--amber)", fontSize: "0.74rem", lineHeight: 1.6 }}>
                  {retrospectiveAssetWarning}
                </div>
              )}
              {retrospectiveSyncWarning && (
                <div style={{ marginBottom: 12, padding: 10, borderRadius: 10, background: "rgba(59,130,246,0.08)", color: "var(--accent2)", fontSize: "0.74rem", lineHeight: 1.6 }}>
                  {retrospectiveSyncWarning}
                </div>
              )}
              {retrospectiveGovernanceWarning && (
                <div style={{ marginBottom: 12, padding: 10, borderRadius: 10, background: "rgba(59,130,246,0.08)", color: "var(--accent2)", fontSize: "0.74rem", lineHeight: 1.6 }}>
                  {retrospectiveGovernanceWarning}
                </div>
              )}
              {riskRetrospectiveDuplicateWarnings.length > 0 && (
                <div style={{ marginBottom: 12, padding: 10, borderRadius: 10, background: "rgba(245,158,11,0.1)", color: "var(--amber)", fontSize: "0.74rem", lineHeight: 1.7 }}>
                  <div style={{ fontWeight: 800, marginBottom: 6 }}>重复资产提示</div>
                  {riskRetrospectiveDuplicateWarnings.slice(0, 3).map(item => (
                    <div key={`${item.type}-${item.groupKey}`}>- {item.message}</div>
                  ))}
                </div>
              )}
              {!riskRetrospective ? (
                <div style={{ color: "var(--text2)", fontSize: "0.8rem", lineHeight: 1.7 }}>暂无复盘资产包。</div>
              ) : (
                <div style={{ display: "grid", gap: 14 }}>
                  <div>
                    <div style={{ fontWeight: 800, marginBottom: 8 }}>知识治理效果</div>
                    {!riskRetrospectiveGovernance ? (
                      <div style={{ color: "var(--text2)", fontSize: "0.78rem", lineHeight: 1.7 }}>暂无治理效果趋势。执行资产补充、合并、发布、撤回或恢复后会开始沉淀。</div>
                    ) : (
                      <>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 10 }}>
                          {[
                            ["本月动作", riskRetrospectiveGovernance.effect.monthlyActions],
                            ["质量净变", riskRetrospectiveGovernance.effect.qualityScoreLift > 0 ? `+${riskRetrospectiveGovernance.effect.qualityScoreLift}` : riskRetrospectiveGovernance.effect.qualityScoreLift],
                            ["引用资产", riskRetrospectiveGovernance.effect.referencedAssets],
                          ].map(([label, value]) => (
                            <div key={label} style={{ background: "linear-gradient(135deg, rgba(34,197,94,0.1), rgba(59,130,246,0.08))", border: "1px solid rgba(34,197,94,0.18)", borderRadius: 10, padding: 10 }}>
                              <div style={{ color: "var(--text2)", fontSize: "0.68rem" }}>{label}</div>
                              <strong style={{ fontSize: "0.95rem" }}>{value}</strong>
                            </div>
                          ))}
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8, marginBottom: 10 }}>
                          {[
                            ["质量提升动作", riskRetrospectiveGovernance.effect.improvedActions],
                            ["重复风险下降", riskRetrospectiveGovernance.effect.duplicateRiskReduction],
                          ].map(([label, value]) => (
                            <div key={label} style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 10, padding: 10 }}>
                              <div style={{ color: "var(--text2)", fontSize: "0.68rem" }}>{label}</div>
                              <strong style={{ fontSize: "0.9rem" }}>{value}</strong>
                            </div>
                          ))}
                        </div>
                        {riskRetrospectiveGovernance.effect.items.length === 0 ? (
                          <div style={{ color: "var(--text2)", fontSize: "0.78rem", lineHeight: 1.7 }}>暂无可计算的治理效果。治理动作产生 before/after 快照后，会展示每条资产的分数变化。</div>
                        ) : riskRetrospectiveGovernance.effect.items.slice(0, 4).map(item => (
                          <article key={item.logId} style={{ padding: 12, border: "1px solid rgba(34,197,94,0.18)", borderRadius: 10, background: "rgba(34,197,94,0.07)", marginBottom: 8 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
                              <strong style={{ fontSize: "0.8rem" }}>{item.assetTitle}</strong>
                              <span className={item.qualityDelta > 0 ? "tag tag-green" : item.qualityDelta < 0 ? "tag tag-red" : "tag tag-blue"}>
                                {item.qualityDelta > 0 ? `+${item.qualityDelta}` : item.qualityDelta}
                              </span>
                            </div>
                            <div style={{ color: "var(--text2)", fontSize: "0.72rem", lineHeight: 1.6 }}>
                              <div>动作：{item.actionLabel} · {item.createdAt.slice(0, 10)}</div>
                              <div>质量：{item.beforeScore ?? "暂无"} → {item.afterScore ?? "暂无"}；RAG引用变化：{item.ragReferenceDelta > 0 ? `+${item.ragReferenceDelta}` : item.ragReferenceDelta}</div>
                              <div>结论：{item.effectConclusion}</div>
                            </div>
                          </article>
                        ))}
                      </>
                    )}
                  </div>

                  <div>
                    <div style={{ fontWeight: 800, marginBottom: 8 }}>资产质量与治理队列</div>
                    {!riskRetrospectiveQuality ? (
                      <div style={{ color: "var(--text2)", fontSize: "0.78rem", lineHeight: 1.7 }}>暂无质量评分。确认复盘资产后会生成治理队列。</div>
                    ) : (
                      <>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 10 }}>
                          {[
                            ["均分", riskRetrospectiveQuality.summary.averageScore],
                            ["待治理", riskRetrospectiveQuality.summary.needsGovernance],
                            ["重复风险", riskRetrospectiveQuality.summary.duplicateRiskAssets],
                          ].map(([label, value]) => (
                            <div key={label} style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 10, padding: 10 }}>
                              <div style={{ color: "var(--text2)", fontSize: "0.68rem" }}>{label}</div>
                              <strong style={{ fontSize: "0.95rem" }}>{value}</strong>
                            </div>
                          ))}
                        </div>
                        {riskRetrospectiveQuality.governanceQueue.length === 0 ? (
                          <div style={{ color: "var(--text2)", fontSize: "0.78rem", lineHeight: 1.7 }}>当前资产质量良好，无需进入治理队列。</div>
                        ) : riskRetrospectiveQuality.governanceQueue.slice(0, 5).map(item => (
                          <article key={item.assetId} style={{ padding: 12, border: "1px solid rgba(245,158,11,0.24)", borderRadius: 10, background: "rgba(245,158,11,0.08)", marginBottom: 8 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
                              <strong style={{ fontSize: "0.8rem" }}>{item.title}</strong>
                              <span className={item.grade === "A" ? "tag tag-green" : item.grade === "B" ? "tag tag-blue" : item.grade === "C" ? "tag tag-amber" : "tag tag-red"}>{item.grade} / {item.score}</span>
                            </div>
                            <div style={{ color: "var(--text2)", fontSize: "0.72rem", lineHeight: 1.6 }}>
                              <div>处置建议：{item.suggestedDisposition === "keep" ? "保留" : item.suggestedDisposition === "enrich" ? "补充完善" : item.suggestedDisposition === "merge_or_archive" ? "合并或撤回" : "归档"}</div>
                              <div>责任：{item.governanceOwner} · deadline：{item.governanceDeadline}</div>
                              <div>动作：{item.suggestedActions[0]}</div>
                            </div>
                          </article>
                        ))}
                        <div style={{ color: "var(--text2)", fontSize: "0.7rem", lineHeight: 1.6 }}>{riskRetrospectiveQuality.boundary}</div>
                      </>
                    )}
                  </div>

                  <div>
                    <div style={{ fontWeight: 800, marginBottom: 8 }}>治理审计台</div>
                    {!riskRetrospectiveGovernance ? (
                      <div style={{ color: "var(--text2)", fontSize: "0.78rem", lineHeight: 1.7 }}>暂无治理审计数据。执行补充、合并、发布、撤回或恢复后会在这里展示。</div>
                    ) : (
                      <>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 10 }}>
                          {[
                            ["动作数", riskRetrospectiveGovernance.summary.totalLogs],
                            ["编辑", riskRetrospectiveGovernance.summary.editActions],
                            ["合并", riskRetrospectiveGovernance.summary.mergeActions],
                          ].map(([label, value]) => (
                            <div key={label} style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 10, padding: 10 }}>
                              <div style={{ color: "var(--text2)", fontSize: "0.68rem" }}>{label}</div>
                              <strong style={{ fontSize: "0.95rem" }}>{value}</strong>
                            </div>
                          ))}
                        </div>
                        {riskRetrospectiveGovernance.logs.length === 0 ? (
                          <div style={{ color: "var(--text2)", fontSize: "0.78rem", lineHeight: 1.7 }}>暂无治理动作。执行“补充资产”或“合并到主资产”后，这里会展示动作审计。</div>
                        ) : riskRetrospectiveGovernance.logs.slice(0, 6).map(log => (
                          <article key={log.id} style={{ padding: 12, border: "1px solid var(--border)", borderRadius: 10, background: "var(--surface2)", marginBottom: 8 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
                              <strong style={{ fontSize: "0.8rem" }}>{log.actionLabel}</strong>
                              <span className={log.action === "merge" ? "tag tag-purple" : log.action === "edit" ? "tag tag-blue" : "tag tag-green"}>{log.createdAt.slice(0, 10)}</span>
                            </div>
                            <div style={{ color: "var(--text2)", fontSize: "0.72rem", lineHeight: 1.6 }}>
                              <div>资产：{log.afterTitle || log.beforeTitle || "未知资产"}</div>
                              <div>人员：{log.performedByName || "系统"}</div>
                              <div>摘要：{log.actionSummary}</div>
                            </div>
                          </article>
                        ))}
                        <div style={{ color: "var(--text2)", fontSize: "0.7rem", lineHeight: 1.6 }}>{riskRetrospectiveGovernance.boundary}</div>
                      </>
                    )}
                  </div>

                  <div>
                    <div style={{ fontWeight: 800, marginBottom: 8 }}>已确认资产库</div>
                    {riskRetrospectiveAssets.length === 0 ? (
                      <div style={{ color: "var(--text2)", fontSize: "0.78rem", lineHeight: 1.7 }}>暂无已确认资产。先在左侧确认知识卡，确认后可发布到 RAG。</div>
                    ) : riskRetrospectiveAssets.slice(0, 8).map(asset => {
                      const mergeTargetId = duplicateMergeTargetByAssetId.get(asset.id);
                      const mergeTarget = mergeTargetId ? retrospectiveAssetById.get(mergeTargetId) : null;
                      const isEditing = editingRetrospectiveAssetId === asset.id;
                      return (
                      <article key={asset.id} style={{ padding: 12, border: "1px solid var(--border)", borderRadius: 10, background: "var(--surface2)", marginBottom: 8 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
                          <strong style={{ fontSize: "0.8rem" }}>{asset.title}</strong>
                          <span className={asset.status === "published" ? "tag tag-green" : asset.status === "archived" ? "tag tag-amber" : "tag tag-purple"}>
                            {asset.status === "published" ? "已发布" : asset.status === "archived" ? "已撤回" : "已确认"}
                          </span>
                        </div>
                        <div style={{ color: "var(--text2)", fontSize: "0.72rem", lineHeight: 1.6 }}>
                          <div>项目：{asset.projectName}</div>
                          <div>确认：{asset.confirmedByName || asset.createdByName || "系统"} · {asset.confirmedAt?.slice(0, 10) || asset.createdAt?.slice(0, 10)}</div>
                          {asset.publishedAt && <div>发布：{asset.publishedAt.slice(0, 10)}</div>}
                          <div>RAG引用：{asset.ragReferenceCount || 0} 次{asset.lastRagReferencedAt ? ` · 最近 ${asset.lastRagReferencedAt.slice(0, 10)}` : ""}</div>
                          {asset.lastExportedAt && <div>最近导出：{asset.lastExportedAt.slice(0, 10)} · {asset.lastExportSha256 ? `${asset.lastExportSha256.slice(0, 12)}...` : "无哈希"}</div>}
                        </div>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
                          <button className="btn-secondary" disabled={savingRetrospectiveAsset === asset.id} onClick={() => openRetrospectiveAssetEdit(asset)}>补充资产</button>
                          {mergeTarget && asset.status !== "archived" && (
                            <button className="btn-secondary" disabled={savingRetrospectiveAsset === asset.id} onClick={() => void mergeRetrospectiveAsset(asset.id, mergeTarget.id)}>
                              合并到主资产：{mergeTarget.title.slice(0, 8)}
                            </button>
                          )}
                        </div>
                        {isEditing && (
                          <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
                            {[
                              ["title", "资产标题"],
                              ["applicability", "适用范围"],
                              ["lessonLearned", "经验教训"],
                              ["earlyWarningRule", "早期预警规则"],
                              ["reusablePractice", "可复用做法"],
                              ["tagsText", "标签（用顿号/逗号分隔）"],
                            ].map(([field, label]) => (
                              <label key={field} style={{ display: "grid", gap: 4, color: "var(--text2)", fontSize: "0.72rem" }}>
                                {label}
                                <textarea
                                  value={retrospectiveAssetEditForm[field as keyof RetrospectiveAssetEditForm]}
                                  onChange={event => setRetrospectiveAssetEditForm(prev => ({ ...prev, [field]: event.target.value }))}
                                  rows={field === "title" || field === "tagsText" ? 1 : 2}
                                  style={{ width: "100%", border: "1px solid var(--border)", borderRadius: 8, padding: 8, background: "var(--surface)", color: "var(--text)", resize: "vertical" }}
                                />
                              </label>
                            ))}
                            <div style={{ display: "flex", gap: 8 }}>
                              <button className="btn-primary" disabled={savingRetrospectiveAsset === asset.id} onClick={() => void saveRetrospectiveAssetEdit(asset.id)}>
                                {savingRetrospectiveAsset === asset.id ? "保存中..." : "保存补充"}
                              </button>
                              <button className="btn-secondary" onClick={() => setEditingRetrospectiveAssetId(null)}>取消</button>
                            </div>
                          </div>
                        )}
                      </article>
                      );
                    })}
                  </div>

                  <div>
                    <div style={{ fontWeight: 800, marginBottom: 8 }}>同类项目预警推荐</div>
                    {riskRetrospectiveRecommendations.length === 0 ? (
                      <div style={{ color: "var(--text2)", fontSize: "0.78rem", lineHeight: 1.7 }}>暂无可推荐的历史复盘资产。发布资产到 RAG 后，系统会按当前未关闭风险的类别、影响领域和触发器匹配历史预警规则。</div>
                    ) : riskRetrospectiveRecommendations.slice(0, 6).map(item => (
                      <article key={item.id} style={{ padding: 12, border: "1px solid rgba(59,130,246,0.24)", borderRadius: 10, background: "rgba(59,130,246,0.08)", marginBottom: 8 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
                          <strong style={{ fontSize: "0.8rem" }}>{item.projectName}</strong>
                          <span className="tag tag-blue">匹配 {item.score}</span>
                        </div>
                        <div style={{ color: "var(--text2)", fontSize: "0.72rem", lineHeight: 1.6 }}>
                          <div>当前风险：{item.currentRiskDescription}</div>
                          <div>历史资产：{item.sourceAssetTitle} / {item.sourceProjectName}</div>
                          <div>匹配原因：{item.matchReason}</div>
                          <div style={{ marginTop: 6, color: "var(--accent2)" }}>建议预警：{item.recommendedWarningRule}</div>
                        </div>
                      </article>
                    ))}
                  </div>

                  <div>
                    <div style={{ fontWeight: 800, marginBottom: 8 }}>知识库导出审计</div>
                    {riskRetrospectiveSyncLogs.length === 0 ? (
                      <div style={{ color: "var(--text2)", fontSize: "0.78rem", lineHeight: 1.7 }}>暂无导出记录。点击“导出AI-PMO-SYS知识页”后，这里会展示最近导出的目标路径、资产数和摘要哈希。</div>
                    ) : riskRetrospectiveSyncLogs.slice(0, 6).map(log => (
                      <article key={log.id} style={{ padding: 12, border: "1px solid var(--border)", borderRadius: 10, background: "var(--surface2)", marginBottom: 8 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
                          <strong style={{ fontSize: "0.8rem" }}>{log.markdownTitle}</strong>
                          <span className={log.exportStatus === "exported" ? "tag tag-green" : "tag tag-amber"}>{log.exportStatus === "exported" ? "已导出" : "失败"}</span>
                        </div>
                        <div style={{ color: "var(--text2)", fontSize: "0.72rem", lineHeight: 1.6 }}>
                          <div>资产数：{log.assetCount}</div>
                          <div>路径：{log.targetPath}</div>
                          <div>人员：{log.exportedByName || "系统"} · {log.createdAt.slice(0, 10)}</div>
                          {log.markdownSha256 && <div>SHA256：{log.markdownSha256.slice(0, 12)}...</div>}
                          {log.warning && <div style={{ color: "var(--amber)" }}>提示：{log.warning}</div>}
                        </div>
                      </article>
                    ))}
                  </div>

                  <div>
                    <div style={{ fontWeight: 800, marginBottom: 8 }}>早期预警规则</div>
                    {riskRetrospective.earlyWarningRules.length === 0 ? (
                      <div style={{ color: "var(--text2)", fontSize: "0.78rem", lineHeight: 1.7 }}>暂无预警规则。</div>
                    ) : riskRetrospective.earlyWarningRules.slice(0, 8).map(rule => (
                      <article key={rule.id} style={{ padding: 12, border: "1px solid var(--border)", borderRadius: 10, background: "var(--surface2)", marginBottom: 8 }}>
                        <div style={{ fontWeight: 800, fontSize: "0.82rem", marginBottom: 6 }}>{rule.title}</div>
                        <div style={{ color: "var(--text2)", fontSize: "0.74rem", lineHeight: 1.6 }}>{rule.rule}</div>
                        <div style={{ marginTop: 6, color: "var(--accent2)", fontSize: "0.72rem" }}>建议责任人：{rule.suggestedOwner}</div>
                      </article>
                    ))}
                  </div>

                  <div>
                    <div style={{ fontWeight: 800, marginBottom: 8 }}>待补复盘事项</div>
                    {riskRetrospective.missingLessons.length === 0 ? (
                      <div style={{ color: "var(--text2)", fontSize: "0.78rem", lineHeight: 1.7 }}>当前没有待补复盘事项。</div>
                    ) : riskRetrospective.missingLessons.slice(0, 8).map(item => (
                      <article key={`${item.riskId}-${item.reason}`} style={{ padding: 12, border: "1px solid rgba(245,158,11,0.28)", borderRadius: 10, background: "rgba(245,158,11,0.08)", marginBottom: 8 }}>
                        <div style={{ fontWeight: 800, fontSize: "0.82rem", marginBottom: 6 }}>{item.projectName}</div>
                        <div style={{ color: "var(--text2)", fontSize: "0.74rem", lineHeight: 1.6 }}>{item.riskDescription}</div>
                        <div style={{ marginTop: 6, color: "var(--amber)", fontSize: "0.72rem", lineHeight: 1.6 }}>{item.reason}</div>
                        <div style={{ marginTop: 6, color: "var(--accent2)", fontSize: "0.72rem", lineHeight: 1.6 }}>{item.nextAction}</div>
                      </article>
                    ))}
                  </div>
                </div>
              )}
              <div style={{ marginTop: 14, padding: 12, borderRadius: 10, background: "rgba(59,130,246,0.08)", color: "var(--text2)", fontSize: "0.74rem", lineHeight: 1.6 }}>
                {riskRetrospective?.boundary || "风险复盘资产必须来自已关闭风险证据包。"}
              </div>
            </div>
          </div>
        )}

        {activeTab === "response" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: 20 }}>
            <div className="card">
              <div style={{ fontSize: "0.85rem", fontWeight: 800, color: "var(--text2)", marginBottom: 16, textTransform: "uppercase", letterSpacing: "0.08em" }}>高优先级风险应对计划</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {responseRisks.map(risk => (
                  <div key={risk.id} style={{ border: "1px solid var(--border)", borderRadius: 12, padding: 14, background: "var(--surface2)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 10 }}>
                      <div>
                        <div style={{ fontWeight: 800 }}>{risk.projectName} · {risk.description}</div>
                        <div style={{ marginTop: 5, color: "var(--text2)", fontSize: "0.72rem" }}>{risk.stage} · {categoryLabels[risk.category]} · 关联模块：{risk.linkedModule}</div>
                      </div>
                      <RiskBadge risk={risk} />
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10, fontSize: "0.76rem", color: "var(--text2)", lineHeight: 1.55 }}>
                      <div><strong style={{ color: "var(--text)" }}>应对策略：</strong>{risk.responseStrategyType} - {risk.responseStrategy}</div>
                      <div><strong style={{ color: "var(--text)" }}>预防措施：</strong>{risk.preventiveAction}</div>
                      <div><strong style={{ color: "var(--text)" }}>应急计划：</strong>{risk.contingencyPlan}</div>
                      <div><strong style={{ color: "var(--text)" }}>跟踪方法：</strong>{risk.trackingMethod}</div>
                      <div><strong style={{ color: "var(--text)" }}>触发器：</strong>{risk.trigger}</div>
                      <div><strong style={{ color: "var(--text)" }}>关闭条件：</strong>{risk.closingCriteria}</div>
                      <div><strong style={{ color: "var(--text)" }}>当前动作：</strong>{risk.lastAction || getWorkflowStepForStatus(risk.status).requiredAction}</div>
                      <div><strong style={{ color: "var(--text)" }}>责任/deadline：</strong>{risk.actionOwner || risk.owner || "未指定"} · {risk.actionDeadline || risk.dueDate || "未设置"}</div>
                    </div>
                  </div>
                ))}
                {responseRisks.length === 0 && <div style={{ color: "var(--text2)" }}>暂无需要应对的开放风险。</div>}
              </div>
            </div>

            <div className="card">
              <div style={{ fontSize: "0.85rem", fontWeight: 800, color: "var(--text2)", marginBottom: 14, textTransform: "uppercase", letterSpacing: "0.08em" }}>策略说明</div>
              {strategies.map(strategy => (
                <div key={strategy} style={{ marginBottom: 12, paddingBottom: 12, borderBottom: "1px solid var(--border)" }}>
                  <div style={{ fontWeight: 800 }}>{strategy}</div>
                  <div style={{ marginTop: 4, color: "var(--text2)", fontSize: "0.76rem", lineHeight: 1.6 }}>{responseStrategyGuidance[strategy]}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {showForm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20 }} onClick={e => { if (e.target === e.currentTarget) setShowForm(false); }}>
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 28, width: "100%", maxWidth: 860, maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ fontSize: "1rem", fontWeight: 800, marginBottom: 22 }}>{editingRisk ? "编辑风险" : "添加风险"}</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div>
                <label className="label">项目名称</label>
                <input className="input" value={formData.projectName} onChange={e => setFormData(prev => ({ ...prev, projectName: e.target.value }))} />
              </div>
              <div>
                <label className="label">责任人 *</label>
                <input className="input" value={formData.owner} onChange={e => setFormData(prev => ({ ...prev, owner: e.target.value }))} />
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <label className="label">风险描述 *</label>
                <textarea className="input" rows={2} value={formData.description} onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))} style={{ resize: "vertical" }} />
              </div>
              <div>
                <label className="label">风险类别</label>
                <select className="input" value={formData.category} onChange={e => setFormData(prev => ({ ...prev, category: e.target.value as RiskCategory }))}>
                  {categories.map(category => <option key={category} value={category}>{categoryLabels[category]}</option>)}
                </select>
              </div>
              <div>
                <label className="label">项目阶段</label>
                <select className="input" value={formData.stage} onChange={e => setFormData(prev => ({ ...prev, stage: e.target.value as RiskStage }))}>
                  {stages.map(stage => <option key={stage} value={stage}>{stage}</option>)}
                </select>
              </div>
              <div>
                <label className="label">影响领域</label>
                <select className="input" value={formData.impactArea} onChange={e => setFormData(prev => ({ ...prev, impactArea: e.target.value as RiskImpactArea }))}>
                  {impactAreas.map(area => <option key={area} value={area}>{impactAreaLabels[area]}</option>)}
                </select>
              </div>
              <div>
                <label className="label">关联模块</label>
                <select className="input" value={formData.linkedModule} onChange={e => setFormData(prev => ({ ...prev, linkedModule: e.target.value as LinkedModule }))}>
                  {modules.map(module => <option key={module} value={module}>{module}</option>)}
                </select>
              </div>
              <div>
                <label className="label">概率 P</label>
                <select className="input" value={formData.probability} onChange={e => setFormData(prev => ({ ...prev, probability: Number(e.target.value) as Risk["probability"] }))}>
                  {[1, 2, 3, 4, 5].map(value => <option key={value} value={value}>{value}</option>)}
                </select>
              </div>
              <div>
                <label className="label">影响 I</label>
                <select className="input" value={formData.impact} onChange={e => setFormData(prev => ({ ...prev, impact: Number(e.target.value) as Risk["impact"] }))}>
                  {[1, 2, 3, 4, 5].map(value => <option key={value} value={value}>{value}</option>)}
                </select>
              </div>
              <div>
                <label className="label">紧迫度 U</label>
                <select className="input" value={formData.urgency} onChange={e => setFormData(prev => ({ ...prev, urgency: Number(e.target.value) as Risk["urgency"] }))}>
                  {[1, 2, 3, 4, 5].map(value => <option key={value} value={value}>{value}</option>)}
                </select>
              </div>
              <div>
                <label className="label">状态</label>
                <select className="input" value={formData.status} onChange={e => setFormData(prev => ({ ...prev, status: e.target.value as RiskStatus }))}>
                  {statusOrder.map(status => <option key={status} value={status}>{statusLabels[status]}</option>)}
                </select>
              </div>
              <div>
                <label className="label">应对策略类型</label>
                <select className="input" value={formData.responseStrategyType} onChange={e => setFormData(prev => ({ ...prev, responseStrategyType: e.target.value as RiskStrategy }))}>
                  {strategies.map(strategy => <option key={strategy} value={strategy}>{strategy}</option>)}
                </select>
              </div>
              <div>
                <label className="label">来源</label>
                <input className="input" value={formData.source} onChange={e => setFormData(prev => ({ ...prev, source: e.target.value }))} />
              </div>
              <div>
                <label className="label">到期日</label>
                <input className="input" type="date" value={formData.dueDate} onChange={e => setFormData(prev => ({ ...prev, dueDate: e.target.value }))} />
              </div>
              <div>
                <label className="label">下次复核</label>
                <input className="input" type="date" value={formData.nextReviewDate} onChange={e => setFormData(prev => ({ ...prev, nextReviewDate: e.target.value }))} />
              </div>
              {[
                ["trigger", "触发器"],
                ["responseStrategy", "应对策略"],
                ["preventiveAction", "预防措施"],
                ["contingencyPlan", "应急计划"],
                ["trackingMethod", "跟踪方法"],
                ["closingCriteria", "关闭条件"],
                ["evidence", "证据/备注"],
              ].map(([field, label]) => (
                <div key={field} style={{ gridColumn: "1 / -1" }}>
                  <label className="label">{label}</label>
                  <textarea
                    className="input"
                    rows={2}
                    value={String(formData[field as keyof RiskForm] ?? "")}
                    onChange={e => setFormData(prev => ({ ...prev, [field]: e.target.value }))}
                    style={{ resize: "vertical" }}
                  />
                </div>
              ))}
              <div style={{ gridColumn: "1 / -1", padding: "12px 16px", borderRadius: 10, background: "var(--surface2)", display: "flex", justifyContent: "space-between", color: "var(--text2)" }}>
                <span>当前评分：P×I = {calculateRiskScore(formData.probability, formData.impact)}；优先级 = P×I×U = {calculateRiskPriority(formData.probability, formData.impact, formData.urgency)}</span>
                <span style={{ color: getRiskColor(calculateRiskScore(formData.probability, formData.impact)).text, fontWeight: 800 }}>{levelLabel(calculateRiskScore(formData.probability, formData.impact))}风险</span>
              </div>
            </div>
            {error && <div style={{ marginTop: 16, color: "var(--red)", fontSize: "0.82rem" }}>{error}</div>}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, marginTop: 24 }}>
              <button className="btn-secondary" onClick={() => { setShowForm(false); setEditingRisk(null); setError(""); }}>取消</button>
              <button className="btn-primary" onClick={() => void handleSave()} disabled={saving}>{saving ? "保存中..." : editingRisk ? "保存修改" : "添加风险"}</button>
            </div>
          </div>
        </div>
      )}

      {transitioningRisk && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20 }} onClick={e => { if (e.target === e.currentTarget) setTransitioningRisk(null); }}>
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 28, width: "100%", maxWidth: 760, maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", marginBottom: 18 }}>
              <div>
                <div style={{ fontSize: "1rem", fontWeight: 800 }}>推进风险工作流</div>
                <div style={{ marginTop: 6, color: "var(--text2)", fontSize: "0.78rem", lineHeight: 1.6 }}>
                  {transitioningRisk.projectName || "未指定项目"} · {transitioningRisk.description}
                </div>
              </div>
              <StatusBadge status={transitioningRisk.status} />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div>
                <label className="label">流转到状态</label>
                <select
                  className="input"
                  value={transitionForm.toStatus}
                  onChange={e => {
                    const toStatus = e.target.value as RiskStatus;
                    const step = getWorkflowStepForStatus(toStatus);
                    setTransitionForm(prev => ({
                      ...prev,
                      toStatus,
                      inputSummary: prev.inputSummary || step.input,
                      outputSummary: step.output,
                      actionRequired: step.requiredAction,
                    }));
                  }}
                >
                  {statusOrder.map(status => <option key={status} value={status}>{statusLabels[status]}</option>)}
                </select>
              </div>
              <div>
                <label className="label">责任人 *</label>
                <input className="input" value={transitionForm.owner} onChange={e => setTransitionForm(prev => ({ ...prev, owner: e.target.value }))} />
              </div>
              <div>
                <label className="label">deadline *</label>
                <input className="input" type="date" value={transitionForm.deadline} onChange={e => setTransitionForm(prev => ({ ...prev, deadline: e.target.value }))} />
              </div>
              <div>
                <label className="label">当前环节</label>
                <input className="input" value={getWorkflowStepForStatus(transitionForm.toStatus).name} readOnly />
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <label className="label">输入</label>
                <textarea className="input" rows={2} value={transitionForm.inputSummary} onChange={e => setTransitionForm(prev => ({ ...prev, inputSummary: e.target.value }))} />
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <label className="label">输出</label>
                <textarea className="input" rows={2} value={transitionForm.outputSummary} onChange={e => setTransitionForm(prev => ({ ...prev, outputSummary: e.target.value }))} />
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <label className="label">管理动作</label>
                <textarea className="input" rows={2} value={transitionForm.actionRequired} onChange={e => setTransitionForm(prev => ({ ...prev, actionRequired: e.target.value }))} />
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <label className="label">证据/备注</label>
                <textarea className="input" rows={2} value={transitionForm.evidence} onChange={e => setTransitionForm(prev => ({ ...prev, evidence: e.target.value }))} />
              </div>
              {transitionForm.toStatus === "closed" && (
                <div style={{ gridColumn: "1 / -1", border: "1px solid rgba(16,185,129,0.28)", borderRadius: 12, padding: 14, background: "rgba(16,185,129,0.08)" }}>
                  <div style={{ fontWeight: 800, marginBottom: 8 }}>关闭证据与复核意见</div>
                  <div style={{ color: "var(--text2)", fontSize: "0.76rem", lineHeight: 1.6, marginBottom: 12 }}>
                    关闭风险前必须提交证据和复核意见，并说明关联行动项、治理流程、回款/里程碑影响已处理或明确豁免。
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <div style={{ gridColumn: "1 / -1" }}>
                      <label className="label">关闭证据 *</label>
                      <textarea className="input" rows={2} value={transitionForm.closureEvidence} onChange={e => setTransitionForm(prev => ({ ...prev, closureEvidence: e.target.value }))} placeholder="验收单、缺陷关闭记录、回款确认、治理评审纪要、附件链接等" />
                    </div>
                    <div style={{ gridColumn: "1 / -1" }}>
                      <label className="label">复核意见 *</label>
                      <textarea className="input" rows={2} value={transitionForm.reviewOpinion} onChange={e => setTransitionForm(prev => ({ ...prev, reviewOpinion: e.target.value }))} placeholder="说明是否满足关闭条件、是否存在剩余风险、是否需要复盘或后续跟踪" />
                    </div>
                    <div>
                      <label className="label">复核人 *</label>
                      <input className="input" value={transitionForm.reviewer} onChange={e => setTransitionForm(prev => ({ ...prev, reviewer: e.target.value }))} />
                    </div>
                    <div>
                      <label className="label">复核日期 *</label>
                      <input className="input" type="date" value={transitionForm.reviewedAt} onChange={e => setTransitionForm(prev => ({ ...prev, reviewedAt: e.target.value }))} />
                    </div>
                    <div>
                      <label className="label">关闭结论 *</label>
                      <select className="input" value={transitionForm.closureDecision} onChange={e => setTransitionForm(prev => ({ ...prev, closureDecision: e.target.value as RiskClosureDecision }))}>
                        <option value="approved">批准关闭</option>
                        <option value="conditional">有条件关闭</option>
                      </select>
                    </div>
                    <div>
                      <label className="label">剩余风险</label>
                      <input className="input" value={transitionForm.residualRisk} onChange={e => setTransitionForm(prev => ({ ...prev, residualRisk: e.target.value }))} placeholder="无 / 转为运维风险 / 后续观察" />
                    </div>
                    <div style={{ gridColumn: "1 / -1" }}>
                      <label className="label">依赖处置说明 *</label>
                      <textarea className="input" rows={2} value={transitionForm.dependencyDisposition} onChange={e => setTransitionForm(prev => ({ ...prev, dependencyDisposition: e.target.value }))} placeholder="关联行动项、治理流程、回款/里程碑影响已处理，或说明豁免原因" />
                    </div>
                    {transitionForm.closureDecision === "conditional" && (
                      <>
                        <div style={{ gridColumn: "1 / -1" }}>
                          <label className="label">后续动作 *</label>
                          <input className="input" value={transitionForm.followUpAction} onChange={e => setTransitionForm(prev => ({ ...prev, followUpAction: e.target.value }))} placeholder="例如：继续跟踪首笔回款、沉淀复盘、转运维问题" />
                        </div>
                        <div>
                          <label className="label">后续责任人 *</label>
                          <input className="input" value={transitionForm.followUpOwner} onChange={e => setTransitionForm(prev => ({ ...prev, followUpOwner: e.target.value }))} />
                        </div>
                        <div>
                          <label className="label">后续deadline *</label>
                          <input className="input" type="date" value={transitionForm.followUpDeadline} onChange={e => setTransitionForm(prev => ({ ...prev, followUpDeadline: e.target.value }))} />
                        </div>
                      </>
                    )}
                    <div style={{ gridColumn: "1 / -1" }}>
                      <label className="label">经验教训/复盘要点</label>
                      <textarea className="input" rows={2} value={transitionForm.lessonsLearned} onChange={e => setTransitionForm(prev => ({ ...prev, lessonsLearned: e.target.value }))} placeholder="关闭后沉淀到项目复盘或组织过程资产的内容" />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {error && <div style={{ marginTop: 16, color: "var(--red)", fontSize: "0.82rem" }}>{error}</div>}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, marginTop: 24 }}>
              <button className="btn-secondary" onClick={() => { setTransitioningRisk(null); setError(""); }}>取消</button>
              <button className="btn-primary" onClick={() => void handleTransition()} disabled={saving}>{saving ? "保存中..." : "确认流转"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
