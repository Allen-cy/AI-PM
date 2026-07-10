"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Contract,
  PaymentMilestone,
  TEST_CONTRACTS,
  calculateCollectionRate,
  calculatePaidAmount,
  calculateUnpaidAmount,
  getOverduePayments,
  forecastCollection,
  getStatusColor,
  getStatusLabel,
} from "@/lib/contract";

// Collection Forecast Chart Component
function CollectionForecastChart({ forecasts }: { forecasts: { monthLabel: string; amount: number; contractCount: number }[] }) {
  const maxAmount = Math.max(...forecasts.map(f => f.amount), 1);

  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 16, height: 100, paddingTop: 10 }}>
      {forecasts.map((f, i) => (
        <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
          <div style={{
            width: "100%",
            height: `${(f.amount / maxAmount) * 80}px`,
            minHeight: f.amount > 0 ? 20 : 4,
            background: i === 0 ? "var(--amber)" : "var(--accent)",
            borderRadius: "6px 6px 0 0",
            transition: "height 0.3s ease",
          }} />
          <span style={{ fontSize: "0.7rem", fontWeight: 600, color: "var(--text)" }}>{f.amount}万</span>
          <span style={{ fontSize: "0.65rem", color: "var(--text2)" }}>{f.monthLabel}</span>
          <span style={{ fontSize: "0.6rem", color: "var(--text2)" }}>{f.contractCount}个</span>
        </div>
      ))}
    </div>
  );
}

