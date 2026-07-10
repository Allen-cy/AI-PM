"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  businessContextSearchParams,
  readStoredBusinessContext,
  readStoredCurrentProject,
  readStoredDataClass,
  type StoredBusinessContext,
} from "@/features/operating-model/client-context";

type ChainKey = "A" | "B" | "C" | "D" | "E";
type Definition = {
  key: ChainKey; label: string; objective: string; roles: string[];
  steps: Array<{ key: string; label: string; actorRoles: string[]; requiredArtifactTypes: string[]; output: string }>;
  failurePaths: Array<{ key: string; label: string }>;
};
type Run = { id: string; chain_key: ChainKey; status: string; data_class: string; source_snapshot_at: string | null; version: number; updated_at: string; failure_reason?: string | null; blocked_reason?: string | null };
type Participant = { id: string; user_id: string; business_role: string; assignment_id: string };
type Step = { id: string; step_key: string; sequence_no: number; label: string; actor_roles: string[]; required_artifact_types: string[]; status: string; artifact_references: unknown[]; submitted_by?: string | null; verified_by?: string | null; verification_comment?: string | null; version: number };
type FailurePath = { id: string; path_key: string; label: string; status: string; evidence: unknown[]; submitted_by?: string | null; verified_by?: string | null; verification_comment?: string | null; version: number };
type Candidate = { assignment_id: string; user_id: string; user_name: string; business_role: string; subject_scope: string; subject_id: string };
type Workspace = {
  error?: string; detail?: string; data_class?: string; project?: { id: string; name: string; oa_no?: string | null };
  definitions?: Record<ChainKey, Definition>; runs?: Run[];
  selected?: { run: Run; participants: Participant[]; steps: Step[]; failure_paths: FailurePath[]; events: unknown[] } | null;
  participant_candidates?: Candidate[];
  readiness?: { canPass: boolean; blockers: Array<{ code: string; detail: string }> } | null;
};

const ROLE_LABEL: Record<string, string> = {
  pm: "项目经理", operations: "运营", pmo: "PMO", ceo: "CEO", sponsor: "项目发起人",
  business_owner: "业务Owner", finance: "财务", quality: "质量",
};
const RUN_ACTION_LABEL: Record<string, string> = {
  prepare: "准备验收", start: "开始执行", submit_verification: "提交总验证", pass: "通过验收",
  fail: "验收失败", block: "阻塞", resume: "恢复执行", cancel: "取消", retry: "重新执行",
};
const RUN_ACTIONS: Record<string, string[]> = {
  draft: ["prepare", "cancel"], ready: ["start", "block", "cancel"], running: ["submit_verification", "block", "cancel"],
  verification: ["pass", "fail", "block"], failed: ["retry", "cancel"], blocked: ["resume", "cancel"], passed: [], cancelled: [],
};

function currentIso() { return new Date().toISOString(); }

