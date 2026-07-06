import corpusSnapshot from "../rag/corpus.snapshot.json" with { type: "json" };
import type { KnowledgeStatus, RagDocument } from "../rag/types";
import { templateCatalog } from "../../lib/template-center.ts";

type CorpusSnapshot = {
  index_version: string;
  generated_at: string;
  documents: RagDocument[];
};

export type KnowledgeImpactPriority = "P0" | "P1" | "P2";

export interface KnowledgeOperationItem {
  pageId: string;
  title: string;
  type: string;
  status: KnowledgeStatus;
  domains: string[];
  tags: string[];
  owner: string;
  version: string;
  sourceRefs: string[];
  confidentiality: RagDocument["confidentiality"];
  effectiveAt: string;
  expiresAt: string;
  daysToExpire: number;
  lifecycleHealth: "正常" | "待复核" | "即将过期" | "已过期" | "已归档";
  impactedModules: string[];
  linkedTemplates: string[];
  changeSummary: string;
  reviewOutput: string;
}

export interface KnowledgeImpactModule {
  module: string;
  documentCount: number;
  priority: KnowledgeImpactPriority;
  reason: string;
  documents: Array<{ pageId: string; title: string; status: KnowledgeStatus }>;
}

export interface KnowledgeLifecycleAction {
  id: string;
  title: string;
  owner: string;
  dueDate: string;
  priority: KnowledgeImpactPriority;
  sourceDocumentId: string;
  action: string;
  output: string;
}

export interface KnowledgeTemplateDirectoryItem {
  id: string;
  title: string;
  category: string;
  source: string;
  linkedKnowledgeIds: string[];
  lifecycleStatus: "已关联" | "待关联";
}

export interface KnowledgeOperationDashboard {
  generatedAt: string;
  indexVersion: string;
  summary: {
    total: number;
    draft: number;
    reviewed: number;
    published: number;
    deprecated: number;
    archived: number;
    expiringSoon: number;
    needsReview: number;
    affectedModules: number;
    linkedTemplates: number;
  };
  items: KnowledgeOperationItem[];
  impactModules: KnowledgeImpactModule[];
  lifecycleActions: KnowledgeLifecycleAction[];
  templateDirectory: KnowledgeTemplateDirectoryItem[];
  boundary: string;
};

const snapshot = corpusSnapshot as CorpusSnapshot;

const ownerRules: Array<{ pattern: RegExp; owner: string }> = [
  { pattern: /风险|复盘|预警/i, owner: "风险管理负责人" },
  { pattern: /PMO|治理|成熟度|组织/i, owner: "PMO治理负责人" },
  { pattern: /业财|合同|回款|经营|财务/i, owner: "业财一体化负责人" },
  { pattern: /规划|接手|WBS|模板|计划/i, owner: "项目规划负责人" },
  { pattern: /AI|RAG|知识/i, owner: "知识库管理员" },
];

const moduleRules: Array<{ pattern: RegExp; modules: string[] }> = [
  { pattern: /风险|复盘|预警/i, modules: ["风险管理", "PM/PMO每日工作台", "报告工厂"] },
  { pattern: /PMO|治理|成熟度|组织|阶段门/i, modules: ["PMO治理中心", "治理流程", "报告工厂"] },
  { pattern: /业财|合同|回款|经营|财务|LTC/i, modules: ["经营驾驶舱", "项目组合看板", "报告工厂"] },
  { pattern: /规划|接手|WBS|计划|模板/i, modules: ["规划中心", "模板下载中心", "项目组合看板"] },
  { pattern: /AI|RAG|知识|问答/i, modules: ["知识库与AI问答", "AI依据审计", "报告工厂"] },
];

