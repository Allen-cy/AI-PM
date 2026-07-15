export type ControlledPilotMode = "technical_rehearsal" | "formal_pilot";
export type ControlledPilotParticipantRole = "pm" | "operations" | "pmo" | "ceo";
export type ControlledPilotParticipantKind = "test_account" | "real_user";
export type ControlledPilotVerificationLevel = "technical_exercised" | "formal_passed";

export const CONTROLLED_PILOT_ROLES: readonly ControlledPilotParticipantRole[] = ["pm", "operations", "pmo", "ceo"];

export const CONTROLLED_PILOT_MODULES = [
  { key: "identity_access", label: "身份、权限与数据隔离" },
  { key: "data_reconcile", label: "飞书数据镜像与对账" },
  { key: "initiation_planning", label: "立项与规划" },
  { key: "wbs_cpm_evm_resources", label: "WBS、关键路径、挣值与资源" },
  { key: "commercial_finance", label: "合同、成本、应收与回款" },
  { key: "stakeholders", label: "干系人管理" },
  { key: "quality_acceptance", label: "质量、缺陷、验收与签发" },
  { key: "execution_monitoring", label: "执行与监控" },
  { key: "risk_issue_change", label: "风险、问题与变更" },
  { key: "closure", label: "项目收尾" },
  { key: "formal_reporting_meetings", label: "正式汇报、会议与决策" },
  { key: "role_workbenches_inbox", label: "四角色工作台与统一收件箱" },
  { key: "cross_role_flow", label: "跨角色流转与效果复核" },
  { key: "feishu_identity_boundary", label: "组织飞书读取与个人飞书写入边界" },
  { key: "ai_rag", label: "AI建议与动态知识RAG" },
  { key: "security_recovery_mobile", label: "安全、故障恢复与移动端" },
] as const;

export type ControlledPilotModuleKey = typeof CONTROLLED_PILOT_MODULES[number]["key"];

export interface ControlledPilotEvaluationInput {
  mode: ControlledPilotMode;
  dataClass: string;
  projectCount: number;
  distinctParticipantUsers: number;
  participantRoles: string[];
  selfSignedRoles: string[];
  participantKinds: string[];
  moduleChecks: Array<{ moduleKey: string; result: "pending" | "passed" | "failed"; evidenceCount: number }>;
  goldenChains: Array<{ chainKey: string; verificationLevel: ControlledPilotVerificationLevel }>;
  feishuEvidence: Array<{
    actionType: string;
    status: string;
    retryCount: number;
    failureObservedAt?: string | null;
    recoveredAt?: string | null;
  }>;
}

export interface ControlledPilotBlocker {
  code: string;
  detail: string;
}

export interface ControlledPilotEvaluation {
  technicalReady: boolean;
  formalPassed: boolean;
  blockers: ControlledPilotBlocker[];
  metrics: {
    projects: number;
    distinctUsers: number;
    roles: number;
    selfSignoffs: number;
    modulesPassed: number;
    goldenChains: number;
    feishuTypes: number;
    recoveredFailures: number;
  };
}

function unique(values: readonly string[]): Set<string> {
  return new Set(values.map(value => String(value || "").trim()).filter(Boolean));
}

