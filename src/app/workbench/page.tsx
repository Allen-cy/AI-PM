"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Workbench = {
  kpis: Array<{ label: string; value: string; hint: string; status: string }>;
  actions: Array<{ id: string; priority: string; title: string; owner: string; due: string; source: string; action: string }>;
  keyProjects: Array<{ name: string; status: string; progress: string; risk: string; next: string }>;
  aiSuggestions: Array<{ title: string; basis: string; confirmation: string }>;
};

type WorkbenchResponse = {
  status: string;
  source: string;
  detail?: string;
  generated_at?: string;
  workbench: Workbench;
};

const priorityColor: Record<string, string> = {
  P0: "var(--red)",
  P1: "var(--amber)",
  P2: "var(--accent2)",
};

export default function WorkbenchPage() {
  const [data, setData] = useState<WorkbenchResponse | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const response = await fetch("/api/operating-system/workbench", { cache: "no-store" });
        const body = await response.json();
        if (!cancelled) setData(body);
      } catch {
        if (!cancelled) setError("无法生成工作台摘要，请稍后重试。");
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const workbench = data?.workbench;

  return (
    <main style={{ minHeight: "100vh", background: "var(--bg)", padding: "28px 32px" }}>
      <div style={{ maxWidth: 1180, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, marginBottom: 24 }}>
          <div>
            <Link href="/" style={{ color: "var(--accent2)", textDecoration: "none", fontSize: "0.86rem" }}>← 返回首页</Link>
            <h1 style={{ fontSize: "1.9rem", fontWeight: 800, marginTop: 12 }}>PM/PMO 每日工作台</h1>
            <p style={{ color: "var(--text2)", marginTop: 8, lineHeight: 1.7 }}>
              把项目台账、风险、重点项目和经营提醒汇总成今日行动清单。AI 建议只作为辅助排序，最终由项目经理或 PMO 确认。
            </p>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Link href="/dashboard" className="btn-secondary" style={{ textDecoration: "none" }}>项目组合看板</Link>
            <Link href="/risk" className="btn-secondary" style={{ textDecoration: "none" }}>风险管理</Link>
          </div>
        </div>

        {error && <div className="card" style={{ borderColor: "var(--red)", color: "var(--red)", marginBottom: 18 }}>{error}</div>}

        {!workbench ? (
          <div className="card" aria-busy="true">正在生成今日工作台...</div>
        ) : (
          <>
            {data?.detail && (
              <div className="card" style={{ borderColor: "var(--amber)", color: "var(--amber)", marginBottom: 18 }}>
                {data.detail}
              </div>
            )}

            <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14, marginBottom: 18 }}>
              {workbench.kpis.map(kpi => (
                <div key={kpi.label} className="card">
                  <div style={{ color: "var(--text2)", fontSize: "0.82rem", marginBottom: 10 }}>{kpi.label}</div>
                  <div style={{ fontSize: "1.8rem", fontWeight: 800 }}>{kpi.value}</div>
                  <p style={{ color: "var(--text2)", fontSize: "0.8rem", lineHeight: 1.5, marginTop: 8 }}>{kpi.hint}</p>
                </div>
              ))}
            </section>

            <section className="card" style={{ marginBottom: 18 }}>
              <div className="section-title">✅ 今日优先动作</div>
              <div style={{ display: "grid", gap: 12 }}>
                {workbench.actions.map(action => (
                  <div key={action.id} style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 10, padding: 16 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span className="tag" style={{ background: `${priorityColor[action.priority]}22`, color: priorityColor[action.priority] }}>{action.priority}</span>
                        <strong>{action.title}</strong>
                      </div>
                      <span style={{ color: "var(--text2)", fontSize: "0.82rem" }}>{action.owner} · {action.due}</span>
                    </div>
                    <p style={{ color: "var(--text2)", lineHeight: 1.6, fontSize: "0.84rem" }}>依据：{action.source}</p>
                    <p style={{ color: "var(--accent2)", lineHeight: 1.6, fontSize: "0.84rem", marginTop: 6 }}>动作：{action.action}</p>
                  </div>
                ))}
              </div>
            </section>

            <section style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.2fr) minmax(320px, 0.8fr)", gap: 18 }}>
              <div className="card">
                <div className="section-title">⭐ 重点项目进度链</div>
                {workbench.keyProjects.length === 0 ? (
                  <p style={{ color: "var(--text2)", lineHeight: 1.7 }}>暂无重点项目数据。请在飞书项目台账补充“重点项目标记”或等待看板规则自动识别。</p>
                ) : (
                  <div style={{ display: "grid", gap: 12 }}>
                    {workbench.keyProjects.map(project => (
                      <div key={project.name} style={{ borderTop: "1px solid var(--border)", paddingTop: 12 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                          <strong>{project.name}</strong>
                          <span className="tag tag-blue">{project.status}</span>
                        </div>
                        <p style={{ color: "var(--text2)", fontSize: "0.82rem", marginTop: 8 }}>{project.progress}</p>
                        <p style={{ color: "var(--amber)", fontSize: "0.82rem", marginTop: 6 }}>{project.risk}</p>
                        <p style={{ color: "var(--accent2)", fontSize: "0.82rem", marginTop: 6 }}>{project.next}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="card">
                <div className="section-title">🧠 AI 今日建议</div>
                <div style={{ display: "grid", gap: 12 }}>
                  {workbench.aiSuggestions.map(item => (
                    <div key={item.title} style={{ background: "var(--surface2)", borderRadius: 10, padding: 14 }}>
                      <strong>{item.title}</strong>
                      <p style={{ color: "var(--text2)", fontSize: "0.82rem", lineHeight: 1.6, marginTop: 8 }}>依据：{item.basis}</p>
                      <p style={{ color: "var(--amber)", fontSize: "0.82rem", lineHeight: 1.6, marginTop: 6 }}>人工确认：{item.confirmation}</p>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <p style={{ color: "var(--text2)", fontSize: "0.76rem", marginTop: 14 }}>
              数据来源：{data?.source || "未知"}{data?.generated_at ? `；生成时间：${new Date(data.generated_at).toLocaleString("zh-CN")}` : ""}
            </p>
          </>
        )}
      </div>
    </main>
  );
}