function daysBetween(start: Date, end: Date): number {
  return Math.ceil((end.getTime() - start.getTime()) / 86_400_000);
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function corpusText(document: RagDocument): string {
  return [document.title, document.type, ...document.domains, ...document.tags, ...document.aliases, document.content].join(" ");
}

function inferOwner(document: RagDocument): string {
  const text = corpusText(document);
  return ownerRules.find(rule => rule.pattern.test(text))?.owner ?? "知识库管理员";
}

function inferImpactedModules(document: RagDocument): string[] {
  const text = corpusText(document);
  const modules = moduleRules.flatMap(rule => rule.pattern.test(text) ? rule.modules : []);
  return Array.from(new Set(modules.length ? modules : ["知识库与AI问答"]));
}

function linkedTemplates(document: RagDocument): string[] {
  const text = corpusText(document).toLowerCase();
  return templateCatalog
    .filter(template => {
      const templateText = [template.id, template.title, template.description, template.source, template.category].join(" ").toLowerCase();
      return templateText.split(/[\s/、，,.-]+/).some(token => token.length >= 2 && text.includes(token));
    })
    .map(template => template.id);
}

function lifecycleHealth(status: KnowledgeStatus, daysToExpire: number): KnowledgeOperationItem["lifecycleHealth"] {
  if (status === "archived") return "已归档";
  if (status === "deprecated" || daysToExpire < 0) return "已过期";
  if (daysToExpire <= 14) return "即将过期";
  if (status === "draft") return "待复核";
  return "正常";
}

function priorityFromItem(item: KnowledgeOperationItem): KnowledgeImpactPriority {
  if (item.lifecycleHealth === "已过期" || item.impactedModules.includes("PMO治理中心")) return "P0";
  if (item.lifecycleHealth === "即将过期" || item.linkedTemplates.length > 0) return "P1";
  return "P2";
}

function buildItem(document: RagDocument, now: Date): KnowledgeOperationItem {
  const effectiveAt = new Date(snapshot.generated_at);
  const reviewCycleDays = document.status === "published" ? 120 : document.status === "reviewed" ? 90 : 30;
  const expiresAtDate = addDays(effectiveAt, reviewCycleDays);
  const daysToExpire = daysBetween(now, expiresAtDate);
  const impactedModules = inferImpactedModules(document);
  const templates = linkedTemplates(document);
  const health = lifecycleHealth(document.status, daysToExpire);

  return {
    pageId: document.page_id,
    title: document.title,
    type: document.type,
    status: document.status,
    domains: document.domains,
    tags: document.tags,
    owner: inferOwner(document),
    version: `${snapshot.index_version}.${document.page_id}`,
    sourceRefs: document.source_refs,
    confidentiality: document.confidentiality,
    effectiveAt: isoDate(effectiveAt),
    expiresAt: isoDate(expiresAtDate),
    daysToExpire,
    lifecycleHealth: health,
    impactedModules,
    linkedTemplates: templates,
    changeSummary: `${document.title} 当前为 ${document.status}，影响 ${impactedModules.join("、")}；${templates.length > 0 ? `关联模板 ${templates.join("、")}。` : "暂无模板关联。"}`,
    reviewOutput: health === "正常" ? "保持发布/评审状态，并在到期前复核适用性。" : "输出复核结论、版本变更摘要和受影响模块处理意见。",
  };
}

function buildImpactModules(items: KnowledgeOperationItem[]): KnowledgeImpactModule[] {
  const groups = new Map<string, KnowledgeOperationItem[]>();
  for (const item of items) {
    for (const moduleName of item.impactedModules) {
      groups.set(moduleName, [...(groups.get(moduleName) ?? []), item]);
    }
  }
  return [...groups.entries()]
    .map(([moduleName, group]) => {
      const hasExpired = group.some(item => ["已过期", "即将过期"].includes(item.lifecycleHealth));
      const hasGovernance = moduleName.includes("治理") || moduleName.includes("报告") || moduleName.includes("风险");
      const priority: KnowledgeImpactPriority = hasExpired || moduleName === "PMO治理中心" ? "P0" : hasGovernance ? "P1" : "P2";
      return {
        module: moduleName,
        documentCount: group.length,
        priority,
        reason: hasExpired ? "存在过期或即将过期知识，模块输出需要复核。" : "模块引用知识较多，需在知识变更后复核输出口径。",
        documents: group.slice(0, 6).map(item => ({ pageId: item.pageId, title: item.title, status: item.status })),
      };
    })
    .sort((a, b) => a.priority.localeCompare(b.priority) || b.documentCount - a.documentCount);
}

function buildLifecycleActions(items: KnowledgeOperationItem[], now: Date): KnowledgeLifecycleAction[] {
  return items
    .filter(item => item.lifecycleHealth !== "正常" || item.impactedModules.length >= 3 || item.linkedTemplates.length > 0)
    .slice(0, 12)
    .map(item => ({
      id: `knowledge-review-${item.pageId}`,
      title: `复核知识条目：${item.title}`,
      owner: item.owner,
      dueDate: item.lifecycleHealth === "已过期" ? isoDate(addDays(now, 3)) : isoDate(addDays(now, 14)),
      priority: priorityFromItem(item),
      sourceDocumentId: item.pageId,
      action: "确认知识是否仍适用，补充版本变更摘要，并检查受影响模块输出。",
      output: item.reviewOutput,
    }));
}

function buildTemplateDirectory(items: KnowledgeOperationItem[]): KnowledgeTemplateDirectoryItem[] {
  return templateCatalog.map(template => {
    const linkedKnowledgeIds = items
      .filter(item => item.linkedTemplates.includes(template.id))
      .map(item => item.pageId);
    return {
      id: template.id,
      title: template.title,
      category: template.category,
      source: template.source,
      linkedKnowledgeIds,
      lifecycleStatus: linkedKnowledgeIds.length > 0 ? "已关联" : "待关联",
    };
  });
}

export function buildKnowledgeOperationDashboard(now: Date = new Date()): KnowledgeOperationDashboard {
  const items = snapshot.documents.map(document => buildItem(document, now));
  const summary = {
    total: items.length,
    draft: items.filter(item => item.status === "draft").length,
    reviewed: items.filter(item => item.status === "reviewed").length,
    published: items.filter(item => item.status === "published").length,
    deprecated: items.filter(item => item.status === "deprecated").length,
    archived: items.filter(item => item.status === "archived").length,
    expiringSoon: items.filter(item => item.lifecycleHealth === "即将过期").length,
    needsReview: items.filter(item => item.lifecycleHealth !== "正常").length,
    affectedModules: new Set(items.flatMap(item => item.impactedModules)).size,
    linkedTemplates: new Set(items.flatMap(item => item.linkedTemplates)).size,
  };

  return {
    generatedAt: new Date().toISOString(),
    indexVersion: snapshot.index_version,
    summary,
    items,
    impactModules: buildImpactModules(items),
    lifecycleActions: buildLifecycleActions(items, now),
    templateDirectory: buildTemplateDirectory(items),
    boundary: "当前为运行时知识运营视图，基于已发布 RAG 快照和模板目录派生；不会自动修改知识条目、模板或业务数据，复核与发布仍需人工确认。",
  };
}