export function evaluateControlledPilot(input: ControlledPilotEvaluationInput): ControlledPilotEvaluation {
  const blockers: ControlledPilotBlocker[] = [];
  const participantRoles = unique(input.participantRoles);
  const selfSignedRoles = unique(input.selfSignedRoles);
  const requiredRoles = CONTROLLED_PILOT_ROLES.every(role => participantRoles.has(role));
  const requiredSignoffs = CONTROLLED_PILOT_ROLES.every(role => selfSignedRoles.has(role));
  const moduleMap = new Map(input.moduleChecks.map(item => [item.moduleKey, item]));
  const modulesPassed = CONTROLLED_PILOT_MODULES.filter(module => {
    const check = moduleMap.get(module.key);
    return check?.result === "passed" && check.evidenceCount > 0;
  }).length;
  const requiredVerification: ControlledPilotVerificationLevel = input.mode === "formal_pilot" ? "formal_passed" : "technical_exercised";
  const goldenChains = ["A", "E"].filter(chainKey => input.goldenChains.some(item => item.chainKey === chainKey && item.verificationLevel === requiredVerification)).length;
  const succeededFeishuTypes = unique(input.feishuEvidence.filter(item => item.status === "succeeded").map(item => item.actionType));
  const requiredFeishuTypes = ["message", "task", "base_record_update"];
  const feishuTypes = requiredFeishuTypes.filter(type => succeededFeishuTypes.has(type)).length;
  const recoveredFailures = input.feishuEvidence.filter(item => item.status === "succeeded" && item.retryCount >= 2 && Boolean(item.failureObservedAt) && Boolean(item.recoveredAt)).length;

  if (input.projectCount < 5) blockers.push({ code: "FIVE_PROJECTS_REQUIRED", detail: `至少需要5个不同项目，当前为${input.projectCount}个。` });
  if (input.distinctParticipantUsers < 4) blockers.push({ code: "FOUR_DISTINCT_USERS_REQUIRED", detail: "项目经理、运营、PMO、CEO必须由四个不同账号承担。" });
  if (!requiredRoles) blockers.push({ code: "FOUR_ROLES_REQUIRED", detail: "必须覆盖项目经理、运营、PMO、CEO四个角色。" });
  if (!requiredSignoffs) blockers.push({ code: "FOUR_SELF_SIGNOFFS_REQUIRED", detail: "四个角色必须分别登录并本人签署，系统不得代签。" });
  if (modulesPassed !== CONTROLLED_PILOT_MODULES.length) blockers.push({ code: "MODULE_COVERAGE_INCOMPLETE", detail: `16个模块检查仅通过${modulesPassed}个。` });
  if (!input.goldenChains.some(item => item.chainKey === "A" && item.verificationLevel === requiredVerification)) blockers.push({ code: "GOLDEN_CHAIN_A_REQUIRED", detail: "黄金链A尚未达到当前验收级别。" });
  if (!input.goldenChains.some(item => item.chainKey === "E" && item.verificationLevel === requiredVerification)) blockers.push({ code: "GOLDEN_CHAIN_E_REQUIRED", detail: "黄金链E尚未达到当前验收级别。" });
  if (feishuTypes !== requiredFeishuTypes.length) blockers.push({ code: "FEISHU_THREE_TYPES_REQUIRED", detail: "消息、任务、智能表写入三类飞书确认尚未全部成功。" });
  if (recoveredFailures < 1) blockers.push({ code: "FEISHU_FAILURE_RETRY_REQUIRED", detail: "至少需要一条真实失败后重试成功的恢复证据。" });

  if (input.mode === "formal_pilot") {
    if (input.dataClass !== "production") blockers.push({ code: "FORMAL_PRODUCTION_DATA_REQUIRED", detail: "正式试点只能使用production业务数据。" });
    if (input.participantKinds.length < 4 || input.participantKinds.some(kind => kind !== "real_user")) blockers.push({ code: "FOUR_REAL_USERS_REQUIRED", detail: "正式试点必须由四位真实人员完成，测试或自动化账号不能代替。" });
  } else {
    if (input.dataClass !== "test") blockers.push({ code: "TECHNICAL_TEST_DATA_REQUIRED", detail: "技术演练必须在test数据空间运行。" });
    if (input.participantKinds.length < 4 || input.participantKinds.some(kind => kind !== "test_account")) blockers.push({ code: "FOUR_TEST_ACCOUNTS_REQUIRED", detail: "技术演练需要四个职责分离的测试账号。" });
  }

  const ready = blockers.length === 0;
  return {
    technicalReady: input.mode === "technical_rehearsal" && ready,
    formalPassed: input.mode === "formal_pilot" && ready,
    blockers,
    metrics: {
      projects: input.projectCount,
      distinctUsers: input.distinctParticipantUsers,
      roles: participantRoles.size,
      selfSignoffs: selfSignedRoles.size,
      modulesPassed,
      goldenChains,
      feishuTypes,
      recoveredFailures,
    },
  };
}
