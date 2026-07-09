import type { AppUser } from "../auth/server.ts";
import type { KnowledgeOutputType, KnowledgeOutputReferenceMutationResult } from "./lifecycle-repository.ts";
import type { KnowledgeOperationDashboard, KnowledgeOperationItem } from "./operations.ts";

export type DeepKnowledgeReferenceSource =
  | "governance_workflow"
  | "risk_management"
  | "planning_workflow"
  | "migration_cutover"
  | "feishu_confirmation"
  | "report_factory";

export interface DeepKnowledgeReferenceCandidate {
  id: string;
  source: DeepKnowledgeReferenceSource;
  outputType: KnowledgeOutputType;
  outputId: string;
  outputTitle: string;
  moduleName: string;
  pageId: string;
  citationText: string;
  confidence: number;
  trigger: string;
  input: string;
  output: string;
  owner: string;
  nextAction: string;
  autoPersistRecommended: boolean;
}

export interface DeepKnowledgeReferencePlan {
  generatedAt: string;
  summary: {
    candidates: number;
    autoPersistRecommended: number;
    governanceOutputs: number;
    riskOutputs: number;
    planningOutputs: number;
    migrationOutputs: number;
    feishuOutputs: number;
    reportOutputs: number;
  };
  candidates: DeepKnowledgeReferenceCandidate[];
  boundary: string;
}

export interface DeepKnowledgeReferencePersistResult {
  status: "succeeded" | "partial" | "not_configured" | "failed";
  created: number;
  skipped: number;
  failed: number;
  results: Array<{
    candidateId: string;
    status: KnowledgeOutputReferenceMutationResult["status"];
    referenceId?: string;
    warning?: string;
    migration?: string;
  }>;
  warning?: string;
  migration?: string;
  requestId: string;
}

const sourceWeights: Record<DeepKnowledgeReferenceSource, number> = {
  governance_workflow: 1,
  risk_management: 2,
  planning_workflow: 3,
  migration_cutover: 4,
  feishu_confirmation: 5,
  report_factory: 6,
};

function normalize(value: string): string {
  return value.replace(/\s/g, "").toLowerCase();
}

function findKnowledgeItem(
  dashboard: KnowledgeOperationDashboard,
  patterns: RegExp[],
  moduleName: string,
): KnowledgeOperationItem {
  const candidates = dashboard.items.filter(item => {
    const text = [
      item.pageId,
      item.title,
      item.type,
      ...item.domains,
      ...item.tags,
      ...item.impactedModules,
      ...item.linkedTemplates,
      item.changeSummary,
    ].join(" ");
    return patterns.some(pattern => pattern.test(text));
  });
  return candidates[0]
    ?? dashboard.items.find(item => item.impactedModules.some(module => normalize(module) === normalize(moduleName)))
    ?? dashboard.items[0];
}

function candidate(input: {
  dashboard: KnowledgeOperationDashboard;
  source: DeepKnowledgeReferenceSource;
  outputType: KnowledgeOutputType;
  outputId: string;
  outputTitle: string;
  moduleName: string;
  patterns: RegExp[];
  trigger: string;
  input: string;
  output: string;
  nextAction: string;
  confidence: number;
  autoPersistRecommended?: boolean;
}): DeepKnowledgeReferenceCandidate {
  const item = findKnowledgeItem(input.dashboard, input.patterns, input.moduleName);
  return {
    id: `${input.source}:${input.outputId}:${item.pageId}`,
    source: input.source,
    outputType: input.outputType,
    outputId: input.outputId,
    outputTitle: input.outputTitle,
    moduleName: input.moduleName,
    pageId: item.pageId,
    citationText: [
      `深层输出「${input.outputTitle}」引用知识条目「${item.title}」(${item.pageId})。`,
      `触发：${input.trigger}`,
      `输入：${input.input}`,
      `输出：${input.output}`,
    ].join("\n"),
    confidence: input.confidence,
    trigger: input.trigger,
    input: input.input,
    output: input.output,
    owner: item.owner,
    nextAction: input.nextAction,
    autoPersistRecommended: input.autoPersistRecommended ?? true,
  };
}

