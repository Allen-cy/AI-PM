"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  readStoredBusinessContext,
  readStoredCurrentProject,
  readStoredDataClass,
  readStoredReportingPeriod,
  writeStoredBusinessContext,
  writeStoredCurrentProject,
  writeStoredDataClass,
  writeStoredReportingPeriod,
  type ClientDataClass,
} from "@/features/operating-model/client-context";

type BusinessRole = "pm" | "operations" | "pmo" | "ceo" | "sponsor" | "business_owner" | "finance" | "quality";
type SubjectScope = "project" | "portfolio" | "organization" | "customer" | "contract";

type Assignment = {
  id: string;
  businessRole: BusinessRole;
  orgId: string;
  subjectScope: SubjectScope;
  subjectId: string;
  status: string;
  validFrom: string;
  validUntil: string | null;
};

type ContextResponse = {
  user?: { name?: string | null; email?: string | null; system_role?: string };
  active_context?: {
    businessRole: BusinessRole;
    orgId: string;
    subjectScope: SubjectScope;
    subjectId: string;
    assignmentId: string;
  } | null;
  available_contexts?: Assignment[];
  available_projects?: Array<{ id: string; name: string; code: string | null; dataClass: string }>;
  setup_required?: boolean;
  error?: string;
  detail?: string;
};

const ROLE_LABEL: Record<BusinessRole, string> = {
  pm: "项目经理",
  operations: "运营",
  pmo: "PMO",
  ceo: "CEO",
  sponsor: "项目发起人",
  business_owner: "业务负责人",
  finance: "财务",
  quality: "质量",
};

const SCOPE_LABEL: Record<SubjectScope, string> = {
  project: "项目",
  portfolio: "项目组合",
  organization: "组织",
  customer: "客户",
  contract: "合同",
};

function contextUrl(assignment: Assignment, dataClass: ClientDataClass): string {
  const params = new URLSearchParams({
    role: assignment.businessRole,
    org_id: assignment.orgId,
    subject_scope: assignment.subjectScope,
    subject_id: assignment.subjectId,
    data_class: dataClass,
  });
  return `/api/context/current?${params.toString()}`;
}

function isHiddenPath(pathname: string): boolean {
  return pathname.startsWith("/auth/") || pathname === "/auth";
}

