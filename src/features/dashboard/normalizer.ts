import type {
  DashboardData,
  DashboardProjectRecord,
  DashboardSourceType,
  NamedValue,
  PaymentGroup,
  RegionDistribution,
  RiskProject,
  UpcomingPayment,
} from './types.ts';

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

function dateText(row: RawRow, names: string[]): string | undefined {
  const raw = value(row, names);
  if (!raw) return undefined;
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) return raw.toISOString().slice(0, 10);
  if (typeof raw === 'number') {
    const excelEpoch = new Date(Math.round((raw - 25569) * 86400 * 1000));
    if (!Number.isNaN(excelEpoch.getTime())) return excelEpoch.toISOString().slice(0, 10);
  }
  const parsed = new Date(String(raw));
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
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
      const status = normalizeStatus(text(row, ['项目状态', '当前状态', '状态']), progress);
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
      };
      project.风险等级 = ['高', '中', '低'].includes(project.风险等级) ? project.风险等级 : severityFromRecord(project);
      project.风险趋势 = ['恶化', '平稳', '改善'].includes(project.风险趋势) ? project.风险趋势 : trendFromRecord(project);
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
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return '未定';
  return `${parsed.getMonth() + 1}月`;
}

function daysLeft(date?: string): number {
  if (!date) return 30;
  const target = new Date(date);
  if (Number.isNaN(target.getTime())) return 30;
  const now = new Date();
  return Math.max(0, Math.ceil((target.getTime() - now.getTime()) / 86_400_000));
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
    { range: '<30天', count: 0, amount: 0 },
    { range: '30-60天', count: 0, amount: 0 },
    { range: '60-90天', count: 0, amount: 0 },
    { range: '>90天', count: 0, amount: 0 },
  ];
  safeRecords.forEach(item => {
    const bucket = item.回款率 <= 0.3 ? 0 : item.回款率 <= 0.6 ? 1 : item.回款率 < 1 ? 2 : 3;
    paymentGroups[bucket].count += 1;
    paymentGroups[bucket].amount += item.应收金额 || Math.max(0, item.合同金额 - item.已回款金额);
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
      .sort(([a], [b]) => Number(a.replace('月', '')) - Number(b.replace('月', '')))
      .map(([month, item]) => ({ month, contract: Number(item.contract.toFixed(2)), collection: Number(item.collection.toFixed(2)) })),
    regionDistribution: [...regionMap.values()].sort((a, b) => b.count - a.count).slice(0, 8),
    paymentGroups,
    projectLevels,
    healthMatrix: safeRecords.slice(0, 20).map(item => ({
      name: item.项目名称,
      progressDev: item.进度偏差,
      costHealth: item.成本健康度,
      status: item.成本健康度 < 60 || item.进度偏差 < -15 ? 'red' : item.成本健康度 < 75 || item.进度偏差 < -5 ? 'yellow' : 'green',
    })),
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
  normalizeProjectRows(DEFAULT_TEMPLATE_ROWS),
  { type: 'sample', name: '内置模板补充数据', note: '用于无外部数据时保持看板完整展示。' },
);
