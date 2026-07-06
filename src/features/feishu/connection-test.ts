import type { FieldMappingCheck } from "../operating-system/diagnostics.ts";
import type { FeishuTableKey } from "./config.ts";

export type FeishuConnectionTestStepStatus = "ok" | "warning" | "failed" | "skipped";
export type FeishuConnectionTestStatus = "ok" | "warning" | "failed" | "not_configured";

export interface FeishuConnectionTestStep {
  id: string;
  label: string;
  status: FeishuConnectionTestStepStatus;
  detail: string;
  nextAction?: string;
  code?: string;
}

export interface FeishuConnectionTestSummary {
  status: FeishuConnectionTestStatus;
  okCount: number;
  warningCount: number;
  failedCount: number;
  skippedCount: number;
  message: string;
}

export interface FeishuConnectionTestResult {
  status: FeishuConnectionTestStatus;
  source: "user" | "global" | "missing";
  checkedAt: string;
  baseAccessible: boolean;
  tableCount: number;
  configuredTableCount: number;
  missingRequiredTables: FeishuTableKey[];
  steps: FeishuConnectionTestStep[];
  fieldMappingChecks: FieldMappingCheck[];
  summary: FeishuConnectionTestSummary;
  larkCliHint?: string;
  setupHint?: string;
}

export function buildFeishuConfigCompletenessSteps(input: {
  appId?: string | null;
  appSecret?: string | null;
  baseToken?: string | null;
  configuredTableCount: number;
}): FeishuConnectionTestStep[] {
  return [
    {
      id: "app_id",
      label: "App ID",
      status: input.appId?.trim() ? "ok" : "failed",
      detail: input.appId?.trim() ? "已填写 App ID。" : "缺少飞书应用 App ID。",
      nextAction: input.appId?.trim() ? undefined : "在飞书开放平台复制 App ID，并填入用户中心。",
    },
    {
      id: "app_secret",
      label: "App Secret",
      status: input.appSecret?.trim() ? "ok" : "failed",
      detail: input.appSecret?.trim() ? "已保存 App Secret，页面不会回显明文。" : "缺少飞书应用 App Secret。",
      nextAction: input.appSecret?.trim() ? undefined : "首次配置或重新测试时填写 App Secret。",
    },
    {
      id: "base_token",
      label: "多维表格 App Token",
      status: input.baseToken?.trim() ? "ok" : "failed",
      detail: input.baseToken?.trim() ? "已填写多维表格 App Token。" : "缺少多维表格 App Token。",
      nextAction: input.baseToken?.trim() ? undefined : "从飞书多维表格 URL 或开发者信息中复制 App Token。",
    },
    {
      id: "table_mapping",
      label: "业务表 ID 映射",
      status: input.configuredTableCount > 0 ? "ok" : "warning",
      detail: input.configuredTableCount > 0 ? `已配置 ${input.configuredTableCount} 张业务表。` : "尚未配置业务表 ID，只能测试应用和 Base 连通性。",
      nextAction: input.configuredTableCount > 0 ? undefined : "至少配置项目台账表 ID；完整使用建议补齐风险、任务、里程碑、合同、回款、成本和同步流水表。",
    },
  ];
}

export function summarizeFeishuConnectionSteps(steps: FeishuConnectionTestStep[]): FeishuConnectionTestSummary {
  const okCount = steps.filter(step => step.status === "ok").length;
  const warningCount = steps.filter(step => step.status === "warning").length;
  const failedCount = steps.filter(step => step.status === "failed").length;
  const skippedCount = steps.filter(step => step.status === "skipped").length;
  const status: FeishuConnectionTestStatus = failedCount > 0 ? "failed" : warningCount > 0 || skippedCount > 0 ? "warning" : "ok";
  return {
    status,
    okCount,
    warningCount,
    failedCount,
    skippedCount,
    message: status === "ok"
      ? "飞书连接测试通过。"
      : status === "failed"
        ? "飞书连接存在阻断问题，请按失败项修复。"
        : "飞书连接基本可用，但仍有未配置或未验证项。",
  };
}

export function fieldMappingSteps(checks: FieldMappingCheck[]): FeishuConnectionTestStep[] {
  return checks
    .filter(check => check.configured || check.status === "error")
    .map(check => ({
      id: `fields:${check.tableKey}`,
      label: `${check.tableName}字段权限`,
      status: check.status === "ok" ? "ok" : check.status === "warning" ? "warning" : "failed",
      detail: check.status === "ok"
        ? `已读取 ${check.presentFields.length} 个字段，字段口径满足当前要求。`
        : check.detail
          ? `字段读取失败：${check.detail}`
          : `可读取字段 ${check.presentFields.length} 个，缺少字段：${check.missingFields.join("、") || "无"}`,
      nextAction: check.status === "ok" ? undefined : check.remediation,
      code: check.detail,
    }));
}

export function writeCheckStep(input: {
  requested: boolean;
  attempted: boolean;
  succeeded: boolean;
  recordId?: string;
  code?: string;
  message?: string;
}): FeishuConnectionTestStep {
  if (!input.requested) {
    return {
      id: "write_permission",
      label: "写入权限",
      status: "skipped",
      detail: "本次未执行写入测试，避免未经确认向飞书写入测试记录。",
      nextAction: "如需验证写权限，请点击“确认写入测试”。系统只会向同步流水表写入一条测试记录。",
    };
  }
  if (!input.attempted) {
    return {
      id: "write_permission",
      label: "写入权限",
      status: "skipped",
      detail: "未配置同步流水表 ID，无法执行安全写入测试。",
      nextAction: "配置同步流水表 ID 后再执行写入测试。",
    };
  }
  if (input.succeeded) {
    return {
      id: "write_permission",
      label: "写入权限",
      status: "ok",
      detail: `同步流水表写入测试通过，测试记录 ID：${input.recordId || "已创建"}。`,
    };
  }
  return {
    id: "write_permission",
    label: "写入权限",
    status: "failed",
    detail: input.message || "同步流水表写入测试失败。",
    nextAction: "检查飞书应用是否拥有该表的记录创建权限，并确认同步流水表字段使用中文描述。",
    code: input.code,
  };
}
