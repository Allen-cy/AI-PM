import type { BusinessRole } from "./context.ts";

export type OperationsDataClass = "production" | "sample" | "test" | "diagnostic" | "unclassified";
export type MetricAvailability = "available" | "unavailable";
export type MetricHealth = "healthy" | "warning" | "critical" | "unknown";

export interface OperationalMetric {
  key: "data_freshness_minutes" | "integration_success_rate" | "confirmation_queue_backlog" | "decision_sla_rate" | "action_closure_rate" | "ai_error_rate" | "role_adoption_rate";
  label: string;
  value: number | null;
  unit: "minutes" | "percent" | "count";
  numerator: number | null;
  denominator: number | null;
  availability: MetricAvailability;
  health: MetricHealth;
  observedAt: string | null;
  reason: string | null;
}

export interface RoleOnboardingStep {
  key: "business_role" | "feishu" | "ai_model" | "project_mapping" | "data_class";
  label: string;
  completed: boolean;
  verification: "system" | "human_acknowledgement";
  actionHref: string;
  detail: string;
}

const GOLDEN_CHAINS: Record<BusinessRole, string[]> = {
  pm: ["核对项目事实与里程碑", "处理风险、问题和变更", "提交周报与需升级事项", "接收决策并闭环行动"],
  operations: ["核对验收、开票和回款事实", "识别现金与交付异常", "提交经营更新与升级", "复核收益与行动结果"],
  pmo: ["汇总组合例外与数据质量", "复核跨项目依赖与资源冲突", "组织组合会并提交决策包", "跟踪决策下行与效果关闭"],
  ceo: ["查看战略、现金、收益与重大风险", "审阅有证据的决策包", "明确选项、理由与条件", "查看执行回执与效果复核"],
  sponsor: ["复核项目价值与业务边界", "审阅重大例外", "明确授权与决策条件", "复核价值实现"],
  business_owner: ["确认业务目标与验收口径", "参与业务影响评审", "确认决策下行", "提交收益实现证据"],
  finance: ["核对合同、成本、应收与实收", "确认财务口径与基线", "评审现金影响", "完成财务关闭与效果复核"],
  quality: ["核对质量门禁与证据要求", "复核缺陷与整改行动", "确认验收证据", "发布质量结论与复用经验"],
};

export function buildRoleOnboardingGuide(input: {
  businessRole: BusinessRole;
  dataClass: OperationsDataClass;
  roleAssignmentActive: boolean;
  feishuConfigured: boolean;
  aiConfigured: boolean;
  projectMappingCount: number;
  acknowledgements?: Record<string, unknown> | null;
}) {
  const acknowledgedDataClass = String(input.acknowledgements?.data_class ?? "") === input.dataClass;
  const steps: RoleOnboardingStep[] = [
    { key: "business_role", label: "业务角色与管理范围", completed: input.roleAssignmentActive, verification: "system", actionHref: "/admin/security", detail: input.roleAssignmentActive ? `已验证 ${input.businessRole} 角色授权。` : "需管理员分配有效业务角色和主体范围。" },
    { key: "feishu", label: "个人飞书接入", completed: input.feishuConfigured, verification: "system", actionHref: "/account", detail: input.feishuConfigured ? "已验证个人飞书应用、Base 和项目表映射。" : "请在用户中心配置并测试个人飞书接入。" },
    { key: "ai_model", label: "AI 模型接入", completed: input.aiConfigured, verification: "system", actionHref: "/account", detail: input.aiConfigured ? "已检测到可用的用户或全局 AI 模型配置。" : "请在用户中心配置模型并通过连接测试。" },
    { key: "project_mapping", label: "稳定项目身份映射", completed: input.projectMappingCount > 0, verification: "system", actionHref: "/integration-center", detail: input.projectMappingCount > 0 ? `当前范围已映射 ${input.projectMappingCount} 个项目。` : "请先将飞书项目台账与系统 project_id 完成稳定映射。" },
    { key: "data_class", label: "数据分类确认", completed: acknowledgedDataClass, verification: "human_acknowledgement", actionHref: "/operations-center", detail: acknowledgedDataClass ? `已确认当前使用 ${input.dataClass} 数据空间。` : `需人工确认当前 ${input.dataClass} 数据空间，防止样例与正式数据混用。` },
  ];
  const completedCount = steps.filter(item => item.completed).length;
  return {
    businessRole: input.businessRole,
    dataClass: input.dataClass,
    steps,
    completedCount,
    totalCount: steps.length,
    status: completedCount === steps.length ? "completed" as const : completedCount === 0 ? "not_started" as const : "in_progress" as const,
    goldenChain: GOLDEN_CHAINS[input.businessRole],
  };
}

