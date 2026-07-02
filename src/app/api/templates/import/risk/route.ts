import * as XLSX from "xlsx";
import { FileValidationError, validateSpreadsheetFile } from "@/features/security/file-validation";
import {
  calculateRiskPriority,
  calculateRiskScore,
  type LinkedModule,
  type Risk,
  type RiskCategory,
  type RiskImpactArea,
  type RiskStage,
  type RiskStrategy,
} from "@/lib/risk";

export const runtime = "nodejs";

const categories: RiskCategory[] = ["商业", "客户", "供应商", "计划编制", "组织管理", "开发实施环境", "过程", "设计实现", "人员资源", "外部环境", "产品", "需求", "技术", "质量", "合同", "财务", "进度", "管理"];
const stages: RiskStage[] = ["立项", "规划", "执行", "监控", "验收", "结项", "全生命周期"];
const impactAreas: RiskImpactArea[] = ["范围", "费用", "工期", "质量", "组织", "技术", "合同", "回款", "客户", "供应商"];
const strategies: RiskStrategy[] = ["规避", "缓解", "转移", "接受", "上报"];
const modules: LinkedModule[] = ["项目组合看板", "立项", "规划", "执行", "监控", "收尾", "合同回款", "质量", "资源"];
const MAX_IMPORT_ROWS = 1000;

function text(row: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
  }
  return "";
}

function clamp(value: unknown, fallback = 3): 1 | 2 | 3 | 4 | 5 {
  const map: Record<string, number> = { 高: 4, 中: 3, 低: 2, 极高: 5, 极低: 1 };
  const raw = String(value ?? "").trim();
  const parsed = Math.round(Number(map[raw] ?? raw));
  return Math.max(1, Math.min(5, Number.isFinite(parsed) ? parsed : fallback)) as 1 | 2 | 3 | 4 | 5;
}

function pick<T extends string>(value: string, allowed: readonly T[], fallback: T): T {
  return allowed.find(item => value.includes(item)) ?? fallback;
}

function normalizeRisk(row: Record<string, unknown>, index: number): Risk | null {
  const description = text(row, "风险描述", "风险项目", "潜在的风险事件", "风险事件");
  if (!description) return null;
  const probability = clamp(text(row, "可能性", "可能性等级", "概率"), 3);
  const impact = clamp(text(row, "影响", "影响等级", "影响程度", "严重性"), 3);
  const urgency = clamp(text(row, "紧迫度"), probability >= 4 || impact >= 4 ? 4 : 3);
  const categoryText = text(row, "风险类别", "类别");
  const stageText = text(row, "项目阶段", "阶段");
  const impactText = text(row, "影响领域", "影响因素");
  const strategyText = text(row, "应对策略", "处理策略");
  const moduleText = text(row, "关联模块");
  return {
    id: text(row, "风险编号", "编号") || `IMP-${Date.now()}-${index + 1}`,
    riskCode: text(row, "风险编号", "编号") || undefined,
    projectName: text(row, "项目名称") || "导入项目",
    description,
    category: pick(categoryText, categories, "管理"),
    stage: pick(stageText, stages, "全生命周期"),
    source: text(row, "来源", "风险来源") || "模板导入",
    impactArea: pick(impactText, impactAreas, "范围"),
    probability,
    impact,
    urgency,
    piScore: calculateRiskScore(probability, impact),
    priorityScore: calculateRiskPriority(probability, impact, urgency),
    status: "identified",
    responseStrategyType: pick(strategyText, strategies, "缓解"),
    responseStrategy: text(row, "应对计划", "应对措施", "应对行动", "规避计划") || "导入后由责任人补齐应对计划。",
    preventiveAction: text(row, "预防措施", "规避计划"),
    contingencyPlan: text(row, "应急计划", "应急解决计划"),
    trigger: text(row, "触发条件"),
    trackingMethod: text(row, "跟踪方法"),
    owner: text(row, "责任人", "负责人") || "项目经理",
    dueDate: text(row, "deadline", "到期日") || new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
    nextReviewDate: text(row, "下次复核", "复核日期") || new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
    closingCriteria: text(row, "关闭条件", "结束条件"),
    linkedModule: pick(moduleText, modules, "执行"),
    evidence: text(row, "证据", "备注"),
    workflowStep: "identify",
    currentInput: "使用者通过模板导入风险信息。",
    currentOutput: "风险已进入登记册，待分析与应对规划。",
    lastAction: "确认风险等级、责任人和deadline。",
    actionOwner: text(row, "责任人", "负责人") || "项目经理",
    actionDeadline: text(row, "deadline", "到期日") || new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
    createdAt: new Date().toISOString().slice(0, 10),
  };
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "请上传风险模板文件" }, { status: 400 });
  }
  try {
    validateSpreadsheetFile(file, { maxBytes: 5 * 1024 * 1024 });
    const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
    const risks: Risk[] = [];
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" }).slice(0, MAX_IMPORT_ROWS);
      rows.forEach((row, index) => {
        const risk = normalizeRisk(row, risks.length + index);
        if (risk) risks.push(risk);
      });
    }
    return Response.json({ risks, count: risks.length });
  } catch (error) {
    if (error instanceof FileValidationError) {
      return Response.json({ error: error.message, code: error.code }, { status: error.status });
    }
    return Response.json({ error: "风险模板解析失败" }, { status: 422 });
  }
}
