import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/features/auth/server";
import { buildRiskScanEvidence, withAuditResult } from "@/features/ai/evidence";
import { persistAiEvidence } from "@/features/ai/evidence-repository";
import { authorizeRiskRequest, type RiskAccessScope } from "@/features/risk/access";
import { llmComplete, SYSTEM_PROMPTS } from "@/lib/llm";
import {
  calculateRiskPriority,
  calculateRiskScore,
  riskChecklistItems,
  type LinkedModule,
  type Risk,
  type RiskCategory,
  type RiskImpactArea,
  type RiskStage,
  type RiskStrategy,
} from "@/lib/risk";

interface AnalyzeInput {
  projectDescription: string;
  projectName?: string;
  stage?: RiskStage;
}

interface AIParsedRisk {
  description: string;
  category?: string;
  stage?: string;
  probability: number;
  impact: number;
  urgency?: number;
  impactArea?: string;
  responseStrategyType?: string;
  mitigation: string;
  preventiveAction?: string;
  contingencyPlan?: string;
  trigger?: string;
  owner?: string;
  trackingMethod?: string;
  closingCriteria?: string;
  linkedModule?: string;
}

const categories: RiskCategory[] = ["商业", "客户", "供应商", "计划编制", "组织管理", "开发实施环境", "过程", "设计实现", "人员资源", "外部环境", "产品", "需求", "技术", "质量", "合同", "财务", "进度", "管理"];
const impactAreas: RiskImpactArea[] = ["范围", "费用", "工期", "质量", "组织", "技术", "合同", "回款", "客户", "供应商"];
const strategies: RiskStrategy[] = ["规避", "缓解", "转移", "接受", "上报"];
const modules: LinkedModule[] = ["项目组合看板", "立项", "规划", "执行", "监控", "收尾", "合同回款", "质量", "资源"];
const stages: RiskStage[] = ["立项", "规划", "执行", "监控", "验收", "结项", "全生命周期"];

function clampScale(value: unknown, fallback = 3): 1 | 2 | 3 | 4 | 5 {
  const parsed = Math.round(Number(value));
  return Math.min(5, Math.max(1, Number.isFinite(parsed) ? parsed : fallback)) as 1 | 2 | 3 | 4 | 5;
}

function pickOne<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  const text = String(value ?? "");
  return allowed.find(item => text.includes(item)) ?? fallback;
}

function inferCategory(text: string): RiskCategory {
  if (/客户|用户|验收|需求方|决策组/.test(text)) return "客户";
  if (/合同|回款|付款|尾款|商务/.test(text)) return "合同";
  if (/供应商|承包商|外包|采购/.test(text)) return "供应商";
  if (/计划|进度|延期|关键路径|工期/.test(text)) return "计划编制";
  if (/人员|资源|团队|组织|项目经理/.test(text)) return "人员资源";
  if (/质量|测试|缺陷|评审|验收/.test(text)) return "质量";
  if (/技术|接口|系统|集成|开发/.test(text)) return "技术";
  return "管理";
}

function inferImpactArea(text: string): RiskImpactArea {
  if (/回款|付款|尾款/.test(text)) return "回款";
  if (/合同|商务/.test(text)) return "合同";
  if (/进度|延期|关键路径|工期/.test(text)) return "工期";
  if (/成本|预算|费用/.test(text)) return "费用";
  if (/质量|测试|缺陷|验收/.test(text)) return "质量";
  if (/客户|用户|需求/.test(text)) return "客户";
  if (/供应商|采购|外包/.test(text)) return "供应商";
  if (/技术|接口|集成/.test(text)) return "技术";
  return "范围";
}

