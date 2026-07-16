"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BusinessEntitySelect } from "@/components/BusinessEntitySelect";
import { businessContextSearchParams, loadCurrentBusinessContextSearchParams, readStoredBusinessContext, readStoredDataClass, type StoredBusinessContext } from "@/features/operating-model/client-context";

type Run = { id: string; mode: "technical_rehearsal" | "formal_pilot"; data_class: string; name: string; objective: string; status: string; version: number; updated_at: string };
type ModuleDefinition = { key: string; label: string };
type Evaluation = { technical_ready: boolean; formal_passed: boolean; blockers: Array<{ code: string; detail: string }>; metrics: Record<string, number> };
type Bundle = {
  run: Run;
  projects: Array<{ id: string; project_id: string; project: { name: string; oa_no?: string | null } | null }>;
  participants: Array<{ id: string; user_id: string; business_role: string; participant_kind: string; self_signed_at?: string | null; user: { name: string } | null }>;
  module_checks: Array<{ id: string; module_key: string; result: string; summary: string; evidence_refs: unknown[] }>;
  golden_chains: Array<{ id: string; chain_key: string; verification_level: string; status_snapshot: string }>;
  feishu_evidence: Array<{ id: string; action_type: string; retry_count: number; failure_observed_at?: string | null; recovered_at?: string | null }>;
  events: Array<{ id: string; event_type: string; actor_business_role: string; occurred_at: string }>;
  evaluation: Evaluation;
};
type CandidateParticipant = { id: string; user_id: string; user_name: string; business_role: string; account_kind: "real_user" | "test_account" | "service_account" };
type CandidateGolden = { id: string; project_id: string; project_name: string; chain_key: string; status: string };
type CandidateFeishu = { id: string; action_type: string; target_summary: string; writeback_attempt_count: number };
type PreflightItem = { code: string; label: string; detail: string; current: number; target: number; status: "ready" | "blocked" | "pending"; actionHref: string; actionLabel: string };
type Workspace = {
  modules: ModuleDefinition[];
  runs: Run[];
  selected: Bundle | null;
  preflight: { baselineReady: boolean; evidenceReady: boolean; metrics: Record<string, number>; items: PreflightItem[] };
  candidates: {
    projects: Array<{ id: string; name: string; oa_no?: string | null }>;
    participants: CandidateParticipant[];
    golden_chains: CandidateGolden[];
    feishu_confirmations: CandidateFeishu[];
  };
};

const ROLE_LABEL: Record<string, string> = { pm: "项目经理", operations: "运营", pmo: "PMO", ceo: "CEO" };
const STATUS_LABEL: Record<string, string> = { draft: "草稿", collecting: "收集证据", technical_ready: "技术就绪", running: "正式试点中", verification: "待终验", passed: "正式通过", failed: "未通过", cancelled: "已取消" };

function lines(value: string) { return value.split(/[\n,，；;]/).map(item => item.trim()).filter(Boolean); }
function requestKey(prefix: string) { return `${prefix}:${Date.now()}:${crypto.randomUUID()}`; }

