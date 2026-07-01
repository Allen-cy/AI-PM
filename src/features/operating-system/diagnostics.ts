import type { DashboardData, DashboardProjectRecord } from "../dashboard/types.ts";
import type { FeishuTableKey } from "../feishu/config.ts";
import type { DataQualityRule } from "../pmo-operating-system.ts";

export type DiagnosticStatus = "ok" | "warning" | "error" | "unknown" | "not_configured";

interface RequiredField {
  name: string;
  aliases?: string[];
  reason: string;
  required?: boolean;
}

export interface FieldMappingCheck {
  tableKey: FeishuTableKey;
  tableName: string;
  status: DiagnosticStatus;
  configured: boolean;
  requiredFields: string[];
  presentFields: string[];
  missingFields: string[];
  optionalMissingFields: string[];
  remediation: string;
  detail?: string;
}

export interface DataQualityCheckResult {
  id: string;
  name: string;
  scope: string;
  severity: DataQualityRule["severity"];
  status: DiagnosticStatus;
  affectedCount: number;
  sampleRefs: string[];
  remediation: string;
  evidence: string;
}

export interface DiagnosticAdvice {
  id: string;
  source: "feishu" | "field_mapping" | "data_quality" | "ai_model" | "rag" | "supabase";
  severity: "high" | "medium" | "low";
  title: string;
  detail: string;
  actions: string[];
}

type RawRecord = Record<string, unknown>;

export const feishuTableNames: Record<FeishuTableKey, string> = {
  project: "项目台账",
  milestone: "里程碑表",
  task: "任务表",
  risk: "风险登记册",
  contract: "合同表",
  payment: "回款表",
  cost: "成本表",
  syncLedger: "同步账本",
};

