import { governanceWorkflows, type GovernanceWorkflow } from "../pmo-operating-system.ts";

export type GovernanceStrategyPriority = "high" | "medium" | "low";
export type GovernanceStrategyStatus = "ready" | "needs_input";

export interface GovernanceStrategyInput {
  projectName?: string;
  projectLevel?: string;
  projectType?: string;
  riskLevel?: string;
  isKeyProject?: boolean;
  currentStage?: string;
}

export interface GovernanceStrategyRecommendation {
  strategyVersion: string;
  ruleId: string;
  ruleName: string;
  governanceLevel: string;
  primaryWorkflowId: string;
  recommendedWorkflowIds: string[];
  owner: string;
  approver: string;
  priority: GovernanceStrategyPriority;
  deadlineDays: number;
  deadlineDate: string;
  requiredInputs: string[];
  expectedOutputs: string[];
  sla: string;
  reasons: string[];
  creationDefaults: {
    workflowId: string;
    projectName: string;
    title: string;
    owner: string;
    approver: string;
    priority: GovernanceStrategyPriority;
    deadline: string;
    triggerSummary: string;
    inputSummary: string;
    actionItems: string;
    strategyVersion: string;
    strategyRuleId: string;
    strategySummary: string;
  };
}

export interface GovernanceStrategyPreview {
  status: GovernanceStrategyStatus;
  strategy: {
    version: string;
    name: string;
    effectiveDate: string;
    historyBoundary: string;
  };
  input: {
    projectName: string;
    projectLevel: string;
    projectType: string;
    riskLevel: string;
    isKeyProject: boolean;
    currentStage: string;
  };
  blockers: string[];
  warnings: string[];
  recommendation: GovernanceStrategyRecommendation | null;
  catalog: {
    levels: Array<{ value: string; label: string; governance: string }>;
    riskLevels: string[];
    stages: string[];
    workflows: Array<Pick<GovernanceWorkflow, "id" | "name" | "stage" | "owner" | "approver">>;
  };
}

interface GovernanceStrategyRule {
  id: string;
  name: string;
  governanceLevel: string;
  projectLevels?: string[];
  riskLevels?: string[];
  keyProject?: boolean;
  stageKeywords?: string[];
  typeKeywords?: string[];
  primaryWorkflowId: string;
  recommendedWorkflowIds: string[];
  owner: string;
  approver: string;
  priority: GovernanceStrategyPriority;
  deadlineDays: number;
  extraRequiredInputs: string[];
  extraExpectedOutputs: string[];
  sla: string;
  reasons: string[];
}

export const GOVERNANCE_STRATEGY_VERSION = "GOV-STRATEGY-2026.07.03";
export const GOVERNANCE_STRATEGY_NAME = "PMO项目分层治理策略";

const levels = [
  { value: "S", label: "S级 / 战略级 / 重点经营项目", governance: "强阶段门 + 项目委员会决策 + 1-2天SLA" },
  { value: "A", label: "A级 / 重点交付项目", governance: "标准阶段门 + PMO强管控 + 2-3天SLA" },
  { value: "B", label: "B级 / 常规交付项目", governance: "关键节点阶段门 + PMO抽检 + 3-5天SLA" },
  { value: "C", label: "C级 / 轻量项目", governance: "轻量治理 + 责任人闭环 + 5天SLA" },
];

