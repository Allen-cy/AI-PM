"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  loadCurrentBusinessContextSearchParams,
  writeStoredCurrentProject,
} from "@/features/operating-model/client-context";
import styles from "./page.module.css";

type ProjectOption = {
  id: string;
  name: string;
  code: string | null;
  dataClass: string;
};

type QuarantineRow = {
  id: string;
  risk_id: string;
  reason: string;
  status: string;
  detected_at: string;
  original_snapshot: Record<string, unknown> | null;
};

type QueueItem = {
  queueId: string;
  riskId: string;
  riskCode: string;
  title: string;
  summary: string;
  owner: string;
  reason: string;
  version: number;
  detectedAt: string;
};

type ContextResponse = {
  available_projects?: ProjectOption[];
  project_options_warning?: string;
  detail?: string;
  error?: string;
};

type QueueResponse = {
  quarantine?: QuarantineRow[];
  detail?: string;
  error?: string;
};

function textFrom(snapshot: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = snapshot[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function normalizeQueueItem(row: QuarantineRow): QueueItem {
  const snapshot = row.original_snapshot ?? {};
  const versionValue = Number(snapshot.version);
  return {
    queueId: row.id,
    riskId: row.risk_id,
    riskCode: textFrom(snapshot, ["risk_code", "code", "风险编号"]) || "未编号风险",
    title: textFrom(snapshot, ["title", "risk_name", "name", "风险名称"]) || "待补充风险名称",
    summary: textFrom(snapshot, ["description", "risk_description", "summary", "风险描述", "风险说明"]) || "原记录没有可展示的文字摘要。",
    owner: textFrom(snapshot, ["owner_name", "owner", "responsible_person", "责任人"]) || "未指定责任人",
    reason: row.reason || "历史风险未关联稳定项目",
    version: Number.isInteger(versionValue) && versionValue > 0 ? versionValue : 1,
    detectedAt: row.detected_at,
  };
}

function friendlyError(status: number, code: string, detail?: string): string {
  if (status === 401) return "登录状态已失效，请重新登录后再进入隔离治理队列。";
  if (status === 403 || code === "RISK_OPERATION_FORBIDDEN") {
    return "无权访问风险隔离治理队列。该功能仅向同时具备管理员身份与 PMO 业务角色的用户开放。";
  }
  if (code === "P17_STORAGE_NOT_CONFIGURED" || status === 503) {
    return detail || "风险治理存储尚未配置，请先完成 V6.1 数据库配置。";
  }
  if (code === "VERSION_CONFLICT") return "该风险已被其他管理员更新，请刷新队列后再处理。";
  return detail || code || "隔离治理队列暂时无法加载，请稍后重试。";
}

function projectLabel(project: ProjectOption): string {
  return `${project.name}${project.code ? `（${project.code}）` : ""}`;
}

export default function RiskQuarantinePage() {
  const [loading, setLoading] = useState(true);
  const [savingRiskId, setSavingRiskId] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [warning, setWarning] = useState("");
  const [contextParams, setContextParams] = useState<URLSearchParams | null>(null);
  const [availableProjects, setAvailableProjects] = useState<ProjectOption[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [items, setItems] = useState<QueueItem[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const intentKeys = useRef<Record<string, string>>({});

  const selectedProject = useMemo(
    () => availableProjects.find(project => project.id === selectedProjectId) ?? null,
    [availableProjects, selectedProjectId],
  );

  const loadQueue = useCallback(async () => {
    setLoading(true);
    setError("");
    setWarning("");
    try {
      const params = await loadCurrentBusinessContextSearchParams({ preferredRole: "pmo", preferredSubjectScope: "organization" });
      const contextResponse = await fetch(`/api/context/current?${params.toString()}`, { cache: "no-store" });
      const contextBody = await contextResponse.json() as ContextResponse;
      if (!contextResponse.ok) {
        throw new Error(friendlyError(contextResponse.status, contextBody.error || "BUSINESS_CONTEXT_LOAD_FAILED", contextBody.detail));
      }
      const projects = contextBody.available_projects ?? [];
      setAvailableProjects(projects);
      setWarning(contextBody.project_options_warning || "");
      const currentProjectId = params.get("project_id") || projects[0]?.id || "";
      const validProjectId = projects.some(project => project.id === currentProjectId) ? currentProjectId : projects[0]?.id || "";
      setSelectedProjectId(validProjectId);
      if (validProjectId) writeStoredCurrentProject(validProjectId);

      const queueParams = new URLSearchParams(params);
      queueParams.delete("project_id");
      queueParams.set("quarantine_status", "pending");
      setContextParams(queueParams);
      const queueResponse = await fetch(`/api/risk/quarantine?${queueParams.toString()}`, { cache: "no-store" });
      const queueBody = await queueResponse.json() as QueueResponse;
      if (!queueResponse.ok) {
        throw new Error(friendlyError(queueResponse.status, queueBody.error || "RISK_QUARANTINE_LOAD_FAILED", queueBody.detail));
      }
      setItems((queueBody.quarantine ?? []).map(normalizeQueueItem));
    } catch (caught) {
      setItems([]);
      setError(caught instanceof Error ? caught.message : "隔离治理队列暂时无法加载，请稍后重试。");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadQueue(), 0);
    return () => window.clearTimeout(timer);
  }, [loadQueue]);

  function selectProject(projectId: string) {
    setSelectedProjectId(projectId);
    writeStoredCurrentProject(projectId);
    setMessage("");
  }

  async function resolveItem(item: QueueItem) {
    const resolutionNote = notes[item.riskId]?.trim() || "";
    if (!selectedProjectId) {
      setError("当前业务上下文没有可授权项目，无法解除隔离。");
      return;
    }
    if (!resolutionNote) {
      setError("请填写本次项目关联的处理说明。");
      return;
    }
    if (!contextParams) {
      setError("业务上下文尚未加载完成，请刷新后重试。");
      return;
    }

    setSavingRiskId(item.riskId);
    setError("");
    setMessage("");
    try {
      const idempotencyKey = intentKeys.current[item.riskId] || crypto.randomUUID();
      intentKeys.current[item.riskId] = idempotencyKey;
      const requestParams = new URLSearchParams(contextParams);
      requestParams.delete("quarantine_status");
      requestParams.set("project_id", selectedProjectId);
      const response = await fetch(`/api/risk/quarantine?${requestParams.toString()}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          risk_id: item.riskId,
          project_id: selectedProjectId,
          expected_version: item.version,
          idempotency_key: idempotencyKey,
          resolution_note: resolutionNote,
        }),
      });
      const body = await response.json() as { error?: string; detail?: string };
      if (!response.ok) throw new Error(friendlyError(response.status, body.error || "RISK_QUARANTINE_RESOLVE_FAILED", body.detail));
      setMessage(`${item.riskCode} 已关联到 ${selectedProject ? projectLabel(selectedProject) : "所选项目"}，并移出待处理队列。`);
      setItems(current => current.filter(candidate => candidate.riskId !== item.riskId));
      delete intentKeys.current[item.riskId];
      setNotes(current => {
        const next = { ...current };
        delete next[item.riskId];
        return next;
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "解除隔离失败，请稍后重试。");
    } finally {
      setSavingRiskId("");
    }
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <nav className={styles.nav} aria-label="页面导航">
          <Link href="/admin/security">← 返回安全中心</Link>
          <Link href="/">返回首页</Link>
        </nav>
        <div className={styles.headerTitle}>
          <span aria-hidden="true">🧭</span>
          <strong>风险隔离治理队列</strong>
          <span className="tag tag-amber">V6.1</span>
        </div>
      </header>

      <div className={styles.container}>
        <section className={styles.intro}>
          <div>
            <p className={styles.eyebrow}>管理员 + PMO 治理动作</p>
            <h1>把未关联项目的历史风险安全归位</h1>
            <p className={styles.description}>
              队列仅展示当前组织中的待处理隔离风险。请选择当前业务身份已授权的项目，填写判断依据后解除隔离；系统会校验版本，避免覆盖其他管理员的新操作。
            </p>
          </div>
          <button className="btn-secondary" type="button" onClick={() => void loadQueue()} disabled={loading || Boolean(savingRiskId)}>
            {loading ? "刷新中…" : "刷新队列"}
          </button>
        </section>

        {(error || message || warning) && (
          <section className={styles.feedback} aria-live="polite">
            {error && <p className={styles.error}>{error}</p>}
            {message && <p className={styles.success}>{message}</p>}
            {warning && <p className={styles.warning}>项目选项提醒：{warning}</p>}
          </section>
        )}

        <section className={styles.projectPanel} aria-labelledby="project-selector-title">
          <div>
            <h2 id="project-selector-title">本次关联到哪个项目</h2>
            <p>只显示当前业务身份和数据空间下已授权的项目，不需要输入项目编号或技术标识。</p>
          </div>
          <label className={styles.projectField}>
            <span>授权项目</span>
            <select
              className="input"
              value={selectedProjectId}
              onChange={event => selectProject(event.target.value)}
              disabled={loading || availableProjects.length === 0}
            >
              {availableProjects.length === 0 && <option value="">暂无可授权项目</option>}
              {availableProjects.map(project => (
                <option key={project.id} value={project.id}>{projectLabel(project)}</option>
              ))}
            </select>
          </label>
        </section>

        {!loading && !error && availableProjects.length === 0 && (
          <section className={styles.emptyState}>
            <strong>当前业务上下文没有可授权项目</strong>
            <p>请先在安全中心为当前 PMO 身份配置组织或项目范围，配置完成后再刷新队列。</p>
            <Link href="/admin/security" className="btn-secondary">前往安全中心配置</Link>
          </section>
        )}

        {loading && <section className={styles.emptyState}>正在加载当前业务上下文和待处理风险…</section>}

        {!loading && !error && availableProjects.length > 0 && items.length === 0 && (
          <section className={styles.emptyState}>
            <strong>当前没有待处理的隔离风险</strong>
            <p>未关联项目的历史风险会自动进入这里；已经治理完成的记录不会重复出现。</p>
          </section>
        )}

        {!loading && items.length > 0 && (
          <section className={styles.queue} aria-label="待处理隔离风险">
            <div className={styles.queueHeading}>
              <h2>待处理风险</h2>
              <span>{items.length} 条</span>
            </div>
            {items.map(item => {
              const resolutionNote = notes[item.riskId] || "";
              const saving = savingRiskId === item.riskId;
              return (
                <article className={styles.riskCard} key={item.queueId}>
                  <div className={styles.riskHeader}>
                    <div className={styles.riskIdentity}>
                      <span className={styles.code}>{item.riskCode}</span>
                      <h3>{item.title}</h3>
                    </div>
                    <span className="tag tag-amber">待关联项目</span>
                  </div>

                  <dl className={styles.metaGrid}>
                    <div><dt>目标项目</dt><dd>{selectedProject ? projectLabel(selectedProject) : "尚未选择"}</dd></div>
                    <div><dt>隔离原因</dt><dd>{item.reason}</dd></div>
                    <div><dt>记录版本</dt><dd>V{item.version}</dd></div>
                    <div><dt>责任人</dt><dd>{item.owner}</dd></div>
                    <div><dt>识别时间</dt><dd>{new Date(item.detectedAt).toLocaleString("zh-CN", { hour12: false })}</dd></div>
                  </dl>

                  <div className={styles.summary}>
                    <span>原始摘要</span>
                    <p>{item.summary}</p>
                  </div>

                  <label className={styles.noteField}>
                    <span>处理说明（必填）</span>
                    <textarea
                      className="input"
                      value={resolutionNote}
                      onChange={event => setNotes(current => ({ ...current, [item.riskId]: event.target.value }))}
                      placeholder="例如：已与项目经理核对，该风险属于所选项目；依据为周例会纪要和风险台账。"
                      maxLength={1000}
                      disabled={saving}
                    />
                    <small>{resolutionNote.length}/1000</small>
                  </label>

                  <div className={styles.actions}>
                    <span>保存后将更新风险归属并留下治理记录。</span>
                    <button
                      className="btn-primary"
                      type="button"
                      onClick={() => void resolveItem(item)}
                      disabled={saving || Boolean(savingRiskId) || !selectedProjectId || !resolutionNote.trim()}
                    >
                      {saving ? "处理中…" : "确认关联并解除隔离"}
                    </button>
                  </div>
                </article>
              );
            })}
          </section>
        )}
      </div>
    </main>
  );
}
