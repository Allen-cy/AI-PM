"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  loadCurrentBusinessContextSearchParams,
  readStoredBusinessContext,
  readStoredCurrentProject,
  readStoredDataClass,
} from "@/features/operating-model/client-context";

type WbsItem = {
  id?: string;
  item_code: string;
  parent_item_code: string | null;
  level: number;
  name: string;
  description: string;
  duration_days: number;
  predecessors: string[];
  planned_start?: string | null;
  planned_end?: string | null;
  planned_value: number;
  acceptance_criteria: string;
};

type WbsVersion = {
  id: string;
  title: string;
  revision_no: number;
  status: string;
  version: number;
  source_type: string;
  updated_at: string;
};

type DeliveryActual = {
  id: string;
  wbs_item_id: string;
  actual_start?: string | null;
  actual_end?: string | null;
  percent_complete: number;
  status: string;
  actual_cost: number;
  version: number;
};

const blankItem = (index: number): WbsItem => ({
  item_code: String(index + 1),
  parent_item_code: null,
  level: 1,
  name: "",
  description: "",
  duration_days: 5,
  predecessors: [],
  planned_start: null,
  planned_end: null,
  planned_value: 0,
  acceptance_criteria: "",
});

export default function WbsPage() {
  const [projectName, setProjectName] = useState("");
  const [current, setCurrent] = useState<WbsVersion | null>(null);
  const [versions, setVersions] = useState<WbsVersion[]>([]);
  const [items, setItems] = useState<WbsItem[]>([]);
  const [actuals, setActuals] = useState<DeliveryActual[]>([]);
  const [title, setTitle] = useState("项目WBS");
  const [scopeInput, setScopeInput] = useState("");
  const [reviewComment, setReviewComment] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const params = await loadCurrentBusinessContextSearchParams({ preferredRole: "pm" });
      if (!params.get("project_id")) throw new Error("请先在顶部选择已授权项目。");
      const response = await fetch(`/api/wbs?${params.toString()}`, { cache: "no-store" });
      const payload = await response.json() as { data?: { project?: { name?: string }; current?: WbsVersion | null; versions?: WbsVersion[]; items?: WbsItem[]; actuals?: DeliveryActual[] }; detail?: string; error?: string };
      if (!response.ok) throw new Error(payload.detail || payload.error || "WBS读取失败");
      const data = payload.data;
      setProjectName(data?.project?.name || "当前项目");
      setCurrent(data?.current ?? null);
      setVersions(data?.versions ?? []);
      setItems((data?.items?.length ? data.items : [blankItem(0)]).map((item) => ({ ...item, predecessors: Array.isArray(item.predecessors) ? item.predecessors : [] })));
      setActuals(data?.actuals ?? []);
      setTitle(data?.current?.title || `${data?.project?.name || "当前项目"}-WBS`);
      setMessage("");
    } catch (error) {
      setProjectName(""); setCurrent(null); setVersions([]); setItems([blankItem(0)]); setActuals([]);
      setMessage(error instanceof Error ? error.message : "WBS数据源不可用");
    } finally {
      setLoading(false);
    }
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
    const context = readStoredBusinessContext();
    const projectId = readStoredCurrentProject();
    if (!context?.businessRole || !projectId) return null;
    return {
      project_id: projectId,
      business_role: context.businessRole,
      data_class: readStoredDataClass(),
      expected_version: expectedVersion,
      idempotency_key: `v631:wbs:${projectId}:${crypto.randomUUID()}`,
    };
  };

  const post = async (body: Record<string, unknown>) => {
    const response = await fetch("/api/wbs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const payload = await response.json() as { data?: unknown; detail?: string; error?: string };
    if (!response.ok) throw new Error(payload.detail || payload.error || "WBS操作失败");
    return payload.data;
  };

  const updateItem = (index: number, patch: Partial<WbsItem>) => setItems((currentItems) => currentItems.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));

  const saveVersion = async () => {
    const context = writeContext(current?.version ?? 0);
    if (!context) return setMessage("请先选择当前项目和业务身份。");
    if (items.some((item) => !item.item_code.trim() || !item.name.trim() || Number(item.duration_days) <= 0)) return setMessage("工作包编码、名称和大于0的工期均为必填项。");
    setBusy("save");
    try {
      await post({ operation: "save_version", ...context, title, scope_source: { user_input: scopeInput }, source_type: "human_input", items });
      setMessage("WBS版本已保存到Supabase；草稿尚未成为批准基准。");
      await loadData();
    } catch (error) { setMessage(`保存失败：${error instanceof Error ? error.message : "未知错误"}`); }
    finally { setBusy(""); }
  };

  const aiAssist = async () => {
    if (!scopeInput.trim()) return setMessage("请先录入真实的范围、交付物和约束信息。");
    const context = writeContext(current?.version ?? 0);
    if (!context) return setMessage("请先选择当前项目和业务身份。");
    setBusy("ai");
    try {
      const result = await post({ operation: "assist", ...context, scope_input: { narrative: scopeInput, existing_items: items.filter((item) => item.name.trim()) } }) as { items?: WbsItem[] };
      if (!result?.items?.length) throw new Error("AI未返回可复核工作包");
      setItems(result.items);
      setMessage("AI候选WBS已载入编辑区，尚未保存；请逐项复核后点击“保存WBS版本”。");
    } catch (error) { setMessage(`AI辅助失败：${error instanceof Error ? error.message : "未知错误"}`); }
    finally { setBusy(""); }
  };

  const transition = async (action: string) => {
    if (!current) return;
    const context = writeContext(current.version);
    if (!context) return;
    if (["approve", "reject", "request_changes"].includes(action) && !reviewComment.trim()) return setMessage("审批、驳回和退回修改必须填写意见。");
    setBusy(action);
    try {
      await post({ operation: "transition_version", ...context, wbs_version_id: current.id, transition: action, comment: reviewComment.trim() });
      setReviewComment(""); setMessage("WBS状态已更新并写入审计事件。"); await loadData();
    } catch (error) { setMessage(`状态流转失败：${error instanceof Error ? error.message : "未知错误"}`); }
    finally { setBusy(""); }
  };

  const saveActual = async (item: WbsItem, patch: Partial<DeliveryActual>) => {
    if (!item.id) return;
    const prior = actuals.find((actual) => actual.wbs_item_id === item.id);
    const context = writeContext(prior?.version ?? 0);
    if (!context) return;
    setBusy(`actual-${item.id}`);
    try {
      await post({ operation: "save_actual", ...context, wbs_item_id: item.id, actual_start: patch.actual_start ?? prior?.actual_start ?? null, actual_end: patch.actual_end ?? prior?.actual_end ?? null, percent_complete: patch.percent_complete ?? prior?.percent_complete ?? 0, status: patch.status ?? prior?.status ?? "pending", actual_cost: patch.actual_cost ?? prior?.actual_cost ?? 0, evidence: [] });
      setMessage(`工作包“${item.name}”实绩已保存。`); await loadData();
    } catch (error) { setMessage(`实绩保存失败：${error instanceof Error ? error.message : "未知错误"}`); }
    finally { setBusy(""); }
  };

  const actualByItem = useMemo(() => new Map(actuals.map((actual) => [actual.wbs_item_id, actual])), [actuals]);
  const editable = !current || ["draft", "rejected", "changes_requested", "superseded"].includes(current.status);

  return <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
    <header style={{ padding: "14px 28px", background: "var(--surface)", borderBottom: "1px solid var(--border)", display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
      <Link href="/">← 返回首页</Link><strong>🧩 WBS版本与交付实绩</strong>
      <span className="tag tag-blue">{current ? `R${current.revision_no} · ${current.status} · v${current.version}` : "未建立正式版本"}</span>
      <span style={{ marginLeft: "auto", color: "var(--text2)", fontSize: 13 }}>{projectName || "未选择项目"}</span>
    </header>
    <main style={{ maxWidth: 1440, margin: "0 auto", padding: 28 }}>
      {message && <div className="card" style={{ marginBottom: 18, padding: 14, borderLeft: "4px solid var(--accent)" }}>{message}</div>}
      <section className="card" style={{ padding: 22, marginBottom: 20 }}>
        <h2 style={{ marginTop: 0 }}>输入与版本控制</h2>
        <p style={{ color: "var(--text2)" }}>当前页面只处理已选项目。AI可辅助拆解，但正式WBS必须由用户保存、提交和审批。</p>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(240px, 1fr) 2fr", gap: 16 }}>
          <div><label className="label">版本标题</label><input className="input" value={title} onChange={(event) => setTitle(event.target.value)} disabled={!editable} /></div>
          <div><label className="label">范围、交付物与约束（AI输入依据）</label><textarea className="input" rows={3} value={scopeInput} onChange={(event) => setScopeInput(event.target.value)} placeholder="录入范围边界、交付物、验收标准、里程碑和已知约束" /></div>
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
          <button className="btn btn-secondary" onClick={aiAssist} disabled={Boolean(busy)}>{busy === "ai" ? "生成中…" : "AI辅助拆解"}</button>
          <button className="btn btn-primary" onClick={saveVersion} disabled={Boolean(busy) || !editable}>{busy === "save" ? "保存中…" : "保存WBS版本"}</button>
          <button className="btn btn-secondary" onClick={() => setItems((value) => [...value, blankItem(value.length)])} disabled={!editable}>新增工作包</button>
        </div>
      </section>

      <section className="card" style={{ padding: 20, overflowX: "auto", marginBottom: 20 }}>
        <h2 style={{ marginTop: 0 }}>工作分解结构</h2>
        <table style={{ width: "100%", minWidth: 1120, borderCollapse: "collapse" }}><thead><tr>{["编码", "父级", "名称", "工期(天)", "前置编码", "计划开始", "计划完成", "计划价值", "验收标准", "操作"].map((label) => <th key={label} style={{ textAlign: "left", padding: 8, borderBottom: "1px solid var(--border)" }}>{label}</th>)}</tr></thead>
          <tbody>{items.map((item, index) => <tr key={`${item.id || "draft"}-${index}`}>
            <td><input className="input" style={{ width: 80 }} value={item.item_code} onChange={(e) => updateItem(index, { item_code: e.target.value })} disabled={!editable} /></td>
            <td><input className="input" style={{ width: 80 }} value={item.parent_item_code || ""} onChange={(e) => updateItem(index, { parent_item_code: e.target.value || null, level: e.target.value ? 2 : 1 })} disabled={!editable} /></td>
            <td><input className="input" style={{ minWidth: 170 }} value={item.name} onChange={(e) => updateItem(index, { name: e.target.value })} disabled={!editable} /></td>
            <td><input className="input" type="number" style={{ width: 90 }} value={item.duration_days} onChange={(e) => updateItem(index, { duration_days: Number(e.target.value) })} disabled={!editable} /></td>
            <td><input className="input" style={{ width: 120 }} value={item.predecessors.join(",")} onChange={(e) => updateItem(index, { predecessors: e.target.value.split(",").map((value) => value.trim()).filter(Boolean) })} disabled={!editable} /></td>
            <td><input className="input" type="date" value={item.planned_start || ""} onChange={(e) => updateItem(index, { planned_start: e.target.value || null })} disabled={!editable} /></td>
            <td><input className="input" type="date" value={item.planned_end || ""} onChange={(e) => updateItem(index, { planned_end: e.target.value || null })} disabled={!editable} /></td>
            <td><input className="input" type="number" style={{ width: 110 }} value={item.planned_value} onChange={(e) => updateItem(index, { planned_value: Number(e.target.value) })} disabled={!editable} /></td>
            <td><input className="input" style={{ minWidth: 170 }} value={item.acceptance_criteria} onChange={(e) => updateItem(index, { acceptance_criteria: e.target.value })} disabled={!editable} /></td>
            <td><button className="btn btn-secondary" onClick={() => setItems((value) => value.filter((_, itemIndex) => itemIndex !== index))} disabled={!editable || items.length === 1}>删除</button></td>
          </tr>)}</tbody></table>
      </section>

      {current && <section className="card" style={{ padding: 20, marginBottom: 20 }}>
        <h2 style={{ marginTop: 0 }}>人工流转</h2>
        <textarea className="input" rows={2} value={reviewComment} onChange={(event) => setReviewComment(event.target.value)} placeholder="审批、驳回、退回修改或替代旧版时填写意见" />
        <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          {current.status === "draft" && <button className="btn btn-primary" onClick={() => transition("submit")}>提交审批</button>}
          {current.status === "submitted" && <><button className="btn btn-primary" onClick={() => transition("approve")}>批准</button><button className="btn btn-secondary" onClick={() => transition("request_changes")}>退回修改</button><button className="btn btn-secondary" onClick={() => transition("reject")}>驳回</button></>}
          {["rejected", "changes_requested"].includes(current.status) && <button className="btn btn-primary" onClick={() => transition("revise")}>转为修订草稿</button>}
          {current.status === "approved" && <button className="btn btn-secondary" onClick={() => transition("supersede")}>启动新版本</button>}
        </div>
      </section>}

      {current && items.some((item) => item.id) && <section className="card" style={{ padding: 20, overflowX: "auto", marginBottom: 20 }}>
        <h2 style={{ marginTop: 0 }}>执行实绩（供EVM与监控使用）</h2>
        <table style={{ width: "100%", minWidth: 900, borderCollapse: "collapse" }}><thead><tr>{["工作包", "状态", "完成率", "实际成本", "实际开始", "实际完成", "保存"].map((label) => <th key={label} style={{ textAlign: "left", padding: 8, borderBottom: "1px solid var(--border)" }}>{label}</th>)}</tr></thead>
          <tbody>{items.filter((item) => item.id).map((item) => {
            const actual = actualByItem.get(item.id!);
            return <ActualRow key={`${item.id}-${actual?.version ?? 0}`} item={item} actual={actual} busy={busy === `actual-${item.id}`} onSave={(patch) => saveActual(item, patch)} />;
          })}</tbody></table>
      </section>}

      <section className="card" style={{ padding: 20 }}><h2 style={{ marginTop: 0 }}>版本历史</h2>{loading ? "读取中…" : versions.length ? versions.map((version) => <div key={version.id} style={{ padding: "10px 0", borderBottom: "1px solid var(--border)" }}>R{version.revision_no} · {version.status} · v{version.version} · {new Date(version.updated_at).toLocaleString("zh-CN")}</div>) : "尚无正式版本"}</section>
    </main>
  </div>;
}

function ActualRow({ item, actual, busy, onSave }: { item: WbsItem; actual?: DeliveryActual; busy: boolean; onSave: (patch: Partial<DeliveryActual>) => void }) {
  const [draft, setDraft] = useState<Partial<DeliveryActual>>({ status: actual?.status || "pending", percent_complete: actual?.percent_complete || 0, actual_cost: actual?.actual_cost || 0, actual_start: actual?.actual_start || null, actual_end: actual?.actual_end || null });
  return <tr><td style={{ padding: 8 }}>{item.item_code} {item.name}</td><td><select className="input" value={draft.status} onChange={(e) => setDraft((value) => ({ ...value, status: e.target.value }))}><option value="pending">未开始</option><option value="in_progress">进行中</option><option value="completed">已完成</option><option value="blocked">阻塞</option><option value="cancelled">已取消</option></select></td><td><input className="input" type="number" min={0} max={100} value={draft.percent_complete} onChange={(e) => setDraft((value) => ({ ...value, percent_complete: Number(e.target.value) }))} /></td><td><input className="input" type="number" min={0} value={draft.actual_cost} onChange={(e) => setDraft((value) => ({ ...value, actual_cost: Number(e.target.value) }))} /></td><td><input className="input" type="date" value={draft.actual_start || ""} onChange={(e) => setDraft((value) => ({ ...value, actual_start: e.target.value || null }))} /></td><td><input className="input" type="date" value={draft.actual_end || ""} onChange={(e) => setDraft((value) => ({ ...value, actual_end: e.target.value || null }))} /></td><td><button className="btn btn-primary" disabled={busy} onClick={() => onSave(draft)}>{busy ? "保存中…" : "保存实绩"}</button></td></tr>;
}
