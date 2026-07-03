import type { MigrationBatchComparison } from "./batch-comparison.ts";
import type { MigrationFieldMappingProfileRecord } from "./field-mapping-repository.ts";
import type { MigrationRemediationActionRecord } from "./remediation-repository.ts";
import type { MigrationAreaId, MigrationReadinessResult } from "./readiness.ts";

export type MigrationCutoverDecision = "Go" | "Conditional Go" | "No-Go" | "Insufficient Data";
export type MigrationCutoverCheckStatus = "通过" | "待补充" | "阻断";
export type MigrationCutoverManualCheckId =
  | "freezeWindowConfirmed"
  | "rollbackPlanConfirmed"
  | "permissionSpotCheckPassed"
  | "feishuWriteVerified"
  | "businessOwnerApproved"
  | "communicationReady";

export type MigrationCutoverManualChecks = Record<MigrationCutoverManualCheckId, boolean>;

export interface MigrationCutoverManualCheckDefinition {
  id: MigrationCutoverManualCheckId;
  category: string;
  title: string;
  owner: string;
  evidence: string;
  nextAction: string;
  blocker: boolean;
}

export interface MigrationCutoverChecklistItem {
  id: string;
  category: string;
  title: string;
  status: MigrationCutoverCheckStatus;
  owner: string;
  evidence: string;
  nextAction: string;
  source: "系统证据" | "人工确认";
}

export interface MigrationCutoverEvidenceSummary {
  readinessScore: number;
  readinessLevel: string;
  fieldMappingProfileName: string;
  fieldCoverageRate: number;
  missingFieldCount: number;
  batchCount: number;
  latestBatchName: string;
  latestBatchCoverageRate: number;
  latestHighIssueCount: number;
  remediationClosureRate: number;
  openRemediationCount: number;
  openP0RemediationCount: number;
  feishuSyncedActionCount: number;
  feishuActionCount: number;
}

export interface MigrationCutoverDecisionPackage {
  objectName: string;
  generatedAt: string;
  decision: MigrationCutoverDecision;
  summary: string;
  evidenceSummary: MigrationCutoverEvidenceSummary;
  checklist: MigrationCutoverChecklistItem[];
  blockers: MigrationCutoverChecklistItem[];
  warnings: MigrationCutoverChecklistItem[];
  nextActions: string[];
  signatureRoles: string[];
}

export interface BuildMigrationCutoverDecisionInput {
  objectName: string;
  readinessResult: MigrationReadinessResult;
  selectedAreaIds: MigrationAreaId[];
  batchComparison: MigrationBatchComparison;
  fieldMappingProfile: MigrationFieldMappingProfileRecord | null;
  remediationActions: MigrationRemediationActionRecord[];
  manualChecks: MigrationCutoverManualChecks;
  now?: Date;
}

export const migrationCutoverManualCheckDefinitions: MigrationCutoverManualCheckDefinition[] = [
  {
    id: "freezeWindowConfirmed",
    category: "切换计划",
    title: "旧系统冻结时间与最终导入窗口已确认",
    owner: "PMO",
    evidence: "冻结时间、最终导入时间窗、增量数据处理方式已被业务确认。",
    nextAction: "明确竞品A只读冻结点、最终导入窗口和导入期间的数据变更处理人。",
    blocker: true,
  },
  {
    id: "rollbackPlanConfirmed",
    category: "回滚预案",
    title: "回滚预案已确认",
    owner: "管理员",
    evidence: "已明确失败回退路径、旧系统保留周期、回滚触发条件和责任人。",
    nextAction: "补齐回滚触发条件、数据恢复方式、责任人和最长恢复时间。",
    blocker: true,
  },
  {
    id: "permissionSpotCheckPassed",
    category: "权限安全",
    title: "管理员与普通用户权限抽查通过",
    owner: "管理员",
    evidence: "已用管理员和普通用户分别登录验证项目访问范围和审计记录。",
    nextAction: "完成管理员/普通用户双角色抽查，确认普通用户只能访问授权项目。",
    blocker: true,
  },
  {
    id: "feishuWriteVerified",
    category: "飞书写入",
    title: "飞书写入配置已验证",
    owner: "管理员",
    evidence: "已验证个人飞书或全局飞书配置可完成任务/文档/台账写入。",
    nextAction: "选择测试整改项或测试项目，完成一次真实飞书写入并保存链接。",
    blocker: true,
  },
  {
    id: "businessOwnerApproved",
    category: "业务签字",
    title: "业务负责人已确认切换结论",
    owner: "业务负责人",
    evidence: "业务负责人已确认新系统作为项目管理主入口，旧系统只读归档。",
    nextAction: "组织迁移评审会，确认业务负责人、PMO、管理员签字意见。",
    blocker: true,
  },
  {
    id: "communicationReady",
    category: "上线沟通",
    title: "上线公告与使用支持已准备",
    owner: "PMO",
    evidence: "已准备上线公告、用户操作说明、问题反馈渠道和支持窗口。",
    nextAction: "补充上线公告、首周支持窗口和问题反馈入口。",
    blocker: false,
  },
];