function dueDateByDays(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function buildRisk(item: Partial<AIParsedRisk>, index: number, input: AnalyzeInput, source: string): Risk {
  const description = String(item.description || "项目存在未明确的不确定性，需要进一步核查。");
  const category = pickOne(item.category, categories, inferCategory(description));
  const impactArea = pickOne(item.impactArea, impactAreas, inferImpactArea(description));
  const stage = pickOne(item.stage, stages, input.stage ?? "全生命周期");
  const responseStrategyType = pickOne(item.responseStrategyType, strategies, getDefaultStrategy(item.probability, item.impact));
  const probability = clampScale(item.probability);
  const impact = clampScale(item.impact);
  const urgency = clampScale(item.urgency, probability >= 4 || impact >= 4 ? 4 : 3);
  return {
    id: `AI-${Date.now()}-${index + 1}`,
    projectName: input.projectName?.trim() || "未指定项目",
    description,
    category,
    stage,
    source,
    impactArea,
    probability,
    impact,
    urgency,
    piScore: calculateRiskScore(probability, impact),
    priorityScore: calculateRiskPriority(probability, impact, urgency),
    status: "identified",
    responseStrategyType,
    responseStrategy: item.mitigation || "进入风险登记册后，由责任人补充应对策略。",
    preventiveAction: item.preventiveAction || item.mitigation || "补充预防措施，降低发生概率。",
    contingencyPlan: item.contingencyPlan || "若触发条件成立，召开风险评审并启动应急动作。",
    trigger: item.trigger || "风险条件连续出现或关键指标突破项目容差。",
    trackingMethod: item.trackingMethod || "在周会/监控中心按复核周期跟踪状态、趋势和责任人动作。",
    owner: item.owner || "项目经理",
    dueDate: dueDateByDays(14),
    nextReviewDate: dueDateByDays(7),
    closingCriteria: item.closingCriteria || "风险触发条件消除，或应对动作完成并经项目经理确认。",
    linkedModule: pickOne(item.linkedModule, modules, moduleByImpact(impactArea)),
    evidence: "由AI风险扫描生成，需要项目经理确认后生效。",
    workflowStep: "identify",
    currentInput: input.projectDescription.slice(0, 300),
    currentOutput: "候选风险已生成，待项目经理确认概率、影响、责任人和deadline。",
    lastAction: "确认风险线索并进入分析环节。",
    actionOwner: item.owner || "项目经理",
    actionDeadline: dueDateByDays(7),
    createdAt: new Date().toISOString().split("T")[0],
  };
}

function getDefaultStrategy(probability?: number, impact?: number): RiskStrategy {
  const p = Number(probability ?? 3);
  const i = Number(impact ?? 3);
  if (p >= 4 && i >= 4) return "上报";
  if (i >= 4) return "规避";
  return "缓解";
}

function moduleByImpact(area: RiskImpactArea): LinkedModule {
  if (area === "回款" || area === "合同") return "合同回款";
  if (area === "质量") return "质量";
  if (area === "工期") return "监控";
  if (area === "组织") return "资源";
  return "执行";
}

function buildRuleBasedRisks(input: AnalyzeInput): Risk[] {
  const text = input.projectDescription;
  const matched = riskChecklistItems.filter(item => (
    text.includes(item.category)
    || text.includes(item.stage)
    || item.question.split(/[，。？、]/).some(part => part.length >= 3 && text.includes(part.slice(0, 3)))
  ));
  const selected = (matched.length > 0 ? matched : riskChecklistItems).slice(0, 5);
  return selected.map((item, index) => buildRisk({
    description: `${item.riskSignal}：${item.question}`,
    category: item.category,
    stage: item.stage,
    probability: item.stage === input.stage ? 4 : 3,
    impact: item.linkedModule === "合同回款" || item.linkedModule === "监控" ? 4 : 3,
    urgency: item.stage === input.stage ? 4 : 3,
    impactArea: inferImpactArea(`${item.question}${item.riskSignal}`),
    responseStrategyType: "缓解",
    mitigation: `基于核查清单处理：${item.riskSignal}`,
    preventiveAction: `补齐${item.linkedModule}模块中的前置证据和责任人。`,
    trigger: item.question,
    linkedModule: item.linkedModule,
  }, index, input, "风险核查清单规则兜底"));
}

function applyRiskScope(risks: Risk[], scope: RiskAccessScope): Risk[] {
  const projectId = scope.requestedProjectId || (scope.projectIds.length === 1 ? scope.projectIds[0] : undefined);
  return risks.map(risk => ({
    ...risk,
    projectId,
    orgId: scope.orgId,
    dataClass: scope.dataClass,
  }));
}

export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID();
  const access = await authorizeRiskRequest(request, "create");
  if (!access.ok) {
    return NextResponse.json({ error: access.error, detail: access.detail }, {
      status: access.status,
      headers: { "Cache-Control": "no-store", "X-Request-Id": requestId },
    });
  }
  const user = await getCurrentUser();
  const auditMetadata = {
    route: "/api/risk/analyze",
    org_id: access.scope.orgId,
    project_id: access.scope.requestedProjectId || access.scope.projectIds[0] || null,
    data_class: access.scope.dataClass,
    business_role: access.scope.businessRole,
  };
  try {
    const input: AnalyzeInput = await request.json();
    const { projectDescription } = input;

    if (!projectDescription?.trim()) {
      return NextResponse.json({ error: "项目描述不能为空" }, { status: 400 });
    }

    let content = "";
    try {
      const result = await llmComplete(
        "risk",
        SYSTEM_PROMPTS.risk,
        `请分析以下项目描述，识别潜在风险并返回JSON数组格式：

项目描述：
${projectDescription}

要求：
1. 返回JSON数组，每项包含：description, category, stage, probability(1-5), impact(1-5), urgency(1-5), impactArea, responseStrategyType, mitigation, preventiveAction, contingencyPlan, trigger, owner, trackingMethod, closingCriteria, linkedModule
2. probability: 1=极低, 2=低, 3=中等, 4=高, 5=极高
3. impact: 1=轻微, 2=较小, 3=中等, 4=严重, 5=极严重
4. category必须从这些中文类别中选择：${categories.join("、")}
5. stage必须从这些中文阶段中选择：${stages.join("、")}
6. responseStrategyType必须从：${strategies.join("、")} 中选择
7. 识别5-8个主要风险
8. 只返回JSON数组，不要其他文字`
      );
      content = result.content || "";
    } catch {
      const fallbackRisks = applyRiskScope(buildRuleBasedRisks(input), access.scope);
      const evidence = buildRiskScanEvidence({
        projectName: input.projectName,
        stage: input.stage,
        description: projectDescription,
        riskCount: fallbackRisks.length,
        model: "rule-based-fallback",
        status: "fallback",
        reason: "AI风险扫描不可用，使用风险核查清单规则兜底。",
      });
      const audit = await persistAiEvidence({ evidence, user, requestId, metadata: auditMetadata });
      return NextResponse.json({
        request_id: requestId,
        risks: fallbackRisks,
        aiReasoning: "AI风险扫描不可用，已使用风险核查清单规则生成候选风险。",
        model: "rule-based-fallback",
        evidence: withAuditResult(evidence, audit.status === "succeeded" ? { status: "succeeded", id: audit.id } : { status: audit.status, warning: audit.warning }),
      });
    }

    // Parse JSON array from response
    const jsonMatch = content.match(/\[[\s\S]*?\]/);
    if (!jsonMatch) {
      const fallbackRisks = applyRiskScope(buildRuleBasedRisks(input), access.scope);
      const evidence = buildRiskScanEvidence({
        projectName: input.projectName,
        stage: input.stage,
        description: projectDescription,
        riskCount: fallbackRisks.length,
        model: "rule-based-fallback",
        status: "fallback",
        reason: "AI返回格式不符合登记册字段要求，使用风险核查清单规则兜底。",
      });
      const audit = await persistAiEvidence({ evidence, user, requestId, metadata: { ...auditMetadata, parse_error: "missing_json_array" } });
      return NextResponse.json({
        request_id: requestId,
        risks: fallbackRisks,
        aiReasoning: "AI返回格式不符合登记册字段要求，已使用风险核查清单规则生成候选风险。",
        model: "rule-based-fallback",
        evidence: withAuditResult(evidence, audit.status === "succeeded" ? { status: "succeeded", id: audit.id } : { status: audit.status, warning: audit.warning }),
      });
    }

    let parsed: AIParsedRisk[];
    try {
      parsed = JSON.parse(jsonMatch[0]) as AIParsedRisk[];
    } catch {
      const fallbackRisks = applyRiskScope(buildRuleBasedRisks(input), access.scope);
      const evidence = buildRiskScanEvidence({
        projectName: input.projectName,
        stage: input.stage,
        description: projectDescription,
        riskCount: fallbackRisks.length,
        model: "rule-based-fallback",
        status: "fallback",
        reason: "AI返回JSON片段无法解析，使用风险核查清单规则兜底。",
      });
      const audit = await persistAiEvidence({ evidence, user, requestId, metadata: { ...auditMetadata, parse_error: "invalid_json" } });
      return NextResponse.json({
        request_id: requestId,
        risks: fallbackRisks,
        aiReasoning: "AI返回JSON片段无法解析，已使用风险核查清单规则生成候选风险。",
        model: "rule-based-fallback",
        evidence: withAuditResult(evidence, audit.status === "succeeded" ? { status: "succeeded", id: audit.id } : { status: audit.status, warning: audit.warning }),
      });
    }
    const risks: Risk[] = applyRiskScope(parsed.map((item, index) => buildRisk(item, index, input, "AI风险扫描")), access.scope);
    const evidence = buildRiskScanEvidence({
      projectName: input.projectName,
      stage: input.stage,
      description: projectDescription,
      riskCount: risks.length,
      model: "configured-llm",
      status: "generated",
      reason: "AI生成候选风险，仍需项目经理确认后进入正式风险闭环。",
    });
    const audit = await persistAiEvidence({ evidence, user, requestId, metadata: auditMetadata });

    return NextResponse.json({
      request_id: requestId,
      risks,
      aiReasoning: content.slice(0, 500),
      model: "configured-llm",
      evidence: withAuditResult(evidence, audit.status === "succeeded" ? { status: "succeeded", id: audit.id } : { status: audit.status, warning: audit.warning }),
    });
  } catch (error) {
    console.error("[risk/analyze] Error:", error);
    return NextResponse.json(
      { request_id: requestId, error: error instanceof Error ? error.message : "AI风险分析失败" },
      { status: 500 }
    );
  }
}
