"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { loadCurrentBusinessContextSearchParams, readStoredBusinessContext, readStoredCurrentProject, readStoredDataClass } from "@/features/operating-model/client-context";

type StakeholderRecord = { id: string; stakeholder_code: string; name: string; role_title?: string | null; organization_name?: string | null; power: number; interest: number; current_engagement: string; desired_engagement: string; communication_frequency?: string | null; communication_method?: string | null; management_strategy?: string | null; contact_preference?: string | null; status: string; version: number; updated_at: string };
type EngagementAction = { id: string; stakeholder_record_id: string; action_type: string; subject: string; planned_at?: string | null; due_at?: string | null; owner_name?: string | null; status: string; outcome?: string | null; feedback?: string | null; version: number; updated_at: string };
type StakeholderData = { project?: { name?: string }; stakeholders: StakeholderRecord[]; actions: EngagementAction[] };

const engagementLevels = ["不知情", "抵制", "中立", "支持", "领导"];
const quadrant = (item: StakeholderRecord) => item.power >= 4 ? item.interest >= 4 ? "重点管理" : "保持满意" : item.interest >= 4 ? "随时告知" : "监督";
const blankStakeholder = { id: "", version: 0, stakeholder_code: "", name: "", role_title: "", organization_name: "", power: 3, interest: 3, current_engagement: "中立", desired_engagement: "支持", communication_frequency: "每周", communication_method: "会议", management_strategy: "", contact_preference: "" };
const blankAction = { id: "", version: 0, stakeholder_record_id: "", action_type: "沟通", subject: "", planned_at: "", due_at: "", owner_name: "", status: "planned", outcome: "", feedback: "" };

