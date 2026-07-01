import Link from "next/link";
import { governanceWorkflows } from "@/features/pmo-operating-system";

export default function GovernanceWorkflowsPage() {
  return (
    <main style={{ minHeight: "100vh", background: "var(--bg)", padding: "28px 32px" }}>
      <div style={{ maxWidth: 1180, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, marginBottom: 24 }}>
          <div>
            <Link href="/" style={{ color: "var(--accent2)", textDecoration: "none", fontSize: "0.86rem" }}>← 返回首页</Link>
            <h1 style={{ fontSize: "1.9rem", fontWeight: 800, marginTop: 12 }}>PMO 治理工作流中心</h1>
            <p style={{ color: "var(--text2)", marginTop: 8, lineHeight: 1.7 }}>
              将立项、阶段门、变更、风险升级和收尾验收设计成有输入、有输出、有责任人、有状态和有审计记录的管理动作。
            </p>
          </div>
          <Link href="/pmo" className="btn-secondary" style={{ textDecoration: "none" }}>进入 PMO 治理中心</Link>
        </div>

        <section className="card" style={{ marginBottom: 18 }}>
          <div className="section-title">🔁 管理闭环总览</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
            {["输入材料", "责任到人", "审批确认", "输出成果", "行动项", "审计记录"].map((item, index) => (
              <div key={item} style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 10, padding: 14, textAlign: "center" }}>
                <div style={{ color: "var(--accent2)", fontWeight: 800, marginBottom: 6 }}>0{index + 1}</div>
                <strong>{item}</strong>
              </div>
            ))}
          </div>
        </section>

        <section style={{ display: "grid", gap: 16 }}>
          {governanceWorkflows.map(workflow => (
            <article key={workflow.id} className="card">
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                    <h2 style={{ fontSize: "1.15rem", fontWeight: 800 }}>{workflow.name}</h2>
                    <span className="tag tag-blue">{workflow.stage}</span>
                  </div>
                  <p style={{ color: "var(--text2)", lineHeight: 1.6 }}>触发条件：{workflow.trigger}</p>
                </div>
                <div style={{ color: "var(--text2)", fontSize: "0.84rem", lineHeight: 1.6 }}>
                  <div>责任人：<strong style={{ color: "var(--text)" }}>{workflow.owner}</strong></div>
                  <div>审批/确认：<strong style={{ color: "var(--text)" }}>{workflow.approver}</strong></div>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
                <div style={{ background: "var(--surface2)", borderRadius: 10, padding: 14 }}>
                  <strong>输入材料</strong>
                  <ul style={{ color: "var(--text2)", lineHeight: 1.8, paddingLeft: 18, marginTop: 8 }}>
                    {workflow.inputs.map(input => <li key={input}>{input}</li>)}
                  </ul>
                </div>
                <div style={{ background: "var(--surface2)", borderRadius: 10, padding: 14 }}>
                  <strong>输出成果</strong>
                  <ul style={{ color: "var(--text2)", lineHeight: 1.8, paddingLeft: 18, marginTop: 8 }}>
                    {workflow.outputs.map(output => <li key={output}>{output}</li>)}
                  </ul>
                </div>
                <div style={{ background: "var(--surface2)", borderRadius: 10, padding: 14 }}>
                  <strong>状态流转</strong>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                    {workflow.states.map(state => <span key={state} className="tag tag-purple">{state}</span>)}
                  </div>
                </div>
                <div style={{ background: "var(--surface2)", borderRadius: 10, padding: 14 }}>
                  <strong>时限与审计</strong>
                  <p style={{ color: "var(--text2)", lineHeight: 1.6, marginTop: 8 }}>{workflow.deadlineRule}</p>
                  <p style={{ color: "var(--accent2)", lineHeight: 1.6, marginTop: 8 }}>{workflow.auditTrail}</p>
                </div>
              </div>
            </article>
          ))}
        </section>

        <section className="card" style={{ marginTop: 18, borderColor: "rgba(245,158,11,0.45)" }}>
          <div className="section-title">⚠️ 当前边界</div>
          <p style={{ color: "var(--text2)", lineHeight: 1.7 }}>
            本页先固化治理流程设计和入口。下一阶段需要增加 Supabase 流程实例表、审批意见、状态流转、飞书回写和审计日志，才能形成正式可操作的治理闭环。
          </p>
        </section>
      </div>
    </main>
  );
}
