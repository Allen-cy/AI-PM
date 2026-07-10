"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type LifecycleKey =
  | "risks" | "issues" | "changes" | "actions" | "governance" | "signals" | "evidence"
  | "lifecycleStates" | "lifecycleEvents" | "corrections" | "reportingSnapshots"
  | "metricObservations"
  | "decisionBriefs" | "decisions" | "costs" | "contracts" | "payments"
  | "benefitBaselines" | "benefitReviews" | "closureAssessments"
  | "knowledgeCandidates" | "knowledgeReuse"
  | "retrospectives" | "knowledgeRecommendations";
type Project360Response = {
  error?: string;
  detail?: string;
  data_class?: string;
  project?: Record<string, unknown>;
  lifecycle?: Record<LifecycleKey, Array<Record<string, unknown>>>;
  context?: { businessRole?: string };
};

const SECTIONS: Array<{ key: LifecycleKey; label: string; hint: string; link?: string }> = [
  { key: "signals", label: "管理信号", hint: "待核实、待处理和待升级的统一例外" },
  { key: "risks", label: "风险", hint: "识别、分析、应对与监督" },
  { key: "issues", label: "问题", hint: "已经发生并需要解决的事项" },
  { key: "changes", label: "变更", hint: "范围、进度、成本和合同影响" },
  { key: "actions", label: "行动项", hint: "责任人、期限、证据和效果复核" },
  { key: "governance", label: "治理流程", hint: "阶段门、审批与决策状态" },
  { key: "lifecycleStates", label: "生命周期对象", hint: "项目、基线、交付物、变更、汇报和收尾的当前状态" },
  { key: "lifecycleEvents", label: "状态流转", hint: "每次流转的角色、前后状态与证据轨迹" },
  { key: "corrections", label: "反馈与纠偏", hint: "事实异议、误报、补证和状态纠正闭环" },
  { key: "reportingSnapshots", label: "汇报快照", hint: "PM/运营向 PMO 与 CEO 汇报的冻结事实" },
  { key: "metricObservations", label: "指标事实与可信度", hint: "当前值、基线、预测、数据截止时间、新鲜度和可信状态" },
  { key: "decisionBriefs", label: "决策事项", hint: "待决问题、备选方案、建议和验收标准", link: "/decision-center" },
  { key: "decisions", label: "决策结论", hint: "CEO/发起人决策、理由、条件和生效时间", link: "/decision-center" },
  { key: "costs", label: "成本与挣值", hint: "计划价值、实际成本和挣值的期间事实", link: "/business-finance" },
  { key: "contracts", label: "合同", hint: "项目合同、金额和签约事实", link: "/business-finance" },
  { key: "payments", label: "回款里程碑", hint: "应收、到期、逾期与实收状态", link: "/business-finance" },
  { key: "benefitBaselines", label: "收益基线", hint: "经营收益目标、预测、实绩和责任人", link: "/business-finance" },
  { key: "benefitReviews", label: "收益复核", hint: "月度、季度、G6 与退出复核结论", link: "/business-finance" },
  { key: "closureAssessments", label: "正式收尾门禁", hint: "关闭条件、阻塞项与审批状态", link: "/closure-knowledge" },
  { key: "knowledgeCandidates", label: "复盘知识候选", hint: "从本项目沉淀、待评审或已发布的知识", link: "/closure-knowledge" },
  { key: "knowledgeReuse", label: "知识复用效果", hint: "经验推荐、采纳、应用和效果复核", link: "/closure-knowledge" },
  { key: "retrospectives", label: "项目复盘", hint: "目标、结果、偏差、根因、决策、效果和经验", link: "/closure-knowledge/retrospective" },
  { key: "knowledgeRecommendations", label: "相似知识推荐", hint: "新项目或异常场景下的案例、模板与历史决策", link: "/closure-knowledge/retrospective" },
  { key: "evidence", label: "证据", hint: "支持状态和结论的可验证依据" },
];

function value(record: Record<string, unknown>, keys: string[], fallback = "-"): string {
  for (const key of keys) {
    const current = record[key];
    if (current !== undefined && current !== null && current !== "") return String(current);
  }
  return fallback;
}

