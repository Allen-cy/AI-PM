"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BusinessEntityMultiSelect, BusinessEntitySelect } from "@/components/BusinessEntitySelect";
import { StructuredFieldsEditor } from "@/components/StructuredFieldsEditor";

type LifecycleState = {
  id: string; objectType: string; objectId: string; status: string; version: number;
  ownerUserId: string | null; dueAt: string | null;
};
type LifecycleEvent = {
  id: string; objectType: string; eventType: string; fromStatus: string | null; toStatus: string;
  actorBusinessRole: string; comment: string | null; createdAt: string;
};
type Correction = {
  id: string; targetType: string; targetId: string; correctionType: string; status: string;
  reasonCode: string; reasonDetail: string; correctionOwnerUserId: string; dueAt: string;
};
type Requirement = {
  id: string; objectType: string; fromStatus: string; toStatus: string; evidenceType: string;
  minimumCount: number; verifierRoles: string[]; validityDays: number | null; expiryAction: string;
};
type Evidence = {
  id: string; evidence_type: string; title: string; source_type: string; source_url?: string;
  version?: string; verified_at?: string | null; valid_until?: string | null;
};
type LifecycleResponse = {
  error?: string; detail?: string; lifecycle_initialized?: boolean;
  context?: { actorUserId?: string; businessRole?: string };
  project?: Record<string, unknown>;
  states?: LifecycleState[]; events?: LifecycleEvent[]; exceptions?: Array<Record<string, unknown>>;
  corrections?: Correction[]; evidenceRequirements?: Requirement[]; evidence?: Evidence[];
};

const ROLE_OPTIONS = [
  ["pm", "项目经理"], ["operations", "运营"], ["pmo", "PMO"], ["business_owner", "业务负责人"],
  ["finance", "财务"], ["quality", "质量"], ["sponsor", "发起人"], ["ceo", "CEO"],
] as const;

const STATE_ACTIONS: Record<string, Record<string, string[]>> = {
  project: { proposed: ["approve", "reject"], rejected: ["revise"], approved: ["activate"], active: ["suspend", "start_closure", "terminate"], suspended: ["resume", "terminate"], closing: ["close"], closed: ["reopen"], terminated: ["reopen"] },
  plan_baseline: { draft: ["submit"], submitted: ["approve", "request_rework"], approved: ["supersede"] },
  deliverable: { planned: ["start"], in_progress: ["submit"], submitted: ["accept", "reject"], rejected: ["revise"], accepted: ["reopen"] },
  change: { draft: ["submit"], submitted: ["approve", "reject"], approved: ["implement"], implemented: ["close"], rejected: ["revise"] },
  reporting: { draft: ["submit"], submitted: ["freeze", "request_rework"], frozen: ["acknowledge"] },
  closure: { draft: ["submit"], submitted: ["approve", "request_rework"], approved: ["archive"] },
};

const ACTION_LABELS: Record<string, string> = {
  approve: "批准", reject: "驳回", revise: "重新修订", activate: "启动执行", suspend: "暂停",
  start_closure: "进入收尾", terminate: "终止", resume: "恢复", close: "关闭", reopen: "重新打开",
  submit: "提交复核", request_rework: "退回补正", supersede: "版本替代", start: "开始执行",
  accept: "验收通过", implement: "执行批准变更", freeze: "冻结汇报快照", acknowledge: "确认收悉", archive: "归档",
};

function show(value: unknown, fallback = "-"): string {
  return value === null || value === undefined || value === "" ? fallback : String(value);
}

function statusTone(status: string): string {
  if (["closed", "accepted", "approved", "acknowledged", "archived"].includes(status)) return "tag tag-green";
  if (["rejected", "terminated"].includes(status)) return "tag tag-red";
  if (["submitted", "pending_verification", "suspended", "closing"].includes(status)) return "tag tag-amber";
  return "tag tag-blue";
}

