"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  loadCurrentBusinessContextSearchParams,
  readStoredBusinessContext,
  readStoredCurrentProject,
  readStoredDataClass,
} from "@/features/operating-model/client-context";

type Member = { id: string; name?: string | null; email: string; business_roles: string[] };
type WbsItem = { id: string; item_code: string; name: string };
type Plan = { id: string; title: string; horizon_start: string; horizon_end: string; status: string; version: number; updated_at: string };
type CapacityPeriod = { id?: string; owner_user_id: string; owner_name: string; role_name: string; period_start: string; period_end: string; capacity_hours: number };
type Assignment = { id?: string; capacity_period_id?: string; owner_user_id: string; period_start: string; wbs_item_id: string | null; allocated_hours: number; allocation_note: string };
type Conflict = { id: string; owner_user_id: string; overload_hours: number; action_title: string; action_plan: string; due_at: string; status: string; version: number; resolution_evidence?: unknown[] };

const addDays = (date: string, days: number) => { const value = new Date(`${date}T00:00:00`); value.setDate(value.getDate() + days); return value.toISOString().slice(0, 10); };
const monday = () => { const value = new Date(); const day = value.getDay() || 7; value.setDate(value.getDate() - day + 1); return value.toISOString().slice(0, 10); };

export default function ResourcePage() {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [title, setTitle] = useState("8–12周资源容量计划");
  const [horizonStart, setHorizonStart] = useState(monday());
  const [weeks, setWeeks] = useState(8);
  const [members, setMembers] = useState<Member[]>([]);
  const [wbsItems, setWbsItems] = useState<WbsItem[]>([]);
  const [periods, setPeriods] = useState<CapacityPeriod[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [selectedMember, setSelectedMember] = useState("");
  const [newAllocation, setNewAllocation] = useState({ owner_user_id: "", period_start: "", wbs_item_id: "", hours: 0, note: "" });
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const params = await loadCurrentBusinessContextSearchParams({ preferredRole: "pm" });
      if (!params.get("project_id")) throw new Error("请先选择已授权项目。");
      const response = await fetch(`/api/resource?${params.toString()}`, { cache: "no-store" });
      const payload = await response.json() as { data?: { plan?: Plan | null; periods?: CapacityPeriod[]; assignments?: Array<Omit<Assignment, "period_start">>; conflicts?: Conflict[]; wbsItems?: WbsItem[]; members?: Member[] }; detail?: string; error?: string };
      if (!response.ok) throw new Error(payload.detail || payload.error || "资源数据读取失败");
      const data = payload.data;
      setPlan(data?.plan ?? null); setMembers(data?.members ?? []); setWbsItems(data?.wbsItems ?? []); setConflicts(data?.conflicts ?? []);
      if (data?.plan) {
        setTitle(data.plan.title); setHorizonStart(data.plan.horizon_start);
        setWeeks(Math.max(8, Math.min(12, Math.round((new Date(data.plan.horizon_end).getTime() - new Date(data.plan.horizon_start).getTime()) / 604800000))));
      }
      const loadedPeriods = data?.periods ?? [];
      setPeriods(loadedPeriods);
      const periodById = new Map(loadedPeriods.map((period) => [period.id, period]));
      setAssignments((data?.assignments ?? []).map((assignment) => ({ ...assignment, period_start: periodById.get(assignment.capacity_period_id)?.period_start || "" })));
      setMessage("");
    } catch (error) {
      setPlan(null); setMembers([]); setWbsItems([]); setPeriods([]); setAssignments([]); setConflicts([]);
      setMessage(error instanceof Error ? error.message : "资源数据源不可用");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const first = window.setTimeout(() => void loadData(), 0);
    const reload = () => void loadData();
    window.addEventListener("ai-pmo:project-context-changed", reload);
    window.addEventListener("ai-pmo:business-context-changed", reload);
    window.addEventListener("ai-pmo:data-class-changed", reload);
    return () => {
      window.clearTimeout(first);
      window.removeEventListener("ai-pmo:project-context-changed", reload);
      window.removeEventListener("ai-pmo:business-context-changed", reload);
      window.removeEventListener("ai-pmo:data-class-changed", reload);
    };
  }, [loadData]);

  const writeContext = (expectedVersion: number) => {
    const context = readStoredBusinessContext(); const projectId = readStoredCurrentProject();
    if (!context?.businessRole || !projectId) return null;
    return { project_id: projectId, business_role: context.businessRole, data_class: readStoredDataClass(), expected_version: expectedVersion, idempotency_key: `v631:resource:${projectId}:${crypto.randomUUID()}` };
  };

  const post = async (body: Record<string, unknown>) => {
    const response = await fetch("/api/resource", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const payload = await response.json() as { data?: unknown; detail?: string; error?: string };
    if (!response.ok) throw new Error(payload.detail || payload.error || "资源操作失败");
    return payload.data;
  };

  const addMemberPeriods = () => {
    const member = members.find((item) => item.id === selectedMember);
    if (!member) return setMessage("请选择项目成员。");
    const role = member.business_roles[0] || "project_member";
    const retained = periods.filter((period) => period.owner_user_id !== member.id);
    const generated = Array.from({ length: weeks }, (_, index) => ({ owner_user_id: member.id, owner_name: member.name || member.email, role_name: role, period_start: addDays(horizonStart, index * 7), period_end: addDays(horizonStart, index * 7 + 6), capacity_hours: 40 }));
    setPeriods([...retained, ...generated]);
    setAssignments((value) => value.filter((assignment) => assignment.owner_user_id !== member.id));
    setMessage(`已生成${member.name || member.email}的${weeks}周容量草稿，尚未保存。`);
  };

  const regenerateHorizon = () => {
    const selectedIds = [...new Set(periods.map((period) => period.owner_user_id))];
    const generated = selectedIds.flatMap((id) => { const member = members.find((item) => item.id === id); if (!member) return []; return Array.from({ length: weeks }, (_, index) => ({ owner_user_id: id, owner_name: member.name || member.email, role_name: member.business_roles[0] || "project_member", period_start: addDays(horizonStart, index * 7), period_end: addDays(horizonStart, index * 7 + 6), capacity_hours: 40 })); });
    setPeriods(generated); setAssignments([]); setMessage("容量区间已重新生成，原草稿分配已清空，请重新分配后保存。");
  };

  const addAssignment = () => {
    if (!newAllocation.owner_user_id || !newAllocation.period_start || Number(newAllocation.hours) <= 0) return setMessage("请选择成员、周次并填写大于0的分配工时。");
    setAssignments((value) => [...value, { owner_user_id: newAllocation.owner_user_id, period_start: newAllocation.period_start, wbs_item_id: newAllocation.wbs_item_id || null, allocated_hours: Number(newAllocation.hours), allocation_note: newAllocation.note }]);
    setNewAllocation((value) => ({ ...value, hours: 0, note: "" })); setMessage("分配已加入草稿，保存后系统会自动识别超配并生成责任动作。");
  };

  const savePlan = async () => {
    const context = writeContext(plan?.version ?? 0);
    if (!context) return setMessage("请先选择当前项目和业务身份。");
    if (!periods.length) return setMessage("请至少添加一名项目成员的容量期间。");
    setBusy("save");
    try {
      await post({ operation: "save_plan", ...context, title, horizon_start: horizonStart, horizon_end: addDays(horizonStart, weeks * 7 - 1), periods, assignments });
      setMessage("8–12周容量计划已保存，超配项已自动形成责任到人的冲突动作。"); await loadData();
    } catch (error) { setMessage(`保存失败：${error instanceof Error ? error.message : "未知错误"}`); }
    finally { setBusy(""); }
  };

  const aiAssist = async () => {
    const context = writeContext(plan?.version ?? 0); if (!context || !plan) return setMessage("请先保存容量计划。");
    setBusy("ai");
    try { const data = await post({ operation: "assist", ...context }) as { suggestions?: string[] }; setMessage(`AI建议：${data?.suggestions?.join("；") || "暂无调整建议"}`); }
    catch (error) { setMessage(`AI分析失败：${error instanceof Error ? error.message : "未知错误"}`); }
    finally { setBusy(""); }
  };

  const transitionConflict = async (conflict: Conflict, transition: string) => {
    const context = writeContext(conflict.version); if (!context) return;
    const comment = window.prompt("请输入处理说明或复核意见", conflict.action_plan || "") ?? "";
    if (["verify", "reopen"].includes(transition) && !comment.trim()) return setMessage("该动作必须填写复核意见。");
    const evidence = transition === "submit_evidence" ? [{ type: "user_statement", content: comment.trim(), submitted_at: new Date().toISOString() }] : [];
    setBusy(conflict.id);
    try { await post({ operation: "transition_conflict", ...context, conflict_id: conflict.id, transition, comment, evidence }); setMessage("冲突动作状态已更新并写入审计事件。"); await loadData(); }
    catch (error) { setMessage(`冲突处理失败：${error instanceof Error ? error.message : "未知错误"}`); }
    finally { setBusy(""); }
  };

  const allocationByPeriod = useMemo(() => { const map = new Map<string, number>(); assignments.forEach((assignment) => { const key = `${assignment.owner_user_id}:${assignment.period_start}`; map.set(key, (map.get(key) || 0) + Number(assignment.allocated_hours)); }); return map; }, [assignments]);
  const selectedMemberPeriods = periods.filter((period) => period.owner_user_id === newAllocation.owner_user_id);

  return <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
    <header style={{ padding: "14px 28px", background: "var(--surface)", borderBottom: "1px solid var(--border)", display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}><Link href="/">← 返回首页</Link><strong>👥 资源容量与冲突管理</strong><span className="tag tag-blue">8–12周滚动计划</span><span style={{ marginLeft: "auto", color: "var(--text2)", fontSize: 13 }}>{plan ? `${plan.status} · v${plan.version}` : "未建立计划"}</span></header>
    <main style={{ maxWidth: 1480, margin: "0 auto", padding: 28 }}>
      {message && <div className="card" style={{ padding: 14, marginBottom: 18, borderLeft: "4px solid var(--accent)" }}>{message}</div>}
      <section className="card" style={{ padding: 20, marginBottom: 20 }}><h2 style={{ marginTop: 0 }}>计划设置</h2><div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr auto", gap: 12, alignItems: "end" }}><div><label className="label">计划名称</label><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} /></div><div><label className="label">开始周</label><input className="input" type="date" value={horizonStart} onChange={(e) => setHorizonStart(e.target.value)} /></div><div><label className="label">滚动周数</label><select className="input" value={weeks} onChange={(e) => setWeeks(Number(e.target.value))}>{[8, 9, 10, 11, 12].map((value) => <option key={value} value={value}>{value}周</option>)}</select></div><button className="btn btn-secondary" onClick={regenerateHorizon}>重新生成区间</button></div><div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}><select className="input" style={{ maxWidth: 330 }} value={selectedMember} onChange={(e) => setSelectedMember(e.target.value)}><option value="">选择已授权项目成员</option>{members.map((member) => <option key={member.id} value={member.id}>{member.name || member.email} · {member.business_roles.join("/")}</option>)}</select><button className="btn btn-secondary" onClick={addMemberPeriods}>加入容量计划</button><button className="btn btn-primary" onClick={savePlan} disabled={busy === "save"}>{busy === "save" ? "保存中…" : "保存8–12周计划"}</button><button className="btn btn-secondary" onClick={aiAssist} disabled={!plan || busy === "ai"}>{busy === "ai" ? "分析中…" : "AI容量建议"}</button></div>{!loading && members.length === 0 && <p style={{ color: "var(--red)" }}>当前项目没有可选择的真实角色成员，请管理员先完成项目级角色分配。</p>}</section>

      <section className="card" style={{ padding: 20, overflowX: "auto", marginBottom: 20 }}><h2 style={{ marginTop: 0 }}>周容量负荷</h2><table style={{ width: "100%", minWidth: 900, borderCollapse: "collapse" }}><thead><tr>{["成员", "角色", "周次", "可用工时", "已分配", "利用率", "状态"].map((label) => <th key={label} style={{ textAlign: "left", padding: 9, borderBottom: "1px solid var(--border)" }}>{label}</th>)}</tr></thead><tbody>{periods.map((period, index) => { const allocated = allocationByPeriod.get(`${period.owner_user_id}:${period.period_start}`) || 0; const utilization = period.capacity_hours > 0 ? allocated / period.capacity_hours * 100 : 0; return <tr key={`${period.owner_user_id}-${period.period_start}`}><td style={{ padding: 9 }}>{period.owner_name}</td><td>{period.role_name}</td><td>{period.period_start} — {period.period_end}</td><td><input className="input" type="number" style={{ width: 100 }} value={period.capacity_hours} onChange={(e) => setPeriods((value) => value.map((row, rowIndex) => rowIndex === index ? { ...row, capacity_hours: Number(e.target.value) } : row))} /></td><td>{allocated.toFixed(1)}h</td><td>{utilization.toFixed(0)}%</td><td style={{ color: utilization > 100 ? "var(--red)" : utilization < 60 ? "#f59e0b" : "var(--green)" }}>{utilization > 100 ? "超配" : utilization < 60 ? "利用率偏低" : "正常"}</td></tr>; })}</tbody></table>{periods.length === 0 && <p style={{ color: "var(--text2)" }}>尚未选择项目成员。</p>}</section>

      <section className="card" style={{ padding: 20, marginBottom: 20 }}><h2 style={{ marginTop: 0 }}>任务分配草稿</h2><div style={{ display: "grid", gridTemplateColumns: "repeat(5,minmax(150px,1fr)) auto", gap: 10, alignItems: "end" }}><div><label className="label">成员</label><select className="input" value={newAllocation.owner_user_id} onChange={(e) => setNewAllocation({ ...newAllocation, owner_user_id: e.target.value, period_start: "" })}><option value="">请选择</option>{[...new Map(periods.map((period) => [period.owner_user_id, period])).values()].map((period) => <option key={period.owner_user_id} value={period.owner_user_id}>{period.owner_name}</option>)}</select></div><div><label className="label">周次</label><select className="input" value={newAllocation.period_start} onChange={(e) => setNewAllocation({ ...newAllocation, period_start: e.target.value })}><option value="">请选择</option>{selectedMemberPeriods.map((period) => <option key={period.period_start} value={period.period_start}>{period.period_start}</option>)}</select></div><div><label className="label">WBS工作包</label><select className="input" value={newAllocation.wbs_item_id} onChange={(e) => setNewAllocation({ ...newAllocation, wbs_item_id: e.target.value })}><option value="">非WBS公共工作</option>{wbsItems.map((item) => <option key={item.id} value={item.id}>{item.item_code} {item.name}</option>)}</select></div><div><label className="label">分配工时</label><input className="input" type="number" min={0} value={newAllocation.hours} onChange={(e) => setNewAllocation({ ...newAllocation, hours: Number(e.target.value) })} /></div><div><label className="label">说明</label><input className="input" value={newAllocation.note} onChange={(e) => setNewAllocation({ ...newAllocation, note: e.target.value })} /></div><button className="btn btn-secondary" onClick={addAssignment}>加入</button></div><div style={{ overflowX: "auto", marginTop: 14 }}><table style={{ width: "100%", minWidth: 700, borderCollapse: "collapse" }}><thead><tr>{["成员", "周次", "WBS", "工时", "说明", "操作"].map((label) => <th key={label} style={{ textAlign: "left", padding: 8, borderBottom: "1px solid var(--border)" }}>{label}</th>)}</tr></thead><tbody>{assignments.map((assignment, index) => <tr key={`${assignment.id || "draft"}-${index}`}><td style={{ padding: 8 }}>{members.find((member) => member.id === assignment.owner_user_id)?.name || assignment.owner_user_id}</td><td>{assignment.period_start}</td><td>{wbsItems.find((item) => item.id === assignment.wbs_item_id)?.name || "公共工作"}</td><td>{assignment.allocated_hours}h</td><td>{assignment.allocation_note || "—"}</td><td><button className="btn btn-secondary" onClick={() => setAssignments((value) => value.filter((_, rowIndex) => rowIndex !== index))}>删除</button></td></tr>)}</tbody></table></div></section>

      <section className="card" style={{ padding: 20 }}><h2 style={{ marginTop: 0 }}>资源冲突闭环</h2><p style={{ color: "var(--text2)" }}>保存计划时系统自动为超配周生成责任动作；责任人处理、提交证据，PMO复核后才能关闭。</p>{conflicts.length ? conflicts.map((conflict) => <div key={conflict.id} style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 14, marginBottom: 10 }}><div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}><strong>{conflict.action_title}</strong><span className="tag tag-red">超配 {conflict.overload_hours}h</span><span className="tag tag-blue">{conflict.status}</span><span style={{ marginLeft: "auto", color: "var(--text2)" }}>期限 {new Date(conflict.due_at).toLocaleString("zh-CN")}</span></div><p>{conflict.action_plan || "尚未录入处理方案"}</p><div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{conflict.status === "assigned" && <button className="btn btn-secondary" onClick={() => transitionConflict(conflict, "accept")}>接受</button>}{["assigned", "accepted", "reopened"].includes(conflict.status) && <button className="btn btn-secondary" onClick={() => transitionConflict(conflict, "start")}>开始处理</button>}{conflict.status === "in_progress" && <button className="btn btn-primary" onClick={() => transitionConflict(conflict, "submit_evidence")}>提交证据</button>}{conflict.status === "evidence_submitted" && <button className="btn btn-primary" onClick={() => transitionConflict(conflict, "verify")}>PMO复核</button>}{conflict.status === "verified" && <button className="btn btn-primary" onClick={() => transitionConflict(conflict, "close")}>关闭</button>}{["verified", "closed"].includes(conflict.status) && <button className="btn btn-secondary" onClick={() => transitionConflict(conflict, "reopen")}>重新打开</button>}</div></div>) : <p>当前没有已持久化的超配冲突。</p>}</section>
    </main>
  </div>;
}
