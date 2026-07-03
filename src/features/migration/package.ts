import { migrationDataObjects, type MigrationDataObject } from "./readiness.ts";

export type MigrationMappingStatus = "matched" | "alias" | "missing";
export type MigrationIssueSeverity = "high" | "medium" | "low";

export interface MigrationFieldMapping {
  targetField: string;
  sourceField: string | null;
  status: MigrationMappingStatus;
  note: string;
}

export interface MigrationQualityIssue {
  id: string;
  title: string;
  severity: MigrationIssueSeverity;
  affectedCount: number;
  sampleRefs: string[];
  recommendation: string;
}

export interface MigrationAnalysisResult {
  objectName: string;
  generatedAt: string;
  totalRows: number;
  fieldCoverage: {
    required: number;
    matched: number;
    missing: number;
    rate: number;
  };
  mappings: MigrationFieldMapping[];
  qualityIssues: MigrationQualityIssue[];
  nextActions: string[];
  canTrialImport: boolean;
}

export interface MigrationTemplateSheet {
  name: string;
  headers: string[];
  sampleRow: Record<string, string | number>;
}

export interface MigrationBatchMetrics {
  totalRows: number;
  fieldCoverageRate: number;
  missingRequiredFields: number;
  qualityIssueCount: number;
  highIssueCount: number;
  canTrialImport: boolean;
  nextActions: string[];
}

export interface MigrationReviewReportInput {
  analysis: MigrationAnalysisResult;
  batchName?: string;
  fileName?: string | null;
  generatedBy?: string | null;
}

type RawRow = Record<string, unknown>;

const FIELD_ALIASES: Record<string, string[]> = {
  项目编号: ["项目ID", "项目编码", "编号", "项目号", "Project ID", "project_id", "projectCode"],
  项目名称: ["项目", "名称", "项目名", "Project Name", "project_name"],
  项目经理: ["PM", "负责人", "项目负责人", "责任人", "项目管理人", "Project Manager", "owner"],
  项目状态: ["状态", "当前状态", "项目阶段", "Project Status", "status"],
  计划开始日期: ["开始日期", "计划开始", "启动日期", "Start Date", "planned_start"],
  计划完成日期: ["完成日期", "计划完成", "结束日期", "截止日期", "deadline", "Due Date", "End Date", "planned_finish"],
  合同金额: ["合同额", "金额", "签约金额", "Contract Amount", "contract_amount"],
  任务名称: ["任务", "事项名称", "工作项", "Task Name", "task"],
  所属项目: ["项目名称", "项目", "Project", "project_name"],
  完成状态: ["状态", "任务状态", "Task Status", "status"],
  上级WBS: ["父级WBS", "父任务", "上级任务", "parent_wbs"],
  事项类型: ["类型", "事项类别", "风险类型", "Issue Type", "type"],
  严重程度: ["风险等级", "优先级", "严重性", "Severity", "priority"],
  应对动作: ["应对措施", "处理动作", "下一步动作", "Action", "response"],
  复核日期: ["复查日期", "跟踪日期", "Review Date", "review_date"],
  里程碑名称: ["里程碑", "节点名称", "Milestone", "milestone_name"],
  验收条件: ["验收标准", "完成条件", "Acceptance Criteria", "acceptance"],
  计划日期: ["计划完成日期", "目标日期", "Plan Date", "planned_date"],
  实际日期: ["实际完成日期", "完成时间", "Actual Date", "actual_date"],
  验收状态: ["状态", "验收结果", "Acceptance Status", "acceptance_status"],
  合同编号: ["合同ID", "合同编码", "合同号", "Contract ID", "contract_id"],
  回款节点: ["付款节点", "付款条件", "收款节点", "Payment Milestone", "payment_node"],
  应收金额: ["应收", "待收金额", "Receivable", "receivable"],
  已回款: ["已收款", "回款金额", "Collected", "collection"],
  到期日: ["应收日期", "付款日期", "Due Date", "due_date"],
  模板名称: ["模板", "名称", "Template Name", "template_name"],
  适用阶段: ["阶段", "项目阶段", "Phase", "stage"],
  输入要求: ["输入", "必填信息", "Input", "inputs"],
  输出成果: ["输出", "成果", "Output", "outputs"],
  责任角色: ["责任人", "角色", "Owner Role", "owner_role"],
};

const DATE_FIELD_PATTERN = /日期|到期日|deadline|date/i;
const AMOUNT_FIELD_PATTERN = /金额|合同额|已回款|应收|amount|receivable|collection/i;

