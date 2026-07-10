"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { businessContextSearchParams, readStoredBusinessContext, readStoredDataClass, writeStoredBusinessContext, type StoredBusinessContext } from "@/features/operating-model/client-context";

type AssistantOutput = {
  facts?: Array<{ statement: string; evidence_ids: string[] }>;
  inferences?: Array<{ statement: string; confidence: number; evidence_ids: string[] }>;
  recommendations?: Array<{ title: string; reason: string }>;
  pending_confirmation?: string[];
};
type Run = { id: string; business_role: string; scenario: string; model_name?: string | null; status: string; output?: AssistantOutput; error_message?: string | null; started_at: string };
type Recommendation = { id: string; recommendation_type: string; title: string; reason: string; proposed_payload: Record<string, unknown>; status: string; executed_resource_type?: string | null; executed_resource_id?: string | null };
type Evaluation = { id: string; run_id: string; rating?: number | null; verdict: string; correction?: string | null; adopted?: boolean | null; outcome?: string | null; accuracy_score?: number | null; refusal_outcome?: string; false_positive?: boolean; false_negative?: boolean; human_modified?: boolean; human_edit_summary?: string | null; closure_effect?: string; created_at: string };
type EvaluationDraft = { rating: string; verdict: string; correction: string; adopted: string; outcome: string; accuracyScore: string; refusalOutcome: string; falsePositive: boolean; falseNegative: boolean; humanModified: boolean; humanEditSummary: string; closureEffect: string };
type EvaluationMetrics = { evaluation_count: number; accuracy_rate: number | null; correct_refusal_rate: number | null; false_positive_rate: number | null; false_negative_rate: number | null; adoption_rate: number | null; human_modification_rate: number | null; closure_effect_achieved_rate: number | null };

const EMPTY_EVALUATION: EvaluationDraft = { rating: "5", verdict: "useful", correction: "", adopted: "", outcome: "", accuracyScore: "1", refusalOutcome: "not_applicable", falsePositive: false, falseNegative: false, humanModified: false, humanEditSummary: "", closureEffect: "not_evaluated" };
const MATERIALIZABLE_TYPES = new Set(["action", "risk", "issue", "change", "governance", "decision_brief", "report", "feishu_draft"]);

