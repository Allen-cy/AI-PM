// Shared TypeScript types for the AI PM System

export interface Project {
  id: string;
  name: string;
  type: "it" | "content" | "engineering" | "ops";
  status: "planning" | "in-progress" | "completed" | "suspended";
  contractAmount: number;
  startDate: string;
  endDate: string;
  progress: number; // 0-100
  manager?: string;
}

export interface WBSNode {
  id: string;
  name: string;
  level: number; // 1-4
  duration?: number; // days
  predecessors?: string[];
  owner?: string;
  children?: WBSNode[];
  isExpanded?: boolean;
}

export interface Risk {
  id: string;
  projectId: string;
  description: string;
  probability: "high" | "medium" | "low";
  impact: "high" | "medium" | "low";
  mitigation: string;
  status: "open" | "mitigated" | "closed";
  owner?: string;
}

export interface Contract {
  id: string;
  projectId: string;
  paymentTerms: string;
  milestones: PaymentMilestone[];
}

export interface PaymentMilestone {
  milestone: string;
  percentage: number;
  trigger: string;
  estimatedDays?: number;
  paid?: boolean;
  paidDate?: string;
}

// Feishu integration types
export interface FeishuConfig {
  appId: string;
  appSecret: string;
  spaceId?: string;
  tableId?: string;
}

export interface FeishuProject {
  record_id: string;
  fields: {
    项目名称: string;
    项目类型: string;
    合同额: number;
    当前进度: number;
    项目状态: string;
  };
}

// AI Response types
export interface AIResponse {
  content: string;
  model: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
  };
  cached?: boolean;
  error?: string;
}

// Navigation
export interface NavItem {
  label: string;
  href: string;
  icon: string;
  description: string;
}

export const NAV_ITEMS: NavItem[] = [
  { label: "AI WBS拆解", href: "/wbs", icon: "🧩", description: "输入SOW自动生成WBS结构" },
  { label: "挣值分析", href: "/evm", icon: "📊", description: "EVM自动计算S曲线" },
  { label: "关键路径", href: "/cpm", icon: "🔗", description: "CPM关键路径计算" },
  { label: "AI报告", href: "/reports", icon: "📝", description: "一键生成周报月报" },
];