const fieldRequirements: Partial<Record<FeishuTableKey, RequiredField[]>> = {
  project: [
    { name: "项目编号", aliases: ["项目ID"], reason: "用于跨表关联项目、风险、任务、合同和回款。", required: true },
    { name: "项目名称", aliases: ["项目", "商机项目名称", "合同名称"], reason: "看板、工作台、风险和报告的主显示字段。", required: true },
    { name: "项目状态", aliases: ["当前状态", "状态"], reason: "用于组合看板、阶段门和监控预警。", required: true },
    { name: "项目等级", aliases: ["项目分级"], reason: "用于识别重点项目和组合分层。", required: true },
    { name: "项目类型", reason: "用于组合结构和业务分类分析。", required: true },
    { name: "项目经理", aliases: ["项目负责人", "责任人"], reason: "用于责任到人和今日行动项。", required: true },
    { name: "当前进度", aliases: ["完成度"], reason: "用于进度看板、健康矩阵和趋势判断。", required: true },
    { name: "计划开始", aliases: ["开始时间"], reason: "用于周期、趋势和阶段门检查。", required: true },
    { name: "计划完成", aliases: ["计划交付时间", "截止时间"], reason: "用于 deadline、延期和收尾判断。", required: true },
    { name: "合同金额", aliases: ["合同额", "合同总额"], reason: "用于经营看板和重点项目识别。", required: true },
    { name: "已回款金额", aliases: ["回款额", "实收金额"], reason: "用于回款率和应收分析。", required: true },
    { name: "应收金额", aliases: ["应催账款"], reason: "用于经营提醒和回款闭环。", required: true },
    { name: "到期日期", aliases: ["回款到期日"], reason: "用于回款分组和逾期预警。", required: true },
    { name: "风险类型", aliases: ["风险类别"], reason: "用于项目健康说明。", required: true },
    { name: "风险等级", aliases: ["严重度"], reason: "用于高风险项目识别。", required: true },
    { name: "风险状态", reason: "用于风险闭环和监控中心。", required: true },
    { name: "重点项目标记", aliases: ["重点项目", "是否重点项目"], reason: "用于重点项目执行-监控-收尾链路。", required: true },
    { name: "执行阶段进度", aliases: ["执行进度"], reason: "用于重点项目阶段进度链。", required: true },
    { name: "监控阶段进度", aliases: ["监控进度"], reason: "用于重点项目阶段进度链。", required: true },
    { name: "收尾阶段进度", aliases: ["收尾进度"], reason: "用于重点项目阶段进度链。", required: true },
  ],
  risk: [
    { name: "风险编号", aliases: ["风险ID"], reason: "用于风险闭环和审计追踪。", required: true },
    { name: "项目名称", reason: "用于关联项目台账。", required: true },
    { name: "风险描述", aliases: ["风险事项", "描述"], reason: "用于风险登记和 AI 分析。", required: true },
    { name: "风险类别", aliases: ["风险类型"], reason: "用于风险分类统计。", required: true },
    { name: "风险等级", aliases: ["严重度"], reason: "用于升级和优先级排序。", required: true },
    { name: "发生概率", aliases: ["概率"], reason: "用于定性/敏感性分析。", required: true },
    { name: "影响程度", aliases: ["影响"], reason: "用于定性/敏感性分析。", required: true },
    { name: "风险值", aliases: ["风险评分"], reason: "用于排序、升级和趋势监控。", required: true },
    { name: "状态", aliases: ["风险状态"], reason: "用于闭环流程。", required: true },
    { name: "风险责任人", aliases: ["责任人", "Owner"], reason: "用于责任到人。", required: true },
    { name: "应对策略", reason: "用于规划应对。", required: true },
    { name: "应对措施", aliases: ["响应措施", "行动计划"], reason: "用于实施应对。", required: true },
    { name: "触发条件", reason: "用于监督风险和应急计划。", required: true },
    { name: "复核日期", aliases: ["下次复核日期"], reason: "用于监督风险。", required: true },
    { name: "截止日期", aliases: ["deadline"], reason: "用于执行跟踪。", required: true },
  ],
  contract: [
    { name: "项目名称", reason: "用于关联项目台账。", required: true },
    { name: "客户名称", aliases: ["甲方", "合同方"], reason: "用于经营看板和回款提醒。", required: true },
    { name: "合同名称", reason: "用于合同管理。", required: true },
    { name: "合同金额", aliases: ["合同额", "合同总额"], reason: "用于经营分析。", required: true },
    { name: "签约日期", aliases: ["签订日期"], reason: "用于月度趋势。", required: true },
    { name: "合同状态", reason: "用于合同闭环。", required: true },
  ],
  payment: [
    { name: "项目名称", reason: "用于关联项目台账。", required: true },
    { name: "客户名称", aliases: ["付款方"], reason: "用于回款跟进。", required: true },
    { name: "回款金额", aliases: ["已回款金额", "实收金额"], reason: "用于回款统计。", required: true },
    { name: "应收金额", aliases: ["应催账款"], reason: "用于逾期和应收分析。", required: true },
    { name: "到期日期", aliases: ["回款到期日"], reason: "用于回款分组。", required: true },
    { name: "回款状态", aliases: ["状态"], reason: "用于回款闭环。", required: true },
  ],
  task: [
    { name: "项目名称", reason: "用于关联项目台账。", required: true },
    { name: "任务名称", reason: "用于执行与交付跟踪。", required: true },
    { name: "责任人", aliases: ["任务负责人"], reason: "用于责任到人。", required: true },
    { name: "计划完成", aliases: ["截止日期"], reason: "用于 deadline 预警。", required: true },
    { name: "任务状态", aliases: ["状态"], reason: "用于执行闭环。", required: true },
    { name: "完成进度", aliases: ["当前进度"], reason: "用于执行进度。", required: true },
  ],
  milestone: [
    { name: "项目名称", reason: "用于关联项目台账。", required: true },
    { name: "里程碑名称", reason: "用于阶段门管理。", required: true },
    { name: "计划完成", aliases: ["截止日期"], reason: "用于阶段门预警。", required: true },
    { name: "实际完成", reason: "用于偏差分析。", required: true },
    { name: "里程碑状态", aliases: ["状态"], reason: "用于阶段门闭环。", required: true },
  ],
  syncLedger: [
    { name: "事件ID", aliases: ["事件编号"], reason: "用于幂等追踪。", required: true },
    { name: "处理状态", reason: "用于同步状态追踪。", required: true },
    { name: "错误信息", reason: "用于失败诊断。", required: true },
    { name: "尝试次数", reason: "用于重试治理。", required: true },
  ],
};