export default function Project360Page() {
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const projectId = String(params.id || "");
  const role = search.get("role") || "pm";
  const [dataClass, setDataClass] = useState(search.get("data_class") || "production");
  const [data, setData] = useState<Project360Response | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const query = new URLSearchParams({ role, data_class: dataClass });
      try {
        const response = await fetch(`/api/projects/${projectId}/360?${query.toString()}`, { cache: "no-store" });
        const body = await response.json() as Project360Response;
        if (!cancelled) setData(body);
      } catch {
        if (!cancelled) setData({ error: "PROJECT_360_LOAD_FAILED", detail: "项目360加载失败，请稍后重试。" });
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [dataClass, projectId, role]);

  const project = data?.project ?? {};
  const lifecycle = data?.lifecycle;
  const totalOpen = useMemo(() => SECTIONS.reduce((sum, item) => sum + (lifecycle?.[item.key]?.length ?? 0), 0), [lifecycle]);

  return (
    <main style={{ minHeight: "100vh", background: "var(--bg)" }}>
      <header style={{ padding: "15px 28px", borderBottom: "1px solid var(--border)", background: "var(--surface)", display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <Link href="/workbench" style={{ color: "var(--text2)", textDecoration: "none" }}>← 返回工作台</Link>
        <strong style={{ color: "var(--accent2)" }}>项目360</strong>
        <span className="tag tag-purple">{role.toUpperCase()}</span>
        <Link href={`/projects/${projectId}/lifecycle?business_role=${role}&data_class=${dataClass}`} className="btn-secondary" style={{ textDecoration: "none" }}>生命周期与证据</Link>
        <Link href={`/projects/${projectId}/impact-packages?role=${role}&data_class=${dataClass}`} className="btn-secondary" style={{ textDecoration: "none" }}>业务影响包</Link>
        <Link href="/business-assistant" className="btn-secondary" style={{ textDecoration: "none" }}>PM/运营助理</Link>
        <Link href="/role-assistant" className="btn-secondary" style={{ textDecoration: "none" }}>角色AI助理</Link>
        <Link href="/decision-center" className="btn-secondary" style={{ textDecoration: "none" }}>决策中心</Link>
        <Link href="/business-finance" className="btn-secondary" style={{ textDecoration: "none" }}>业财收益</Link>
        <Link href="/closure-knowledge" className="btn-secondary" style={{ textDecoration: "none" }}>收尾与知识</Link>
        <label style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8, color: "var(--text2)", fontSize: "0.8rem" }}>
          数据空间
          <select className="input" style={{ width: 130, padding: "6px 9px" }} value={dataClass} onChange={event => setDataClass(event.target.value)}>
            <option value="production">正式数据</option>
            <option value="test">测试数据</option>
            <option value="sample">样例数据</option>
            <option value="diagnostic">诊断数据</option>
          </select>
        </label>
      </header>
      <div style={{ maxWidth: 1440, margin: "0 auto", padding: "28px" }}>
        {loading && <section className="card">正在加载项目360...</section>}
        {!loading && data?.error && (
          <section className="card" style={{ borderColor: "rgba(239,68,68,.45)" }}>
            <h1 style={{ fontSize: "1.15rem", color: "var(--red)" }}>项目360暂不可用</h1>
            <p style={{ color: "var(--text2)", lineHeight: 1.7, marginTop: 8 }}>{data.detail || data.error}</p>
            {data.error === "DATA_CLASS_MISMATCH" && <p style={{ color: "var(--amber)", marginTop: 8 }}>请在右上角切换到该项目所属的数据空间；系统不会把测试数据混入正式经营视图。</p>}
          </section>
        )}
        {!loading && !data?.error && lifecycle && (
          <>
            <section className="card" style={{ marginBottom: 18 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 18, flexWrap: "wrap" }}>
                <div>
                  <div style={{ color: "var(--text2)", fontSize: "0.8rem" }}>项目ID · {projectId}</div>
                  <h1 style={{ marginTop: 6, fontSize: "1.55rem" }}>{value(project, ["name"], "未命名项目")}</h1>
                  <div style={{ color: "var(--text2)", marginTop: 8 }}>
                    {value(project, ["oa_no", "project_code"])} · {value(project, ["status"])} · {value(project, ["project_level"])}级
                  </div>
                </div>
                <div style={{ display: "flex", gap: 12 }}>
                  <div className="stat-card"><div className="stat-num">{value(project, ["progress"], "0")}%</div><div className="stat-label">项目进度</div></div>
                  <div className="stat-card"><div className="stat-num">{totalOpen}</div><div className="stat-label">关联业务对象</div></div>
                </div>
              </div>
            </section>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 16 }}>
              {SECTIONS.map(section => {
                const rows = lifecycle[section.key] ?? [];
                return (
                  <section className="card" key={section.key}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                      <div><h2 style={{ fontSize: "1rem" }}>{section.label}</h2><p style={{ color: "var(--text2)", fontSize: "0.76rem", marginTop: 5 }}>{section.hint}</p></div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        {section.link && <Link href={section.link} style={{ color: "var(--accent2)", fontSize: "0.75rem", textDecoration: "none" }}>进入管理 →</Link>}
                        <span className="tag tag-blue">{rows.length}</span>
                      </div>
                    </div>
                    <div style={{ display: "grid", gap: 8, marginTop: 14, maxHeight: 270, overflow: "auto" }}>
                      {rows.length === 0 && <div style={{ color: "var(--text2)", fontSize: "0.82rem" }}>当前没有记录。</div>}
                      {rows.slice(0, 20).map((row, index) => (
                        <article key={value(row, ["id"], String(index))} style={{ padding: 10, borderRadius: 10, background: "var(--surface2)", border: "1px solid var(--border)" }}>
                          <div style={{ fontWeight: 800 }}>{value(row, ["title", "benefit_name", "name", "decision_question", "risk_description", "description", "workflow_name", "evidence_type", "object_type", "event_type", "review_gate", "snapshot_type"], `${section.label}记录`)}</div>
                          <div style={{ color: "var(--text2)", fontSize: "0.74rem", marginTop: 5 }}>{value(row, ["status", "state", "outcome", "review_outcome", "to_status", "severity", "source_type"])} · {value(row, ["owner", "owner_name", "owner_user_id", "benefit_owner_user_id", "actor_business_role", "decided_business_role"], "系统事实")}</div>
                        </article>
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
