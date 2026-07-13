"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { buildBusinessCaseEvidence, type AiEvidence, type AiSuggestedAction } from "@/features/ai/evidence";
import { feishuTableUrl } from "@/features/feishu/links";
import {
  readStoredBusinessContext,
  readStoredCurrentProject,
  readStoredDataClass,
  loadCurrentBusinessContextSearchParams,
} from "@/features/operating-model/client-context";

// ============================================================================
// Types & Interfaces
// ============================================================================

interface ProjectInfo {
  name: string;
  type: "信息化" | "课程开发" | "工程基建" | "运营服务";
  level: "S" | "A" | "B";
  applyDate: string;
  expectedStart: string;
  sponsor: string;
  businessJustification: string;
}

interface BusinessCase {
  marketOpportunity: string;
  costBenefit: {
    investment: string;
    expectedReturn: string;
    roi: string;
    paybackPeriod: string;
  };
  riskAssessment: string;
  recommendation: "批准" | "拒绝" | "修改";
}

interface ProjectCharter {
  objectives: string;
  scope: string;
  deliverables: string;
  milestones: string;
  budget: string;
  organization: {
    pm: string;
    solution: string;
    delivery: string;
  };
  constraints: string;
  assumptions: string;
  signoff: {
    initiator: string;
    date: string;
    status: "pending" | "approved" | "rejected";
  };
}

interface StakeholderPreview {
  id: string;
  name: string;
  role: string;
  power: "高" | "中" | "低";
  interest: "高" | "中" | "低";
  quadrant: "重点管理" | "保持满意" | "随时告知" | "监督";
}

interface Requirement {
  id: string;
  code: string;
  description: string;
  priority: "高" | "中" | "低";
  status: "待确认" | "已确认" | "已实现" | "已验收";
  category: string;
}

interface PersistedGovernanceRecord {
  id: string;
  status: "draft" | "submitted" | "approved" | "rejected" | "changes_requested" | "superseded";
  version: number;
  content: Record<string, unknown>;
  updated_at?: string;
}

const PROJECT_TYPES = ["信息化", "课程开发", "工程基建", "运营服务"] as const;
const PROJECT_LEVELS = ["S", "A", "B"] as const;
const QUADRANT_COLORS = {
  "重点管理": { color: "#ef4444", bg: "rgba(239,68,68,0.08)", border: "rgba(239,68,68,0.3)" },
  "保持满意": { color: "#f59e0b", bg: "rgba(245,158,11,0.08)", border: "rgba(245,158,11,0.3)" },
  "随时告知": { color: "#3b82f6", bg: "rgba(59,130,246,0.08)", border: "rgba(59,130,246,0.3)" },
  "监督": { color: "#6b7280", bg: "rgba(107,114,128,0.08)", border: "rgba(107,114,128,0.3)" },
};

function levelLabel(value: number): "高" | "中" | "低" {
  return value >= 4 ? "高" : value >= 2 ? "中" : "低";
}

function stakeholderQuadrant(power: "高" | "中" | "低", interest: "高" | "中" | "低"): StakeholderPreview["quadrant"] {
  if (power === "高" && interest === "高") return "重点管理";
  if (power === "高") return "保持满意";
  if (interest === "高") return "随时告知";
  return "监督";
}

// ============================================================================
// Helper Components
// ============================================================================

function SectionCard({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <div style={{
      background: "var(--surface)",
      border: "1px solid var(--border)",
      borderRadius: "var(--radius)",
      overflow: "hidden",
    }}>
      <div style={{
        padding: "14px 20px",
        borderBottom: "1px solid var(--border)",
        display: "flex",
        alignItems: "center",
        gap: 10,
        background: "var(--surface2)",
      }}>
        <span style={{ fontSize: "1.1rem" }}>{icon}</span>
        <span style={{ fontWeight: 700, fontSize: "0.9rem" }}>{title}</span>
      </div>
      <div style={{ padding: 20 }}>
        {children}
      </div>
    </div>
  );
}

function LabelInput({ label, placeholder, value, onChange, type = "text" }: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "var(--text2)", marginBottom: 6 }}>
        {label}
      </label>
      <input
        type={type}
        className="input"
        placeholder={placeholder}
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{ width: "100%" }}
      />
    </div>
  );
}

function LabelTextarea({ label, placeholder, value, onChange, rows = 4 }: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
}) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "var(--text2)", marginBottom: 6 }}>
        {label}
      </label>
      <textarea
        className="input"
        placeholder={placeholder}
        value={value}
        onChange={e => onChange(e.target.value)}
        rows={rows}
        style={{
          width: "100%",
          resize: "vertical",
          fontFamily: "inherit",
        }}
      />
    </div>
  );
}

function LabelSelect({ label, options, value, onChange }: {
  label: string;
  options: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "var(--text2)", marginBottom: 6 }}>
        {label}
      </label>
      <select
        className="input"
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{ width: "100%" }}
      >
        {options.map(opt => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </select>
    </div>
  );
}

