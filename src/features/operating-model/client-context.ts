export const BUSINESS_CONTEXT_STORAGE_KEY = "ai-pmo-business-context-v1";
export const DATA_CLASS_STORAGE_KEY = "ai-pmo-data-class-v1";
export const CURRENT_PROJECT_STORAGE_KEY = "ai-pmo-current-project-v1";
export const REPORTING_PERIOD_STORAGE_KEY = "ai-pmo-reporting-period-v1";

export type StoredBusinessContext = {
  assignmentId: string;
  businessRole: string;
  orgId: string;
  subjectScope: string;
  subjectId: string;
};

export type ClientDataClass = "production" | "test" | "sample" | "diagnostic" | "unclassified";

export function readStoredBusinessContext(): StoredBusinessContext | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(BUSINESS_CONTEXT_STORAGE_KEY);
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as StoredBusinessContext;
    return value?.assignmentId ? value : null;
  } catch {
    return { assignmentId: raw, businessRole: "", orgId: "", subjectScope: "", subjectId: "" };
  }
}

export function writeStoredBusinessContext(value: StoredBusinessContext) {
  window.localStorage.setItem(BUSINESS_CONTEXT_STORAGE_KEY, JSON.stringify(value));
}

export function readStoredDataClass(): ClientDataClass {
  if (typeof window === "undefined") return "production";
  const value = window.localStorage.getItem(DATA_CLASS_STORAGE_KEY);
  return ["production", "test", "sample", "diagnostic", "unclassified"].includes(String(value)) ? value as ClientDataClass : "production";
}

export function writeStoredDataClass(value: ClientDataClass) {
  window.localStorage.setItem(DATA_CLASS_STORAGE_KEY, value);
}

export function readStoredCurrentProject(): string {
  return typeof window === "undefined" ? "" : window.localStorage.getItem(CURRENT_PROJECT_STORAGE_KEY) || "";
}

export function writeStoredCurrentProject(projectId: string) {
  if (projectId) window.localStorage.setItem(CURRENT_PROJECT_STORAGE_KEY, projectId);
  else window.localStorage.removeItem(CURRENT_PROJECT_STORAGE_KEY);
}

export function currentReportingPeriod(now = new Date()): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit" }).format(now).slice(0, 7);
}

export function readStoredReportingPeriod(): string {
  if (typeof window === "undefined") return currentReportingPeriod();
  const value = window.localStorage.getItem(REPORTING_PERIOD_STORAGE_KEY) || "";
  return /^\d{4}-\d{2}$/.test(value) ? value : currentReportingPeriod();
}

export function writeStoredReportingPeriod(value: string) {
  if (!/^\d{4}-\d{2}$/.test(value)) throw new Error("统计周期必须为YYYY-MM。");
  window.localStorage.setItem(REPORTING_PERIOD_STORAGE_KEY, value);
}

export function businessContextSearchParams(context: StoredBusinessContext, dataClass = readStoredDataClass()): URLSearchParams {
  return new URLSearchParams({
    role: context.businessRole,
    org_id: context.orgId,
    subject_scope: context.subjectScope,
    subject_id: context.subjectId,
    data_class: dataClass,
  });
}

export async function loadCurrentBusinessContextSearchParams(options: {
  preferredRole?: string;
  preferredSubjectScope?: string;
} = {}): Promise<URLSearchParams> {
  const dataClass = readStoredDataClass();
  const response = await fetch(`/api/context/current?data_class=${encodeURIComponent(dataClass)}`, { cache: "no-store" });
  const body = await response.json() as {
    active_context?: StoredBusinessContext | null;
    available_contexts?: Array<{
      id: string;
      businessRole: string;
      orgId: string;
      subjectScope: string;
      subjectId: string;
      status: string;
    }>;
    available_projects?: Array<{ id: string }>;
    detail?: string;
  };
  if (!response.ok) throw new Error(body.detail || "无法读取当前业务身份。");
  const stored = readStoredBusinessContext();
  const preferred = body.available_contexts?.find(item => (
    item.status === "active"
    && (!options.preferredRole || item.businessRole === options.preferredRole)
    && (!options.preferredSubjectScope || item.subjectScope === options.preferredSubjectScope)
  ));
  const assignment = preferred
    ?? body.available_contexts?.find(item => item.id === stored?.assignmentId && item.status === "active")
    ?? body.available_contexts?.find(item => item.id === body.active_context?.assignmentId && item.status === "active");
  if (!assignment) throw new Error("尚未分配有效业务角色，请联系管理员。");
  const context: StoredBusinessContext = {
    assignmentId: assignment.id,
    businessRole: assignment.businessRole,
    orgId: assignment.orgId,
    subjectScope: assignment.subjectScope,
    subjectId: assignment.subjectId,
  };
  writeStoredBusinessContext(context);
  const params = businessContextSearchParams(context, dataClass);
  const availableProjects = body.available_projects ?? [];
  const storedProjectId = readStoredCurrentProject();
  const project = availableProjects.find(item => item.id === storedProjectId) ?? availableProjects[0];
  if (project) {
    params.set("project_id", project.id);
    writeStoredCurrentProject(project.id);
  }
  return params;
}
