// Contract & Payment Management - Core Logic

export interface PaymentMilestone {
  id: string;
  name: string;
  amount: number;
  dueDate: string;       // YYYY-MM-DD
  status: 'paid' | 'unpaid' | 'overdue' | 'pending';
  actualPaidDate?: string;
}

export interface Contract {
  id: string;
  name: string;
  partyA: string;
  partyB: string;
  totalAmount: number;
  signedDate: string;
  milestones: PaymentMilestone[];
}

export interface CollectionForecast {
  month: string;         // YYYY-MM
  monthLabel: string;    // e.g. "6月"
  amount: number;
  contractCount: number;
}

// Test data: 2 contracts as specified
export const TEST_CONTRACTS: Contract[] = [
  {
    id: "C-2024-001",
    name: "智慧城市一期项目",
    partyA: "某市大数据局",
    partyB: "公司总部",
    totalAmount: 500,
    signedDate: "2024-01-10",
    milestones: [
      {
        id: "M-001-1",
        name: "合同签订",
        amount: 100,
        dueDate: "2024-01-15",
        status: "paid",
        actualPaidDate: "2024-01-14",
      },
      {
        id: "M-001-2",
        name: "需求确认",
        amount: 150,
        dueDate: "2024-03-01",
        status: "paid",
        actualPaidDate: "2024-03-05",
      },
      {
        id: "M-001-3",
        name: "初验完成",
        amount: 150,
        dueDate: "2024-06-01",
        status: "overdue",
      },
      {
        id: "M-001-4",
        name: "终验完成",
        amount: 100,
        dueDate: "2024-12-01",
        status: "unpaid",
      },
    ],
  },
  {
    id: "C-2024-002",
    name: "教育平台升级项目",
    partyA: "某省教育厅",
    partyB: "公司总部",
    totalAmount: 200,
    signedDate: "2024-01-25",
    milestones: [
      {
        id: "M-002-1",
        name: "合同签订",
        amount: 40,
        dueDate: "2024-02-01",
        status: "paid",
        actualPaidDate: "2024-02-03",
      },
      {
        id: "M-002-2",
        name: "方案确认",
        amount: 60,
        dueDate: "2024-04-01",
        status: "paid",
        actualPaidDate: "2024-04-10",
      },
      {
        id: "M-002-3",
        name: "上线验收",
        amount: 80,
        dueDate: "2024-08-01",
        status: "unpaid",
      },
      {
        id: "M-002-4",
        name: "运维结束",
        amount: 20,
        dueDate: "2024-12-01",
        status: "unpaid",
      },
    ],
  },
];

/**
 * Parse payment terms text into structured milestones
 * Simple rule-based parser for common payment patterns
 */
export function parsePaymentTerms(text: string): PaymentMilestone[] {
  const milestones: PaymentMilestone[] = [];
  const lines = text.split(/[;\n，]/).filter(l => l.trim());

  const today = new Date();
  const currentYear = today.getFullYear();

  lines.forEach((line, idx) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    // Try to extract amount (look for numbers followed by 万/元/%)
    const amountMatch = trimmed.match(/(\d+(?:\.\d+)?)\s*(?:万|元|%)/);
    const amount = amountMatch ? parseFloat(amountMatch[1]) : 0;

    // Try to extract date patterns
    const dateMatch = trimmed.match(/(\d{1,2}月\d{1,2}日|\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{4}年\d{1,2}月\d{1,2}日)/);
    let dueDate = "";
    if (dateMatch) {
      const dateStr = dateMatch[1];
      const normalized = dateStr
        .replace(/年(\d)月/, `年0$1月`)
        .replace(/月(\d)日/, `月0$1日`)
        .replace(/[年月]/g, "-")
        .replace(/日/g, "");
      dueDate = `${currentYear}-${normalized}`;
    } else {
      // Default to 30 days per milestone if no date specified
      const futureDate = new Date(today);
      futureDate.setDate(futureDate.getDate() + 30 * (idx + 1));
      dueDate = futureDate.toISOString().split("T")[0];
    }

    // Determine status based on due date
    const due = new Date(dueDate);
    let status: PaymentMilestone["status"] = "pending";
    if (due < today) {
      status = "overdue";
    }

    milestones.push({
      id: `parsed-${Date.now()}-${idx}`,
      name: trimmed.substring(0, 50),
      amount,
      dueDate,
      status,
    });
  });

  return milestones;
}

/**
 * Calculate collection rate for a contract
 */
export function calculateCollectionRate(contract: Contract): number {
  const paid = contract.milestones
    .filter(m => m.status === "paid")
    .reduce((sum, m) => sum + m.amount, 0);
  return contract.totalAmount > 0 ? (paid / contract.totalAmount) * 100 : 0;
}

/**
 * Get all overdue payments from contracts
 */
export function getOverduePayments(contracts: Contract[]): PaymentMilestone[] {
  const overdue: PaymentMilestone[] = [];
  contracts.forEach(c => {
    c.milestones.forEach(m => {
      if (m.status === "overdue") {
        overdue.push({ ...m, id: `${c.id}-${m.id}` });
      }
    });
  });
  return overdue;
}

/**
 * Calculate paid amount for a contract
 */
export function calculatePaidAmount(contract: Contract): number {
  return contract.milestones
    .filter(m => m.status === "paid")
    .reduce((sum, m) => sum + m.amount, 0);
}

/**
 * Calculate unpaid amount for a contract
 */
export function calculateUnpaidAmount(contract: Contract): number {
  return contract.milestones
    .filter(m => m.status !== "paid")
    .reduce((sum, m) => sum + m.amount, 0);
}

/**
 * Forecast collection for next N months
 */
export function forecastCollection(contracts: Contract[], months: number = 3): CollectionForecast[] {
  const today = new Date();
  const forecasts: CollectionForecast[] = [];

  for (let i = 0; i < months; i++) {
    const targetMonth = new Date(today.getFullYear(), today.getMonth() + i, 1);
    const monthStr = `${targetMonth.getFullYear()}-${String(targetMonth.getMonth() + 1).padStart(2, "0")}`;
    const monthLabel = `${targetMonth.getMonth() + 1}月`;

    let totalAmount = 0;
    let contractCount = 0;

    contracts.forEach(c => {
      c.milestones.forEach(m => {
        if (m.status !== "paid" && m.dueDate.startsWith(monthStr)) {
          totalAmount += m.amount;
          contractCount++;
        }
      });
    });

    forecasts.push({ month: monthStr, monthLabel, amount: totalAmount, contractCount });
  }

  return forecasts;
}

/**
 * Format currency for display
 */
export function formatCurrency(amount: number, unit: string = "万"): string {
  if (amount >= 10000) {
    return `¥${(amount / 10000).toFixed(1)}亿`;
  }
  return `¥${amount.toLocaleString()}${unit}`;
}

/**
 * Get status color
 */
export function getStatusColor(status: PaymentMilestone["status"]): string {
  switch (status) {
    case "paid": return "var(--green)";
    case "pending": return "var(--amber)";
    case "overdue": return "var(--red)";
    case "unpaid": return "var(--text2)";
    default: return "var(--text2)";
  }
}

/**
 * Get status label in Chinese
 */
export function getStatusLabel(status: PaymentMilestone["status"]): string {
  switch (status) {
    case "paid": return "已付款";
    case "pending": return "待付款";
    case "overdue": return "逾期";
    case "unpaid": return "未付款";
    default: return "未知";
  }
}
