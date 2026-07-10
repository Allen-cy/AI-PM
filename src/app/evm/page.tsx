"use client";

import { useState } from "react";
import Link from "next/link";
import { calculateEVMFromPeriods, generateSCurveFromPeriods, type EVMDataPoint } from "@/lib/evm";

interface EVMResult {
  totalPV: number;
  totalAC: number;
  totalEV: number;
  sv: number;
  cv: number;
  spi: number;
  cpi: number;
  eac: number;
  etc: number;
  vac: number;
  status: "on-track" | "ahead" | "behind" | "over-budget" | "under-budget";
  health: "green" | "yellow" | "red";
  interpretation: string;
}

// Test data
const TEST_DATA: EVMDataPoint[] = [
  { period: "第1月", plannedValue: 15, actualCost: 12, completionPercent: 80, earnedValue: 12 },
  { period: "第2月", plannedValue: 35, actualCost: 38, completionPercent: 85, earnedValue: 29.75 },
  { period: "第3月", plannedValue: 60, actualCost: 55, completionPercent: 90, earnedValue: 54 },
  { period: "第4月", plannedValue: 80, actualCost: 85, completionPercent: 95, earnedValue: 76 },
  { period: "第5月", plannedValue: 95, actualCost: 100, completionPercent: 100, earnedValue: 95 },
  { period: "第6月", plannedValue: 100, actualCost: 105, completionPercent: 100, earnedValue: 100 },
];

const BAC = 100; // 万元

