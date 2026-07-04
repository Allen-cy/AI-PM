"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  buildRiskTrackingReport,
  type RiskTrackingUpdate,
} from "@/lib/risk-analytics";
import {
  type Risk,
  type RiskStatus,
  type RiskWorkflowEvent,
  getRiskLevel,
  statusLabels,
  statusOrder,
} from "@/lib/risk";
import type { RiskClosureDecision } from "@/features/risk/closure";

type RiskPayload = {
  risks?: Risk[];
  events?: RiskWorkflowEvent[];
  warning?: string;
  error?: string;
  migrationHint?: string;
};

type RiskTrackingForm = RiskTrackingUpdate & {
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

function dateByOffset(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

const defaultForm: RiskTrackingForm = {
  riskId: "",
  status: "tracking",
  progress: 50,
  owner: "",
  deadline: "",
  actionTaken: "",
  nextAction: "",
  blocker: "",
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

function downloadText(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function riskName(risk: Risk) {
  return `${risk.projectName || "未指定项目"} / ${risk.riskCode || risk.id.slice(0, 8)} / ${risk.description.slice(0, 28)}`;
}

export default function RiskTrackingPage() {
  const [risks, setRisks] = useState<Risk[]>([]);
  const [events, setEvents] = useState<RiskWorkflowEvent[]>([]);
  const [updates, setUpdates] = useState<RiskTrackingUpdate[]>([]);
  const [form, setForm] = useState<RiskTrackingForm>(defaultForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [reviewNow] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;
    async function loadRisks() {
      setLoading(true);
      setError("");
      try {
        const response = await fetch("/api/risk", { cache: "no-store" });
        const data = await response.json() as RiskPayload;
        if (!response.ok) throw new Error([data.error, data.migrationHint].filter(Boolean).join("；") || "风险登记册读取失败");
        if (cancelled) return;
        const nextRisks = Array.isArray(data.risks) ? data.risks : [];
        setRisks(nextRisks);
        setEvents(Array.isArray(data.events) ? data.events : []);
        setMessage(data.warning || "");
        const firstOpen = nextRisks.find(risk => !["closed", "resolved"].includes(risk.status));
        if (firstOpen) {
          setForm(prev => ({
            ...prev,
            riskId: firstOpen.id,
            owner: firstOpen.actionOwner || firstOpen.owner || "",
            deadline: firstOpen.actionDeadline || firstOpen.dueDate || "",
          }));
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "风险登记册读取失败");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadRisks();
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedRisk = useMemo(() => risks.find(risk => risk.id === form.riskId || risk.riskCode === form.riskId), [risks, form.riskId]);
  const openRisks = risks.filter(risk => !["closed", "resolved"].includes(risk.status));
  const highRisks = openRisks.filter(risk => getRiskLevel(risk.piScore) === "high");
  const overdueRisks = openRisks.filter(risk => risk.dueDate && new Date(risk.dueDate).getTime() < reviewNow);
  const report = useMemo(() => buildRiskTrackingReport(risks, updates), [risks, updates]);

  const submitTracking = async () => {
    if (!selectedRisk) {
      setError("请先选择需要跟踪的风险。");
      return;
    }
    if (!form.owner.trim() || !form.deadline || !form.actionTaken.trim() || !form.nextAction.trim()) {
      setError("请补齐责任人、deadline、已完成动作和下一步动作。风险跟踪必须责任到人。");
      return;
    }
    if (form.status === "closed") {
      if (!form.closureEvidence.trim() || !form.reviewOpinion.trim() || !form.reviewer.trim() || !form.reviewedAt || !form.dependencyDisposition.trim()) {
        setError("关闭风险必须补齐关闭证据、复核意见、复核人、复核日期和依赖处置说明。");
        return;
      }
      if (form.closureDecision === "conditional" && (!form.followUpAction.trim() || !form.followUpOwner.trim() || !form.followUpDeadline)) {
        setError("有条件关闭必须补齐后续动作、责任人和deadline。");
        return;
      }
    }

    setSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/risk", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: selectedRisk.id,
          toStatus: form.status as RiskStatus,
          inputSummary: `本次跟踪输入：完成进度 ${form.progress}%；阻塞/升级：${form.blocker || "无"}。`,
          outputSummary: `风险跟踪记录：${form.actionTaken}`,
          actionRequired: form.nextAction,
          owner: form.owner,
          deadline: form.deadline,
          evidence: form.evidence,
          closure: form.status === "closed" ? {
            closureEvidence: form.closureEvidence,
            reviewOpinion: form.reviewOpinion,
            reviewer: form.reviewer,
            reviewedAt: form.reviewedAt,
            closureDecision: form.closureDecision,
            dependencyDisposition: form.dependencyDisposition,
            residualRisk: form.residualRisk,
            followUpAction: form.followUpAction,
            followUpOwner: form.followUpOwner,
            followUpDeadline: form.followUpDeadline,
            lessonsLearned: form.lessonsLearned,
          } : undefined,
          actor: "风险跟踪管理页",
        }),
      });
      const data = await response.json() as { risk?: Risk; event?: RiskWorkflowEvent; warning?: string; error?: string; migrationHint?: string };
      if (!response.ok || !data.risk || !data.event) throw new Error([data.error, data.migrationHint].filter(Boolean).join("；") || "风险跟踪保存失败");
      const update = { ...form, riskId: selectedRisk.id };
      setUpdates(prev => [update, ...prev]);
      setRisks(prev => prev.map(risk => risk.id === data.risk!.id || risk.riskCode === data.risk!.riskCode ? data.risk! : risk));
      setEvents(prev => [data.event!, ...prev]);
      setForm({
        ...defaultForm,
        riskId: selectedRisk.id,
        owner: data.risk.actionOwner || data.risk.owner || "",
        deadline: data.risk.actionDeadline || data.risk.dueDate || "",
      });
      setMessage(data.warning || "本次风险跟踪已写入风险工作流审计记录。");
    } catch (e) {
      setError(e instanceof Error ? e.message : "风险跟踪保存失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <main style={{ minHeight: "100vh", background: "var(--bg)", padding: 32 }}>
      <div style={{ maxWidth: 1360, margin: "0 auto" }}>
        <header style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", marginBottom: 24 }}>
          <div>
            <Link href="/risk" style={{ color: "var(--text2)", textDecoration: "none", fontSize: "0.86rem" }}>← 返回风险管理</Link>
            <h1 style={{ marginTop: 12, fontSize: "1.8rem" }}>风险跟踪管理</h1>
            <p style={{ color: "var(--text2)", lineHeight: 1.7, marginTop: 8 }}>
              从正式风险登记册选择风险，录入本次处理动作、下一步、责任人和deadline，系统写回工作流状态并生成跟踪报告。
            </p>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <Link href="/templates" className="btn-secondary" style={{ textDecoration: "none" }}>下载跟踪模板</Link>
            <button className="btn-primary" onClick={() => downloadText("风险跟踪管理报告.md", report)}>下载跟踪报告</button>
          </div>
        </header>

        {(message || error) && (
          <div style={{
            marginBottom: 18,
            padding: "12px 14px",
            borderRadius: 12,
            background: error ? "rgba(239,68,68,0.1)" : "rgba(16,185,129,0.1)",
            border: `1px solid ${error ? "rgba(239,68,68,0.25)" : "rgba(16,185,129,0.25)"}`,
            color: error ? "var(--red)" : "var(--green)",
            fontWeight: 700,
          }}>
            {error || message}
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 22 }}>
          <div className="stat-card"><div className="stat-num">{openRisks.length}</div><div className="stat-label">开放风险</div></div>
          <div className="stat-card"><div className="stat-num" style={{ color: "var(--red)" }}>{highRisks.length}</div><div className="stat-label">高风险</div></div>
          <div className="stat-card"><div className="stat-num" style={{ color: "var(--amber)" }}>{overdueRisks.length}</div><div className="stat-label">已逾期</div></div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "0.95fr 1.05fr", gap: 20 }}>
          <section className="card">
            <div className="section-title"><span>📥</span>本次跟踪输入</div>
            {loading ? (
              <div style={{ color: "var(--text2)" }}>正在读取风险登记册...</div>
            ) : (
              <div style={{ display: "grid", gap: 14 }}>
                <div>
                  <label className="label">选择风险</label>
                  <select className="input" value={form.riskId} onChange={event => {
                    const risk = risks.find(item => item.id === event.target.value || item.riskCode === event.target.value);
                    setForm(prev => ({
                      ...prev,
                      riskId: event.target.value,
                      owner: risk?.actionOwner || risk?.owner || prev.owner,
                      deadline: risk?.actionDeadline || risk?.dueDate || prev.deadline,
                      reviewer: risk?.actionOwner || risk?.owner || prev.reviewer,
                      followUpOwner: risk?.actionOwner || risk?.owner || prev.followUpOwner,
                    }));
                  }}>
                    <option value="">请选择</option>
                    {openRisks.map(risk => (
                      <option key={risk.id} value={risk.id}>{riskName(risk)}</option>
                    ))}
                  </select>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div>
                    <label className="label">本次状态</label>
                    <select className="input" value={form.status} onChange={event => setForm(prev => ({ ...prev, status: event.target.value }))}>
                      {statusOrder.filter(status => status !== "identified").map(status => <option key={status} value={status}>{statusLabels[status]}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="label">完成进度</label>
                    <input className="input" type="number" min={0} max={100} value={form.progress} onChange={event => setForm(prev => ({ ...prev, progress: Math.max(0, Math.min(100, Number(event.target.value) || 0)) }))} />
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div>
                    <label className="label">责任人 *</label>
                    <input className="input" value={form.owner} onChange={event => setForm(prev => ({ ...prev, owner: event.target.value }))} />
                  </div>
                  <div>
                    <label className="label">deadline *</label>
                    <input className="input" type="date" value={form.deadline} onChange={event => setForm(prev => ({ ...prev, deadline: event.target.value }))} />
                  </div>
                </div>
                <div>
                  <label className="label">已完成动作 *</label>
                  <textarea className="input" rows={3} value={form.actionTaken} onChange={event => setForm(prev => ({ ...prev, actionTaken: event.target.value }))} placeholder="例如：已召开风险评审会，确认供应商补救计划。" />
                </div>
                <div>
                  <label className="label">下一步动作 *</label>
                  <textarea className="input" rows={3} value={form.nextAction} onChange={event => setForm(prev => ({ ...prev, nextAction: event.target.value }))} placeholder="例如：7月5日前确认替代资源，若失败升级PMO治理。" />
                </div>
                <div>
                  <label className="label">阻塞/升级事项</label>
                  <textarea className="input" rows={2} value={form.blocker || ""} onChange={event => setForm(prev => ({ ...prev, blocker: event.target.value }))} />
                </div>
                <div>
                  <label className="label">证据/附件说明</label>
                  <input className="input" value={form.evidence || ""} onChange={event => setForm(prev => ({ ...prev, evidence: event.target.value }))} placeholder="会议纪要链接、飞书记录、文件名等" />
                </div>
                {form.status === "closed" && (
                  <div style={{ border: "1px solid rgba(16,185,129,0.28)", borderRadius: 12, padding: 14, background: "rgba(16,185,129,0.08)" }}>
                    <div style={{ fontWeight: 800, marginBottom: 8 }}>关闭证据与复核意见</div>
                    <div style={{ color: "var(--text2)", fontSize: "0.76rem", lineHeight: 1.6, marginBottom: 12 }}>
                      选择“已关闭”时，必须提交关闭证据、复核意见和依赖处置说明。
                    </div>
                    <div style={{ display: "grid", gap: 12 }}>
                      <div>
                        <label className="label">关闭证据 *</label>
                        <textarea className="input" rows={2} value={form.closureEvidence} onChange={event => setForm(prev => ({ ...prev, closureEvidence: event.target.value }))} placeholder="验收单、缺陷关闭记录、回款确认、治理评审纪要、附件链接等" />
                      </div>
                      <div>
                        <label className="label">复核意见 *</label>
                        <textarea className="input" rows={2} value={form.reviewOpinion} onChange={event => setForm(prev => ({ ...prev, reviewOpinion: event.target.value }))} />
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                        <div>
                          <label className="label">复核人 *</label>
                          <input className="input" value={form.reviewer} onChange={event => setForm(prev => ({ ...prev, reviewer: event.target.value }))} />
                        </div>
                        <div>
                          <label className="label">复核日期 *</label>
                          <input className="input" type="date" value={form.reviewedAt} onChange={event => setForm(prev => ({ ...prev, reviewedAt: event.target.value }))} />
                        </div>
                      </div>
                      <div>
                        <label className="label">关闭结论 *</label>
                        <select className="input" value={form.closureDecision} onChange={event => setForm(prev => ({ ...prev, closureDecision: event.target.value as RiskClosureDecision }))}>
                          <option value="approved">批准关闭</option>
                          <option value="conditional">有条件关闭</option>
                        </select>
                      </div>
                      <div>
                        <label className="label">依赖处置说明 *</label>
                        <textarea className="input" rows={2} value={form.dependencyDisposition} onChange={event => setForm(prev => ({ ...prev, dependencyDisposition: event.target.value }))} placeholder="关联行动项、治理流程、回款/里程碑影响已处理，或说明豁免原因" />
                      </div>
                      <div>
                        <label className="label">剩余风险</label>
                        <input className="input" value={form.residualRisk} onChange={event => setForm(prev => ({ ...prev, residualRisk: event.target.value }))} placeholder="无 / 转运维观察 / 后续复盘" />
                      </div>
                      {form.closureDecision === "conditional" && (
                        <>
                          <div>
                            <label className="label">后续动作 *</label>
                            <input className="input" value={form.followUpAction} onChange={event => setForm(prev => ({ ...prev, followUpAction: event.target.value }))} />
                          </div>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                            <div>
                              <label className="label">后续责任人 *</label>
                              <input className="input" value={form.followUpOwner} onChange={event => setForm(prev => ({ ...prev, followUpOwner: event.target.value }))} />
                            </div>
                            <div>
                              <label className="label">后续deadline *</label>
                              <input className="input" type="date" value={form.followUpDeadline} onChange={event => setForm(prev => ({ ...prev, followUpDeadline: event.target.value }))} />
                            </div>
                          </div>
                        </>
                      )}
                      <div>
                        <label className="label">经验教训/复盘要点</label>
                        <textarea className="input" rows={2} value={form.lessonsLearned} onChange={event => setForm(prev => ({ ...prev, lessonsLearned: event.target.value }))} />
                      </div>
                    </div>
                  </div>
                )}
                <button className="btn-primary" onClick={submitTracking} disabled={saving || !form.riskId}>
                  {saving ? "保存中..." : "保存本次跟踪并推进状态"}
                </button>
              </div>
            )}
          </section>

          <section className="card">
            <div className="section-title"><span>📤</span>输出成果</div>
            {selectedRisk && (
              <div style={{ marginBottom: 14, padding: 14, borderRadius: 12, background: "var(--surface2)", border: "1px solid var(--border)", fontSize: "0.8rem", color: "var(--text2)", lineHeight: 1.7 }}>
                <strong style={{ color: "var(--text)" }}>当前风险：</strong>{selectedRisk.description}<br />
                <strong style={{ color: "var(--text)" }}>当前状态：</strong>{statusLabels[selectedRisk.status]} · 责任人：{selectedRisk.actionOwner || selectedRisk.owner || "未指定"} · deadline：{selectedRisk.actionDeadline || selectedRisk.dueDate || "未设置"}
              </div>
            )}
            <pre style={{
              whiteSpace: "pre-wrap",
              maxHeight: 460,
              overflowY: "auto",
              padding: 16,
              borderRadius: 12,
              background: "var(--surface2)",
              border: "1px solid var(--border)",
              color: "var(--text)",
              fontSize: "0.78rem",
              lineHeight: 1.65,
            }}>
              {report}
            </pre>
            <div style={{ marginTop: 18 }}>
              <div style={{ fontSize: "0.85rem", fontWeight: 800, marginBottom: 10 }}>最近状态变更</div>
              <div style={{ display: "grid", gap: 8 }}>
                {events.slice(0, 5).map(event => (
                  <div key={event.id} style={{ padding: 10, borderRadius: 10, background: "var(--surface2)", color: "var(--text2)", fontSize: "0.74rem", lineHeight: 1.55 }}>
                    {statusLabels[event.toStatus]} · {event.owner || "未指定"} · {event.deadline || "未设置deadline"} · {event.createdAt.slice(0, 16).replace("T", " ")}
                  </div>
                ))}
                {events.length === 0 && <div style={{ color: "var(--text2)", fontSize: "0.8rem" }}>暂无审计记录。</div>}
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
