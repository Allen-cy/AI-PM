import type { MigrationBatchComparison } from "./batch-comparison.ts";
import type { MigrationCutoverDecisionPackage } from "./cutover-decision.ts";
import type { MigrationFieldMappingProfileRecord } from "./field-mapping-repository.ts";
import type { MigrationRemediationActionRecord } from "./remediation-repository.ts";

export interface MigrationScaleReadinessGate {
  id: string;
  title: string;
  status: "通过" | "待补充" | "阻断";
  evidence: string;
  nextAction: string;
  owner: "PMO" | "管理员" | "项目经理" | "业务负责人";
}

export interface MigrationScaleReadinessDashboard {
  generatedAt: string;
  objectName: string;
  readinessLevel: "scale_ready" | "pilot_ready" | "trial_ready" | "blocked";
  readinessLabel: string;
  summary: {
    batchCount: number;
    latestCoverageRate: number;
    latestHighIssues: number;
    remediationClosureRate: number;
    openRemediation: number;
    fieldMappingProfiles: number;
    feishuSyncedActions: number;
    blockers: number;
    warnings: number;
  };
  gates: MigrationScaleReadinessGate[];
  reportFacts: string[];
  nextActions: string[];
  boundary: string;
}

function gate(input: MigrationScaleReadinessGate): MigrationScaleReadinessGate {
  return input;
}

function deriveLevel(gates: MigrationScaleReadinessGate[], batchCount: number): MigrationScaleReadinessDashboard["readinessLevel"] {
  if (gates.some(item => item.status === "阻断")) return "blocked";
  if (gates.every(item => item.status === "通过")) return "scale_ready";
  if (batchCount >= 2) return "pilot_ready";
  return "trial_ready";
}

function levelLabel(level: MigrationScaleReadinessDashboard["readinessLevel"]): string {
  if (level === "scale_ready") return "具备规模化迁移准备";
  if (level === "pilot_ready") return "具备试点放大准备";
  if (level === "trial_ready") return "仍处于试迁移准备";
  return "存在规模化阻断项";
}