function unavailable(key: OperationalMetric["key"], label: string, unit: OperationalMetric["unit"], reason: string): OperationalMetric {
  return { key, label, value: null, unit, numerator: null, denominator: null, availability: "unavailable", health: "unknown", observedAt: null, reason };
}

function percent(numerator: number, denominator: number): number {
  return denominator > 0 ? Math.round((numerator / denominator) * 1000) / 10 : 0;
}

function rateHealth(value: number, warning = 90, critical = 75): MetricHealth {
  return value >= warning ? "healthy" : value >= critical ? "warning" : "critical";
}

export function buildOperationalMetrics(input: {
  now?: Date;
  syncLogs: Array<{ status: string; source: string; createdAt: string }>;
  confirmations: Array<{ status: string; createdAt: string }>;
  decisions: Array<{ status: string; requestedDecisionAt: string; decidedAt: string | null }>;
  actions: Array<{ status: string; createdAt: string; closedAt: string | null }>;
  aiEvaluations: Array<{ verdict: string }>;
  roleAssignments: Array<{ userId: string; businessRole: string }>;
  roleActivities: Array<{ userId: string; businessRole: string; occurredAt: string }>;
}): OperationalMetric[] {
  const now = input.now ?? new Date();
  const latestSuccess = input.syncLogs
    .filter(item => item.status === "succeeded" && ["feishu", "supabase"].includes(item.source))
    .map(item => new Date(item.createdAt))
    .filter(item => Number.isFinite(item.getTime()))
    .sort((a, b) => b.getTime() - a.getTime())[0];
  const freshness = latestSuccess
    ? (() => {
      const value = Math.max(0, Math.round((now.getTime() - latestSuccess.getTime()) / 60_000));
      return { key: "data_freshness_minutes", label: "数据新鲜度", value, unit: "minutes", numerator: value, denominator: 1, availability: "available", health: value <= 60 ? "healthy" : value <= 240 ? "warning" : "critical", observedAt: latestSuccess.toISOString(), reason: null } satisfies OperationalMetric;
    })()
    : unavailable("data_freshness_minutes", "数据新鲜度", "minutes", "当前窗口没有已成功且符合数据分类的同步日志。");

  const observedSyncLogs = input.syncLogs.filter(item => item.status !== "skipped");
  const integrationSuccess = observedSyncLogs.length > 0
    ? (() => {
      const succeeded = observedSyncLogs.filter(item => item.status === "succeeded").length;
      const value = percent(succeeded, observedSyncLogs.length);
      return { key: "integration_success_rate", label: "接口/同步成功率", value, unit: "percent", numerator: succeeded, denominator: observedSyncLogs.length, availability: "available", health: rateHealth(value, 95, 85), observedAt: null, reason: null } satisfies OperationalMetric;
    })()
    : unavailable("integration_success_rate", "接口/同步成功率", "percent", "当前窗口没有可计算的分类同步日志。");

  const queueActive = new Set(["pending_confirmation", "confirmed", "writing"]);
  const queue = input.confirmations.length > 0
    ? (() => {
      const value = input.confirmations.filter(item => queueActive.has(item.status)).length;
      return { key: "confirmation_queue_backlog", label: "飞书确认队列积压", value, unit: "count", numerator: value, denominator: input.confirmations.length, availability: "available", health: value === 0 ? "healthy" : value <= 5 ? "warning" : "critical", observedAt: null, reason: null } satisfies OperationalMetric;
    })()
    : unavailable("confirmation_queue_backlog", "飞书确认队列积压", "count", "当前窗口没有符合数据分类的确认队列记录。");

  const decisionObservations = input.decisions.filter(item => {
    const deadline = new Date(item.requestedDecisionAt).getTime();
    const decided = item.decidedAt ? new Date(item.decidedAt).getTime() : null;
    return Number.isFinite(deadline) && ((decided !== null && Number.isFinite(decided)) || deadline < now.getTime());
  });
  const decisionsWithinSla = decisionObservations.filter(item => item.decidedAt && new Date(item.decidedAt).getTime() <= new Date(item.requestedDecisionAt).getTime()).length;
  const decisionSla = decisionObservations.length > 0
    ? (() => {
      const value = percent(decisionsWithinSla, decisionObservations.length);
      return { key: "decision_sla_rate", label: "决策 SLA 达成率", value, unit: "percent", numerator: decisionsWithinSla, denominator: decisionObservations.length, availability: "available", health: rateHealth(value, 90, 75), observedAt: null, reason: null } satisfies OperationalMetric;
    })()
    : unavailable("decision_sla_rate", "决策 SLA 达成率", "percent", "当前窗口没有已决策或已逾期的决策包。");

  const actionObservations = input.actions.filter(item => item.status !== "cancelled");
  const actionsClosed = actionObservations.filter(item => ["done", "closed"].includes(item.status)).length;
  const actionClosure = actionObservations.length > 0
    ? (() => {
      const value = percent(actionsClosed, actionObservations.length);
      return { key: "action_closure_rate", label: "行动关闭率", value, unit: "percent", numerator: actionsClosed, denominator: actionObservations.length, availability: "available", health: rateHealth(value, 85, 65), observedAt: null, reason: null } satisfies OperationalMetric;
    })()
    : unavailable("action_closure_rate", "行动关闭率", "percent", "当前窗口没有符合范围与分类的行动项。");

  const badAiVerdicts = new Set(["false_positive", "missed_issue", "unsafe"]);
  const aiErrors = input.aiEvaluations.filter(item => badAiVerdicts.has(item.verdict)).length;
  const aiQuality = input.aiEvaluations.length > 0
    ? (() => {
      const value = percent(aiErrors, input.aiEvaluations.length);
      return { key: "ai_error_rate", label: "AI 误报/漏报率", value, unit: "percent", numerator: aiErrors, denominator: input.aiEvaluations.length, availability: "available", health: value <= 5 ? "healthy" : value <= 15 ? "warning" : "critical", observedAt: null, reason: null } satisfies OperationalMetric;
    })()
    : unavailable("ai_error_rate", "AI 误报/漏报率", "percent", "当前窗口没有人工 AI 评测记录，不能把未评测视为零误报。");

  const assignedKeys = new Set(input.roleAssignments.map(item => `${item.userId}:${item.businessRole}`));
  const activeKeys = new Set(input.roleActivities.map(item => `${item.userId}:${item.businessRole}`).filter(key => assignedKeys.has(key)));
  const adoption = assignedKeys.size > 0
    ? (() => {
      const value = percent(activeKeys.size, assignedKeys.size);
      return { key: "role_adoption_rate", label: "角色使用率", value, unit: "percent", numerator: activeKeys.size, denominator: assignedKeys.size, availability: "available", health: rateHealth(value, 70, 40), observedAt: null, reason: null } satisfies OperationalMetric;
    })()
    : unavailable("role_adoption_rate", "角色使用率", "percent", "当前组织没有可用于计算采用率的有效业务角色分配。");

  return [freshness, integrationSuccess, queue, decisionSla, actionClosure, aiQuality, adoption];
}