function AIGenerateButton({ onClick, label = "AI生成" }: { onClick: () => void; label?: string }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: "linear-gradient(135deg, #8b5cf6 0%, #a78bfa 100%)",
        border: "none",
        borderRadius: 8,
        padding: "8px 16px",
        color: "#fff",
        fontSize: "0.8rem",
        fontWeight: 600,
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        transition: "all 0.2s",
      }}
      onMouseEnter={e => (e.currentTarget.style.transform = "translateY(-1px)")}
      onMouseLeave={e => (e.currentTarget.style.transform = "none")}
    >
      <span>🤖</span>
      {label}
    </button>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export default function InitiationPage() {
  const [activeTab, setActiveTab] = useState<"registration" | "business" | "charter" | "stakeholder" | "requirements">("registration");
  const [feishuSaving, setFeishuSaving] = useState(false);
  const [feishuSaveResult, setFeishuSaveResult] = useState<{ status: "success" | "error"; message: string; recordId?: string } | null>(null);
  const [businessEvidence, setBusinessEvidence] = useState<AiEvidence | null>(null);
  const [businessEvidenceActionMessage, setBusinessEvidenceActionMessage] = useState("");
  const [savingBusinessEvidenceAction, setSavingBusinessEvidenceAction] = useState<string | null>(null);
  const [stakeholders, setStakeholders] = useState<StakeholderPreview[]>([]);
  const [currentProjectId, setCurrentProjectId] = useState("");
  const [currentProjectName, setCurrentProjectName] = useState("");
  const [sourceState, setSourceState] = useState<{ status: "loading" | "ready" | "unavailable"; detail: string }>({ status: "loading", detail: "正在读取当前项目的Supabase立项数据。" });
  const [requirementSaving, setRequirementSaving] = useState(false);
  const [governanceSaving, setGovernanceSaving] = useState<string | null>(null);
  const [initiationRecord, setInitiationRecord] = useState<PersistedGovernanceRecord | null>(null);
  const [businessArtifact, setBusinessArtifact] = useState<PersistedGovernanceRecord | null>(null);
  const [charterArtifact, setCharterArtifact] = useState<PersistedGovernanceRecord | null>(null);
  const [reviewComment, setReviewComment] = useState("");

  // Project Registration State
  const [projectInfo, setProjectInfo] = useState<ProjectInfo>({
    name: "",
    type: "信息化",
    level: "A",
    applyDate: new Date().toISOString().split("T")[0],
    expectedStart: "",
    sponsor: "",
    businessJustification: "",
  });

  // Business Case State
  const [businessCase, setBusinessCase] = useState<BusinessCase>({
    marketOpportunity: "",
    costBenefit: {
      investment: "",
      expectedReturn: "",
      roi: "",
      paybackPeriod: "",
    },
    riskAssessment: "",
    recommendation: "批准",
  });

  // Project Charter State
  const [projectCharter, setProjectCharter] = useState<ProjectCharter>({
    objectives: "",
    scope: "",
    deliverables: "",
    milestones: "",
    budget: "",
    organization: {
      pm: "",
      solution: "",
      delivery: "",
    },
    constraints: "",
    assumptions: "",
    signoff: {
      initiator: "",
      date: "",
      status: "pending",
    },
  });

  // Requirements State
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [showReqForm, setShowReqForm] = useState(false);
  const [editingReq, setEditingReq] = useState<Requirement | null>(null);
  const [reqForm, setReqForm] = useState<Partial<Requirement>>({
    priority: "中",
    status: "待确认",
    category: "功能需求",
  });

  // AI Loading States
  const [aiLoading, setAiLoading] = useState<string | null>(null);

  const loadInitiationData = useCallback(async () => {
    const context = readStoredBusinessContext();
    const projectId = readStoredCurrentProject();
    const dataClass = readStoredDataClass();
    setCurrentProjectId(projectId);
    if (!context?.businessRole || !projectId) {
      setStakeholders([]); setRequirements([]); setCurrentProjectName("");
      setSourceState({ status: "unavailable", detail: "请先在顶部业务上下文中选择已授权的项目。" });
      return;
    }
    setSourceState({ status: "loading", detail: "正在读取当前项目的干系人和需求记录。" });
    const params = new URLSearchParams({ project_id: projectId, business_role: context.businessRole, data_class: dataClass });
    try {
      const response = await fetch(`/api/initiation?${params.toString()}`, { cache: "no-store" });
      const payload = await response.json() as {
        project?: { name?: string };
        initiation?: PersistedGovernanceRecord | null;
        artifacts?: Array<PersistedGovernanceRecord & { artifact_type: string }>;
        stakeholders?: Array<{ id: string; name: string; role: string; power: number; interest: number }>;
        requirements?: Requirement[];
        detail?: string;
        error?: string;
      };
      if (!response.ok) throw new Error(payload.detail || payload.error || "立项数据读取失败");
      setCurrentProjectName(payload.project?.name || "当前项目");
      const loadedInitiation = payload.initiation ?? null;
      const loadedBusiness = payload.artifacts?.find(item => item.artifact_type === "business_case") ?? null;
      const loadedCharter = payload.artifacts?.find(item => item.artifact_type === "project_charter") ?? null;
      setInitiationRecord(loadedInitiation);
      setBusinessArtifact(loadedBusiness);
      setCharterArtifact(loadedCharter);
      if (loadedInitiation?.content) {
        const content = loadedInitiation.content;
        setProjectInfo(previous => ({
          ...previous,
          name: payload.project?.name || previous.name,
          type: String(content.project_type || previous.type) as ProjectInfo["type"],
          level: String(content.project_level || previous.level) as ProjectInfo["level"],
          applyDate: String(content.apply_date || previous.applyDate),
          expectedStart: String(content.expected_start || previous.expectedStart),
          sponsor: String(content.sponsor || ""),
          businessJustification: String(content.business_justification || ""),
        }));
      } else {
        setProjectInfo(previous => ({ ...previous, name: payload.project?.name || previous.name }));
      }
      if (loadedBusiness?.content) setBusinessCase(loadedBusiness.content as unknown as BusinessCase);
      if (loadedCharter?.content) {
        const content = loadedCharter.content as unknown as Omit<ProjectCharter, "signoff">;
        setProjectCharter(previous => ({
          ...previous,
          ...content,
          signoff: {
            ...previous.signoff,
            status: loadedCharter.status === "approved" ? "approved" : loadedCharter.status === "rejected" ? "rejected" : "pending",
          },
        }));
      }
      setStakeholders((payload.stakeholders || []).map(item => {
        const power = levelLabel(item.power);
        const interest = levelLabel(item.interest);
        return { id: item.id, name: item.name, role: item.role, power, interest, quadrant: stakeholderQuadrant(power, interest) };
      }));
      setRequirements(Array.isArray(payload.requirements) ? payload.requirements : []);
      setSourceState({ status: "ready", detail: `已连接Supabase正式数据：${payload.project?.name || "当前项目"}。` });
    } catch (error) {
      setStakeholders([]); setRequirements([]); setCurrentProjectName("");
      setInitiationRecord(null); setBusinessArtifact(null); setCharterArtifact(null);
      setSourceState({ status: "unavailable", detail: error instanceof Error ? error.message : "立项数据源不可用。" });
    }
  }, []);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void loadInitiationData(), 0);
    const reload = () => void loadInitiationData();
    window.addEventListener("ai-pmo:project-context-changed", reload);
    window.addEventListener("ai-pmo:business-context-changed", reload);
    window.addEventListener("ai-pmo:data-class-changed", reload);
    return () => {
      window.clearTimeout(initialLoad);
      window.removeEventListener("ai-pmo:project-context-changed", reload);
      window.removeEventListener("ai-pmo:business-context-changed", reload);
      window.removeEventListener("ai-pmo:data-class-changed", reload);
    };
  }, [loadInitiationData]);

  const currentGovernanceContext = (expectedVersion: number) => {
    const context = readStoredBusinessContext();
    if (!context?.businessRole || !currentProjectId) return null;
    return {
      project_id: currentProjectId,
      business_role: context.businessRole,
      data_class: readStoredDataClass(),
      expected_version: expectedVersion,
      idempotency_key: `v63:initiation:${currentProjectId}:${crypto.randomUUID()}`,
    };
  };

  const postGovernance = async (body: Record<string, unknown>) => {
    const response = await fetch("/api/initiation", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const payload = await response.json() as { detail?: string; error?: string };
    if (!response.ok) throw new Error(payload.detail || payload.error || "正式成果保存失败");
    await loadInitiationData();
  };

  const handleSaveInitiation = async () => {
    const context = currentGovernanceContext(initiationRecord?.version ?? 0);
    if (!context) { setBusinessEvidenceActionMessage("请先选择已授权的当前项目。"); return; }
    if (!projectInfo.sponsor.trim() || !projectInfo.businessJustification.trim()) { setBusinessEvidenceActionMessage("请填写项目发起人和业务立项理由。"); return; }
    setGovernanceSaving("save_initiation");
    try {
      await postGovernance({ operation: "save_initiation", ...context, content: { project_type: projectInfo.type, project_level: projectInfo.level, apply_date: projectInfo.applyDate, expected_start: projectInfo.expectedStart, sponsor: projectInfo.sponsor, business_justification: projectInfo.businessJustification } });
      setBusinessEvidenceActionMessage("立项信息已保存到Supabase正式项目记录。");
    } catch (error) { setBusinessEvidenceActionMessage(`立项保存失败：${error instanceof Error ? error.message : "未知错误"}`); }
    finally { setGovernanceSaving(null); }
  };

  const handleSaveArtifact = async (kind: "business" | "charter") => {
    const record = kind === "business" ? businessArtifact : charterArtifact;
    const context = currentGovernanceContext(record?.version ?? 0);
    if (!context) { setBusinessEvidenceActionMessage("请先选择已授权的当前项目。"); return; }
    setGovernanceSaving(`save_${kind}`);
    try {
      await postGovernance({
        operation: kind === "business" ? "save_business_case" : "save_charter",
        ...context,
        title: `${currentProjectName || projectInfo.name}-${kind === "business" ? "商业论证" : "项目章程"}`,
        content: kind === "business" ? businessCase : { ...projectCharter, signoff: undefined },
        source_type: kind === "business" && businessEvidence ? "ai_assisted" : "human_input",
      });
      setBusinessEvidenceActionMessage(`${kind === "business" ? "商业论证" : "项目章程"}草稿已正式保存。`);
    } catch (error) { setBusinessEvidenceActionMessage(`成果保存失败：${error instanceof Error ? error.message : "未知错误"}`); }
    finally { setGovernanceSaving(null); }
  };

  const handleTransitionArtifact = async (kind: "business" | "charter", transition: "submit" | "approve" | "reject" | "request_changes" | "revise") => {
    const record = kind === "business" ? businessArtifact : charterArtifact;
    if (!record) { setBusinessEvidenceActionMessage("请先保存正式草稿。"); return; }
    const context = currentGovernanceContext(record.version);
    if (!context) { setBusinessEvidenceActionMessage("请先选择已授权的当前项目。"); return; }
    if (["approve", "reject", "request_changes"].includes(transition) && !reviewComment.trim()) { setBusinessEvidenceActionMessage("审批、拒绝或退回修改时必须填写审批意见。"); return; }
    setGovernanceSaving(`${transition}_${kind}`);
    try {
      await postGovernance({ operation: "transition_artifact", ...context, artifact_id: record.id, transition, comment: reviewComment.trim() });
      setReviewComment("");
      setBusinessEvidenceActionMessage(`${kind === "business" ? "商业论证" : "项目章程"}状态已更新并写入审计轨迹。`);
    } catch (error) { setBusinessEvidenceActionMessage(`状态变更失败：${error instanceof Error ? error.message : "未知错误"}`); }
    finally { setGovernanceSaving(null); }
  };

  const handleSaveProjectToFeishu = async () => {
    setFeishuSaveResult(null);
    if (!projectInfo.name.trim() || !projectInfo.sponsor.trim() || !projectInfo.businessJustification.trim()) {
      setFeishuSaveResult({
        status: "error",
        message: "请先填写项目名称、项目发起人和业务立项理由。",
      });
      return;
    }

    setFeishuSaving(true);
    try {
      const response = await fetch("/api/integrations/feishu/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(projectInfo),
      });
      const data = await response.json().catch(() => ({})) as { record_id?: string; code?: string };
      if (!response.ok) {
        throw new Error(data.code ?? `HTTP_${response.status}`);
      }
      setFeishuSaveResult({
        status: "success",
        message: "已保存到飞书项目台账。",
        recordId: data.record_id,
      });
    } catch (error) {
      setFeishuSaveResult({
        status: "error",
        message: `保存失败：${error instanceof Error ? error.message : "未知错误"}。请检查飞书应用权限和服务端环境变量。`,
      });
    } finally {
      setFeishuSaving(false);
    }
  };

  // ============================================================================
  // AI Generation Handlers
  // ============================================================================

  const handleAIGenerateBusinessCase = async () => {
    setBusinessEvidenceActionMessage("");
    if (!projectInfo.name.trim() || !projectInfo.sponsor.trim() || !projectInfo.businessJustification.trim()) {
      setBusinessEvidenceActionMessage("请先填写项目名称、发起人和业务立项理由。");
      return;
    }
    setAiLoading("business");
    try {
      const generatedResponse = await fetch("/api/initiation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operation: "generate_business_case", ...currentGovernanceContext(0), project_name: projectInfo.name, project_type: projectInfo.type, project_level: projectInfo.level, sponsor: projectInfo.sponsor, business_justification: projectInfo.businessJustification }),
      });
      const generatedPayload = await generatedResponse.json() as { result?: BusinessCase; detail?: string; error?: string; model?: string };
      if (!generatedResponse.ok || !generatedPayload.result) throw new Error(generatedPayload.detail || generatedPayload.error || "AI商业论证生成失败");
      const generatedCase = generatedPayload.result;
      setBusinessCase(generatedCase);
      const evidence = buildBusinessCaseEvidence({ projectName: projectInfo.name, projectType: projectInfo.type, projectLevel: projectInfo.level, sponsor: projectInfo.sponsor, businessJustification: projectInfo.businessJustification, recommendation: generatedCase.recommendation });
      setBusinessEvidence(evidence);
      const auditResponse = await fetch("/api/ai/evidence", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ evidence }) });
      const payload = await auditResponse.json().catch(() => ({})) as {
        status?: AiEvidence["auditStatus"];
        audit_id?: string;
        warning?: string;
      };
      setBusinessEvidence({
        ...evidence,
        auditId: payload.audit_id,
        auditStatus: payload.status,
        auditWarning: payload.warning,
      });
    } catch (error) {
      setBusinessEvidenceActionMessage(`AI商业论证不可用：${error instanceof Error ? error.message : "未知错误"}`);
    } finally {
      setAiLoading(null);
    }
  };

  const handleAIGenerateCharter = async () => {
    setBusinessEvidenceActionMessage("");
    if (!projectInfo.name.trim() || !projectInfo.sponsor.trim() || !projectInfo.businessJustification.trim()) {
      setBusinessEvidenceActionMessage("请先填写项目名称、发起人和业务立项理由。");
      return;
    }
    setAiLoading("charter");
    try {
      const response = await fetch("/api/initiation", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ operation: "generate_charter", ...currentGovernanceContext(0), project_name: projectInfo.name, project_type: projectInfo.type, project_level: projectInfo.level, sponsor: projectInfo.sponsor, business_justification: projectInfo.businessJustification }) });
      const payload = await response.json() as { result?: Omit<ProjectCharter, "signoff">; detail?: string; error?: string };
      if (!response.ok || !payload.result) throw new Error(payload.detail || payload.error || "AI项目章程生成失败");
      setProjectCharter(previous => ({ ...previous, ...payload.result!, signoff: previous.signoff }));
    } catch (error) {
      setBusinessEvidenceActionMessage(`AI项目章程不可用：${error instanceof Error ? error.message : "未知错误"}`);
    } finally {
      setAiLoading(null);
    }
  };

  const convertBusinessEvidenceAction = async (action: AiSuggestedAction, index: number) => {
    if (!businessEvidence) return;
    const actionKey = `${businessEvidence.id}-${index}`;
    setSavingBusinessEvidenceAction(actionKey);
    setBusinessEvidenceActionMessage("");
    try {
      const businessContext = await loadCurrentBusinessContextSearchParams();
      const response = await fetch(`/api/issue-change?${businessContext.toString()}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operation: "create_action",
          title: action.title,
          owner: action.owner || projectInfo.sponsor || "项目发起人",
          dueDate: action.dueDate,
          priority: action.priority,
          projectName: projectInfo.name || "商业论证",
          sourceType: "manual",
          sourceId: businessEvidence.id,
          sourceReason: action.sourceReason,
        }),
      });
      const payload = await response.json().catch(() => ({})) as { action?: { id?: string }; error?: string; migrationHint?: string };
      if (!response.ok || !payload.action) throw new Error([payload.error, payload.migrationHint].filter(Boolean).join("；") || "行动项创建失败");
      setBusinessEvidenceActionMessage(`已转为问题/变更行动项：${payload.action.id || action.title}`);
    } catch (e: unknown) {
      setBusinessEvidenceActionMessage(`行动项创建失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSavingBusinessEvidenceAction(null);
    }
  };

  // ============================================================================
  // ROI Calculation
  // ============================================================================

  const calculateROI = () => {
    const investment = parseFloat(businessCase.costBenefit.investment.replace(/[^0-9.]/g, "")) || 0;
    const expectedReturn = parseFloat(businessCase.costBenefit.expectedReturn.replace(/[^0-9.]/g, "")) || 0;
    if (investment > 0) {
      const roi = ((expectedReturn - investment) / investment * 100).toFixed(1);
      return isNaN(Number(roi)) ? "—" : `${roi}%`;
    }
    return "—";
  };

  // ============================================================================
  // Requirement Handlers
  // ============================================================================

  const requirementContext = () => {
    const context = readStoredBusinessContext();
    return context?.businessRole && currentProjectId
      ? {
          project_id: currentProjectId,
          business_role: context.businessRole,
          data_class: readStoredDataClass(),
          expected_version: 0,
          idempotency_key: `v63:requirement:${currentProjectId}:${crypto.randomUUID()}`,
        }
      : null;
  };

  const handleSaveRequirement = async () => {
    if (!reqForm.description?.trim()) return;
    const context = requirementContext();
    if (!context) { setBusinessEvidenceActionMessage("请先选择已授权的当前项目。"); return; }
    setRequirementSaving(true);
    try {
      const response = await fetch("/api/initiation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operation: editingReq ? "update_requirement" : "create_requirement",
          ...context,
          id: editingReq?.id,
          description: reqForm.description.trim(),
          priority: reqForm.priority || "中",
          status: reqForm.status || "待确认",
          category: reqForm.category || "功能需求",
        }),
      });
      const payload = await response.json() as { detail?: string; error?: string };
      if (!response.ok) throw new Error(payload.detail || payload.error || "需求保存失败");
      setReqForm({ priority: "中", status: "待确认", category: "功能需求" });
      setEditingReq(null);
      setShowReqForm(false);
      setBusinessEvidenceActionMessage("需求已保存到Supabase。");
      await loadInitiationData();
    } catch (error) {
      setBusinessEvidenceActionMessage(`需求保存失败：${error instanceof Error ? error.message : "数据源不可用"}`);
    } finally {
      setRequirementSaving(false);
    }
  };

  const handleEditRequirement = (req: Requirement) => {
    setReqForm(req);
    setEditingReq(req);
    setShowReqForm(true);
  };

  const handleDeleteRequirement = async (id: string) => {
    if (!confirm("确认删除该需求？")) return;
    const context = requirementContext();
    if (!context) { setBusinessEvidenceActionMessage("请先选择已授权的当前项目。"); return; }
    setRequirementSaving(true);
    try {
      const response = await fetch("/api/initiation", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ operation: "delete_requirement", ...context, id }) });
      const payload = await response.json() as { detail?: string; error?: string };
      if (!response.ok) throw new Error(payload.detail || payload.error || "需求删除失败");
      setBusinessEvidenceActionMessage("需求已从Supabase删除。");
      await loadInitiationData();
    } catch (error) {
      setBusinessEvidenceActionMessage(`需求删除失败：${error instanceof Error ? error.message : "数据源不可用"}`);
    } finally { setRequirementSaving(false); }
  };

  // ============================================================================
  // Tab Navigation Items
  // ============================================================================

  const tabs = [
    { key: "registration", label: "📋 立项管理", desc: "项目基本信息登记" },
    { key: "business", label: "💰 商业论证", desc: "成本效益与风险评估" },
    { key: "charter", label: "📄 项目任务书", desc: "项目章程与授权" },
    { key: "stakeholder", label: "👥 干系人识别", desc: "权力利益矩阵分析" },
    { key: "requirements", label: "📐 需求管理", desc: "需求清单与追溯矩阵" },
  ] as const;

  // ============================================================================
  // Render
  // ============================================================================

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", flexDirection: "column" }}>
      {/* Header */}
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
        <span style={{ fontWeight: 700 }}>🚀 项目启动阶段</span>
        <span className="tag tag-purple" style={{ fontSize: "0.7rem" }}>立项与授权</span>
      </header>

      <main style={{ flex: 1, padding: "24px 32px" }}>
        <div style={{
          maxWidth: 1000,
          margin: "0 auto 18px",
          padding: "10px 14px",
          borderRadius: 8,
          background: sourceState.status === "ready" ? "rgba(16,185,129,0.08)" : sourceState.status === "loading" ? "rgba(59,130,246,0.08)" : "rgba(245,158,11,0.1)",
          border: `1px solid ${sourceState.status === "ready" ? "rgba(16,185,129,0.25)" : sourceState.status === "loading" ? "rgba(59,130,246,0.25)" : "rgba(245,158,11,0.3)"}`,
          color: sourceState.status === "ready" ? "var(--green)" : sourceState.status === "loading" ? "var(--accent)" : "var(--amber)",
          fontSize: "0.82rem",
        }}>
          <strong>{currentProjectName ? `${currentProjectName} · ` : ""}{sourceState.status === "ready" ? "真实立项数据已连接" : sourceState.status === "loading" ? "数据读取中" : "数据源不可用"}</strong>
          <span style={{ marginLeft: 8 }}>{sourceState.detail}</span>
        </div>
        {businessEvidenceActionMessage && <div style={{ maxWidth: 1000, margin: "0 auto 18px", color: /\u5931\u8d25|\u4e0d\u53ef\u7528/.test(businessEvidenceActionMessage) ? "var(--red)" : "var(--green)", fontSize: "0.82rem" }}>{businessEvidenceActionMessage}</div>}
        {/* Tab Navigation */}
        <div style={{
          display: "flex",
          gap: 0,
          marginBottom: 24,
          borderBottom: "1px solid var(--border)",
          overflowX: "auto",
        }}>
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as typeof activeTab)}
              style={{
                padding: "12px 20px",
                background: "none",
                border: "none",
                borderBottom: activeTab === tab.key ? "2px solid var(--accent)" : "2px solid transparent",
                color: activeTab === tab.key ? "var(--accent)" : "var(--text2)",
                fontWeight: activeTab === tab.key ? 700 : 500,
                fontSize: "0.85rem",
                cursor: "pointer",
                whiteSpace: "nowrap",
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-start",
                gap: 2,
                transition: "all 0.2s",
              }}
            >
              <span>{tab.label}</span>
              <span style={{ fontSize: "0.7rem", fontWeight: 400, opacity: 0.7 }}>{tab.desc}</span>
            </button>
          ))}
        </div>

        {/* ========================================================================== */}
        {/* Tab 1: Project Registration */}
        {/* ========================================================================== */}
        {activeTab === "registration" && (
          <div style={{ maxWidth: 900, margin: "0 auto" }}>
            <SectionCard title="项目基本信息" icon="📋">
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
                <LabelInput
                  label="项目名称"
                  placeholder="请输入项目名称"
                  value={projectInfo.name}
                  onChange={v => setProjectInfo(prev => ({ ...prev, name: v }))}
                />
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                  <LabelSelect
                    label="项目类型"
                    options={[...PROJECT_TYPES]}
                    value={projectInfo.type}
                    onChange={v => setProjectInfo(prev => ({ ...prev, type: v as ProjectInfo["type"] }))}
                  />
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "var(--text2)", marginBottom: 6 }}>
                      项目级别
                    </label>
                    <div style={{ display: "flex", gap: 8 }}>
                      {PROJECT_LEVELS.map(level => (
                        <button
                          key={level}
                          onClick={() => setProjectInfo(prev => ({ ...prev, level: level as ProjectInfo["level"] }))}
                          style={{
                            flex: 1,
                            padding: "8px 12px",
                            borderRadius: 8,
                            border: `1px solid ${projectInfo.level === level ? "var(--accent)" : "var(--border)"}`,
                            background: projectInfo.level === level ? "rgba(59,130,246,0.15)" : "transparent",
                            color: projectInfo.level === level ? "var(--accent)" : "var(--text2)",
                            fontWeight: 600,
                            cursor: "pointer",
                            fontSize: "0.85rem",
                            transition: "all 0.2s",
                          }}
                        >
                          {level}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
                <LabelInput
                  label="申请日期"
                  placeholder="请选择日期"
                  value={projectInfo.applyDate}
                  onChange={v => setProjectInfo(prev => ({ ...prev, applyDate: v }))}
                  type="date"
                />
                <LabelInput
                  label="预计启动日期"
                  placeholder="请选择日期"
                  value={projectInfo.expectedStart}
                  onChange={v => setProjectInfo(prev => ({ ...prev, expectedStart: v }))}
                  type="date"
                />
              </div>

              <LabelInput
                label="项目发起人"
                placeholder="请输入发起人姓名或部门"
                value={projectInfo.sponsor}
                onChange={v => setProjectInfo(prev => ({ ...prev, sponsor: v }))}
              />

              <LabelTextarea
                label="业务立项理由"
                placeholder="请简要说明项目背景和业务价值..."
                value={projectInfo.businessJustification}
                onChange={v => setProjectInfo(prev => ({ ...prev, businessJustification: v }))}
                rows={4}
              />

              <div style={{
                marginTop: 20,
                padding: "16px 20px",
                background: "rgba(51,112,255,0.08)",
                border: "1px solid rgba(51,112,255,0.2)",
                borderRadius: 10,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: "0.85rem", marginBottom: 4 }}>💡 快速操作</div>
                  <div style={{ fontSize: "0.8rem", color: "var(--text2)" }}>保存立项信息后可继续填写商业论证和项目任务书</div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="btn-primary" onClick={() => void handleSaveInitiation()} disabled={governanceSaving === "save_initiation"}>
                    {governanceSaving === "save_initiation" ? "保存中..." : initiationRecord ? `保存新版本 v${initiationRecord.version + 1}` : "保存正式立项记录"}
                  </button>
                  <button
                    className="btn-secondary"
                    onClick={handleSaveProjectToFeishu}
                    disabled={feishuSaving}
                    style={{ color: "var(--feishu)", borderColor: "var(--feishu)", opacity: feishuSaving ? 0.7 : 1 }}
                  >
                    {feishuSaving ? "同步中..." : "同步至飞书"}
                  </button>
                </div>
              </div>
              {feishuSaveResult && (
                <div style={{
                  marginTop: 12,
                  padding: "12px 14px",
                  borderRadius: 8,
                  border: `1px solid ${feishuSaveResult.status === "success" ? "rgba(16,185,129,0.35)" : "rgba(239,68,68,0.35)"}`,
                  background: feishuSaveResult.status === "success" ? "rgba(16,185,129,0.08)" : "rgba(239,68,68,0.08)",
                  color: feishuSaveResult.status === "success" ? "var(--green)" : "var(--red)",
                  fontSize: "0.82rem",
                  lineHeight: 1.6,
                }}>
                  {feishuSaveResult.message}
                  {feishuSaveResult.recordId && (
                    <>
                      <span style={{ color: "var(--text2)" }}> 记录ID：{feishuSaveResult.recordId}</span>
                      <a href={feishuTableUrl("project")} target="_blank" rel="noopener noreferrer" style={{ marginLeft: 12, color: "var(--feishu)", textDecoration: "none" }}>
                        打开项目台账 →
                      </a>
                    </>
                  )}
                </div>
              )}
            </SectionCard>
          </div>
        )}

        {/* ========================================================================== */}
        {/* Tab 2: Business Case */}
        {/* ========================================================================== */}
        {activeTab === "business" && (
          <div style={{ maxWidth: 900, margin: "0 auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <div>
                <h2 style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: 4 }}>💰 商业论证</h2>
                <p style={{ fontSize: "0.8rem", color: "var(--text2)" }}>分析项目投资回报与实施风险，支持立项决策</p>
              </div>
              <AIGenerateButton
                onClick={handleAIGenerateBusinessCase}
                label={aiLoading === "business" ? "生成中..." : "AI生成商业论证"}
              />
            </div>
            <div style={{
              marginBottom: 20,
              padding: "12px 14px",
              borderRadius: 10,
              background: "rgba(245,158,11,0.08)",
              border: "1px solid rgba(245,158,11,0.25)",
              color: "var(--text2)",
              fontSize: "0.82rem",
              lineHeight: 1.7,
            }}>
              <span style={{ color: "var(--amber)", fontWeight: 700 }}>生成依据：</span>
              当前立项信息（项目名称、类型、等级、发起人、业务立项理由）+ PMO知识库中的商业论证结构（成本收益、风险、阶段门、持续商业论证）+ 系统内置项目管理模板。当前不会自动读取外部市场数据、真实财务系统或飞书合同回款明细，生成结果是立项草案，正式提交前需要人工复核。
            </div>
            {businessEvidence && (
              <div style={{
                marginBottom: 20,
                padding: "16px 18px",
                borderRadius: 12,
                background: "rgba(139,92,246,0.08)",
                border: "1px solid rgba(139,92,246,0.25)",
                fontSize: "0.82rem",
                lineHeight: 1.7,
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", marginBottom: 10 }}>
                  <div>
                    <div style={{ fontWeight: 800, color: "var(--purple)", marginBottom: 4 }}>AI生成依据审计</div>
                    <div style={{ color: "var(--text2)" }}>{businessEvidence.inputSummary}</div>
                  </div>
                  <span className="tag tag-purple" style={{ whiteSpace: "nowrap" }}>
                    {businessEvidence.model} · {businessEvidence.confidence}
                  </span>
                </div>
                <div style={{ color: "var(--text)", marginBottom: 10 }}>{businessEvidence.outputSummary}</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div>
                    <div style={{ fontWeight: 800, color: "var(--text2)", marginBottom: 6 }}>依据来源</div>
                    {businessEvidence.basis.map(item => (
                      <div key={`${item.source}-${item.label}`} style={{ color: "var(--text2)", marginBottom: 4 }}>
                        <strong style={{ color: "var(--text)" }}>{item.label}：</strong>{item.detail}
                      </div>
                    ))}
                  </div>
                  <div>
                    <div style={{ fontWeight: 800, color: "var(--text2)", marginBottom: 6 }}>后续动作</div>
                    {businessEvidence.suggestedActions.map((action, index) => {
                      const actionKey = `${businessEvidence.id}-${index}`;
                      return (
                        <div key={action.title} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 8 }}>
                          <span style={{ color: "var(--text2)" }}>
                            <strong style={{ color: "var(--amber)" }}>{action.priority}</strong> · {action.title} · {action.owner || "待定"} · {action.dueDate || "待定"}
                          </span>
                          <button className="btn-secondary" onClick={() => void convertBusinessEvidenceAction(action, index)} disabled={savingBusinessEvidenceAction === actionKey} style={{ fontSize: "0.72rem", padding: "4px 8px", whiteSpace: "nowrap" }}>
                            {savingBusinessEvidenceAction === actionKey ? "转入中..." : "转行动项"}
                          </button>
                        </div>
                      );
                    })}
                    <div style={{ marginTop: 8, color: businessEvidence.auditStatus === "succeeded" ? "var(--green)" : "var(--amber)" }}>
                      审计状态：{businessEvidence.auditStatus || "待写入"}
                      {businessEvidence.auditId ? ` · ${businessEvidence.auditId}` : ""}
                      {businessEvidence.auditWarning ? ` · ${businessEvidence.auditWarning}` : ""}
                    </div>
                    {businessEvidenceActionMessage && (
                      <div style={{ marginTop: 8, color: businessEvidenceActionMessage.includes("失败") ? "var(--red)" : "var(--green)" }}>
                        {businessEvidenceActionMessage}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            <SectionCard title="市场机会分析" icon="📊">
              <LabelTextarea
                label="市场背景与机会"
                placeholder="描述目标市场规模、增长趋势、政策环境、竞争格局..."
                value={businessCase.marketOpportunity}
                onChange={v => setBusinessCase(prev => ({ ...prev, marketOpportunity: v }))}
                rows={5}
              />
            </SectionCard>

            <SectionCard title="成本效益分析" icon="💹">
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
                <LabelInput
                  label="预计投资额（万元）"
                  placeholder="如：80"
                  value={businessCase.costBenefit.investment}
                  onChange={v => setBusinessCase(prev => ({
                    ...prev,
                    costBenefit: { ...prev.costBenefit, investment: v }
                  }))}
                />
                <LabelInput
                  label="预期回报（万元/年）"
                  placeholder="如：20"
                  value={businessCase.costBenefit.expectedReturn}
                  onChange={v => setBusinessCase(prev => ({
                    ...prev,
                    costBenefit: { ...prev.costBenefit, expectedReturn: v }
                  }))}
                />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 20 }}>
                <div style={{
                  background: "var(--surface2)",
                  borderRadius: 10,
                  padding: 16,
                  textAlign: "center",
                }}>
                  <div style={{ fontSize: "0.75rem", color: "var(--text2)", marginBottom: 6 }}>预计ROI</div>
                  <div style={{ fontSize: "1.8rem", fontWeight: 700, color: "var(--green)" }}>
                    {businessCase.costBenefit.investment && businessCase.costBenefit.expectedReturn
                      ? calculateROI()
                      : "—"}
                  </div>
                </div>
                <LabelInput
                  label="投资回收期（年）"
                  placeholder="如：2.5"
                  value={businessCase.costBenefit.paybackPeriod}
                  onChange={v => setBusinessCase(prev => ({
                    ...prev,
                    costBenefit: { ...prev.costBenefit, paybackPeriod: v }
                  }))}
                />
              </div>
            </SectionCard>

            <SectionCard title="风险评估" icon="⚠️">
              <LabelTextarea
                label="风险概述"
                placeholder="分析项目可能面临的主要风险及应对策略..."
                value={businessCase.riskAssessment}
                onChange={v => setBusinessCase(prev => ({ ...prev, riskAssessment: v }))}
                rows={4}
              />
            </SectionCard>

            <SectionCard title="立项建议" icon="✅">
              <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
                {(["批准", "拒绝", "修改"] as const).map(rec => (
                  <button
                    key={rec}
                    onClick={() => setBusinessCase(prev => ({ ...prev, recommendation: rec }))}
                    style={{
                      flex: 1,
                      padding: "12px 16px",
                      borderRadius: 10,
                      border: `1px solid ${businessCase.recommendation === rec
                        ? rec === "批准" ? "var(--green)"
                        : rec === "拒绝" ? "var(--red)"
                        : "var(--amber)"
                        : "var(--border)"}`,
                      background: businessCase.recommendation === rec
                        ? rec === "批准" ? "rgba(34,197,94,0.15)"
                          : rec === "拒绝" ? "rgba(239,68,68,0.15)"
                          : "rgba(245,158,11,0.15)"
                        : "transparent",
                      color: businessCase.recommendation === rec
                        ? rec === "批准" ? "var(--green)"
                          : rec === "拒绝" ? "var(--red)"
                          : "var(--amber)"
                        : "var(--text2)",
                      fontWeight: 600,
                      cursor: "pointer",
                      transition: "all 0.2s",
                    }}
                  >
                    {rec === "批准" ? "✅" : rec === "拒绝" ? "❌" : "🔄"} {rec}
                  </button>
                ))}
              </div>
            </SectionCard>
            <SectionCard title="商业论证正式流转" icon="🔐">
              <div style={{ marginBottom: 12, fontSize: "0.82rem", color: "var(--text2)" }}>
                当前状态：<strong style={{ color: "var(--accent)" }}>{businessArtifact?.status || "未保存"}</strong>
                {businessArtifact ? ` · 版本 v${businessArtifact.version}` : " · 请先由项目成员保存草稿"}
              </div>
              <LabelTextarea label="审批意见" placeholder="审批、拒绝或退回修改时必填；提交草稿时可留空" value={reviewComment} onChange={setReviewComment} rows={2} />
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                <button className="btn-primary" onClick={() => void handleSaveArtifact("business")} disabled={Boolean(governanceSaving) || Boolean(businessArtifact && !["draft", "changes_requested", "rejected"].includes(businessArtifact.status))}>
                  {governanceSaving === "save_business" ? "保存中..." : businessArtifact ? "保存新版本" : "保存草稿"}
                </button>
                <button className="btn-secondary" onClick={() => void handleTransitionArtifact("business", "submit")} disabled={Boolean(governanceSaving) || businessArtifact?.status !== "draft"}>提交审批</button>
                <button className="btn-secondary" onClick={() => void handleTransitionArtifact("business", "approve")} disabled={Boolean(governanceSaving) || businessArtifact?.status !== "submitted"} style={{ color: "var(--green)" }}>批准</button>
                <button className="btn-secondary" onClick={() => void handleTransitionArtifact("business", "request_changes")} disabled={Boolean(governanceSaving) || businessArtifact?.status !== "submitted"} style={{ color: "var(--amber)" }}>退回修改</button>
                <button className="btn-secondary" onClick={() => void handleTransitionArtifact("business", "reject")} disabled={Boolean(governanceSaving) || businessArtifact?.status !== "submitted"} style={{ color: "var(--red)" }}>拒绝</button>
                <button className="btn-secondary" onClick={() => void handleTransitionArtifact("business", "revise")} disabled={Boolean(governanceSaving) || !businessArtifact || !["changes_requested", "rejected"].includes(businessArtifact.status)}>重新修订</button>
              </div>
              <div style={{ marginTop: 10, color: "var(--text2)", fontSize: "0.75rem" }}>项目成员负责输入和提交；PMO、发起人或业务负责人负责审批。所有动作均校验角色、版本并写入审计记录。</div>
            </SectionCard>
          </div>
        )}

        {/* ========================================================================== */}
        {/* Tab 3: Project Charter */}
        {/* ========================================================================== */}
        {activeTab === "charter" && (
          <div style={{ maxWidth: 900, margin: "0 auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <div>
                <h2 style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: 4 }}>📄 项目任务书</h2>
                <p style={{ fontSize: "0.8rem", color: "var(--text2)" }}>定义项目目标、范围、干系人期望和授权决策</p>
              </div>
              <AIGenerateButton
                onClick={handleAIGenerateCharter}
                label={aiLoading === "charter" ? "生成中..." : "AI生成任务书"}
              />
            </div>

            <SectionCard title="项目目标与范围" icon="🎯">
              <LabelTextarea
                label="项目目标"
                placeholder="清晰阐述项目要实现的核心目标..."
                value={projectCharter.objectives}
                onChange={v => setProjectCharter(prev => ({ ...prev, objectives: v }))}
                rows={3}
              />
              <LabelTextarea
                label="项目范围"
                placeholder="明确项目包含和不包含的内容..."
                value={projectCharter.scope}
                onChange={v => setProjectCharter(prev => ({ ...prev, scope: v }))}
                rows={3}
              />
            </SectionCard>

            <SectionCard title="关键交付物与里程碑" icon="📦">
              <LabelTextarea
                label="主要交付物"
                placeholder="列出项目的主要成果物..."
                value={projectCharter.deliverables}
                onChange={v => setProjectCharter(prev => ({ ...prev, deliverables: v }))}
                rows={3}
              />
              <LabelTextarea
                label="主要里程碑"
                placeholder="使用 Q1/Q2... 格式标注关键节点..."
                value={projectCharter.milestones}
                onChange={v => setProjectCharter(prev => ({ ...prev, milestones: v }))}
                rows={3}
              />
            </SectionCard>

            <SectionCard title="项目预算" icon="💰">
              <LabelTextarea
                label="预算摘要"
                placeholder="说明项目总预算和分阶段支付计划..."
                value={projectCharter.budget}
                onChange={v => setProjectCharter(prev => ({ ...prev, budget: v }))}
                rows={2}
              />
            </SectionCard>

            <SectionCard title="组织架构 - 铁三角" icon="🏛️">
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
                {[
                  { key: "pm", label: "项目经理", icon: "👤" },
                  { key: "solution", label: "解决方案负责人", icon: "💡" },
                  { key: "delivery", label: "交付负责人", icon: "📋" },
                ].map(item => (
                  <div key={item.key} style={{
                    background: "var(--surface2)",
                    borderRadius: 10,
                    padding: 16,
                    textAlign: "center",
                  }}>
                    <div style={{ fontSize: "1.5rem", marginBottom: 8 }}>{item.icon}</div>
                    <div style={{ fontSize: "0.75rem", color: "var(--text2)", marginBottom: 6 }}>{item.label}</div>
                    <input
                      className="input"
                      placeholder="待指定"
                      value={projectCharter.organization[item.key as keyof typeof projectCharter.organization]}
                      onChange={e => setProjectCharter(prev => ({
                        ...prev,
                        organization: { ...prev.organization, [item.key]: e.target.value }
                      }))}
                      style={{ textAlign: "center" }}
                    />
                  </div>
                ))}
              </div>
            </SectionCard>

            <SectionCard title="约束与假设" icon="⚡">
              <LabelTextarea
                label="约束条件"
                placeholder="列出项目必须遵守的限制条件..."
                value={projectCharter.constraints}
                onChange={v => setProjectCharter(prev => ({ ...prev, constraints: v }))}
                rows={2}
              />
              <LabelTextarea
                label="关键假设"
                placeholder="列出项目成功所依赖的关键假设..."
                value={projectCharter.assumptions}
                onChange={v => setProjectCharter(prev => ({ ...prev, assumptions: v }))}
                rows={2}
              />
            </SectionCard>

            <SectionCard title="签发确认" icon="✍️">
              <div style={{
                background: projectCharter.signoff.status === "approved"
                  ? "rgba(34,197,94,0.08)"
                  : projectCharter.signoff.status === "rejected"
                  ? "rgba(239,68,68,0.08)"
                  : "var(--surface2)",
                border: `1px solid ${projectCharter.signoff.status === "approved"
                  ? "rgba(34,197,94,0.3)"
                  : projectCharter.signoff.status === "rejected"
                  ? "rgba(239,68,68,0.3)"
                  : "var(--border)"}`,
                borderRadius: 12,
                padding: 24,
                textAlign: "center",
              }}>
                <div style={{ fontSize: "2rem", marginBottom: 12 }}>
                  {projectCharter.signoff.status === "approved" ? "✅" :
                   projectCharter.signoff.status === "rejected" ? "❌" : "⏳"}
                </div>
                <div style={{ fontWeight: 700, fontSize: "1rem", marginBottom: 4 }}>
                  {projectCharter.signoff.status === "approved" ? "已批准" :
                   projectCharter.signoff.status === "rejected" ? "已拒绝" : "待签发"}
                </div>
                <div style={{ fontSize: "0.8rem", color: "var(--text2)" }}>
                  请项目发起人或高层管理者确认签发
                </div>
              </div>
              <div style={{ marginTop: 16, textAlign: "left" }}>
                <div style={{ marginBottom: 10, fontSize: "0.82rem", color: "var(--text2)" }}>
                  正式状态：<strong style={{ color: "var(--accent)" }}>{charterArtifact?.status || "未保存"}</strong>
                  {charterArtifact ? ` · 版本 v${charterArtifact.version}` : ""}
                </div>
                <LabelTextarea label="签发/审批意见" placeholder="批准、拒绝或退回修改时必填" value={reviewComment} onChange={setReviewComment} rows={2} />
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  <button className="btn-primary" onClick={() => void handleSaveArtifact("charter")} disabled={Boolean(governanceSaving) || Boolean(charterArtifact && !["draft", "changes_requested", "rejected"].includes(charterArtifact.status))}>
                    {governanceSaving === "save_charter" ? "保存中..." : charterArtifact ? "保存新版本" : "保存章程草稿"}
                  </button>
                  <button className="btn-secondary" onClick={() => void handleTransitionArtifact("charter", "submit")} disabled={Boolean(governanceSaving) || charterArtifact?.status !== "draft"}>提交签发</button>
                  <button className="btn-secondary" onClick={() => void handleTransitionArtifact("charter", "approve")} disabled={Boolean(governanceSaving) || charterArtifact?.status !== "submitted"} style={{ color: "var(--green)" }}>✅ 批准签发</button>
                  <button className="btn-secondary" onClick={() => void handleTransitionArtifact("charter", "request_changes")} disabled={Boolean(governanceSaving) || charterArtifact?.status !== "submitted"} style={{ color: "var(--amber)" }}>退回修改</button>
                  <button className="btn-secondary" onClick={() => void handleTransitionArtifact("charter", "reject")} disabled={Boolean(governanceSaving) || charterArtifact?.status !== "submitted"} style={{ color: "var(--red)" }}>❌ 拒绝</button>
                  <button className="btn-secondary" onClick={() => void handleTransitionArtifact("charter", "revise")} disabled={Boolean(governanceSaving) || !charterArtifact || !["changes_requested", "rejected"].includes(charterArtifact.status)}>重新修订</button>
                </div>
                <div style={{ marginTop: 10, color: "var(--text2)", fontSize: "0.75rem" }}>只有具备当前项目审批角色的用户可签发，前端按钮不会绕过服务端权限。</div>
              </div>
            </SectionCard>
          </div>
        )}

        {/* ========================================================================== */}
        {/* Tab 4: Stakeholder Identification */}
        {/* ========================================================================== */}
        {activeTab === "stakeholder" && (
          <div style={{ maxWidth: 1000, margin: "0 auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <div>
                <h2 style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: 4 }}>👥 干系人识别</h2>
                <p style={{ fontSize: "0.8rem", color: "var(--text2)" }}>基于PMBOK干系人管理知识领域的权力-利益矩阵分析</p>
              </div>
              <a href="/stakeholder" style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                padding: "8px 16px",
                color: "var(--text2)",
                textDecoration: "none",
                fontSize: "0.8rem",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}>
                👥 完整干系人管理 →
              </a>
            </div>

            {/* Stakeholder Preview Table */}
            <SectionCard title="干系人登记册预览" icon="📋">
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: "var(--surface2)", borderBottom: "1px solid var(--border)" }}>
                      {["姓名", "角色", "权力", "利益", "所在象限"].map(h => (
                        <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontSize: "0.75rem", fontWeight: 600, color: "var(--text2)", textTransform: "uppercase" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {stakeholders.map(s => {
                      const qConfig = QUADRANT_COLORS[s.quadrant];
                      return (
                        <tr key={s.name} style={{ borderBottom: "1px solid var(--border)" }}>
                          <td style={{ padding: "10px 14px", fontWeight: 600, fontSize: "0.85rem" }}>{s.name}</td>
                          <td style={{ padding: "10px 14px", color: "var(--text2)", fontSize: "0.8rem" }}>{s.role}</td>
                          <td style={{ padding: "10px 14px" }}>
                            <span className={`tag ${s.power === "高" ? "tag-red" : s.power === "中" ? "tag-amber" : "tag-purple"}`}>
                              {s.power}
                            </span>
                          </td>
                          <td style={{ padding: "10px 14px" }}>
                            <span className={`tag ${s.interest === "高" ? "tag-green" : s.interest === "中" ? "tag-amber" : "tag-purple"}`}>
                              {s.interest}
                            </span>
                          </td>
                          <td style={{ padding: "10px 14px" }}>
                            <span style={{
                              fontSize: "0.75rem",
                              fontWeight: 600,
                              color: qConfig.color,
                              background: qConfig.bg,
                              padding: "4px 10px",
                              borderRadius: 6,
                              border: `1px solid ${qConfig.border}`,
                            }}>
                              {s.quadrant}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                    {stakeholders.length === 0 && <tr><td colSpan={5} style={{ padding: 24, textAlign: "center", color: "var(--text2)" }}>当前项目未录入干系人，或Supabase数据源不可用。</td></tr>}
                  </tbody>
                </table>
              </div>
            </SectionCard>

            {/* Power/Interest Grid */}
            <SectionCard title="权力-利益矩阵预览" icon="🎯">
              <div style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gridTemplateRows: "1fr 1fr",
                gap: 12,
                height: 320,
                marginBottom: 16,
              }}>
                {/* Y-axis label */}
                <div style={{ gridColumn: "1", gridRow: "1", display: "flex", alignItems: "flex-end", justifyContent: "center", paddingBottom: 8 }}>
                  <span style={{ writingMode: "vertical-rl", transform: "rotate(180deg)", color: "var(--text2)", fontSize: "0.75rem" }}>权力 →</span>
                </div>

                {/* Quadrants */}
                {([
                  { key: "topRight", quadrant: "重点管理" as const, isTop: true, isRight: true },
                  { key: "topLeft", quadrant: "保持满意" as const, isTop: true, isRight: false },
                  { key: "bottomRight", quadrant: "随时告知" as const, isTop: false, isRight: true },
                  { key: "bottomLeft", quadrant: "监督" as const, isTop: false, isRight: false },
                ] as const).map(({ key, quadrant, isTop, isRight }) => {
                  const config = QUADRANT_COLORS[quadrant];
                  const items = stakeholders.filter(s => s.quadrant === quadrant);
                  return (
                    <div
                      key={key}
                      style={{
                        gridColumn: isRight ? "2" : "1",
                        gridRow: isTop ? "1" : "2",
                        background: config.bg,
                        border: `1px solid ${config.border}`,
                        borderRadius: 10,
                        padding: 12,
                        display: "flex",
                        flexDirection: "column",
                        overflow: "hidden",
                      }}
                    >
                      <div style={{ marginBottom: 8 }}>
                        <div style={{ color: config.color, fontWeight: 700, fontSize: "0.8rem" }}>{config.color === "#ef4444" ? "重点管理" : quadrant}</div>
                        <div style={{ color: "var(--text2)", fontSize: "0.65rem" }}>{
                          quadrant === "重点管理" ? "高权力×高利益" :
                          quadrant === "保持满意" ? "高权力×低利益" :
                          quadrant === "随时告知" ? "低权力×高利益" : "低权力×低利益"
                        }</div>
                      </div>
                      <div style={{ flex: 1, display: "flex", flexWrap: "wrap", gap: 6, alignContent: "flex-start" }}>
                        {items.map(s => (
                          <div
                            key={s.name}
                            style={{
                              background: "var(--surface)",
                              border: "1px solid var(--border)",
                              borderRadius: 6,
                              padding: "6px 10px",
                              cursor: "pointer",
                            }}
                          >
                            <div style={{ fontWeight: 600, fontSize: "0.75rem" }}>{s.name}</div>
                          </div>
                        ))}
                        {items.length === 0 && (
                          <div style={{ color: "var(--text2)", fontSize: "0.7rem", opacity: 0.5, width: "100%", textAlign: "center", padding: 12 }}>
                            暂无
                          </div>
                        )}
                      </div>
                      <div style={{ marginTop: 6, fontSize: "0.65rem", color: "var(--text2)", borderTop: "1px solid var(--border)", paddingTop: 6 }}>
                        {items.length} 人
                      </div>
                    </div>
                  );
                })}

                {/* X-axis label */}
                <div style={{ gridColumn: "2", gridRow: "2", display: "flex", justifyContent: "center", paddingTop: 8 }}>
                  <span style={{ color: "var(--text2)", fontSize: "0.75rem" }}>← 利益 →</span>
                </div>
              </div>

              {/* Legend */}
              <div style={{ display: "flex", gap: 20, justifyContent: "center", flexWrap: "wrap" }}>
                {Object.entries(QUADRANT_COLORS).map(([quadrant, config]) => (
                  <div key={quadrant} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.75rem" }}>
                    <div style={{ width: 10, height: 10, borderRadius: 2, background: config.color, opacity: 0.7 }} />
                    <span style={{ color: "var(--text2)" }}>{quadrant}</span>
                  </div>
                ))}
              </div>
            </SectionCard>

            {/* Communication Needs Summary */}
            <SectionCard title="沟通需求摘要" icon="📡">
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                {[
                  { quadrant: "重点管理", color: QUADRANT_COLORS["重点管理"].color, freq: "每周沟通", method: "面对面/视频会议", focus: "项目进展、决策支持" },
                  { quadrant: "保持满意", color: QUADRANT_COLORS["保持满意"].color, freq: "每月汇报", method: "邮件/书面报告", focus: "成果展示、满意度维护" },
                  { quadrant: "随时告知", color: QUADRANT_COLORS["随时告知"].color, freq: "每两周沟通", method: "即时通讯/周会", focus: "需求收集、反馈收集" },
                  { quadrant: "监督", color: QUADRANT_COLORS["监督"].color, freq: "每月检查", method: "邮件/简报", focus: "状态更新" },
                ].map(item => (
                  <div key={item.quadrant} style={{
                    background: "var(--surface2)",
                    borderRadius: 8,
                    padding: 14,
                    borderLeft: `3px solid ${item.color}`,
                  }}>
                    <div style={{ fontWeight: 700, fontSize: "0.85rem", marginBottom: 8, color: item.color }}>{item.quadrant}</div>
                    <div style={{ fontSize: "0.75rem", color: "var(--text2)", display: "flex", flexDirection: "column", gap: 4 }}>
                      <div>频率: <span style={{ fontWeight: 600, color: "var(--text)" }}>{item.freq}</span></div>
                      <div>方式: <span style={{ fontWeight: 600, color: "var(--text)" }}>{item.method}</span></div>
                      <div>重点: <span style={{ fontWeight: 600, color: "var(--green)" }}>{item.focus}</span></div>
                    </div>
                  </div>
                ))}
              </div>
            </SectionCard>
          </div>
        )}

        {/* ========================================================================== */}
        {/* Tab 5: Requirements Management */}
        {/* ========================================================================== */}
        {activeTab === "requirements" && (
          <div style={{ maxWidth: 1000, margin: "0 auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <div>
                <h2 style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: 4 }}>📐 需求管理</h2>
                <p style={{ fontSize: "0.8rem", color: "var(--text2)" }}>管理项目需求清单与追溯矩阵</p>
              </div>
              <button className="btn-primary" disabled={sourceState.status !== "ready" || requirementSaving} onClick={() => { setEditingReq(null); setReqForm({ priority: "中", status: "待确认", category: "功能需求" }); setShowReqForm(true); }}>
                + 添加需求
              </button>
            </div>

            {/* Requirements Table */}
            <SectionCard title="需求清单" icon="📋">
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: "var(--surface2)", borderBottom: "1px solid var(--border)" }}>
                      {["ID", "需求描述", "类别", "优先级", "状态"].map(h => (
                        <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontSize: "0.75rem", fontWeight: 600, color: "var(--text2)", textTransform: "uppercase" }}>{h}</th>
                      ))}
                      <th style={{ padding: "10px 14px", textAlign: "left", fontSize: "0.75rem", fontWeight: 600, color: "var(--text2)", textTransform: "uppercase" }}>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {requirements.map(req => (
                      <tr key={req.id} style={{ borderBottom: "1px solid var(--border)" }}>
                        <td style={{ padding: "10px 14px", fontWeight: 600, fontSize: "0.8rem", color: "var(--accent)" }}>{req.code}</td>
                        <td style={{ padding: "10px 14px", fontSize: "0.85rem" }}>{req.description}</td>
                        <td style={{ padding: "10px 14px", fontSize: "0.8rem", color: "var(--text2)" }}>{req.category}</td>
                        <td style={{ padding: "10px 14px" }}>
                          <span className={`tag ${req.priority === "高" ? "tag-red" : req.priority === "中" ? "tag-amber" : "tag-purple"}`}>
                            {req.priority}
                          </span>
                        </td>
                        <td style={{ padding: "10px 14px" }}>
                          <span className={`tag ${
                            req.status === "已验收" ? "tag-green" :
                            req.status === "已实现" ? "tag-blue" :
                            req.status === "已确认" ? "tag-purple" : "tag-amber"
                          }`}>
                            {req.status}
                          </span>
                        </td>
                        <td style={{ padding: "10px 14px" }}>
                          <button disabled={requirementSaving} onClick={() => handleEditRequirement(req)} style={{ background: "none", border: "none", color: "var(--accent)", cursor: "pointer", fontSize: "0.8rem", marginRight: 12 }}>编辑</button>
                          <button disabled={requirementSaving} onClick={() => void handleDeleteRequirement(req.id)} style={{ background: "none", border: "none", color: "var(--red)", cursor: "pointer", fontSize: "0.8rem" }}>删除</button>
                        </td>
                      </tr>
                    ))}
                    {requirements.length === 0 && <tr><td colSpan={6} style={{ padding: 24, textAlign: "center", color: "var(--text2)" }}>当前项目暂无需求记录。新增后将保存到Supabase，刷新不丢失。</td></tr>}
                  </tbody>
                </table>
              </div>
            </SectionCard>

            {/* Traceability Matrix Preview */}
            <SectionCard title="追溯矩阵预览" icon="🔗">
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
                  <thead>
                    <tr style={{ background: "var(--surface2)", borderBottom: "1px solid var(--border)" }}>
                      {["需求ID", "来源", "设计", "实现", "测试", "验收"].map(h => (
                        <th key={h} style={{ padding: "8px 12px", textAlign: "center", fontSize: "0.7rem", fontWeight: 600, color: "var(--text2)", textTransform: "uppercase" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {requirements.slice(0, 4).map(req => (
                      <tr key={req.id} style={{ borderBottom: "1px solid var(--border)" }}>
                        <td style={{ padding: "8px 12px", fontWeight: 600, color: "var(--accent)" }}>{req.code}</td>
                        {["业务需求文档", "系统设计", "代码实现", "测试用例", "用户验收"].map((col, i) => (
                          <td key={i} style={{ padding: "8px 12px", textAlign: "center" }}>
                            <span style={{
                              display: "inline-block",
                              width: 20,
                              height: 20,
                              borderRadius: 4,
                              background: req.status === "已验收" ? "var(--green)" :
                                         req.status === "已实现" ? "#3b82f6" :
                                         req.status === "已确认" ? "#8b5cf6" : "var(--border)",
                              color: "#fff",
                              fontSize: "0.65rem",
                              lineHeight: "20px",
                              textAlign: "center",
                            }}>
                              {req.status === "已验收" ? "✓" :
                               req.status === "已实现" ? "✓" :
                               req.status === "已确认" ? "→" : "○"}
                            </span>
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ marginTop: 12, fontSize: "0.75rem", color: "var(--text2)", textAlign: "center" }}>
                图例: ○ 待确认 → 已确认 ✓ 已实现 ✓ 已验收
              </div>
            </SectionCard>

            {/* Priority Summary */}
            <SectionCard title="优先级分布" icon="📊">
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
                {[
                  { priority: "高", count: requirements.filter(r => r.priority === "高").length, color: "var(--red)", bg: "rgba(239,68,68,0.08)" },
                  { priority: "中", count: requirements.filter(r => r.priority === "中").length, color: "var(--amber)", bg: "rgba(245,158,11,0.08)" },
                  { priority: "低", count: requirements.filter(r => r.priority === "低").length, color: "var(--purple)", bg: "rgba(139,92,246,0.08)" },
                ].map(item => (
                  <div key={item.priority} style={{
                    background: item.bg,
                    borderRadius: 10,
                    padding: 20,
                    textAlign: "center",
                    border: `1px solid ${item.color}30`,
                  }}>
                    <div style={{ fontSize: "2rem", fontWeight: 700, color: item.color }}>{item.count}</div>
                    <div style={{ fontSize: "0.8rem", color: "var(--text2)", marginTop: 4 }}>{item.priority}优先级需求</div>
                  </div>
                ))}
              </div>
            </SectionCard>
          </div>
        )}

        {/* ========================================================================== */}
        {/* Requirements Form Modal */}
        {/* ========================================================================== */}
        {showReqForm && (
          <div style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0,0,0,0.7)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}>
            <div style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 16,
              padding: 32,
              width: 480,
              maxHeight: "90vh",
              overflow: "auto",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 24 }}>
                <h2 style={{ fontSize: "1.1rem", fontWeight: 700 }}>{editingReq ? "编辑需求" : "添加需求"}</h2>
                <button onClick={() => setShowReqForm(false)} style={{ background: "none", border: "none", color: "var(--text2)", cursor: "pointer", fontSize: "1.2rem" }}>×</button>
              </div>

              <LabelTextarea
                label="需求描述"
                placeholder="请输入需求描述..."
                value={reqForm.description || ""}
                onChange={v => setReqForm(prev => ({ ...prev, description: v }))}
                rows={3}
              />

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <LabelSelect
                  label="类别"
                  options={["功能需求", "非功能需求", "集成需求", "安全需求", "性能需求"]}
                  value={reqForm.category || "功能需求"}
                  onChange={v => setReqForm(prev => ({ ...prev, category: v }))}
                />
                <LabelSelect
                  label="优先级"
                  options={["高", "中", "低"]}
                  value={reqForm.priority || "中"}
                  onChange={v => setReqForm(prev => ({ ...prev, priority: v as Requirement["priority"] }))}
                />
              </div>

              <LabelSelect
                label="状态"
                options={["待确认", "已确认", "已实现", "已验收"]}
                value={reqForm.status || "待确认"}
                onChange={v => setReqForm(prev => ({ ...prev, status: v as Requirement["status"] }))}
              />

              <div style={{ display: "flex", gap: 12, marginTop: 24 }}>
                <button className="btn-primary" disabled={requirementSaving} onClick={() => void handleSaveRequirement()} style={{ flex: 1 }}>{requirementSaving ? "保存中…" : "保存"}</button>
                <button className="btn-secondary" onClick={() => setShowReqForm(false)} style={{ flex: 1 }}>取消</button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
