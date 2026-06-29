import type { FeishuTableKey } from './config.ts';

export const FEISHU_BASE_TOKEN = 'BZhHba0BYa8aRLsQdYUcBnbhnqe';
export const FEISHU_BASE_HOME_URL = `https://ht89bjyrop.feishu.cn/base/${FEISHU_BASE_TOKEN}`;

export const FEISHU_TABLE_LINKS: Record<FeishuTableKey, { tableId: string; viewId: string; label: string }> = {
  project: { tableId: 'tblLE1Jkopn7qbVK', viewId: 'vewnhIiiRF', label: '项目台账' },
  milestone: { tableId: 'tblKvVmPSfOKd8BJ', viewId: 'vewEqDW1w1', label: '里程碑' },
  task: { tableId: 'tblK3ewUmGdBv7aa', viewId: 'vewZ5fFxTu', label: '任务' },
  risk: { tableId: 'tblxh8prrF17x3uL', viewId: 'vewsDTzxfy', label: '风险' },
  contract: { tableId: 'tbl8nI9WVG9NgIrr', viewId: 'vewL5lqgmb', label: '合同' },
  payment: { tableId: 'tblWYUVXatvKzrAJ', viewId: 'vewb6eS0fA', label: '回款计划' },
  cost: { tableId: 'tblGhMvXsQHTUXgT', viewId: 'vewJOy64Lg', label: '成本预算' },
  syncLedger: { tableId: 'tbly6Mqp5gvtWS1V', viewId: 'vew8larqWu', label: '同步账本' },
};

export function feishuTableUrl(tableKey: FeishuTableKey): string {
  const target = FEISHU_TABLE_LINKS[tableKey];
  const url = new URL(FEISHU_BASE_HOME_URL);
  url.searchParams.set('table', target.tableId);
  url.searchParams.set('view', target.viewId);
  return url.toString();
}