export default function ProjectLifecyclePage() {
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const projectId = String(params.id || "");
  const [businessRole, setBusinessRole] = useState(search.get("role") || "pm");
  const [dataClass, setDataClass] = useState(search.get("data_class") || "production");
  const [data, setData] = useState<LifecycleResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [transitionEvidenceIds, setTransitionEvidenceIds] = useState<string[]>([]);
  const [transitionComment, setTransitionComment] = useState("");
  const [objectForm, setObjectForm] = useState({ objectType: "deliverable", objectId: "", title: "", sourceType: "feishu_record", sourceId: "", ownerUserId: "", dueAt: "" });

  const [evidenceForm, setEvidenceForm] = useState({
    objectType: "project", objectId: projectId, evidenceType: "project_charter", sourceType: "feishu_drive",
    sourceId: "", sourceUrl: "", title: "", version: "1", validUntil: "",
  });
  const [correctionForm, setCorrectionForm] = useState({
    targetType: "management_signal", targetId: "", correctionType: "false_positive",
    reasonCode: "SOURCE_FACT_INCORRECT", reasonDetail: "", proposedCorrection: { corrected_value: "", correction_basis: "" } as Record<string, unknown>,
    ownerUserId: "", dueAt: "",
  });
  const [correctionActionComment, setCorrectionActionComment] = useState("");
  const [appliedCorrection, setAppliedCorrection] = useState<Record<string, unknown>>({ actual_change: "", result: "" });

  const load = useCallback(async () => {
    setLoading(true);
    setNotice("");
    const query = new URLSearchParams({ business_role: businessRole, data_class: dataClass });
    try {
      const response = await fetch(`/api/projects/${projectId}/lifecycle?${query.toString()}`, { cache: "no-store" });
      const body = await response.json() as LifecycleResponse;
      setData(body);
      if (!response.ok) setNotice(body.detail || body.error || "生命周期数据加载失败。");
    } catch {
      setData({ error: "LIFECYCLE_LOAD_FAILED", detail: "网络连接失败，本页不会使用虚拟数据替代正式事实。" });
      setNotice("网络连接失败。");
    } finally { setLoading(false); }
  }, [businessRole, dataClass, projectId]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function mutate(path: string, body: Record<string, unknown>, successMessage: string) {
    setBusy(true); setNotice("");
    try {
      const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json() as { detail?: string; error?: string };
      if (!response.ok) throw new Error(result.detail || result.error || "操作失败");
      setNotice(successMessage);
      await load();
    } catch (error) { setNotice(error instanceof Error ? error.message : "操作失败"); }
    finally { setBusy(false); }
  }

  async function initializeLifecycle() {
    await mutate(`/api/projects/${projectId}/lifecycle`, {
      business_role: businessRole, data_class: dataClass,
      idempotency_key: `project:${projectId}:lifecycle:initialize:v1`, comment: "人工确认启用项目生命周期闭环",
    }, "项目生命周期已初始化。");
  }

  async function transition(state: LifecycleState, action: string) {
    await mutate(`/api/projects/${projectId}/lifecycle/transitions`, {
      state_id: state.id, object_type: state.objectType, object_id: state.objectId, action,
      business_role: businessRole, data_class: dataClass,
      idempotency_key: `${state.id}:${state.version}:${action}`,
      comment: transitionComment,
      evidence_ids: transitionEvidenceIds,
    }, `已执行：${ACTION_LABELS[action] || action}。`);
  }

  async function initializeObject() {
    await mutate(`/api/projects/${projectId}/lifecycle`, {
      business_role: businessRole, data_class: dataClass, object_type: objectForm.objectType,
      object_id: objectForm.objectId, title: objectForm.title, source_type: objectForm.sourceType,
      source_id: objectForm.sourceId, owner_user_id: objectForm.ownerUserId || null,
      due_at: objectForm.dueAt ? new Date(objectForm.dueAt).toISOString() : null,
      idempotency_key: `project:${projectId}:${objectForm.objectType}:${objectForm.objectId}:initialize:v1`,
      comment: "使用者确认将业务对象纳入项目生命周期",
    }, "业务对象已纳入生命周期。");
  }

  async function registerEvidence() {
    await mutate(`/api/projects/${projectId}/lifecycle/evidence`, {
      object_type: evidenceForm.objectType, object_id: evidenceForm.objectId,
      evidence_type: evidenceForm.evidenceType, source_type: evidenceForm.sourceType,
      source_id: evidenceForm.sourceId || evidenceForm.sourceUrl, source_url: evidenceForm.sourceUrl,
      title: evidenceForm.title, version: evidenceForm.version,
      valid_until: evidenceForm.validUntil ? new Date(evidenceForm.validUntil).toISOString() : null, business_role: businessRole, data_class: dataClass,
    }, "证据已登记，等待授权角色核验。");
  }

  async function verifyEvidence(evidenceId: string) {
    await mutate(`/api/projects/${projectId}/lifecycle/evidence/${evidenceId}/verify`, {
      business_role: businessRole, data_class: dataClass,
    }, "证据已核验。");
  }

  async function submitCorrection() {
    const targetId = correctionForm.targetId || String(data?.exceptions?.[0]?.id || "");
    const ownerUserId = correctionForm.ownerUserId || data?.context?.actorUserId || "";
    await mutate("/api/feedback-corrections", {
      project_id: projectId, target_type: correctionForm.targetType, target_id: targetId,
      correction_type: correctionForm.correctionType, reason_code: correctionForm.reasonCode,
      reason_detail: correctionForm.reasonDetail, proposed_correction: correctionForm.proposedCorrection,
      correction_owner_user_id: ownerUserId, due_at: correctionForm.dueAt ? new Date(correctionForm.dueAt).toISOString() : "",
      resubmission_path: `/projects/${projectId}/lifecycle`, business_role: businessRole, data_class: dataClass,
      idempotency_key: `${correctionForm.targetType}:${targetId}:correction:${correctionForm.reasonCode}:v1`,
    }, "人工纠偏已提交，等待PMO/质量角色分诊。");
  }

  async function actOnCorrection(correction: Correction, action: string) {
    const applied = action === "submit_correction" ? appliedCorrection : undefined;
    await mutate(`/api/feedback-corrections/${correction.id}/transition`, {
      action, business_role: businessRole, data_class: dataClass,
      comment: correctionActionComment, applied_correction: applied,
      reason_code: action === "request_rework" || action === "reject" ? "HUMAN_REVIEW_RETURNED" : undefined,
    }, "纠偏状态已更新。");
  }

  const openExceptions = data?.exceptions ?? [];
  const projectState = data?.states?.find(state => state.objectType === "project");
  const selectedCorrectionTargetId = correctionForm.targetId || String(openExceptions[0]?.id || "");
  const correctionOwnerUserId = correctionForm.ownerUserId || data?.context?.actorUserId || "";
  const unverifiedEvidence = useMemo(() => (data?.evidence ?? []).filter(item => !item.verified_at), [data?.evidence]);
  const objectDirectoryType: Record<string, string> = { plan_baseline: "plan", deliverable: "task", change: "change", reporting: "reporting" };
  const correctionDirectoryType: Record<string, string> = { management_signal: "management_signal", lifecycle_state: "lifecycle_state", action: "action" };

  return (
    <main style={{ minHeight: "100vh", background: "var(--bg)" }}>
      <header style={{ padding: "14px 26px", borderBottom: "1px solid var(--border)", background: "var(--surface)", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <Link href={`/projects/${projectId}?role=${businessRole}&data_class=${dataClass}`} style={{ color: "var(--text2)", textDecoration: "none" }}>← 返回项目360</Link>
        <Link href={`/projects/${projectId}/impact-packages?role=${businessRole}&data_class=${dataClass}`} className="btn-secondary" style={{ textDecoration: "none" }}>业务影响包</Link>
        <strong style={{ color: "var(--accent2)" }}>项目全生命周期纵向闭环</strong>
        <label style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 7, color: "var(--text2)" }}>
          业务角色
          <select className="input" style={{ width: 140, padding: "6px 9px" }} value={businessRole} onChange={event => setBusinessRole(event.target.value)}>
            {ROLE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <select className="input" style={{ width: 125, padding: "6px 9px" }} value={dataClass} onChange={event => setDataClass(event.target.value)}>
          <option value="production">正式数据</option><option value="test">测试数据</option><option value="sample">样例数据</option><option value="diagnostic">诊断数据</option>
        </select>
      </header>

      <div style={{ maxWidth: 1480, margin: "0 auto", padding: 26, display: "grid", gap: 18 }}>
        {notice && <div className="card" style={{ borderColor: notice.includes("失败") || notice.includes("未") ? "rgba(239,68,68,.42)" : "rgba(34,197,94,.42)", padding: 13 }}>{notice}</div>}
        {loading && <section className="card">正在读取正式业务事实...</section>}
        {!loading && data?.error && <section className="card"><h1 style={{ color: "var(--red)", fontSize: "1.1rem" }}>生命周期闭环暂不可用</h1><p style={{ color: "var(--text2)", marginTop: 8 }}>{data.detail || data.error}</p></section>}
        {!loading && !data?.error && data && (
          <>
            <section className="card">
              <div style={{ display: "flex", justifyContent: "space-between", gap: 18, flexWrap: "wrap" }}>
                <div><div style={{ color: "var(--text2)", fontSize: ".78rem" }}>项目ID · {projectId}</div><h1 style={{ fontSize: "1.5rem", marginTop: 6 }}>{show(data.project?.name, "未命名项目")}</h1><p style={{ color: "var(--text2)", marginTop: 7 }}>{show(data.project?.oa_no)} · 台账状态 {show(data.project?.status)}</p></div>
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  {projectState ? <><span className={statusTone(projectState.status)}>{projectState.status}</span><span style={{ color: "var(--text2)" }}>状态版本 v{projectState.version}</span></> : <button className="btn btn-primary" disabled={busy} onClick={() => void initializeLifecycle()}>初始化生命周期</button>}
                </div>
              </div>
            </section>

            <section className="card">
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}><div><h2 style={{ fontSize: "1.05rem" }}>状态推进与授权门禁</h2><p style={{ color: "var(--text2)", fontSize: ".78rem", marginTop: 5 }}>系统先验证状态、角色和证据，再用数据库事务记录不可变事件。</p></div></div>
              {projectState && <div style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 8, padding: 12, marginTop: 12, border: "1px solid var(--border)", borderRadius: 10, background: "var(--surface2)" }}><select className="input" value={objectForm.objectType} onChange={event => setObjectForm({ ...objectForm, objectType: event.target.value, objectId: event.target.value === "closure" ? projectId : "", sourceId: event.target.value === "closure" ? projectId : "", sourceType: event.target.value === "closure" ? "project" : "business_directory" })}>{["plan_baseline", "deliverable", "change", "reporting", "closure"].map(item => <option key={item}>{item}</option>)}</select>{objectForm.objectType === "closure" ? <div className="input" style={{ color: "var(--text2)" }}>当前项目收尾对象</div> : <BusinessEntitySelect kind="businessObject" projectId={projectId} entityType={objectDirectoryType[objectForm.objectType]} value={objectForm.objectId} onChange={objectId => setObjectForm({ ...objectForm, objectId, sourceId: objectId, sourceType: "business_directory" })} onSelectedOption={option => option && setObjectForm(current => ({ ...current, title: option.label }))} placeholder="选择要纳入的业务对象"/>}<input className="input" placeholder="对象名称" value={objectForm.title} onChange={event => setObjectForm({ ...objectForm, title: event.target.value })}/><BusinessEntitySelect kind="person" value={objectForm.ownerUserId} onChange={ownerUserId => setObjectForm({ ...objectForm, ownerUserId })} placeholder="选择责任人"/><input className="input" type="datetime-local" value={objectForm.dueAt} onChange={event => setObjectForm({ ...objectForm, dueAt: event.target.value })}/><button className="btn btn-primary" disabled={busy || !objectForm.objectId || !objectForm.ownerUserId} onClick={() => void initializeObject()}>纳入生命周期</button></div>}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 12, marginTop: 14 }}>
                {(data.states ?? []).map(state => <article key={state.id} style={{ padding: 13, border: "1px solid var(--border)", borderRadius: 12, background: "var(--surface2)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><strong>{state.objectType}</strong><span className={statusTone(state.status)}>{state.status}</span></div>
                  <div style={{ color: "var(--text2)", fontSize: ".73rem", marginTop: 7 }}>对象 {state.objectId} · v{state.version}</div>
                  <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginTop: 11 }}>{(STATE_ACTIONS[state.objectType]?.[state.status] ?? []).map(action => <button key={action} className="btn btn-secondary" disabled={busy} onClick={() => void transition(state, action)}>{ACTION_LABELS[action] || action}</button>)}</div>
                </article>)}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "2fr 3fr", gap: 10, marginTop: 14 }}><BusinessEntityMultiSelect kind="evidence" value={transitionEvidenceIds} onChange={setTransitionEvidenceIds} placeholder="选择本次状态变更证据"/><input className="input" placeholder="本次人工操作说明" value={transitionComment} onChange={event => setTransitionComment(event.target.value)} /></div>
            </section>

            <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.05fr) minmax(0,.95fr)", gap: 18 }}>
              <section className="card">
                <h2 style={{ fontSize: "1.05rem" }}>证据门禁矩阵</h2>
                <p style={{ color: "var(--text2)", fontSize: ".78rem", marginTop: 5 }}>对象状态转换 → 必需证据 → 核验角色 → 有效期 → 过期处置。</p>
                <div style={{ overflow: "auto", marginTop: 12 }}><table style={{ width: "100%", borderCollapse: "collapse", fontSize: ".76rem" }}><thead><tr>{["对象", "状态转换", "证据", "核验人", "过期处置"].map(item => <th key={item} style={{ textAlign: "left", padding: 8, borderBottom: "1px solid var(--border)" }}>{item}</th>)}</tr></thead><tbody>{(data.evidenceRequirements ?? []).map(item => <tr key={item.id}><td style={{ padding: 8 }}>{item.objectType}</td><td style={{ padding: 8 }}>{item.fromStatus} → {item.toStatus}</td><td style={{ padding: 8 }}>{item.evidenceType} × {item.minimumCount}</td><td style={{ padding: 8 }}>{item.verifierRoles.join(" / ")}</td><td style={{ padding: 8 }}>{item.expiryAction}</td></tr>)}</tbody></table></div>
              </section>
              <section className="card">
                <h2 style={{ fontSize: "1.05rem" }}>登记可验证证据</h2>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 9, marginTop: 12 }}>
                  <select className="input" value={evidenceForm.objectType} onChange={event => setEvidenceForm({ ...evidenceForm, objectType: event.target.value })}>{["project", "plan_baseline", "deliverable", "change", "reporting", "closure"].map(item => <option key={item}>{item}</option>)}</select>
                  {evidenceForm.objectType === "project" ? <div className="input" style={{ color: "var(--text2)" }}>当前项目</div> : <BusinessEntitySelect kind="businessObject" projectId={projectId} entityType={objectDirectoryType[evidenceForm.objectType]} value={evidenceForm.objectId} onChange={objectId => setEvidenceForm({ ...evidenceForm, objectId })} placeholder="选择证据所属对象"/>}
                  <input className="input" placeholder="证据类型，如 project_charter" value={evidenceForm.evidenceType} onChange={event => setEvidenceForm({ ...evidenceForm, evidenceType: event.target.value })} />
                  <input className="input" placeholder="来源类型，如 feishu_drive" value={evidenceForm.sourceType} onChange={event => setEvidenceForm({ ...evidenceForm, sourceType: event.target.value })} />
                  <input className="input" placeholder="证据标题" value={evidenceForm.title} onChange={event => setEvidenceForm({ ...evidenceForm, title: event.target.value })} />
                  <input className="input" style={{ gridColumn: "1 / -1" }} placeholder="https:// 证据链接" value={evidenceForm.sourceUrl} onChange={event => setEvidenceForm({ ...evidenceForm, sourceUrl: event.target.value })} />
                  <input className="input" placeholder="版本" value={evidenceForm.version} onChange={event => setEvidenceForm({ ...evidenceForm, version: event.target.value })} />
                  <input className="input" type="datetime-local" value={evidenceForm.validUntil} onChange={event => setEvidenceForm({ ...evidenceForm, validUntil: event.target.value })} />
                </div><button className="btn btn-primary" style={{ marginTop: 10 }} disabled={busy} onClick={() => void registerEvidence()}>登记证据</button>
                <div style={{ display: "grid", gap: 7, marginTop: 12 }}>{(data.evidence ?? []).map(item => <div key={item.id} style={{ padding: 9, border: "1px solid var(--border)", borderRadius: 9, display: "flex", justifyContent: "space-between", gap: 10 }}><div><strong>{item.title}</strong><div style={{ color: "var(--text2)", fontSize: ".72rem", marginTop: 4 }}>{item.evidence_type} · {item.source_type} · ID {item.id}</div></div>{item.verified_at ? <span className="tag tag-green">已核验</span> : <button className="btn btn-secondary" disabled={busy} onClick={() => void verifyEvidence(item.id)}>人工核验</button>}</div>)}</div>
                {unverifiedEvidence.length > 0 && <p style={{ color: "var(--amber)", fontSize: ".75rem", marginTop: 9 }}>{unverifiedEvidence.length} 份证据尚未核验，不会用于状态放行。</p>}
              </section>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "minmax(0,.9fr) minmax(0,1.1fr)", gap: 18 }}>
              <section className="card"><h2 style={{ fontSize: "1.05rem" }}>统一例外</h2><p style={{ color: "var(--text2)", fontSize: ".78rem", marginTop: 5 }}>所有未关闭管理信号在此去重聚合，纠偏使用同一目标ID回写。</p><div style={{ display: "grid", gap: 8, marginTop: 12 }}>{openExceptions.length === 0 && <div style={{ color: "var(--text2)" }}>当前没有未关闭例外。</div>}{openExceptions.map(item => <button key={String(item.id)} onClick={() => setCorrectionForm({ ...correctionForm, targetType: "management_signal", targetId: String(item.id) })} style={{ textAlign: "left", padding: 10, borderRadius: 10, border: selectedCorrectionTargetId === String(item.id) ? "1px solid var(--accent)" : "1px solid var(--border)", background: "var(--surface2)", color: "inherit" }}><strong>{show(item.title, "管理信号")}</strong><div style={{ color: "var(--text2)", fontSize: ".73rem", marginTop: 4 }}>{show(item.severity)} · {show(item.status)} · {show(item.due_at, "未设定期限")}</div></button>)}</div></section>
              <section className="card"><h2 style={{ fontSize: "1.05rem" }}>人工反馈与纠偏</h2><p style={{ color: "var(--text2)", fontSize: ".78rem", marginTop: 5 }}>AI判断和系统事实不能自己修改自己：使用者提交 → PMO/质量分诊 → 责任人补正 → 人工复核关闭。</p>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 9, marginTop: 12 }}>
                  <select className="input" value={correctionForm.targetType} onChange={event => setCorrectionForm({ ...correctionForm, targetType: event.target.value })}><option value="management_signal">管理信号</option><option value="lifecycle_state">生命周期状态</option><option value="action">行动项</option><option value="rule">管理规则</option></select>
                  <BusinessEntitySelect kind="businessObject" projectId={projectId} entityType={correctionDirectoryType[correctionForm.targetType]} value={selectedCorrectionTargetId} onChange={targetId => setCorrectionForm({ ...correctionForm, targetId })} placeholder="选择纠偏目标"/>
                  <select className="input" value={correctionForm.correctionType} onChange={event => setCorrectionForm({ ...correctionForm, correctionType: event.target.value })}><option value="false_positive">误报</option><option value="business_fact_denial">业务事实否认</option><option value="evidence_requested">要求补证</option><option value="action_rejected">行动拒收</option><option value="state_correction">状态修正</option></select>
                  <input className="input" placeholder="结构化原因码" value={correctionForm.reasonCode} onChange={event => setCorrectionForm({ ...correctionForm, reasonCode: event.target.value.toUpperCase() })} />
                  <input className="input" style={{ gridColumn: "1 / -1" }} placeholder="原因说明" value={correctionForm.reasonDetail} onChange={event => setCorrectionForm({ ...correctionForm, reasonDetail: event.target.value })} />
                  <div style={{ gridColumn: "1 / -1" }}><StructuredFieldsEditor value={correctionForm.proposedCorrection} onChange={proposedCorrection => setCorrectionForm({ ...correctionForm, proposedCorrection })} labels={{ corrected_value: "拟调整结果", correction_basis: "纠偏依据" }}/></div>
                  <BusinessEntitySelect kind="person" value={correctionOwnerUserId} onChange={ownerUserId => setCorrectionForm({ ...correctionForm, ownerUserId })} placeholder="选择纠偏责任人"/>
                  <input className="input" type="datetime-local" value={correctionForm.dueAt} onChange={event => setCorrectionForm({ ...correctionForm, dueAt: event.target.value })} />
                </div><button className="btn btn-primary" style={{ marginTop: 10 }} disabled={busy} onClick={() => void submitCorrection()}>提交人工纠偏</button>
              </section>
            </div>

            <section className="card"><h2 style={{ fontSize: "1.05rem" }}>纠偏执行与复核</h2><div style={{ display: "grid", gap: 9, marginTop: 10 }}><input className="input" placeholder="分诊/退回/复核说明" value={correctionActionComment} onChange={event => setCorrectionActionComment(event.target.value)} /><StructuredFieldsEditor value={appliedCorrection} onChange={setAppliedCorrection} labels={{ actual_change: "已实施变化", result: "执行结果" }} fixedKeys/></div><div style={{ display: "grid", gap: 9, marginTop: 12 }}>{(data.corrections ?? []).map(item => <article key={item.id} style={{ padding: 12, borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface2)" }}><div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}><div><strong>{item.correctionType} · {item.reasonCode}</strong><div style={{ color: "var(--text2)", fontSize: ".73rem", marginTop: 4 }}>{item.reasonDetail} · 已指定纠偏责任人 · 期限 {new Date(item.dueAt).toLocaleString("zh-CN")}</div></div><span className={statusTone(item.status)}>{item.status}</span></div><div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginTop: 9 }}>{item.status === "submitted" && <><button className="btn btn-secondary" disabled={busy} onClick={() => void actOnCorrection(item, "accept")}>接受并指派</button><button className="btn btn-secondary" disabled={busy} onClick={() => void actOnCorrection(item, "reject")}>驳回</button></>}{item.status === "correction_in_progress" && <button className="btn btn-secondary" disabled={busy} onClick={() => void actOnCorrection(item, "submit_correction")}>提交补正结果</button>}{item.status === "pending_verification" && <><button className="btn btn-secondary" disabled={busy} onClick={() => void actOnCorrection(item, "verify")}>复核关闭</button><button className="btn btn-secondary" disabled={busy} onClick={() => void actOnCorrection(item, "request_rework")}>退回再补正</button></>}</div></article>)}</div></section>

            <section className="card"><h2 style={{ fontSize: "1.05rem" }}>不可变生命周期事件</h2><div style={{ display: "grid", gap: 8, marginTop: 11 }}>{(data.events ?? []).map(item => <article key={item.id} style={{ padding: 10, borderLeft: "3px solid var(--accent)", background: "var(--surface2)", borderRadius: "0 9px 9px 0" }}><strong>{item.objectType} · {item.fromStatus || "无"} → {item.toStatus}</strong><div style={{ color: "var(--text2)", fontSize: ".73rem", marginTop: 4 }}>{item.eventType} · {item.actorBusinessRole} · {new Date(item.createdAt).toLocaleString("zh-CN")} {item.comment ? `· ${item.comment}` : ""}</div></article>)}</div></section>
          </>
        )}
      </div>
    </main>
  );
}
