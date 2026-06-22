// Knowledge Q&A client types and display configuration.

export interface QASession {
  id: string;
  messages: QAMessage[];
  createdAt: string;
  category: string;
}

export interface QAMessage {
  role: 'user' | 'assistant';
  content: string;
  sources?: KnowledgeSource[];
  confidence?: number;
  answerStatus?: 'answered' | 'insufficient_evidence' | 'forbidden' | 'error';
  retrievalMode?: string;
  traceId?: string;
}

export interface KnowledgeSource {
  document: string;
  excerpt: string;
  relevance: number;
  pageId?: string;
  sourceIds?: string[];
  locator?: string;
  authority?: string;
  confidentiality?: string;
}

export interface KnowledgeCategory {
  id: string;
  name: string;
  icon: string;
  description: string;
  documentCount: number;
}

export const knowledgeCategories: KnowledgeCategory[] = [
  {
    id: 'governance',
    name: 'PMO治理',
    icon: '🏛️',
    description: '组织级治理、PMO能力与驾驶舱指标',
    documentCount: 4,
  },
  {
    id: 'lifecycle',
    name: '项目全生命周期',
    icon: '🔄',
    description: '软件交付全生命周期与阶段门规则',
    documentCount: 2,
  },
  {
    id: 'finance',
    name: '业财一体化',
    icon: '💰',
    description: '合同、回款、成本、利润与经营数据链',
    documentCount: 1,
  },
  {
    id: 'ai-pmo',
    name: 'AI-PMO能力',
    icon: '🤖',
    description: '人机分工、AI赋能与知识复利闭环',
    documentCount: 3,
  },
];

export const suggestedQuestions = [
  'PMO三位一体中的PGG、EPG和SQA如何分工？',
  '约100人的组织如何设置PMO能力中心？',
  '项目阶段门应依据什么证据做继续或终止决策？',
  '合同、回款计划、应收、实收和核销是什么关系？',
  '哪些项目管理工作适合交给AI，哪些必须由人决策？',
];

export function generateSessionId(): string {
  return `session_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

export function getConfidenceColor(confidence: number): string {
  if (confidence >= 0.8) return 'var(--green)';
  if (confidence >= 0.6) return 'var(--amber)';
  return 'var(--red)';
}

export function getConfidenceLabel(confidence: number): string {
  if (confidence >= 0.8) return '高置信度';
  if (confidence >= 0.6) return '中置信度';
  return '低置信度';
}