const strategyRules: GovernanceStrategyRule[] = [
  {
    id: "closure-controlled",
    name: "收尾验收强制归档策略",
    governanceLevel: "收尾强治理",
    stageKeywords: ["收尾", "验收", "归档"],
    primaryWorkflowId: "project-closure",
    recommendedWorkflowIds: ["project-closure", "stage-gate-review"],
    owner: "项目经理",
    approver: "客户/业务负责人/PMO",
    priority: "high",
    deadlineDays: 2,
    extraRequiredInputs: ["验收材料索引", "合同/回款状态", "遗留问题清单", "经验教训草稿"],
    extraExpectedOutputs: ["验收结论", "归档清单", "复盘报告", "回款跟进事项"],
    sla: "交付完成后2天内完成验收发起；有遗留问题时必须形成整改行动项。",
    reasons: ["当前阶段已进入收尾/验收，治理动作应优先确保验收、归档和回款闭环。"],
  },
  {
    id: "s-key-high-risk",
    name: "S级/重点/高风险强阶段门策略",
    governanceLevel: "强治理",
    projectLevels: ["S"],
    riskLevels: ["高"],
    keyProject: true,
    primaryWorkflowId: "stage-gate-review",
    recommendedWorkflowIds: ["project-initiation-review", "stage-gate-review", "risk-escalation", "change-control", "project-closure"],
    owner: "项目经理/风险责任人",
    approver: "PMO/项目委员会",
    priority: "high",
    deadlineDays: 1,
    extraRequiredInputs: ["项目等级依据", "重点项目标记依据", "高风险触发证据", "阶段基线偏差说明", "项目委员会决策议题"],
    extraExpectedOutputs: ["阶段门结论", "风险升级结论", "项目委员会决议", "整改行动项和deadline"],
    sla: "高风险触发后1天内完成升级评审，下一阶段授权前必须完成阶段门。",
    reasons: ["项目等级为S级、被标记为重点项目且风险等级为高，必须走强阶段门和风险升级闭环。"],
  },
  {
    id: "s-level-governance",
    name: "S级项目强阶段门策略",
    governanceLevel: "强治理",
    projectLevels: ["S"],
    primaryWorkflowId: "stage-gate-review",
    recommendedWorkflowIds: ["project-initiation-review", "stage-gate-review", "change-control", "project-closure"],
    owner: "项目经理",
    approver: "PMO/项目委员会",
    priority: "high",
    deadlineDays: 2,
    extraRequiredInputs: ["商业论证", "预算/收益假设", "阶段成果证据", "风险问题清单", "下一阶段计划"],
    extraExpectedOutputs: ["立项/阶段门结论", "下一阶段授权", "基线调整记录", "治理审计包"],
    sla: "关键阶段门应在计划阶段结束前2天发起，PMO需跟踪整改项关闭。",
    reasons: ["S级项目对战略和经营影响较高，应纳入强阶段门治理。"],
  },
  {
    id: "a-level-governance",
    name: "A级项目标准阶段门策略",
    governanceLevel: "标准治理",
    projectLevels: ["A"],
    primaryWorkflowId: "stage-gate-review",
    recommendedWorkflowIds: ["project-initiation-review", "stage-gate-review", "change-control", "project-closure"],
    owner: "项目经理",
    approver: "PMO/业务负责人",
    priority: "medium",
    deadlineDays: 3,
    extraRequiredInputs: ["阶段成果", "进度/成本/质量数据", "风险问题清单", "下一阶段计划"],
    extraExpectedOutputs: ["阶段门结论", "整改行动项", "下一阶段授权"],
    sla: "提交后3天内完成评审；重大变更进入变更控制委员会。",
    reasons: ["A级项目需要标准PMO阶段门，以保证进度、成本、质量和风险口径一致。"],
  },
  {
    id: "high-risk-governance",
    name: "高风险项目升级策略",
    governanceLevel: "风险强治理",
    riskLevels: ["高"],
    primaryWorkflowId: "risk-escalation",
    recommendedWorkflowIds: ["risk-escalation", "stage-gate-review"],
    owner: "风险责任人",
    approver: "PMO/项目负责人",
    priority: "high",
    deadlineDays: 1,
    extraRequiredInputs: ["风险登记记录", "触发证据", "影响评估", "应对建议", "升级边界说明"],
    extraExpectedOutputs: ["升级结论", "应急计划", "责任人和deadline"],
    sla: "高风险触发后1天内升级，关闭前必须保留复核证据。",
    reasons: ["风险等级为高，优先触发风险升级治理，避免只在项目卡片中展示风险而不闭环。"],
  },
  {
    id: "b-level-governance",
    name: "B级项目关键节点策略",
    governanceLevel: "关键节点治理",
    projectLevels: ["B"],
    primaryWorkflowId: "stage-gate-review",
    recommendedWorkflowIds: ["stage-gate-review", "project-closure"],
    owner: "项目经理",
    approver: "PMO/项目负责人",
    priority: "medium",
    deadlineDays: 5,
    extraRequiredInputs: ["关键里程碑成果", "风险问题清单", "下一步计划"],
    extraExpectedOutputs: ["关键节点确认", "整改行动项", "验收/归档清单"],
    sla: "关键里程碑前5天内补齐阶段门材料，PMO抽检关键证据。",
    reasons: ["B级项目采用关键节点治理，降低流程负担但保留阶段证据。"],
  },
  {
    id: "c-level-governance",
    name: "C级项目轻量闭环策略",
    governanceLevel: "轻量治理",
    projectLevels: ["C"],
    primaryWorkflowId: "project-initiation-review",
    recommendedWorkflowIds: ["project-initiation-review", "project-closure"],
    owner: "项目经理",
    approver: "项目负责人/PMO抽检",
    priority: "low",
    deadlineDays: 5,
    extraRequiredInputs: ["项目申请信息", "关键干系人", "交付范围摘要", "收尾验收材料"],
    extraExpectedOutputs: ["立项确认", "验收归档清单"],
    sla: "轻量项目以责任人闭环为主，PMO按抽检节奏复核。",
    reasons: ["C级项目不应套用重流程，重点是输入完整、责任清晰和收尾归档。"],
  },
];

