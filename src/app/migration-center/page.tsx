"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  buildMigrationBatchComparison,
  type MigrationBatchComparison,
} from "@/features/migration/batch-comparison";
import {
  buildMigrationFieldMappingReuseCheck,
  buildMigrationRemediationActions,
  type MigrationAnalysisResult,
} from "@/features/migration/package";
import type { MigrationFieldMappingProfileRecord } from "@/features/migration/field-mapping-repository";
import type { MigrationRemediationActionRecord, MigrationRemediationStatus } from "@/features/migration/remediation-repository";
import type { MigrationBatchRecord } from "@/features/migration/repository";
import {
  assessMigrationReadiness,
  migrationDataObjects,
  migrationReadinessAreas,
  migrationStages,
  type MigrationAreaId,
} from "@/features/migration/readiness";

const levelColor = {
  "not-ready": "var(--red)",
  "trial-ready": "var(--amber)",
  "pilot-ready": "var(--accent2)",
  "migration-ready": "var(--green)",
};

type AnalyzeResponse =
  | { status: "succeeded"; file_name: string; analysis: MigrationAnalysisResult; request_id: string }
  | { status: "rejected" | "error"; code: string; detail?: string; request_id: string };

type BatchListResponse =
  | { status: "succeeded"; batches: MigrationBatchRecord[]; request_id: string }
  | { status: "not_configured" | "failed" | "unauthorized"; batches?: MigrationBatchRecord[]; warning?: string; request_id: string };

type BatchSaveResponse =
  | { status: "succeeded"; batch: MigrationBatchRecord; request_id: string }
  | { status: "not_configured" | "failed" | "unauthorized"; warning?: string; request_id: string };

type RemediationListResponse =
  | { status: "succeeded"; actions: MigrationRemediationActionRecord[]; request_id: string }
  | { status: "not_configured" | "failed" | "unauthorized"; actions?: MigrationRemediationActionRecord[]; warning?: string; request_id: string };

type RemediationSaveResponse =
  | { status: "succeeded"; actions: MigrationRemediationActionRecord[]; request_id: string }
  | { status: "not_configured" | "failed" | "unauthorized"; warning?: string; request_id: string };

type RemediationTransitionResponse =
  | { status: "succeeded"; action: MigrationRemediationActionRecord; request_id: string }
  | { status: "not_configured" | "not_found" | "failed" | "unauthorized"; warning?: string; request_id: string };

type RemediationFeishuSyncResponse =
  | { status: "succeeded"; action: MigrationRemediationActionRecord; resource?: { taskGuid: string; url?: string }; request_id: string }
  | { status: "not_configured" | "not_found" | "failed" | "unauthorized"; action?: MigrationRemediationActionRecord; warning?: string; request_id: string; lark_cli_hint?: string };

type FieldMappingProfileListResponse =
  | { status: "succeeded"; profiles: MigrationFieldMappingProfileRecord[]; request_id: string }
  | { status: "not_configured" | "failed" | "unauthorized"; profiles?: MigrationFieldMappingProfileRecord[]; warning?: string; request_id: string };

type FieldMappingProfileSaveResponse =
  | { status: "succeeded"; profile: MigrationFieldMappingProfileRecord; request_id: string }
  | { status: "not_configured" | "failed" | "unauthorized"; warning?: string; request_id: string };

type BatchComparisonReportResponse =
  | Blob
  | { status: "failed"; warning?: string; request_id: string };

function issueColor(severity: string) {
  if (severity === "high") return "var(--red)";
  if (severity === "medium") return "var(--amber)";
  return "var(--accent2)";
}

function defaultBatchName(analysis: MigrationAnalysisResult) {
  const stamp = analysis.generatedAt.replace(/\D/g, "").slice(0, 12);
  return `${analysis.objectName}-试迁移批次-${stamp || "待命名"}`;
}

function defaultMappingProfileName(analysis: MigrationAnalysisResult) {
  const stamp = analysis.generatedAt.replace(/\D/g, "").slice(0, 12);
  return `${analysis.objectName}-字段映射方案-${stamp || "待命名"}`;
}