export function buildMigrationScaleReadinessDashboard(input: {
  objectName: string;
  batchComparison: MigrationBatchComparison;
  cutoverDecisionPackage: MigrationCutoverDecisionPackage;
  fieldMappingProfiles: MigrationFieldMappingProfileRecord[];
  remediationActions: MigrationRemediationActionRecord[];
  now?: Date;
}): MigrationScaleReadinessDashboard {
  const latest = input.batchComparison.snapshots.at(-1);
  const objectActions = input.remediationActions.filter(action => action.objectName === input.objectName);
  const openActions = objectActions.filter(action => action.status !== "已关闭");
  const feishuSynced = objectActions.filter(action => action.feishuSyncStatus === "已同步").length;
  const activeProfiles = input.fieldMappingProfiles.filter(profile => profile.objectName === input.objectName);
  const bestProfile = activeProfiles
    .slice()
    .sort((a, b) => b.fieldCoverageRate - a.fieldCoverageRate || a.missingFieldCount - b.missingFieldCount)[0];

  const gates: MigrationScaleReadinessGate[] = [
    gate({
      id: "field-profile",
      title: "字段映射方案可复用并已冻结",
      status: bestProfile && bestProfile.fieldCoverageRate >= 95 && bestProfile.missingFieldCount === 0 ? "通过" : bestProfile ? "待补充" : "阻断",
      evidence: bestProfile ? `${bestProfile.profileName}：覆盖率 ${bestProfile.fieldCoverageRate}%，缺失 ${bestProfile.missingFieldCount} 项。` : "当前数据对象没有字段映射方案。",
      nextAction: bestProfile ? "正式迁移前由 PMO 冻结字段口径并归档。" : "先上传样例数据并保存字段映射方案。",
      owner: "PMO",
    }),
    gate({
      id: "batch-trend",
      title: "至少两轮试迁移证明趋势可控",
      status: input.batchComparison.snapshots.length >= 2 && input.batchComparison.goNoGo === "Go" ? "通过" : input.batchComparison.snapshots.length >= 2 ? "待补充" : "阻断",
      evidence: `已保存 ${input.batchComparison.snapshots.length} 轮；趋势建议 ${input.batchComparison.goNoGo}。${input.batchComparison.summary}`,
      nextAction: input.batchComparison.snapshots.length >= 2 ? "按趋势摘要关闭剩余问题。" : "完成修正前和修正后至少两轮试迁移。",
      owner: "PMO",
    }),
    gate({
      id: "quality",
      title: "最新批次无高优先级质量问题",
      status: latest && latest.highIssueCount === 0 && latest.fieldCoverageRate >= 95 ? "通过" : latest && latest.highIssueCount === 0 ? "待补充" : "阻断",
      evidence: latest ? `${latest.batchName}：覆盖率 ${latest.fieldCoverageRate}%，高优先级问题 ${latest.highIssueCount} 项。` : "没有最新批次证据。",
      nextAction: latest ? "关闭高优先级问题并提升字段覆盖率。" : "先保存试迁移批次。",
      owner: "管理员",
    }),
    gate({
      id: "remediation",
      title: "迁移整改行动项闭环",
      status: openActions.length === 0 ? "通过" : openActions.filter(action => action.priority === "P0").length === 0 ? "待补充" : "阻断",
      evidence: `整改项 ${objectActions.length} 条，未关闭 ${openActions.length} 条，飞书已同步 ${feishuSynced} 条。`,
      nextAction: "关闭 P0 整改项，并把剩余待补充项纳入飞书任务或评审纪要。",
      owner: "项目经理",
    }),
    gate({
      id: "cutover",
      title: "正式切换 Go/No-Go 决策可签字",
      status: input.cutoverDecisionPackage.decision === "Go" ? "通过" : input.cutoverDecisionPackage.decision === "Conditional Go" ? "待补充" : "阻断",
      evidence: `当前决策：${input.cutoverDecisionPackage.decision}；阻断 ${input.cutoverDecisionPackage.blockers.length} 项，待补充 ${input.cutoverDecisionPackage.warnings.length} 项。`,
      nextAction: "补齐阻断项、人工确认项和业务签字后下载正式决策包。",
      owner: "业务负责人",
    }),
  ];

  const level = deriveLevel(gates, input.batchComparison.snapshots.length);
  const blockers = gates.filter(item => item.status === "阻断");
  const warnings = gates.filter(item => item.status === "待补充");
  const reportFacts = [
    `${input.objectName}迁移规模化准备度：${levelLabel(level)}。`,
    `批次 ${input.batchComparison.snapshots.length} 轮，最新覆盖率 ${latest?.fieldCoverageRate ?? 0}%，高优先级问题 ${latest?.highIssueCount ?? 0} 项。`,
    `整改闭环：未关闭 ${openActions.length} 条，飞书已同步 ${feishuSynced}/${objectActions.length} 条。`,
    `切换决策：${input.cutoverDecisionPackage.decision}；${input.cutoverDecisionPackage.summary}`,
  ];

  return {
    generatedAt: (input.now ?? new Date()).toISOString(),
    objectName: input.objectName,
    readinessLevel: level,
    readinessLabel: levelLabel(level),
    summary: {
      batchCount: input.batchComparison.snapshots.length,
      latestCoverageRate: latest?.fieldCoverageRate ?? 0,
      latestHighIssues: latest?.highIssueCount ?? 0,
      remediationClosureRate: latest?.remediationClosureRate ?? 0,
      openRemediation: openActions.length,
      fieldMappingProfiles: activeProfiles.length,
      feishuSyncedActions: feishuSynced,
      blockers: blockers.length,
      warnings: warnings.length,
    },
    gates,
    reportFacts,
    nextActions: [...blockers, ...warnings].slice(0, 6).map(item => `${item.title}：${item.nextAction}`),
    boundary: "迁移规模化准备度基于系统内证据和页面人工确认项生成，不会直接导入全量数据，也不会替代 PMO/业务负责人的正式切换审批。",
  };
}