function normalizeText(value?: string): string {
  return String(value ?? "").trim();
}

function normalizeProjectLevel(value?: string): string {
  const text = normalizeText(value).toUpperCase();
  const match = text.match(/[SABC]/);
  return match?.[0] ?? "";
}

function normalizeRiskLevel(value?: string): string {
  const text = normalizeText(value);
  if (!text) return "";
  if (/高|重大|严重|红/.test(text)) return "高";
  if (/低|轻微|绿/.test(text)) return "低";
  return "中";
}

function normalizeStage(value?: string): string {
  const text = normalizeText(value);
  if (/收尾|验收|归档/.test(text)) return "收尾";
  if (/监控|监督|跟踪/.test(text)) return "监控";
  if (/执行|交付|实施/.test(text)) return "执行";
  if (/规划|计划/.test(text)) return "规划";
  if (/启动|立项/.test(text)) return "启动";
  return text;
}

function dedupe(values: string[]): string[] {
  return Array.from(new Set(values.map(item => item.trim()).filter(Boolean)));
}

function workflowInputs(ids: string[]): string[] {
  return dedupe(ids.flatMap(id => governanceWorkflows.find(workflow => workflow.id === id)?.inputs ?? []));
}

function workflowOutputs(ids: string[]): string[] {
  return dedupe(ids.flatMap(id => governanceWorkflows.find(workflow => workflow.id === id)?.outputs ?? []));
}

function workflowName(id: string): string {
  return governanceWorkflows.find(workflow => workflow.id === id)?.name ?? id;
}

