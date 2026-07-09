import Link from "next/link";
import { KnowledgeLifecyclePersistenceClient } from "@/components/KnowledgeLifecyclePersistenceClient";
import { buildKnowledgeOperationDashboard } from "@/features/knowledge/operations";

const priorityClass: Record<string, string> = {
  P0: "tag tag-amber",
  P1: "tag tag-blue",
  P2: "tag tag-green",
};

const healthColor: Record<string, string> = {
  正常: "var(--green)",
  待复核: "var(--amber)",
  即将过期: "var(--amber)",
  已过期: "var(--red)",
  已归档: "var(--text2)",
};

function StatCard({ label, value, hint }: { label: string; value: string | number; hint: string }) {
  return (
    <div className="card">
      <div style={{ color: "var(--text2)", fontSize: "0.78rem", marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: "1.8rem", fontWeight: 900 }}>{value}</div>
      <p style={{ color: "var(--text2)", fontSize: "0.78rem", lineHeight: 1.6, marginTop: 8 }}>{hint}</p>
    </div>
  );
}

export default function KnowledgeOperationsPage() {
  const dashboard = buildKnowledgeOperationDashboard();
  const topItems = dashboard.items
    .filter(item => item.lifecycleHealth !== "正常" || item.linkedTemplates.length > 0)
    .slice(0, 10);

  return (
    <main style={{ minHeight: "100vh", background: "var(--bg)", padding: "28px 32px" }}>
      <div style={{ maxWidth: 1440, margin: "0 auto" }}>
        <header style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", marginBottom: 24 }}>
          <div>
            <Link href="/knowledge" style={{ color: "var(--accent2)", textDecoration: "none", fontSize: "0.86rem" }}>← 返回知识库问答</Link>
            <h1 style={{ fontSize: "1.9rem", fontWeight: 900, marginTop: 12 }}>知识生命周期运营</h1>
            <p style={{ color: "var(--text2)", lineHeight: 1.7, marginTop: 8 }}>
              将 RAG 快照、模板目录和业务模块关联起来，识别知识状态、过期风险、影响模块和需要人工复核的输出成果。
            </p>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <Link href="/templates" className="btn-secondary" style={{ textDecoration: "none" }}>模板中心</Link>
            <Link href="/reports" className="btn-secondary" style={{ textDecoration: "none" }}>报告工厂</Link>
            <Link href="/pmo" className="btn-secondary" style={{ textDecoration: "none" }}>PMO治理中心</Link>
          </div>
        </header>

        <section style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 14, marginBottom: 18 }}>
          <StatCard label="知识条目" value={dashboard.summary.total} hint={`索引版本 ${dashboard.indexVersion}`} />
          <StatCard label="已评审" value={dashboard.summary.reviewed} hint="当前可进入 RAG 的主要状态。" />
          <StatCard label="已发布" value={dashboard.summary.published} hint="包含已发布复盘资产或正式知识。" />
          <StatCard label="需复核" value={dashboard.summary.needsReview} hint="草稿、过期、即将过期或已废弃。" />
          <StatCard label="影响模块" value={dashboard.summary.affectedModules} hint="知识变更后需复核的系统模块数。" />
        </section>

        <KnowledgeLifecyclePersistenceClient />

        <section className="card" style={{ marginBottom: 18, borderColor: "rgba(59,130,246,0.25)" }}>
          <div className="section-title">🔁 知识变更影响模块</div>
          <p style={{ color: "var(--text2)", lineHeight: 1.7, fontSize: "0.84rem", marginBottom: 14 }}>
            当知识条目更新、过期或撤回时，下列模块需要复核输出口径，避免报告、AI建议或治理结论继续引用旧知识。
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
            {dashboard.impactModules.slice(0, 8).map(module => (
              <article key={module.module} style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 12, padding: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", marginBottom: 8 }}>
                  <strong>{module.module}</strong>
                  <span className={priorityClass[module.priority]}>{module.priority}</span>
                </div>
                <p style={{ color: "var(--text2)", fontSize: "0.8rem", lineHeight: 1.6 }}>{module.reason}</p>
                <div style={{ marginTop: 10, display: "grid", gap: 6 }}>
                  {module.documents.slice(0, 3).map(document => (
                    <div key={`${module.module}-${document.pageId}`} style={{ color: "var(--text2)", fontSize: "0.76rem", lineHeight: 1.5 }}>
                      {document.pageId} · {document.title}
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </section>

        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.2fr) minmax(360px, 0.8fr)", gap: 18, alignItems: "start" }}>
          <section className="card">
            <div className="section-title">📚 生命周期条目清单</div>
            <div style={{ display: "grid", gap: 10 }}>
              {topItems.map(item => (
                <article key={item.pageId} style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 12, padding: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
                    <div>
                      <strong>{item.pageId} · {item.title}</strong>
                      <p style={{ color: "var(--text2)", fontSize: "0.78rem", lineHeight: 1.6, marginTop: 5 }}>
                        责任人：{item.owner} · 版本：{item.version} · 有效期：{item.effectiveAt} 至 {item.expiresAt}
                      </p>
                    </div>
                    <span className="tag" style={{ background: `${healthColor[item.lifecycleHealth] || "var(--text2)"}22`, color: healthColor[item.lifecycleHealth] || "var(--text2)" }}>
                      {item.lifecycleHealth}
                    </span>
                  </div>
                  <p style={{ color: "var(--text)", fontSize: "0.82rem", lineHeight: 1.7, marginTop: 10 }}>{item.changeSummary}</p>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                    {item.impactedModules.map(module => <span key={`${item.pageId}-${module}`} className="tag tag-blue">{module}</span>)}
                    {item.linkedTemplates.map(template => <span key={`${item.pageId}-${template}`} className="tag tag-purple">模板：{template}</span>)}
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="card">
            <div className="section-title">✅ 待复核动作</div>
            <p style={{ color: "var(--text2)", fontSize: "0.82rem", lineHeight: 1.7, marginBottom: 12 }}>
              这些动作是系统生成的候选运营任务，需要知识负责人确认后再进入统一行动项或治理流程。
            </p>
            <div style={{ display: "grid", gap: 10 }}>
              {dashboard.lifecycleActions.slice(0, 8).map(action => (
                <article key={action.id} style={{ border: "1px solid var(--border)", borderRadius: 12, padding: 12, background: "var(--surface2)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <strong style={{ fontSize: "0.86rem" }}>{action.title}</strong>
                    <span className={priorityClass[action.priority]}>{action.priority}</span>
                  </div>
                  <p style={{ color: "var(--text2)", fontSize: "0.76rem", lineHeight: 1.6, marginTop: 6 }}>
                    {action.owner} · 截止：{action.dueDate} · 来源：{action.sourceDocumentId}
                  </p>
                  <p style={{ color: "var(--text)", fontSize: "0.78rem", lineHeight: 1.6, marginTop: 8 }}>{action.output}</p>
                </article>
              ))}
            </div>
          </section>
        </div>

        <section className="card" style={{ marginTop: 18 }}>
          <div className="section-title">🧩 模板与知识关联目录</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
            {dashboard.templateDirectory.map(template => (
              <div key={template.id} style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 12, padding: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
                  <strong>{template.title}</strong>
                  <span className={template.lifecycleStatus === "已关联" ? "tag tag-green" : "tag tag-amber"}>{template.lifecycleStatus}</span>
                </div>
                <p style={{ color: "var(--text2)", fontSize: "0.76rem", lineHeight: 1.6 }}>来源：{template.source}</p>
                <p style={{ color: "var(--accent2)", fontSize: "0.76rem", lineHeight: 1.6, marginTop: 6 }}>
                  关联知识：{template.linkedKnowledgeIds.length > 0 ? template.linkedKnowledgeIds.join("、") : "待补充"}
                </p>
              </div>
            ))}
          </div>
        </section>

        <p style={{ color: "var(--text2)", fontSize: "0.78rem", lineHeight: 1.7, marginTop: 16 }}>{dashboard.boundary}</p>
      </div>
    </main>
  );
}