function normalizeFieldName(value: string): string {
  return value.replace(/\s/g, "").replace(/[()（）【】\[\]_-]/g, "").toLowerCase();
}

function hasField(actualNames: string[], requirement: RequiredField): boolean {
  const normalized = new Set(actualNames.map(normalizeFieldName));
  return [requirement.name, ...(requirement.aliases ?? [])].some(name => normalized.has(normalizeFieldName(name)));
}

export function evaluateFeishuFieldMappings(input: {
  configuredTables: FeishuTableKey[];
  fieldNamesByTable: Partial<Record<FeishuTableKey, string[]>>;
  fieldErrors?: Partial<Record<FeishuTableKey, string>>;
}): FieldMappingCheck[] {
  const configured = new Set(input.configuredTables);
  return (Object.keys(fieldRequirements) as FeishuTableKey[]).map(tableKey => {
    const tableName = feishuTableNames[tableKey];
    const requirements = fieldRequirements[tableKey] ?? [];
    const requiredFields = requirements.filter(item => item.required !== false);
    const optionalFields = requirements.filter(item => item.required === false);

    if (!configured.has(tableKey)) {
      return {
        tableKey,
        tableName,
        status: "not_configured",
        configured: false,
        requiredFields: requiredFields.map(item => item.name),
        presentFields: [],
        missingFields: requiredFields.map(item => item.name),
        optionalMissingFields: optionalFields.map(item => item.name),
        remediation: `在用户配置或系统环境变量中补充${tableName}的飞书表ID。`,
      };
    }

    const error = input.fieldErrors?.[tableKey];
    if (error) {
      return {
        tableKey,
        tableName,
        status: "error",
        configured: true,
        requiredFields: requiredFields.map(item => item.name),
        presentFields: [],
        missingFields: requiredFields.map(item => item.name),
        optionalMissingFields: optionalFields.map(item => item.name),
        remediation: "检查飞书应用是否拥有该表访问权限，并确认表ID没有填错。",
        detail: error,
      };
    }

    const actualNames = input.fieldNamesByTable[tableKey] ?? [];
    const missingFields = requiredFields.filter(item => !hasField(actualNames, item)).map(item => item.name);
    const optionalMissingFields = optionalFields.filter(item => !hasField(actualNames, item)).map(item => item.name);

    return {
      tableKey,
      tableName,
      status: missingFields.length === 0 ? "ok" : "warning",
      configured: true,
      requiredFields: requiredFields.map(item => item.name),
      presentFields: actualNames,
      missingFields,
      optionalMissingFields,
      remediation: missingFields.length === 0
        ? "字段映射满足当前诊断要求。"
        : `请在飞书${tableName}补齐字段：${missingFields.join("、")}。`,
    };
  });
}

function scalar(value: unknown): unknown {
  if (Array.isArray(value)) {
    const first = value[0];
    if (typeof first === "object" && first !== null && "text" in first) return (first as { text: unknown }).text;
    if (typeof first === "object" && first !== null && "name" in first) return (first as { name: unknown }).name;
    return first;
  }
  return value;
}

function text(record: RawRecord, names: string[], fallback = ""): string {
  for (const name of names) {
    const raw = scalar(record[name]);
    if (raw !== undefined && raw !== null && raw !== "") return String(raw).trim();
  }
  return fallback;
}

