// Knowledge Base & AI Q&A - Types and Logic

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
}

export interface KnowledgeSource {
  document: string;
  excerpt: string;
  relevance: number;
}

export interface KnowledgeCategory {
  id: string;
  name: string;
  icon: string;
  description: string;
  documentCount: number;
}

// Knowledge categories
export const knowledgeCategories: KnowledgeCategory[] = [
  {
    id: 'pmbok',
    name: 'PMBOK知识',
    icon: '📚',
    description: 'PMBOK第七版项目管理知识体系',
    documentCount: 12,
  },
  {
    id: 'prince2',
    name: 'PRINCE2流程',
    icon: '🔄',
    description: 'PRINCE2项目管理方法论与流程',
    documentCount: 8,
  },
  {
    id: 'ltc',
    name: 'LTC最佳实践',
    icon: '📋',
    description: 'LTC流程管理最佳实践',
    documentCount: 15,
  },
  {
    id: 'templates',
    name: '模板库',
    icon: '📝',
    description: '项目管理模板与工具库',
    documentCount: 23,
  },
];

// Suggested questions
export const suggestedQuestions = [
  'LTC流程中商机立项阶段的输出物有哪些？',
  'EVM挣值分析的SPI和CPI指标如何解读？',
  '项目风险识别的主要方法有哪些？',
  'PRINCE2中阶段门的审批标准是什么？',
  '如何计算关键路径的总浮动时间？',
];

// Sample document sources
export const sampleSources: KnowledgeSource[] = [
  { document: 'PMBOK第七版第三章', excerpt: '项目整合管理包括识别、定义、组合、统一和管控等要素...', relevance: 0.92 },
  { document: 'LTC流程手册V2.3', excerpt: '商机立项阶段需要输出《项目章程》、《干系人登记册》...', relevance: 0.87 },
  { document: 'EVM实操指南', excerpt: 'SPI<1表示进度落后，SPI>1表示进度超前；CPI<1表示成本超支...', relevance: 0.81 },
];