export default function GoldenChainAcceptancePage() {
  const [context, setContext] = useState<StoredBusinessContext | null>(null);
  const [projectId, setProjectId] = useState("");
  const [data, setData] = useState<Workspace>({});
  const [selectedRunId, setSelectedRunId] = useState("");
  const [chainKey, setChainKey] = useState<ChainKey>("A");
  const [participantAssignments, setParticipantAssignments] = useState<Record<string, string>>({});
  const [snapshotAt, setSnapshotAt] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [comment, setComment] = useState("");
  const [artifactInputs, setArtifactInputs] = useState<Record<string, { objectId: string; sourceType: string; evidenceId: string }>>({});
  const [failureInputs, setFailureInputs] = useState<Record<string, { type: string; id: string; source: string }>>({});

  const queryFor = useCallback((active: StoredBusinessContext, project: string, runId = "") => {
    const query = businessContextSearchParams(active, readStoredDataClass());
    query.set("project_id", project);
    if (runId) query.set("run_id", runId);
    return query;
  }, []);

  const load = useCallback(async (active: StoredBusinessContext, project: string, runId = "") => {
    setNotice("");
    try {
      const response = await fetch(`/api/operations-center/golden-chains?${queryFor(active, project, runId)}`, { cache: "no-store" });
      const body = await response.json() as Workspace;
      if (!response.ok) throw new Error(body.detail || body.error || "黄金链路验收数据加载失败。");
      setData(body);
      const nextRunId = body.selected?.run.id || body.runs?.[0]?.id || "";
      setSelectedRunId(nextRunId);
    } catch (error) { setNotice(error instanceof Error ? error.message : "加载失败。"); }
  }, [queryFor]);

  useEffect(() => {
    const initialize = () => {
      const active = readStoredBusinessContext(); const project = readStoredCurrentProject();
      if (!active || !project) { setNotice("请先在顶部选择业务身份和当前项目。"); return; }
      setContext(active); setProjectId(project); void load(active, project);
    };
    const timer = window.setTimeout(initialize, 0);
    window.addEventListener("ai-pmo:business-context-changed", initialize);
    window.addEventListener("ai-pmo:project-context-changed", initialize);
    window.addEventListener("ai-pmo:data-class-changed", initialize);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("ai-pmo:business-context-changed", initialize);
      window.removeEventListener("ai-pmo:project-context-changed", initialize);
      window.removeEventListener("ai-pmo:data-class-changed", initialize);
    };
  }, [load]);

  async function mutate(payload: Record<string, unknown>, success: string) {
    if (!context || !projectId) return;
    setBusy(true); setNotice("");
    try {
      const response = await fetch(`/api/operations-center/golden-chains?${queryFor(context, projectId, selectedRunId)}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      const body = await response.json() as Workspace;
      if (!response.ok) {
        const blockers = Array.isArray((body as { blockers?: unknown[] }).blockers) ? ` ${JSON.stringify((body as { blockers?: unknown[] }).blockers)}` : "";
        throw new Error(`${body.detail || body.error || "操作失败。"}${blockers}`);
      }
      setNotice(success);
      const nextRun = body.selected?.run.id || selectedRunId;
      setSelectedRunId(nextRun);
      await load(context, projectId, nextRun);
    } catch (error) { setNotice(error instanceof Error ? error.message : "操作失败。"); }
    finally { setBusy(false); }
  }

  const definition = data.definitions?.[chainKey];
  const current = data.selected;
  const currentDefinition = current ? data.definitions?.[current.run.chain_key] : null;
  const currentRole = context?.businessRole || "";
  const participantByRole = useMemo(() => new Map((current?.participants ?? []).map(item => [item.business_role, item])), [current?.participants]);

  async function createRun() {
    if (!definition) return;
    const participants = definition.roles.map(role => {
      const assignmentId = participantAssignments[role] || "";
      const candidate = data.participant_candidates?.find(item => item.assignment_id === assignmentId);
      return { business_role: role, assignment_id: assignmentId, user_id: candidate?.user_id || "" };
    });
    await mutate({
      operation: "create_run", chain_key: chainKey, source_snapshot_at: snapshotAt ? new Date(snapshotAt).toISOString() : null,
      participants, idempotency_key: `golden:${projectId}:${chainKey}:${Date.now()}`,
    }, "黄金链路验收运行已创建，请由参与角色按步骤执行。");
  }

  async function transitionRun(action: string) {
    if (!current) return;
    await mutate({
      operation: "transition_run", run_id: current.run.id, expected_status: current.run.status, expected_version: current.run.version,
      action, source_snapshot_at: action === "prepare" && snapshotAt ? new Date(snapshotAt).toISOString() : null,
      reason: ["fail", "block"].includes(action) ? comment : null,
    }, `黄金链路状态已更新：${RUN_ACTION_LABEL[action] || action}。`);
  }

  async function transitionStep(step: Step, action: string) {
    const artifactReferences = action === "submit" ? step.required_artifact_types.map(objectType => {
      const input = artifactInputs[`${step.id}:${objectType}`] || { objectId: "", sourceType: "supabase", evidenceId: "" };
      return { objectType, objectId: input.objectId, sourceType: input.sourceType, dataClass: data.data_class, verifiedAt: currentIso(), evidenceId: input.evidenceId || undefined };
    }) : [];
    await mutate({ operation: "transition_step", run_id: current?.run.id, step_id: step.id, expected_status: step.status, expected_version: step.version, action, artifact_references: artifactReferences, comment }, `步骤“${step.label}”已执行：${action}。`);
  }

  async function transitionFailure(path: FailurePath, action: string) {
    const input = failureInputs[path.id] || { type: "", id: "", source: "" };
    await mutate({
      operation: "transition_failure_path", run_id: current?.run.id, failure_path_id: path.id,
      expected_status: path.status, expected_version: path.version, action,
      evidence: action === "submit" ? [{ ...input, observedAt: currentIso() }] : [], comment,
    }, `失败路径“${path.label}”已执行：${action}。`);
  }

  return <main style={{ minHeight: "100vh", background: "var(--bg)" }}>
    <header style={{ padding: "15px 28px", borderBottom: "1px solid var(--border)", background: "var(--surface)", display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
      <Link href="/operations-center" style={{ color: "var(--text2)", textDecoration: "none" }}>← 返回运营中心</Link>
      <strong>五条黄金链路验收台</strong>
      {currentRole && <span className="tag tag-purple">{ROLE_LABEL[currentRole] || currentRole}</span>}
      {data.data_class && <span className={`tag ${data.data_class === "production" ? "tag-green" : "tag-red"}`}>{data.data_class === "production" ? "正式数据" : `${data.data_class}（不可通过验收）`}</span>}
    </header>
    <div style={{ maxWidth: 1500, margin: "0 auto", padding: 28 }}>
      <section className="card" style={{ background: "linear-gradient(135deg,rgba(37,99,235,.14),rgba(124,58,237,.10))" }}>
        <h1 style={{ fontSize: "1.45rem" }}>让项目经理、运营、PMO、CEO、业务Owner、财务和质量共同完成可重复验收</h1>
        <p style={{ color: "var(--text2)", lineHeight: 1.8, marginTop: 8 }}>每个步骤都要由指定角色开始步骤、提交结构化成果，再由另一位参与者独立验证。失败路径必须实际演练并留证；只填一段文字不能通过。</p>
        {data.project && <p style={{ marginTop: 8 }}><strong>当前项目：</strong>{data.project.name}{data.project.oa_no ? ` · ${data.project.oa_no}` : ""}</p>}
      </section>

      {notice && <section className="card" style={{ marginTop: 16, borderColor: "rgba(245,158,11,.45)", whiteSpace: "pre-wrap" }}>{notice}</section>}

      <section className="card" style={{ marginTop: 16 }}>
        <div className="section-title">① 创建一次可执行验收</div>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(220px,.7fr) minmax(0,1.3fr)", gap: 14, marginTop: 12 }}>
          <div>
            <select className="input" value={chainKey} onChange={event => { setChainKey(event.target.value as ChainKey); setParticipantAssignments({}); }}>
              {Object.values(data.definitions ?? {}).map(item => <option value={item.key} key={item.key}>{item.key} · {item.label}</option>)}
            </select>
            <input className="input" style={{ marginTop: 8 }} type="datetime-local" value={snapshotAt} onChange={event => setSnapshotAt(event.target.value)} aria-label="事实快照时间" />
            <p style={{ color: "var(--text2)", fontSize: ".75rem", marginTop: 7 }}>事实快照时间可在“准备验收”时补齐。</p>
          </div>
          <div>
            <strong>{definition?.objective}</strong>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: 8, marginTop: 10 }}>
              {(definition?.roles ?? []).map(role => <label key={role} style={{ padding: 9, background: "var(--surface2)", borderRadius: 9 }}>
                <span style={{ display: "block", fontSize: ".76rem", marginBottom: 5 }}>{ROLE_LABEL[role] || role}</span>
                <select className="input" value={participantAssignments[role] || ""} onChange={event => setParticipantAssignments(previous => ({ ...previous, [role]: event.target.value }))}>
                  <option value="">选择参与者</option>
                  {(data.participant_candidates ?? []).filter(item => item.business_role === role).map(item => <option key={item.assignment_id} value={item.assignment_id}>{item.user_name} · {item.subject_scope}</option>)}
                </select>
              </label>)}
            </div>
          </div>
        </div>
        <button className="btn-primary" style={{ marginTop: 12 }} disabled={busy || !definition || definition.roles.some(role => !participantAssignments[role])} onClick={() => void createRun()}>创建黄金链路运行</button>
      </section>

      <section className="card" style={{ marginTop: 16 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}><div className="section-title">② 选择运行并推进总状态</div>
          <select className="input" style={{ marginLeft: "auto", minWidth: 280 }} value={selectedRunId} onChange={event => { const id = event.target.value; setSelectedRunId(id); if (context && projectId) void load(context, projectId, id); }}>
            {(data.runs ?? []).map(run => <option key={run.id} value={run.id}>{run.chain_key} · {data.definitions?.[run.chain_key]?.label} · {run.status}</option>)}
          </select>
        </div>
        {current ? <>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}><span className="tag tag-blue">{current.run.chain_key} · {currentDefinition?.label}</span><span className="tag tag-purple">{current.run.status}</span>{current.participants.map(item => <span className="tag" key={item.id}>{ROLE_LABEL[item.business_role]} · {item.user_id.slice(0, 8)}</span>)}</div>
          <textarea className="input" style={{ marginTop: 10, minHeight: 64 }} placeholder="阻塞、驳回或验收失败原因（对应动作必填）" value={comment} onChange={event => setComment(event.target.value)} />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
            {(RUN_ACTIONS[current.run.status] ?? []).map(action => <button key={action} className={action === "pass" ? "btn-primary" : "btn-secondary"} disabled={busy || (["fail", "block"].includes(action) && !comment.trim())} onClick={() => void transitionRun(action)}>{RUN_ACTION_LABEL[action]}</button>)}
          </div>
          {data.readiness && <div style={{ marginTop: 12, padding: 12, borderRadius: 10, background: data.readiness.canPass ? "rgba(16,185,129,.1)" : "rgba(245,158,11,.1)" }}><strong>{data.readiness.canPass ? "已满足通过条件" : `待补齐 ${data.readiness.blockers.length} 项`}</strong>{!data.readiness.canPass && <ul style={{ margin: "8px 0 0 20px", color: "var(--text2)", lineHeight: 1.7 }}>{data.readiness.blockers.slice(0, 20).map((item, index) => <li key={`${item.code}-${index}`}>{item.detail}</li>)}</ul>}</div>}
        </> : <p style={{ color: "var(--text2)", marginTop: 10 }}>尚无验收运行。</p>}
      </section>

      {current && <section className="card" style={{ marginTop: 16 }}>
        <div className="section-title">③ 步骤执行、提交成果与独立验证</div>
        <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
          {current.steps.map(step => <article key={step.id} style={{ border: "1px solid var(--border)", borderRadius: 12, padding: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}><div><strong>{step.sequence_no}. {step.label}</strong><p style={{ color: "var(--text2)", marginTop: 5 }}>执行角色：{step.actor_roles.map(role => ROLE_LABEL[role] || role).join(" / ")} · 产出：{currentDefinition?.steps.find(item => item.key === step.step_key)?.output}</p></div><span className="tag tag-blue">{step.status}</span></div>
            {step.status === "in_progress" && <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
              {step.required_artifact_types.map(objectType => {
                const key = `${step.id}:${objectType}`; const value = artifactInputs[key] || { objectId: "", sourceType: "supabase", evidenceId: "" };
                return <div key={key} style={{ display: "grid", gridTemplateColumns: "minmax(170px,.7fr) minmax(220px,1fr) 140px minmax(180px,.8fr)", gap: 8, alignItems: "center" }}><strong style={{ fontSize: ".75rem" }}>{objectType}</strong><input className="input" placeholder="成果对象 ID *" value={value.objectId} onChange={event => setArtifactInputs(previous => ({ ...previous, [key]: { ...value, objectId: event.target.value } }))}/><select className="input" value={value.sourceType} onChange={event => setArtifactInputs(previous => ({ ...previous, [key]: { ...value, sourceType: event.target.value } }))}>{["supabase", "feishu", "obsidian", "external"].map(source => <option key={source}>{source}</option>)}</select><input className="input" placeholder="证据 ID（可选）" value={value.evidenceId} onChange={event => setArtifactInputs(previous => ({ ...previous, [key]: { ...value, evidenceId: event.target.value } }))}/></div>;
              })}
            </div>}
            {step.artifact_references.length > 0 && <p style={{ color: "var(--text2)", marginTop: 8 }}>已提交 {step.artifact_references.length} 个结构化成果引用。</p>}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
              {step.status === "pending" && <button className="btn-primary" disabled={busy || !step.actor_roles.includes(currentRole)} onClick={() => void transitionStep(step, "start")}>开始步骤</button>}
              {step.status === "in_progress" && <button className="btn-primary" disabled={busy || !step.actor_roles.includes(currentRole) || step.required_artifact_types.some(type => !artifactInputs[`${step.id}:${type}`]?.objectId)} onClick={() => void transitionStep(step, "submit")}>提交成果</button>}
              {step.status === "submitted" && <><button className="btn-primary" disabled={busy || step.submitted_by === participantByRole.get(currentRole)?.user_id} onClick={() => void transitionStep(step, "verify")}>独立验证通过</button><button className="btn-secondary" disabled={busy || !comment.trim()} onClick={() => void transitionStep(step, "reject")}>驳回重做</button></>}
              {step.status === "failed" && <button className="btn-secondary" disabled={busy || !step.actor_roles.includes(currentRole)} onClick={() => void transitionStep(step, "retry")}>重新开始</button>}
            </div>
          </article>)}
        </div>
      </section>}

      {current && <section className="card" style={{ marginTop: 16 }}>
        <div className="section-title">④ 失败路径演练与留证</div>
        <p style={{ color: "var(--text2)", lineHeight: 1.7, marginTop: 6 }}>不只测试正常路径。每个异常分支需由一名参与者提交实际记录，再由 PMO、质量或 CEO 中的另一人独立验证。</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(330px,1fr))", gap: 12, marginTop: 12 }}>
          {current.failure_paths.map(path => {
            const value = failureInputs[path.id] || { type: "", id: "", source: "" };
            return <article key={path.id} style={{ border: "1px solid var(--border)", borderRadius: 12, padding: 14 }}><div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}><strong>{path.label}</strong><span className="tag tag-blue">{path.status}</span></div>
              {path.status === "pending" && <div style={{ display: "grid", gap: 7, marginTop: 10 }}><input className="input" placeholder="证据类型 *" value={value.type} onChange={event => setFailureInputs(previous => ({ ...previous, [path.id]: { ...value, type: event.target.value } }))}/><input className="input" placeholder="证据记录 ID *" value={value.id} onChange={event => setFailureInputs(previous => ({ ...previous, [path.id]: { ...value, id: event.target.value } }))}/><input className="input" placeholder="证据来源 *" value={value.source} onChange={event => setFailureInputs(previous => ({ ...previous, [path.id]: { ...value, source: event.target.value } }))}/></div>}
              {path.evidence.length > 0 && <p style={{ color: "var(--text2)", marginTop: 8 }}>已留存 {path.evidence.length} 条结构化演练证据。</p>}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>{path.status === "pending" && <button className="btn-primary" disabled={busy || !value.type || !value.id || !value.source} onClick={() => void transitionFailure(path, "submit")}>提交失败路径证据</button>}{path.status === "submitted" && <><button className="btn-primary" disabled={busy || path.submitted_by === participantByRole.get(currentRole)?.user_id} onClick={() => void transitionFailure(path, "verify_pass")}>独立验证通过</button><button className="btn-secondary" disabled={busy || !comment.trim()} onClick={() => void transitionFailure(path, "verify_fail")}>验证不通过</button></>}{path.status === "failed" && <button className="btn-secondary" disabled={busy} onClick={() => void transitionFailure(path, "retry")}>重新演练</button>}</div>
            </article>;
          })}
        </div>
      </section>}
    </div>
  </main>;
}