function uniqueById(candidates: DeepKnowledgeReferenceCandidate[]): DeepKnowledgeReferenceCandidate[] {
  const seen = new Set<string>();
  return candidates.filter(item => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

export function buildDeepKnowledgeReferencePlan(dashboard: KnowledgeOperationDashboard, now = new Date()): DeepKnowledgeReferencePlan {
  const candidates = uniqueById([
    candidate({
      dashboard,
      source: "governance_workflow",
      outputType: "governance",
      outputId: "governance-business-impact-writeback",
      outputTitle: "治理流程业务联动与反写建议",
      moduleName: "PMO治理中心",
      patterns: [/PMO|治理|阶段门|审批|成熟度/i],
      trigger: "治理流程状态流转、阶段门评审、变更控制或风险升级产生业务联动建议。",
      input: "治理流程实例、审批意见、SLA、行动项和当前状态。",
      output: "项目台账/风险登记册/报告工厂的联动事实与人工确认写回包。",
      nextAction: "在治理中心确认反写待办后，再进入飞书写入确认队列或统一行动项。",
      confidence: 0.88,
    }),
    candidate({
      dashboard,
      source: "risk_management",
      outputType: "risk",
      outputId: "risk-register-integration-and-governance",
      outputTitle: "风险登记册联动、敏感性分析与组织级治理",
      moduleName: "风险管理",
      patterns: [/风险|复盘|预警|敏感性|登记册/i],
      trigger: "风险识别、分析、应对、监督、关闭和复盘资产治理产生跨模块结论。",
      input: "风险登记册、项目台账、敏感性分析、关闭证据、复盘资产和治理待办。",
      output: "风险对项目健康、任务、里程碑、回款、治理流程和报告事实的联动包。",
      nextAction: "高风险或逾期风险需由责任人补齐 deadline、证据和应对进展，PMO 做二次治理。",
      confidence: 0.9,
    }),
    candidate({
      dashboard,
      source: "planning_workflow",
      outputType: "other",
      outputId: "planning-new-or-mid-project-workflow",
      outputTitle: "规划中心新项目/中途接手项目工作流输出",
      moduleName: "规划中心",
      patterns: [/规划|接手|WBS|计划|模板|新项目|中途/i],
      trigger: "项目经理通过规划中心完成新项目接手、中途接手、WBS、资源计划或管理计划生成。",
      input: "项目背景、范围边界、WBS、干系人、风险、资源、沟通和里程碑信息。",
      output: "项目管理计划、WBS字典、资源计划、风险管理计划和后续跟踪动作。",
      nextAction: "规划输出应同步到项目组合看板、执行交付、监控中心和报告工厂，并保留知识来源。",
      confidence: 0.82,
    }),
    candidate({
      dashboard,
      source: "migration_cutover",
      outputType: "report",
      outputId: "migration-scale-readiness-cutover",
      outputTitle: "竞品迁移规模化准备度与Go/No-Go决策包",
      moduleName: "迁移与数据接入中心",
      patterns: [/迁移|字段|模板|导入|数据|竞品/i],
      trigger: "迁移批次、字段映射、整改行动项、人工确认和切换检查形成正式迁移证据。",
      input: "迁移成熟度、字段映射方案、多轮试迁移、整改关闭率、权限和飞书写入验证。",
      output: "规模化迁移准备度、切换阻断项、迁移评审报告和签字归档包。",
      nextAction: "在正式切换前完成两轮以上试迁移、字段冻结、权限抽查、回滚预案和业务签字。",
      confidence: 0.84,
    }),
    candidate({
      dashboard,
      source: "feishu_confirmation",
      outputType: "other",
      outputId: "feishu-action-confirmation-business-form",
      outputTitle: "业务表单级飞书写入确认记录",
      moduleName: "飞书集成中心",
      patterns: [/飞书|集成|协作|通知|任务|文档/i],
      trigger: "业务页面需要创建飞书任务、文档、消息或日程时，不直接写入，先生成确认记录。",
      input: "业务页面名称、动作摘要、目标对象、写入内容、风险等级和申请人。",
      output: "待确认飞书写入队列记录、风险复核清单、二次确认和执行审计。",
      nextAction: "申请人在业务页发起确认记录，管理员或申请人到集成中心复核后执行。",
      confidence: 0.8,
    }),
    candidate({
      dashboard,
      source: "report_factory",
      outputType: "report",
      outputId: "report-factory-cross-module-evidence",
      outputTitle: "报告工厂跨模块证据串联",
      moduleName: "报告工厂",
      patterns: [/报告|月报|周报|审计|知识|AI/i],
      trigger: "报告工厂生成周报、月报、审计包或状态摘要时需要引用具体业务和知识来源。",
      input: "项目台账、风险联动、治理流程、迁移决策包、知识引用链和AI依据审计。",
      output: "可下载报告、依据清单、知识引用链、待办动作和审计事实。",
      nextAction: "报告输出继续自动写入知识引用链，并在报告中暴露可追溯依据。",
      confidence: 0.86,
    }),
  ]).sort((a, b) => sourceWeights[a.source] - sourceWeights[b.source]);

  return {
    generatedAt: now.toISOString(),
    summary: {
      candidates: candidates.length,
      autoPersistRecommended: candidates.filter(item => item.autoPersistRecommended).length,
      governanceOutputs: candidates.filter(item => item.source === "governance_workflow").length,
      riskOutputs: candidates.filter(item => item.source === "risk_management").length,
      planningOutputs: candidates.filter(item => item.source === "planning_workflow").length,
      migrationOutputs: candidates.filter(item => item.source === "migration_cutover").length,
      feishuOutputs: candidates.filter(item => item.source === "feishu_confirmation").length,
      reportOutputs: candidates.filter(item => item.source === "report_factory").length,
    },
    candidates,
    boundary: "深层引用链只记录业务输出与知识版本的关系，不替代业务审批；如果 Supabase 未同步知识生命周期快照，写入会提示先同步，不会静默丢失。",
  };
}

export async function persistDeepKnowledgeOutputReferences(input: {
  plan: DeepKnowledgeReferencePlan;
  candidateIds?: string[];
  user: AppUser | null;
  requestId: string;
}): Promise<DeepKnowledgeReferencePersistResult> {
  const selected = new Set(input.candidateIds?.filter(Boolean) ?? []);
  const candidates = input.plan.candidates.filter(item => selected.size === 0 ? item.autoPersistRecommended : selected.has(item.id));
  const results: DeepKnowledgeReferencePersistResult["results"] = [];
  const { createKnowledgeOutputReference } = await import("./lifecycle-repository.ts");

  for (const item of candidates) {
    const result = await createKnowledgeOutputReference({
      outputType: item.outputType,
      outputId: item.outputId,
      outputTitle: item.outputTitle,
      moduleName: item.moduleName,
      pageId: item.pageId,
      citationText: item.citationText,
      confidence: item.confidence,
      user: input.user,
      requestId: input.requestId,
    });
    results.push({
      candidateId: item.id,
      status: result.status,
      referenceId: result.status === "succeeded" ? result.reference.id : undefined,
      warning: "warning" in result ? result.warning : undefined,
      migration: "migration" in result ? result.migration : undefined,
    });
  }

  const created = results.filter(item => item.status === "succeeded").length;
  const skipped = candidates.length - results.length;
  const failed = results.filter(item => item.status === "failed" || item.status === "not_found").length;
  const notConfigured = results.find(item => item.status === "not_configured");

  if (notConfigured && created === 0) {
    return {
      status: "not_configured",
      created,
      skipped,
      failed,
      results,
      warning: notConfigured.warning,
      migration: notConfigured.migration,
      requestId: input.requestId,
    };
  }

  return {
    status: failed > 0 || results.some(item => item.status !== "succeeded") ? "partial" : "succeeded",
    created,
    skipped,
    failed,
    results,
    warning: failed > 0 ? "部分深层引用链写入失败，请查看 results 中的 warning。" : undefined,
    requestId: input.requestId,
  };
}
