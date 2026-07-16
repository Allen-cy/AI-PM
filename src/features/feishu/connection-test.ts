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

export function organizationScopeAlignmentStep(input: {
  requested: boolean;
  organizationConfigured: boolean;
  sameBase: boolean;
  mismatchedTables: FeishuTableKey[];
}): FeishuConnectionTestStep {
  if (!input.requested) {
    return {
      id: "organization_scope_alignment",
      label: "组织事实源一致性",
      status: "skipped",
      detail: "尚未选择当前业务组织，本次未核对个人连接与组织共享台账。",
      nextAction: "先在顶部业务身份中选择组织，再重新测试个人飞书连接。",
    };
  }
  if (!input.organizationConfigured) {
    return {
      id: "organization_scope_alignment",
      label: "组织事实源一致性",
      status: "warning",
      detail: "当前组织尚未配置可用的共享飞书事实源，无法核对Base与八类表映射。",
      nextAction: "请组织级PMO先在数据与集成中心配置共享飞书项目台账。",
    };
  }
  if (!input.sameBase) {
    return {
      id: "organization_scope_alignment",
      label: "组织事实源一致性",
      status: "failed",
      detail: "个人连接与组织共享事实源不是同一个多维表格Base。",
      nextAction: "请填写组织共享Base对应的App Token，系统不会跨台账写回。",
      code: "PERSONAL_ORGANIZATION_BASE_MISMATCH",
    };
  }
  if (input.mismatchedTables.length > 0) {
    return {
      id: "organization_scope_alignment",
      label: "组织事实源一致性",
      status: "failed",
      detail: `以下表ID与组织共享台账不一致：${input.mismatchedTables.join("、")}`,
      nextAction: "点击“复制组织八表映射”后重新保存并测试。",
      code: "PERSONAL_ORGANIZATION_TABLE_MISMATCH",
    };
  }
  return {
    id: "organization_scope_alignment",
    label: "组织事实源一致性",
    status: "ok",
    detail: "个人连接与组织共享Base及八类业务表映射一致，可用于受控写回与自动目标镜像。",
  };
}