function numeric(record: RawRecord, names: string[], fallback = 0): number {
  const raw = text(record, names);
  if (!raw) return fallback;
  const parsed = Number(raw.replace(/[,%￥¥万\s]/g, ""));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function isBlank(value: unknown): boolean {
  return value === undefined || value === null || String(value).trim() === "";
}

function recordName(record: RawRecord | DashboardProjectRecord, fallback: string): string {
  return text(record as RawRecord, ["项目名称", "项目", "商机项目名称", "合同名称", "风险编号", "风险描述"], fallback);
}

function resultFromAffected(rule: DataQualityRule, affected: Array<string>, evidence: string): DataQualityCheckResult {
  return {
    id: rule.id,
    name: rule.name,
    scope: rule.scope,
    severity: rule.severity,
    status: affected.length === 0 ? "ok" : rule.severity === "high" ? "error" : "warning",
    affectedCount: affected.length,
    sampleRefs: affected.slice(0, 5),
    remediation: rule.nextAction,
    evidence,
  };
}

export function evaluateDataQuality(input: {
  rules: DataQualityRule[];
  dashboard: DashboardData | null;
  projectRecords?: RawRecord[];
  riskRecords?: RawRecord[];
  taskRecords?: RawRecord[];
  paymentRecords?: RawRecord[];
}): DataQualityCheckResult[] {
  const projectRecords = input.projectRecords?.length ? input.projectRecords : (input.dashboard?.records as unknown as RawRecord[] | undefined) ?? [];
  const riskRecords = input.riskRecords ?? [];
  const taskRecords = input.taskRecords ?? [];
  const paymentRecords = input.paymentRecords ?? [];

  if (!input.dashboard && projectRecords.length === 0 && riskRecords.length === 0) {
    return input.rules.map(rule => ({
      id: rule.id,
      name: rule.name,
      scope: rule.scope,
      severity: rule.severity,
      status: "unknown",
      affectedCount: 0,
      sampleRefs: [],
      remediation: "连接飞书项目台账后自动扫描。",
      evidence: "当前没有可扫描的实时业务数据。",
    }));
  }

  const ruleById = new Map(input.rules.map(rule => [rule.id, rule]));
  const output: DataQualityCheckResult[] = [];

  const missingOwner = projectRecords
    .filter(record => isBlank(text(record, ["项目经理", "项目负责人", "责任人", "Owner"])))
    .map((record, index) => recordName(record, `项目${index + 1}`));
  output.push(resultFromAffected(ruleById.get("missing-owner")!, missingOwner, `扫描项目记录 ${projectRecords.length} 条。`));

  const missingDeadline = [
    ...projectRecords
      .filter(record => isBlank(text(record, ["计划完成", "计划交付时间", "截止时间", "到期日期"])))
      .map((record, index) => recordName(record, `项目${index + 1}`)),
    ...riskRecords
      .filter(record => isBlank(text(record, ["复核日期", "下次复核日期", "截止日期", "deadline"])))
      .map((record, index) => recordName(record, `风险${index + 1}`)),
    ...taskRecords
      .filter(record => isBlank(text(record, ["计划完成", "截止日期", "deadline"])))
      .map((record, index) => recordName(record, `任务${index + 1}`)),
  ];
  output.push(resultFromAffected(ruleById.get("missing-deadline")!, missingDeadline, `扫描项目${projectRecords.length}条、风险${riskRecords.length}条、任务${taskRecords.length}条。`));

  const allowedProjectStatuses = ["待立项", "进行中", "交付中", "未交付", "暂停", "已暂停", "验收中", "已验收", "收尾中", "已结项", "已关闭", "完成"];
  const allowedRiskStatuses = ["已识别", "分析中", "已规划应对", "应对中", "监控中", "跟踪中", "已解决", "已关闭", "identified", "analyzing", "response-planned", "response-implementing", "monitoring", "tracking", "resolved", "closed"];
  const invalidStatuses = [
    ...projectRecords
      .filter(record => {
        const status = text(record, ["项目状态", "当前状态", "状态"]);
        return status && !allowedProjectStatuses.some(item => status.includes(item));
      })
      .map((record, index) => `${recordName(record, `项目${index + 1}`)}：${text(record, ["项目状态", "当前状态", "状态"])}`),
    ...riskRecords
      .filter(record => {
        const status = text(record, ["状态", "风险状态"]);
        return status && !allowedRiskStatuses.some(item => status.includes(item));
      })
      .map((record, index) => `${recordName(record, `风险${index + 1}`)}：${text(record, ["状态", "风险状态"])}`),
  ];
  output.push(resultFromAffected(ruleById.get("invalid-status")!, invalidStatuses, "检查项目和风险状态是否落在系统推荐状态口径内。"));

  const financeMismatch = [
    ...projectRecords
      .filter(record => {
        const contract = numeric(record, ["合同金额", "合同额", "合同总额"]);
        const collection = numeric(record, ["已回款金额", "回款额", "实收金额"]);
        const receivable = numeric(record, ["应收金额", "应催账款"], Math.max(0, contract - collection));
        return contract > 0 && (collection - contract > 0.01 || Math.abs(receivable - Math.max(0, contract - collection)) > Math.max(1, contract * 0.05));
      })
      .map((record, index) => recordName(record, `项目${index + 1}`)),
    ...paymentRecords
      .filter(record => numeric(record, ["回款金额", "已回款金额", "实收金额"]) < 0 || numeric(record, ["应收金额", "应催账款"]) < 0)
      .map((record, index) => recordName(record, `回款${index + 1}`)),
  ];
  output.push(resultFromAffected(ruleById.get("finance-mismatch")!, financeMismatch, `扫描项目${projectRecords.length}条、回款${paymentRecords.length}条。`));

  const highRiskWithoutAction = [
    ...projectRecords
      .filter(record => text(record, ["风险等级", "严重度"]) === "高")
      .filter(record => isBlank(text(record, ["风险责任人", "责任人", "Owner"])) || isBlank(text(record, ["应对措施", "响应措施", "行动计划"])))
      .map((record, index) => recordName(record, `项目风险${index + 1}`)),
    ...riskRecords
      .filter(record => text(record, ["风险等级", "严重度"]) === "高" || numeric(record, ["风险值", "风险评分"]) >= 12)
      .filter(record => isBlank(text(record, ["风险责任人", "责任人", "Owner"])) || isBlank(text(record, ["应对措施", "响应措施", "行动计划"])) || isBlank(text(record, ["复核日期", "下次复核日期"])))
      .map((record, index) => recordName(record, `风险${index + 1}`)),
  ];
  output.push(resultFromAffected(ruleById.get("risk-without-action")!, highRiskWithoutAction, `扫描高风险项目和风险登记记录。`));

  if (input.dashboard) {
    const brokenKeyProjectChain = input.dashboard.keyProjects
      .filter(project => project.monitoringProgress > project.executionProgress + 20 || project.closingProgress > project.monitoringProgress + 20)
      .map(project => `${project.name}：执行${project.executionProgress}%/监控${project.monitoringProgress}%/收尾${project.closingProgress}%`);
    output.push({
      id: "key-project-progress-chain",
      name: "重点项目阶段进度链断点",
      scope: "重点项目",
      severity: "medium",
      status: brokenKeyProjectChain.length === 0 ? "ok" : "warning",
      affectedCount: brokenKeyProjectChain.length,
      sampleRefs: brokenKeyProjectChain.slice(0, 5),
      remediation: "复核重点项目的执行、监控、收尾阶段进度，确保后续阶段不早于前置阶段形成闭环证据。",
      evidence: `扫描重点项目 ${input.dashboard.keyProjects.length} 个。`,
    });
  }

  return output;
}

export function diagnoseIntegrationState(input: {
  feishuStatus: string;
  feishuCode?: string;
  feishuDetail?: string;
  aiConfigured: boolean;
  ragStatus: string;
  fieldMappingChecks: FieldMappingCheck[];
  dataQualityChecks: DataQualityCheckResult[];
  syncLogStatus?: string;
}): DiagnosticAdvice[] {
  const advices: DiagnosticAdvice[] = [];

  if (input.feishuStatus === "not_configured") {
    advices.push({
      id: "feishu-not-configured",
      source: "feishu",
      severity: "high",
      title: "飞书未完成配置",
      detail: input.feishuDetail ?? "当前用户或系统未提供可用飞书连接。",
      actions: ["进入用户中心配置个人飞书连接，或由管理员配置全局飞书环境变量。", "确认飞书应用具备多维表格读写权限。"],
    });
  } else if (input.feishuStatus === "error") {
    advices.push({
      id: "feishu-error",
      source: "feishu",
      severity: "high",
      title: "飞书连接失败",
      detail: input.feishuCode ? `错误码：${input.feishuCode}` : "飞书 API 调用失败。",
      actions: [
        input.feishuCode?.includes("AUTH") ? "检查飞书 App ID、App Secret 和应用启用状态。" : "检查 Base Token、表ID和应用授权范围。",
        "在飞书开放平台确认应用已安装到当前企业并授权访问目标多维表格。",
      ],
    });
  }

  const missingTables = input.fieldMappingChecks.filter(item => item.status === "not_configured");
  if (missingTables.length > 0) {
    advices.push({
      id: "feishu-table-missing",
      source: "field_mapping",
      severity: "medium",
      title: "部分飞书表尚未配置",
      detail: missingTables.map(item => item.tableName).join("、"),
      actions: ["如果对应模块暂不启用，可先忽略；如需完整闭环，请补充对应表ID。"],
    });
  }

  const missingFieldChecks = input.fieldMappingChecks.filter(item => item.status === "warning" || item.status === "error");
  if (missingFieldChecks.length > 0) {
    advices.push({
      id: "field-mapping-missing",
      source: "field_mapping",
      severity: "high",
      title: "飞书字段映射不完整",
      detail: missingFieldChecks.map(item => `${item.tableName}缺少${item.missingFields.length}项`).join("；"),
      actions: ["按字段映射检查结果补齐中文字段。", "补齐后重新进入数据与集成中心刷新检查。"],
    });
  }

  const failedQuality = input.dataQualityChecks.filter(item => item.status === "error" || item.status === "warning");
  if (failedQuality.length > 0) {
    advices.push({
      id: "data-quality-issues",
      source: "data_quality",
      severity: failedQuality.some(item => item.status === "error") ? "high" : "medium",
      title: "实时业务数据存在质量问题",
      detail: failedQuality.map(item => `${item.name}${item.affectedCount}条`).join("；"),
      actions: ["优先处理高严重度数据问题。", "数据修正后，工作台、监控中心和风险闭环会自动使用新的飞书数据。"],
    });
  }

  if (!input.aiConfigured) {
    advices.push({
      id: "ai-model-not-configured",
      source: "ai_model",
      severity: "medium",
      title: "AI 模型未完成配置",
      detail: "AI 摘要、商业论证、风险扫描等功能会降级。",
      actions: ["在用户中心配置个人模型，或由管理员配置全局默认模型。"],
    });
  }

  if (input.ragStatus !== "ok") {
    advices.push({
      id: "rag-not-ready",
      source: "rag",
      severity: "medium",
      title: "RAG 知识库未就绪",
      detail: `当前状态：${input.ragStatus}`,
      actions: ["检查知识库索引文件和语料数量。", "确认问答接口可以读取知识库快照。"],
    });
  }

  if (input.syncLogStatus && input.syncLogStatus !== "succeeded") {
    advices.push({
      id: "sync-log-not-persisted",
      source: "supabase",
      severity: "low",
      title: "同步日志尚未持久化",
      detail: "诊断结果可以展示，但历史审计日志不会保存。",
      actions: ["在 Supabase SQL Editor 执行 supabase-v527-integration-sync-logs.sql。"],
    });
  }

  return advices;
}