function normalizeFieldName(value: string): string {
  return value.toLowerCase().replace(/[\s_\-（）()【】[\].:/：]/g, "");
}

function present(value: unknown): boolean {
  return value !== null && value !== undefined && String(value).trim() !== "";
}

function findObject(objectName: string): MigrationDataObject {
  const object = migrationDataObjects.find(item => item.name === objectName);
  if (!object) {
    throw new Error(`未知迁移数据对象：${objectName}`);
  }
  return object;
}

function buildMapping(targetField: string, sourceFields: string[]): MigrationFieldMapping {
  const normalizedSource = new Map(sourceFields.map(field => [normalizeFieldName(field), field]));
  const exact = normalizedSource.get(normalizeFieldName(targetField));
  if (exact) {
    return { targetField, sourceField: exact, status: "matched", note: "字段名称完全匹配。" };
  }
  const aliases = FIELD_ALIASES[targetField] ?? [];
  const alias = aliases
    .map(item => normalizedSource.get(normalizeFieldName(item)))
    .find(Boolean);
  if (alias) {
    return { targetField, sourceField: alias, status: "alias", note: `通过别名匹配：${alias}。` };
  }
  return { targetField, sourceField: null, status: "missing", note: "缺少该必填字段，需要在导入前补齐或建立字段映射。" };
}

function rowRef(row: RawRow, index: number, mappings: MigrationFieldMapping[]): string {
  const projectMapping = mappings.find(item => item.targetField === "项目编号" || item.targetField === "项目名称" || item.targetField === "所属项目");
  const value = projectMapping?.sourceField ? row[projectMapping.sourceField] : null;
  return value ? String(value) : `第${index + 2}行`;
}