export const defaultMigrationCutoverManualChecks: MigrationCutoverManualChecks = {
  freezeWindowConfirmed: false,
  rollbackPlanConfirmed: false,
  permissionSpotCheckPassed: false,
  feishuWriteVerified: false,
  businessOwnerApproved: false,
  communicationReady: false,
};

function check(
  id: string,
  category: string,
  title: string,
  status: MigrationCutoverCheckStatus,
  owner: string,
  evidence: string,
  nextAction: string,
  source: MigrationCutoverChecklistItem["source"] = "系统证据",
): MigrationCutoverChecklistItem {
  return { id, category, title, status, owner, evidence, nextAction, source };
}

function statusFromThreshold(pass: boolean, warning: boolean): MigrationCutoverCheckStatus {
  if (pass) return "通过";
  if (warning) return "待补充";
  return "阻断";
}

function statusLabel(status: MigrationCutoverCheckStatus): string {
  if (status === "通过") return "通过";
  if (status === "待补充") return "待补充";
  return "阻断";
}

function escapeMarkdownCell(value: unknown): string {
  return String(value ?? "-").replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function decisionFromChecklist(
  checklist: MigrationCutoverChecklistItem[],
  hasEvidence: boolean,
  batchDecision: MigrationBatchComparison["goNoGo"],
): MigrationCutoverDecision {
  if (!hasEvidence) return "Insufficient Data";
  if (checklist.some(item => item.status === "阻断")) return "No-Go";
  if (batchDecision === "No-Go") return "No-Go";
  if (batchDecision === "Insufficient Data") return "Insufficient Data";
  if (batchDecision === "Conditional Go" || checklist.some(item => item.status === "待补充")) return "Conditional Go";
  return "Go";
}

function summaryForDecision(decision: MigrationCutoverDecision, blockers: number, warnings: number): string {
  if (decision === "Go") return "正式迁移关键证据和人工确认项均已满足，可以进入切换评审和签字归档。";
  if (decision === "Conditional Go") return `具备有条件切换基础，但仍有 ${warnings} 项需补充或在切换前跟踪关闭。`;
  if (decision === "No-Go") return `当前存在 ${blockers} 项阻断，不建议进入正式迁移。`;
  return "系统证据不足，至少需要字段映射方案、两轮试迁移批次和整改闭环数据后再生成正式决策。";
}

export function buildMigrationCutoverDecision(input: BuildMigrationCutoverDecisionInput): MigrationCutoverDecisionPackage {
  const selectedAreas = new Set(input.selectedAreaIds);
  const latestSnapshot = input.batchComparison.snapshots.at(-1);
  const objectActions = input.remediationActions.filter(action => action.objectName === input.objectName);
  const openActions = objectActions.filter(action => action.status !== "已关闭");
  const openP0Actions = objectActions.filter(action => action.priority === "P0" && action.status !== "已关闭");
  const feishuSyncedActionCount = objectActions.filter(action => action.feishuSyncStatus === "已同步").length;
  const profile = input.fieldMappingProfile;
  const profileCoverage = profile?.fieldCoverageRate ?? 0;
  const profileMissing = profile?.missingFieldCount ?? 0;

  const checklist: MigrationCutoverChecklistItem[] = [];
  checklist.push(check(
    "readiness-score",
    "迁移成熟度",
    "迁移成熟度达到正式切换标准",
    statusFromThreshold(input.readinessResult.score >= 85, input.readinessResult.score >= 65),
    "PMO",
    `当前成熟度 ${input.readinessResult.score} 分，等级：${input.readinessResult.levelName}。`,
    input.readinessResult.score >= 85 ? "保持证据归档，进入切换评审。" : "补齐未验证迁移条件，再重新生成决策包。",
  ));
  checklist.push(check(
    "data-portability-area",
    "数据迁移",
    "数据可迁移与可信条件已验证",
    selectedAreas.has("data-portability") ? "通过" : "阻断",
    "管理员",
    selectedAreas.has("data-portability") ? "迁移成熟度自评已勾选数据可迁移与可信。" : "迁移成熟度自评未确认数据可迁移与可信。",
    "完成样例导入、字段映射、质量检查和问题清单确认。",
  ));
  checklist.push(check(
    "security-area",
    "权限安全",
    "权限、安全与审计条件已验证",
    selectedAreas.has("security") ? "通过" : "阻断",
    "管理员",
    selectedAreas.has("security") ? "迁移成熟度自评已勾选权限、安全与审计。" : "迁移成熟度自评未确认权限、安全与审计。",
    "完成项目级授权、普通用户访问范围和审计导出检查。",
  ));
  checklist.push(check(
    "collaboration-area",
    "飞书协作",
    "飞书/协作系统打通条件已验证",
    selectedAreas.has("collaboration") ? "通过" : "待补充",
    "管理员",
    selectedAreas.has("collaboration") ? "迁移成熟度自评已勾选飞书/协作系统打通。" : "迁移成熟度自评尚未确认飞书/协作系统打通。",
    "至少完成一次飞书任务、文档或台账写入闭环验证。",
  ));
  checklist.push(check(
    "field-mapping-profile",
    "字段映射",
    "字段映射方案已冻结",
    profile
      ? statusFromThreshold(profileCoverage >= 95 && profileMissing === 0, profileCoverage >= 90)
      : "阻断",
    "PMO",
    profile
      ? `当前方案：${profile.profileName}；覆盖率 ${profileCoverage}%；缺失字段 ${profileMissing} 项。`
      : "当前数据对象没有可引用的字段映射方案。",
    profile ? "正式导入前由 PMO 确认字段口径不再变更。" : "先保存字段映射方案，再生成正式迁移决策包。",
  ));
  checklist.push(check(
    "trial-batch-count",
    "试迁移批次",
    "至少完成两轮试迁移批次",
    statusFromThreshold(input.batchComparison.snapshots.length >= 2, input.batchComparison.snapshots.length === 1),
    "PMO",
    `当前已保存 ${input.batchComparison.snapshots.length} 轮试迁移批次。`,
    "至少保留修正前和修正后两轮批次，支撑趋势复盘。",
  ));
  checklist.push(check(
    "latest-batch-quality",
    "试迁移质量",
    "最新批次满足正式迁移质量门槛",
    latestSnapshot
      ? statusFromThreshold(latestSnapshot.canTrialImport && latestSnapshot.fieldCoverageRate >= 95 && latestSnapshot.highIssueCount === 0, latestSnapshot.fieldCoverageRate >= 90 && latestSnapshot.highIssueCount === 0)
      : "阻断",
    "PMO",
    latestSnapshot
      ? `最新批次：${latestSnapshot.batchName}；覆盖率 ${latestSnapshot.fieldCoverageRate}%；高优先级问题 ${latestSnapshot.highIssueCount} 项。`
      : "没有可引用的最新试迁移批次。",
    "补齐字段映射并关闭高优先级问题后，再保存新批次。",
  ));
  checklist.push(check(
    "remediation-closure",
    "整改闭环",
    "迁移整改项关闭率达标",
    latestSnapshot
      ? statusFromThreshold(latestSnapshot.remediationTotal === 0 || (latestSnapshot.remediationClosureRate >= 80 && openP0Actions.length === 0), latestSnapshot.remediationClosureRate >= 60 && openP0Actions.length === 0)
      : "阻断",
    "项目经理",
    latestSnapshot
      ? `最新批次整改关闭率 ${latestSnapshot.remediationClosureRate}%；未关闭 P0 整改项 ${openP0Actions.length} 项。`
      : "没有试迁移批次，无法判断整改关闭率。",
    "推动 P0 整改项关闭，并将整体关闭率提升到 80% 以上。",
  ));
  checklist.push(check(
    "batch-trend",
    "趋势判断",
    "多轮试迁移趋势支持切换",
    input.batchComparison.goNoGo === "Go"
      ? "通过"
      : input.batchComparison.goNoGo === "Conditional Go"
        ? "待补充"
        : "阻断",
    "PMO",
    `批次趋势建议：${input.batchComparison.goNoGo}；${input.batchComparison.summary}`,
    "根据趋势摘要关闭阻断项，必要时再跑一轮试迁移。",
  ));

  for (const definition of migrationCutoverManualCheckDefinitions) {
    const passed = input.manualChecks[definition.id];
    checklist.push(check(
      `manual-${definition.id}`,
      definition.category,
      definition.title,
      passed ? "通过" : definition.blocker ? "阻断" : "待补充",
      definition.owner,
      passed ? definition.evidence : "当前页面尚未勾选该人工确认项。",
      passed ? "保留确认记录，下载决策包后进入签字归档。" : definition.nextAction,
      "人工确认",
    ));
  }

  const hasEvidence = Boolean(profile) && input.batchComparison.snapshots.length > 0;
  const blockers = checklist.filter(item => item.status === "阻断");
  const warnings = checklist.filter(item => item.status === "待补充");
  const decision = decisionFromChecklist(checklist, hasEvidence, input.batchComparison.goNoGo);

  const evidenceSummary: MigrationCutoverEvidenceSummary = {
    readinessScore: input.readinessResult.score,
    readinessLevel: input.readinessResult.levelName,
    fieldMappingProfileName: profile?.profileName ?? "未选择",
    fieldCoverageRate: profileCoverage,
    missingFieldCount: profileMissing,
    batchCount: input.batchComparison.snapshots.length,
    latestBatchName: latestSnapshot?.batchName ?? "暂无",
    latestBatchCoverageRate: latestSnapshot?.fieldCoverageRate ?? 0,
    latestHighIssueCount: latestSnapshot?.highIssueCount ?? 0,
    remediationClosureRate: latestSnapshot?.remediationClosureRate ?? 0,
    openRemediationCount: openActions.length,
    openP0RemediationCount: openP0Actions.length,
    feishuSyncedActionCount,
    feishuActionCount: objectActions.length,
  };

  return {
    objectName: input.objectName,
    generatedAt: (input.now ?? new Date()).toISOString(),
    decision,
    summary: summaryForDecision(decision, blockers.length, warnings.length),
    evidenceSummary,
    checklist,
    blockers,
    warnings,
    nextActions: (blockers.length > 0 ? blockers : warnings).slice(0, 6).map(item => `${item.title}：${item.nextAction}`),
    signatureRoles: ["PMO负责人", "业务负责人", "系统管理员", "项目经理代表"],
  };
}

export function buildMigrationCutoverDecisionReport(decisionPackage: MigrationCutoverDecisionPackage): string {
  const evidence = decisionPackage.evidenceSummary;
  const checklistRows = decisionPackage.checklist.map(item => [
    escapeMarkdownCell(item.category),
    escapeMarkdownCell(item.title),
    statusLabel(item.status),
    escapeMarkdownCell(item.owner),
    escapeMarkdownCell(item.source),
    escapeMarkdownCell(item.evidence),
    escapeMarkdownCell(item.nextAction),
  ].join(" | "));
  const signatureRows = decisionPackage.signatureRoles.map(role => [
    escapeMarkdownCell(role),
    "",
    "",
    "",
  ].join(" | "));

  return [
    `# ${decisionPackage.objectName}正式迁移 Go/No-Go 决策包`,
    "",
    "## 一、决策结论",
    "",
    `- 生成时间：${decisionPackage.generatedAt}`,
    `- 数据对象：${decisionPackage.objectName}`,
    `- Go/No-Go 结论：${decisionPackage.decision}`,
    `- 结论说明：${decisionPackage.summary}`,
    "",
    "## 二、证据摘要",
    "",
    `- 迁移成熟度：${evidence.readinessScore} 分 / ${evidence.readinessLevel}`,
    `- 字段映射方案：${evidence.fieldMappingProfileName}；覆盖率 ${evidence.fieldCoverageRate}%；缺失字段 ${evidence.missingFieldCount} 项`,
    `- 试迁移批次：${evidence.batchCount} 轮；最新批次 ${evidence.latestBatchName}；覆盖率 ${evidence.latestBatchCoverageRate}%；高优先级问题 ${evidence.latestHighIssueCount} 项`,
    `- 整改闭环：关闭率 ${evidence.remediationClosureRate}%；未关闭整改项 ${evidence.openRemediationCount} 项；未关闭 P0 ${evidence.openP0RemediationCount} 项`,
    `- 飞书协同：已同步整改任务 ${evidence.feishuSyncedActionCount}/${evidence.feishuActionCount} 项`,
    "",
    "## 三、正式迁移检查清单",
    "",
    "| 分类 | 检查项 | 状态 | 责任人 | 来源 | 证据 | 下一步 |",
    "|---|---|---|---|---|---|---|",
    ...checklistRows,
    "",
    "## 四、阻断项与补充项",
    "",
    ...(decisionPackage.blockers.length > 0 ? decisionPackage.blockers.map(item => `- 阻断：${item.title}；${item.nextAction}`) : ["- 无阻断项。"]),
    ...(decisionPackage.warnings.length > 0 ? decisionPackage.warnings.map(item => `- 待补充：${item.title}；${item.nextAction}`) : ["- 无待补充项。"]),
    "",
    "## 五、下一步动作",
    "",
    ...(decisionPackage.nextActions.length > 0 ? decisionPackage.nextActions.map(action => `- ${action}`) : ["- 进入正式迁移评审会，完成签字归档。"]),
    "",
    "## 六、签字栏",
    "",
    "| 角色 | 姓名 | 意见 | 签字日期 |",
    "|---|---|---|---|",
    ...signatureRows,
    "",
    "## 七、边界",
    "",
    "- 系统证据来自已保存字段映射方案、试迁移批次、迁移整改行动项和当前迁移成熟度自评。",
    "- 人工确认项来自当前页面勾选，下载后需要在线下评审或组织流程中签字归档。",
    "- Go/No-Go 结论用于迁移评审辅助，不替代业务负责人和 PMO 的正式审批。",
  ].join("\n");
}
