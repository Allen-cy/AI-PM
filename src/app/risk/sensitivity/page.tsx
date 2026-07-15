"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { loadCurrentBusinessContextSearchParams, readStoredCurrentProject } from "@/features/operating-model/client-context";
import {
  buildSensitivityReport,
  calculateSensitivity,
  sensitivityTemplates,
  type SensitivityFactor,
} from "@/lib/risk-analytics";

function downloadText(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function normalizeNumber(value: string, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export default function RiskSensitivityPage() {
  const [projectName, setProjectName] = useState("");
  const [factors, setFactors] = useState<SensitivityFactor[]>(sensitivityTemplates);
  const [message, setMessage] = useState("");
  const [impactApiHref, setImpactApiHref] = useState("/risk");

  useEffect(() => {
    let cancelled = false;
    void loadCurrentBusinessContextSearchParams()
      .then(async params => {
        const projectId = readStoredCurrentProject();
        if (projectId) params.set("project_id", projectId);
        if (!cancelled) setImpactApiHref(`/api/risk/sensitivity-impact?${params.toString()}`);
        if (!projectId) return;
        const context = params.get("role");
        const response = await fetch(`/api/monitoring?project_id=${encodeURIComponent(projectId)}&business_role=${encodeURIComponent(context || "pm")}&data_class=${encodeURIComponent(params.get("data_class") || "production")}`, { cache: "no-store" });
        const body = await response.json() as { data?: { project?: { name?: string } } };
        if (!cancelled && response.ok && body.data?.project?.name) setProjectName(body.data.project.name);
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  const results = useMemo(() => calculateSensitivity(factors), [factors]);
  const report = useMemo(() => buildSensitivityReport(projectName, factors, results), [projectName, factors, results]);
  const maxSwing = Math.max(1, ...results.map(result => result.swing));

  const updateFactor = (id: string, patch: Partial<SensitivityFactor>) => {
    setFactors(prev => prev.map(factor => factor.id === id ? { ...factor, ...patch } : factor));
    setMessage("");
  };

  const addFactor = () => {
    setFactors(prev => [
      ...prev,
      {
        id: `factor-${Date.now()}`,
        name: "新增敏感因素",
        baseline: 100,
        low: 80,
        high: 120,
        unit: "",
        direction: "negative",
        note: "",
      },
    ]);
  };

  const removeFactor = (id: string) => {
    setFactors(prev => prev.filter(factor => factor.id !== id));
  };

  const downloadReport = () => {
    downloadText(`${projectName || "项目"}-风险敏感性分析报告.md`, report);
    setMessage("敏感性分析报告已生成并下载。");
  };

  return (
    <main style={{ minHeight: "100vh", background: "var(--bg)", padding: 32 }}>
      <div style={{ maxWidth: 1360, margin: "0 auto" }}>
        <header style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", marginBottom: 24 }}>
          <div>
            <Link href="/risk" style={{ color: "var(--text2)", textDecoration: "none", fontSize: "0.86rem" }}>← 返回风险管理</Link>
            <h1 style={{ marginTop: 12, fontSize: "1.8rem" }}>风险敏感性分析</h1>
            <p style={{ color: "var(--text2)", lineHeight: 1.7, marginTop: 8 }}>
              使用者录入关键变量的基准值、低值、高值和影响方向，系统计算敏感度排序，输出龙卷风图和可下载分析报告。
            </p>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <Link href="/templates" className="btn-secondary" style={{ textDecoration: "none" }}>下载/导入模板</Link>
            <button className="btn-primary" onClick={downloadReport}>下载分析报告</button>
          </div>
        </header>

        {message && (
          <div style={{ marginBottom: 18, padding: "12px 14px", borderRadius: 12, background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.25)", color: "var(--green)", fontWeight: 700 }}>
            {message}
          </div>
        )}

        <section className="card" style={{ marginBottom: 22, background: "linear-gradient(135deg, rgba(59,130,246,0.08), rgba(245,158,11,0.08))" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 18, alignItems: "center" }}>
            <div>
              <div className="section-title"><span>🔗</span>系统联动口径</div>
              <div style={{ color: "var(--text2)", fontSize: "0.84rem", lineHeight: 1.7 }}>
                当前页面用于手工录入变量并下载项目级分析报告；项目组合看板和报告工厂会通过
                <code style={{ margin: "0 4px", padding: "2px 6px", borderRadius: 6, background: "var(--surface2)" }}>/api/risk/sensitivity-impact</code>
                从飞书/当前项目台账自动生成“敏感性影响包”。影响包只输出健康矩阵建议和报告事实，不自动写回飞书，不自动改变项目健康状态。
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
              <Link href="/dashboard" className="btn-secondary" style={{ textDecoration: "none" }}>查看项目健康矩阵</Link>
              <Link href="/reports" className="btn-secondary" style={{ textDecoration: "none" }}>进入报告工厂</Link>
              <a href={impactApiHref} target="_blank" rel="noopener noreferrer" className="btn-secondary" style={{ textDecoration: "none" }}>查看影响包API</a>
            </div>
          </div>
        </section>

        <section className="card" style={{ marginBottom: 22 }}>
          <div className="section-title"><span>📥</span>输入信息</div>
          <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 16, alignItems: "start" }}>
            <div>
              <label className="label">项目名称</label>
              <input className="input" value={projectName} onChange={event => setProjectName(event.target.value)} placeholder="填写项目名称" />
              <div style={{ marginTop: 12, color: "var(--text2)", fontSize: "0.78rem", lineHeight: 1.7 }}>
                参考来源：敏感性分析模板中的投资、销售收入、经营成本变量；系统扩展到项目管理常用的交付延期和回款延迟变量。
              </div>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
                <thead>
                  <tr style={{ color: "var(--text2)", borderBottom: "1px solid var(--border)" }}>
                    <th style={{ padding: 8, textAlign: "left" }}>因素</th>
                    <th style={{ padding: 8, textAlign: "left" }}>基准</th>
                    <th style={{ padding: 8, textAlign: "left" }}>低值</th>
                    <th style={{ padding: 8, textAlign: "left" }}>高值</th>
                    <th style={{ padding: 8, textAlign: "left" }}>单位</th>
                    <th style={{ padding: 8, textAlign: "left" }}>方向</th>
                    <th style={{ padding: 8 }} />
                  </tr>
                </thead>
                <tbody>
                  {factors.map(factor => (
                    <tr key={factor.id} style={{ borderBottom: "1px solid var(--surface2)" }}>
                      <td style={{ padding: 8, minWidth: 150 }}>
                        <input className="input" value={factor.name} onChange={event => updateFactor(factor.id, { name: event.target.value })} />
                      </td>
                      <td style={{ padding: 8, minWidth: 100 }}>
                        <input className="input" value={factor.baseline} onChange={event => updateFactor(factor.id, { baseline: normalizeNumber(event.target.value, factor.baseline) })} />
                      </td>
                      <td style={{ padding: 8, minWidth: 100 }}>
                        <input className="input" value={factor.low} onChange={event => updateFactor(factor.id, { low: normalizeNumber(event.target.value, factor.low) })} />
                      </td>
                      <td style={{ padding: 8, minWidth: 100 }}>
                        <input className="input" value={factor.high} onChange={event => updateFactor(factor.id, { high: normalizeNumber(event.target.value, factor.high) })} />
                      </td>
                      <td style={{ padding: 8, minWidth: 90 }}>
                        <input className="input" value={factor.unit || ""} onChange={event => updateFactor(factor.id, { unit: event.target.value })} />
                      </td>
                      <td style={{ padding: 8, minWidth: 130 }}>
                        <select className="input" value={factor.direction} onChange={event => updateFactor(factor.id, { direction: event.target.value as SensitivityFactor["direction"] })}>
                          <option value="positive">正向收益</option>
                          <option value="negative">负向影响</option>
                        </select>
                      </td>
                      <td style={{ padding: 8 }}>
                        <button className="btn-secondary" style={{ padding: "6px 10px" }} onClick={() => removeFactor(factor.id)}>删除</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button className="btn-secondary" style={{ marginTop: 12 }} onClick={addFactor}>新增敏感因素</button>
            </div>
          </div>
        </section>

        <div style={{ display: "grid", gridTemplateColumns: "1.1fr 0.9fr", gap: 20 }}>
          <section className="card">
            <div className="section-title"><span>🌪️</span>龙卷风图 / 敏感度排序</div>
            <div style={{ display: "grid", gap: 12 }}>
              {results.map(result => (
                <div key={result.factorId} style={{ display: "grid", gridTemplateColumns: "180px 1fr 80px", gap: 12, alignItems: "center" }}>
                  <div style={{ fontWeight: 800, fontSize: "0.82rem" }}>#{result.rank} {result.name}</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2, alignItems: "center", height: 28 }}>
                    <div style={{ display: "flex", justifyContent: "flex-end" }}>
                      <div style={{ width: `${Math.max(6, Math.abs(result.lowImpact) / maxSwing * 100)}%`, height: 16, borderRadius: "999px 0 0 999px", background: "rgba(59,130,246,0.55)" }} />
                    </div>
                    <div>
                      <div style={{ width: `${Math.max(6, Math.abs(result.highImpact) / maxSwing * 100)}%`, height: 16, borderRadius: "0 999px 999px 0", background: "rgba(245,158,11,0.7)" }} />
                    </div>
                  </div>
                  <div style={{ color: "var(--text2)", fontSize: "0.78rem", textAlign: "right" }}>{result.swing.toFixed(1)}</div>
                  <div />
                  <div style={{ color: "var(--text2)", fontSize: "0.74rem", lineHeight: 1.5 }}>{result.interpretation}</div>
                  <div />
                </div>
              ))}
            </div>
          </section>

          <section className="card">
            <div className="section-title"><span>📤</span>输出成果</div>
            <div style={{ color: "var(--text2)", fontSize: "0.84rem", lineHeight: 1.7, marginBottom: 14 }}>
              输出不是理论说明，而是可用于评审会、PMO例会和风险登记册复核的正式分析摘要。
            </div>
            <pre style={{
              whiteSpace: "pre-wrap",
              maxHeight: 520,
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
          </section>
        </div>
      </div>
    </main>
  );
}