export default function RoleAssistantPage() {
  const [context, setContext] = useState<StoredBusinessContext | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);
  const [evaluationMetrics, setEvaluationMetrics] = useState<EvaluationMetrics | null>(null);
  const [evaluationDrafts, setEvaluationDrafts] = useState<Record<string, EvaluationDraft>>({});
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [scenario, setScenario] = useState("daily_business_assistant");
  const [rejectReason, setRejectReason] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setError("");
    try {
      const response = await fetch("/api/context/current", { cache: "no-store" });
      const body = await response.json() as {
        active_context?: { assignmentId: string; businessRole: string; orgId: string; subjectScope: string; subjectId: string } | null;
        available_contexts?: Array<{ id: string; businessRole: string; orgId: string; subjectScope: string; subjectId: string; status: string }>;
      };
      const stored = readStoredBusinessContext();
      const selected = body.available_contexts?.find(item => item.id === stored?.assignmentId && item.status === "active")
        ?? body.available_contexts?.find(item => item.id === body.active_context?.assignmentId && item.status === "active");
      if (!selected) throw new Error("尚未分配有效业务角色。");
      const active = { assignmentId: selected.id, businessRole: selected.businessRole, orgId: selected.orgId, subjectScope: selected.subjectScope, subjectId: selected.subjectId };
      writeStoredBusinessContext(active);
      setContext(active);
      const query = businessContextSearchParams(active, readStoredDataClass());
      const result = await fetch(`/api/role-assistant?${query.toString()}`, { cache: "no-store" });
      const payload = await result.json();
      if (!result.ok) throw new Error(payload.detail || payload.error || "角色助理加载失败");
      setRuns(payload.runs || []);
      setRecommendations(payload.recommendations || []);
      setEvaluations(payload.evaluations || []);
      setEvaluationMetrics(payload.evaluation_metrics || null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "角色助理加载失败");
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function operate(operation: string, payload: Record<string, unknown> = {}) {
    if (!context) return;
    setSaving(true); setError(""); setMessage("");
    try {
      const query = businessContextSearchParams(context, readStoredDataClass());
      const response = await fetch(`/api/role-assistant?${query.toString()}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ operation, ...payload }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.detail || body.error || "操作失败");
      if (operation === "generate") setMessage(`已先扫描管理信号再生成角色助理，模型：${body.model || "已配置模型"}`);
      else if (operation === "scan") setMessage(`主动扫描完成：发现 ${body.findings?.length || 0} 项，新建信号 ${body.created || 0} 项，刷新 ${body.refreshed || 0} 项。`);
      else if (operation === "materialize_recommendation") setMessage(`已生成所属业务领域草稿：${body.materialization?.resource_type || "草稿"}；这不代表行动已经执行或完成。`);
      else if (operation === "evaluate") setMessage("效果评测已保存，将用于后续模型与提示词改进。");
      else setMessage("人工确认动作已保存。");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "操作失败");
    } finally {
      setSaving(false);
    }
  }

  function evaluationDraft(runId: string) { return evaluationDrafts[runId] || EMPTY_EVALUATION; }
  function updateEvaluation(runId: string, update: Partial<EvaluationDraft>) {
    setEvaluationDrafts(current => ({ ...current, [runId]: { ...evaluationDraft(runId), ...update } }));
  }
  function submitEvaluation(runId: string) {
    const draft = evaluationDraft(runId);
    void operate("evaluate", {
      run_id: runId, rating: Number(draft.rating), verdict: draft.verdict,
      correction: draft.correction || null, adopted: draft.adopted === "" ? null : draft.adopted === "yes", outcome: draft.outcome || null,
      accuracy_score: Number(draft.accuracyScore), refusal_outcome: draft.refusalOutcome,
      false_positive: draft.falsePositive, false_negative: draft.falseNegative,
      human_modified: draft.humanModified, human_edit_summary: draft.humanEditSummary || null, closure_effect: draft.closureEffect,
    });
  }

  const latest = runs.find(item => item.status === "succeeded" && item.output)?.output;
  return <main style={{ minHeight: "100vh", background: "var(--bg)" }}>
    <header style={{ padding: "15px 28px", borderBottom: "1px solid var(--border)", background: "var(--surface)", display: "flex", alignItems: "center", gap: 14 }}>
      <Link href="/" style={{ color: "var(--text2)", textDecoration: "none" }}>← 返回首页</Link>
      <strong style={{ color: "var(--cyan)" }}>角色AI业务助理</strong>
      <span className="tag tag-blue">{context?.businessRole || "未选择角色"}</span>
      <Link href="/account" className="btn-secondary" style={{ marginLeft: "auto", textDecoration: "none" }}>配置个人AI模型</Link>
    </header>
    <div style={{ maxWidth: 1400, margin: "0 auto", padding: 28 }}>
      {(error || message) && <section className="card" style={{ marginBottom: 16, color: error ? "var(--red)" : "var(--green)" }}>{error || message}</section>}
      <section className="card" style={{ marginBottom: 16, background: "linear-gradient(135deg,rgba(6,182,212,.12),rgba(59,130,246,.08))" }}>
        <h1 style={{ fontSize: "1.35rem" }}>基于当前角色和真实业务证据生成工作建议</h1>
        <p style={{ color: "var(--text2)", lineHeight: 1.75, marginTop: 8 }}>系统会先从真实业务数据扫描异常、冲突、遗漏和到期事项，先登记管理信号，再让AI基于证据生成建议。AI不能直接改写项目事实；每个业务草稿都需要预览、接受和二次人工确认。</p>
        <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
          <select className="input" style={{ maxWidth: 280 }} value={scenario} onChange={event => setScenario(event.target.value)}>
            <option value="daily_business_assistant">每日业务助理</option><option value="weekly_review">周复盘准备</option><option value="exception_analysis">例外分析</option><option value="decision_preparation">决策准备</option>
          </select>
          <button className="btn-secondary" disabled={saving} onClick={() => void operate("scan")}>{saving ? "扫描中..." : "主动扫描异常"}</button>
          <button className="btn-primary" disabled={saving} onClick={() => void operate("generate", { scenario })}>{saving ? "生成中..." : "先扫描再生成有证据摘要"}</button>
        </div>
      </section>

      {latest && <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 16 }}>
        <div className="card"><div className="section-title">✅ 事实</div>{latest.facts?.map((item, index) => <article key={index} style={{ padding: 10, background: "var(--surface2)", borderRadius: 10, marginTop: 8 }}><strong>{item.statement}</strong><p style={{ color: "var(--accent2)", fontSize: ".72rem", marginTop: 5 }}>{item.evidence_ids.join(" · ")}</p></article>)}</div>
        <div className="card"><div className="section-title">🔎 推断</div>{latest.inferences?.map((item, index) => <article key={index} style={{ padding: 10, background: "var(--surface2)", borderRadius: 10, marginTop: 8 }}><strong>{item.statement}</strong><p style={{ color: "var(--text2)", fontSize: ".72rem", marginTop: 5 }}>置信度 {(item.confidence * 100).toFixed(0)}% · {item.evidence_ids.join(" · ")}</p></article>)}</div>
        <div className="card"><div className="section-title">💡 建议</div>{latest.recommendations?.map((item, index) => <article key={index} style={{ padding: 10, background: "var(--surface2)", borderRadius: 10, marginTop: 8 }}><strong>{item.title}</strong><p style={{ color: "var(--text2)", marginTop: 5 }}>{item.reason}</p></article>)}</div>
        <div className="card"><div className="section-title">🙋 待人工确认</div>{latest.pending_confirmation?.map((item, index) => <p key={index} style={{ padding: 10, background: "rgba(245,158,11,.08)", color: "var(--amber)", borderRadius: 10, marginTop: 8 }}>{item}</p>)}</div>
      </section>}

      <section className="card" style={{ marginTop: 16 }}>
        <div className="section-title">📥 AI建议确认箱</div>
        {recommendations.length === 0 ? <p style={{ color: "var(--text2)" }}>尚无待确认AI建议。</p> : recommendations.map(item => <article key={item.id} style={{ padding: 11, background: "var(--surface2)", borderRadius: 10, marginTop: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}><div><strong>{item.title}</strong><p style={{ color: "var(--text2)", fontSize: ".78rem", marginTop: 5 }}>{item.recommendation_type} · {item.reason}</p></div><span className="tag tag-blue">{item.status}</span></div>
          <details style={{ marginTop: 9 }}><summary style={{ cursor: "pointer", color: "var(--cyan)" }}>落地预览（不会直接写入业务事实）</summary><pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", padding: 10, background: "var(--surface)", borderRadius: 8, marginTop: 8, fontSize: ".72rem" }}>{JSON.stringify(item.proposed_payload, null, 2)}</pre></details>
          {item.status === "pending_confirmation" && <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 9 }}><button className="btn-primary" disabled={saving} onClick={() => void operate("accept_recommendation", { recommendation_id: item.id, confirm: true })}>人工接受</button><input className="input" style={{ maxWidth: 300 }} placeholder="拒绝原因" value={rejectReason[item.id] || ""} onChange={event => setRejectReason({ ...rejectReason, [item.id]: event.target.value })}/><button className="btn-secondary" disabled={saving || !rejectReason[item.id]} onClick={() => void operate("reject_recommendation", { recommendation_id: item.id, reason: rejectReason[item.id] })}>拒绝</button></div>}
          {item.status === "accepted" && MATERIALIZABLE_TYPES.has(item.recommendation_type) && <div style={{ marginTop: 9 }}><button className="btn-primary" disabled={saving} onClick={() => void operate("materialize_recommendation", { recommendation_id: item.id, confirm_materialization: true })}>二次确认并生成业务草稿</button><p style={{ color: "var(--amber)", fontSize: ".75rem", marginTop: 6 }}>草稿只会进入风险/问题/变更/治理/决策/汇报/飞书/行动的真实状态机；不代表行动已经执行或完成。</p></div>}
          {item.status === "accepted" && !MATERIALIZABLE_TYPES.has(item.recommendation_type) && <p style={{ color: "var(--amber)", marginTop: 9 }}>该建议类型尚无安全的自动落地器，系统不会伪装为已执行；请进入对应业务模块人工建档。</p>}
          {item.status === "materialized" && <p style={{ color: "var(--green)", marginTop: 9 }}>已生成 {item.executed_resource_type || "下游草稿"}（{item.executed_resource_id}），等待所属业务流程继续处理。</p>}
        </article>)}
      </section>

      <section className="card" style={{ marginTop: 16 }}>
        <div className="section-title">🧪 AI效果评测</div>
        <p style={{ color: "var(--text2)", marginBottom: 10 }}>评测仅能提交给你在当前角色、组织、业务对象和数据分类下生成的运行记录；统一跟踪准确度、拒答、误报、漏报、采纳、人工修改和关闭效果。</p>
        {evaluationMetrics && <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(145px,1fr))", gap: 8, marginBottom: 12 }}>
          {[
            ["评测数", String(evaluationMetrics.evaluation_count)],
            ["准确度", evaluationMetrics.accuracy_rate == null ? "待评" : `${(evaluationMetrics.accuracy_rate * 100).toFixed(0)}%`],
            ["正确拒答", evaluationMetrics.correct_refusal_rate == null ? "待评" : `${(evaluationMetrics.correct_refusal_rate * 100).toFixed(0)}%`],
            ["误报率", evaluationMetrics.false_positive_rate == null ? "待评" : `${(evaluationMetrics.false_positive_rate * 100).toFixed(0)}%`],
            ["漏报率", evaluationMetrics.false_negative_rate == null ? "待评" : `${(evaluationMetrics.false_negative_rate * 100).toFixed(0)}%`],
            ["采纳率", evaluationMetrics.adoption_rate == null ? "待评" : `${(evaluationMetrics.adoption_rate * 100).toFixed(0)}%`],
            ["人工修改率", evaluationMetrics.human_modification_rate == null ? "待评" : `${(evaluationMetrics.human_modification_rate * 100).toFixed(0)}%`],
            ["关闭效果达成", evaluationMetrics.closure_effect_achieved_rate == null ? "待评" : `${(evaluationMetrics.closure_effect_achieved_rate * 100).toFixed(0)}%`],
          ].map(([label, value]) => <div key={label} style={{ background: "var(--surface2)", borderRadius: 9, padding: 10 }}><div style={{ color: "var(--text2)", fontSize: ".72rem" }}>{label}</div><strong>{value}</strong></div>)}
        </div>}
        {runs.filter(item => item.status === "succeeded").slice(0, 10).map(run => {
          const draft = evaluationDraft(run.id);
          const previous = evaluations.find(item => item.run_id === run.id);
          return <article key={run.id} style={{ padding: 12, background: "var(--surface2)", borderRadius: 10, marginTop: 9 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}><strong>{run.scenario} · {run.model_name || "已配置模型"}</strong>{previous && <span className="tag tag-blue">最近评测：{previous.rating || "-"}分 / {previous.verdict}</span>}</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 8, marginTop: 10 }}>
              <select className="input" value={draft.rating} onChange={event => updateEvaluation(run.id, { rating: event.target.value })}><option value="5">5分</option><option value="4">4分</option><option value="3">3分</option><option value="2">2分</option><option value="1">1分</option></select>
              <select className="input" value={draft.verdict} onChange={event => updateEvaluation(run.id, { verdict: event.target.value })}><option value="useful">有用</option><option value="accurate">准确</option><option value="partially_accurate">部分准确</option><option value="false_positive">误报</option><option value="missed_issue">遗漏问题</option><option value="unsafe">不安全</option><option value="not_useful">无用</option></select>
              <select className="input" value={draft.adopted} onChange={event => updateEvaluation(run.id, { adopted: event.target.value })}><option value="">是否采纳（可选）</option><option value="yes">已采纳</option><option value="no">未采纳</option></select>
              <input className="input" placeholder="实际结果（可选）" value={draft.outcome} onChange={event => updateEvaluation(run.id, { outcome: event.target.value })}/>
              <label style={{ color: "var(--text2)", fontSize: ".75rem" }}>准确度 0-100%<input className="input" type="number" min="0" max="100" value={Math.round(Number(draft.accuracyScore) * 100)} onChange={event => updateEvaluation(run.id, { accuracyScore: String(Number(event.target.value) / 100) })}/></label>
              <label style={{ color: "var(--text2)", fontSize: ".75rem" }}>拒答质量<select className="input" value={draft.refusalOutcome} onChange={event => updateEvaluation(run.id, { refusalOutcome: event.target.value })}><option value="not_applicable">未发生拒答</option><option value="correct">正确拒答</option><option value="incorrect">错误拒答</option></select></label>
              <label style={{ display: "flex", alignItems: "center", gap: 6 }}><input type="checkbox" checked={draft.falsePositive} onChange={event => updateEvaluation(run.id, { falsePositive: event.target.checked })}/>误报</label>
              <label style={{ display: "flex", alignItems: "center", gap: 6 }}><input type="checkbox" checked={draft.falseNegative} onChange={event => updateEvaluation(run.id, { falseNegative: event.target.checked })}/>漏报</label>
              <label style={{ display: "flex", alignItems: "center", gap: 6 }}><input type="checkbox" checked={draft.humanModified} onChange={event => updateEvaluation(run.id, { humanModified: event.target.checked })}/>人工修改</label>
              <label style={{ color: "var(--text2)", fontSize: ".75rem" }}>关闭效果<select className="input" value={draft.closureEffect} onChange={event => updateEvaluation(run.id, { closureEffect: event.target.value })}><option value="not_evaluated">未评估</option><option value="achieved">已达成</option><option value="partially_achieved">部分达成</option><option value="not_achieved">未达成</option><option value="too_early">评估过早</option></select></label>
            </div>
            {draft.humanModified && (
              <input className="input" style={{ width: "100%", marginTop: 8 }} placeholder="人工修改说明（必填）" value={draft.humanEditSummary} onChange={event => updateEvaluation(run.id, { humanEditSummary: event.target.value })}/>
            )}
            <textarea className="input" style={{ width: "100%", minHeight: 72, marginTop: 8 }} placeholder="纠错说明（可选）" value={draft.correction} onChange={event => updateEvaluation(run.id, { correction: event.target.value })}/>
            <button className="btn-primary" style={{ marginTop: 8 }} disabled={saving} onClick={() => submitEvaluation(run.id)}>提交效果评测</button>
          </article>;
        })}
      </section>
    </div>
  </main>;
}
