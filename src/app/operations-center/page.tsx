"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  businessContextSearchParams,
  readStoredBusinessContext,
  readStoredDataClass,
  writeStoredBusinessContext,
  writeStoredCurrentProject,
  type StoredBusinessContext,
} from "@/features/operating-model/client-context";

type Metric = { key: string; label: string; value: number | null; unit: string; availability: string; health: string; numerator: number | null; denominator: number | null; reason: string | null };
type OnboardingStep = { key: string; label: string; completed: boolean; verification: string; actionHref: string; detail: string };
type Pilot = { id: string; project_id: string; name: string; status: string; target_roles: string[]; success_criteria: unknown[]; golden_chain_results: unknown[]; training_evidence: unknown[]; runbook_references: unknown[]; release_evidence: unknown[]; start_date: string; target_end_date: string };
type Incident = { id: string; incident_key: string; title: string; severity: string; source: string; status: string; user_visible_message: string; recovery_action: string; remediation?: string | null; evidence?: unknown[]; detected_at: string };
type Capability = { capabilityKey: string; label: string; status: string; enabled: boolean; evidenceCount: number; lastTestedAt: string | null; gateMessage: string };
type ValueReview = { id: string; period_start: string; period_end: string; status: string; conclusions: string; review_comment?: string | null };
type OperationsPayload = {
  context: { businessRole: string; systemRole: string };
  data_class: string;
  center: {
    guide: { status: string; completedCount: number; totalCount: number; steps: OnboardingStep[]; goldenChain: string[] };
    configuration: { feishu: { configured: boolean; source: string }; ai: { configured: boolean; source: string }; project_mapping_count: number; data_class: string };
    metrics: Metric[];
    source_lineage: Record<string, unknown>;
    projects: Array<{ id: string; name: string; oa_no?: string | null; status?: string }>;
    pilots: Pilot[];
    incidents: Incident[];
    enterprise_capabilities: Capability[];
    metric_snapshots: Array<{ id: string; captured_at: string; unavailable_metrics: unknown[] }>;
    quarterly_value_reviews: ValueReview[];
  };
};

const healthColor: Record<string, string> = { healthy: "var(--green)", warning: "var(--amber)", critical: "var(--red)", unknown: "var(--text2)" };
const unitLabel: Record<string, string> = { percent: "%", minutes: "分钟", count: "条" };
const pilotNext: Record<string, string[]> = { planned: ["ready", "cancelled"], ready: ["running", "paused", "cancelled"], running: ["paused", "completed", "cancelled"], paused: ["running", "cancelled"], completed: [], cancelled: [] };
const incidentNext: Record<string, string[]> = { detected: ["triaged"], triaged: ["mitigating"], mitigating: ["monitoring", "resolved"], monitoring: ["mitigating", "resolved"], resolved: ["closed", "mitigating"], closed: [] };

function lines(value: string): string[] {
  return value.split(/[,\n，；;]/).map(item => item.trim()).filter(Boolean);
}

function dateValue(offsetDays = 0): string {
  const value = new Date(); value.setDate(value.getDate() + offsetDays); return value.toLocaleDateString("sv-SE");
}

