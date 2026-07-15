"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { loadCurrentBusinessContextSearchParams, readStoredBusinessContext, readStoredCurrentProject, readStoredDataClass } from "@/features/operating-model/client-context";

type ContractRecord = { id: string; contract_code: string; name: string; customer_name?: string | null; supplier_name?: string | null; total_amount: number; currency: string; signed_date?: string | null; payment_terms?: string | null; status: string; version: number; source_type: string; source_record_id?: string | null; updated_at: string };
type ReceivableRecord = { id: string; contract_record_id: string; receivable_code: string; title: string; amount: number; due_date?: string | null; trigger_type?: string | null; trigger_reference?: string | null; invoice_no?: string | null; invoice_amount: number; invoice_date?: string | null; status: string; version: number; updated_at: string };
type CollectionRecord = { id: string; receivable_record_id: string; collection_code: string; amount: number; collected_date: string; payment_reference?: string | null; writeoff_amount: number; status: string; version: number; created_at: string };
type MirrorRecord = { id: string; contract_code?: string | null; payment_code?: string | null; name: string; source_system?: string | null; source_record_id?: string | null; source_updated_at?: string | null };
type CommercialData = { project?: { name?: string }; contracts: ContractRecord[]; receivables: ReceivableRecord[]; collections: CollectionRecord[]; sourceMirror: { contracts: MirrorRecord[]; payments: MirrorRecord[] } };

const money = (amount: number, currency = "CNY") => new Intl.NumberFormat("zh-CN", { style: "currency", currency, maximumFractionDigits: 2 }).format(Number(amount || 0));
const statusLabels: Record<string, string> = { draft: "草稿", submitted: "待审核", changes_requested: "退回修改", active: "生效", suspended: "暂停", closed: "关闭", terminated: "终止", planned: "计划中", due: "已到期", invoiced: "已开票", partially_collected: "部分回款", collected: "已回款", overdue: "逾期", waived: "核销" };

