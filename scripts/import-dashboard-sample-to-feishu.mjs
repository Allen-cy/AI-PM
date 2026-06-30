import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BASE_TOKEN = 'BZhHba0BYa8aRLsQdYUcBnbhnqe';
const TABLES = {
  project: 'tblLE1Jkopn7qbVK',
  contract: 'tbl8nI9WVG9NgIrr',
  payment: 'tblWYUVXatvKzrAJ',
  risk: 'tblxh8prrF17x3uL',
};
const BATCH_NAME = '作业帮样例数据源-20260629-v1';
const SOURCE_NAME = '知识库（大厂最佳实践沉淀）/作业帮/项目台账&一表通/项目/样例数据源.xlsx';

function loadSampleRecords() {
  const text = readFileSync('src/features/dashboard/sample-projects.ts', 'utf8');
  const match = text.match(/const sampleProjects = ([\s\S]*?) as const;\s*export default sampleProjects;/);
  if (!match) throw new Error('Cannot parse sample-projects.ts');
  return JSON.parse(match[1]).records;
}

function runLark(args) {
  const output = execFileSync('lark-cli', args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 20,
  });
  const payload = JSON.parse(output);
  if (!payload.ok) {
    throw new Error(`${args.join(' ')} failed: ${JSON.stringify(payload.error ?? payload)}`);
  }
  return payload.data;
}

function runLarkMaybe(args) {
  try {
    return runLark(args);
  } catch (error) {
    return { error };
  }
}

function dateValue(date) {
  if (!date) return null;
  return `${date.slice(0, 10)} 00:00:00`;
}

