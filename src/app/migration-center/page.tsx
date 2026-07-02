"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { MigrationAnalysisResult } from "@/features/migration/package";
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

function issueColor(severity: string) {
  if (severity === "high") return "var(--red)";
  if (severity === "medium") return "var(--amber)";
  return "var(--accent2)";
}

function defaultBatchName(analysis: MigrationAnalysisResult) {
  const stamp = analysis.generatedAt.replace(/\D/g, "").slice(0, 12);
  return `${analysis.objectName}-试迁移批次-${stamp || "待命名"}`;
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

  const result = useMemo(() => assessMigrationReadiness(selectedAreaIds), [selectedAreaIds]);

  useEffect(() => {
    let active = true;
    async function loadBatches() {
      setLoadingBatches(true);
      try {
        const response = await fetch("/api/migration/batches", { cache: "no-store" });
        const payload = await response.json() as BatchListResponse;
        if (!active) return;
        if (payload.status === "succeeded") {
          setBatches(payload.batches);
          setBatchWarning("");
        } else {
          setBatches(payload.batches ?? []);
          setBatchWarning(payload.warning || "迁移批次历史暂不可用。");
        }
      } catch {
        if (active) setBatchWarning("读取迁移批次历史失败。");
      } finally {
        if (active) setLoadingBatches(false);
      }
    }
    void loadBatches();
    return () => {
      active = false;
    };
  }, []);

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
    } catch {
      setAnalyzeError("试迁移分析失败，请稍后重试。");
    } finally {
      setAnalyzing(false);
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
                用小批量竞品A导出数据做试跑：先生成字段映射与质量报告；确认后可保存为迁移批次历史，仍不会自动写入飞书业务表。
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
                </div>
              </div>
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
