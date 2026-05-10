// LLM Gateway - DeepSeek + MiniMax routing with fallback

const DEEPSEEK_BASE = "https://api.deepseek.com/v1";
const MINIMAX_BASE = "https://api.minimax.chat/v1";

const MODELS = {
  deepseek: "deepseek-chat",
  minimax: "gpt-4o-mini",
} as const;

type ModelType = keyof typeof MODELS;

interface LLMResponse {
  content: string;
  model: string;
  usage?: { prompt_tokens: number; completion_tokens: number };
}

const ROUTING_TABLE: Record<string, { primary: ModelType; fallback: ModelType }> = {
  wbs: { primary: "minimax", fallback: "deepseek" },
  risk: { primary: "deepseek", fallback: "minimax" },
  report: { primary: "deepseek", fallback: "minimax" },
  summary: { primary: "minimax", fallback: "deepseek" },
  parse: { primary: "minimax", fallback: "deepseek" },
  quality: { primary: "minimax", fallback: "deepseek" },
  general: { primary: "deepseek", fallback: "minimax" },
  cpm: { primary: "deepseek", fallback: "minimax" },
  execution: { primary: "minimax", fallback: "deepseek" },
};

async function callDeepSeek(
  apiKey: string,
  messages: Array<{ role: string; content: string }>,
  temperature?: number
): Promise<LLMResponse> {
  const response = await fetch(`${DEEPSEEK_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "deepseek-chat",
      messages,
      temperature: temperature ?? 0.7,
      max_tokens: 2048,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(`DeepSeek API error ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  return {
    content: data.choices?.[0]?.message?.content ?? "",
    model: "deepseek-chat",
    usage: data.usage,
  };
}

async function callMiniMax(
  apiKey: string,
  messages: Array<{ role: string; content: string }>,
  temperature?: number
): Promise<LLMResponse> {
  const response = await fetch(`${MINIMAX_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "MiniMax-M2.7",
      messages,
      temperature: temperature ?? 0.7,
      max_tokens: 2048,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(`MiniMax API error ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  return {
    content: data.choices?.[0]?.message?.content ?? "",
    model: "MiniMax-M2.7",
    usage: data.usage,
  };
}

async function llmComplete(
  scene: keyof typeof ROUTING_TABLE,
  systemPrompt: string,
  userMessage: string,
  options?: { temperature?: number }
): Promise<LLMResponse> {
  const { primary, fallback } = ROUTING_TABLE[scene] ?? ROUTING_TABLE.general;
  const messages = [
    { role: "system" as const, content: systemPrompt },
    { role: "user" as const, content: userMessage },
  ];

  const deepseekKey = process.env.DEEPSEEK_API_KEY || "";
  const minimaxKey = process.env.MINIMAX_API_KEY || "";

  console.log(`[llmComplete] scene=${scene}, primary=${primary}, deepseekKey=${deepseekKey ? 'SET' : 'MISSING'}, minimaxKey=${minimaxKey ? 'SET' : 'MISSING'}`);

  // Try primary
  try {
    if (primary === "deepseek") {
      if (!deepseekKey) throw new Error("DEEPSEEK_API_KEY not set");
      return await callDeepSeek(deepseekKey, messages, options?.temperature);
    } else {
      if (!minimaxKey) throw new Error("MINIMAX_API_KEY not set");
      return await callMiniMax(minimaxKey, messages, options?.temperature);
    }
  } catch (primaryErr) {
    console.warn(`[llmComplete] Primary ${primary} failed:`, primaryErr instanceof Error ? primaryErr.message : String(primaryErr));
  }

  // Fallback
  try {
    if (fallback === "deepseek") {
      if (!deepseekKey) throw new Error("DEEPSEEK_API_KEY not set");
      return await callDeepSeek(deepseekKey, messages, options?.temperature);
    } else {
      if (!minimaxKey) throw new Error("MINIMAX_API_KEY not set");
      return await callMiniMax(minimaxKey, messages, options?.temperature);
    }
  } catch (fallbackErr) {
    const errMsg = `AI generation failed. Please check your API keys. Primary error: ${primary}, Fallback error: ${fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr)}`;
    console.error(`[llmComplete] ${errMsg}`);
    throw new Error(errMsg);
  }
}

export const SYSTEM_PROMPTS = {
  wbs: `你是一位资深项目管理专家，精通PMBOK和PRINCE2方法论。
请根据项目信息生成WBS（工作分解结构）。
规则：
1. 按"阶段→交付物→工作包→具体活动"四层拆解
2. 每个工作包标注估算工期（天）和前置依赖
3. 遵循100%原则
4. 输出缩进列表，编号如1.1, 1.1.1, 1.1.1.1
5. 工作包粒度5-15天`,

  risk: `你是教育行业项目管理风险专家。
分析维度：进度风险、成本风险、质量风险、干系人风险、合同风险。
输出JSON数组，每项包含：description, probability, impact, mitigation`,

  report: `你是PMO负责人，生成专业项目管理报告。
规则：总-分-总结构，数据准确不编造，用🔴🟡🟢标严重程度，Markdown格式输出`,

  parse: `将合同付款条件解析为JSON回款里程碑数组。
格式：[{"milestone": "", "percentage": 0, "trigger": "", "estimated_days": 0}]`,

  summary: `从会议记录中提取：核心决议、待办事项（任务-责任人-截止日期）、未决议题。Markdown格式。`,

  quality: `你是教育行业质量管理专家，精通PMBOK质量管理与ISO9001质量体系。
根据项目类型和阶段，生成针对性的质量检查清单。
规则：
1. 每个检查项简洁明了，控制在20字以内
2. 按照"必检项"和"建议项"分类
3. 覆盖：流程合规、文档完整性、质量指标、风险控制、交付验收五大维度
4. 输出格式：序号. 检查项内容 [必检/建议]
5. 只输出检查清单，不要其他说明`,
};

export { llmComplete, MODELS };
export type { ModelType, LLMResponse };