export default function OperationsCenterPage() {
  const [context, setContext] = useState<StoredBusinessContext | null>(null);
  const [data, setData] = useState<OperationsPayload | null>(null);
  const [error, setError] = useState(""); const [message, setMessage] = useState(""); const [saving, setSaving] = useState(false);
  const [pilot, setPilot] = useState({ project_id: "", name: "", target_roles: "pm,operations,pmo,ceo,business_owner,finance,quality", success_criteria: "A-E五条真实黄金链路全部通过", rollback_plan: "关闭新读取开关，保留原始飞书记录和审计数据。", start_date: dateValue(), target_end_date: dateValue(30) });
  const [pilotProgress, setPilotProgress] = useState({ id: "", next_status: "", training_evidence: "", runbook_references: "", release_evidence: "" });
  const [incident, setIncident] = useState({ title: "", severity: "medium", source: "application", impact: "", user_visible_message: "", recovery_action: "" });
  const [incidentProgress, setIncidentProgress] = useState({ id: "", next_status: "", remediation: "", evidence: "" });
  const [capability, setCapability] = useState({ capability_key: "sso", status: "configured", provider: "", evidence: "", last_tested_at: "", blocker: "" });
  const [review, setReview] = useState({ period_start: dateValue(-90), period_end: dateValue(), conclusions: "", value_evidence: "" });

  const load = useCallback(async () => {
    setError("");
    try {
      const contextResponse = await fetch("/api/context/current", { cache: "no-store" });
      const contextBody = await contextResponse.json() as { available_contexts?: Array<{ id: string; businessRole: string; orgId: string; subjectScope: string; subjectId: string; status: string }> };
      if (!contextResponse.ok) throw new Error("无法读取业务身份。");
      const stored = readStoredBusinessContext();
      const selected = contextBody.available_contexts?.find(item => item.id === stored?.assignmentId && item.status === "active") ?? contextBody.available_contexts?.find(item => item.status === "active");
      if (!selected) throw new Error("当前账号没有有效业务角色，请联系管理员分配角色和管理范围。");
      const active = { assignmentId: selected.id, businessRole: selected.businessRole, orgId: selected.orgId, subjectScope: selected.subjectScope, subjectId: selected.subjectId };
      writeStoredBusinessContext(active); setContext(active);
      const query = businessContextSearchParams(active, readStoredDataClass());
      const response = await fetch(`/api/operations-center?${query.toString()}`, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.detail || body.error || "运营中心加载失败。");
      const payload = body as OperationsPayload; setData(payload);
      setPilot(previous => ({ ...previous, project_id: previous.project_id || payload.center.projects[0]?.id || "" }));
      setPilotProgress(previous => ({ ...previous, id: previous.id || payload.center.pilots.find(item => (pilotNext[item.status] || []).length > 0)?.id || "" }));
      setIncidentProgress(previous => ({ ...previous, id: previous.id || payload.center.incidents.find(item => (incidentNext[item.status] || []).length > 0)?.id || "" }));
    } catch (caught) { setError(caught instanceof Error ? caught.message : "运营中心加载失败。"); }
  }, []);

  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);

  async function save(operation: string, payload: Record<string, unknown>) {
    if (!context) return; setSaving(true); setError(""); setMessage("");
    try {
      const query = businessContextSearchParams(context, readStoredDataClass());
      const response = await fetch(`/api/operations-center?${query.toString()}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ operation, ...payload }) });
      const body = await response.json(); if (!response.ok) throw new Error(body.detail || body.error || "保存失败。");
      setMessage("操作已保存到 Supabase 并写入审计链。"); await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "保存失败。"); } finally { setSaving(false); }
  }

  const role = data?.context.businessRole || context?.businessRole || "";
  const selectedPilot = data?.center.pilots.find(item => item.id === pilotProgress.id);
  const selectedIncident = data?.center.incidents.find(item => item.id === incidentProgress.id);
  const pilotNextOptions = selectedPilot ? pilotNext[selectedPilot.status] || [] : [];
  const incidentNextOptions = selectedIncident ? incidentNext[selectedIncident.status] || [] : [];
  return <main style={{ minHeight: "100vh", background: "var(--bg)" }}>
    <header style={{ padding: "15px 28px", borderBottom: "1px solid var(--border)", background: "var(--surface)", display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
      <Link href="/" style={{ color: "var(--text2)", textDecoration: "none" }}>← 返回首页</Link>
      <strong style={{ color: "var(--accent2)" }}>采用、可靠性与企业化运营中心</strong>
      <span className="tag tag-blue">P25 真实运行与规模化</span>
      <Link href="/operations-center/golden-chains" className="btn-secondary" style={{ textDecoration: "none" }}>五条黄金链路验收</Link>
      <Link href="/operations-center/pilot-acceptance" className="btn-secondary" style={{ textDecoration: "none" }}>V6.6受控试点验收</Link>
      {data && <span className="tag" style={{ marginLeft: "auto" }}>{role} · {data.data_class}</span>}
    </header>
    <div style={{ maxWidth: 1500, margin: "0 auto", padding: 28 }}>
      {(error || message) && <section className="card" style={{ marginBottom: 16, borderColor: error ? "rgba(239,68,68,.45)" : "rgba(16,185,129,.45)", color: error ? "var(--red)" : "var(--green)" }}>{error || message}</section>}
      {data && <>
        <section className="card" style={{ background: "linear-gradient(135deg,rgba(37,99,235,.14),rgba(124,58,237,.10))" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 16, flexWrap: "wrap" }}>
            <div><span className="tag tag-blue">系统化运行</span><h1 style={{ fontSize: "1.5rem", marginTop: 10 }}>从“功能可用”进入“角色持续使用、故障可恢复、价值可复核”</h1><p style={{ color: "var(--text2)", lineHeight: 1.75, maxWidth: 880, marginTop: 8 }}>所有指标仅从当前授权组织、项目范围和数据分类中的真实表计算。缺少记录、字段分类或上游表时显示“不可用”，不用样例数据补位。</p></div>
            {(role === "pmo" || role === "ceo") && <button className="btn-primary" disabled={saving} onClick={() => void save("capture_metrics", {})}>保存当前运行快照</button>}
          </div>
        </section>

        <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 12, marginTop: 16 }}>
          {data.center.metrics.map(metric => <article className="stat-card" key={metric.key} style={{ borderTop: `3px solid ${healthColor[metric.health] || "var(--border)"}` }}>
            <div className="stat-num" style={{ color: healthColor[metric.health] }}>{metric.value === null ? "不可用" : `${metric.value}${unitLabel[metric.unit] || ""}`}</div>
            <div className="stat-label">{metric.label}</div>
            {metric.value !== null && metric.denominator !== null && <p style={{ color: "var(--text2)", fontSize: ".68rem", marginTop: 5 }}>口径 {metric.numerator}/{metric.denominator}</p>}
            {metric.reason && <p style={{ color: "var(--amber)", fontSize: ".7rem", lineHeight: 1.5, marginTop: 7 }}>{metric.reason}</p>}
          </article>)}
        </section>

        <section style={{ display: "grid", gridTemplateColumns: "minmax(0,1.05fr) minmax(0,.95fr)", gap: 16, marginTop: 16, alignItems: "start" }}>
          <article className="card"><div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}><div className="section-title">🧭 首次使用向导</div><span className="tag tag-blue">{data.center.guide.completedCount}/{data.center.guide.totalCount}</span></div>
            {data.center.guide.steps.map(step => <div key={step.key} style={{ display: "grid", gridTemplateColumns: "28px 1fr auto", gap: 10, alignItems: "start", padding: "11px 0", borderTop: "1px solid var(--border)" }}>
              <span style={{ color: step.completed ? "var(--green)" : "var(--amber)", fontWeight: 900 }}>{step.completed ? "✓" : "!"}</span><div><strong>{step.label}</strong><p style={{ color: "var(--text2)", fontSize: ".76rem", lineHeight: 1.55, marginTop: 4 }}>{step.detail}</p></div>
              {!step.completed && step.key === "data_class" ? <button className="btn-secondary" disabled={saving} onClick={() => void save("acknowledge_data_class", { confirm: true, data_class: data.data_class })}>确认</button> : !step.completed ? <Link className="btn-secondary" href={step.actionHref} style={{ textDecoration: "none" }}>去配置</Link> : <span className="tag tag-green">已验证</span>}
            </div>)}
          </article>
          <article className="card"><div className="section-title">🎯 {role} 角色黄金链路</div><ol style={{ margin: "10px 0 0 20px", color: "var(--text2)", lineHeight: 2 }}>{data.center.guide.goldenChain.map(item => <li key={item}>{item}</li>)}</ol><div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, marginTop: 12 }}>{[["飞书", data.center.configuration.feishu.configured], ["AI", data.center.configuration.ai.configured], ["项目映射", data.center.configuration.project_mapping_count > 0]].map(([label, ok]) => <div key={String(label)} style={{ padding: 9, borderRadius: 10, background: "var(--surface2)", color: ok ? "var(--green)" : "var(--amber)", textAlign: "center" }}>{label}<br/><strong>{ok ? "已就绪" : "待配置"}</strong></div>)}</div></article>
        </section>

        <section style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 16, marginTop: 16, alignItems: "start" }}>
          <article className="card"><div className="section-title">🚨 故障与恢复动作</div><input className="input" placeholder="故障标题" value={incident.title} onChange={event => setIncident({ ...incident, title: event.target.value })}/><div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}><select className="input" value={incident.severity} onChange={event => setIncident({ ...incident, severity: event.target.value })}><option value="medium">中</option><option value="high">高</option><option value="critical">严重</option><option value="low">低</option></select><select className="input" value={incident.source} onChange={event => setIncident({ ...incident, source: event.target.value })}>{["application","feishu","supabase","ai_model","rag","security","other"].map(item => <option key={item} value={item}>{item}</option>)}</select></div><textarea className="input" style={{ marginTop: 8, minHeight: 66 }} placeholder="业务影响" value={incident.impact} onChange={event => setIncident({ ...incident, impact: event.target.value })}/><textarea className="input" style={{ marginTop: 8, minHeight: 66 }} placeholder="用户可见状态说明" value={incident.user_visible_message} onChange={event => setIncident({ ...incident, user_visible_message: event.target.value })}/><textarea className="input" style={{ marginTop: 8, minHeight: 66 }} placeholder="恢复动作" value={incident.recovery_action} onChange={event => setIncident({ ...incident, recovery_action: event.target.value })}/><button className="btn-primary" style={{ marginTop: 10 }} disabled={saving || !incident.title || !incident.impact || !incident.user_visible_message || !incident.recovery_action} onClick={() => void save("report_incident", { ...incident, incident_key: `manual:${Date.now()}` })}>登记故障</button>
            <div style={{ marginTop: 14 }}>{data.center.incidents.slice(0, 8).map(item => <div key={item.id} style={{ padding: 10, background: "var(--surface2)", borderRadius: 9, marginTop: 7 }}><div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><strong>{item.title}</strong><span className={`tag ${item.severity === "critical" ? "tag-red" : "tag-amber"}`}>{item.status}</span></div><p style={{ color: "var(--text2)", fontSize: ".72rem", marginTop: 5 }}>{item.user_visible_message}</p></div>)}</div>
            {(role === "pmo" || role === "ceo") && selectedIncident && incidentNextOptions.length > 0 && <details style={{ marginTop: 12 }}><summary style={{ cursor: "pointer", color: "var(--accent2)" }}>推进故障恢复状态</summary><select className="input" style={{ marginTop: 9 }} value={incidentProgress.id} onChange={event => setIncidentProgress({ ...incidentProgress, id: event.target.value, next_status: "" })}>{data.center.incidents.filter(item => (incidentNext[item.status] || []).length > 0).map(item => <option key={item.id} value={item.id}>{item.title} · {item.status}</option>)}</select><select className="input" style={{ marginTop: 8 }} value={incidentProgress.next_status} onChange={event => setIncidentProgress({ ...incidentProgress, next_status: event.target.value })}><option value="">选择下一状态</option>{incidentNextOptions.map(item => <option key={item} value={item}>{item}</option>)}</select><textarea className="input" style={{ marginTop: 8 }} placeholder="整改/恢复说明（解决或关闭时必填）" value={incidentProgress.remediation} onChange={event => setIncidentProgress({ ...incidentProgress, remediation: event.target.value })}/><textarea className="input" style={{ marginTop: 8 }} placeholder="恢复证据链接/编号，每行一条" value={incidentProgress.evidence} onChange={event => setIncidentProgress({ ...incidentProgress, evidence: event.target.value })}/><button className="btn-primary" style={{ marginTop: 9 }} disabled={saving || !incidentProgress.next_status || (["resolved","closed"].includes(incidentProgress.next_status) && (!incidentProgress.remediation || lines(incidentProgress.evidence).length === 0))} onClick={() => void save("transition_incident", { id: selectedIncident.id, expected_status: selectedIncident.status, next_status: incidentProgress.next_status, remediation: incidentProgress.remediation || undefined, evidence: incidentProgress.evidence ? lines(incidentProgress.evidence) : undefined })}>确认状态变更</button></details>}
          </article>

          <article className="card"><div className="section-title">🧪 真实试点项目</div>{role === "pmo" && data.data_class === "production" && <><select className="input" value={pilot.project_id} onChange={event => { setPilot({ ...pilot, project_id: event.target.value }); writeStoredCurrentProject(event.target.value); }}>{data.center.projects.map(project => <option key={project.id} value={project.id}>{project.name}{project.oa_no ? ` · ${project.oa_no}` : ""}</option>)}</select><input className="input" style={{ marginTop: 8 }} placeholder="试点名称" value={pilot.name} onChange={event => setPilot({ ...pilot, name: event.target.value })}/><input className="input" style={{ marginTop: 8 }} placeholder="参与角色，逗号分隔" value={pilot.target_roles} onChange={event => setPilot({ ...pilot, target_roles: event.target.value })}/><textarea className="input" style={{ marginTop: 8 }} placeholder="成功标准，每行一条" value={pilot.success_criteria} onChange={event => setPilot({ ...pilot, success_criteria: event.target.value })}/><textarea className="input" style={{ marginTop: 8 }} placeholder="发布回滚计划" value={pilot.rollback_plan} onChange={event => setPilot({ ...pilot, rollback_plan: event.target.value })}/><div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}><input className="input" type="date" value={pilot.start_date} onChange={event => setPilot({ ...pilot, start_date: event.target.value })}/><input className="input" type="date" value={pilot.target_end_date} onChange={event => setPilot({ ...pilot, target_end_date: event.target.value })}/></div><button className="btn-primary" style={{ marginTop: 10 }} disabled={saving || !pilot.project_id || !pilot.name || !pilot.success_criteria || !pilot.rollback_plan} onClick={() => void save("create_pilot", { ...pilot, target_roles: lines(pilot.target_roles), success_criteria: lines(pilot.success_criteria), idempotency_key: `pilot:${pilot.project_id}:${pilot.start_date}` })}>建立试点</button></>}
            {role !== "pmo" && <p style={{ color: "var(--text2)" }}>试点由 PMO 建立，当前角色可查看授权范围内的运行结果。</p>}{data.data_class !== "production" && <p style={{ color: "var(--amber)" }}>正式试点只能在 production 数据空间建立。</p>}
            <div style={{ marginTop: 12 }}>{data.center.pilots.map(item => <div key={item.id} style={{ padding: 10, background: "var(--surface2)", borderRadius: 9, marginTop: 7 }}><div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><strong>{item.name}</strong><span className="tag tag-blue">{item.status}</span></div><p style={{ color: "var(--text2)", fontSize: ".72rem", marginTop: 5 }}>{item.start_date} → {item.target_end_date} · {(item.target_roles || []).join(" / ")}</p></div>)}</div>
            {role === "pmo" && selectedPilot && pilotNextOptions.length > 0 && <details style={{ marginTop: 12 }}><summary style={{ cursor: "pointer", color: "var(--accent2)" }}>推进试点阶段门</summary><select className="input" style={{ marginTop: 9 }} value={pilotProgress.id} onChange={event => { const id=event.target.value; const project=data.center.pilots.find(item=>item.id===id)?.project_id||""; setPilotProgress({ ...pilotProgress, id, next_status: "" }); if(project)writeStoredCurrentProject(project); }}>{data.center.pilots.filter(item => (pilotNext[item.status] || []).length > 0).map(item => <option key={item.id} value={item.id}>{item.name} · {item.status}</option>)}</select><select className="input" style={{ marginTop: 8 }} value={pilotProgress.next_status} onChange={event => setPilotProgress({ ...pilotProgress, next_status: event.target.value })}><option value="">选择下一状态</option>{pilotNextOptions.map(item => <option key={item} value={item}>{item}</option>)}</select><textarea className="input" style={{ marginTop: 8 }} placeholder="角色培训证据，每行一条" value={pilotProgress.training_evidence} onChange={event => setPilotProgress({ ...pilotProgress, training_evidence: event.target.value })}/><textarea className="input" style={{ marginTop: 8 }} placeholder="运营/故障手册引用，每行一条" value={pilotProgress.runbook_references} onChange={event => setPilotProgress({ ...pilotProgress, runbook_references: event.target.value })}/><textarea className="input" style={{ marginTop: 8 }} placeholder="发布与回滚验证证据，每行一条" value={pilotProgress.release_evidence} onChange={event => setPilotProgress({ ...pilotProgress, release_evidence: event.target.value })}/>{pilotProgress.next_status==="completed"&&<p style={{color:"var(--amber)",lineHeight:1.6,marginTop:9}}>完成试点前，系统会从数据库核验 A–E 五条黄金链路均已正式通过；不接受手工填写“已完成”。请先在<Link href="/operations-center/golden-chains" style={{color:"var(--accent2)"}}>黄金链路验收台</Link>完成各角色实测。</p>}<button className="btn-primary" style={{ marginTop: 9 }} disabled={saving || !pilotProgress.next_status || (["ready","running","completed"].includes(pilotProgress.next_status) && (!pilotProgress.training_evidence || !pilotProgress.runbook_references || !pilotProgress.release_evidence))} onClick={() => void save("transition_pilot", { id: selectedPilot.id, expected_status: selectedPilot.status, next_status: pilotProgress.next_status, training_evidence: pilotProgress.training_evidence ? lines(pilotProgress.training_evidence) : undefined, runbook_references: pilotProgress.runbook_references ? lines(pilotProgress.runbook_references) : undefined, release_evidence: pilotProgress.release_evidence ? lines(pilotProgress.release_evidence) : undefined })}>提交试点阶段变更</button></details>}
          </article>
        </section>

        <section className="card" style={{ marginTop: 16 }}><div className="section-title">🔐 企业能力接入门禁</div><p style={{ color: "var(--text2)", lineHeight: 1.65 }}>配置不等于接通。只有状态为 enabled、存在测试时间且保留接入证据时，系统才把能力标记为已启用。此处不存储 SSO、存储或签名服务的密钥。</p><div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: 10, marginTop: 12 }}>{data.center.enterprise_capabilities.map(item => <article key={item.capabilityKey} style={{ padding: 12, borderRadius: 10, background: "var(--surface2)", border: `1px solid ${item.enabled ? "rgba(16,185,129,.4)" : "var(--border)"}` }}><div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><strong>{item.label}</strong><span className={`tag ${item.enabled ? "tag-green" : "tag-amber"}`}>{item.status}</span></div><p style={{ color: "var(--text2)", fontSize: ".72rem", lineHeight: 1.55, marginTop: 7 }}>{item.gateMessage}</p></article>)}</div>{data.context.systemRole === "admin" && <details style={{ marginTop: 14 }}><summary style={{ cursor: "pointer", color: "var(--accent2)" }}>系统管理员更新接入门禁</summary><div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginTop: 9 }}><select className="input" value={capability.capability_key} onChange={event => setCapability({ ...capability, capability_key: event.target.value })}>{data.center.enterprise_capabilities.map(item => <option key={item.capabilityKey} value={item.capabilityKey}>{item.label}</option>)}</select><select className="input" value={capability.status} onChange={event => setCapability({ ...capability, status: event.target.value })}>{["not_configured","configured","tested","enabled","blocked","disabled"].map(item => <option key={item} value={item}>{item}</option>)}</select><input className="input" placeholder="服务商名称（不填密钥）" value={capability.provider} onChange={event => setCapability({ ...capability, provider: event.target.value })}/></div><textarea className="input" style={{ marginTop: 8 }} placeholder="接入测试证据链接/编号，每行一条" value={capability.evidence} onChange={event => setCapability({ ...capability, evidence: event.target.value })}/><div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 8, marginTop: 8 }}><input className="input" type="datetime-local" value={capability.last_tested_at} onChange={event => setCapability({ ...capability, last_tested_at: event.target.value })}/><input className="input" placeholder="阻断原因（如有）" value={capability.blocker} onChange={event => setCapability({ ...capability, blocker: event.target.value })}/></div><button className="btn-primary" style={{ marginTop: 9 }} disabled={saving || (["tested","enabled"].includes(capability.status) && (!capability.last_tested_at || lines(capability.evidence).length === 0))} onClick={() => void save("save_capability_gate", { ...capability, evidence: lines(capability.evidence), last_tested_at: capability.last_tested_at ? new Date(capability.last_tested_at).toISOString() : undefined, confirm: capability.status === "enabled", config_summary: { configuration_owner: "system_admin", configuration_scope: "status_only" } })}>保存门禁状态</button></details>}</section>

        <section style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 16, alignItems: "start" }}><article className="card"><div className="section-title">📋 季度价值复核</div>{role === "pmo" && <><div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}><input className="input" type="date" value={review.period_start} onChange={event => setReview({ ...review, period_start: event.target.value })}/><input className="input" type="date" value={review.period_end} onChange={event => setReview({ ...review, period_end: event.target.value })}/></div><textarea className="input" style={{ marginTop: 8 }} placeholder="价值结论" value={review.conclusions} onChange={event => setReview({ ...review, conclusions: event.target.value })}/><textarea className="input" style={{ marginTop: 8 }} placeholder="价值证据链接/编号，每行一条" value={review.value_evidence} onChange={event => setReview({ ...review, value_evidence: event.target.value })}/><button className="btn-primary" style={{ marginTop: 10 }} disabled={saving || !review.conclusions || lines(review.value_evidence).length === 0} onClick={() => void save("create_value_review", { ...review, value_evidence: lines(review.value_evidence), metric_snapshot_id: data.center.metric_snapshots[0]?.id || null })}>提交价值复核</button></>}{data.center.quarterly_value_reviews.map(item => <div key={item.id} style={{ padding: 10, background: "var(--surface2)", borderRadius: 9, marginTop: 8 }}><div style={{ display: "flex", justifyContent: "space-between" }}><strong>{item.period_start} → {item.period_end}</strong><span className="tag tag-blue">{item.status}</span></div><p style={{ color: "var(--text2)", fontSize: ".74rem", marginTop: 5 }}>{item.conclusions}</p>{role === "ceo" && item.status === "submitted" && <div style={{ display: "flex", gap: 8, marginTop: 8 }}><button className="btn-primary" disabled={saving} onClick={() => void save("review_value_review", { id: item.id, status: "accepted", review_comment: "CEO确认本季度价值复核结论。", confirm: true })}>确认</button><button className="btn-secondary" disabled={saving} onClick={() => void save("review_value_review", { id: item.id, status: "rework", review_comment: "请 PMO 补充价值证据后重新提交。", confirm: true })}>退回</button></div>}</div>)}</article>
          <article className="card"><div className="section-title">📦 运行快照与数据边界</div><p style={{ color: "var(--text2)", lineHeight: 1.7 }}>已保存 {data.center.metric_snapshots.length} 份当前范围快照。指标原始来源包括同步日志、飞书确认队列、决策包、行动台账、AI人工评测和带业务上下文的审计记录。未标记 {data.data_class} 的旧记录不进入指标。</p><details style={{ marginTop: 12 }}><summary style={{ cursor: "pointer", color: "var(--accent2)" }}>查看本次数据血缘计数</summary><pre style={{ marginTop: 8, padding: 12, borderRadius: 10, background: "var(--surface2)", overflow: "auto", fontSize: ".7rem" }}>{JSON.stringify(data.center.source_lineage, null, 2)}</pre></details></article>
        </section>
      </>}
    </div>
  </main>;
}