export default function EVMPage() {
  const [projectName] = useState("智慧校园系统开发");
  const [periods] = useState<EVMDataPoint[]>(TEST_DATA);
  const [result, setResult] = useState<EVMResult | null>(null);
  const [sCurveData, setSCurveData] = useState<{ period: string; pv: number; ev: number; ac: number }[]>([]);
  const [useAI, setUseAI] = useState(false);
  const [isCalculating, setIsCalculating] = useState(false);
  const [aiReasoning, setAiReasoning] = useState("");

  const handleCalculate = () => {
    const res = calculateEVMFromPeriods(periods, BAC);
    setResult(res);
    setSCurveData(generateSCurveFromPeriods(periods));
    setAiReasoning("");
  };

  const handleAICalculate = async () => {
    setIsCalculating(true);
    try {
      const response = await fetch("/api/evm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectName,
          tasks: periods.map(p => ({
            period: p.period,
            plannedValue: p.plannedValue,
            actualCost: p.actualCost,
            completionPercent: p.completionPercent,
          })),
          budgetAtCompletion: BAC,
        }),
      });
      const data = await response.json();
      if (data.error) {
        alert("AI计算失败: " + data.error);
      } else {
        const res = calculateEVMFromPeriods(periods, BAC);
        setResult(res);
        setSCurveData(generateSCurveFromPeriods(periods));
        setAiReasoning(data.aiReasoning || "");
      }
    } catch (error) {
      alert("AI计算失败: " + (error instanceof Error ? error.message : "未知错误"));
    } finally {
      setIsCalculating(false);
    }
  };

  const healthColor = result?.health === "green" ? "var(--green)" : result?.health === "yellow" ? "var(--amber)" : "var(--red)";

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
        <span style={{ fontWeight: 700 }}>📊 挣值分析</span>
        <span className="tag tag-purple" style={{ fontSize: "0.7rem" }}>本地算法</span>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.8rem", cursor: "pointer", marginLeft: 8 }}>
          <input type="checkbox" checked={useAI} onChange={e => setUseAI(e.target.checked)} />
          <span style={{ color: useAI ? "var(--purple)" : "var(--text2)" }}>AI增强</span>
        </label>
      </header>

      <main style={{ flex: 1, padding: "32px", maxWidth: 1100, margin: "0 auto", width: "100%" }}>
        {/* Project Info */}
        <div style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius)",
          padding: "20px 24px",
          marginBottom: 24,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}>
          <div>
            <div style={{ fontSize: "0.75rem", color: "var(--text2)", marginBottom: 4 }}>项目名称</div>
            <div style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--purple)" }}>{projectName}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: "0.75rem", color: "var(--text2)", marginBottom: 4 }}>完工预算 BAC</div>
            <div style={{ fontSize: "1.1rem", fontWeight: 700 }}>¥{BAC}万元</div>
          </div>
          <div style={{ display: "flex", gap: 12 }}>
            <button className="btn-secondary" onClick={handleCalculate} style={{ fontSize: "0.8rem", padding: "8px 16px" }}>
              📊 本地计算
            </button>
            <button
              className="btn-primary"
              onClick={useAI ? handleAICalculate : handleCalculate}
              disabled={isCalculating}
              style={{ fontSize: "0.8rem", padding: "8px 16px" }}
            >
              {isCalculating ? "🤖 AI计算中..." : useAI ? "🤖 AI分析" : "📊 计算EVM"}
            </button>
          </div>
        </div>

        {/* Period Input Table */}
        <div style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius)",
          padding: "28px",
          marginBottom: 24,
        }}>
          <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--text2)", marginBottom: 20, textTransform: "uppercase", letterSpacing: "0.1em" }}>
            各周期EVM数据
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
              <thead>
                <tr style={{ borderBottom: "2px solid var(--border)" }}>
                  {["周期", "计划价值 PV", "实际成本 AC", "完成百分比", "挣值 EV"].map(h => (
                    <th key={h} style={{ textAlign: "center", padding: "10px 12px", color: "var(--accent2)", fontWeight: 600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {periods.map((p, i) => (
                  <tr key={p.period} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td style={{ padding: "10px 12px", textAlign: "center", fontWeight: 700, color: "var(--accent2)" }}>{p.period}</td>
                    <td style={{ padding: "10px 12px", textAlign: "center" }}>{p.plannedValue}万</td>
                    <td style={{ padding: "10px 12px", textAlign: "center" }}>{p.actualCost}万</td>
                    <td style={{ padding: "10px 12px", textAlign: "center" }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                        <div style={{
                          width: 80,
                          height: 6,
                          background: "var(--surface2)",
                          borderRadius: 3,
                          overflow: "hidden",
                        }}>
                          <div style={{
                            width: `${p.completionPercent}%`,
                            height: "100%",
                            background: p.completionPercent >= 80 ? "var(--green)" : p.completionPercent >= 50 ? "var(--amber)" : "var(--red)",
                            borderRadius: 3,
                          }} />
                        </div>
                        <span style={{ color: "var(--text2)", minWidth: 40 }}>{p.completionPercent}%</span>
                      </div>
                    </td>
                    <td style={{ padding: "10px 12px", textAlign: "center", color: "var(--green)", fontWeight: 600 }}>
                      {p.earnedValue.toFixed(1)}万
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Results */}
        {result && (
          <>
            {/* Summary Cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 24 }}>
              <div className="stat-card">
                <div className="stat-num" style={{ color: "var(--accent2)" }}>¥{result.totalPV.toFixed(0)}万</div>
                <div className="stat-label">计划价值 PV</div>
              </div>
              <div className="stat-card">
                <div className="stat-num" style={{ color: "var(--green)" }}>¥{result.totalEV.toFixed(1)}万</div>
                <div className="stat-label">挣值 EV</div>
              </div>
              <div className="stat-card">
                <div className="stat-num" style={{ color: "var(--amber)" }}>¥{result.totalAC.toFixed(0)}万</div>
                <div className="stat-label">实际成本 AC</div>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 24 }}>
              <div className="stat-card">
                <div className="stat-num" style={{ color: result.sv >= 0 ? "var(--green)" : "var(--red)" }}>
                  {result.sv >= 0 ? "+" : ""}{result.sv.toFixed(1)}万
                </div>
                <div className="stat-label">进度偏差 SV</div>
              </div>
              <div className="stat-card">
                <div className="stat-num" style={{ color: result.cv >= 0 ? "var(--green)" : "var(--red)" }}>
                  {result.cv >= 0 ? "+" : ""}{result.cv.toFixed(1)}万
                </div>
                <div className="stat-label">成本偏差 CV</div>
              </div>
              <div className="stat-card">
                <div className="stat-num" style={{ color: result.spi >= 1 ? "var(--green)" : "var(--red)" }}>
                  {(result.spi * 100).toFixed(1)}%
                </div>
                <div className="stat-label">SPI 进度绩效</div>
              </div>
              <div className="stat-card">
                <div className="stat-num" style={{ color: result.cpi >= 1 ? "var(--green)" : "var(--red)" }}>
                  {(result.cpi * 100).toFixed(1)}%
                </div>
                <div className="stat-label">CPI 成本绩效</div>
              </div>
            </div>

            {/* Forecast & Health */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 24 }}>
              <div style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius)",
                padding: "24px",
              }}>
                <div style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--text2)", marginBottom: 16, textTransform: "uppercase", letterSpacing: "0.1em" }}>
                  完工预测
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.9rem" }}>
                    <span style={{ color: "var(--text2)" }}>完工估算 EAC</span>
                    <span style={{ fontWeight: 700, color: result.eac > BAC ? "var(--red)" : "var(--green)" }}>¥{result.eac.toFixed(1)}万</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.9rem" }}>
                    <span style={{ color: "var(--text2)" }}>完工尚需 ETC</span>
                    <span style={{ fontWeight: 700 }}>¥{result.etc.toFixed(1)}万</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.9rem" }}>
                    <span style={{ color: "var(--text2)" }}>完工偏差 VAC</span>
                    <span style={{ fontWeight: 700, color: result.vac >= 0 ? "var(--green)" : "var(--red)" }}>
                      {result.vac >= 0 ? "+" : ""}¥{result.vac.toFixed(1)}万
                    </span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.9rem" }}>
                    <span style={{ color: "var(--text2)" }}>预算剩余</span>
                    <span style={{ fontWeight: 700 }}>¥{(BAC - result.totalAC).toFixed(1)}万</span>
                  </div>
                </div>
              </div>

              <div style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius)",
                padding: "24px",
              }}>
                <div style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--text2)", marginBottom: 16, textTransform: "uppercase", letterSpacing: "0.1em" }}>
                  项目健康度
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 16 }}>
                  <div style={{
                    width: 64,
                    height: 64,
                    borderRadius: "50%",
                    background: `${healthColor}22`,
                    border: `3px solid ${healthColor}`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "1.5rem",
                    fontWeight: 800,
                    color: healthColor,
                  }}>
                    {result.cpi >= 1 ? "✓" : "!"}
                  </div>
                  <div>
                    <div style={{ fontSize: "1rem", fontWeight: 700, color: healthColor }}>
                      {result.status === "on-track" ? "✓ 进度正常" :
                        result.status === "ahead" ? "↑ 进度超前" :
                          result.status === "behind" ? "↓ 进度落后" :
                            result.status === "over-budget" ? "⚠ 成本超支" : "✓ 成本节约"}
                    </div>
                    <div style={{ color: "var(--text2)", fontSize: "0.82rem", marginTop: 4 }}>
                      SPI={(result.spi * 100).toFixed(1)}% | CPI={(result.cpi * 100).toFixed(1)}%
                    </div>
                  </div>
                </div>
                <div style={{
                  background: `${healthColor}11`,
                  border: `1px solid ${healthColor}44`,
                  borderRadius: 8,
                  padding: "12px 16px",
                  fontSize: "0.85rem",
                  color: "var(--text2)",
                  lineHeight: 1.6,
                }}>
                  {result.interpretation}
                </div>
              </div>
            </div>

            {/* AI Reasoning */}
            {aiReasoning && (
              <div style={{
                background: "var(--surface)",
                border: "1px solid var(--purple)",
                borderRadius: "var(--radius)",
                padding: "24px",
                marginBottom: 24,
              }}>
                <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--purple)", marginBottom: 16, textTransform: "uppercase", letterSpacing: "0.1em" }}>
                  🤖 AI推理分析
                </div>
                <div style={{ fontSize: "0.85rem", color: "var(--text)", whiteSpace: "pre-wrap", lineHeight: 1.7 }}>
                  {aiReasoning}
                </div>
              </div>
            )}

            {/* S-Curve Chart */}
            <div style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius)",
              padding: "28px",
            }}>
              <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--text2)", marginBottom: 20, textTransform: "uppercase", letterSpacing: "0.1em" }}>
                📈 S曲线 — PV/EV/AC对比
              </div>
              <div style={{ display: "flex", gap: 24, justifyContent: "center", marginBottom: 16 }}>
                {[
                  { color: "var(--accent)", label: "计划价值 PV" },
                  { color: "var(--green)", label: "挣值 EV" },
                  { color: "var(--amber)", label: "实际成本 AC" },
                ].map(item => (
                  <div key={item.label} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.82rem" }}>
                    <div style={{ width: 24, height: 3, background: item.color, borderRadius: 2 }} />
                    <span style={{ color: "var(--text2)" }}>{item.label}</span>
                  </div>
                ))}
              </div>

              {/* S-Curve Visualization */}
              <div style={{
                position: "relative",
                height: 200,
                padding: "20px 40px",
              }}>
                {/* Y-axis labels */}
                <div style={{ position: "absolute", left: 0, top: 20, bottom: 40, width: 40, display: "flex", flexDirection: "column", justifyContent: "space-between", fontSize: "0.7rem", color: "var(--text2)", textAlign: "right", paddingRight: 8 }}>
                  <span>100</span>
                  <span>75</span>
                  <span>50</span>
                  <span>25</span>
                  <span>0</span>
                </div>

                {/* Chart area */}
                <div style={{ position: "absolute", left: 50, right: 10, top: 20, bottom: 40 }}>
                  {/* Grid lines */}
                  {[0, 25, 50, 75, 100].map(v => (
                    <div key={v} style={{
                      position: "absolute",
                      left: 0,
                      right: 0,
                      top: `${100 - v}%`,
                      borderBottom: "1px dashed var(--border)",
                      opacity: 0.5,
                    }} />
                  ))}

                  {/* Lines */}
                  <svg width="100%" height="100%" style={{ position: "absolute", top: 0, left: 0 }}>
                    {/* PV line */}
                    <polyline
                      points={sCurveData.map((d, i) => {
                        const x = (i / (sCurveData.length - 1)) * 100;
                        const y = 100 - (d.pv / 100) * 100;
                        return `${x}%,${y}%`;
                      }).join(" ")}
                      fill="none"
                      stroke="var(--accent)"
                      strokeWidth="2.5"
                      strokeOpacity="0.7"
                    />
                    {/* EV line */}
                    <polyline
                      points={sCurveData.map((d, i) => {
                        const x = (i / (sCurveData.length - 1)) * 100;
                        const y = 100 - (d.ev / 100) * 100;
                        return `${x}%,${y}%`;
                      }).join(" ")}
                      fill="none"
                      stroke="var(--green)"
                      strokeWidth="2.5"
                    />
                    {/* AC line */}
                    <polyline
                      points={sCurveData.map((d, i) => {
                        const x = (i / (sCurveData.length - 1)) * 100;
                        const y = 100 - (d.ac / 100) * 100;
                        return `${x}%,${y}%`;
                      }).join(" ")}
                      fill="none"
                      stroke="var(--amber)"
                      strokeWidth="2.5"
                      strokeOpacity="0.8"
                    />
                  </svg>

                  {/* Data points */}
                  {sCurveData.map((d, i) => {
                    const x = (i / (sCurveData.length - 1)) * 100;
                    return (
                      <div key={d.period} style={{
                        position: "absolute",
                        left: `${x}%`,
                        top: "50%",
                        transform: "translate(-50%, -50%)",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: 4,
                      }}>
                        <div style={{
                          width: 8,
                          height: 8,
                          borderRadius: "50%",
                          background: i === sCurveData.length - 1 ? "var(--green)" : "var(--purple)",
                          border: "2px solid var(--surface)",
                        }} />
                        <div style={{ fontSize: "0.68rem", color: "var(--text2)", marginTop: 4 }}>{d.period}</div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Legend with values */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginTop: 20, fontSize: "0.82rem" }}>
                <div style={{ textAlign: "center", padding: "12px", background: "var(--surface2)", borderRadius: 8 }}>
                  <div style={{ color: "var(--accent)", fontWeight: 700, fontSize: "1rem" }}>¥{result.totalPV.toFixed(0)}万</div>
                  <div style={{ color: "var(--text2)" }}>计划价值 PV</div>
                </div>
                <div style={{ textAlign: "center", padding: "12px", background: "var(--surface2)", borderRadius: 8 }}>
                  <div style={{ color: "var(--green)", fontWeight: 700, fontSize: "1rem" }}>¥{result.totalEV.toFixed(1)}万</div>
                  <div style={{ color: "var(--text2)" }}>挣值 EV</div>
                </div>
                <div style={{ textAlign: "center", padding: "12px", background: "var(--surface2)", borderRadius: 8 }}>
                  <div style={{ color: "var(--amber)", fontWeight: 700, fontSize: "1rem" }}>¥{result.totalAC.toFixed(0)}万</div>
                  <div style={{ color: "var(--text2)" }}>实际成本 AC</div>
                </div>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