export type EnterpriseCapabilityKey = "sso" | "attachment_storage" | "electronic_signature" | "retention_policy" | "scheduled_archive" | "online_policy_publish";
export type EnterpriseCapabilityStatus = "not_configured" | "configured" | "tested" | "enabled" | "blocked" | "disabled";

const ENTERPRISE_CAPABILITIES: Array<{ capabilityKey: EnterpriseCapabilityKey; label: string }> = [
  { capabilityKey: "sso", label: "企业 SSO" },
  { capabilityKey: "attachment_storage", label: "企业附件存储" },
  { capabilityKey: "electronic_signature", label: "电子签名" },
  { capabilityKey: "retention_policy", label: "数据保留策略" },
  { capabilityKey: "scheduled_archive", label: "定时归档" },
  { capabilityKey: "online_policy_publish", label: "在线制度发布" },
];

export function buildEnterpriseCapabilityGates(rows: Array<{
  capabilityKey: string;
  status: string;
  evidence: unknown[];
  lastTestedAt: string | null;
}>) {
  return ENTERPRISE_CAPABILITIES.map(definition => {
    const row = rows.find(item => item.capabilityKey === definition.capabilityKey);
    const status = (row?.status || "not_configured") as EnterpriseCapabilityStatus;
    const evidence = Array.isArray(row?.evidence) ? row.evidence : [];
    const enabled = status === "enabled" && evidence.length > 0 && Boolean(row?.lastTestedAt);
    return {
      ...definition,
      status,
      evidenceCount: evidence.length,
      lastTestedAt: row?.lastTestedAt ?? null,
      enabled,
      gateMessage: enabled
        ? "已启用，且保留有测试时间和接入证据。"
        : status === "not_configured"
          ? "未配置：当前不对外宣称该能力已接通。"
          : "未通过启用门禁：需状态为 enabled、有测试时间并附接入证据。",
    };
  });
}