export default function ControlledPilotAcceptancePage() {
  const [context, setContext] = useState<StoredBusinessContext | null>(null);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [selectedRunId, setSelectedRunId] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [createForm, setCreateForm] = useState({ name: "V6.6全模块受控试点", objective: "验证五项目、四角色、黄金链A/E和飞书三类写入的真实闭环。" });
  const [projectId, setProjectId] = useState("");
  const [participantAssignment, setParticipantAssignment] = useState("");
  const [moduleForm, setModuleForm] = useState({ module_key: "identity_access", result: "passed", summary: "", evidence: "" });
  const [goldenRunId, setGoldenRunId] = useState("");
  const [feishuConfirmationId, setFeishuConfirmationId] = useState("");
  const [feishuProjectId, setFeishuProjectId] = useState("");
  const [feishuDraft, setFeishuDraft] = useState({ action_type: "message", target: "", title: "V6.6受控试点协同动作", content: "请按受控试点要求完成确认并保留执行回执。" });
  const [signoffStatement, setSignoffStatement] = useState("本人确认已按当前业务角色完成试点验证，并对提交事实与证据负责。");

  const queryFor = useCallback((active: StoredBusinessContext, runId = "") => {
    const query = businessContextSearchParams(active, readStoredDataClass());
    if (runId) query.set("run_id", runId);
    return query;
  }, []);

  const load = useCallback(async (active: StoredBusinessContext, runId = "") => {
    try {
      const response = await fetch(`/api/operations-center/pilot-acceptance?${queryFor(active, runId)}`, { cache: "no-store" });
      const body = await response.json() as { data?: Workspace; error?: string; detail?: string };
      if (!response.ok || !body.data) throw new Error(body.detail || body.error || "受控试点数据加载失败。");
      setWorkspace(body.data);
      const nextRunId = body.data.selected?.run.id || body.data.runs[0]?.id || "";
      setSelectedRunId(nextRunId);
      setModuleForm(current => ({ ...current, module_key: current.module_key || body.data?.modules[0]?.key || "identity_access" }));
      setNotice("");
    } catch (error) { setNotice(error instanceof Error ? error.message : "加载失败。"); }
  }, [queryFor]);

  useEffect(() => {
    let cancelled = false;
    const initialize = async () => {
      setInitializing(true);
      setWorkspace(null);
      setNotice("");
      try {
        await loadCurrentBusinessContextSearchParams();
        const active = readStoredBusinessContext();
        if (!active) throw new Error("尚未分配有效业务角色，请联系管理员。");
        if (cancelled) return;
        setContext(active);
        await load(active);
      } catch (error) {
        if (!cancelled) setNotice(error instanceof Error ? error.message : "业务身份加载失败。");
      } finally {
        if (!cancelled) setInitializing(false);
      }
    };
    const reload = () => { void initialize(); };
    const timer = window.setTimeout(reload, 0);
    window.addEventListener("ai-pmo:business-context-changed", reload);
    window.addEventListener("ai-pmo:data-class-changed", reload);
    return () => { cancelled = true; window.clearTimeout(timer); window.removeEventListener("ai-pmo:business-context-changed", reload); window.removeEventListener("ai-pmo:data-class-changed", reload); };
  }, [load]);

  async function mutate(operation: string, extra: Record<string, unknown> = {}) {
    if (!context) return;
    const selected = workspace?.selected;
    setBusy(true); setNotice("");
    try {
      const response = await fetch(`/api/operations-center/pilot-acceptance?${queryFor(context, selected?.run.id || selectedRunId)}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operation, ...(operation === "create" ? {} : { run_id: selected?.run.id, expected_version: selected?.run.version }), idempotency_key: requestKey(operation), ...extra }),
      });
      const body = await response.json() as { error?: string; detail?: string; data?: Workspace };
      if (!response.ok) throw new Error(body.detail || body.error || "操作失败。");
      setNotice("已保存到受控试点台账和追加式审计链。请继续完成下一项证据。");
      await load(context, body.data?.selected?.run.id || selected?.run.id || "");
    } catch (error) { setNotice(error instanceof Error ? error.message : "操作失败。"); } finally { setBusy(false); }
  }

  async function queueFeishuAction() {
    if (!context || !feishuProjectId || !feishuDraft.target.trim()) return;
    setBusy(true); setNotice("");
    try {
      const idempotencyKey = requestKey(`pilot-feishu-${feishuDraft.action_type}`);
      const payload = feishuDraft.action_type === "message"
        ? { type: "message", idempotency_key: idempotencyKey, receive_id_type: feishuDraft.target.startsWith("oc_") ? "chat_id" : "open_id", receive_id: feishuDraft.target.trim(), text: `${feishuDraft.title}\n\n${feishuDraft.content}` }
        : { type: "task", idempotency_key: idempotencyKey, summary: feishuDraft.title, description: feishuDraft.content, assignee_ids: [feishuDraft.target.trim()] };
      const response = await fetch("/api/integrations/feishu/actions/confirmations", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: "integration_center", sourcePage: "/operations-center/pilot-acceptance", payload,
          business_context: { role: context.businessRole, org_id: context.orgId, subject_scope: context.subjectScope, subject_id: context.subjectId, data_class: readStoredDataClass(), project_id: feishuProjectId },
        }),
      });
      const body = await response.json() as { warning?: string; status?: string };
      if (!response.ok) throw new Error(body.warning || "飞书确认创建失败。");
      setNotice("飞书动作已进入人工确认队列。请到集成中心确认执行，成功后返回本页关联回执。");
    } catch (error) { setNotice(error instanceof Error ? error.message : "飞书确认创建失败。"); } finally { setBusy(false); }
  }

  const selected = workspace?.selected ?? null;
  const currentRole = context?.businessRole || "";
  const dataClass = readStoredDataClass();
  const canSelfSign = Boolean(selected?.participants.some(item => item.user_id && item.business_role === currentRole && !item.self_signed_at));
  const nextActions = useMemo(() => {
    if (!selected) return [] as Array<{ action: string; label: string; role: string }>;
    const mode = selected.run.mode; const status = selected.run.status;
    if (status === "draft") return [{ action: "start_collection", label: "开始收集验收证据", role: "pmo" }];
    if (status === "collecting" && mode === "technical_rehearsal") return [{ action: "mark_technical_ready", label: "验证技术就绪", role: "pmo" }, { action: "cancel", label: "取消演练", role: "pmo" }];
    if (status === "collecting" && mode === "formal_pilot") return [{ action: "start_formal_pilot", label: "启动正式试点", role: "pmo" }, { action: "cancel", label: "取消试点", role: "pmo" }];
    if (status === "running") return [{ action: "submit_verification", label: "提交终验", role: "pmo" }];
    if (status === "verification") return [{ action: "pass", label: "CEO确认正式通过", role: "ceo" }, { action: "fail", label: "判定未通过", role: "pmo" }];
    if (status === "failed") return [{ action: "retry", label: "整改后重新试点", role: "pmo" }];
    return [];
  }, [selected]);
  const metrics = selected?.evaluation.metrics ?? {};
  const participantOptions = useMemo(() => {
    const boundUsers = new Set(selected?.participants.map(item => item.user_id) ?? []);
    const boundRoles = new Set(selected?.participants.map(item => item.business_role) ?? []);
    return (workspace?.candidates.participants ?? []).filter(item => !boundUsers.has(item.user_id) && !boundRoles.has(item.business_role));
  }, [selected?.participants, workspace?.candidates.participants]);

  return <main style={{ minHeight: "100vh", background: "var(--bg)" }}>
    <header style={{ padding: "15px 28px", borderBottom: "1px solid var(--border)", background: "var(--surface)", display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
      <Link href="/operations-center" style={{ color: "var(--text2)", textDecoration: "none" }}>← 返回运营中心</Link>
      <strong style={{ color: "var(--accent2)" }}>V6.6 全模块受控试点验收台</strong>
      <span className="tag tag-blue">技术演练 ≠ 正式试点</span>
      {selected && <a className="btn-secondary" style={{ textDecoration: "none", marginLeft: "auto" }} href={`/api/operations-center/pilot-acceptance?${queryFor(context!, selected.run.id)}&format=markdown`}>下载验收报告</a>}
    </header>
    <div style={{ maxWidth: 1480, margin: "0 auto", padding: 28 }}>
      {initializing && !workspace && <section className="card" style={{ marginBottom: 16, color: "var(--text2)" }}>正在读取当前业务身份和受控试点数据…</section>}
      {notice && <section className="card" style={{ marginBottom: 16, color: notice.includes("失败") || notice.includes("BLOCKED") ? "var(--red)" : "var(--amber)" }}>{notice}</section>}
      <section className="card" style={{ background: "linear-gradient(135deg,rgba(37,99,235,.13),rgba(124,58,237,.10))" }}>
        <h1 style={{ marginTop: 0, fontSize: "1.55rem" }}>把“系统功能存在”升级为“角色可以真实跑完业务闭环”</h1>
        <p style={{ color: "var(--text2)", lineHeight: 1.75 }}>技术演练只验证 test 空间的工程契约；正式试点必须使用 production 数据、五个真实项目、四位不同的真实人员本人签署，并完成黄金链 A/E、飞书消息/任务/智能表写入及一次真实失败恢复。系统不会自动代签，也不会把测试结果标记为正式通过。</p>
      </section>

      {workspace && dataClass === "production" && <section className="card" style={{ marginTop: 16, borderColor: workspace.preflight.baselineReady ? "rgba(16,185,129,.42)" : "rgba(245,158,11,.42)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start", flexWrap: "wrap" }}>
          <div><div className="section-title">正式试点启动检查</div><p style={{ color: "var(--text2)", lineHeight: 1.7, marginBottom: 0 }}>先确认真实项目和四角色人员可以组成基线；黄金链与飞书回执可在试点运行过程中继续完成。测试账号不会进入正式试点候选，无项目范围的飞书历史记录不会计入证据。</p></div>
          <span className={`tag ${workspace.preflight.baselineReady ? "tag-green" : "tag-red"}`}>{workspace.preflight.baselineReady ? "可建立正式基线" : "前置条件未满足"}</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 10, marginTop: 14 }}>
          {workspace.preflight.items.map(item => <article key={item.code} style={{ padding: 12, borderRadius: 12, background: "var(--surface2)", border: `1px solid ${item.status === "ready" ? "rgba(16,185,129,.32)" : item.status === "blocked" ? "rgba(239,68,68,.28)" : "rgba(245,158,11,.28)"}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><strong>{item.label}</strong><span className={`tag ${item.status === "ready" ? "tag-green" : item.status === "blocked" ? "tag-red" : "tag-blue"}`}>{item.current}/{item.target}</span></div>
            <p style={{ color: "var(--text2)", fontSize: ".76rem", lineHeight: 1.6, minHeight: 48 }}>{item.detail}</p>
            <Link href={item.actionHref} style={{ color: "var(--accent2)", fontSize: ".78rem" }}>{item.actionLabel} →</Link>
          </article>)}
        </div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 12, fontSize: ".78rem" }}>
          <Link href="/integration-center" style={{ color: "var(--accent2)" }}>飞书数据分类与确认队列</Link>
          <Link href="/admin/security" style={{ color: "var(--accent2)" }}>配置真实用户、角色与授权</Link>
          <Link href="/operations-center/golden-chains" style={{ color: "var(--accent2)" }}>黄金链A/E验收台</Link>
        </div>
      </section>}

      {!initializing && workspace && currentRole === "pmo" && !selected && <section className="card" style={{ marginTop: 16 }}>
        <div className="section-title">创建当前数据空间的验收批次</div>
        <p style={{ color: "var(--text2)" }}>{dataClass === "production" ? "将创建正式试点批次。" : "将创建技术演练批次。"}</p>
        <input className="input" value={createForm.name} onChange={event => setCreateForm({ ...createForm, name: event.target.value })} placeholder="验收批次名称"/>
        <textarea className="input" style={{ marginTop: 8 }} value={createForm.objective} onChange={event => setCreateForm({ ...createForm, objective: event.target.value })} placeholder="本批次的业务目标"/>
        <button className="btn-primary" style={{ marginTop: 10 }} disabled={busy || createForm.name.trim().length < 3} onClick={() => void mutate("create", { mode: dataClass === "production" ? "formal_pilot" : "technical_rehearsal", ...createForm })}>创建{dataClass === "production" ? "正式试点" : "技术演练"}</button>
      </section>}

      {workspace && workspace.runs.length > 0 && <section className="card" style={{ marginTop: 16 }}>
        <label className="label">验收批次</label>
        <select className="input" value={selectedRunId} onChange={event => { const value = event.target.value; setSelectedRunId(value); if (context) void load(context, value); }}>
          {workspace.runs.map(run => <option key={run.id} value={run.id}>{run.name} · {run.mode === "formal_pilot" ? "正式试点" : "技术演练"} · {STATUS_LABEL[run.status] || run.status}</option>)}
        </select>
      </section>}

      {selected && <>
        <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 10, marginTop: 16 }}>
          {[["项目", metrics.projects || 0, 5], ["独立用户", metrics.distinct_users || 0, 4], ["本人签署", metrics.self_signoffs || 0, 4], ["模块", metrics.modules_passed || 0, 16], ["黄金链", metrics.golden_chains || 0, 2], ["飞书类型", metrics.feishu_types || 0, 3], ["失败恢复", metrics.recovered_failures || 0, 1]].map(([label, value, target]) => <article className="stat-card" key={String(label)}><div className="stat-num">{value}/{target}</div><div className="stat-label">{label}</div></article>)}
        </section>

        <section className="card" style={{ marginTop: 16, borderColor: selected.evaluation.formal_passed || selected.evaluation.technical_ready ? "rgba(16,185,129,.45)" : "rgba(245,158,11,.45)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}><div><span className={`tag ${selected.run.mode === "formal_pilot" ? "tag-red" : "tag-blue"}`}>{selected.run.mode === "formal_pilot" ? "正式试点" : "技术演练"}</span><h2 style={{ margin: "10px 0 4px" }}>{selected.run.name}</h2><p style={{ color: "var(--text2)" }}>{selected.run.objective}</p></div><span className="tag tag-blue">{STATUS_LABEL[selected.run.status] || selected.run.status} · v{selected.run.version}</span></div>
          {selected.evaluation.blockers.length > 0 && <div style={{ marginTop: 14 }}><strong>当前阻断项</strong><ul style={{ color: "var(--amber)", lineHeight: 1.75 }}>{selected.evaluation.blockers.map(item => <li key={item.code}>{item.detail}</li>)}</ul></div>}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>{nextActions.filter(item => item.role === currentRole).map(item => <button className="btn-primary" key={item.action} disabled={busy} onClick={() => void mutate("transition", { action: item.action, payload: { action: item.action } })}>{item.label}</button>)}</div>
        </section>

        <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(310px,1fr))", gap: 16, marginTop: 16, alignItems: "start" }}>
          <article className="card"><div className="section-title">① 五项目覆盖</div><div>{selected.projects.map(item => <p key={item.id} style={{ color: "var(--text2)" }}>✓ {item.project?.name || "未命名项目"}{item.project?.oa_no ? ` · ${item.project.oa_no}` : ""}</p>)}</div>{currentRole === "pmo" && ["draft", "collecting"].includes(selected.run.status) && <><BusinessEntitySelect kind="project" value={projectId} onChange={setProjectId} placeholder="选择要纳入的项目"/><button className="btn-secondary" style={{ marginTop: 8 }} disabled={busy || !projectId} onClick={() => void mutate("add_project", { payload: { project_id: projectId, coverage_note: "纳入V6.6全模块验收" } })}>纳入项目</button></>}</article>

          <article className="card"><div className="section-title">② 四角色职责分离</div>{selected.participants.map(item => <p key={item.id} style={{ color: item.self_signed_at ? "var(--green)" : "var(--text2)" }}>{item.self_signed_at ? "✓" : "○"} {ROLE_LABEL[item.business_role]} · {item.user?.name || "未命名成员"} · {item.self_signed_at ? "本人已签署" : "待本人签署"}</p>)}{currentRole === "pmo" && ["draft", "collecting"].includes(selected.run.status) && <><select className="input" value={participantAssignment} onChange={event => setParticipantAssignment(event.target.value)}><option value="">选择角色成员</option>{participantOptions.map(item => <option key={item.id} value={item.id}>{ROLE_LABEL[item.business_role]} · {item.user_name} · {item.account_kind === "real_user" ? "真实用户" : "测试账号"}</option>)}</select><button className="btn-secondary" style={{ marginTop: 8 }} disabled={busy || !participantAssignment} onClick={() => void mutate("bind_participant", { payload: { assignment_id: participantAssignment, participant_kind: selected.run.mode === "formal_pilot" ? "real_user" : "test_account" } })}>绑定角色</button><p style={{ color: "var(--text2)", fontSize: ".72rem", lineHeight: 1.55 }}>同一账号不能承担两个试点角色；正式试点只显示数据库标记为真实用户的有效角色分配。</p></>}</article>

          <article className="card"><div className="section-title">③ 本人签署</div><p style={{ color: "var(--text2)", lineHeight: 1.65 }}>签署动作只认当前登录账号与当前业务角色，管理员和系统任务不能代签。</p><textarea className="input" value={signoffStatement} onChange={event => setSignoffStatement(event.target.value)} placeholder="本人验收声明"/><button className="btn-primary" style={{ marginTop: 8 }} disabled={busy || !canSelfSign || signoffStatement.trim().length < 12} onClick={() => void mutate("self_signoff", { confirm: true, statement: signoffStatement })}>本人签署</button>{!canSelfSign && <p style={{ color: "var(--amber)", fontSize: ".75rem" }}>当前角色未绑定、已签署，或需切换到本人角色后操作。</p>}</article>

          <article className="card"><div className="section-title">④ 16项模块验收</div><select className="input" value={moduleForm.module_key} onChange={event => setModuleForm({ ...moduleForm, module_key: event.target.value })}>{workspace?.modules.map(item => <option key={item.key} value={item.key}>{item.label}</option>)}</select><select className="input" style={{ marginTop: 8 }} value={moduleForm.result} onChange={event => setModuleForm({ ...moduleForm, result: event.target.value })}><option value="passed">通过</option><option value="failed">未通过</option><option value="pending">待检查</option></select><input className="input" style={{ marginTop: 8 }} value={moduleForm.summary} onChange={event => setModuleForm({ ...moduleForm, summary: event.target.value })} placeholder="检查结论"/><textarea className="input" style={{ marginTop: 8 }} value={moduleForm.evidence} onChange={event => setModuleForm({ ...moduleForm, evidence: event.target.value })} placeholder="证据链接或成果编号，每行一条"/><button className="btn-secondary" style={{ marginTop: 8 }} disabled={busy || (moduleForm.result === "passed" && lines(moduleForm.evidence).length === 0)} onClick={() => void mutate("record_module_check", { payload: { module_key: moduleForm.module_key, result: moduleForm.result, summary: moduleForm.summary, evidence_refs: lines(moduleForm.evidence) } })}>保存模块结论</button><div style={{ marginTop: 10, maxHeight: 190, overflow: "auto" }}>{workspace?.modules.map(module => { const check = selected.module_checks.find(item => item.module_key === module.key); return <p key={module.key} style={{ color: check?.result === "passed" ? "var(--green)" : check?.result === "failed" ? "var(--red)" : "var(--text2)", fontSize: ".76rem" }}>{check?.result === "passed" ? "✓" : check?.result === "failed" ? "×" : "○"} {module.label}</p>; })}</div></article>

          <article className="card"><div className="section-title">⑤ 黄金链 A / E</div>{selected.golden_chains.map(item => <p key={item.id} style={{ color: "var(--green)" }}>✓ 黄金链 {item.chain_key} · {item.verification_level}</p>)}{currentRole === "pmo" && <><select className="input" value={goldenRunId} onChange={event => setGoldenRunId(event.target.value)}><option value="">选择已完成验证的黄金链</option>{workspace?.candidates.golden_chains.map(item => <option key={item.id} value={item.id}>黄金链 {item.chain_key} · {item.project_name} · {item.status}</option>)}</select><button className="btn-secondary" style={{ marginTop: 8 }} disabled={busy || !goldenRunId} onClick={() => void mutate("link_golden_chain", { payload: { golden_chain_run_id: goldenRunId } })}>关联黄金链证据</button></>}<Link href="/operations-center/golden-chains" style={{ display: "inline-block", marginTop: 10, color: "var(--accent2)" }}>进入黄金链路验收台</Link></article>

          <article className="card"><div className="section-title">⑥ 飞书真实写入与恢复</div>{selected.feishu_evidence.map(item => <p key={item.id} style={{ color: "var(--green)" }}>✓ {item.action_type} · 尝试{item.retry_count}次{item.failure_observed_at && item.recovered_at ? " · 已验证失败恢复" : ""}</p>)}{["pmo", "operations"].includes(currentRole) && <><details><summary style={{ cursor: "pointer", color: "var(--accent2)" }}>创建带项目范围的消息/任务确认</summary><div style={{ display: "grid", gap: 8, marginTop: 10 }}><BusinessEntitySelect kind="project" value={feishuProjectId} onChange={setFeishuProjectId} placeholder="选择动作所属项目"/><select className="input" value={feishuDraft.action_type} onChange={event => setFeishuDraft({ ...feishuDraft, action_type: event.target.value })}><option value="message">飞书消息</option><option value="task">飞书任务</option></select><input className="input" value={feishuDraft.target} onChange={event => setFeishuDraft({ ...feishuDraft, target: event.target.value })} placeholder="从飞书复制群聊或用户标识"/><input className="input" value={feishuDraft.title} onChange={event => setFeishuDraft({ ...feishuDraft, title: event.target.value })} placeholder="协同动作标题"/><textarea className="input" value={feishuDraft.content} onChange={event => setFeishuDraft({ ...feishuDraft, content: event.target.value })} placeholder="协同内容与验收要求"/><button className="btn-secondary" disabled={busy || !feishuProjectId || !feishuDraft.target.trim()} onClick={() => void queueFeishuAction()}>进入人工确认队列</button><Link href="/integration-center" style={{ color: "var(--accent2)" }}>前往集成中心确认执行</Link></div></details><select className="input" style={{ marginTop: 10 }} value={feishuConfirmationId} onChange={event => setFeishuConfirmationId(event.target.value)}><option value="">选择已成功的飞书确认</option>{workspace?.candidates.feishu_confirmations.map(item => <option key={item.id} value={item.id}>{item.action_type} · {item.target_summary} · 尝试{item.writeback_attempt_count}次</option>)}</select><button className="btn-secondary" style={{ marginTop: 8 }} disabled={busy || !feishuConfirmationId} onClick={() => void mutate("link_feishu_confirmation", { payload: { confirmation_id: feishuConfirmationId } })}>关联飞书回执</button></>}<p style={{ color: "var(--text2)", fontSize: ".74rem", lineHeight: 1.6 }}>只有当前组织、项目、数据空间内真实执行成功的确认记录可被选择；失败恢复必须来自受控写回尝试流水。</p></article>
        </section>

        <section className="card" style={{ marginTop: 16 }}><div className="section-title">追加式验收事件</div><div style={{ display: "grid", gap: 7, marginTop: 10 }}>{selected.events.slice(0, 20).map(item => <div key={item.id} style={{ padding: 9, borderRadius: 9, background: "var(--surface2)", display: "flex", justifyContent: "space-between", gap: 10 }}><span>{item.event_type} · {ROLE_LABEL[item.actor_business_role] || item.actor_business_role}</span><span style={{ color: "var(--text2)", fontSize: ".72rem" }}>{new Date(item.occurred_at).toLocaleString("zh-CN")}</span></div>)}</div></section>
      </>}
    </div>
  </main>;
}