// Generate new session ID
export function generateSessionId(): string {
  return `session_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

// Get confidence color
export function getConfidenceColor(confidence: number): string {
  if (confidence >= 0.8) return 'var(--green)';
  if (confidence >= 0.6) return 'var(--amber)';
  return 'var(--red)';
}

// Get confidence label
export function getConfidenceLabel(confidence: number): string {
  if (confidence >= 0.8) return '高置信度';
  if (confidence >= 0.6) return '中置信度';
  return '低置信度';
}

// Mock RAG response generator (simulates knowledge base lookup)
export function generateMockAnswer(question: string, category: string): {
  answer: string;
  sources: KnowledgeSource[];
  confidence: number;
} {
  // Simulate different answers based on keywords
  if (question.includes('LTC') || question.includes('商机立项')) {
    return {
      answer: `根据LTC流程手册V2.3，商机组网阶段的输出物包括：

**1. 项目章程（Project Charter）**
- 项目目标与范围定义
- 项目经理授权
- 预算初步估算

**2. 干系人登记册**
- 关键干系人清单
- 干系人影响力评估
- 沟通频率约定

**3. 初步风险登记册**
- 已识别风险清单
- 初步应对策略
- 风险责任人

**4. 商务谈判计划**
- 关键条款清单
- 谈判策略
- 预期成果

> 建议参考《LTC流程手册V2.3》第三章了解更多细节。`,
      sources: [
        { document: 'LTC流程手册V2.3', excerpt: '商机立项阶段输出物包括项目章程、干系人登记册、初步风险登记册等核心文档...', relevance: 0.94 },
        { document: 'PMBOK第七版第三章', excerpt: '项目整合管理章程是项目正式启动的标志性文档...', relevance: 0.78 },
      ],
      confidence: 0.89,
    };
  }

  if (question.includes('EVM') || question.includes('SPI') || question.includes('CPI')) {
    return {
      answer: `EVM（Earned Value Management）挣值分析的核心指标解读：

**SPI（Schedule Performance Index）进度绩效指数**
- SPI = EV / PV
- SPI < 1：进度落后（完成的工作少于计划）
- SPI > 1：进度超前
- SPI = 1：按计划进行

**CPI（Cost Performance Index）成本绩效指数**
- CPI = EV / AC
- CPI < 1：成本超支（花钱多于完成的工作）
- CPI > 1：成本节约
- CPI = 1：按预算执行

**综合判断**
| SPI | CPI | 状态 | 应对策略 |
|-----|-----|------|----------|
| <1 | <1 | 低效 | 增加资源或重新评估范围 |
| <1 | >1 | 进度落后但成本可控 | 重点关注进度 |
| >1 | <1 | 进度超前但成本超支 | 控制成本 |
| >1 | >1 | 最佳状态 | 保持现状 |

> 数据来源：《EVM实操指南》第四章`,
      sources: [
        { document: 'EVM实操指南', excerpt: 'SPI = EV/PV反映进度绩效，CPI = EV/AC反映成本绩效...', relevance: 0.96 },
        { document: 'PMBOK第七版第七章', excerpt: '挣值管理将范围、进度和成本整合为一个统一的测量系统...', relevance: 0.82 },
      ],
      confidence: 0.93,
    };
  }

  if (question.includes('风险识别')) {
    return {
      answer: `项目风险识别的主要方法：

**1. 头脑风暴（Brainstorming）**
- 优势：激发创意，发现多角度风险
- 适用：项目启动阶段
- 注意：需控制时间，避免偏离主题

**2. 德尔菲法（Delphi Method）**
- 优势：匿名专家意见，避免群体思维
- 适用：敏感话题或跨地域团队
- 轮次：通常3-4轮迭代

**3. SWOT分析**
- 从优势、劣势、机会、威胁四个维度识别
- 适用：战略级风险评估
- 局限：较宏观

**4. 检查表法（Checklist）**
- 基于历史项目风险库
- 优势：系统化、不易遗漏
- 适用：有成熟风险库的组网

**5. 访谈法**
- 与干系人一对一对谈
- 优势：深度挖掘，细节丰富
- 适用：关键干系人分析

**6. 根本原因分析（RCA）**
- 追问"为什么"直到根本原因
- 优势：识别深层风险
- 适用：已发生问题的复盘`,
      sources: [
        { document: 'PMBOK第七版第八章', excerpt: '风险识别的方法包括头脑风暴、德尔菲法、专家访谈、检查表等...', relevance: 0.91 },
        { document: 'LTC流程手册V2.3', excerpt: '风险识别应在项目生命周期早期进行...', relevance: 0.76 },
      ],
      confidence: 0.88,
    };
  }

  if (question.includes('PRINCE2') || question.includes('阶段门')) {
    return {
      answer: `PRINCE2中阶段门（Stage Gate）的审批标准：

**阶段门审查目的**
确保项目在进入下一阶段前，已完成当前阶段的全部交付物并满足预设的退出标准。

**标准审查内容**

1. **业务案例验证（Business Case）**
   - 继续投资的理由依然有效
   - 收益预期合理

2. **项目管理计划评审**
   - 下一阶段的计划已批准
   - 资源已落实
   - 预算在可控范围

3. **风险状态审查**
   - 所有已识别风险有应对计划
   - 无新的高风险出现

4. **质量合规检查**
   - 阶段交付物通过质量评审
   - 文档完整存档

5. **干系人满意度**
   - 关键干系人无重大投诉
   - 沟通计划被执行

**审批结论**
| 结论 | 行动 |
|------|------|
| 通过 | 进入下一阶段 |
| 有条件通过 | 完成指定整改后进入 |
| 否决 | 项目终止或返回上一阶段 |
| 延期 | 等待外部条件满足 |`,
      sources: [
        { document: 'PRINCE2流程手册', excerpt: '阶段门审查确保项目合法性、业务价值与风险管理...', relevance: 0.95 },
        { document: 'PMBOK第七版第一章', excerpt: '项目治理包括阶段审查与批准机制...', relevance: 0.79 },
      ],
      confidence: 0.91,
    };
  }

  if (question.includes('关键路径') || question.includes('浮动时间')) {
    return {
      answer: `关键路径（Critical Path）总浮动时间计算：

**关键路径定义**
项目中工期最长的一条路径，决定项目最短完成时间。任何关键路径上的活动延迟都会导致项目延期。

**总浮动时间（Total Float）计算公式**

总浮动时间 = 最晚开始时间（LS）- 最早开始时间（ES）
          = 最晚完成时间（LF）- 最早完成时间（EF）

**计算步骤**

1. **正向计算（Early Dates）**
   - ES = max(所有紧前活动的EF)
   - EF = ES + 工期

2. **反向计算（Late Dates）**
   - LF = min(所有紧后活动的LS)
   - LS = LF - 工期

3. **计算总浮动**
   - 总浮动 = LS - ES（或 LF - EF）

**示例**
| 活动 | 紧前 | 工期 | ES | EF | LS | LF | 总浮动 |
|------|------|------|-----|-----|-----|-----|--------|
| A | - | 4 | 0 | 4 | 0 | 4 | 0 |
| B | A | 3 | 4 | 7 | 4 | 7 | 0 |
| C | A | 2 | 4 | 6 | 6 | 8 | 2 |

**关键路径识别**
- 总浮动为0的活动构成关键路径
- 本例中 A → B 为关键路径
- C 活动有2天总浮动时间`,
      sources: [
        { document: 'PMBOK第七版第六章', excerpt: '关键路径法（CPM）通过正向和反向计算确定活动总浮动时间...', relevance: 0.94 },
        { document: 'CPM项目管理', excerpt: '关键路径是项目网络中工期最长的路径...', relevance: 0.85 },
      ],
      confidence: 0.90,
    };
  }

  // Default answer for unrecognized questions
  return {
    answer: `感谢您的提问。根据项目管理知识体系的相关内容：

**回答要点**

您的这个问题涉及多个知识领域。建议您：

1. 查阅《PMBOK第七版》相关章节
2. 参考具体流程手册（如LTC/PRINCE2）
3. 如需深入分析，可提供更多背景信息

**推荐操作**
- 选择具体知识类别获取更精准答案
- 尝试用更具体的关键词提问

> 知识库将持续更新，期待为您提供更专业的解答。`,
    sources: [
      { document: 'PMBOK第七版', excerpt: '项目管理知识体系涵盖了项目全生命周期的各个知识领域...', relevance: 0.72 },
      { document: '项目管理知识库', excerpt: '综合管理方法论包括启动、规划、执行、监控、收尾五大过程组...', relevance: 0.65 },
    ],
    confidence: 0.68,
  };
}

// In-memory session store (for context continuity)
export const sessionStore: Map<string, QASession> = new Map();