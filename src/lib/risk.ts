// Risk Management - Types and Calculation Logic

export interface Risk {
  id: string;
  description: string;
  category: "技术" | "人员" | "外部" | "管理" | "质量";
  probability: 1 | 2 | 3 | 4 | 5;  // 1=极低, 5=极高
  impact: 1 | 2 | 3 | 4 | 5;        // 1=轻微, 5=严重
  piScore: number;                   // P × I
  status: "identified" | "tracking" | "resolved";
  responseStrategy: string;
  owner: string;
  createdAt: string;
}

export interface RiskClassification {
  high: Risk[];
  medium: Risk[];
  low: Risk[];
  total: number;
}

export function calculateRiskScore(p: number, i: number): number {
  return p * i;
}

export function getRiskLevel(score: number): "high" | "medium" | "low" {
  if (score >= 16) return "high";    // P≥4, I≥4 => score ≥ 16
  if (score >= 6) return "medium";   // P≥2 or I≥2 => score ≥ 4
  return "low";
}

export function classifyRisks(risks: Risk[]): RiskClassification {
  const high: Risk[] = [];
  const medium: Risk[] = [];
  const low: Risk[] = [];

  for (const risk of risks) {
    const level = getRiskLevel(risk.piScore);
    if (level === "high") high.push(risk);
    else if (level === "medium") medium.push(risk);
    else low.push(risk);
  }

  return { high, medium, low, total: risks.length };
}

// Status display mapping
export const statusLabels: Record<Risk["status"], string> = {
  identified: "识别中",
  tracking: "跟踪中",
  resolved: "已解决",
};

export const categoryLabels: Record<Risk["category"], string> = {
  "技术": "技术风险",
  "人员": "人员风险",
  "外部": "外部风险",
  "管理": "管理风险",
  "质量": "质量风险",
};

// Test data
export const initialRisks: Risk[] = [
  {
    id: "R001",
    description: "核心开发人员离职风险",
    category: "人员",
    probability: 4,
    impact: 5,
    piScore: 20,
    status: "tracking",
    responseStrategy: "建立知识库文档化，进行交叉培训，设置备份人员",
    owner: "项目经理",
    createdAt: "2026-04-01",
  },
  {
    id: "R002",
    description: "第三方接口不稳定",
    category: "技术",
    probability: 3,
    impact: 3,
    piScore: 9,
    status: "tracking",
    responseStrategy: "提前进行技术验证，准备备用方案",
    owner: "技术负责人",
    createdAt: "2026-04-15",
  },
  {
    id: "R003",
    description: "客户需求变更频繁",
    category: "管理",
    probability: 5,
    impact: 2,
    piScore: 10,
    status: "identified",
    responseStrategy: "建立变更控制流程，设置需求冻结节点",
    owner: "产品经理",
    createdAt: "2026-04-20",
  },
  {
    id: "R004",
    description: "预算超支风险",
    category: "管理",
    probability: 3,
    impact: 4,
    piScore: 12,
    status: "tracking",
    responseStrategy: "加强预算监控，设置预警机制，定期审计支出",
    owner: "财务经理",
    createdAt: "2026-04-25",
  },
  {
    id: "R005",
    description: "验收时间延误",
    category: "外部",
    probability: 2,
    impact: 4,
    piScore: 8,
    status: "resolved",
    responseStrategy: "提前与客户沟通验收标准，安排预验收",
    owner: "项目经理",
    createdAt: "2026-03-15",
  },
];

// P-I Matrix color coding
export function getRiskColor(score: number): { bg: string; border: string; text: string } {
  const level = getRiskLevel(score);
  if (level === "high") return { bg: "rgba(239,68,68,0.15)", border: "#ef4444", text: "#ef4444" };
  if (level === "medium") return { bg: "rgba(245,158,11,0.15)", border: "#f59e0b", text: "#f59e0b" };
  return { bg: "rgba(34,197,94,0.15)", border: "#22c55e", text: "#22c55e" };
}

// Generate 5x5 matrix grid data
export function generateMatrixGrid(risks: Risk[]): Record<string, Risk[]> {
  const grid: Record<string, Risk[]> = {};
  for (let p = 5; p >= 1; p--) {
    for (let i = 5; i >= 1; i--) {
      const key = `${p}-${i}`;
      grid[key] = risks.filter(r => r.probability === p && r.impact === i);
    }
  }
  return grid;
}