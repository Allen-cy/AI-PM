"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { FinanceAlert, FinanceCockpit, FinanceHealth, FinancePriority } from "@/features/finance/cockpit";
import { buildProjectControlWriteContract, loadCurrentBusinessContextSearchParams } from "@/features/operating-model/client-context";

interface FinanceResponse {
  status: "succeeded" | "not_configured" | "error" | "unauthorized";
  source?: "user" | "global" | "missing";
  detail?: string;
  lark_cli_hint?: string;
  cockpit?: FinanceCockpit;
  request_id: string;
}

const priorityColor: Record<FinancePriority, string> = {
  P0: "var(--red)",
  P1: "var(--amber)",
  P2: "var(--accent2)",
};

const healthLabel: Record<FinanceHealth, string> = {
  green: "健康",
  yellow: "关注",
  red: "预警",
};

const healthColor: Record<FinanceHealth, string> = {
  green: "var(--green)",
  yellow: "var(--amber)",
  red: "var(--red)",
};

function money(value: number): string {
  return `${Number(value || 0).toLocaleString("zh-CN", { maximumFractionDigits: 1 })}万`;
}

function percent(value: number): string {
  return `${Number(value || 0).toFixed(1)}%`;
}

function dueText(days: number | null): string {
  if (days === null) return "未设到期日";
  if (days < 0) return `逾期${Math.abs(days)}天`;
  if (days === 0) return "今日到期";
  return `${days}天后到期`;
}

async function fetchFinancePayload(): Promise<FinanceResponse> {
  const response = await fetch("/api/finance", { cache: "no-store" });
  const payload = await response.json() as FinanceResponse;
  if (!response.ok && payload.status !== "unauthorized") throw new Error(payload.detail || `HTTP_${response.status}`);
  return payload;
}

function StatCard({ label, value, sub, tone = "blue" }: { label: string; value: string; sub: string; tone?: "blue" | "green" | "amber" | "red" }) {
  const color = tone === "green" ? "var(--green)" : tone === "amber" ? "var(--amber)" : tone === "red" ? "var(--red)" : "var(--accent2)";
  return (
    <div className="stat-card" style={{ minHeight: 118 }}>
      <div className="stat-num" style={{ color, fontSize: "1.45rem" }}>{value}</div>
      <div className="stat-label">{label}</div>
      <div style={{ marginTop: 8, color: "var(--text2)", fontSize: "0.72rem", lineHeight: 1.5 }}>{sub}</div>
    </div>
  );
}

function SectionCard({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="card">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", marginBottom: 16 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: "0.95rem", fontWeight: 800 }}>{title}</h2>
          {hint && <p style={{ margin: "6px 0 0", color: "var(--text2)", fontSize: "0.78rem", lineHeight: 1.6 }}>{hint}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

function Bar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const width = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: "0.76rem", color: "var(--text2)", marginBottom: 5 }}>
        <span>{label}</span>
        <span>{money(value)}</span>
      </div>
      <div style={{ height: 8, borderRadius: 999, background: "var(--surface2)", overflow: "hidden" }}>
        <div style={{ width: `${width}%`, height: "100%", background: color, borderRadius: 999 }} />
      </div>
    </div>
  );
}

