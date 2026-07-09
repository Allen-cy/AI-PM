"use client";

import { useEffect, useState } from "react";

type DeepCandidate = {
  id: string;
  outputType: string;
  outputTitle: string;
  moduleName: string;
  pageId: string;
  trigger: string;
  input: string;
  output: string;
  owner: string;
  nextAction: string;
  autoPersistRecommended: boolean;
};

type DeepPlan = {
  summary: {
    candidates: number;
    autoPersistRecommended: number;
    governanceOutputs: number;
    riskOutputs: number;
    planningOutputs: number;
    migrationOutputs: number;
    feishuOutputs: number;
    reportOutputs: number;
  };
  candidates: DeepCandidate[];
  boundary: string;
};

type DeepReferenceResponse = {
  status: string;
  warning?: string;
  migration?: string;
  created?: number;
  failed?: number;
  deepReferences?: DeepPlan;
};

const sourceLabel: Record<string, string> = {
  governance: "治理",
  risk: "风险",
  report: "报告",
  template: "模板",
  other: "其他",
  ai_answer: "AI",
};

export function KnowledgeDeepReferenceClient() {
  const [plan, setPlan] = useState<DeepPlan | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const response = await fetch("/api/knowledge/deep-references", { cache: "no-store" });
      const data = await response.json() as DeepReferenceResponse;
      if (!cancelled) {
        setPlan(data.deepReferences ?? null);
        if (!response.ok) setMessage(data.warning || data.migration || "深层引用链读取失败。");
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function persistRecommended() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/knowledge/deep-references", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: true }),
      });
      const data = await response.json() as DeepReferenceResponse;
      setPlan(data.deepReferences ?? plan);
      setMessage(response.ok
        ? `已写入深层知识引用链 ${data.created ?? 0} 条${data.failed ? `，失败 ${data.failed} 条` : ""}。`
        : data.warning || data.migration || "深层引用链写入失败。");
    } catch {
      setMessage("深层引用链写入请求失败。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card" style={{ marginBottom: 18, borderColor: "rgba(139,92,246,0.26)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div>
          <div className="section-title">🧭 深层业务输出知识引用链</div>
          <p style={{ color: "var(--text2)", lineHeight: 1.7, fontSize: "0.84rem" }}>
            将治理、风险、规划、迁移、飞书确认和报告工厂的深层输出绑定到具体知识 pageId，避免只在顶层问答/报告里有引用。
          </p>
        </div>
        <button className="btn-primary" type="button" disabled={busy || !plan} onClick={() => void persistRecommended()}>
          {busy ? "写入中..." : "写入推荐引用链"}
        </button>
      </div>

      {message && (
        <p style={{ color: message.includes("失败") || message.includes("未创建") ? "var(--amber)" : "var(--accent2)", lineHeight: 1.6, marginTop: 10 }}>
          {message}
        </p>
      )}

      {!plan ? (
        <p style={{ color: "var(--text2)", lineHeight: 1.6, marginTop: 12 }}>正在生成深层引用链候选...</p>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10, marginTop: 12 }}>
            {[
              ["候选", plan.summary.candidates],
              ["推荐写入", plan.summary.autoPersistRecommended],
              ["治理", plan.summary.governanceOutputs],
              ["风险", plan.summary.riskOutputs],
              ["规划", plan.summary.planningOutputs],
              ["迁移", plan.summary.migrationOutputs],
              ["飞书", plan.summary.feishuOutputs],
              ["报告", plan.summary.reportOutputs],
            ].map(([label, value]) => (
              <div key={label} style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 10, padding: 10 }}>
                <div style={{ color: "var(--text2)", fontSize: "0.72rem" }}>{label}</div>
                <strong style={{ fontSize: "1.05rem" }}>{value}</strong>
              </div>
            ))}
          </div>

          <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
            {plan.candidates.map(candidate => (
              <article key={candidate.id} style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 12, padding: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "flex-start" }}>
                  <div>
                    <strong>{candidate.outputTitle}</strong>
                    <p style={{ color: "var(--text2)", lineHeight: 1.6, fontSize: "0.78rem", marginTop: 6 }}>
                      {candidate.moduleName} · 引用知识：{candidate.pageId} · 责任人：{candidate.owner}
                    </p>
                  </div>
                  <span className={candidate.autoPersistRecommended ? "tag tag-purple" : "tag"}>{sourceLabel[candidate.outputType] || candidate.outputType}</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 8, marginTop: 10 }}>
                  <p style={{ color: "var(--text2)", fontSize: "0.76rem", lineHeight: 1.55, margin: 0 }}>触发：{candidate.trigger}</p>
                  <p style={{ color: "var(--text2)", fontSize: "0.76rem", lineHeight: 1.55, margin: 0 }}>输入：{candidate.input}</p>
                  <p style={{ color: "var(--accent2)", fontSize: "0.76rem", lineHeight: 1.55, margin: 0 }}>输出：{candidate.output}</p>
                </div>
                <p style={{ color: "var(--text)", fontSize: "0.78rem", lineHeight: 1.6, marginTop: 8 }}>下一步：{candidate.nextAction}</p>
              </article>
            ))}
          </div>
          <p style={{ color: "var(--text2)", fontSize: "0.76rem", lineHeight: 1.6, marginTop: 12 }}>{plan.boundary}</p>
        </>
      )}
    </section>
  );
}
