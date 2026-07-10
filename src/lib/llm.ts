// LLM Gateway - user-configurable provider first, DeepSeek + MiniMax routing fallback
import { SYSTEM_PROMPTS } from "./llm-prompts";
import {
  aiApiKeyCredentialContext,
  resolveStoredCredential,
} from "../features/security/credential-encryption";

const DEEPSEEK_BASE = "https://api.deepseek.com/v1";
const MINIMAX_BASE = "https://api.minimax.chat/v1";
const GLM_BASE = "https://open.bigmodel.cn/api/paas/v4";
const ANTHROPIC_BASE = "https://api.anthropic.com/v1";

const MODELS = {
  deepseek: "deepseek-chat",
  minimax: process.env.MINIMAX_MODEL || "MiniMax-M3",
} as const;

type ModelType = keyof typeof MODELS;
type UserProvider = "deepseek" | "minimax" | "glm" | "anthropic" | "openai-compatible";

interface UserLLMSettings {
  provider: UserProvider;
  model: string;
  baseUrl?: string | null;
  apiKey: string;
  enabled: boolean;
}

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
  cpm: { primary: "minimax", fallback: "deepseek" },
  execution: { primary: "minimax", fallback: "deepseek" },
  planning: { primary: "minimax", fallback: "deepseek" },
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
    throw new Error(`DeepSeek API error ${response.status}`);
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
      model: MODELS.minimax,
      messages,
      temperature: temperature ?? 0.7,
      max_tokens: 2048,
    }),
  });

  if (!response.ok) {
    throw new Error(`MiniMax API error ${response.status}`);
  }

  const data = await response.json();
  return {
    content: data.choices?.[0]?.message?.content ?? "",
    model: MODELS.minimax,
    usage: data.usage,
  };
}

async function callOpenAICompatible(
  provider: UserProvider,
  apiKey: string,
  model: string,
  baseUrl: string,
  messages: Array<{ role: string; content: string }>,
  temperature?: number,
): Promise<LLMResponse> {
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: temperature ?? 0.7,
      max_tokens: 2048,
    }),
  });

  if (!response.ok) {
    throw new Error(`${provider} API error ${response.status}`);
  }

  const data = await response.json();
  return {
    content: data.choices?.[0]?.message?.content ?? "",
    model,
    usage: data.usage,
  };
}

async function callAnthropic(
  apiKey: string,
  model: string,
  baseUrl: string,
  messages: Array<{ role: string; content: string }>,
  temperature?: number,
): Promise<LLMResponse> {
  const system = messages.find(message => message.role === "system")?.content || "";
  const userMessages = messages.filter(message => message.role !== "system");
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      system,
      messages: userMessages.map(message => ({
        role: message.role === "assistant" ? "assistant" : "user",
        content: message.content,
      })),
      temperature: temperature ?? 0.7,
      max_tokens: 2048,
    }),
  });

  if (!response.ok) {
    throw new Error(`anthropic API error ${response.status}`);
  }

  const data = await response.json();
  const content = Array.isArray(data.content)
    ? data.content.map((item: { text?: string }) => item.text || "").join("")
    : "";
  return { content, model };
}

function providerDefaultBase(provider: UserProvider): string {
  if (provider === "deepseek") return DEEPSEEK_BASE;
  if (provider === "minimax") return MINIMAX_BASE;
  if (provider === "glm") return GLM_BASE;
  if (provider === "anthropic") return ANTHROPIC_BASE;
  return "";
}

async function callUserProvider(
  settings: UserLLMSettings,
  messages: Array<{ role: string; content: string }>,
  temperature?: number,
): Promise<LLMResponse> {
  const baseUrl = settings.baseUrl || providerDefaultBase(settings.provider);
  if (!baseUrl) throw new Error("用户模型配置缺少 Base URL");
  if (settings.provider === "anthropic") {
    return callAnthropic(settings.apiKey, settings.model, baseUrl, messages, temperature);
  }
  return callOpenAICompatible(settings.provider, settings.apiKey, settings.model, baseUrl, messages, temperature);
}

async function readCurrentUserLLMSettings(): Promise<UserLLMSettings | null> {
  try {
    const auth = await import("../features/auth/server.ts");
    if (!auth.isAuthStorageConfigured()) return null;
    const user = await auth.getCurrentUser();
    if (!user) return null;
    const supabase = auth.getAuthSupabase();
    const { data, error } = await supabase
      .from("user_ai_settings")
      .select("provider,model,base_url,api_key,api_key_encrypted,enabled")
      .eq("user_id", user.id)
      .maybeSingle();
    if (error || !data || data.enabled === false) return null;
    const apiKey = resolveStoredCredential({
      encrypted: data.api_key_encrypted,
      plaintext: data.api_key,
      context: aiApiKeyCredentialContext(user.id),
    }).value;
    if (!apiKey) return null;
    const provider = String(data.provider || "minimax") as UserProvider;
    if (!["deepseek", "minimax", "glm", "anthropic", "openai-compatible"].includes(provider)) return null;
    return {
      provider,
      model: String(data.model || MODELS.minimax),
      baseUrl: typeof data.base_url === "string" ? data.base_url : null,
      apiKey,
      enabled: data.enabled !== false,
    };
  } catch {
    return null;
  }
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

  console.log(`[llmComplete] scene=${scene}, primary=${primary}`);

  const userSettings = await readCurrentUserLLMSettings();
  if (userSettings) {
    try {
      return await callUserProvider(userSettings, messages, options?.temperature);
    } catch {
      console.warn(`[llmComplete] User provider ${userSettings.provider} failed without credential details`);
    }
  }

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

export { llmComplete, MODELS, SYSTEM_PROMPTS };
export type { ModelType, LLMResponse };
