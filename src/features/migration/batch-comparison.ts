import type { MigrationRemediationActionRecord } from "./remediation-repository.ts";
import type { MigrationBatchRecord } from "./repository.ts";

export type MigrationBatchTrendVerdict = "改善" | "退化" | "持平" | "样本不足";
export type MigrationBatchGoNoGo = "Go" | "Conditional Go" | "No-Go" | "Insufficient Data";

export interface MigrationBatchComparisonSnapshot {
  batchId: string;
  batchName: string;
  objectName: string;
  createdAt: string;
  totalRows: number;
  fieldCoverageRate: number;
  qualityIssueCount: number;
  highIssueCount: number;
  canTrialImport: boolean;
  remediationTotal: number;
  remediationClosed: number;
  remediationClosureRate: number;
}

export interface MigrationBatchComparisonDelta {
  batchId: string;
  batchName: string;
  coverageDelta: number;
  qualityIssueDelta: number;
  highIssueDelta: number;
  remediationClosureDelta: number;
  verdict: MigrationBatchTrendVerdict;
}

export interface MigrationBatchComparison {
  objectName: string;
  generatedAt: string;
  snapshots: MigrationBatchComparisonSnapshot[];
  deltas: MigrationBatchComparisonDelta[];
  summary: string;
  goNoGo: MigrationBatchGoNoGo;
  nextActions: string[];
}

export interface BuildMigrationBatchComparisonInput {
  objectName: string;
  batches: MigrationBatchRecord[];
  remediationActions: MigrationRemediationActionRecord[];
  now?: Date;
}

function pct(part: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((part / total) * 100);
}

function actionBelongsToBatch(action: MigrationRemediationActionRecord, batch: MigrationBatchRecord): boolean {
  if (action.batchId && action.batchId === batch.id) return true;
  return Boolean(action.batchName && action.batchName === batch.batchName && action.objectName === batch.objectName);
}

function trendVerdict(delta: Omit<MigrationBatchComparisonDelta, "batchId" | "batchName" | "verdict">): MigrationBatchTrendVerdict {
  const improvementScore = [
    delta.coverageDelta > 0 ? 1 : delta.coverageDelta < 0 ? -1 : 0,
    delta.qualityIssueDelta < 0 ? 1 : delta.qualityIssueDelta > 0 ? -1 : 0,
    delta.highIssueDelta < 0 ? 1 : delta.highIssueDelta > 0 ? -1 : 0,
    delta.remediationClosureDelta > 0 ? 1 : delta.remediationClosureDelta < 0 ? -1 : 0,
  ].reduce((sum, item) => sum + item, 0);
  if (improvementScore > 0) return "改善";
  if (improvementScore < 0) return "退化";
  return "持平";
}

function deriveGoNoGo(snapshots: MigrationBatchComparisonSnapshot[]): MigrationBatchGoNoGo {
  if (snapshots.length === 0) return "Insufficient Data";
  const latest = snapshots.at(-1)!;
  if (latest.highIssueCount > 0) return "No-Go";
  if (latest.canTrialImport && latest.fieldCoverageRate >= 95 && (latest.remediationTotal === 0 || latest.remediationClosureRate >= 80)) return "Go";
  if (latest.fieldCoverageRate >= 90 && latest.qualityIssueCount <= 3) return "Conditional Go";
  return "No-Go";
}

function deriveSummary(snapshots: MigrationBatchComparisonSnapshot[], deltas: MigrationBatchComparisonDelta[], goNoGo: MigrationBatchGoNoGo): string {
  if (snapshots.length === 0) return "暂无可对比的试迁移批次。";
  if (snapshots.length === 1) return "当前只有1轮试迁移批次，需要至少2轮才能判断改善或退化趋势。";
  const latest = snapshots.at(-1)!;
  const latestDelta = deltas.at(-1)!;
  return [
    `最近一轮相对上一轮${latestDelta.verdict}：字段覆盖率${latestDelta.coverageDelta >= 0 ? "+" : ""}${latestDelta.coverageDelta}个百分点`,
    `质量问题${latestDelta.qualityIssueDelta >= 0 ? "+" : ""}${latestDelta.qualityIssueDelta}项`,
    `高优先级问题${latestDelta.highIssueDelta >= 0 ? "+" : ""}${latestDelta.highIssueDelta}项`,
    `整改关闭率${latestDelta.remediationClosureDelta >= 0 ? "+" : ""}${latestDelta.remediationClosureDelta}个百分点。`,
    `当前建议：${goNoGo}；最新批次字段覆盖率${latest.fieldCoverageRate}%，高优先级问题${latest.highIssueCount}项，整改关闭率${latest.remediationClosureRate}%。`,
  ].join("");
}

function deriveNextActions(snapshots: MigrationBatchComparisonSnapshot[], goNoGo: MigrationBatchGoNoGo): string[] {
  if (snapshots.length === 0) return ["先保存至少1轮试迁移批次，再进行趋势对比。"];
  if (snapshots.length === 1) return ["再执行一轮修正后的试迁移，用于比较字段覆盖率和质量问题变化。"];
  const latest = snapshots.at(-1)!;
  const actions: string[] = [];
  if (latest.highIssueCount > 0) actions.push("先关闭最新批次中的高优先级质量问题，再讨论正式迁移。");
  if (latest.fieldCoverageRate < 95) actions.push("补齐字段映射，目标字段覆盖率至少达到95%。");
  if (latest.remediationTotal > 0 && latest.remediationClosureRate < 80) actions.push("推动迁移整改行动项关闭率达到80%以上，并完成复检。");
  if (goNoGo === "Go") actions.push("准备正式迁移 Go 决策材料，确认冻结字段映射方案和回滚预案。");
  if (goNoGo === "Conditional Go") actions.push("可进入有条件试点，但需列出未关闭问题、责任人和截止日期。");
  return actions.length > 0 ? actions : ["保留当前趋势证据，进入迁移评审会做 Go/No-Go 决策。"];
}