function addDays(date, days) {
  const base = date ? new Date(`${date.slice(0, 10)}T00:00:00Z`) : new Date('2026-06-29T00:00:00Z');
  if (Number.isNaN(base.getTime())) return null;
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

function numberValue(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? Number(n.toFixed(4)) : fallback;
}

function riskCategory(type) {
  if (type?.includes('进度')) return '进度';
  if (type?.includes('回款') || type?.includes('合同')) return '合同';
  if (type?.includes('成本')) return '成本';
  if (type?.includes('质量')) return '质量';
  return '外部';
}

function riskScore(level) {
  if (level === '高') return { probability: 4, impact: 5 };
  if (level === '中') return { probability: 3, impact: 4 };
  return { probability: 2, impact: 2 };
}

function projectStage(status) {
  if (status === '已验收') return '已结束';
  if (status?.includes('未交付')) return '立项';
  if (status?.includes('交付')) return '执行';
  return '监控';
}

function projectStatus(status) {
  if (status === '已验收') return '完成';
  if (status?.includes('未交付')) return '待立项';
  if (status?.includes('交付')) return '进行中';
  return '进行中';
}

function projectLevel(level) {
  return ['S', 'A', 'B', 'C'].includes(level) ? level : 'C';
}

function isKeyProject(record) {
  return ['S', 'A'].includes(projectLevel(record.项目等级))
    || Number(record.合同金额 ?? 0) >= 300
    || record.风险等级 === '高'
    || Number(record.进度偏差 ?? 0) <= -15
    || Number(record.应收金额 ?? 0) >= 100;
}

function keyProjectReason(record) {
  const reasons = [];
  if (['S', 'A'].includes(projectLevel(record.项目等级))) reasons.push(`${projectLevel(record.项目等级)}级项目`);
  if (Number(record.合同金额 ?? 0) >= 300) reasons.push('合同金额较高');
  if (record.风险等级 === '高') reasons.push('高风险项目');
  if (Number(record.进度偏差 ?? 0) <= -15) reasons.push('进度严重偏差');
  if (Number(record.应收金额 ?? 0) >= 100) reasons.push('应收金额较高');
  return reasons.join('、') || '常规项目';
}

function stageProgress(record) {
  const execution = Math.max(0, Math.min(100, Math.round(Number(record.当前进度 ?? 0) * 100)));
  const riskPenalty = record.风险等级 === '高' ? 18 : record.风险等级 === '中' ? 8 : 0;
  const costAdjustment = Number(record.成本健康度 ?? 0) >= 85 ? 6 : Number(record.成本健康度 ?? 0) < 65 ? -10 : 0;
  const monitoring = execution < 20 ? 0 : Math.max(0, Math.min(100, execution + costAdjustment - riskPenalty));
  const closing = record.项目状态 === '已验收'
    ? Math.max(70, Math.round((execution + monitoring) / 2))
    : execution >= 80 && monitoring >= 70
      ? Math.max(0, Math.min(100, Math.round((execution - 80) * 3 + (monitoring - 70))))
      : 0;
  return { execution, monitoring, closing };
}

function contractStatus(status) {
  return status === '已验收' ? '已完成' : '履约中';
}

function paymentStatus(record, isReceived) {
  if (isReceived) return '已收款';
  const due = new Date(`${(record.到期日期 ?? record.计划完成 ?? addDays(record.签约时间, 365)).slice(0, 10)}T00:00:00Z`);
  return due.getTime() < Date.parse('2026-06-29T00:00:00Z') ? '逾期' : '待收款';
}

function getFieldNames(tableId) {
  const data = runLark(['base', '+field-list', '--as', 'bot', '--format', 'json', '--base-token', BASE_TOKEN, '--table-id', tableId]);
  return new Set(data.fields.map(field => field.name));
}

function ensureFields(tableId, definitions) {
  const existing = getFieldNames(tableId);
  const created = [];
  for (const definition of definitions) {
    if (existing.has(definition.name)) continue;
    runLark([
      'base',
      '+field-create',
      '--as',
      'bot',
      '--format',
      'json',
      '--base-token',
      BASE_TOKEN,
      '--table-id',
      tableId,
      '--json',
      JSON.stringify(definition),
    ]);
    existing.add(definition.name);
    created.push(definition.name);
  }
  return created;
}

function listRecords(tableId, limit = 200) {
  const data = runLark([
    'base',
    '+record-list',
    '--as',
    'bot',
    '--format',
    'json',
    '--base-token',
    BASE_TOKEN,
    '--table-id',
    tableId,
    '--limit',
    String(limit),
  ]);
  const fields = data.fields ?? [];
  const rows = data.data ?? [];
  const ids = data.record_id_list ?? [];
  return rows.map((row, index) => {
    const object = { _record_id: ids[index] };
    fields.forEach((field, fieldIndex) => {
      object[field] = row[fieldIndex];
    });
    return object;
  });
}

function valueText(value) {
  if (Array.isArray(value)) return value.join('、');
  if (value === null || value === undefined) return '';
  return String(value);
}

function existingIdMap(tableId, keyField) {
  const rows = listRecords(tableId, 200);
  const map = new Map();
  for (const row of rows) {
    const key = valueText(row[keyField]);
    if (key) map.set(key, row._record_id);
  }
  return map;
}

function batchCreate(tableId, fields, rows) {
  if (rows.length === 0) return { recordIds: [] };
  mkdirSync('.tmp', { recursive: true });
  const dir = mkdtempSync(join('.tmp', 'ai-pmo-feishu-import-'));
  const file = join(dir, 'batch-create.json');
  writeFileSync(file, JSON.stringify({ fields, rows }, null, 2));
  const data = runLark([
    'base',
    '+record-batch-create',
    '--as',
    'bot',
    '--format',
    'json',
    '--base-token',
    BASE_TOKEN,
    '--table-id',
    tableId,
    '--json',
    `@./${file}`,
  ]);
  return {
    recordIds: data.record_id_list ?? [],
    raw: data,
  };
}

const commonTextFields = [
  { type: 'text', name: '测试批次', description: '本字段用于标识AI PMO测试数据导入批次。' },
  { type: 'text', name: '样例来源', description: '本字段记录测试数据来源文件。' },
];

const createdFields = {
  project: ensureFields(TABLES.project, [
    ...commonTextFields,
    { type: 'text', name: '省份', description: '样例项目所属省份或区域。' },
    { type: 'text', name: '客户名称', description: '样例项目客户或合同方名称。' },
    { type: 'text', name: '产品类别', description: '样例项目产品类别。' },
    { type: 'datetime', name: '签约时间', description: '样例项目签约日期。', style: { format: 'yyyy-MM-dd' } },
    { type: 'text', name: '当前状态', description: '保留样例源表中的原始项目状态。' },
    { type: 'number', name: '已回款金额', description: '样例项目已回款金额，单位：万元。', style: { type: 'currency', precision: 2, currency_code: 'CNY' } },
    { type: 'number', name: '应收金额', description: '样例项目应收或应催账款金额，单位：万元。', style: { type: 'currency', precision: 2, currency_code: 'CNY' } },
    { type: 'number', name: '回款率', description: '样例项目回款率，0到1之间。', style: { type: 'progress', percentage: true, color: 'Green' } },
    { type: 'number', name: '成本健康度', description: '样例项目成本健康度评分。', style: { type: 'plain', precision: 2, percentage: false, thousands_separator: false } },
    { type: 'number', name: '进度偏差', description: '样例项目进度偏差，负数代表落后。', style: { type: 'plain', precision: 2, percentage: false, thousands_separator: false } },
    { type: 'text', name: '风险类型', description: '由样例数据和补充规则生成的风险类型。' },
    { type: 'select', name: '风险等级', description: '由样例数据和补充规则生成的风险等级。', multiple: false, options: [{ name: '高' }, { name: '中' }, { name: '低' }] },
    { type: 'text', name: '风险状态', description: '由样例数据和补充规则生成的风险状态。' },
    { type: 'select', name: '风险趋势', description: '由样例数据和补充规则生成的风险趋势。', multiple: false, options: [{ name: '恶化' }, { name: '平稳' }, { name: '改善' }] },
    { type: 'datetime', name: '到期日期', description: '样例项目回款或交付到期日期。', style: { format: 'yyyy-MM-dd' } },
    { type: 'text', name: '付款条件', description: '样例项目缺失时自动补充的付款条件。' },
    { type: 'text', name: '渠道名称', description: '样例项目渠道或客户来源。' },
    { type: 'text', name: '销售负责人', description: '样例项目缺失时自动补充的销售负责人。' },
    { type: 'text', name: '备注', description: '测试数据说明。' },
    { type: 'text', name: '样例项目类型', description: '保留样例源表中的原始项目类型。' },
    { type: 'select', name: '重点项目标记', description: '标记该项目是否为重点项目，用于组合看板重点项目进度链。', multiple: false, options: [{ name: '是' }, { name: '否' }] },
    { type: 'text', name: '重点项目原因', description: '记录重点项目识别原因或人工标记依据。' },
    { type: 'number', name: '执行阶段进度', description: '重点项目执行阶段进度，0-100。', style: { type: 'progress', percentage: true, color: 'Blue' } },
    { type: 'number', name: '监控阶段进度', description: '重点项目监控阶段闭环进度，0-100。', style: { type: 'progress', percentage: true, color: 'Purple' } },
    { type: 'number', name: '收尾阶段进度', description: '重点项目收尾阶段闭环进度，0-100。', style: { type: 'progress', percentage: true, color: 'Green' } },
  ]),
  contract: ensureFields(TABLES.contract, [
    ...commonTextFields,
    { type: 'text', name: '样例项目编号', description: '合同对应的样例项目编号。' },
    { type: 'text', name: '省份', description: '合同对应项目省份。' },
    { type: 'text', name: '产品类别', description: '合同对应产品类别。' },
  ]),
  payment: ensureFields(TABLES.payment, [
    ...commonTextFields,
    { type: 'text', name: '样例项目编号', description: '回款对应的样例项目编号。' },
    { type: 'text', name: '客户名称', description: '回款对应客户名称。' },
    { type: 'number', name: '回款率', description: '样例项目回款率，0到1之间。', style: { type: 'progress', percentage: true, color: 'Green' } },
  ]),
  risk: ensureFields(TABLES.risk, [
    ...commonTextFields,
    { type: 'text', name: '样例项目编号', description: '风险对应的样例项目编号。' },
    { type: 'select', name: '风险等级', description: '由样例数据和补充规则生成的风险等级。', multiple: false, options: [{ name: '高' }, { name: '中' }, { name: '低' }] },
    { type: 'select', name: '风险趋势', description: '由样例数据和补充规则生成的风险趋势。', multiple: false, options: [{ name: '恶化' }, { name: '平稳' }, { name: '改善' }] },
    { type: 'text', name: '风险状态', description: '保留看板侧风险状态描述。' },
  ]),
};

const sampleRecords = loadSampleRecords();
const existingProjects = existingIdMap(TABLES.project, 'source_record_id');
const projectFields = [
  '项目名称',
  'project_id',
  'source_record_id',
  'source_system',
  'sync_status',
  'data_version',
  '当前阶段',
  '项目状态',
  '项目等级',
  '项目类型',
  '项目发起人',
  '申请日期',
  '计划开始',
  '计划完成',
  '合同金额',
  '当前进度',
  '密级',
  '业务立项理由',
  '测试批次',
  '样例来源',
  '省份',
  '客户名称',
  '产品类别',
  '签约时间',
  '当前状态',
  '已回款金额',
  '应收金额',
  '回款率',
  '成本健康度',
  '进度偏差',
  '风险类型',
  '风险等级',
  '风险状态',
  '风险趋势',
  '到期日期',
  '付款条件',
  '渠道名称',
  '销售负责人',
  '备注',
  '样例项目类型',
  '重点项目标记',
  '重点项目原因',
  '执行阶段进度',
  '监控阶段进度',
  '收尾阶段进度',
];

const projectsToCreate = [];
const projectSourceOrder = [];
for (const [index, record] of sampleRecords.entries()) {
  if (existingProjects.has(record.项目编号)) continue;
  const due = record.计划完成 ?? record.到期日期 ?? addDays(record.签约时间, 365);
  const paymentTerms = record.应收金额 > 0
    ? '按合同约定分阶段付款，尾款在验收后30日内支付。'
    : '合同款已按节点回收，验收后完成归档。';
  const progress = stageProgress(record);
  projectsToCreate.push([
    record.项目名称,
    record.项目编号,
    record.项目编号,
    'import',
    'synced',
    1,
    projectStage(record.项目状态),
    projectStatus(record.项目状态),
    projectLevel(record.项目等级),
    '信息化',
    '样例数据源',
    dateValue(record.签约时间),
    dateValue(record.签约时间),
    dateValue(due),
    numberValue(record.合同金额),
    numberValue(record.当前进度),
    'internal',
    '由作业帮样例项目台账导入，用于AI PMO看板、飞书智能表和RAG联调测试。',
    BATCH_NAME,
    SOURCE_NAME,
    record.省份,
    record.客户名称,
    record.产品类别,
    dateValue(record.签约时间),
    record.项目状态,
    numberValue(record.已回款金额),
    numberValue(record.应收金额),
    numberValue(record.回款率),
    numberValue(record.成本健康度),
    numberValue(record.进度偏差),
    record.风险类型,
    record.风险等级,
    record.风险状态,
    record.风险趋势,
    dateValue(record.到期日期 ?? due),
    paymentTerms,
    record.客户名称,
    `销售负责人-${(index % 6) + 1}`,
    '样例数据源缺失字段已按测试规则补充。',
    record.项目类型,
    isKeyProject(record) ? '是' : '否',
    keyProjectReason(record),
    numberValue(progress.execution / 100),
    numberValue(progress.monitoring / 100),
    numberValue(progress.closing / 100),
  ]);
  projectSourceOrder.push(record.项目编号);
}
const projectCreate = batchCreate(TABLES.project, projectFields, projectsToCreate);
projectSourceOrder.forEach((sourceId, index) => existingProjects.set(sourceId, projectCreate.recordIds[index]));

const existingContracts = existingIdMap(TABLES.contract, 'contract_id');
const contractFields = [
  '合同名称',
  'contract_id',
  '合同编号',
  '项目',
  '合同方',
  '合同金额',
  '签订日期',
  '状态',
  '付款条件',
  'source_system',
  'sync_status',
  'data_version',
  '测试批次',
  '样例来源',
  '样例项目编号',
  '省份',
  '产品类别',
];
const contractsToCreate = [];
const contractOrder = [];
for (const record of sampleRecords) {
  const contractId = `CON-${record.项目编号}`;
  if (existingContracts.has(contractId)) continue;
  const projectId = existingProjects.get(record.项目编号);
  if (!projectId) continue;
  contractsToCreate.push([
    `${record.项目名称}合同`,
    contractId,
    contractId,
    [{ id: projectId }],
    record.客户名称,
    numberValue(record.合同金额),
    dateValue(record.签约时间),
    contractStatus(record.项目状态),
    record.应收金额 > 0 ? '首付款/阶段款/验收尾款按节点支付。' : '款项已按合同节点完成回收。',
    'import',
    'synced',
    1,
    BATCH_NAME,
    SOURCE_NAME,
    record.项目编号,
    record.省份,
    record.产品类别,
  ]);
  contractOrder.push(contractId);
}
const contractCreate = batchCreate(TABLES.contract, contractFields, contractsToCreate);
contractOrder.forEach((contractId, index) => existingContracts.set(contractId, contractCreate.recordIds[index]));

const existingPayments = existingIdMap(TABLES.payment, 'payment_id');
const paymentFields = [
  '回款事项',
  'payment_id',
  '项目',
  '合同',
  '付款里程碑',
  '应收金额',
  '实收金额',
  '核销金额',
  '到期日期',
  '实收日期',
  '状态',
  'source_system',
  'sync_status',
  'data_version',
  '测试批次',
  '样例来源',
  '样例项目编号',
  '客户名称',
  '回款率',
];
const paymentsToCreate = [];
for (const record of sampleRecords) {
  const projectId = existingProjects.get(record.项目编号);
  const contractId = existingContracts.get(`CON-${record.项目编号}`);
  if (!projectId || !contractId) continue;
  if (record.已回款金额 > 0) {
    const paymentId = `PAY-${record.项目编号}-RECEIVED`;
    if (!existingPayments.has(paymentId)) {
      paymentsToCreate.push([
        `${record.项目名称}已回款`,
        paymentId,
        [{ id: projectId }],
        [{ id: contractId }],
        '已回款节点',
        numberValue(record.已回款金额),
        numberValue(record.已回款金额),
        numberValue(record.已回款金额),
        dateValue(addDays(record.签约时间, 30)),
        dateValue(addDays(record.签约时间, 45)),
        paymentStatus(record, true),
        'import',
        'synced',
        1,
        BATCH_NAME,
        SOURCE_NAME,
        record.项目编号,
        record.客户名称,
        numberValue(record.回款率),
      ]);
    }
  }
  if (record.应收金额 > 0) {
    const paymentId = `PAY-${record.项目编号}-RECEIVABLE`;
    if (!existingPayments.has(paymentId)) {
      const due = record.到期日期 ?? record.计划完成 ?? addDays(record.签约时间, 365);
      paymentsToCreate.push([
        `${record.项目名称}应收尾款`,
        paymentId,
        [{ id: projectId }],
        [{ id: contractId }],
        '验收尾款',
        numberValue(record.应收金额),
        0,
        0,
        dateValue(due),
        null,
        paymentStatus(record, false),
        'import',
        'synced',
        1,
        BATCH_NAME,
        SOURCE_NAME,
        record.项目编号,
        record.客户名称,
        numberValue(record.回款率),
      ]);
    }
  }
}
const paymentCreate = batchCreate(TABLES.payment, paymentFields, paymentsToCreate);

const existingRisks = existingIdMap(TABLES.risk, 'risk_id');
const riskFields = [
  '风险标题',
  'risk_id',
  '项目',
  '风险类别',
  '概率',
  '影响',
  '风险值',
  '状态',
  '风险描述',
  '触发条件',
  '应对策略',
  'source_system',
  'sync_status',
  'data_version',
  '测试批次',
  '样例来源',
  '样例项目编号',
  '风险等级',
  '风险趋势',
  '风险状态',
];
const risksToCreate = [];
for (const record of sampleRecords) {
  const riskId = `RISK-${record.项目编号}`;
  if (existingRisks.has(riskId)) continue;
  const projectId = existingProjects.get(record.项目编号);
  if (!projectId) continue;
  const { probability, impact } = riskScore(record.风险等级);
  const status = record.风险等级 === '低' ? '已关闭' : record.风险等级 === '中' ? '应对中' : '已识别';
  risksToCreate.push([
    `${record.项目名称}-${record.风险类型}`,
    riskId,
    [{ id: projectId }],
    riskCategory(record.风险类型),
    probability,
    impact,
    probability * impact,
    status,
    `基于样例数据自动生成：${record.风险类型}，风险等级${record.风险等级}，趋势${record.风险趋势}。`,
    record.进度偏差 < -5 ? '进度偏差超过阈值' : record.应收金额 > 0 ? '存在未回款金额' : '作为样例监控项保留',
    record.风险等级 === '高'
      ? '纳入PMO周度跟踪，明确责任人与纠偏计划。'
      : record.风险等级 === '中'
        ? '由项目经理持续监控并在周报中更新。'
        : '低风险归档观察，出现变化时重新评估。',
    'import',
    'synced',
    1,
    BATCH_NAME,
    SOURCE_NAME,
    record.项目编号,
    record.风险等级,
    record.风险趋势,
    record.风险状态,
  ]);
}
const riskCreate = batchCreate(TABLES.risk, riskFields, risksToCreate);

const summary = {
  batch: BATCH_NAME,
  source: SOURCE_NAME,
  sourceRecords: sampleRecords.length,
  createdFields,
  createdRecords: {
    project: projectCreate.recordIds.length,
    contract: contractCreate.recordIds.length,
    payment: paymentCreate.recordIds.length,
    risk: riskCreate.recordIds.length,
  },
  skippedExisting: {
    project: sampleRecords.length - projectCreate.recordIds.length,
  },
};

console.log(JSON.stringify(summary, null, 2));