// Payment Milestone Timeline Component
function MilestoneTimeline({ milestones, contractTotal }: { milestones: PaymentMilestone[]; contractTotal: number }) {
  const today = new Date();

  const getNodeColor = (m: PaymentMilestone) => {
    switch (m.status) {
      case "paid": return "var(--green)";
      case "pending": return "var(--amber)";
      case "overdue": return "var(--red)";
      case "unpaid": return "var(--text2)";
      default: return "var(--text2)";
    }
  };

  const getNodeLabel = (m: PaymentMilestone) => {
    if (m.status === "paid") return "✓";
    if (m.status === "overdue") return "!";
    return "";
  };

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 0, position: "relative" }}>
        {/* Timeline line */}
        <div style={{
          position: "absolute",
          top: 12,
          left: 12,
          right: 12,
          height: 3,
          background: "var(--border)",
          borderRadius: 2,
        }} />

        {milestones.map((m, i) => {
          const dueDate = new Date(m.dueDate);
          const isOverdue = m.status === "overdue";
          const isPaid = m.status === "paid";
          const isFuture = dueDate > today && !isPaid && !isOverdue;

          return (
            <div key={m.id} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", position: "relative" }}>
              {/* Node */}
              <div style={{
                width: 24,
                height: 24,
                borderRadius: "50%",
                background: getNodeColor(m),
                border: `3px solid var(--surface)`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "0.65rem",
                fontWeight: 800,
                color: "white",
                zIndex: 1,
                boxShadow: isOverdue ? `0 0 0 3px rgba(239,68,68,0.3)` : "none",
              }}>
                {getNodeLabel(m)}
              </div>

              {/* Content */}
              <div style={{
                marginTop: 8,
                padding: "8px 4px",
                background: isOverdue ? "rgba(239,68,68,0.08)" : "var(--surface2)",
                border: `1px solid ${isOverdue ? "var(--red)" : "var(--border)"}`,
                borderRadius: 8,
                width: "100%",
                textAlign: "center",
              }}>
                <div style={{ fontSize: "0.7rem", fontWeight: 600, color: getNodeColor(m), marginBottom: 4 }}>
                  {m.amount}万
                </div>
                <div style={{ fontSize: "0.65rem", color: "var(--text)", marginBottom: 2, lineHeight: 1.3 }}>
                  {m.name}
                </div>
                <div style={{ fontSize: "0.6rem", color: isOverdue ? "var(--red)" : "var(--text2)" }}>
                  {m.dueDate}
                </div>
                <div style={{
                  marginTop: 4,
                  fontSize: "0.6rem",
                  fontWeight: 600,
                  color: getNodeColor(m),
                  padding: "2px 6px",
                  borderRadius: 4,
                  background: `${getNodeColor(m)}20`,
                }}>
                  {getStatusLabel(m.status)}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Contract Card Component
function ContractCard({ contract, onViewDetails }: { contract: Contract; onViewDetails: (c: Contract) => void }) {
  const collectionRate = calculateCollectionRate(contract);
  const paidAmount = calculatePaidAmount(contract);
  const unpaidAmount = calculateUnpaidAmount(contract);
  const hasOverdue = contract.milestones.some(m => m.status === "overdue");

  return (
    <div style={{
      background: "var(--surface)",
      border: `1px solid ${hasOverdue ? "var(--red)" : "var(--border)"}`,
      borderRadius: "var(--radius)",
      padding: "20px",
      marginBottom: 16,
    }}>
      {/* Contract Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
            <span style={{ fontSize: "0.7rem", fontFamily: "monospace", color: "var(--accent)" }}>{contract.id}</span>
            {hasOverdue && (
              <span className="tag" style={{ fontSize: "0.65rem", background: "rgba(239,68,68,0.15)", color: "var(--red)" }}>
                存在逾期
              </span>
            )}
          </div>
          <h3 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: 4 }}>{contract.name}</h3>
          <div style={{ fontSize: "0.8rem", color: "var(--text2)" }}>
            甲方: {contract.partyA} | 乙方: {contract.partyB}
          </div>
        </div>
        <button
          className="btn-secondary"
          onClick={() => onViewDetails(contract)}
          style={{ fontSize: "0.75rem", padding: "6px 12px" }}
        >
          查看详情
        </button>
      </div>

      {/* Stats Row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 16 }}>
        <div style={{ textAlign: "center", padding: "10px", background: "var(--surface2)", borderRadius: 8 }}>
          <div style={{ fontSize: "0.65rem", color: "var(--text2)", marginBottom: 4 }}>合同总额</div>
          <div style={{ fontSize: "1rem", fontWeight: 800, color: "var(--text)" }}>{contract.totalAmount}万</div>
        </div>
        <div style={{ textAlign: "center", padding: "10px", background: "rgba(16,185,129,0.1)", borderRadius: 8 }}>
          <div style={{ fontSize: "0.65rem", color: "var(--text2)", marginBottom: 4 }}>已回款</div>
          <div style={{ fontSize: "1rem", fontWeight: 800, color: "var(--green)" }}>{paidAmount}万</div>
        </div>
        <div style={{ textAlign: "center", padding: "10px", background: "rgba(245,158,11,0.1)", borderRadius: 8 }}>
          <div style={{ fontSize: "0.65rem", color: "var(--text2)", marginBottom: 4 }}>未回款</div>
          <div style={{ fontSize: "1rem", fontWeight: 800, color: "var(--amber)" }}>{unpaidAmount}万</div>
        </div>
        <div style={{ textAlign: "center", padding: "10px", background: collectionRate >= 50 ? "rgba(16,185,129,0.1)" : "rgba(239,68,68,0.1)", borderRadius: 8 }}>
          <div style={{ fontSize: "0.65rem", color: "var(--text2)", marginBottom: 4 }}>回款率</div>
          <div style={{ fontSize: "1rem", fontWeight: 800, color: collectionRate >= 50 ? "var(--green)" : "var(--red)" }}>
            {collectionRate.toFixed(0)}%
          </div>
        </div>
      </div>

      {/* Progress Bar */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
          <span style={{ fontSize: "0.75rem", color: "var(--text2)" }}>回款进度</span>
          <span style={{ fontSize: "0.75rem", fontWeight: 600 }}>{collectionRate.toFixed(1)}%</span>
        </div>
        <div style={{ height: 8, background: "var(--surface2)", borderRadius: 4, overflow: "hidden" }}>
          <div style={{
            width: `${collectionRate}%`,
            height: "100%",
            background: collectionRate >= 50 ? "var(--green)" : "var(--amber)",
            borderRadius: 4,
            transition: "width 0.3s ease",
          }} />
        </div>
      </div>

      {/* Milestone Timeline */}
      <MilestoneTimeline milestones={contract.milestones} contractTotal={contract.totalAmount} />
    </div>
  );
}

// Contract Details Modal
function ContractDetailsModal({ contract, onClose }: { contract: Contract; onClose: () => void }) {
  const collectionRate = calculateCollectionRate(contract);
  const paidAmount = calculatePaidAmount(contract);
  const unpaidAmount = calculateUnpaidAmount(contract);

  return (
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
      padding: 20,
    }} onClick={onClose}>
      <div style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius)",
        maxWidth: 800,
        width: "100%",
        maxHeight: "90vh",
        overflow: "auto",
        padding: 24,
      }} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
          <div>
            <span style={{ fontSize: "0.7rem", fontFamily: "monospace", color: "var(--accent)", marginBottom: 4, display: "block" }}>{contract.id}</span>
            <h2 style={{ fontSize: "1.3rem", fontWeight: 800 }}>{contract.name}</h2>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: "1.5rem", cursor: "pointer", color: "var(--text2)" }}>×</button>
        </div>

        {/* Contract Info */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
          <div style={{ padding: 12, background: "var(--surface2)", borderRadius: 8 }}>
            <div style={{ fontSize: "0.7rem", color: "var(--text2)", marginBottom: 4 }}>甲方（客户）</div>
            <div style={{ fontSize: "0.9rem", fontWeight: 600 }}>{contract.partyA}</div>
          </div>
          <div style={{ padding: 12, background: "var(--surface2)", borderRadius: 8 }}>
            <div style={{ fontSize: "0.7rem", color: "var(--text2)", marginBottom: 4 }}>乙方（我方）</div>
            <div style={{ fontSize: "0.9rem", fontWeight: 600 }}>{contract.partyB}</div>
          </div>
          <div style={{ padding: 12, background: "var(--surface2)", borderRadius: 8 }}>
            <div style={{ fontSize: "0.7rem", color: "var(--text2)", marginBottom: 4 }}>合同总额</div>
            <div style={{ fontSize: "1.1rem", fontWeight: 800, color: "var(--accent)" }}>{contract.totalAmount}万</div>
          </div>
          <div style={{ padding: 12, background: "var(--surface2)", borderRadius: 8 }}>
            <div style={{ fontSize: "0.7rem", color: "var(--text2)", marginBottom: 4 }}>签订日期</div>
            <div style={{ fontSize: "0.9rem", fontWeight: 600 }}>{contract.signedDate}</div>
          </div>
        </div>

        {/* Financial Summary */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 24 }}>
          <div style={{ padding: 16, background: "rgba(16,185,129,0.1)", borderRadius: 10, textAlign: "center" }}>
            <div style={{ fontSize: "0.7rem", color: "var(--text2)", marginBottom: 6 }}>已回款</div>
            <div style={{ fontSize: "1.5rem", fontWeight: 800, color: "var(--green)" }}>{paidAmount}万</div>
          </div>
          <div style={{ padding: 16, background: "rgba(245,158,11,0.1)", borderRadius: 10, textAlign: "center" }}>
            <div style={{ fontSize: "0.7rem", color: "var(--text2)", marginBottom: 6 }}>未回款</div>
            <div style={{ fontSize: "1.5rem", fontWeight: 800, color: "var(--amber)" }}>{unpaidAmount}万</div>
          </div>
          <div style={{ padding: 16, background: collectionRate >= 50 ? "rgba(16,185,129,0.1)" : "rgba(239,68,68,0.1)", borderRadius: 10, textAlign: "center" }}>
            <div style={{ fontSize: "0.7rem", color: "var(--text2)", marginBottom: 6 }}>回款率</div>
            <div style={{ fontSize: "1.5rem", fontWeight: 800, color: collectionRate >= 50 ? "var(--green)" : "var(--red)" }}>{collectionRate.toFixed(1)}%</div>
          </div>
        </div>

        {/* Milestones Table */}
        <div style={{ marginBottom: 20 }}>
          <h3 style={{ fontSize: "0.9rem", fontWeight: 700, marginBottom: 12, color: "var(--text2)" }}>付款里程碑</h3>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
            <thead>
              <tr style={{ background: "var(--surface2)" }}>
                {["里程碑", "金额", "到期日", "实际付款日", "状态"].map(h => (
                  <th key={h} style={{ padding: "10px 8px", textAlign: "left", fontWeight: 600, color: "var(--text2)", borderBottom: "1px solid var(--border)" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {contract.milestones.map(m => (
                <tr key={m.id} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "10px 8px", fontWeight: 500 }}>{m.name}</td>
                  <td style={{ padding: "10px 8px", color: "var(--green)", fontWeight: 600 }}>{m.amount}万</td>
                  <td style={{ padding: "10px 8px", color: m.status === "overdue" ? "var(--red)" : "var(--text2)" }}>{m.dueDate}</td>
                  <td style={{ padding: "10px 8px", color: m.actualPaidDate ? "var(--green)" : "var(--text2)" }}>{m.actualPaidDate || "-"}</td>
                  <td style={{ padding: "10px 8px" }}>
                    <span style={{
                      padding: "3px 8px",
                      borderRadius: 12,
                      fontSize: "0.7rem",
                      fontWeight: 600,
                      background: `${getStatusColor(m.status)}20`,
                      color: getStatusColor(m.status),
                    }}>
                      {getStatusLabel(m.status)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// AI Parse Modal
function AIParseModal({ onClose, onParsed }: { onClose: () => void; onParsed: (milestones: PaymentMilestone[]) => void }) {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ milestones: PaymentMilestone[]; reasoning: string } | null>(null);

  const handleParse = async () => {
    if (!input.trim()) {
      setError("请输入付款条件文本");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/contract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "parse", text: input }),
      });
      const data = await response.json();

      if (!response.ok) throw new Error(data.error || "解析失败");

      setResult({ milestones: data.milestones, reasoning: data.aiReasoning });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
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
      padding: 20,
    }} onClick={onClose}>
      <div style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius)",
        maxWidth: 700,
        width: "100%",
        maxHeight: "90vh",
        overflow: "auto",
        padding: 24,
      }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h2 style={{ fontSize: "1.1rem", fontWeight: 800 }}>AI 付款条件解析</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: "1.5rem", cursor: "pointer", color: "var(--text2)" }}>×</button>
        </div>

        <textarea
          className="input"
          rows={6}
          placeholder={"例如：合同签订后5个工作日内支付30%预付款（100万）；系统部署完成初验合格后支付40%（150万）；终验合格后7个工作日内支付20%（80万）；一年质保期满后支付剩余10%（50万）"}
          value={input}
          onChange={e => setInput(e.target.value)}
          style={{ resize: "vertical", fontSize: "0.85rem", marginBottom: 16 }}
        />

        {error && (
          <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid var(--red)", borderRadius: 8, padding: "10px 14px", color: "var(--red)", fontSize: "0.85rem", marginBottom: 12 }}>
            {error}
          </div>
        )}

        <button
          className="btn-primary"
          onClick={handleParse}
          disabled={loading}
          style={{ width: "100%", opacity: loading ? 0.6 : 1, background: "var(--green)" }}
        >
          {loading ? "🤖 AI解析中..." : "🔍 解析付款条件"}
        </button>

        {result && (
          <div style={{ marginTop: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <span style={{ color: "var(--green)" }}>✓</span>
              <span style={{ fontWeight: 700, fontSize: "0.9rem" }}>解析完成</span>
              <span className="tag tag-green">{result.milestones.length} 个里程碑</span>
            </div>

            {result.reasoning && (
              <div style={{ fontSize: "0.8rem", color: "var(--text2)", marginBottom: 12, padding: "8px 12px", background: "var(--surface2)", borderRadius: 6 }}>
                {result.reasoning}
              </div>
            )}

            <div style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 8, padding: 16, fontFamily: "monospace", fontSize: "0.8rem" }}>
              <pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>
                {JSON.stringify(result.milestones, null, 2)}
              </pre>
            </div>

            <div style={{ marginTop: 16, display: "flex", gap: 12 }}>
              <button
                className="btn-secondary"
                onClick={() => { onParsed(result.milestones); onClose(); }}
                style={{ flex: 1 }}
              >
                应用到合同
              </button>
              <button
                className="btn-secondary"
                onClick={onClose}
                style={{ flex: 1 }}
              >
                关闭
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Main Page Component
export default function ContractPage() {
  const [contracts] = useState<Contract[]>(TEST_CONTRACTS);
  const [selectedContract, setSelectedContract] = useState<Contract | null>(null);
  const [showAIParser, setShowAIParser] = useState(false);

  // Calculate overall metrics
  const totalContractAmount = contracts.reduce((sum, c) => sum + c.totalAmount, 0);
  const totalPaid = contracts.reduce((sum, c) => sum + calculatePaidAmount(c), 0);
  const totalUnpaid = contracts.reduce((sum, c) => sum + calculateUnpaidAmount(c), 0);
  const overallCollectionRate = totalContractAmount > 0 ? (totalPaid / totalContractAmount) * 100 : 0;
  const overduePayments = getOverduePayments(contracts);
  const forecast = forecastCollection(contracts, 3);

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
        <span style={{ fontWeight: 700 }}>合同与回款管理</span>
        <span className="tag tag-green" style={{ fontSize: "0.7rem" }}>智能解析</span>
      </header>

      <main style={{ flex: 1, padding: "24px 32px", maxWidth: 1200, margin: "0 auto", width: "100%" }}>
        {/* KPI Stats Row */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 16, marginBottom: 24 }}>
          <div className="stat-card">
            <div className="stat-label">合同总额</div>
            <div className="stat-num" style={{ color: "var(--text)" }}>{totalContractAmount}万</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">已回款</div>
            <div className="stat-num" style={{ color: "var(--green)" }}>{totalPaid}万</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">未回款</div>
            <div className="stat-num" style={{ color: "var(--amber)" }}>{totalUnpaid}万</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">整体回款率</div>
            <div className="stat-num" style={{ color: overallCollectionRate >= 50 ? "var(--green)" : "var(--red)" }}>{overallCollectionRate.toFixed(1)}%</div>
          </div>
          <div className="stat-card" style={{ borderColor: overduePayments.length > 0 ? "var(--red)" : undefined }}>
            <div className="stat-label">逾期付款</div>
            <div className="stat-num" style={{ color: "var(--red)" }}>{overduePayments.length}</div>
          </div>
        </div>

        {/* Actions Row */}
        <div style={{ display: "flex", gap: 12, marginBottom: 24 }}>
          <button
            className="btn-primary"
            onClick={() => setShowAIParser(true)}
            style={{ background: "var(--green)" }}
          >
            🤖 AI解析付款条件
          </button>
        </div>

        {/* Collection Forecast */}
        <div className="card" style={{ marginBottom: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div className="section-title" style={{ margin: 0 }}>
              📈 未来3个月回款预测
            </div>
            <span style={{ fontSize: "0.75rem", color: "var(--text2)" }}>单位: 万元</span>
          </div>
          <CollectionForecastChart forecasts={forecast} />
          <div style={{ display: "flex", gap: 20, marginTop: 12, justifyContent: "center" }}>
            <span style={{ fontSize: "0.7rem", color: "var(--amber)" }}>
              <span style={{ display: "inline-block", width: 12, height: 12, background: "var(--amber)", borderRadius: 2, marginRight: 4 }} />
              本月
            </span>
            <span style={{ fontSize: "0.7rem", color: "var(--accent)" }}>
              <span style={{ display: "inline-block", width: 12, height: 12, background: "var(--accent)", borderRadius: 2, marginRight: 4 }} />
              未来月
            </span>
          </div>
        </div>

        {/* Contract List */}
        <div className="section-title" style={{ marginBottom: 16 }}>
          📑 合同列表 ({contracts.length})
        </div>

        {contracts.map(contract => (
          <ContractCard
            key={contract.id}
            contract={contract}
            onViewDetails={setSelectedContract}
          />
        ))}

        {/* Legend */}
        <div style={{ marginTop: 24, padding: "16px 20px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)" }}>
          <div style={{ fontSize: "0.8rem", fontWeight: 700, marginBottom: 12, color: "var(--text2)" }}>图例说明</div>
          <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
            {[
              { color: "var(--green)", label: "已回款" },
              { color: "var(--amber)", label: "待付款" },
              { color: "var(--red)", label: "逾期" },
              { color: "var(--text2)", label: "未付款" },
            ].map(item => (
              <div key={item.label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 12, height: 12, borderRadius: "50%", background: item.color }} />
                <span style={{ fontSize: "0.75rem", color: "var(--text2)" }}>{item.label}</span>
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* Modals */}
      {selectedContract && (
        <ContractDetailsModal
          contract={selectedContract}
          onClose={() => setSelectedContract(null)}
        />
      )}

      {showAIParser && (
        <AIParseModal
          onClose={() => setShowAIParser(false)}
          onParsed={(milestones) => console.log("Parsed milestones:", milestones)}
        />
      )}
    </div>
  );
}