export default function StakeholderPage() {
  const [data, setData] = useState<StakeholderData>({ stakeholders: [], actions: [] });
  const [projectName, setProjectName] = useState("");
  const [active, setActive] = useState<"register" | "matrix" | "actions">("register");
  const [stakeholderForm, setStakeholderForm] = useState(blankStakeholder);
  const [actionForm, setActionForm] = useState(blankAction);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [aiSuggestion, setAiSuggestion] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const params = await loadCurrentBusinessContextSearchParams({ preferredRole: "pm" });
      if (!params.get("project_id")) throw new Error("请先在顶部选择已授权项目。");
      const response = await fetch(`/api/stakeholder?${params.toString()}`, { cache: "no-store" });
      const payload = await response.json() as { data?: StakeholderData; detail?: string; error?: string };
      if (!response.ok) throw new Error(payload.detail || payload.error || "干系人读取失败");
      const next = payload.data ?? { stakeholders: [], actions: [] };
      setData(next); setProjectName(next.project?.name || "当前项目"); setMessage("");
    } catch (error) { setData({ stakeholders: [], actions: [] }); setProjectName(""); setMessage(error instanceof Error ? error.message : "干系人数据源不可用"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const first = window.setTimeout(() => void loadData(), 0); const reload = () => void loadData();
    window.addEventListener("ai-pmo:project-context-changed", reload); window.addEventListener("ai-pmo:business-context-changed", reload); window.addEventListener("ai-pmo:data-class-changed", reload);
    return () => { window.clearTimeout(first); window.removeEventListener("ai-pmo:project-context-changed", reload); window.removeEventListener("ai-pmo:business-context-changed", reload); window.removeEventListener("ai-pmo:data-class-changed", reload); };
  }, [loadData]);

  const writeContext = (expectedVersion: number) => {
    const context = readStoredBusinessContext(); const projectId = readStoredCurrentProject();
    if (!context?.businessRole || !projectId) return null;
    return { project_id: projectId, business_role: context.businessRole, data_class: readStoredDataClass(), expected_version: expectedVersion, idempotency_key: `v632:stakeholder:${projectId}:${crypto.randomUUID()}` };
  };
  const post = async (body: Record<string, unknown>) => {
    const response = await fetch("/api/stakeholder", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const payload = await response.json() as { data?: { suggestion?: string }; detail?: string; error?: string };
    if (!response.ok) throw new Error(payload.detail || payload.error || "干系人操作失败"); return payload.data;
  };

  const saveStakeholder = async () => {
    const context = writeContext(stakeholderForm.version); if (!context) return setMessage("请先选择当前项目和业务身份。");
    if (!stakeholderForm.stakeholder_code.trim() || !stakeholderForm.name.trim()) return setMessage("干系人编号和姓名为必填项。");
    setBusy("stakeholder");
    try { await post({ operation: "save_stakeholder", ...context, record_id: stakeholderForm.id || null, payload: stakeholderForm }); setStakeholderForm(blankStakeholder); setMessage("干系人登记册已保存。"); await loadData(); }
    catch (error) { setMessage(`保存失败：${error instanceof Error ? error.message : "未知错误"}`); } finally { setBusy(""); }
  };
  const saveAction = async () => {
    const context = writeContext(actionForm.version); if (!context) return setMessage("请先选择当前项目和业务身份。");
    if (!actionForm.stakeholder_record_id || !actionForm.subject.trim() || !actionForm.due_at) return setMessage("干系人、参与行动主题和截止时间为必填项。");
    setBusy("action");
    try { await post({ operation: "save_action", ...context, record_id: actionForm.id || null, payload: actionForm }); setActionForm(blankAction); setMessage("参与行动已保存，责任人和deadline已进入闭环。"); await loadData(); }
    catch (error) { setMessage(`行动保存失败：${error instanceof Error ? error.message : "未知错误"}`); } finally { setBusy(""); }
  };
  const aiAssist = async () => {
    const context = writeContext(0); if (!context) return setMessage("请先选择当前项目和业务身份。");
    setBusy("ai");
    try { const result = await post({ operation: "assist", ...context }); setAiSuggestion(result?.suggestion || "AI未返回建议"); setMessage("AI候选策略已生成，尚未修改正式登记册。"); }
    catch (error) { setMessage(`AI分析失败：${error instanceof Error ? error.message : "未知错误"}`); } finally { setBusy(""); }
  };

  const stats = useMemo(() => ({ total: data.stakeholders.length, manage: data.stakeholders.filter((item) => quadrant(item) === "重点管理").length, gaps: data.stakeholders.filter((item) => engagementLevels.indexOf(item.desired_engagement) > engagementLevels.indexOf(item.current_engagement)).length, overdue: data.actions.filter((item) => item.status !== "completed" && item.due_at && new Date(item.due_at) < new Date()).length }), [data]);
  const groups = ["重点管理", "保持满意", "随时告知", "监督"].map((name) => ({ name, items: data.stakeholders.filter((item) => quadrant(item) === name) }));

  return <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
    <header style={{ padding: "14px 28px", background: "var(--surface)", borderBottom: "1px solid var(--border)", display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}><Link href="/">← 返回首页</Link><strong>🤝 干系人登记、分析与参与行动</strong><span className="tag tag-blue">V6.3.2真实数据</span><span style={{ marginLeft: "auto", color: "var(--text2)", fontSize: 13 }}>{projectName || "未选择项目"}</span></header>
    <main style={{ maxWidth: 1480, margin: "0 auto", padding: 28 }}>
      {message && <div className="card" style={{ padding: 14, marginBottom: 16, borderLeft: "4px solid var(--accent)" }}>{message}</div>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 14, marginBottom: 18 }}>{[['干系人总数',stats.total],['重点管理',stats.manage],['参与度差距',stats.gaps],['逾期参与行动',stats.overdue]].map(([label,value]) => <div className="stat-card" key={label}><div className="stat-num" style={{ color: label === '逾期参与行动' && Number(value) > 0 ? 'var(--red)' : 'var(--accent)' }}>{value}</div><div className="stat-label">{label}</div></div>)}</div>
      <div style={{ display: "flex", gap: 8, marginBottom: 18, flexWrap: "wrap" }}>{([['register','干系人登记册'],['matrix','权力-利益矩阵'],['actions','参与行动闭环']] as const).map(([key,label]) => <button key={key} className={active === key ? "btn-primary" : "btn-secondary"} onClick={() => setActive(key)}>{label}</button>)}<button className="btn-secondary" onClick={aiAssist} disabled={Boolean(busy)}>{busy === 'ai' ? 'AI分析中…' : 'AI管理策略候选'}</button></div>

      {active === "register" && <div style={{ display: "grid", gridTemplateColumns: "minmax(320px,.8fr) 1.6fr", gap: 18 }}>
        <section className="card" style={{ padding: 20 }}><h2 style={{ marginTop: 0 }}>{stakeholderForm.id ? '编辑干系人' : '登记干系人'}</h2><div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>{[['编号','stakeholder_code'],['姓名','name'],['角色/职务','role_title'],['组织','organization_name'],['权力(1-5)','power'],['利益(1-5)','interest'],['沟通频率','communication_frequency'],['沟通方式','communication_method'],['联系方式偏好','contact_preference']].map(([label,key]) => <label key={key}><span className="label">{label}</span><input className="input" type={['power','interest'].includes(key) ? 'number' : 'text'} min={1} max={5} value={String(stakeholderForm[key as keyof typeof stakeholderForm])} onChange={(event) => setStakeholderForm((value) => ({ ...value, [key]: ['power','interest'].includes(key) ? Number(event.target.value) : event.target.value }))}/></label>)}<label><span className="label">当前参与度</span><select className="input" value={stakeholderForm.current_engagement} onChange={(event) => setStakeholderForm((v) => ({ ...v, current_engagement: event.target.value }))}>{engagementLevels.map((item) => <option key={item}>{item}</option>)}</select></label><label><span className="label">期望参与度</span><select className="input" value={stakeholderForm.desired_engagement} onChange={(event) => setStakeholderForm((v) => ({ ...v, desired_engagement: event.target.value }))}>{engagementLevels.map((item) => <option key={item}>{item}</option>)}</select></label></div><label><span className="label">管理策略</span><textarea className="input" rows={4} value={stakeholderForm.management_strategy} onChange={(event) => setStakeholderForm((v) => ({ ...v, management_strategy: event.target.value }))}/></label><button className="btn-primary" disabled={Boolean(busy)} onClick={saveStakeholder}>{busy === 'stakeholder' ? '保存中…' : '保存登记册'}</button></section>
        <section className="card" style={{ padding: 20, overflowX: "auto" }}><h2 style={{ marginTop: 0 }}>正式登记册</h2><table style={{ width: "100%", borderCollapse: "collapse" }}><thead><tr>{['姓名/角色','组织','权力/利益','参与度','矩阵','策略','操作'].map((h) => <th key={h} style={{ textAlign: "left", padding: 10, borderBottom: "1px solid var(--border)" }}>{h}</th>)}</tr></thead><tbody>{data.stakeholders.map((item) => <tr key={item.id}><td style={{ padding: 10, borderBottom: "1px solid var(--border)" }}><strong>{item.name}</strong><div style={{ fontSize: 12, color: "var(--text2)" }}>{item.stakeholder_code} · {item.role_title || '未设置'}</div></td><td>{item.organization_name || '—'}</td><td>P{item.power} / I{item.interest}</td><td>{item.current_engagement} → {item.desired_engagement}</td><td><span className="tag tag-blue">{quadrant(item)}</span></td><td style={{ maxWidth: 260 }}>{item.management_strategy || '待制定'}</td><td><button className="btn-secondary" onClick={() => setStakeholderForm({ id: item.id, version: item.version, stakeholder_code: item.stakeholder_code, name: item.name, role_title: item.role_title || '', organization_name: item.organization_name || '', power: item.power, interest: item.interest, current_engagement: item.current_engagement, desired_engagement: item.desired_engagement, communication_frequency: item.communication_frequency || '', communication_method: item.communication_method || '', management_strategy: item.management_strategy || '', contact_preference: item.contact_preference || '' })}>编辑</button><button className="btn-primary" style={{ marginLeft: 6 }} onClick={() => { setActionForm((v) => ({ ...v, stakeholder_record_id: item.id })); setActive('actions'); }}>安排参与行动</button></td></tr>)}{!data.stakeholders.length && <tr><td colSpan={7} style={{ padding: 20, textAlign: "center", color: "var(--text2)" }}>{loading ? '读取中…' : '当前项目尚无干系人正式记录'}</td></tr>}</tbody></table></section>
        {aiSuggestion && <section className="card" style={{ padding: 20, gridColumn: "1 / -1", borderLeft: "4px solid #8b5cf6" }}><h2 style={{ marginTop: 0 }}>AI候选策略（未保存）</h2><pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit" }}>{aiSuggestion}</pre></section>}
      </div>}

      {active === "matrix" && <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(280px,1fr))", gap: 16 }}>{groups.map((group, index) => <section className="card" key={group.name} style={{ padding: 20, minHeight: 240, borderTop: `4px solid ${['#ef4444','#f59e0b','#3b82f6','#6b7280'][index]}` }}><h2 style={{ marginTop: 0 }}>{group.name} <span className="tag tag-blue">{group.items.length}人</span></h2><p style={{ color: "var(--text2)" }}>{group.name === '重点管理' ? '高权力 × 高利益：密切协同、及时决策。' : group.name === '保持满意' ? '高权力 × 低利益：保持满意、控制沟通密度。' : group.name === '随时告知' ? '低权力 × 高利益：持续告知、主动收集反馈。' : '低权力 × 低利益：按需监督、保留变化信号。'}</p>{group.items.map((item) => <div key={item.id} className="card" style={{ padding: 12, marginBottom: 8 }}><strong>{item.name} · {item.role_title}</strong><div style={{ fontSize: 12, color: "var(--text2)" }}>P{item.power}/I{item.interest} · {item.current_engagement}→{item.desired_engagement}</div><div style={{ marginTop: 6 }}>{item.management_strategy || '待制定策略'}</div></div>)}</section>)}</div>}

      {active === "actions" && <div style={{ display: "grid", gridTemplateColumns: "minmax(320px,.8fr) 1.5fr", gap: 18 }}>
        <section className="card" style={{ padding: 20 }}><h2 style={{ marginTop: 0 }}>{actionForm.id ? '更新参与行动' : '新增参与行动'}</h2><select className="input" value={actionForm.stakeholder_record_id} onChange={(event) => setActionForm((v) => ({ ...v, stakeholder_record_id: event.target.value }))}><option value="">选择干系人</option>{data.stakeholders.map((item) => <option value={item.id} key={item.id}>{item.name} · {item.role_title}</option>)}</select><div style={{ display: "grid", gap: 10, marginTop: 10 }}>{[['行动类型','action_type'],['沟通/参与主题','subject'],['计划时间','planned_at'],['截止时间','due_at'],['责任人姓名','owner_name'],['实际结果','outcome'],['反馈','feedback']].map(([label,key]) => <label key={key}><span className="label">{label}</span><input className="input" type={key.endsWith('_at') ? 'datetime-local' : 'text'} value={String(actionForm[key as keyof typeof actionForm])} onChange={(event) => setActionForm((value) => ({ ...value, [key]: event.target.value }))}/></label>)}<label><span className="label">状态</span><select className="input" value={actionForm.status} onChange={(event) => setActionForm((v) => ({ ...v, status: event.target.value }))}>{['planned','in_progress','completed','cancelled','overdue'].map((item) => <option value={item} key={item}>{item}</option>)}</select></label></div><button className="btn-primary" style={{ marginTop: 12 }} disabled={Boolean(busy)} onClick={saveAction}>{busy === 'action' ? '保存中…' : '保存参与行动'}</button></section>
        <section className="card" style={{ padding: 20 }}><h2 style={{ marginTop: 0 }}>参与行动闭环</h2>{data.actions.map((item) => { const stakeholder = data.stakeholders.find((s) => s.id === item.stakeholder_record_id); const overdue = item.status !== 'completed' && item.due_at && new Date(item.due_at) < new Date(); return <div key={item.id} style={{ padding: 14, border: `1px solid ${overdue ? 'var(--red)' : 'var(--border)'}`, borderRadius: 10, marginBottom: 10 }}><div style={{ display: "flex", gap: 8, justifyContent: "space-between", flexWrap: "wrap" }}><strong>{stakeholder?.name || '未知干系人'} · {item.subject}</strong><span className="tag tag-blue">{overdue ? 'overdue' : item.status} · v{item.version}</span></div><div style={{ color: "var(--text2)", fontSize: 13, marginTop: 6 }}>{item.action_type} · 责任人{item.owner_name || '未设置'} · deadline {item.due_at || '未设置'}</div>{item.outcome && <p>结果：{item.outcome}</p>}{item.feedback && <p>反馈：{item.feedback}</p>}<button className="btn-secondary" onClick={() => setActionForm({ id: item.id, version: item.version, stakeholder_record_id: item.stakeholder_record_id, action_type: item.action_type, subject: item.subject, planned_at: item.planned_at?.slice(0,16) || '', due_at: item.due_at?.slice(0,16) || '', owner_name: item.owner_name || '', status: item.status, outcome: item.outcome || '', feedback: item.feedback || '' })}>更新行动</button></div>})}{!data.actions.length && <p style={{ color: "var(--text2)" }}>尚无参与行动。每个行动必须有责任人、deadline、结果或反馈。</p>}</section>
      </div>}
    </main>
  </div>;
}
