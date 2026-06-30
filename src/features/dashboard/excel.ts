import * as XLSX from 'xlsx';
import { buildDashboardData, normalizeProjectRows } from './normalizer.ts';
import type { DashboardData } from './types.ts';

const PREFERRED_SHEETS = [
  '23 年项目总明细表（信息化产品）',
  '项目组合数据模板',
  '项目台账',
  '项目明细',
];

function findMainSheet(workbook: XLSX.WorkBook): string {
  for (const sheetName of PREFERRED_SHEETS) {
    if (workbook.SheetNames.includes(sheetName)) return sheetName;
  }
  let best = workbook.SheetNames[0];
  let bestRows = 0;
  for (const sheetName of workbook.SheetNames) {
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheetName], {
      defval: '',
      raw: false,
    });
    if (rows.length > bestRows) {
      best = sheetName;
      bestRows = rows.length;
    }
  }
  return best;
}

function sheetRows(workbook: XLSX.WorkBook, sheetName: string): Record<string, unknown>[] {
  const sheet = workbook.Sheets[sheetName];
  const direct = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '', raw: false });
  const directHasProject = direct.some(row => row['项目名称'] || row['项目']);
  if (directHasProject) return direct;
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: '',
    raw: false,
    range: 1,
  });
}

export function parseDashboardWorkbook(buffer: ArrayBuffer, fileName: string): DashboardData {
  const workbook = XLSX.read(buffer, {
    type: 'array',
    cellDates: true,
  });
  const sheetName = findMainSheet(workbook);
  const rows = sheetRows(workbook, sheetName);
  const records = normalizeProjectRows(rows);
  return buildDashboardData(records, {
    type: 'file',
    name: fileName,
    note: `来源工作表：${sheetName}；缺失的看板字段已按规则补充测试值。`,
  });
}

export function createDashboardTemplateWorkbook(): Buffer {
  const headers = [
    '项目编号',
    '省份',
    '项目名称',
    '客户名称',
    '项目状态',
    '项目等级',
    '项目类型',
    '产品类别',
    '签约时间',
    '计划开始',
    '计划完成',
    '当前进度',
    '合同金额',
    '已回款金额',
    '应收金额',
    '成本健康度',
    '进度偏差',
    '风险类型',
    '风险等级',
    '风险状态',
    '风险趋势',
    '到期日期',
    '重点项目标记',
    '重点项目原因',
    '执行阶段进度',
    '监控阶段进度',
    '收尾阶段进度',
  ];
  const rows = [
    ['PMO-2026-001', '江苏', '智慧校园一期', '某市教育局', '执行中', 'A', '信息化', '智慧作业', '2026-01-15', '2026-01-20', '2026-07-30', 0.62, 280, 120, 160, 82, -6, '进度风险', '中', '监控中', '平稳', '2026-07-30', '是', 'A级项目且应收金额较高', 62, 54, 0],
    ['PMO-2026-002', '河南', '质量监测平台', '某省教研院', '验收中', 'S', '信息化', '质量监测', '2026-02-20', '2026-02-28', '2026-06-30', 0.95, 420, 300, 120, 88, 2, '回款风险', '中', '处理中', '改善', '2026-06-30', '是', 'S级重点项目', 95, 93, 76],
  ];
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  XLSX.utils.book_append_sheet(workbook, worksheet, '项目组合数据模板');
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}
