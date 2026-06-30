import type { Risk } from "@/lib/risk";

export interface SensitivityFactor {
  id: string;
  name: string;
  baseline: number;
  low: number;
  high: number;
  unit?: string;
  direction: "positive" | "negative";
  note?: string;
}

export interface SensitivityResult {
  factorId: string;
  name: string;
  baseline: number;
  low: number;
  high: number;
  lowImpact: number;
  highImpact: number;
  swing: number;
  rank: number;
  interpretation: string;
}

export interface RiskTrackingUpdate {
  riskId: string;
  status: string;
  progress: number;
  owner: string;
  deadline: string;
  actionTaken: string;
  nextAction: string;
  blocker?: string;
  evidence?: string;
}

export const sensitivityTemplates: SensitivityFactor[] = [
  {
    id: "contract-amount",
    name: "合同金额/收入",
    baseline: 100,
    low: 80,
    high: 120,
    unit: "万元",
    direction: "positive",
    note: "来自敏感性分析模板中的销售收入变量。",
  },
  {
    id: "implementation-cost",
    name: "实施成本",
    baseline: 60,
    low: 48,
    high: 72,
    unit: "万元",
    direction: "negative",
    note: "来自敏感性分析模板中的经营成本变量。",
  },
  {
    id: "delivery-delay",
    name: "交付延期",
    baseline: 0,
    low: -10,
    high: 20,
    unit: "天",
    direction: "negative",
    note: "结合风险跟踪表中的进度风险。",
  },
  {
    id: "collection-delay",
    name: "回款延迟",
    baseline: 0,
    low: -15,
    high: 30,
    unit: "天",
    direction: "negative",
    note: "结合合同/回款风险。",
  },
];

export function calculateSensitivity(factors: SensitivityFactor[]): SensitivityResult[] {
  const raw = factors.map(factor => {
    const lowDelta = factor.low - factor.baseline;
    const highDelta = factor.high - factor.baseline;
    const polarity = factor.direction === "positive" ? 1 : -1;
    const lowImpact = lowDelta * polarity;
    const highImpact = highDelta * polarity;
    const swing = Math.abs(highImpact - lowImpact);
    return {
      factorId: factor.id,
      name: factor.name,
      baseline: factor.baseline,
      low: factor.low,
      high: factor.high,
      lowImpact,
      highImpact,
      swing,
      rank: 0,
      interpretation: "",
    };
  });

  return raw
    .sort((a, b) => b.swing - a.swing)
    .map((result, index) => ({
      ...result,
      rank: index + 1,
      interpretation: result.swing >= 40
        ? "高度敏感，应纳入重点风险跟踪和管理层例外预警。"
        : result.swing >= 20
          ? "中度敏感，需要设置监控阈值和应对动作。"
          : "低度敏感，可按常规复核周期观察。",
    }));
}

export function buildSensitivityReport(projectName: string, factors: SensitivityFactor[], results: SensitivityResult[]) {
  const top = results[0];
  const lines = [
    `# ${projectName || "未命名项目"} 风险敏感性分析报告`,
    "",
    "## 输入信息",
    ...factors.map(factor => `- ${factor.name}：基准 ${factor.baseline}${factor.unit || ""}，低值 ${factor.low}${factor.unit || ""}，高值 ${factor.high}${factor.unit || ""}，方向 ${factor.direction === "positive" ? "正向收益" : "负向影响"}`),
    "",
    "## 分析结果",
    ...results.map(result => `- #${result.rank} ${result.name}：摆动值 ${result.swing.toFixed(2)}，${result.interpretation}`),
    "",
    "## 管理建议",
    top
      ? `最敏感因素是「${top.name}」，建议在风险登记册中设置触发阈值、责任人和复核周期。`
      : "暂无敏感性因素，请补充输入后重新分析。",
  ];
  return lines.join("\n");
}

export function buildRiskTrackingReport(risks: Risk[], updates: RiskTrackingUpdate[]) {
  const openRisks = risks.filter(risk => !["closed", "resolved"].includes(risk.status));
  const overdue = openRisks.filter(risk => risk.dueDate && new Date(risk.dueDate).getTime() < Date.now());
  const high = openRisks.filter(risk => risk.piScore >= 16);
  const updateLines = updates.map(update => {
    const risk = risks.find(item => item.id === update.riskId || item.riskCode === update.riskId);
    return `- ${risk?.projectName || "未指定项目"} / ${risk?.description || update.riskId}：${update.actionTaken}；下一步：${update.nextAction}；责任人：${update.owner}；deadline：${update.deadline}`;
  });
  return [
    "# 风险跟踪管理报告",
    "",
    `- 开放风险：${openRisks.length}`,
    `- 高风险：${high.length}`,
    `- 已逾期风险：${overdue.length}`,
    "",
    "## 本次跟踪记录",
    ...(updateLines.length ? updateLines : ["- 暂无跟踪记录。"]),
    "",
    "## 管理建议",
    overdue.length > 0
      ? "- 存在逾期风险，应立即升级到PMO治理或项目例会。"
      : "- 当前无逾期风险，按复核周期继续跟踪。",
  ].join("\n");
}