export function BusinessContextBar() {
  const pathname = usePathname();
  const [data, setData] = useState<ContextResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [dataClass, setDataClass] = useState<ClientDataClass>("production");
  const [currentProjectId, setCurrentProjectId] = useState("");
  const [reportingPeriod, setReportingPeriod] = useState("");
  const hidden = isHiddenPath(pathname);

  useEffect(() => {
    if (hidden) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const storedDataClass = readStoredDataClass();
        setDataClass(storedDataClass);
        setReportingPeriod(readStoredReportingPeriod());
        const baseResponse = await fetch(`/api/context/current?data_class=${storedDataClass}`, { cache: "no-store" });
        const base = await baseResponse.json() as ContextResponse;
        if (!baseResponse.ok) {
          if (!cancelled) setData(base);
          return;
        }
        const savedId = readStoredBusinessContext()?.assignmentId;
        const saved = base.available_contexts?.find(item => item.id === savedId && item.status === "active");
        if (!saved || base.active_context?.assignmentId === saved.id) {
          const selected = saved ?? base.available_contexts?.find(item => item.id === base.active_context?.assignmentId);
          if (selected) writeStoredBusinessContext({ assignmentId: selected.id, businessRole: selected.businessRole, orgId: selected.orgId, subjectScope: selected.subjectScope, subjectId: selected.subjectId });
          const savedProject = readStoredCurrentProject();
          const nextProject = base.available_projects?.some(item => item.id === savedProject) ? savedProject : base.available_projects?.[0]?.id || "";
          writeStoredCurrentProject(nextProject); setCurrentProjectId(nextProject);
          if (!cancelled) setData(base);
          return;
        }
        const selectedResponse = await fetch(contextUrl(saved, storedDataClass), { cache: "no-store" });
        const selected = await selectedResponse.json() as ContextResponse;
        const next = selectedResponse.ok ? selected : base;
        const savedProject = readStoredCurrentProject();
        const nextProject = next.available_projects?.some(item => item.id === savedProject) ? savedProject : next.available_projects?.[0]?.id || "";
        writeStoredCurrentProject(nextProject); setCurrentProjectId(nextProject);
        if (!cancelled) setData(next);
      } catch {
        if (!cancelled) setData({ error: "BUSINESS_CONTEXT_LOAD_FAILED" });
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [hidden]);

  const currentId = data?.active_context?.assignmentId ?? "";
  const activeAssignment = useMemo(
    () => data?.available_contexts?.find(item => item.id === currentId) ?? null,
    [currentId, data?.available_contexts],
  );

  async function changeContext(assignmentId: string) {
    const assignment = data?.available_contexts?.find(item => item.id === assignmentId);
    if (!assignment) return;
    setLoading(true);
    try {
      const response = await fetch(contextUrl(assignment, dataClass), { cache: "no-store" });
      const next = await response.json() as ContextResponse;
      if (!response.ok) throw new Error(next.detail || next.error || "切换失败");
      writeStoredBusinessContext({ assignmentId: assignment.id, businessRole: assignment.businessRole, orgId: assignment.orgId, subjectScope: assignment.subjectScope, subjectId: assignment.subjectId });
      const nextProject = next.available_projects?.[0]?.id || "";
      writeStoredCurrentProject(nextProject); setCurrentProjectId(nextProject);
      setData(next);
      window.dispatchEvent(new CustomEvent("ai-pmo:business-context-changed", { detail: next.active_context }));
    } catch (error) {
      setData(previous => ({ ...previous, error: error instanceof Error ? error.message : "切换失败" }));
    } finally {
      setLoading(false);
    }
  }

  async function changeDataClass(value: ClientDataClass) {
    setDataClass(value);
    writeStoredDataClass(value);
    if (activeAssignment) {
      setLoading(true);
      try {
        const response = await fetch(contextUrl(activeAssignment, value), { cache: "no-store" });
        const next = await response.json() as ContextResponse;
        if (response.ok) {
          setData(next);
          const nextProject = next.available_projects?.[0]?.id || "";
          writeStoredCurrentProject(nextProject); setCurrentProjectId(nextProject);
        }
      } finally { setLoading(false); }
    }
    window.dispatchEvent(new CustomEvent("ai-pmo:data-class-changed", { detail: value }));
  }

  function changeCurrentProject(projectId: string) {
    setCurrentProjectId(projectId); writeStoredCurrentProject(projectId);
    window.dispatchEvent(new CustomEvent("ai-pmo:project-context-changed", { detail: projectId }));
  }

  function changeReportingPeriod(value: string) {
    setReportingPeriod(value); writeStoredReportingPeriod(value);
    window.dispatchEvent(new CustomEvent("ai-pmo:reporting-period-changed", { detail: value }));
  }

  if (hidden || data?.error === "UNAUTHORIZED" || data?.error === "BUSINESS_CONTEXT_REQUIRES_USER") return null;

  if (data?.setup_required || data?.error === "P17_STORAGE_NOT_CONFIGURED") {
    return (
      <aside className="business-context-bar" data-state="setup-required">
        <span>当前业务身份：尚未配置</span>
        <span className="business-context-hint">管理员需先在安全中心分配项目经理、运营、PMO或CEO业务角色。</span>
        <Link href="/admin/security">前往配置</Link>
      </aside>
    );
  }

  if (!data?.available_contexts?.length) return null;
  const active = data.active_context;
  return (
    <aside className="business-context-bar" data-state={loading ? "loading" : "ready"}>
      <strong>当前业务身份</strong>
      <select
        aria-label="当前业务身份"
        value={currentId}
        onChange={event => void changeContext(event.target.value)}
        disabled={loading}
      >
        {data.available_contexts.filter(item => item.status === "active").map(item => (
          <option key={item.id} value={item.id}>
            {ROLE_LABEL[item.businessRole]} · {SCOPE_LABEL[item.subjectScope]} · {item.subjectId}
          </option>
        ))}
      </select>
      {active && (
        <span className="business-context-hint">
          {ROLE_LABEL[active.businessRole]}仅在当前{SCOPE_LABEL[active.subjectScope]}范围内生效
        </span>
      )}
      <select aria-label="当前数据空间" value={dataClass} onChange={event => void changeDataClass(event.target.value as ClientDataClass)} disabled={loading}>
        <option value="production">正式数据</option><option value="test">测试数据</option><option value="sample">样例数据</option><option value="diagnostic">诊断数据</option><option value="unclassified">待分类</option>
      </select>
      {(data.available_projects?.length ?? 0) > 0 && <select aria-label="当前项目" value={currentProjectId} onChange={event => changeCurrentProject(event.target.value)} disabled={loading}>{data.available_projects?.map(project => <option key={project.id} value={project.id}>{project.name}{project.code ? ` · ${project.code}` : ""}</option>)}</select>}
      <input aria-label="当前统计周期" type="month" value={reportingPeriod} onChange={event => changeReportingPeriod(event.target.value)} disabled={loading} />
      {currentProjectId && activeAssignment && (
        <Link href={`/projects/${encodeURIComponent(currentProjectId)}?role=${activeAssignment.businessRole}&data_class=${dataClass}`}>
          打开项目360
        </Link>
      )}
    </aside>
  );
}
