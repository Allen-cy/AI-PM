import type { BusinessRole } from "../operating-model/context.ts";

export interface DirectoryOption {
  id: string;
  label: string;
  description: string;
  entityType?: string;
  projectId?: string;
}

export interface BusinessDirectory {
  projects: DirectoryOption[];
  people: DirectoryOption[];
  evidence: DirectoryOption[];
  formalOutputs: DirectoryOption[];
  businessObjects: DirectoryOption[];
}

const ROLE_LABEL: Partial<Record<BusinessRole, string>> = {
  pm: "项目经理",
  operations: "运营",
  pmo: "PMO",
  ceo: "CEO",
  sponsor: "项目发起人",
  business_owner: "业务负责人",
  finance: "财务",
  quality: "质量",
};

export function buildBusinessDirectory(input: {
  projects: Array<{ id: string; name: string; code: string | null; dataClass: string }>;
  people: Array<{ id: string; name: string; email: string | null; phone: string | null; roles: BusinessRole[] }>;
  evidence: Array<{ id: string; projectId: string; title: string; evidenceType: string; verifiedAt: string | null }>;
  formalOutputs: Array<{ id: string; projectId: string | null; title: string; outputType: string; status: string }>;
  businessObjects?: Array<{ id: string; projectId: string; objectType: string; code: string | null; title: string; status: string }>;
}): BusinessDirectory {
  return {
    projects: input.projects.map(item => ({ id: item.id, label: `${item.name}${item.code ? ` · ${item.code}` : ""}`, description: `${item.dataClass}数据空间` })),
    people: input.people.map(item => ({ id: item.id, label: `${item.name} · ${item.roles.map(role => ROLE_LABEL[role] || role).join("/") || "协作成员"}`, description: item.email || item.phone || "组织成员" })),
    evidence: input.evidence.map(item => ({ id: item.id, label: `${item.title} · ${item.evidenceType} · ${item.verifiedAt ? "已核验" : "待核验"}`, description: `项目 ${item.projectId}` })),
    formalOutputs: input.formalOutputs.map(item => ({ id: item.id, label: `${item.title} · ${item.outputType} · ${item.status}`, description: item.projectId ? `项目 ${item.projectId}` : "组织级成果", entityType: "formal_output", projectId: item.projectId ?? undefined })),
    businessObjects: (input.businessObjects ?? []).map(item => ({
      id: item.id,
      label: `${item.title}${item.code ? ` · ${item.code}` : ""} · ${item.status || "未标记状态"}`,
      description: `${item.objectType} · 项目 ${item.projectId}`,
      entityType: item.objectType,
      projectId: item.projectId,
    })),
  };
}