function parseAmount(value: unknown): number | null {
  if (!present(value)) return null;
  const normalized = String(value).replace(/[,\s￥¥]/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function isValidDateLike(value: unknown): boolean {
  if (!present(value)) return false;
  if (value instanceof Date) return !Number.isNaN(value.getTime());
  if (typeof value === "number") return value > 0;
  const text = String(value).trim();
  if (/^\d{8}$/.test(text)) return true;
  return !Number.isNaN(Date.parse(text.replace(/\./g, "-").replace(/\//g, "-")));
}

function issue(
  id: string,
  title: string,
  severity: MigrationIssueSeverity,
  affectedCount: number,
  sampleRefs: string[],
  recommendation: string,
): MigrationQualityIssue | null {
  if (affectedCount <= 0) return null;
  return {
    id,
    title,
    severity,
    affectedCount,
    sampleRefs: sampleRefs.slice(0, 5),
    recommendation,
  };
}

export function analyzeMigrationRows(objectName: string, rows: RawRow[], now = new Date()): MigrationAnalysisResult {
  const object = findObject(objectName);
  const sourceFields = Array.from(new Set(rows.flatMap(row => Object.keys(row))));
  const mappings = object.requiredFields.map(field => buildMapping(field, sourceFields));
  const missingMappings = mappings.filter(item => item.status === "missing");
  const qualityIssues: MigrationQualityIssue[] = [];

  const missingIssue = issue(
    "missing-required-fields",
    "必填字段缺失",
    "high",
    missingMappings.length,
    missingMappings.map(item => item.targetField),
    "先补齐字段或建立字段映射，再做试迁移。",
  );
  if (missingIssue) qualityIssues.push(missingIssue);

  for (const mapping of mappings.filter(item => item.sourceField)) {
    const sourceField = mapping.sourceField as string;
    const emptyRefs = rows
      .map((row, index) => ({ row, index }))
      .filter(({ row }) => !present(row[sourceField]))
      .map(({ row, index }) => rowRef(row, index, mappings));
    const emptyIssue = issue(
      `empty-${mapping.targetField}`,
      `${mapping.targetField}存在空值`,
      ["项目经理", "责任人", "项目编号", "项目名称", "所属项目"].includes(mapping.targetField) ? "high" : "medium",
      emptyRefs.length,
      emptyRefs,
      `补齐${mapping.targetField}，否则无法形成责任、权限或统计口径。`,
    );
    if (emptyIssue) qualityIssues.push(emptyIssue);

    if (DATE_FIELD_PATTERN.test(mapping.targetField)) {
      const invalidDateRefs = rows
        .map((row, index) => ({ row, index }))
        .filter(({ row }) => present(row[sourceField]) && !isValidDateLike(row[sourceField]))
        .map(({ row, index }) => rowRef(row, index, mappings));
      const dateIssue = issue(
        `invalid-date-${mapping.targetField}`,
        `${mapping.targetField}日期格式异常`,
        "medium",
        invalidDateRefs.length,
        invalidDateRefs,
        "统一为 YYYY-MM-DD 或飞书可识别日期格式。",
      );
      if (dateIssue) qualityIssues.push(dateIssue);
    }

    if (AMOUNT_FIELD_PATTERN.test(mapping.targetField)) {
      const invalidAmountRefs = rows
        .map((row, index) => ({ row, index }))
        .filter(({ row }) => present(row[sourceField]) && parseAmount(row[sourceField]) === null)
        .map(({ row, index }) => rowRef(row, index, mappings));
      const amountIssue = issue(
        `invalid-amount-${mapping.targetField}`,
        `${mapping.targetField}金额格式异常`,
        "medium",
        invalidAmountRefs.length,
        invalidAmountRefs,
        "金额字段只保留数字、小数点和必要的千分位分隔符。",
      );
      if (amountIssue) qualityIssues.push(amountIssue);
    }
  }

  const uniqueField = ["项目编号", "合同编号", "模板名称"].find(field => mappings.some(item => item.targetField === field && item.sourceField));
  if (uniqueField) {
    const sourceField = mappings.find(item => item.targetField === uniqueField)?.sourceField as string;
    const counts = new Map<string, number>();
    for (const row of rows) {
      if (present(row[sourceField])) {
        const key = String(row[sourceField]).trim();
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
    const duplicateRefs = Array.from(counts.entries()).filter(([, count]) => count > 1).map(([key]) => key);
    const duplicateIssue = issue(
      `duplicate-${uniqueField}`,
      `${uniqueField}重复`,
      "high",
      duplicateRefs.length,
      duplicateRefs,
      `确保${uniqueField}唯一，避免导入后覆盖或合并错误。`,
    );
    if (duplicateIssue) qualityIssues.push(duplicateIssue);
  }

  if (objectName === "风险/问题/变更") {
    const severityField = mappings.find(item => item.targetField === "严重程度")?.sourceField;
    const actionField = mappings.find(item => item.targetField === "应对动作")?.sourceField;
    if (severityField && actionField) {
      const highRiskWithoutAction = rows
        .map((row, index) => ({ row, index }))
        .filter(({ row }) => /高|high|p0|critical/i.test(String(row[severityField])) && !present(row[actionField]))
        .map(({ row, index }) => rowRef(row, index, mappings));
      const riskIssue = issue(
        "high-risk-without-action",
        "高风险缺少应对动作",
        "high",
        highRiskWithoutAction.length,
        highRiskWithoutAction,
        "高风险必须补充应对动作、责任人和复核日期后再进入试迁移。",
      );
      if (riskIssue) qualityIssues.push(riskIssue);
    }
  }

  const matched = mappings.length - missingMappings.length;
  const highIssueCount = qualityIssues.filter(item => item.severity === "high").length;
  const nextActions = highIssueCount > 0
    ? ["先处理高优先级质量问题", "补齐缺失字段或字段映射", "重新上传小批量样例进行复检"]
    : qualityIssues.length > 0
      ? ["可进入试迁移，但需要在试点前修正中低优先级问题", "保留本次报告作为字段映射依据"]
      : ["字段覆盖和基础质量检查通过", "可以进入试迁移阶段门", "下一步建议接入飞书测试表并记录迁移批次"];

  return {
    objectName: object.name,
    generatedAt: now.toISOString(),
    totalRows: rows.length,
    fieldCoverage: {
      required: mappings.length,
      matched,
      missing: missingMappings.length,
      rate: mappings.length ? Math.round((matched / mappings.length) * 100) : 0,
    },
    mappings,
    qualityIssues,
    nextActions,
    canTrialImport: rows.length > 0 && highIssueCount === 0 && missingMappings.length === 0,
  };
}

export function buildMigrationTemplateSheets(): MigrationTemplateSheet[] {
  return migrationDataObjects.map(object => ({
    name: object.name,
    headers: object.requiredFields,
    sampleRow: Object.fromEntries(object.requiredFields.map(field => [field, sampleValueForField(field)])),
  }));
}

export function summarizeMigrationBatch(analysis: MigrationAnalysisResult): MigrationBatchMetrics {
  return {
    totalRows: analysis.totalRows,
    fieldCoverageRate: analysis.fieldCoverage.rate,
    missingRequiredFields: analysis.fieldCoverage.missing,
    qualityIssueCount: analysis.qualityIssues.length,
    highIssueCount: analysis.qualityIssues.filter(item => item.severity === "high").length,
    canTrialImport: analysis.canTrialImport,
    nextActions: analysis.nextActions,
  };
}

function escapeMarkdownCell(value: unknown): string {
  return String(value ?? "-").replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function reportConclusion(analysis: MigrationAnalysisResult): string {
  if (analysis.canTrialImport) return "可进入试迁移阶段门";
  const highIssueCount = analysis.qualityIssues.filter(item => item.severity === "high").length;
  if (highIssueCount > 0) return "暂不建议试迁移，需先关闭高优先级问题";
  return "可有条件试迁移，需在试点前完成中低优先级修正";
}

function severityLabel(severity: MigrationIssueSeverity): string {
  if (severity === "high") return "高";
  if (severity === "medium") return "中";
  return "低";
}

export function buildMigrationReviewReport(input: MigrationReviewReportInput): string {
  const analysis = input.analysis;
  const metrics = summarizeMigrationBatch(analysis);
  const batchName = input.batchName?.trim() || `${analysis.objectName}-试迁移评审`;
  const issueRows = analysis.qualityIssues.length > 0
    ? analysis.qualityIssues.map(issue => [
      escapeMarkdownCell(issue.title),
      escapeMarkdownCell(severityLabel(issue.severity)),
      escapeMarkdownCell(issue.affectedCount),
      escapeMarkdownCell(issue.sampleRefs.join("、") || "-"),
      escapeMarkdownCell(issue.recommendation),
      issue.severity === "high" ? "导入前必须关闭" : "试点前修正",
    ].join(" | "))
    : ["无基础质量问题 | - | 0 | - | 保持当前字段口径，进入试迁移复核。 | 进入试迁移前复核"];

  const mappingRows = analysis.mappings.map(mapping => [
    escapeMarkdownCell(mapping.targetField),
    escapeMarkdownCell(mapping.sourceField || "-"),
    escapeMarkdownCell(mapping.status === "matched" ? "直接匹配" : mapping.status === "alias" ? "别名匹配" : "缺失"),
    escapeMarkdownCell(mapping.note),
  ].join(" | "));

  return [
    `# ${batchName}`,
    "",
    "## 一、评审结论",
    "",
    `- 数据对象：${analysis.objectName}`,
    `- 来源文件：${input.fileName || "未记录"}`,
    `- 生成时间：${analysis.generatedAt}`,
    `- 生成人：${input.generatedBy || "系统/当前用户"}`,
    `- 样本行数：${metrics.totalRows}`,
    `- 字段覆盖率：${metrics.fieldCoverageRate}%`,
    `- 缺失必填字段：${metrics.missingRequiredFields}项`,
    `- 质量问题：${metrics.qualityIssueCount}项，其中高优先级${metrics.highIssueCount}项`,
    `- 阶段门结论：${reportConclusion(analysis)}`,
    "",
    "## 二、字段映射确认表",
    "",
    "| 目标字段 | 来源字段 | 匹配状态 | 说明 |",
    "| --- | --- | --- | --- |",
    ...mappingRows,
    "",
    "## 三、数据质量问题与修复清单",
    "",
    "| 问题 | 优先级 | 影响数量 | 样例 | 修复建议 | 阶段门要求 |",
    "| --- | --- | ---: | --- | --- | --- |",
    ...issueRows,
    "",
    "## 四、下一步动作",
    "",
    ...analysis.nextActions.map(action => `- ${action}`),
    "",
    "## 五、迁移评审签字",
    "",
    "| 角色 | 姓名 | 意见 | 日期 |",
    "| --- | --- | --- | --- |",
    "| 项目经理 |  |  |  |",
    "| PMO |  |  |  |",
    "| 业务负责人 |  |  |  |",
    "| 数据负责人 |  |  |  |",
    "",
    "## 六、生成边界",
    "",
    "- 本报告基于上传样本文件的字段和基础质量规则自动生成，不代表正式全量迁移结果。",
    "- 系统不会在生成本报告时写入飞书业务表；正式迁移前仍需人工复核字段口径、权限范围、历史数据完整性和试点反馈。",
    "- 若需要保留历史追踪，请在迁移中心保存为迁移批次，并确保已执行 Supabase 迁移批次 SQL。",
  ].join("\n");
}

function sampleValueForField(field: string): string | number {
  if (field.includes("编号")) return `${field.replace("编号", "") || "DATA"}-001`;
  if (field.includes("金额") || field === "已回款") return 100000;
  if (field.includes("日期") || field === "到期日" || field === "复核日期") return "2026-07-31";
  if (field.includes("状态")) return "进行中";
  if (field.includes("责任") || field.includes("经理")) return "张三";
  if (field.includes("名称")) return `${field}样例`;
  return `${field}样例`;
}
