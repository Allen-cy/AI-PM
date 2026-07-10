"use client";

import Link from "next/link";
import { FeishuConfirmationInlinePanelClient } from "@/components/FeishuConfirmationInlinePanelClient";
import { IntegrationStatusPanelClient } from "@/components/IntegrationStatusPanelClient";

export default function PmoPage() {
  return (
    <main style={{ minHeight: "100vh", background: "var(--bg)" }}>
      <header style={{ padding: "15px 28px", borderBottom: "1px solid var(--border)", background: "var(--surface)", display: "flex", gap: 14, alignItems: "center" }}>
        <Link href="/" style={{ color: "var(--text2)", textDecoration: "none" }}>← 返回首页</Link>
        <strong style={{ color: "var(--purple)" }}>PMO治理中心</strong>
      </header>
      <div style={{ maxWidth: 1120, margin: "0 auto", padding: 28 }}>
        <section className="card" style={{ background: "linear-gradient(135deg,rgba(124,58,237,.14),rgba(59,130,246,.08))", marginBottom: 18 }}>
          <span className="tag tag-purple">PMO真实业务入口</span>
          <h1 style={{ marginTop: 12, fontSize: "1.55rem" }}>从静态展示升级为组合治理与运营控制闭环</h1>
          <p style={{ color: "var(--text2)", lineHeight: 1.8, marginTop: 10 }}>
            新控制中心按当前 PMO 业务角色和稳定项目身份读取数据，贯通管理信号、组合健康、跨项目依赖、资源容量、数据治理、周组合会和上报动作。没有数据时会明确提示接入或配置问题，不再展示预置项目、OKR或治理指标。
          </p>
          <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
            <Link className="btn-primary" href="/pmo/control-center" style={{ textDecoration: "none" }}>进入 PMO 组合治理与运营控制中心</Link>
            <Link className="btn-secondary" href="/admin/security" style={{ textDecoration: "none" }}>配置业务角色与汇报关系</Link>
            <Link className="btn-secondary" href="/governance-workflows" style={{ textDecoration: "none" }}>治理流程工作区</Link>
            <Link className="btn-secondary" href="/knowledge/operations" style={{ textDecoration: "none" }}>知识治理运营</Link>
          </div>
        </section>
        <section style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 14, marginBottom: 18 }}>
          <article className="card"><div className="section-title">负责人 Top 追踪</div><p style={{ color: "var(--text2)", lineHeight: 1.7 }}>按真实责任人、deadline和当前状态追踪数据纠偏、项目依赖、资源冲突与会后行动，不生成虚构排名。</p></article>
          <article className="card"><div className="section-title">正式治理证据完整率</div><p style={{ color: "var(--text2)", lineHeight: 1.7 }}>证据完整率由真实生命周期证据和复核结果计算；数据源未就绪时显式报错，不默认显示为绿色。</p></article>
        </section>
        <IntegrationStatusPanelClient moduleName="PMO治理中心" />
        <FeishuConfirmationInlinePanelClient moduleName="PMO治理中心" />
      </div>
    </main>
  );
}