export function buildMigrationBatchComparison(input: BuildMigrationBatchComparisonInput): MigrationBatchComparison {
  const snapshots = input.batches
    .filter(batch => batch.objectName === input.objectName)
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
    .map(batch => {
      const actions = input.remediationActions.filter(action => actionBelongsToBatch(action, batch));
      const closed = actions.filter(action => action.status === "已关闭").length;
      return {
        batchId: batch.id,
        batchName: batch.batchName,
        objectName: batch.objectName,
        createdAt: batch.createdAt,
        totalRows: batch.totalRows,
        fieldCoverageRate: batch.fieldCoverageRate,
        qualityIssueCount: batch.qualityIssueCount,
        highIssueCount: batch.highIssueCount,
        canTrialImport: batch.canTrialImport,
        remediationTotal: actions.length,
        remediationClosed: closed,
        remediationClosureRate: pct(closed, actions.length),
      };
    });
  const deltas = snapshots.slice(1).map((snapshot, index) => {
    const previous = snapshots[index];
    const delta = {
      coverageDelta: snapshot.fieldCoverageRate - previous.fieldCoverageRate,
      qualityIssueDelta: snapshot.qualityIssueCount - previous.qualityIssueCount,
      highIssueDelta: snapshot.highIssueCount - previous.highIssueCount,
      remediationClosureDelta: snapshot.remediationClosureRate - previous.remediationClosureRate,
    };
    return {
      batchId: snapshot.batchId,
      batchName: snapshot.batchName,
      ...delta,
      verdict: trendVerdict(delta),
    };
  });
  const goNoGo = deriveGoNoGo(snapshots);
  return {
    objectName: input.objectName,
    generatedAt: (input.now ?? new Date()).toISOString(),
    snapshots,
    deltas,
    summary: deriveSummary(snapshots, deltas, goNoGo),
    goNoGo,
    nextActions: deriveNextActions(snapshots, goNoGo),
  };
}

function escapeMarkdownCell(value: unknown): string {
  return String(value ?? "-").replace(/\|/g, "\\|").replace(/\n/g, " ");
}

export function buildMigrationBatchComparisonReport(comparison: MigrationBatchComparison): string {
  const snapshotRows = comparison.snapshots.length > 0
    ? comparison.snapshots.map(snapshot => [
      escapeMarkdownCell(snapshot.batchName),
      snapshot.createdAt.slice(0, 10),
      snapshot.totalRows,
      `${snapshot.fieldCoverageRate}%`,
      snapshot.qualityIssueCount,
      snapshot.highIssueCount,
      `${snapshot.remediationClosureRate}%`,
      snapshot.canTrialImport ? "可试迁移" : "需修正",
    ].join(" | "))
    : ["暂无批次 | - | 0 | 0% | 0 | 0 | 0% | 样本不足"];
  const deltaRows = comparison.deltas.length > 0
    ? comparison.deltas.map(delta => [
      escapeMarkdownCell(delta.batchName),
      delta.verdict,
      `${delta.coverageDelta >= 0 ? "+" : ""}${delta.coverageDelta}pp`,
      `${delta.qualityIssueDelta >= 0 ? "+" : ""}${delta.qualityIssueDelta}`,
      `${delta.highIssueDelta >= 0 ? "+" : ""}${delta.highIssueDelta}`,
      `${delta.remediationClosureDelta >= 0 ? "+" : ""}${delta.remediationClosureDelta}pp`,
    ].join(" | "))
    : ["暂无对比 | 样本不足 | - | - | - | -"];

  return [
    `# ${comparison.objectName}试迁移批次对比报告`,
    "",
    "## 一、结论",
    "",
    `- 生成时间：${comparison.generatedAt}`,
    `- Go/No-Go 建议：${comparison.goNoGo}`,
    `- 趋势摘要：${comparison.summary}`,
    "",
    "## 二、多轮批次指标",
    "",
    "| 批次 | 日期 | 样本行数 | 字段覆盖率 | 质量问题 | 高优先级问题 | 整改关闭率 | 结论 |",
    "|---|---:|---:|---:|---:|---:|---:|---|",
    ...snapshotRows,
    "",
    "## 三、相邻批次变化",
    "",
    "| 批次 | 趋势 | 覆盖率变化 | 质量问题变化 | 高优先级变化 | 整改关闭率变化 |",
    "|---|---|---:|---:|---:|---:|",
    ...deltaRows,
    "",
    "## 四、下一步动作",
    "",
    ...comparison.nextActions.map(action => `- ${action}`),
    "",
    "## 五、边界",
    "",
    "- 本报告基于系统内已保存的试迁移批次和迁移整改行动项生成。",
    "- 如果整改项未关联批次ID，则按批次名称和数据对象匹配关闭率。",
    "- Go/No-Go 建议用于迁移评审，不替代 PMO/业务负责人正式决策。",
  ].join("\n");
}
