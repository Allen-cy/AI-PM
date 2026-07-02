import type {
  DashboardData,
  DashboardProjectRecord,
  DashboardSourceType,
  KeyProjectProgress,
  NamedValue,
  PaymentGroup,
  RegionDistribution,
  RiskProject,
  UpcomingPayment,
} from './types.ts';
import sampleProjects from './sample-projects.ts';

type RawRow = Record<string, unknown>;

const STATUS_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];
const LEVEL_COLORS: Record<string, string> = {
  S: '#ef4444',
  A: '#8b5cf6',
  B: '#3b82f6',
  C: '#10b981',
  D: '#f59e0b',
};

function value(row: RawRow, names: string[]): unknown {
  for (const name of names) {
    const direct = row[name];
    if (direct !== undefined && direct !== null && direct !== '') return direct;
    const trimmed = row[name.trim()];
    if (trimmed !== undefined && trimmed !== null && trimmed !== '') return trimmed;
  }
  return undefined;
}

function text(row: RawRow, names: string[], fallback = ''): string {
  const raw = value(row, names);
  if (raw === undefined || raw === null) return fallback;
  if (Array.isArray(raw)) return raw.map(String).join('、') || fallback;
  return String(raw).trim() || fallback;
}

function number(row: RawRow, names: string[], fallback = 0): number {
  const raw = value(row, names);
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw === 'string') {
    const parsed = Number(raw.replace(/[,%￥¥万\\s]/g, ''));
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function progressPercent(row: RawRow, names: string[], fallback: number): number {
  const raw = value(row, names);
  if (raw === undefined || raw === null || raw === '') return fallback;
  const parsed = number(row, names, fallback);
  return clamp(Math.round(parsed > 1 ? parsed : parsed * 100), 0, 100);
}

function parseDateLike(raw: unknown): Date | undefined {
  if (!raw) return undefined;
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) return raw;
  const numericValue = typeof raw === 'number'
    ? raw
    : typeof raw === 'string' && /^\d+$/.test(raw.trim())
      ? Number(raw.trim())
      : undefined;
  const rawText = String(raw).trim();
  if (/^\d{8}$/.test(rawText)) {
    const year = Number(rawText.slice(0, 4));
    const month = Number(rawText.slice(4, 6));
    const day = Number(rawText.slice(6, 8));
    const parsed = new Date(Date.UTC(year, month - 1, day));
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  if (numericValue !== undefined && Number.isFinite(numericValue)) {
    const timestamp = numericValue > 1_000_000_000_000
      ? numericValue
      : numericValue > 1_000_000_000
        ? numericValue * 1000
        : undefined;
    if (timestamp !== undefined) {
      const parsed = new Date(timestamp);
      if (!Number.isNaN(parsed.getTime())) return parsed;
    }
    if (numericValue > 20_000 && numericValue < 80_000) {
      const excelEpoch = new Date(Math.round((numericValue - 25569) * 86400 * 1000));
      if (!Number.isNaN(excelEpoch.getTime())) return excelEpoch;
    }
  }
  const parsed = new Date(String(raw));
  if (!Number.isNaN(parsed.getTime())) return parsed;
  return undefined;
}

function dateText(row: RawRow, names: string[]): string | undefined {
  const raw = value(row, names);
  if (!raw) return undefined;
  const parsed = parseDateLike(raw);
  if (parsed) return parsed.toISOString().slice(0, 10);
  return String(raw);
}

function normalizeStatus(status: string, progress: number): string {
  if (status) return status;
  if (progress >= 1) return '已验收';
  if (progress > 0) return '交付中';
  return '未交付';
}

function normalizeLevel(level: string, index: number): string {
  if (level) return level.replace(/级/g, '').trim().toUpperCase();
  return ['S', 'A', 'B', 'C'][index % 4];
}

function severityFromRecord(record: Pick<DashboardProjectRecord, '进度偏差' | '成本健康度' | '回款率'>): '高' | '中' | '低' {
  if (record.进度偏差 < -15 || record.成本健康度 < 60 || record.回款率 < 0.3) return '高';
  if (record.进度偏差 < -5 || record.成本健康度 < 75 || record.回款率 < 0.6) return '中';
  return '低';
}

function trendFromRecord(record: Pick<DashboardProjectRecord, '进度偏差' | '成本健康度'>): '恶化' | '平稳' | '改善' {
  if (record.进度偏差 < -10 || record.成本健康度 < 60) return '恶化';
  if (record.进度偏差 > 5 && record.成本健康度 >= 80) return '改善';
  return '平稳';
}

function keyProjectInfo(record: Pick<DashboardProjectRecord, '项目等级' | '合同金额' | '风险等级' | '进度偏差' | '应收金额'>, row: RawRow): {
  marker: string;
  isKey: boolean;
  reason: string;
} {
  const rawMarker = text(row, ['重点项目标记', '重点项目', '是否重点项目', '是否重点', '重点项目等级']);
  const normalized = rawMarker.replace(/\s/g, '').toLowerCase();
  const explicitTrue = ['是', '重点', 'true', 'yes', 'y', '1', 's', 'a', '战略', '核心'].some(item => normalized.includes(item));
  const explicitFalse = ['否', 'false', 'no', 'n', '0', '非重点'].some(item => normalized.includes(item));
  if (rawMarker && (explicitTrue || explicitFalse)) {
    return {
      marker: rawMarker,
      isKey: explicitTrue && !explicitFalse,
      reason: explicitTrue && !explicitFalse ? `飞书字段标记：${rawMarker}` : '飞书字段标记为非重点项目',
    };
  }

  const reasons: string[] = [];
  if (['S', 'A'].includes(record.项目等级)) reasons.push(`${record.项目等级}级项目`);
  if (record.合同金额 >= 300) reasons.push('合同金额较高');
  if (record.风险等级 === '高') reasons.push('高风险项目');
  if (record.进度偏差 <= -15) reasons.push('进度严重偏差');
  if (record.应收金额 >= 100) reasons.push('应收金额较高');
  return {
    marker: reasons.length > 0 ? '自动识别' : '否',
    isKey: reasons.length > 0,
    reason: reasons.length > 0 ? reasons.join('、') : '未触发重点项目规则',
  };
}

function deriveStageProgress(record: DashboardProjectRecord, row: RawRow): {
  executionProgress: number;
  monitoringProgress: number;
  closingProgress: number;
  dependencyNote: string;
} {
  const currentProgress = clamp(Math.round(record.当前进度 * 100), 0, 100);
  const riskPenalty = record.风险等级 === '高' ? 18 : record.风险等级 === '中' ? 8 : 0;
  const costAdjustment = record.成本健康度 >= 85 ? 6 : record.成本健康度 < 65 ? -10 : 0;
  const executionProgress = progressPercent(row, ['执行阶段进度', '执行进度', '交付执行进度'], currentProgress);
  const monitoringFallback = executionProgress < 20
    ? 0
    : clamp(Math.round(executionProgress + costAdjustment - riskPenalty), 0, 100);
  const monitoringProgress = progressPercent(row, ['监控阶段进度', '监控进度', '监控闭环进度'], monitoringFallback);
  const statusText = record.项目状态;
  const closingSeed = statusText.includes('验收') || statusText.includes('收尾') || statusText.includes('结项')
    ? Math.max(40, Math.round((executionProgress + monitoringProgress) / 2))
    : executionProgress >= 80 && monitoringProgress >= 70
      ? Math.round((executionProgress - 80) * 3 + (monitoringProgress - 70))
      : 0;
  const closingProgress = progressPercent(row, ['收尾阶段进度', '收尾进度', '验收收尾进度'], clamp(closingSeed, 0, 100));
  const dependencyNote = executionProgress < 50
    ? '监控和收尾依赖执行阶段形成稳定交付数据'
    : monitoringProgress < 70
      ? '收尾依赖监控阶段完成风险、质量和偏差闭环'
      : record.应收金额 > 0
        ? '收尾依赖验收、归档与回款/应收闭环'
        : '执行、监控、收尾链路基本连贯';
  return { executionProgress, monitoringProgress, closingProgress, dependencyNote };
}

export function normalizeProjectRows(rows: RawRow[]): DashboardProjectRecord[] {
  return rows
    .filter(row => text(row, ['项目名称', '项目', '商机项目名称', '合同名称']))
    .map((row, index) => {
      const contract = number(row, ['合同金额', '合同额（万）', '合同额', '合同总额', '合同金额（万）']);
      const collection = number(row, ['已回款金额', '回款额', '实收金额', '核销金额']);
      const progressRaw = number(row, ['当前进度', '完成度'], 0);
      const progress = progressRaw > 1 ? progressRaw / 100 : progressRaw;
      const receivable = Math.max(0, number(row, ['应收金额', '应催账款'], contract - collection));
      const collectionRate = contract > 0 ? collection / contract : number(row, ['回款率'], 0);
      const progressDev = number(row, ['进度偏差', '交付延期'], text(row, ['交付延期']) === '是' ? -12 : Math.round((progress - 0.8) * 30));
      const costHealth = number(row, ['成本健康度'], Math.max(45, Math.min(95, 100 - Math.max(0, receivable / Math.max(contract || 1, 1)) * 25 - Math.max(0, -progressDev))));
      const status = normalizeStatus(text(row, ['当前状态', '项目状态', '状态']), progress);
      const level = normalizeLevel(text(row, ['项目等级', '项目分级']), index);
      const dueDate = dateText(row, ['到期日期', '截止时间', '计划完成', '计划交付时间']);
      const project: DashboardProjectRecord = {
        项目编号: text(row, ['项目编号', 'project_id', 'OA单据编号', 'contract_id'], `P-${String(index + 1).padStart(4, '0')}`),
        项目名称: text(row, ['项目名称', '项目', '商机项目名称', '合同名称'], `项目${index + 1}`),
        省份: text(row, ['省份', '区域'], ['华东', '华北', '华南', '西南', '华中'][index % 5]),
        客户名称: text(row, ['客户名称', '合同方', '渠道名称', '甲方'], `客户${index + 1}`),
        项目状态: status,
        项目等级: level,
        项目类型: text(row, ['项目类型'], '信息化'),
        产品类别: text(row, ['产品类别', '产品类型'], '未分类'),
        签约时间: dateText(row, ['签约时间', ' 签约时间', '签订日期']),
        计划开始: dateText(row, ['计划开始', '开始时间']),
        计划完成: dueDate,
        当前进度: progress,
        合同金额: contract,
        已回款金额: collection,
        应收金额: receivable,
        回款率: collectionRate,
        成本健康度: costHealth,
        进度偏差: progressDev,
        风险类型: text(row, ['风险类型', '风险类别'], progressDev < -5 ? '进度风险' : receivable > 0 ? '回款风险' : '综合风险'),
        风险等级: text(row, ['风险等级', '严重度']) as '高' | '中' | '低',
        风险状态: text(row, ['风险状态'], status.includes('验收') ? '监控中' : '已识别'),
        风险趋势: text(row, ['风险趋势']) as '恶化' | '平稳' | '改善',
        到期日期: dueDate,
        预算金额: number(row, ['预算金额', '项目预算', '预算'], Number.NaN),
        计划成本: number(row, ['计划成本', '成本预算'], Number.NaN),
        实际成本: number(row, ['实际成本', '已发生成本', '累计成本', 'AC'], Number.NaN),
        预计成本: number(row, ['预计成本', '预测成本', 'EAC'], Number.NaN),
        毛利: number(row, ['毛利', '项目毛利'], Number.NaN),
        毛利率: number(row, ['毛利率'], Number.NaN),
        验收状态: text(row, ['验收状态', '客户验收状态', '交付验收状态']),
        验收日期: dateText(row, ['验收日期', '客户验收日期']),
        验收进度: number(row, ['验收进度'], Number.NaN),
        回款条件: text(row, ['回款条件', '付款条件']),
        开票金额: number(row, ['开票金额', '已开票金额'], Number.NaN),
        未开票金额: number(row, ['未开票金额'], Number.NaN),
      };
      project.风险等级 = ['高', '中', '低'].includes(project.风险等级) ? project.风险等级 : severityFromRecord(project);
      project.风险趋势 = ['恶化', '平稳', '改善'].includes(project.风险趋势) ? project.风险趋势 : trendFromRecord(project);
      const keyInfo = keyProjectInfo(project, row);
      const stageProgress = deriveStageProgress(project, row);
      project.重点项目标记 = keyInfo.marker;
      project.是否重点项目 = keyInfo.isKey;
      project.重点项目原因 = keyInfo.reason;
      project.执行阶段进度 = stageProgress.executionProgress;
      project.监控阶段进度 = stageProgress.monitoringProgress;
      project.收尾阶段进度 = stageProgress.closingProgress;
      return project;
    });
}

function distribution<T extends string>(values: T[], palette = STATUS_COLORS): NamedValue[] {
  const counts = new Map<string, number>();
  values.forEach(item => counts.set(item || '未分类', (counts.get(item || '未分类') ?? 0) + 1));
  return [...counts.entries()].map(([name, count], index) => ({
    name,
    value: count,
    color: LEVEL_COLORS[name] ?? palette[index % palette.length],
  }));
}

function monthKey(date?: string): string {
  if (!date) return '未定';
  const parsed = parseDateLike(date);
  if (!parsed) return '未定';
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}`;
}

function daysLeft(date?: string): number {
  if (!date) return 30;
  const target = parseDateLike(date);
  if (!target) return 30;
  const now = new Date();
  return Math.max(0, Math.ceil((target.getTime() - now.getTime()) / 86_400_000));
}

function daysUntilDue(date?: string): number | null {
  if (!date) return null;
  const target = parseDateLike(date);
  if (!target) return null;
  const now = new Date();
  return Math.ceil((target.getTime() - now.getTime()) / 86_400_000);
}

function paymentAgingBucket(date?: string): number {
  const remainingDays = daysUntilDue(date);
  if (remainingDays === null) return 5;
  if (remainingDays >= 0) return 0;
  const overdueDays = Math.abs(remainingDays);
  if (overdueDays <= 30) return 1;
  if (overdueDays <= 60) return 2;
  if (overdueDays <= 90) return 3;
  return 4;
}

export function buildDashboardData(
  records: DashboardProjectRecord[],
  source: { type: DashboardSourceType; name: string; note?: string },
): DashboardData {
  const safeRecords = records.length > 0 ? records : normalizeProjectRows(DEFAULT_TEMPLATE_ROWS);
  const totalContract = safeRecords.reduce((sum, item) => sum + item.合同金额, 0);
  const totalCollection = safeRecords.reduce((sum, item) => sum + item.已回款金额, 0);
  const receivable = safeRecords.reduce((sum, item) => sum + item.应收金额, 0);
  const statusDistribution = distribution(safeRecords.map(item => item.项目状态));
  const projectLevels = distribution(safeRecords.map(item => `${item.项目等级}级`), ['#8b5cf6', '#3b82f6', '#10b981', '#f59e0b']);
  const regionMap = new Map<string, RegionDistribution>();
  const monthMap = new Map<string, { contract: number; collection: number }>();
  safeRecords.forEach(item => {
    const region = item.省份 || '未分类';
    const regionValue = regionMap.get(region) ?? { region, count: 0, amount: 0 };
    regionValue.count += 1;
    regionValue.amount += item.合同金额;
    regionMap.set(region, regionValue);
    const month = monthKey(item.签约时间 || item.计划开始);
    const monthValue = monthMap.get(month) ?? { contract: 0, collection: 0 };
    monthValue.contract += item.合同金额;
    monthValue.collection += item.已回款金额;
    monthMap.set(month, monthValue);
  });

  const paymentGroups: PaymentGroup[] = [
    { range: '未到期', count: 0, amount: 0 },
    { range: '逾期1-30天', count: 0, amount: 0 },
    { range: '逾期31-60天', count: 0, amount: 0 },
    { range: '逾期61-90天', count: 0, amount: 0 },
    { range: '逾期90天以上', count: 0, amount: 0 },
    { range: '未设到期日', count: 0, amount: 0 },
  ];
  safeRecords.forEach(item => {
    const openReceivable = item.应收金额 || Math.max(0, item.合同金额 - item.已回款金额);
    if (openReceivable <= 0) return;
    const bucket = paymentAgingBucket(item.到期日期);
    paymentGroups[bucket].count += 1;
    paymentGroups[bucket].amount += openReceivable;
  });

  const riskProjects: RiskProject[] = safeRecords
    .filter(item => item.风险等级 !== '低' || item.进度偏差 < -5 || item.应收金额 > 0)
    .sort((a, b) => ({ 高: 3, 中: 2, 低: 1 }[b.风险等级] - { 高: 3, 中: 2, 低: 1 }[a.风险等级]))
    .slice(0, 8)
    .map(item => ({
      id: item.项目编号,
      name: item.项目名称,
      riskType: item.风险类型,
      severity: item.风险等级,
      status: item.风险状态,
      trend: item.风险趋势,
    }));

  const upcomingPayments: UpcomingPayment[] = safeRecords
    .filter(item => item.应收金额 > 0)
    .sort((a, b) => daysLeft(a.到期日期) - daysLeft(b.到期日期))
    .slice(0, 8)
    .map(item => ({
      project: item.项目名称,
      party: item.客户名称,
      amount: item.应收金额,
      dueDate: item.到期日期 ?? '未定',
      daysLeft: daysLeft(item.到期日期),
    }));

  const keyProjects: KeyProjectProgress[] = safeRecords
    .filter(item => item.是否重点项目)
    .sort((a, b) => {
      const riskScore = { 高: 3, 中: 2, 低: 1 };
      const levelScore = { S: 4, A: 3, B: 2, C: 1, D: 0 } as Record<string, number>;
      return (
        (levelScore[b.项目等级] ?? 0) - (levelScore[a.项目等级] ?? 0)
        || riskScore[b.风险等级] - riskScore[a.风险等级]
        || b.合同金额 - a.合同金额
      );
    })
    .slice(0, 8)
    .map(item => ({
      id: item.项目编号,
      name: item.项目名称,
      level: item.项目等级,
      status: item.项目状态,
      marker: item.重点项目标记 ?? '自动识别',
      reason: item.重点项目原因 ?? '重点项目',
      executionProgress: item.执行阶段进度 ?? clamp(Math.round(item.当前进度 * 100), 0, 100),
      monitoringProgress: item.监控阶段进度 ?? 0,
      closingProgress: item.收尾阶段进度 ?? 0,
      riskLevel: item.风险等级,
      riskType: item.风险类型,
      receivable: item.应收金额,
      dueDate: item.到期日期,
      dependencyNote: deriveStageProgress(item, item as unknown as RawRow).dependencyNote,
    }));

  return {
    source: {
      ...source,
      generatedAt: new Date().toISOString(),
    },
    kpi: {
      totalProjects: safeRecords.length,
      totalContract: Number(totalContract.toFixed(2)),
      totalCollection: Number(totalCollection.toFixed(2)),
      collectionRate: totalContract > 0 ? Number(((totalCollection / totalContract) * 100).toFixed(1)) : 0,
      receivable: Number(receivable.toFixed(2)),
    },
    statusDistribution,
    monthlyTrend: [...monthMap.entries()]
      .filter(([month]) => month !== '未定')
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, item]) => ({ month, contract: Number(item.contract.toFixed(2)), collection: Number(item.collection.toFixed(2)) })),
    regionDistribution: [...regionMap.values()].sort((a, b) => b.count - a.count).slice(0, 8),
    paymentGroups: paymentGroups.map(item => ({ ...item, amount: Number(item.amount.toFixed(2)) })),
    projectLevels,
    healthMatrix: safeRecords.slice(0, 20).map(item => ({
      name: item.项目名称,
      progressDev: item.进度偏差,
      costHealth: item.成本健康度,
      status: item.成本健康度 < 60 || item.进度偏差 < -15 ? 'red' : item.成本健康度 < 75 || item.进度偏差 < -5 ? 'yellow' : 'green',
    })),
    keyProjects,
    riskProjects,
    upcomingPayments,
    records: safeRecords,
  };
}

export const DEFAULT_TEMPLATE_ROWS: RawRow[] = [
  {
    项目编号: 'PMO-2026-001',
    省份: '江苏',
    项目名称: '智慧校园一期',
    客户名称: '某市教育局',
    项目状态: '执行中',
    项目等级: 'A',
    项目类型: '信息化',
    产品类别: '智慧作业',
    签约时间: '2026-01-15',
    计划完成: '2026-07-30',
    当前进度: 0.62,
    合同金额: 280,
    已回款金额: 120,
    应收金额: 160,
    成本健康度: 82,
    进度偏差: -6,
  },
  {
    项目编号: 'PMO-2026-002',
    省份: '河南',
    项目名称: '质量监测平台',
    客户名称: '某省教研院',
    项目状态: '验收中',
    项目等级: 'S',
    项目类型: '信息化',
    产品类别: '质量监测',
    签约时间: '2026-02-20',
    计划完成: '2026-06-30',
    当前进度: 0.95,
    合同金额: 420,
    已回款金额: 300,
    应收金额: 120,
    成本健康度: 88,
    进度偏差: 2,
  },
  {
    项目编号: 'PMO-2026-003',
    省份: '山东',
    项目名称: '智慧作业区域平台',
    客户名称: '某区教育局',
    项目状态: '待启动',
    项目等级: 'B',
    项目类型: '信息化',
    产品类别: '智慧作业',
    签约时间: '2026-03-18',
    计划完成: '2026-09-15',
    当前进度: 0.15,
    合同金额: 160,
    已回款金额: 48,
    应收金额: 112,
    成本健康度: 72,
    进度偏差: -18,
  },
];

export const DEFAULT_DASHBOARD_DATA = buildDashboardData(
  sampleProjects.records as unknown as DashboardProjectRecord[],
  {
    type: 'sample',
    name: '作业帮项目样例数据源',
    note: '来源：知识库（大厂最佳实践沉淀）/作业帮/项目台账&一表通/项目/样例数据源.xlsx；缺失的看板字段已按规则补充测试值。',
  },
);