export default function MigrationCenterPage() {
  const [selectedAreaIds, setSelectedAreaIds] = useState<MigrationAreaId[]>([
    "process-coverage",
    "data-portability",
    "security",
  ]);
  const [objectName, setObjectName] = useState(migrationDataObjects[0]?.name ?? "项目台账");
  const [file, setFile] = useState<File | null>(null);
  const [analysis, setAnalysis] = useState<MigrationAnalysisResult | null>(null);
  const [analyzeError, setAnalyzeError] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [batchName, setBatchName] = useState("");
  const [batches, setBatches] = useState<MigrationBatchRecord[]>([]);
  const [batchWarning, setBatchWarning] = useState("");
  const [saveError, setSaveError] = useState("");
  const [saveMessage, setSaveMessage] = useState("");
  const [savingBatch, setSavingBatch] = useState(false);
  const [loadingBatches, setLoadingBatches] = useState(true);
  const [reportError, setReportError] = useState("");
  const [downloadingReport, setDownloadingReport] = useState(false);
  const [persistedActions, setPersistedActions] = useState<MigrationRemediationActionRecord[]>([]);
  const [actionWarning, setActionWarning] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [savingActions, setSavingActions] = useState(false);
  const [transitioningActionId, setTransitioningActionId] = useState("");
  const [syncingActionId, setSyncingActionId] = useState("");
  const [loadingActions, setLoadingActions] = useState(true);
  const [mappingProfiles, setMappingProfiles] = useState<MigrationFieldMappingProfileRecord[]>([]);
  const [mappingWarning, setMappingWarning] = useState("");
  const [mappingMessage, setMappingMessage] = useState("");
  const [mappingProfileName, setMappingProfileName] = useState("");
  const [mappingProfileNotes, setMappingProfileNotes] = useState("");
  const [savingMappingProfile, setSavingMappingProfile] = useState(false);
  const [loadingMappings, setLoadingMappings] = useState(true);
  const [selectedMappingProfileId, setSelectedMappingProfileId] = useState("");
  const [downloadingComparisonReport, setDownloadingComparisonReport] = useState(false);
  const [comparisonReportError, setComparisonReportError] = useState("");

  const result = useMemo(() => assessMigrationReadiness(selectedAreaIds), [selectedAreaIds]);
  const remediationActions = useMemo(() => analysis ? buildMigrationRemediationActions(analysis) : [], [analysis]);
  const selectedMappingProfile = useMemo(
    () => mappingProfiles.find(profile => profile.id === selectedMappingProfileId) ?? mappingProfiles[0] ?? null,
    [mappingProfiles, selectedMappingProfileId],
  );
  const mappingReuseCheck = useMemo(
    () => analysis && selectedMappingProfile ? buildMigrationFieldMappingReuseCheck(selectedMappingProfile, analysis) : null,
    [analysis, selectedMappingProfile],
  );
  const batchComparison = useMemo(
    () => buildMigrationBatchComparison({ objectName, batches, remediationActions: persistedActions }),
    [objectName, batches, persistedActions],
  );

  useEffect(() => {
    let active = true;
    async function loadInitialData() {
      setLoadingBatches(true);
      setLoadingActions(true);
      try {
        const [batchResponse, actionResponse] = await Promise.all([
          fetch("/api/migration/batches", { cache: "no-store" }),
          fetch("/api/migration/remediation-actions", { cache: "no-store" }),
        ]);
        const payload = await batchResponse.json() as BatchListResponse;
        const actionPayload = await actionResponse.json() as RemediationListResponse;
        if (!active) return;
        if (payload.status === "succeeded") {
          setBatches(payload.batches);
          setBatchWarning("");
        } else {
          setBatches(payload.batches ?? []);
          setBatchWarning(payload.warning || "迁移批次历史暂不可用。");
        }
        if (actionPayload.status === "succeeded") {
          setPersistedActions(actionPayload.actions);
          setActionWarning("");
        } else {
          setPersistedActions(actionPayload.actions ?? []);
          setActionWarning(actionPayload.warning || "迁移整改行动项暂不可用。");
        }
      } catch {
        if (active) {
          setBatchWarning("读取迁移批次历史失败。");
          setActionWarning("读取迁移整改行动项失败。");
        }
      } finally {
        if (active) {
          setLoadingBatches(false);
          setLoadingActions(false);
        }
      }
    }
    void loadInitialData();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    async function loadMappingProfiles() {
      setLoadingMappings(true);
      try {
        const response = await fetch(`/api/migration/field-mappings?objectName=${encodeURIComponent(objectName)}`, { cache: "no-store" });
        const payload = await response.json() as FieldMappingProfileListResponse;
        if (!active) return;
        if (payload.status === "succeeded") {
          setMappingProfiles(payload.profiles);
          setSelectedMappingProfileId(payload.profiles[0]?.id ?? "");
          setMappingWarning("");
        } else {
          setMappingProfiles(payload.profiles ?? []);
          setSelectedMappingProfileId("");
          setMappingWarning(payload.warning || "字段映射方案库暂不可用。");
        }
      } catch {
        if (active) {
          setMappingProfiles([]);
          setSelectedMappingProfileId("");
          setMappingWarning("读取字段映射方案失败。");
        }
      } finally {
        if (active) setLoadingMappings(false);
      }
    }
    void loadMappingProfiles();
    return () => {
      active = false;
    };
  }, [objectName]);

  function toggleArea(id: MigrationAreaId) {
    setSelectedAreaIds(current =>
      current.includes(id) ? current.filter(item => item !== id) : [...current, id]
    );
  }

  async function submitTrialMigration(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAnalyzeError("");
    setAnalysis(null);
    setSaveError("");
    setSaveMessage("");
    setReportError("");
    setActionMessage("");
    if (!file) {
      setAnalyzeError("请先选择一个 xlsx、xls 或 csv 文件。");
      return;
    }
    setAnalyzing(true);
    try {
      const formData = new FormData();
      formData.append("objectName", objectName);
      formData.append("file", file);
      const response = await fetch("/api/migration/analyze", { method: "POST", body: formData });
      const payload = await response.json() as AnalyzeResponse;
      if (payload.status !== "succeeded") {
        setAnalyzeError(payload.detail || "试迁移分析失败，请检查文件格式和字段。");
        return;
      }
      setAnalysis(payload.analysis);
      setBatchName(defaultBatchName(payload.analysis));
      setMappingProfileName(defaultMappingProfileName(payload.analysis));
      setMappingProfileNotes("");
    } catch {
      setAnalyzeError("试迁移分析失败，请稍后重试。");
    } finally {
      setAnalyzing(false);
    }
  }

  async function saveCurrentFieldMappingProfile() {
    if (!analysis) return;
    setSavingMappingProfile(true);
    setMappingMessage("");
    setMappingWarning("");
    try {
      const response = await fetch("/api/migration/field-mappings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profileName: mappingProfileName.trim() || defaultMappingProfileName(analysis),
          analysis,
          notes: mappingProfileNotes,
        }),
      });
      const payload = await response.json() as FieldMappingProfileSaveResponse;
      if (payload.status !== "succeeded") {
        setMappingWarning(payload.warning || "保存字段映射方案失败。");
        return;
      }
      setMappingProfiles(current => [payload.profile, ...current.filter(item => item.id !== payload.profile.id)].slice(0, 30));
      setSelectedMappingProfileId(payload.profile.id);
      setMappingMessage(`已保存字段映射方案：${payload.profile.profileName}`);
    } catch {
      setMappingWarning("保存字段映射方案失败，请稍后重试。");
    } finally {
      setSavingMappingProfile(false);
    }
  }

  async function saveCurrentRemediationActions() {
    if (!analysis || remediationActions.length === 0) return;
    setSavingActions(true);
    setActionMessage("");
    setActionWarning("");
    try {
      const response = await fetch("/api/migration/remediation-actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          batchName: batchName.trim() || defaultBatchName(analysis),
          objectName: analysis.objectName,
          actions: remediationActions,
        }),
      });
      const payload = await response.json() as RemediationSaveResponse;
      if (payload.status !== "succeeded") {
        setActionWarning(payload.warning || "保存迁移整改行动项失败。");
        return;
      }
      setPersistedActions(current => [...payload.actions, ...current].slice(0, 50));
      setActionMessage(`已保存${payload.actions.length}项迁移整改行动项。`);
    } catch {
      setActionWarning("保存迁移整改行动项失败，请稍后重试。");
    } finally {
      setSavingActions(false);
    }
  }

  async function transitionRemediationAction(actionId: string, status: MigrationRemediationStatus) {
    setTransitioningActionId(actionId);
    setActionMessage("");
    setActionWarning("");
    try {
      const response = await fetch("/api/migration/remediation-actions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: actionId,
          status,
          closureNote: status === "已关闭" ? "已按验收标准完成整改并通过复检。" : null,
          reviewResult: status === "已关闭" ? "复检通过" : null,
        }),
      });
      const payload = await response.json() as RemediationTransitionResponse;
      if (payload.status !== "succeeded") {
        setActionWarning(payload.warning || "流转迁移整改行动项失败。");
        return;
      }
      setPersistedActions(current => current.map(item => item.id === payload.action.id ? payload.action : item));
      setActionMessage(`已流转：${payload.action.title} / ${payload.action.status}`);
    } catch {
      setActionWarning("流转迁移整改行动项失败，请稍后重试。");
    } finally {
      setTransitioningActionId("");
    }
  }

  async function syncRemediationActionToFeishu(action: MigrationRemediationActionRecord, mode: "prepare" | "confirm") {
    if (mode === "confirm") {
      const confirmed = window.confirm(`确认将整改项写入飞书任务？\n\n${action.title}\n责任：${action.ownerName || action.ownerRole}\n截止：${action.dueDate || "未设置"}`);
      if (!confirmed) return;
    }
    setSyncingActionId(action.id);
    setActionMessage("");
    setActionWarning("");
    try {
      const response = await fetch("/api/migration/remediation-actions/feishu-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: action.id,
          mode,
          confirm: mode === "confirm",
        }),
      });
      const payload = await response.json() as RemediationFeishuSyncResponse;
      if (payload.action) {
        setPersistedActions(current => current.map(item => item.id === payload.action?.id ? payload.action : item));
      }
      if (payload.status !== "succeeded") {
        setActionWarning([payload.warning || "飞书任务同步失败。", payload.lark_cli_hint].filter(Boolean).join(" "));
        return;
      }
      setActionMessage(mode === "prepare"
        ? `已进入待确认队列：${payload.action.title}`
        : `已写入飞书任务：${payload.action.feishuTaskGuid || payload.resource?.taskGuid || payload.action.title}`);
    } catch {
      setActionWarning("飞书任务同步失败，请稍后重试。");
    } finally {
      setSyncingActionId("");
    }
  }

  async function saveCurrentBatch() {
    if (!analysis) return;
    setSavingBatch(true);
    setSaveError("");
    setSaveMessage("");
    try {
      const response = await fetch("/api/migration/batches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          batchName: batchName.trim() || defaultBatchName(analysis),
          fileName: file?.name ?? null,
          analysis,
        }),
      });
      const payload = await response.json() as BatchSaveResponse;
      if (payload.status !== "succeeded") {
        const warning = payload.warning || "保存迁移批次失败。";
        if (payload.status === "not_configured") setBatchWarning(warning);
        setSaveError(warning);
        return;
      }
      setBatches(current => [payload.batch, ...current.filter(item => item.id !== payload.batch.id)].slice(0, 20));
      setBatchWarning("");
      setSaveMessage(`已保存迁移批次：${payload.batch.batchName}`);
    } catch {
      setSaveError("保存迁移批次失败，请稍后重试。");
    } finally {
      setSavingBatch(false);
    }
  }

  async function downloadReviewReport() {
    if (!analysis) return;
    setDownloadingReport(true);
    setReportError("");
    try {
      const reportTitle = batchName.trim() || defaultBatchName(analysis);
      const response = await fetch("/api/migration/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          batchName: reportTitle,
          fileName: file?.name ?? null,
          analysis,
        }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { warning?: string } | null;
        setReportError(payload?.warning || "下载迁移评审报告失败。");
        return;
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${reportTitle.replace(/[\\/:*?"<>|\r\n]/g, "-")}.md`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch {
      setReportError("下载迁移评审报告失败，请稍后重试。");
    } finally {
      setDownloadingReport(false);
    }
  }

  async function downloadBatchComparisonReport(comparison: MigrationBatchComparison) {
    setDownloadingComparisonReport(true);
    setComparisonReportError("");
    try {
      const response = await fetch("/api/migration/batch-comparison/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comparison }),
      });
      if (!response.ok) {
        const payload = await response.json() as Exclude<BatchComparisonReportResponse, Blob>;
        setComparisonReportError(payload.warning || "下载批次对比报告失败。");
        return;
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${comparison.objectName}-试迁移批次对比报告.md`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch {
      setComparisonReportError("下载批次对比报告失败，请稍后重试。");
    } finally {
      setDownloadingComparisonReport(false);
    }
  }

  return (
    <main style={{ minHeight: "100vh", background: "var(--bg)", padding: "28px 32px" }}>
      <div style={{ maxWidth: 1220, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", marginBottom: 22 }}>
          <div>
            <Link href="/" style={{ color: "var(--accent2)", textDecoration: "none", fontSize: "0.86rem" }}>← 返回首页</Link>
            <h1 style={{ fontSize: "1.9rem", fontWeight: 850, marginTop: 12 }}>迁移与数据接入中心</h1>
            <p style={{ color: "var(--text2)", lineHeight: 1.7, marginTop: 8, maxWidth: 760 }}>
              面向竞品A忠实用户的迁移工作台：先确认流程不断点、数据可迁移、AI可信、权限安全，再决定是否进入试点或正式切换。
            </p>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <Link href="/integration-center" className="btn-secondary" style={{ textDecoration: "none" }}>数据与集成</Link>
            <Link href="/dashboard" className="btn-secondary" style={{ textDecoration: "none" }}>项目看板导入</Link>
            <Link href="/templates" className="btn-secondary" style={{ textDecoration: "none" }}>模板中心</Link>
          </div>
        </div>

        <section style={{ display: "grid", gridTemplateColumns: "minmax(280px, 0.9fr) minmax(0, 1.5fr)", gap: 16, alignItems: "start", marginBottom: 18 }}>
          <div className="card" style={{ position: "sticky", top: 18 }}>
            <div className="section-title">迁移成熟度</div>
            <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: 16, alignItems: "center" }}>
              <div
                aria-label={`迁移成熟度评分 ${result.score}`}
                style={{
                  width: 120,
                  height: 120,
                  borderRadius: "50%",
                  display: "grid",
                  placeItems: "center",
                  border: `10px solid ${levelColor[result.level]}55`,
                  background: `radial-gradient(circle, ${levelColor[result.level]}22, transparent 66%)`,
                  color: levelColor[result.level],
                  fontSize: "1.7rem",
                  fontWeight: 900,
                }}
              >
                {result.score}
              </div>
              <div>
                <strong style={{ fontSize: "1.15rem", color: levelColor[result.level] }}>{result.levelName}</strong>
                <p style={{ color: "var(--text2)", lineHeight: 1.7, marginTop: 8 }}>{result.summary}</p>
              </div>
            </div>
            <div style={{ marginTop: 18, display: "grid", gap: 10 }}>
              {result.recommendedNextActions.map(action => (
                <div key={action} style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 10, padding: 12, color: "var(--accent2)", fontSize: "0.84rem", lineHeight: 1.6 }}>
                  {action}
                </div>
              ))}
            </div>
            <p style={{ color: "var(--text2)", fontSize: "0.78rem", lineHeight: 1.6, marginTop: 14 }}>
              评分用于迁移决策，不写入数据库。后续可接入真实导入日志、字段映射结果和用户试点评分。
            </p>
          </div>

          <div className="card">
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 12 }}>
              <div>
                <div className="section-title">永久迁移条件检查</div>
                <p style={{ color: "var(--text2)", fontSize: "0.84rem", lineHeight: 1.6 }}>
                  勾选已经被真实项目验证过的条件，系统会给出当前迁移阶段建议。
                </p>
              </div>
              <span className="tag tag-blue">{selectedAreaIds.length}/{migrationReadinessAreas.length} 已验证</span>
            </div>

            <div style={{ display: "grid", gap: 12 }}>
              {migrationReadinessAreas.map(area => {
                const checked = selectedAreaIds.includes(area.id);
                return (
                  <label
                    key={area.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "auto 1fr auto",
                      gap: 12,
                      alignItems: "start",
                      border: `1px solid ${checked ? "rgba(56,189,248,0.48)" : "var(--border)"}`,
                      background: checked ? "rgba(56,189,248,0.08)" : "var(--surface2)",
                      borderRadius: 12,
                      padding: 14,
                      cursor: "pointer",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleArea(area.id)}
                      style={{ marginTop: 4 }}
                      aria-label={`是否已验证${area.name}`}
                    />
                    <span>
                      <span style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <strong>{area.name}</strong>
                        <span className="tag">{area.owner}</span>
                        <span className="tag tag-blue">{area.weight}分</span>
                      </span>
                      <span style={{ display: "block", color: "var(--text2)", fontSize: "0.82rem", lineHeight: 1.65, marginTop: 8 }}>
                        {area.whyItMatters}
                      </span>
                      <span style={{ display: "block", color: "var(--green)", fontSize: "0.82rem", lineHeight: 1.65, marginTop: 8 }}>
                        用户迁移证据：{area.userProof}
                      </span>
                      <span style={{ display: "block", color: "var(--accent2)", fontSize: "0.82rem", lineHeight: 1.65, marginTop: 8 }}>
                        下一步：{area.nextAction}
                      </span>
                    </span>
                    <span className={checked ? "tag tag-green" : "tag tag-amber"}>{checked ? "已验证" : "待验证"}</span>
                  </label>
                );
              })}
            </div>
          </div>
        </section>

        <section className="card" style={{ marginBottom: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", marginBottom: 14 }}>
            <div>
              <div className="section-title">试迁移作业台</div>
              <p style={{ color: "var(--text2)", lineHeight: 1.7, fontSize: "0.84rem" }}>
                用小批量竞品A导出数据做试跑：先生成字段映射与质量报告；确认后可保存字段映射方案和迁移批次历史，仍不会自动写入飞书业务表。
              </p>
            </div>
            <a href="/api/migration/template" className="btn-secondary" style={{ textDecoration: "none", whiteSpace: "nowrap" }}>
              下载迁移模板
            </a>
          </div>

          <form onSubmit={submitTrialMigration} style={{ display: "grid", gridTemplateColumns: "minmax(220px, 0.8fr) minmax(260px, 1fr) auto", gap: 12, alignItems: "end", marginBottom: 14 }}>
            <label style={{ display: "grid", gap: 8, color: "var(--text2)", fontSize: "0.82rem" }}>
              数据对象
              <select className="input" value={objectName} onChange={event => setObjectName(event.target.value)} aria-label="选择迁移数据对象">
                {migrationDataObjects.map(object => <option key={object.name} value={object.name}>{object.name}</option>)}
              </select>
            </label>
            <label style={{ display: "grid", gap: 8, color: "var(--text2)", fontSize: "0.82rem" }}>
              试迁移文件
              <input className="input" type="file" accept=".xlsx,.xls,.csv" onChange={event => setFile(event.target.files?.[0] ?? null)} />
            </label>
            <button className="btn-primary" type="submit" disabled={analyzing} style={{ minHeight: 42 }}>
              {analyzing ? "分析中..." : "生成质量报告"}
            </button>
          </form>

          {analyzeError && (
            <div style={{ border: "1px solid rgba(248,113,113,0.48)", background: "rgba(248,113,113,0.08)", color: "var(--red)", borderRadius: 12, padding: 12, marginBottom: 14 }}>
              {analyzeError}
            </div>
          )}

          {!analysis ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
              {[
                ["1", "下载模板", "按数据对象准备中文字段模板，或直接上传竞品A导出的 xlsx/csv。"],
                ["2", "上传小样本", "建议先用 20-50 条真实数据试跑，不要一开始导入全量历史数据。"],
                ["3", "修正质量问题", "根据字段覆盖、重复编号、金额/日期异常和高风险动作缺失修正数据。"],
              ].map(([index, title, desc]) => (
                <div key={index} style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 12, padding: 14 }}>
                  <span className="tag tag-blue">步骤 {index}</span>
                  <h2 style={{ fontSize: "0.95rem", marginTop: 10 }}>{title}</h2>
                  <p style={{ color: "var(--text2)", lineHeight: 1.65, fontSize: "0.8rem", marginTop: 6 }}>{desc}</p>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ display: "grid", gap: 14 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
                <div style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 12, padding: 14 }}>
                  <div style={{ color: "var(--text2)", fontSize: "0.78rem" }}>数据对象</div>
                  <strong style={{ fontSize: "1.05rem" }}>{analysis.objectName}</strong>
                </div>
                <div style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 12, padding: 14 }}>
                  <div style={{ color: "var(--text2)", fontSize: "0.78rem" }}>样本行数</div>
                  <strong style={{ fontSize: "1.05rem" }}>{analysis.totalRows}</strong>
                </div>
                <div style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 12, padding: 14 }}>
                  <div style={{ color: "var(--text2)", fontSize: "0.78rem" }}>字段覆盖率</div>
                  <strong style={{ fontSize: "1.05rem", color: analysis.fieldCoverage.missing === 0 ? "var(--green)" : "var(--amber)" }}>
                    {analysis.fieldCoverage.rate}%
                  </strong>
                  <p style={{ color: "var(--text2)", fontSize: "0.76rem", marginTop: 4 }}>
                    {analysis.fieldCoverage.matched}/{analysis.fieldCoverage.required} 已匹配
                  </p>
                </div>
                <div style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 12, padding: 14 }}>
                  <div style={{ color: "var(--text2)", fontSize: "0.78rem" }}>试迁移状态</div>
                  <strong style={{ fontSize: "1.05rem", color: analysis.canTrialImport ? "var(--green)" : "var(--red)" }}>
                    {analysis.canTrialImport ? "可进入试迁移" : "需先修正"}
                  </strong>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.2fr) minmax(280px, 0.8fr)", gap: 14, alignItems: "start" }}>
                <div style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 12, padding: 14, overflowX: "auto" }}>
                  <h2 style={{ fontSize: "0.95rem", marginBottom: 10 }}>字段映射结果</h2>
                  <table style={{ width: "100%", minWidth: 620, borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ textAlign: "left", color: "var(--text2)", fontSize: "0.76rem" }}>
                        <th style={{ padding: "8px", borderBottom: "1px solid var(--border)" }}>目标字段</th>
                        <th style={{ padding: "8px", borderBottom: "1px solid var(--border)" }}>来源字段</th>
                        <th style={{ padding: "8px", borderBottom: "1px solid var(--border)" }}>状态</th>
                        <th style={{ padding: "8px", borderBottom: "1px solid var(--border)" }}>说明</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analysis.mappings.map(mapping => (
                        <tr key={mapping.targetField}>
                          <td style={{ padding: "9px 8px", borderBottom: "1px solid var(--border)", fontWeight: 800 }}>{mapping.targetField}</td>
                          <td style={{ padding: "9px 8px", borderBottom: "1px solid var(--border)", color: "var(--text2)" }}>{mapping.sourceField || "-"}</td>
                          <td style={{ padding: "9px 8px", borderBottom: "1px solid var(--border)" }}>
                            <span className={mapping.status === "missing" ? "tag tag-amber" : mapping.status === "alias" ? "tag tag-blue" : "tag tag-green"}>
                              {mapping.status === "missing" ? "缺失" : mapping.status === "alias" ? "别名匹配" : "直接匹配"}
                            </span>
                          </td>
                          <td style={{ padding: "9px 8px", borderBottom: "1px solid var(--border)", color: "var(--text2)", fontSize: "0.78rem" }}>{mapping.note}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div style={{ marginTop: 14, display: "grid", gap: 10, borderTop: "1px solid var(--border)", paddingTop: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                      <h3 style={{ fontSize: "0.9rem", margin: 0 }}>保存字段映射方案</h3>
                      <span className="tag tag-blue">来源字段 {analysis.sourceFields?.length ?? 0} 个</span>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "minmax(180px, 1fr) minmax(220px, 1.2fr)", gap: 10 }}>
                      <label style={{ display: "grid", gap: 6, color: "var(--text2)", fontSize: "0.78rem" }}>
                        方案名称
                        <input
                          className="input"
                          value={mappingProfileName}
                          onChange={event => setMappingProfileName(event.target.value)}
                          placeholder="例如：项目台账-竞品A导出字段方案"
                        />
                      </label>
                      <label style={{ display: "grid", gap: 6, color: "var(--text2)", fontSize: "0.78rem" }}>
                        备注
                        <input
                          className="input"
                          value={mappingProfileNotes}
                          onChange={event => setMappingProfileNotes(event.target.value)}
                          placeholder="记录来源系统、适用范围或人工确认意见"
                        />
                      </label>
                    </div>
                    <button className="btn-secondary" type="button" onClick={saveCurrentFieldMappingProfile} disabled={savingMappingProfile} style={{ width: "100%" }}>
                      {savingMappingProfile ? "保存中..." : "保存字段映射方案"}
                    </button>
                    {mappingMessage && <p style={{ color: "var(--green)", lineHeight: 1.6, fontSize: "0.8rem", margin: 0 }}>{mappingMessage}</p>}
                    {mappingWarning && <p style={{ color: "var(--amber)", lineHeight: 1.6, fontSize: "0.8rem", margin: 0 }}>{mappingWarning}</p>}
                  </div>
                </div>

                <div style={{ display: "grid", gap: 12 }}>
                  <div style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 12, padding: 14 }}>
                    <h2 style={{ fontSize: "0.95rem", marginBottom: 10 }}>质量问题</h2>
                    {analysis.qualityIssues.length === 0 ? (
                      <p style={{ color: "var(--green)", lineHeight: 1.6, fontSize: "0.82rem" }}>未发现基础质量问题。</p>
                    ) : (
                      <div style={{ display: "grid", gap: 10 }}>
                        {analysis.qualityIssues.map(item => (
                          <div key={item.id} style={{ borderTop: "1px solid var(--border)", paddingTop: 10 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                              <strong style={{ color: issueColor(item.severity) }}>{item.title}</strong>
                              <span className="tag">{item.affectedCount}项</span>
                            </div>
                            {item.sampleRefs.length > 0 && <p style={{ color: "var(--text2)", fontSize: "0.78rem", lineHeight: 1.5, marginTop: 6 }}>样例：{item.sampleRefs.join("、")}</p>}
                            <p style={{ color: "var(--accent2)", fontSize: "0.78rem", lineHeight: 1.5, marginTop: 6 }}>{item.recommendation}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 12, padding: 14 }}>
                    <h2 style={{ fontSize: "0.95rem", marginBottom: 10 }}>下一步动作</h2>
                    <ul style={{ margin: "0 0 0 18px", color: "var(--accent2)", lineHeight: 1.7, fontSize: "0.82rem" }}>
                      {analysis.nextActions.map(action => <li key={action}>{action}</li>)}
                    </ul>
                  </div>

                  <div style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 12, padding: 14 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", marginBottom: 10 }}>
                      <h2 style={{ fontSize: "0.95rem", margin: 0 }}>整改行动项</h2>
                      <span className="tag tag-blue">{remediationActions.length}项</span>
                    </div>
                    <div style={{ display: "grid", gap: 10 }}>
                      {remediationActions.map(action => (
                        <div key={action.id} style={{ borderTop: "1px solid var(--border)", paddingTop: 10 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
                            <strong style={{ fontSize: "0.84rem", lineHeight: 1.5 }}>{action.title}</strong>
                            <span className={action.priority === "P0" ? "tag tag-red" : action.priority === "P1" ? "tag tag-amber" : "tag"}>
                              {action.priority}
                            </span>
                          </div>
                          <p style={{ color: "var(--text2)", lineHeight: 1.55, fontSize: "0.76rem", marginTop: 6 }}>
                            责任角色：{action.ownerRole} · 建议截止：{action.dueDate} · 状态：{action.status}
                          </p>
                          <p style={{ color: "var(--green)", lineHeight: 1.55, fontSize: "0.76rem", marginTop: 6 }}>
                            验收标准：{action.acceptanceCriteria}
                          </p>
                        </div>
                      ))}
                    </div>
                    <button
                      className="btn-secondary"
                      type="button"
                      onClick={saveCurrentRemediationActions}
                      disabled={savingActions}
                      style={{ width: "100%", marginTop: 12 }}
                    >
                      {savingActions ? "保存中..." : "保存整改行动项"}
                    </button>
                    {actionMessage && <p style={{ color: "var(--green)", lineHeight: 1.6, fontSize: "0.8rem", marginTop: 8 }}>{actionMessage}</p>}
                    {actionWarning && <p style={{ color: "var(--amber)", lineHeight: 1.6, fontSize: "0.8rem", marginTop: 8 }}>{actionWarning}</p>}
                  </div>

                  <div style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 12, padding: 14 }}>
                    <h2 style={{ fontSize: "0.95rem", marginBottom: 10 }}>保存迁移批次</h2>
                    <label style={{ display: "grid", gap: 8, color: "var(--text2)", fontSize: "0.82rem" }}>
                      批次名称
                      <input
                        className="input"
                        value={batchName}
                        onChange={event => setBatchName(event.target.value)}
                        placeholder="例如：项目台账-第一轮试迁移"
                        aria-label="迁移批次名称"
                      />
                    </label>
                    <button
                      className="btn-primary"
                      type="button"
                      onClick={saveCurrentBatch}
                      disabled={savingBatch}
                      style={{ width: "100%", marginTop: 10 }}
                    >
                      {savingBatch ? "保存中..." : "保存为迁移批次"}
                    </button>
                    {saveMessage && <p style={{ color: "var(--green)", lineHeight: 1.6, fontSize: "0.8rem", marginTop: 8 }}>{saveMessage}</p>}
                    {saveError && <p style={{ color: "var(--red)", lineHeight: 1.6, fontSize: "0.8rem", marginTop: 8 }}>{saveError}</p>}
                  </div>

                  <div style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 12, padding: 14 }}>
                    <h2 style={{ fontSize: "0.95rem", marginBottom: 10 }}>输出评审成果</h2>
                    <p style={{ color: "var(--text2)", lineHeight: 1.6, fontSize: "0.8rem", marginBottom: 10 }}>
                      下载 Markdown 评审报告，包含字段映射确认表、质量问题修复清单、阶段门结论和签字栏，可直接进入迁移评审会议。
                    </p>
                    <button
                      className="btn-secondary"
                      type="button"
                      onClick={downloadReviewReport}
                      disabled={downloadingReport}
                      style={{ width: "100%" }}
                    >
                      {downloadingReport ? "生成报告中..." : "下载评审报告/修复清单"}
                    </button>
                    {reportError && <p style={{ color: "var(--red)", lineHeight: 1.6, fontSize: "0.8rem", marginTop: 8 }}>{reportError}</p>}
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>

        <section className="card" style={{ marginBottom: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", marginBottom: 12 }}>
            <div>
              <div className="section-title">试迁移批次对比与问题关闭率</div>
              <p style={{ color: "var(--text2)", lineHeight: 1.6, fontSize: "0.84rem" }}>
                对当前数据对象的多轮试迁移批次做趋势判断：字段覆盖率是否提升、质量问题是否减少、高优先级问题是否关闭，以及整改行动项关闭率是否达到正式迁移条件。
              </p>
            </div>
            <span className={batchComparison.goNoGo === "Go" ? "tag tag-green" : batchComparison.goNoGo === "Conditional Go" ? "tag tag-blue" : batchComparison.goNoGo === "No-Go" ? "tag tag-red" : "tag"}>
              {batchComparison.goNoGo}
            </span>
          </div>

          {batchComparison.snapshots.length === 0 ? (
            <div style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 12, padding: 16 }}>
              <strong>暂无可对比批次</strong>
              <p style={{ color: "var(--text2)", lineHeight: 1.6, fontSize: "0.82rem", marginTop: 6 }}>
                当前数据对象「{objectName}」还没有历史试迁移批次。先上传样本并保存为迁移批次后，系统会自动生成趋势对比。
              </p>
            </div>
          ) : (
            <div style={{ display: "grid", gap: 12 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }}>
                {[
                  ["批次数", `${batchComparison.snapshots.length}`, "同一数据对象历史轮次"],
                  ["最新覆盖率", `${batchComparison.snapshots.at(-1)?.fieldCoverageRate ?? 0}%`, "目标至少95%"],
                  ["高优先级问题", `${batchComparison.snapshots.at(-1)?.highIssueCount ?? 0}`, "正式迁移前应为0"],
                  ["整改关闭率", `${batchComparison.snapshots.at(-1)?.remediationClosureRate ?? 0}%`, "目标至少80%"],
                ].map(([label, value, hint]) => (
                  <div key={label} style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 12, padding: 14 }}>
                    <div style={{ color: "var(--text2)", fontSize: "0.76rem" }}>{label}</div>
                    <strong style={{ fontSize: "1.1rem" }}>{value}</strong>
                    <p style={{ color: "var(--text2)", fontSize: "0.74rem", marginTop: 4 }}>{hint}</p>
                  </div>
                ))}
              </div>

              <div style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 12, padding: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                  <strong>趋势摘要</strong>
                  {batchComparison.deltas.at(-1) && (
                    <span className={batchComparison.deltas.at(-1)?.verdict === "改善" ? "tag tag-green" : batchComparison.deltas.at(-1)?.verdict === "退化" ? "tag tag-red" : "tag"}>
                      最近一轮：{batchComparison.deltas.at(-1)?.verdict}
                    </span>
                  )}
                </div>
                <p style={{ color: "var(--text2)", lineHeight: 1.65, fontSize: "0.82rem", marginTop: 8 }}>{batchComparison.summary}</p>
                <ul style={{ margin: "8px 0 0 18px", color: "var(--accent2)", lineHeight: 1.65, fontSize: "0.8rem" }}>
                  {batchComparison.nextActions.map(action => <li key={action}>{action}</li>)}
                </ul>
              </div>

              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 980 }}>
                  <thead>
                    <tr style={{ color: "var(--text2)", textAlign: "left", fontSize: "0.78rem" }}>
                      <th style={{ padding: "10px 8px", borderBottom: "1px solid var(--border)" }}>批次</th>
                      <th style={{ padding: "10px 8px", borderBottom: "1px solid var(--border)" }}>覆盖率</th>
                      <th style={{ padding: "10px 8px", borderBottom: "1px solid var(--border)" }}>质量问题</th>
                      <th style={{ padding: "10px 8px", borderBottom: "1px solid var(--border)" }}>高优先级</th>
                      <th style={{ padding: "10px 8px", borderBottom: "1px solid var(--border)" }}>整改关闭率</th>
                      <th style={{ padding: "10px 8px", borderBottom: "1px solid var(--border)" }}>相对上一轮</th>
                    </tr>
                  </thead>
                  <tbody>
                    {batchComparison.snapshots.map(snapshot => {
                      const delta = batchComparison.deltas.find(item => item.batchId === snapshot.batchId);
                      return (
                        <tr key={snapshot.batchId}>
                          <td style={{ padding: "12px 8px", borderBottom: "1px solid var(--border)", fontWeight: 800 }}>
                            {snapshot.batchName}
                            <div style={{ color: "var(--text2)", fontSize: "0.74rem", marginTop: 4 }}>{snapshot.createdAt.slice(0, 10)} · {snapshot.totalRows}行</div>
                          </td>
                          <td style={{ padding: "12px 8px", borderBottom: "1px solid var(--border)" }}>{snapshot.fieldCoverageRate}%</td>
                          <td style={{ padding: "12px 8px", borderBottom: "1px solid var(--border)" }}>{snapshot.qualityIssueCount}</td>
                          <td style={{ padding: "12px 8px", borderBottom: "1px solid var(--border)" }}>
                            <span className={snapshot.highIssueCount > 0 ? "tag tag-red" : "tag tag-green"}>{snapshot.highIssueCount}</span>
                          </td>
                          <td style={{ padding: "12px 8px", borderBottom: "1px solid var(--border)" }}>
                            {snapshot.remediationClosed}/{snapshot.remediationTotal} · {snapshot.remediationClosureRate}%
                          </td>
                          <td style={{ padding: "12px 8px", borderBottom: "1px solid var(--border)", color: "var(--text2)", fontSize: "0.78rem" }}>
                            {delta ? (
                              <span>
                                <span className={delta.verdict === "改善" ? "tag tag-green" : delta.verdict === "退化" ? "tag tag-red" : "tag"}>{delta.verdict}</span>
                                <br />
                                覆盖{delta.coverageDelta >= 0 ? "+" : ""}{delta.coverageDelta}pp / 问题{delta.qualityIssueDelta >= 0 ? "+" : ""}{delta.qualityIssueDelta}
                              </span>
                            ) : "基线轮次"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <button className="btn-secondary" type="button" onClick={() => downloadBatchComparisonReport(batchComparison)} disabled={downloadingComparisonReport} style={{ width: "100%" }}>
                {downloadingComparisonReport ? "生成报告中..." : "下载多轮试迁移对比报告"}
              </button>
              {comparisonReportError && <p style={{ color: "var(--red)", lineHeight: 1.6, fontSize: "0.8rem", margin: 0 }}>{comparisonReportError}</p>}
            </div>
          )}
        </section>

        <section className="card" style={{ marginBottom: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", marginBottom: 12 }}>
            <div>
              <div className="section-title">字段映射方案库</div>
              <p style={{ color: "var(--text2)", lineHeight: 1.6, fontSize: "0.84rem" }}>
                保存已确认的字段映射口径；后续上传同类迁移文件时，可选择历史方案作为复用基线，并先查看差异，不会静默套用。
              </p>
            </div>
            <span className="tag tag-blue">{mappingProfiles.length} 个方案</span>
          </div>

          {mappingWarning && !analysis && (
            <div style={{ border: "1px solid rgba(245,158,11,0.48)", background: "rgba(245,158,11,0.08)", color: "var(--amber)", borderRadius: 12, padding: 12, marginBottom: 12, lineHeight: 1.6, fontSize: "0.84rem" }}>
              {mappingWarning}
            </div>
          )}

          {loadingMappings ? (
            <p style={{ color: "var(--text2)", fontSize: "0.84rem" }}>正在读取字段映射方案...</p>
          ) : mappingProfiles.length === 0 ? (
            <div style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 12, padding: 16 }}>
              <strong>暂无字段映射方案</strong>
              <p style={{ color: "var(--text2)", lineHeight: 1.6, fontSize: "0.82rem", marginTop: 6 }}>
                上传试迁移文件并点击“保存字段映射方案”后，这里会展示可复用的历史口径。如果出现 SQL 未执行提示，请先在 Supabase 执行 supabase-v5318-migration-field-mapping-profiles.sql。
              </p>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "minmax(280px, 0.9fr) minmax(0, 1.1fr)", gap: 14, alignItems: "start" }}>
              <div style={{ display: "grid", gap: 10 }}>
                {mappingProfiles.map(profile => (
                  <button
                    key={profile.id}
                    type="button"
                    onClick={() => setSelectedMappingProfileId(profile.id)}
                    style={{
                      textAlign: "left",
                      border: `1px solid ${selectedMappingProfile?.id === profile.id ? "rgba(56,189,248,0.62)" : "var(--border)"}`,
                      background: selectedMappingProfile?.id === profile.id ? "rgba(56,189,248,0.08)" : "var(--surface2)",
                      borderRadius: 12,
                      padding: 12,
                      color: "var(--text)",
                      cursor: "pointer",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                      <strong>{profile.profileName}</strong>
                      <span className={profile.missingFieldCount > 0 ? "tag tag-amber" : "tag tag-green"}>{profile.fieldCoverageRate}%</span>
                    </div>
                    <p style={{ color: "var(--text2)", fontSize: "0.78rem", lineHeight: 1.55, marginTop: 6 }}>
                      {profile.objectName} · 匹配 {profile.matchedFieldCount}/{profile.requiredFields.length} · {profile.createdByName || "系统"} · {profile.createdAt.slice(0, 10)}
                    </p>
                    {profile.notes && <p style={{ color: "var(--accent2)", fontSize: "0.76rem", lineHeight: 1.5, marginTop: 6 }}>{profile.notes}</p>}
                  </button>
                ))}
              </div>

              <div style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 12, padding: 14 }}>
                <h2 style={{ fontSize: "0.95rem", marginBottom: 10 }}>复用差异检查</h2>
                {!analysis ? (
                  <p style={{ color: "var(--text2)", lineHeight: 1.6, fontSize: "0.82rem" }}>
                    请先上传当前迁移文件生成质量报告，再选择历史方案查看能否复用。
                  </p>
                ) : !mappingReuseCheck ? (
                  <p style={{ color: "var(--text2)", lineHeight: 1.6, fontSize: "0.82rem" }}>请选择一个历史字段映射方案。</p>
                ) : (
                  <div style={{ display: "grid", gap: 10 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                      <strong>{mappingReuseCheck.profileName}</strong>
                      <span className={mappingReuseCheck.canReuse ? "tag tag-green" : "tag tag-amber"}>
                        匹配度 {mappingReuseCheck.compatibilityScore}%
                      </span>
                    </div>
                    <p style={{ color: mappingReuseCheck.canReuse ? "var(--green)" : "var(--amber)", lineHeight: 1.6, fontSize: "0.82rem", margin: 0 }}>
                      {mappingReuseCheck.summary}
                    </p>
                    {mappingReuseCheck.warnings.length > 0 && (
                      <ul style={{ margin: "0 0 0 18px", color: "var(--text2)", lineHeight: 1.6, fontSize: "0.78rem" }}>
                        {mappingReuseCheck.warnings.map(warning => <li key={warning}>{warning}</li>)}
                      </ul>
                    )}
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                      <span className="tag tag-green">一致 {mappingReuseCheck.sameCount}</span>
                      <span className="tag tag-amber">变化 {mappingReuseCheck.changedCount}</span>
                      <span className="tag tag-blue">新增源字段 {mappingReuseCheck.sourceFieldsAdded.length}</span>
                    </div>
                    <div style={{ maxHeight: 220, overflow: "auto", borderTop: "1px solid var(--border)", paddingTop: 8 }}>
                      {mappingReuseCheck.differences.filter(item => item.impact !== "same").slice(0, 12).map(item => (
                        <div key={item.targetField} style={{ display: "grid", gap: 4, padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
                          <strong style={{ fontSize: "0.8rem" }}>{item.targetField}</strong>
                          <span style={{ color: "var(--text2)", fontSize: "0.76rem" }}>
                            历史：{item.profileSourceField || "-"} → 当前：{item.currentSourceField || "-"}
                          </span>
                        </div>
                      ))}
                      {mappingReuseCheck.differences.every(item => item.impact === "same") && (
                        <p style={{ color: "var(--green)", fontSize: "0.8rem", lineHeight: 1.6, margin: 0 }}>字段映射与历史方案一致。</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </section>

        <section className="card" style={{ marginBottom: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", marginBottom: 12 }}>
            <div>
              <div className="section-title">整改行动项跟踪</div>
              <p style={{ color: "var(--text2)", lineHeight: 1.6, fontSize: "0.84rem" }}>
                对已保存的迁移整改项做状态流转：待处理、处理中、待复检、已关闭；需要协同执行时，先进入飞书任务待确认队列，确认后再写入飞书任务。
              </p>
            </div>
            <span className="tag tag-purple">{persistedActions.length} 项</span>
          </div>

          {actionWarning && (
            <div style={{ border: "1px solid rgba(245,158,11,0.48)", background: "rgba(245,158,11,0.08)", color: "var(--amber)", borderRadius: 12, padding: 12, marginBottom: 12, lineHeight: 1.6, fontSize: "0.84rem" }}>
              {actionWarning}
            </div>
          )}

          {loadingActions ? (
            <p style={{ color: "var(--text2)", fontSize: "0.84rem" }}>正在读取整改行动项...</p>
          ) : persistedActions.length === 0 ? (
            <div style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 12, padding: 16 }}>
              <strong>暂无已保存整改项</strong>
              <p style={{ color: "var(--text2)", lineHeight: 1.6, fontSize: "0.82rem", marginTop: 6 }}>
                生成试迁移质量报告后点击“保存整改行动项”。如果出现 SQL 未执行提示，请先在 Supabase 执行 supabase-v5316-migration-remediation-actions.sql。
              </p>
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 980 }}>
                <thead>
                  <tr style={{ color: "var(--text2)", textAlign: "left", fontSize: "0.78rem" }}>
                    <th style={{ padding: "10px 8px", borderBottom: "1px solid var(--border)" }}>行动项</th>
                    <th style={{ padding: "10px 8px", borderBottom: "1px solid var(--border)" }}>批次/对象</th>
                    <th style={{ padding: "10px 8px", borderBottom: "1px solid var(--border)" }}>责任与期限</th>
                    <th style={{ padding: "10px 8px", borderBottom: "1px solid var(--border)" }}>状态</th>
                    <th style={{ padding: "10px 8px", borderBottom: "1px solid var(--border)" }}>飞书任务</th>
                    <th style={{ padding: "10px 8px", borderBottom: "1px solid var(--border)" }}>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {persistedActions.map(action => (
                    <tr key={action.id}>
                      <td style={{ padding: "12px 8px", borderBottom: "1px solid var(--border)", fontWeight: 800 }}>
                        {action.title}
                        <div style={{ color: "var(--text2)", fontSize: "0.76rem", lineHeight: 1.5, marginTop: 4 }}>
                          验收：{action.acceptanceCriteria}
                        </div>
                      </td>
                      <td style={{ padding: "12px 8px", borderBottom: "1px solid var(--border)", color: "var(--text2)", fontSize: "0.8rem", lineHeight: 1.5 }}>
                        <span className="tag">{action.objectName}</span>
                        <br />
                        {action.batchName || "未关联批次"}
                      </td>
                      <td style={{ padding: "12px 8px", borderBottom: "1px solid var(--border)", color: "var(--text2)", fontSize: "0.8rem", lineHeight: 1.5 }}>
                        {action.ownerName || action.ownerRole}
                        <br />
                        {action.dueDate || "-"}
                      </td>
                      <td style={{ padding: "12px 8px", borderBottom: "1px solid var(--border)" }}>
                        <span className={action.status === "已关闭" ? "tag tag-green" : action.status === "待复检" ? "tag tag-blue" : action.status === "处理中" ? "tag tag-amber" : "tag"}>
                          {action.status}
                        </span>
                        <div style={{ marginTop: 6 }}>
                          <span className={action.priority === "P0" ? "tag tag-red" : action.priority === "P1" ? "tag tag-amber" : "tag"}>{action.priority}</span>
                        </div>
                      </td>
                      <td style={{ padding: "12px 8px", borderBottom: "1px solid var(--border)", color: "var(--text2)", fontSize: "0.78rem", lineHeight: 1.55 }}>
                        <span className={action.feishuSyncStatus === "已同步" ? "tag tag-green" : action.feishuSyncStatus === "同步失败" ? "tag tag-red" : action.feishuSyncStatus === "待确认" ? "tag tag-blue" : "tag"}>
                          {action.feishuSyncStatus || "未同步"}
                        </span>
                        {action.feishuTaskUrl ? (
                          <div style={{ marginTop: 6 }}>
                            <a href={action.feishuTaskUrl} target="_blank" rel="noreferrer" style={{ color: "var(--accent2)" }}>打开飞书任务</a>
                          </div>
                        ) : action.feishuTaskGuid ? (
                          <div style={{ marginTop: 6 }}>任务ID：{action.feishuTaskGuid}</div>
                        ) : null}
                        {action.feishuSyncError && (
                          <div style={{ color: "var(--amber)", marginTop: 6 }}>原因：{action.feishuSyncError}</div>
                        )}
                      </td>
                      <td style={{ padding: "12px 8px", borderBottom: "1px solid var(--border)" }}>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          {action.status === "待处理" && (
                            <button className="btn-secondary" type="button" disabled={transitioningActionId === action.id} onClick={() => transitionRemediationAction(action.id, "处理中")}>开始处理</button>
                          )}
                          {action.status === "处理中" && (
                            <button className="btn-secondary" type="button" disabled={transitioningActionId === action.id} onClick={() => transitionRemediationAction(action.id, "待复检")}>提交复检</button>
                          )}
                          {action.status === "待复检" && (
                            <button className="btn-primary" type="button" disabled={transitioningActionId === action.id} onClick={() => transitionRemediationAction(action.id, "已关闭")}>关闭</button>
                          )}
                          {action.status === "已关闭" && <span style={{ color: "var(--green)", fontSize: "0.8rem" }}>已完成闭环</span>}
                          {action.feishuSyncStatus === "未同步" && (
                            <button className="btn-secondary" type="button" disabled={syncingActionId === action.id} onClick={() => syncRemediationActionToFeishu(action, "prepare")}>
                              {syncingActionId === action.id ? "处理中..." : "准备同步飞书"}
                            </button>
                          )}
                          {action.feishuSyncStatus === "待确认" && (
                            <button className="btn-primary" type="button" disabled={syncingActionId === action.id} onClick={() => syncRemediationActionToFeishu(action, "confirm")}>
                              {syncingActionId === action.id ? "写入中..." : "确认写入飞书任务"}
                            </button>
                          )}
                          {action.feishuSyncStatus === "同步失败" && (
                            <button className="btn-primary" type="button" disabled={syncingActionId === action.id} onClick={() => syncRemediationActionToFeishu(action, "confirm")}>
                              {syncingActionId === action.id ? "重试中..." : "重新确认写入"}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="card" style={{ marginBottom: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", marginBottom: 12 }}>
            <div>
              <div className="section-title">历史迁移批次</div>
              <p style={{ color: "var(--text2)", lineHeight: 1.6, fontSize: "0.84rem" }}>
                保留每次试迁移的字段覆盖率、质量问题和准入结论，便于正式迁移前做复盘和审批。
              </p>
            </div>
            <span className="tag tag-blue">{batches.length} 条记录</span>
          </div>

          {batchWarning && (
            <div style={{ border: "1px solid rgba(245,158,11,0.48)", background: "rgba(245,158,11,0.08)", color: "var(--amber)", borderRadius: 12, padding: 12, marginBottom: 12, lineHeight: 1.6, fontSize: "0.84rem" }}>
              {batchWarning}
            </div>
          )}

          {loadingBatches ? (
            <p style={{ color: "var(--text2)", fontSize: "0.84rem" }}>正在读取迁移批次历史...</p>
          ) : batches.length === 0 ? (
            <div style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 12, padding: 16 }}>
              <strong>暂无历史批次</strong>
              <p style={{ color: "var(--text2)", lineHeight: 1.6, fontSize: "0.82rem", marginTop: 6 }}>
                上传试迁移文件并保存后，这里会展示批次结果。如果出现 SQL 未执行提示，请先在 Supabase 执行 supabase-v5313-migration-batches.sql。
              </p>
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
                <thead>
                  <tr style={{ color: "var(--text2)", textAlign: "left", fontSize: "0.78rem" }}>
                    <th style={{ padding: "10px 8px", borderBottom: "1px solid var(--border)" }}>批次</th>
                    <th style={{ padding: "10px 8px", borderBottom: "1px solid var(--border)" }}>对象</th>
                    <th style={{ padding: "10px 8px", borderBottom: "1px solid var(--border)" }}>样本</th>
                    <th style={{ padding: "10px 8px", borderBottom: "1px solid var(--border)" }}>字段覆盖</th>
                    <th style={{ padding: "10px 8px", borderBottom: "1px solid var(--border)" }}>质量问题</th>
                    <th style={{ padding: "10px 8px", borderBottom: "1px solid var(--border)" }}>结论</th>
                    <th style={{ padding: "10px 8px", borderBottom: "1px solid var(--border)" }}>创建人/时间</th>
                  </tr>
                </thead>
                <tbody>
                  {batches.map(batch => (
                    <tr key={batch.id}>
                      <td style={{ padding: "12px 8px", borderBottom: "1px solid var(--border)", fontWeight: 800 }}>
                        {batch.batchName}
                        {batch.fileName && <div style={{ color: "var(--text2)", fontSize: "0.76rem", marginTop: 4 }}>{batch.fileName}</div>}
                      </td>
                      <td style={{ padding: "12px 8px", borderBottom: "1px solid var(--border)" }}><span className="tag">{batch.objectName}</span></td>
                      <td style={{ padding: "12px 8px", borderBottom: "1px solid var(--border)", color: "var(--text2)" }}>{batch.totalRows} 行</td>
                      <td style={{ padding: "12px 8px", borderBottom: "1px solid var(--border)", color: batch.missingRequiredFields === 0 ? "var(--green)" : "var(--amber)", fontWeight: 800 }}>
                        {batch.fieldCoverageRate}%
                        <div style={{ color: "var(--text2)", fontSize: "0.76rem", marginTop: 4 }}>缺失 {batch.missingRequiredFields} 项</div>
                      </td>
                      <td style={{ padding: "12px 8px", borderBottom: "1px solid var(--border)", color: batch.highIssueCount > 0 ? "var(--red)" : "var(--text2)" }}>
                        {batch.qualityIssueCount} 项
                        <div style={{ color: "var(--text2)", fontSize: "0.76rem", marginTop: 4 }}>高优先级 {batch.highIssueCount} 项</div>
                      </td>
                      <td style={{ padding: "12px 8px", borderBottom: "1px solid var(--border)" }}>
                        <span className={batch.canTrialImport ? "tag tag-green" : "tag tag-amber"}>
                          {batch.canTrialImport ? "可试迁移" : "需修正"}
                        </span>
                      </td>
                      <td style={{ padding: "12px 8px", borderBottom: "1px solid var(--border)", color: "var(--text2)", fontSize: "0.8rem", lineHeight: 1.5 }}>
                        {batch.createdByName || "系统"}
                        <br />
                        {batch.createdAt ? new Date(batch.createdAt).toLocaleString("zh-CN", { hour12: false }) : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="card" style={{ marginBottom: 18 }}>
          <div className="section-title">迁移阶段门</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
            {migrationStages.map(stage => (
              <article key={stage.id} style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 12, padding: 16 }}>
                <h2 style={{ fontSize: "0.98rem", fontWeight: 800 }}>{stage.name}</h2>
                <p style={{ color: "var(--text2)", lineHeight: 1.65, fontSize: "0.82rem", marginTop: 8 }}>{stage.objective}</p>
                <div style={{ marginTop: 12 }}>
                  <strong style={{ fontSize: "0.78rem", color: "var(--text)" }}>输入</strong>
                  <p style={{ color: "var(--text2)", lineHeight: 1.6, fontSize: "0.78rem", marginTop: 4 }}>{stage.inputs.join("、")}</p>
                </div>
                <div style={{ marginTop: 10 }}>
                  <strong style={{ fontSize: "0.78rem", color: "var(--text)" }}>输出</strong>
                  <p style={{ color: "var(--green)", lineHeight: 1.6, fontSize: "0.78rem", marginTop: 4 }}>{stage.outputs.join("、")}</p>
                </div>
                <p style={{ color: "var(--accent2)", lineHeight: 1.6, fontSize: "0.78rem", marginTop: 10 }}>阶段门：{stage.gate}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="card">
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 10 }}>
            <div>
              <div className="section-title">需要迁移的数据对象</div>
              <p style={{ color: "var(--text2)", lineHeight: 1.6, fontSize: "0.84rem" }}>
                用这张清单向竞品A导出数据、向飞书补字段、向模板中心补导入模板。
              </p>
            </div>
            <span className="tag tag-purple">字段均要求中文口径</span>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 980 }}>
              <thead>
                <tr style={{ color: "var(--text2)", textAlign: "left", fontSize: "0.78rem" }}>
                  <th style={{ padding: "10px 8px", borderBottom: "1px solid var(--border)" }}>数据对象</th>
                  <th style={{ padding: "10px 8px", borderBottom: "1px solid var(--border)" }}>来源</th>
                  <th style={{ padding: "10px 8px", borderBottom: "1px solid var(--border)" }}>关键字段</th>
                  <th style={{ padding: "10px 8px", borderBottom: "1px solid var(--border)" }}>进入模块</th>
                  <th style={{ padding: "10px 8px", borderBottom: "1px solid var(--border)" }}>质量检查</th>
                </tr>
              </thead>
              <tbody>
                {migrationDataObjects.map(object => (
                  <tr key={object.name}>
                    <td style={{ padding: "12px 8px", borderBottom: "1px solid var(--border)", fontWeight: 800 }}>{object.name}</td>
                    <td style={{ padding: "12px 8px", borderBottom: "1px solid var(--border)" }}><span className="tag">{object.source}</span></td>
                    <td style={{ padding: "12px 8px", borderBottom: "1px solid var(--border)", color: "var(--text2)", fontSize: "0.8rem", lineHeight: 1.6 }}>{object.requiredFields.join("、")}</td>
                    <td style={{ padding: "12px 8px", borderBottom: "1px solid var(--border)", color: "var(--accent2)", fontSize: "0.8rem", lineHeight: 1.6 }}>{object.targetModule}</td>
                    <td style={{ padding: "12px 8px", borderBottom: "1px solid var(--border)", color: "var(--green)", fontSize: "0.8rem", lineHeight: 1.6 }}>{object.qualityChecks.join("；")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