export default function ContractPage() {
  const [data, setData] = useState<CommercialData>({ contracts: [], receivables: [], collections: [], sourceMirror: { contracts: [], payments: [] } });
  const [projectName, setProjectName] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [active, setActive] = useState<"overview" | "contracts" | "receivables" | "sources">("overview");
  const [reviewComment, setReviewComment] = useState("");
  const [contractForm, setContractForm] = useState({ id: "", version: 0, contract_code: "", name: "", customer_name: "", supplier_name: "", total_amount: "", currency: "CNY", signed_date: "", payment_terms: "" });
  const [receivableForm, setReceivableForm] = useState({ id: "", version: 0, contract_record_id: "", receivable_code: "", title: "", amount: "", due_date: "", trigger_type: "验收", trigger_reference: "", invoice_no: "", invoice_amount: "", invoice_date: "", status: "planned" });
  const [collectionForm, setCollectionForm] = useState({ receivable_record_id: "", collection_code: "", amount: "", collected_date: new Date().toISOString().slice(0, 10), payment_reference: "", writeoff_amount: "0" });
  const [termsText, setTermsText] = useState("");
  const [candidate, setCandidate] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const params = await loadCurrentBusinessContextSearchParams({ preferredRole: "operations" });
      if (!params.get("project_id")) throw new Error("请先在顶部选择已授权项目。");
      const response = await fetch(`/api/contract?${params.toString()}`, { cache: "no-store" });
      const payload = await response.json() as { data?: CommercialData; detail?: string; error?: string };
      if (!response.ok) throw new Error(payload.detail || payload.error || "合同回款读取失败");
      const next = payload.data ?? { contracts: [], receivables: [], collections: [], sourceMirror: { contracts: [], payments: [] } };
      setData(next);
      setProjectName(next.project?.name || "当前项目");
      setMessage("");
    } catch (error) {
      setData({ contracts: [], receivables: [], collections: [], sourceMirror: { contracts: [], payments: [] } });
      setProjectName("");
      setMessage(error instanceof Error ? error.message : "合同回款数据源不可用");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const first = window.setTimeout(() => void loadData(), 0);
    const reload = () => void loadData();
    window.addEventListener("ai-pmo:project-context-changed", reload);
    window.addEventListener("ai-pmo:business-context-changed", reload);
    window.addEventListener("ai-pmo:data-class-changed", reload);
    return () => { window.clearTimeout(first); window.removeEventListener("ai-pmo:project-context-changed", reload); window.removeEventListener("ai-pmo:business-context-changed", reload); window.removeEventListener("ai-pmo:data-class-changed", reload); };
  }, [loadData]);

  const writeContext = (expectedVersion: number) => {
    const context = readStoredBusinessContext(); const projectId = readStoredCurrentProject();
    if (!context?.businessRole || !projectId) return null;
    return { project_id: projectId, business_role: context.businessRole, data_class: readStoredDataClass(), expected_version: expectedVersion, idempotency_key: `v632:commercial:${projectId}:${crypto.randomUUID()}` };
  };
  const post = async (body: Record<string, unknown>) => {
    const response = await fetch("/api/contract", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const payload = await response.json() as { data?: unknown; detail?: string; error?: string };
    if (!response.ok) throw new Error(payload.detail || payload.error || "合同回款操作失败");
    return payload.data;
  };

  const totals = useMemo(() => {
    const contractTotal = data.contracts.filter((item) => item.status !== "terminated").reduce((sum, item) => sum + Number(item.total_amount || 0), 0);
    const receivableTotal = data.receivables.filter((item) => item.status !== "waived").reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const collectedTotal = data.collections.filter((item) => item.status === "confirmed").reduce((sum, item) => sum + Number(item.amount || 0) + Number(item.writeoff_amount || 0), 0);
    const overdue = data.receivables.filter((item) => item.status === "overdue" || (item.due_date && new Date(item.due_date) < new Date() && !["collected", "waived"].includes(item.status)));
    return { contractTotal, receivableTotal, collectedTotal, overdue, rate: receivableTotal ? collectedTotal / receivableTotal * 100 : 0 };
  }, [data]);

  const monthlyForecast = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of data.receivables) if (item.due_date && !["collected", "waived"].includes(item.status)) map.set(item.due_date.slice(0, 7), (map.get(item.due_date.slice(0, 7)) || 0) + Number(item.amount || 0));
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(0, 6);
  }, [data.receivables]);
  const maxForecast = Math.max(...monthlyForecast.map(([, value]) => value), 1);

  const saveContract = async () => {
    const context = writeContext(contractForm.version); if (!context) return setMessage("请先选择当前项目和业务身份。");
    if (!contractForm.contract_code.trim() || !contractForm.name.trim() || Number(contractForm.total_amount) < 0) return setMessage("合同编号、名称和合法合同金额为必填项。");
    setBusy("contract");
    try { await post({ operation: "save_contract", ...context, record_id: contractForm.id || null, payload: { ...contractForm, total_amount: Number(contractForm.total_amount), source_type: "human_input" } }); setContractForm({ id: "", version: 0, contract_code: "", name: "", customer_name: "", supplier_name: "", total_amount: "", currency: "CNY", signed_date: "", payment_terms: "" }); setMessage("合同记录已保存到Supabase。"); await loadData(); }
    catch (error) { setMessage(`合同保存失败：${error instanceof Error ? error.message : "未知错误"}`); } finally { setBusy(""); }
  };
  const saveReceivable = async () => {
    const context = writeContext(receivableForm.version); if (!context) return setMessage("请先选择当前项目和业务身份。");
    if (!receivableForm.contract_record_id || !receivableForm.receivable_code || !receivableForm.title || Number(receivableForm.amount) < 0) return setMessage("合同、应收编号、节点名称和金额为必填项。");
    setBusy("receivable");
    try { await post({ operation: "save_receivable", ...context, record_id: receivableForm.id || null, payload: { ...receivableForm, amount: Number(receivableForm.amount), invoice_amount: Number(receivableForm.invoice_amount || 0), source_type: "human_input" } }); setReceivableForm({ id: "", version: 0, contract_record_id: "", receivable_code: "", title: "", amount: "", due_date: "", trigger_type: "验收", trigger_reference: "", invoice_no: "", invoice_amount: "", invoice_date: "", status: "planned" }); setMessage("应收/开票节点已保存。"); await loadData(); }
    catch (error) { setMessage(`应收保存失败：${error instanceof Error ? error.message : "未知错误"}`); } finally { setBusy(""); }
  };
  const recordCollection = async () => {
    const context = writeContext(0); if (!context) return setMessage("请先选择当前项目和业务身份。");
    if (!collectionForm.receivable_record_id || !collectionForm.collection_code || Number(collectionForm.amount) <= 0 || !collectionForm.collected_date) return setMessage("应收节点、回款流水号、金额和到账日期为必填项。");
    setBusy("collection");
    try { await post({ operation: "record_collection", ...context, payload: { ...collectionForm, amount: Number(collectionForm.amount), writeoff_amount: Number(collectionForm.writeoff_amount || 0), evidence: [] } }); setMessage("回款流水已确认入账，应收状态已同步更新。"); await loadData(); }
    catch (error) { setMessage(`回款登记失败：${error instanceof Error ? error.message : "未知错误"}`); } finally { setBusy(""); }
  };
  const transition = async (item: ContractRecord, action: string) => {
    const context = writeContext(item.version); if (!context) return;
    if (["activate", "request_changes", "close"].includes(action) && !reviewComment.trim()) return setMessage("审核、退回或关闭合同必须填写意见。");
    setBusy(`transition-${item.id}`);
    try { await post({ operation: "transition", ...context, record_id: item.id, transition: action, comment: reviewComment }); setReviewComment(""); setMessage("合同状态已更新并写入追加式事件。"); await loadData(); }
    catch (error) { setMessage(`合同状态流转失败：${error instanceof Error ? error.message : "未知错误"}`); } finally { setBusy(""); }
  };
  const parseTerms = async () => {
    const context = writeContext(0); if (!context) return setMessage("请先选择当前项目和业务身份。"); if (!termsText.trim()) return setMessage("请先粘贴真实合同付款条款。");
    setBusy("ai");
    try { const result = await post({ operation: "parse_terms", ...context, text: termsText }); setCandidate(JSON.stringify(result, null, 2)); setMessage("AI候选已生成，尚未写入正式应收记录。"); }
    catch (error) { setMessage(`AI解析失败：${error instanceof Error ? error.message : "未知错误"}`); } finally { setBusy(""); }
  };

  return <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
    <header style={{ padding: "14px 28px", background: "var(--surface)", borderBottom: "1px solid var(--border)", display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
      <Link href="/">← 返回首页</Link><strong>💰 合同到现金：合同 · 应收 · 回款</strong><span className="tag tag-blue">V6.3.2真实数据</span><span style={{ marginLeft: "auto", color: "var(--text2)", fontSize: 13 }}>{projectName || "未选择项目"}</span>
    </header>
    <main style={{ maxWidth: 1480, margin: "0 auto", padding: 28 }}>
      {message && <div className="card" style={{ padding: 14, marginBottom: 16, borderLeft: "4px solid var(--accent)" }}>{message}</div>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 14, marginBottom: 18 }}>
        {[['合同总额', money(totals.contractTotal)], ['应收总额', money(totals.receivableTotal)], ['已回款/核销', money(totals.collectedTotal)], ['回款率', `${totals.rate.toFixed(1)}%`], ['逾期节点', `${totals.overdue.length}项`]].map(([label, value]) => <div className="stat-card" key={label}><div className="stat-num" style={{ color: label === "逾期节点" && totals.overdue.length ? "var(--red)" : "var(--accent)" }}>{value}</div><div className="stat-label">{label}</div></div>)}
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 18, flexWrap: "wrap" }}>{([['overview','经营总览'],['contracts','合同管理'],['receivables','应收与回款'],['sources','来源与对账']] as const).map(([key,label]) => <button key={key} className={active === key ? "btn-primary" : "btn-secondary"} onClick={() => setActive(key)}>{label}</button>)}</div>

      {active === "overview" && <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 18 }}>
        <section className="card" style={{ padding: 22 }}><h2 style={{ marginTop: 0 }}>未来回款趋势</h2>{monthlyForecast.length ? <div style={{ display: "flex", alignItems: "flex-end", gap: 16, height: 190, paddingTop: 20 }}>{monthlyForecast.map(([month, amount]) => <div key={month} style={{ flex: 1, textAlign: "center" }}><div style={{ height: Math.max(12, amount / maxForecast * 130), background: "linear-gradient(180deg,var(--accent),#7c3aed)", borderRadius: "8px 8px 2px 2px" }} /><strong style={{ display: "block", fontSize: 12, marginTop: 6 }}>{money(amount)}</strong><span style={{ fontSize: 11, color: "var(--text2)" }}>{month}</span></div>)}</div> : <p style={{ color: "var(--text2)" }}>暂无正式应收到期数据；请在“应收与回款”录入或完成飞书对账。</p>}</section>
        <section className="card" style={{ padding: 22 }}><h2 style={{ marginTop: 0 }}>逾期与阻塞</h2>{totals.overdue.length ? totals.overdue.map((item) => <div key={item.id} style={{ padding: 12, background: "rgba(239,68,68,.08)", border: "1px solid rgba(239,68,68,.25)", borderRadius: 8, marginBottom: 8 }}><strong>{item.receivable_code} · {item.title}</strong><div style={{ color: "var(--text2)", fontSize: 13 }}>{money(item.amount)} · 到期{item.due_date || "未设置"} · {statusLabels[item.status] || item.status}</div></div>) : <p style={{ color: "var(--text2)" }}>当前项目没有逾期应收。</p>}</section>
        <section className="card" style={{ padding: 22, gridColumn: "1 / -1" }}><h2 style={{ marginTop: 0 }}>AI解析付款条款（候选，不自动入账）</h2><textarea className="input" rows={4} value={termsText} onChange={(event) => setTermsText(event.target.value)} placeholder="粘贴合同中的付款条件、比例、日期、验收触发点"/><button className="btn-secondary" style={{ marginTop: 10 }} disabled={Boolean(busy)} onClick={parseTerms}>{busy === "ai" ? "解析中…" : "AI提取应收节点候选"}</button>{candidate && <pre style={{ whiteSpace: "pre-wrap", background: "var(--surface2)", padding: 14, borderRadius: 8, maxHeight: 280, overflow: "auto" }}>{candidate}</pre>}</section>
      </div>}

      {active === "contracts" && <div style={{ display: "grid", gridTemplateColumns: "minmax(320px,.8fr) 1.5fr", gap: 18 }}>
        <section className="card" style={{ padding: 20 }}><h2 style={{ marginTop: 0 }}>{contractForm.id ? "编辑合同" : "登记合同"}</h2><div style={{ display: "grid", gap: 10 }}>{[['合同编号','contract_code'],['合同名称','name'],['客户/甲方','customer_name'],['供应商/乙方','supplier_name'],['合同金额','total_amount'],['签订日期','signed_date']] .map(([label,key]) => <label key={key}><span className="label">{label}</span><input className="input" type={key.includes('date') ? 'date' : key === 'total_amount' ? 'number' : 'text'} value={String(contractForm[key as keyof typeof contractForm])} onChange={(event) => setContractForm((value) => ({ ...value, [key]: event.target.value }))}/></label>)}<label><span className="label">付款条款</span><textarea className="input" rows={4} value={contractForm.payment_terms} onChange={(event) => setContractForm((value) => ({ ...value, payment_terms: event.target.value }))}/></label></div><button className="btn-primary" style={{ marginTop: 12 }} disabled={Boolean(busy)} onClick={saveContract}>{busy === "contract" ? "保存中…" : "保存合同"}</button></section>
        <section className="card" style={{ padding: 20, overflowX: "auto" }}><h2 style={{ marginTop: 0 }}>正式合同台账</h2><label><span className="label">审核意见</span><input className="input" value={reviewComment} onChange={(event) => setReviewComment(event.target.value)} placeholder="激活、退回或关闭时必填"/></label><table style={{ width: "100%", borderCollapse: "collapse", marginTop: 12 }}><thead><tr>{['编号/名称','客户','金额','状态/版本','来源','操作'].map((h) => <th key={h} style={{ textAlign: "left", padding: 10, borderBottom: "1px solid var(--border)" }}>{h}</th>)}</tr></thead><tbody>{data.contracts.map((item) => <tr key={item.id}><td style={{ padding: 10, borderBottom: "1px solid var(--border)" }}><strong>{item.contract_code}</strong><div>{item.name}</div></td><td>{item.customer_name || '—'}</td><td>{money(item.total_amount, item.currency)}</td><td><span className="tag tag-blue">{statusLabels[item.status] || item.status} · v{item.version}</span></td><td>{item.source_type}{item.source_record_id ? <div style={{ fontSize: 11, color: "var(--text2)" }}>{item.source_record_id}</div> : null}</td><td><div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}><button className="btn-secondary" onClick={() => setContractForm({ id: item.id, version: item.version, contract_code: item.contract_code, name: item.name, customer_name: item.customer_name || '', supplier_name: item.supplier_name || '', total_amount: String(item.total_amount), currency: item.currency, signed_date: item.signed_date || '', payment_terms: item.payment_terms || '' })}>编辑</button>{item.status === 'draft' && <button className="btn-primary" onClick={() => transition(item,'submit')}>提交</button>}{item.status === 'submitted' && <><button className="btn-primary" onClick={() => transition(item,'activate')}>激活</button><button className="btn-secondary" onClick={() => transition(item,'request_changes')}>退回</button></>}{item.status === 'changes_requested' && <button className="btn-primary" onClick={() => transition(item,'revise')}>修订</button>}{item.status === 'active' && <button className="btn-secondary" onClick={() => transition(item,'close')}>关闭</button>}</div></td></tr>)}{!data.contracts.length && <tr><td colSpan={6} style={{ padding: 20, textAlign: "center", color: "var(--text2)" }}>{loading ? "读取中…" : "当前项目尚无正式合同记录"}</td></tr>}</tbody></table></section>
      </div>}

      {active === "receivables" && <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(320px,1fr))", gap: 18 }}>
        <section className="card" style={{ padding: 20 }}><h2 style={{ marginTop: 0 }}>登记应收/开票节点</h2><select className="input" value={receivableForm.contract_record_id} onChange={(event) => setReceivableForm((v) => ({ ...v, contract_record_id: event.target.value }))}><option value="">选择正式合同</option>{data.contracts.map((item) => <option value={item.id} key={item.id}>{item.contract_code} · {item.name}</option>)}</select><div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>{[['应收编号','receivable_code'],['节点名称','title'],['应收金额','amount'],['计划到期','due_date'],['触发类型','trigger_type'],['触发依据','trigger_reference'],['发票号','invoice_no'],['开票金额','invoice_amount'],['开票日期','invoice_date']].map(([label,key]) => <label key={key}><span className="label">{label}</span><input className="input" type={key.includes('date') ? 'date' : ['amount','invoice_amount'].includes(key) ? 'number' : 'text'} value={String(receivableForm[key as keyof typeof receivableForm])} onChange={(event) => setReceivableForm((value) => ({ ...value, [key]: event.target.value }))}/></label>)}</div><button className="btn-primary" style={{ marginTop: 12 }} disabled={Boolean(busy)} onClick={saveReceivable}>{busy === "receivable" ? "保存中…" : "保存应收节点"}</button></section>
        <section className="card" style={{ padding: 20 }}><h2 style={{ marginTop: 0 }}>确认到账/核销</h2><select className="input" value={collectionForm.receivable_record_id} onChange={(event) => setCollectionForm((v) => ({ ...v, receivable_record_id: event.target.value }))}><option value="">选择应收节点</option>{data.receivables.filter((item) => !['collected','waived'].includes(item.status)).map((item) => <option value={item.id} key={item.id}>{item.receivable_code} · {item.title} · {money(item.amount)}</option>)}</select><div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>{[['回款流水号','collection_code'],['到账金额','amount'],['到账日期','collected_date'],['银行/支付参考','payment_reference'],['核销金额','writeoff_amount']].map(([label,key]) => <label key={key}><span className="label">{label}</span><input className="input" type={key.includes('date') ? 'date' : ['amount','writeoff_amount'].includes(key) ? 'number' : 'text'} value={String(collectionForm[key as keyof typeof collectionForm])} onChange={(event) => setCollectionForm((value) => ({ ...value, [key]: event.target.value }))}/></label>)}</div><p style={{ color: "var(--text2)", fontSize: 13 }}>到账确认属于人工事实动作；系统会形成回款流水、更新应收状态并保留审计事件。</p><button className="btn-primary" disabled={Boolean(busy)} onClick={recordCollection}>{busy === "collection" ? "登记中…" : "确认回款入账"}</button></section>
        <section className="card" style={{ padding: 20, gridColumn: "1 / -1", overflowX: "auto" }}><h2 style={{ marginTop: 0 }}>应收与回款明细</h2><table style={{ width: "100%", borderCollapse: "collapse" }}><thead><tr>{['应收节点','合同','金额/已收','到期','开票','状态','操作'].map((h) => <th key={h} style={{ textAlign: "left", padding: 10, borderBottom: "1px solid var(--border)" }}>{h}</th>)}</tr></thead><tbody>{data.receivables.map((item) => { const collected = data.collections.filter((c) => c.receivable_record_id === item.id && c.status === 'confirmed').reduce((sum,c) => sum + Number(c.amount) + Number(c.writeoff_amount),0); const contract = data.contracts.find((c) => c.id === item.contract_record_id); return <tr key={item.id}><td style={{ padding: 10, borderBottom: "1px solid var(--border)" }}><strong>{item.receivable_code}</strong><div>{item.title}</div></td><td>{contract?.contract_code || '—'}</td><td>{money(item.amount)}<div style={{ fontSize: 12, color: "var(--green)" }}>已收{money(collected)}</div></td><td>{item.due_date || '—'}</td><td>{item.invoice_no || '未开票'}<div style={{ fontSize: 12 }}>{item.invoice_amount ? money(item.invoice_amount) : ''}</div></td><td><span className="tag tag-blue">{statusLabels[item.status] || item.status} · v{item.version}</span></td><td><button className="btn-secondary" onClick={() => { setReceivableForm({ id: item.id, version: item.version, contract_record_id: item.contract_record_id, receivable_code: item.receivable_code, title: item.title, amount: String(item.amount), due_date: item.due_date || '', trigger_type: item.trigger_type || '', trigger_reference: item.trigger_reference || '', invoice_no: item.invoice_no || '', invoice_amount: String(item.invoice_amount || ''), invoice_date: item.invoice_date || '', status: item.status }); setCollectionForm((v) => ({ ...v, receivable_record_id: item.id })); }}>编辑/回款</button></td></tr>})}{!data.receivables.length && <tr><td colSpan={7} style={{ padding: 20, textAlign: "center", color: "var(--text2)" }}>当前项目尚无正式应收记录</td></tr>}</tbody></table></section>
      </div>}

      {active === "sources" && <section className="card" style={{ padding: 22 }}><h2 style={{ marginTop: 0 }}>飞书事实源与Supabase管理记录</h2><p style={{ color: "var(--text2)" }}>飞书镜像记录只作为业务事实来源；项目人员确认后形成可审批、可审计的正式合同/应收/回款记录。按稳定记录ID关联，不按项目名称猜测。</p><div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}><div><h3>飞书合同镜像（{data.sourceMirror.contracts.length}）</h3>{data.sourceMirror.contracts.map((item) => <div key={item.id} className="card" style={{ padding: 12, marginBottom: 8 }}><strong>{item.contract_code || item.id} · {item.name}</strong><div style={{ fontSize: 12, color: "var(--text2)" }}>{item.source_system || 'feishu'} · {item.source_record_id || '无来源ID'} · {item.source_updated_at || '无更新时间'}</div></div>)}</div><div><h3>飞书回款镜像（{data.sourceMirror.payments.length}）</h3>{data.sourceMirror.payments.map((item) => <div key={item.id} className="card" style={{ padding: 12, marginBottom: 8 }}><strong>{item.payment_code || item.id} · {item.name}</strong><div style={{ fontSize: 12, color: "var(--text2)" }}>{item.source_system || 'feishu'} · {item.source_record_id || '无来源ID'} · {item.source_updated_at || '无更新时间'}</div></div>)}</div></div></section>}
    </main>
  </div>;
}