function addDays(baseDate: Date, days: number): string {
  const date = new Date(baseDate);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function ruleMatches(rule: GovernanceStrategyRule, input: GovernanceStrategyPreview["input"]): boolean {
  if (rule.projectLevels && !rule.projectLevels.includes(input.projectLevel)) return false;
  if (rule.riskLevels && !rule.riskLevels.includes(input.riskLevel)) return false;
  if (typeof rule.keyProject === "boolean" && rule.keyProject !== input.isKeyProject) return false;
  if (rule.stageKeywords && !rule.stageKeywords.some(keyword => input.currentStage.includes(keyword))) return false;
  if (rule.typeKeywords && !rule.typeKeywords.some(keyword => input.projectType.includes(keyword))) return false;
  return true;
}

function findRule(input: GovernanceStrategyPreview["input"]): GovernanceStrategyRule {
  return strategyRules.find(rule => ruleMatches(rule, input)) ?? strategyRules.find(rule => rule.id === "b-level-governance")!;
}

export function evaluateGovernanceStrategy(rawInput: GovernanceStrategyInput, options?: { baseDate?: Date }): GovernanceStrategyPreview {
  const input = {
    projectName: normalizeText(rawInput.projectName),
    projectLevel: normalizeProjectLevel(rawInput.projectLevel),
    projectType: normalizeText(rawInput.projectType),
    riskLevel: normalizeRiskLevel(rawInput.riskLevel),
    isKeyProject: Boolean(rawInput.isKeyProject),
    currentStage: normalizeStage(rawInput.currentStage),
  };

  const blockers = [
    input.projectLevel ? "" : "请先补充项目等级（S/A/B/C），系统不会在等级缺失时静默套用默认治理策略。",
    input.projectType ? "" : "请先补充项目类型，便于判断是否需要变更控制、阶段门或轻量治理。",
    input.riskLevel ? "" : "请先补充风险等级（高/中/低），高风险会触发风险升级治理。",
  ].filter(Boolean);
  const warnings = [
    input.projectName ? "" : "未填写项目名称；可以先预览策略，但带入创建流程前需要补齐项目名称。",
    input.currentStage ? "" : "未填写当前阶段；系统将主要依据项目等级和风险等级推荐治理动作。",
  ].filter(Boolean);

  const catalog = {
    levels,
    riskLevels: ["高", "中", "低"],
    stages: ["启动", "规划", "执行", "监控", "收尾"],
    workflows: governanceWorkflows.map(({ id, name, stage, owner, approver }) => ({ id, name, stage, owner, approver })),
  };
  const strategy = {
    version: GOVERNANCE_STRATEGY_VERSION,
    name: GOVERNANCE_STRATEGY_NAME,
    effectiveDate: "2026-07-03",
    historyBoundary: "策略版本只影响新建流程推荐；历史治理流程和已生成审计包不自动改写。",
  };

  if (blockers.length > 0) {
    return {
      status: "needs_input",
      strategy,
      input,
      blockers,
      warnings,
      recommendation: null,
      catalog,
    };
  }

  const matchedRule = findRule(input);
  const recommendedWorkflowIds = dedupe(matchedRule.recommendedWorkflowIds);
  const requiredInputs = dedupe([...workflowInputs(recommendedWorkflowIds), ...matchedRule.extraRequiredInputs]);
  const expectedOutputs = dedupe([...workflowOutputs(recommendedWorkflowIds), ...matchedRule.extraExpectedOutputs]);
  const deadlineDate = addDays(options?.baseDate ?? new Date(), matchedRule.deadlineDays);
  const primaryWorkflow = governanceWorkflows.find(workflow => workflow.id === matchedRule.primaryWorkflowId);
  const projectName = input.projectName || "待补充项目名称";
  const strategySummary = [
    `${GOVERNANCE_STRATEGY_VERSION}｜${matchedRule.name}`,
    `治理强度：${matchedRule.governanceLevel}`,
    `推荐流程：${recommendedWorkflowIds.map(workflowName).join("、")}`,
    `依据：${matchedRule.reasons.join("；")}`,
    strategy.historyBoundary,
  ].join("\n");

  return {
    status: "ready",
    strategy,
    input,
    blockers,
    warnings,
    recommendation: {
      strategyVersion: GOVERNANCE_STRATEGY_VERSION,
      ruleId: matchedRule.id,
      ruleName: matchedRule.name,
      governanceLevel: matchedRule.governanceLevel,
      primaryWorkflowId: matchedRule.primaryWorkflowId,
      recommendedWorkflowIds,
      owner: matchedRule.owner,
      approver: matchedRule.approver,
      priority: matchedRule.priority,
      deadlineDays: matchedRule.deadlineDays,
      deadlineDate,
      requiredInputs,
      expectedOutputs,
      sla: matchedRule.sla,
      reasons: matchedRule.reasons,
      creationDefaults: {
        workflowId: matchedRule.primaryWorkflowId,
        projectName: input.projectName,
        title: `${projectName}-${primaryWorkflow?.name ?? "治理流程"}`,
        owner: matchedRule.owner,
        approver: matchedRule.approver,
        priority: matchedRule.priority,
        deadline: deadlineDate,
        triggerSummary: strategySummary,
        inputSummary: `策略推荐必填输入：\n${requiredInputs.map(item => `- ${item}`).join("\n")}`,
        actionItems: `补齐治理输入材料 | ${matchedRule.owner} | ${deadlineDate}`,
        strategyVersion: GOVERNANCE_STRATEGY_VERSION,
        strategyRuleId: matchedRule.id,
        strategySummary,
      },
    },
    catalog,
  };
}

export function listGovernanceStrategyCatalog() {
  return {
    version: GOVERNANCE_STRATEGY_VERSION,
    name: GOVERNANCE_STRATEGY_NAME,
    effectiveDate: "2026-07-03",
    historyBoundary: "策略版本只影响新建流程推荐；历史治理流程和已生成审计包不自动改写。",
    levels,
    rules: strategyRules.map(rule => ({
      id: rule.id,
      name: rule.name,
      governanceLevel: rule.governanceLevel,
      projectLevels: rule.projectLevels ?? [],
      riskLevels: rule.riskLevels ?? [],
      keyProject: rule.keyProject ?? null,
      primaryWorkflowId: rule.primaryWorkflowId,
      recommendedWorkflowIds: rule.recommendedWorkflowIds,
      priority: rule.priority,
      deadlineDays: rule.deadlineDays,
      sla: rule.sla,
    })),
    workflows: governanceWorkflows.map(({ id, name, stage, owner, approver }) => ({ id, name, stage, owner, approver })),
  };
}