export default function FinancePage() {
  const [data, setData] = useState<FinanceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [savingAlert, setSavingAlert] = useState<string | null>(null);

  async function loadFinance() {
    setLoading(true);
    setError("");
    try {
      setData(await fetchFinancePayload());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    async function loadInitialFinance() {
      try {
        const payload = await fetchFinancePayload();
        if (!cancelled) setData(payload);
      } catch (e: unknown) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadInitialFinance();
    return () => {
      cancelled = true;
    };
  }, []);

  const cockpit = data?.cockpit;
  const maxPortfolio = useMemo(() => Math.max(1, ...(cockpit?.portfolioByLevel.map(item => item.contractAmount) ?? [1])), [cockpit]);

  async function convertAlertToAction(alert: FinanceAlert) {
    setSavingAlert(alert.id);
    setActionMessage("");
    try {
      const businessContext = await loadCurrentBusinessContextSearchParams();
      const response = await fetch(`/api/issue-change?${businessContext.toString()}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...buildProjectControlWriteContract("create_action", 0),
          operation: "create_action",
          title: alert.title,
          owner: alert.owner,
          dueDate: alert.dueDate,
          priority: alert.priority,
          projectName: alert.projectName,
          sourceType: "change",
          sourceId: alert.id,
          sourceReason: alert.reason,
        }),
      });
      const payload = await response.json().catch(() => ({})) as { status?: string; action?: { title?: string }; warning?: string };
      if (!response.ok || payload.status !== "succeeded") throw new Error(payload.warning || "经营预警转行动项失败。");
      setActionMessage(`已转入统一行动项：${payload.action?.title || alert.title}`);
    } catch (e: unknown) {
      setActionMessage(e instanceof Error ? e.message : "经营预警转行动项失败。");
    } finally {
      setSavingAlert(null);
    }
  }

  return (
    <main style={{ minHeight: "100vh", background: "var(--bg)" }}>
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
        <strong>💹 业财一体化经营驾驶舱</strong>
        <span className="tag tag-green">P7 经营闭环</span>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn-secondary" onClick={() => void loadFinance()} disabled={loading}>
            {loading ? "刷新中..." : "刷新飞书数据"}
          </button>
          <Link href="/dashboard" className="btn-secondary" style={{ textDecoration: "none" }}>项目组合看板</Link>
          <Link href="/business-finance" className="btn-primary" style={{ textDecoration: "none" }}>收益实现与情景分析</Link>
          <Link href="/contract" className="btn-secondary" style={{ textDecoration: "none" }}>合同回款</Link>
          <Link href="/closing" className="btn-secondary" style={{ textDecoration: "none" }}>收尾验收</Link>
        </div>
      </header>

      <div style={{ maxWidth: 1440, margin: "0 auto", padding: "28px 32px" }}>
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: "1.45rem", margin: "0 0 8px", fontWeight: 900 }}>项目经营结果、回款风险和验收阻塞一屏看清</h1>
          <p style={{ color: "var(--text2)", margin: 0, fontSize: "0.88rem", lineHeight: 1.7 }}>
            本页把合同、预算/成本、回款、应收、验收状态和项目进度关联在一起。AI 或规则只做经营预警排序，正式财务结果仍以飞书/财务系统字段为准。
          </p>
        </div>

        {loading && (
          <div className="card" style={{ marginBottom: 20, color: "var(--text2)" }}>正在读取经营数据...</div>
        )}

        {(error || data?.status === "unauthorized") && (
          <div className="card" style={{ marginBottom: 20, borderColor: "rgba(239,68,68,0.35)", color: "var(--red)" }}>
            {data?.detail || error || "请先登录后再查看经营驾驶舱。"}
          </div>
        )}

        {cockpit && (
          <>
            <div style={{
              marginBottom: 20,
              padding: "14px 16px",
              borderRadius: 12,
              border: `1px solid ${data?.status === "succeeded" ? "rgba(16,185,129,0.28)" : "rgba(245,158,11,0.35)"}`,
              background: data?.status === "succeeded" ? "rgba(16,185,129,0.08)" : "rgba(245,158,11,0.08)",
              color: "var(--text2)",
              fontSize: "0.82rem",
              lineHeight: 1.7,
            }}>
              <strong style={{ color: data?.status === "succeeded" ? "var(--green)" : "var(--amber)" }}>
                数据源：{cockpit.source.name}
              </strong>
              <span> · {cockpit.source.recordCount} 条项目记录 · {new Date(cockpit.source.generatedAt).toLocaleString("zh-CN")}</span>
              {cockpit.source.note && <span> · {cockpit.source.note}</span>}
              {data?.detail && <div style={{ marginTop: 6 }}>配置提示：{data.detail}</div>}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(6, minmax(0, 1fr))", gap: 14, marginBottom: 20 }}>
              <StatCard label="合同总额" value={money(cockpit.kpis.totalContract)} sub={`${cockpit.kpis.totalProjects} 个项目`} />
              <StatCard label="预计毛利率" value={percent(cockpit.kpis.grossMarginRate)} sub={`预计毛利 ${money(cockpit.kpis.grossMargin)}`} tone={cockpit.kpis.grossMarginRate < 18 ? "amber" : "green"} />
              <StatCard label="回款率" value={percent(cockpit.kpis.collectionRate)} sub={`已回款 ${money(cockpit.kpis.totalCollection)}`} tone={cockpit.kpis.collectionRate < 60 ? "amber" : "green"} />
              <StatCard label="应收金额" value={money(cockpit.kpis.receivable)} sub={`逾期 ${money(cockpit.kpis.overdueReceivable)}`} tone={cockpit.kpis.overdueReceivable > 0 ? "red" : "blue"} />
              <StatCard label="验收阻塞回款" value={money(cockpit.kpis.acceptanceBlockedReceivable)} sub="应收且验收/收尾未闭环" tone={cockpit.kpis.acceptanceBlockedReceivable > 0 ? "red" : "green"} />
              <StatCard label="预计成本" value={money(cockpit.kpis.estimatedCost)} sub={`预算 ${money(cockpit.kpis.totalBudget)} / 已发生 ${money(cockpit.kpis.actualCost)}`} tone={cockpit.kpis.estimatedCost > cockpit.kpis.totalBudget ? "amber" : "blue"} />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 }}>
              <SectionCard title="统一经营口径" hint="缺少真实成本字段时会标记为估算口径，避免把页面展示误当财务结论。">
                <div style={{ display: "grid", gap: 10 }}>
                  {cockpit.methodology.map(item => (
                    <div key={item.label} style={{ padding: "10px 12px", borderRadius: 10, background: "var(--surface2)", fontSize: "0.8rem", lineHeight: 1.6 }}>
                      <strong>{item.label}：</strong>
                      <span style={{ color: "var(--text2)" }}>{item.detail}</span>
                    </div>
                  ))}
                </div>
              </SectionCard>

              <SectionCard title="组合经营分布" hint="按项目等级聚合合同额、应收和预计毛利。">
                {cockpit.portfolioByLevel.map(item => (
                  <Bar key={item.name} label={`${item.name} · ${item.count}个 · 毛利率${percent(item.grossMarginRate)}`} value={item.contractAmount} max={maxPortfolio} color="var(--accent2)" />
                ))}
              </SectionCard>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "0.95fr 1.05fr", gap: 20, marginBottom: 20 }}>
              <SectionCard title="经营预警" hint="预警可转入 P5 统一行动项，形成责任人、deadline 和关闭证据闭环。">
                {actionMessage && (
                  <div style={{ marginBottom: 12, color: actionMessage.includes("失败") ? "var(--red)" : "var(--green)", fontSize: "0.82rem" }}>
                    {actionMessage}
                  </div>
                )}
                <div style={{ display: "grid", gap: 10 }}>
                  {cockpit.alerts.length === 0 && <p style={{ color: "var(--text2)", fontSize: "0.84rem" }}>暂无经营预警。</p>}
                  {cockpit.alerts.slice(0, 8).map(alert => (
                    <div key={alert.id} style={{ padding: 12, border: "1px solid var(--border)", borderRadius: 10, background: "var(--surface2)" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
                        <div>
                          <div style={{ fontWeight: 800 }}>{alert.title}</div>
                          <div style={{ marginTop: 5, color: "var(--text2)", fontSize: "0.78rem", lineHeight: 1.55 }}>{alert.reason}</div>
                          <div style={{ marginTop: 6, fontSize: "0.74rem", color: "var(--text2)" }}>{alert.owner} · {alert.dueDate}</div>
                        </div>
                        <span className="tag" style={{ color: priorityColor[alert.priority], background: "rgba(255,255,255,0.05)" }}>{alert.priority}</span>
                      </div>
                      <button className="btn-secondary" onClick={() => void convertAlertToAction(alert)} disabled={savingAlert === alert.id} style={{ marginTop: 10, fontSize: "0.74rem", padding: "5px 9px" }}>
                        {savingAlert === alert.id ? "写入中..." : "转行动项"}
                      </button>
                    </div>
                  ))}
                </div>
              </SectionCard>

              <SectionCard title="回款节点 × 验收联动" hint="应收、到期日、验收状态和收尾进度联动，优先暴露“验收阻塞回款”。">
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
                    <thead>
                      <tr style={{ color: "var(--text2)", borderBottom: "1px solid var(--border)" }}>
                        {["项目", "客户", "应收", "到期", "验收", "动作"].map(title => (
                          <th key={title} style={{ textAlign: "left", padding: "9px 8px", fontWeight: 800 }}>{title}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {cockpit.paymentAcceptanceLinks.slice(0, 8).map(item => (
                        <tr key={item.projectId} style={{ borderBottom: "1px solid var(--border)" }}>
                          <td style={{ padding: "10px 8px", fontWeight: 700 }}>{item.projectName}</td>
                          <td style={{ padding: "10px 8px", color: "var(--text2)" }}>{item.customer}</td>
                          <td style={{ padding: "10px 8px", color: "var(--amber)", fontWeight: 800 }}>{money(item.receivableAmount)}</td>
                          <td style={{ padding: "10px 8px", color: (item.daysUntilDue ?? 1) < 0 ? "var(--red)" : "var(--text2)" }}>{dueText(item.daysUntilDue)}</td>
                          <td style={{ padding: "10px 8px" }}>{item.acceptanceStatus}</td>
                          <td style={{ padding: "10px 8px", color: "var(--text2)", maxWidth: 260 }}>{item.nextAction}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </SectionCard>
            </div>

            <SectionCard title="项目经营明细" hint="按经营健康度、应收金额排序。成本来源为 derived 时表示飞书未提供真实成本字段。">
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
                  <thead>
                    <tr style={{ color: "var(--text2)", borderBottom: "1px solid var(--border)" }}>
                      {["项目", "合同/回款", "成本/毛利", "验收/应收", "健康", "下一步"].map(title => (
                        <th key={title} style={{ textAlign: "left", padding: "10px 8px", fontWeight: 800 }}>{title}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {cockpit.projects.slice(0, 16).map(project => (
                      <tr key={project.id} style={{ borderBottom: "1px solid var(--border)" }}>
                        <td style={{ padding: "12px 8px", minWidth: 190 }}>
                          <div style={{ fontWeight: 800 }}>{project.name}</div>
                          <div style={{ color: "var(--text2)", fontSize: "0.72rem", marginTop: 4 }}>{project.id} · {project.level}级 · {project.status}</div>
                        </td>
                        <td style={{ padding: "12px 8px" }}>
                          <div>合同 {money(project.contractAmount)}</div>
                          <div style={{ color: "var(--text2)", marginTop: 4 }}>回款 {money(project.collectedAmount)} · {percent(project.collectionRate)}</div>
                        </td>
                        <td style={{ padding: "12px 8px" }}>
                          <div>预计成本 {money(project.estimatedCost)}</div>
                          <div style={{ color: project.grossMarginRate < 18 ? "var(--amber)" : "var(--green)", marginTop: 4 }}>毛利率 {percent(project.grossMarginRate)} · {project.costSource}</div>
                        </td>
                        <td style={{ padding: "12px 8px" }}>
                          <div>{project.acceptanceStatus} · {project.acceptanceProgress}%</div>
                          <div style={{ color: project.daysOverdue > 0 ? "var(--red)" : "var(--text2)", marginTop: 4 }}>应收 {money(project.receivableAmount)} · {dueText(project.daysUntilDue)}</div>
                        </td>
                        <td style={{ padding: "12px 8px" }}>
                          <span className="tag" style={{ color: healthColor[project.businessHealth], background: "rgba(255,255,255,0.05)" }}>{healthLabel[project.businessHealth]}</span>
                          {project.riskFlags.length > 0 && <div style={{ marginTop: 6, color: "var(--text2)", fontSize: "0.72rem" }}>{project.riskFlags.slice(0, 2).join(" / ")}</div>}
                        </td>
                        <td style={{ padding: "12px 8px", color: "var(--text2)", maxWidth: 280 }}>{project.nextAction}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </SectionCard>
          </>
        )}
      </div>
    </main>
  );
}
