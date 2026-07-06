import type { AiProvider } from "./settings.ts";

export type AiConnectionTestStatus = "ok" | "not_configured" | "failed";
export type AiConnectionFailureCategory =
  | "missing_key"
  | "missing_base_url"
  | "auth_error"
  | "rate_limited"
  | "provider_error"
  | "http_error"
  | "network_error"
  | "invalid_response";

export interface AiConnectionTestInput {
  provider: AiProvider;
  model: string;
  baseUrl?: string | null;
  apiKey?: string | null;
  enabled?: boolean | null;
}

export interface AiConnectionTestResult {
  status: AiConnectionTestStatus;
  provider: AiProvider;
  providerLabel: string;
  model: string;
  checkedAt: string;
  latencyMs?: number;
  failureCategory?: AiConnectionFailureCategory;
  message: string;
  nextActions: string[];
  endpointHost?: string;
  responsePreview?: string;
}

type Fetcher = typeof fetch;

const providerLabels: Record<AiProvider, string> = {
  deepseek: "DeepSeek",
  minimax: "MiniMax",
  glm: "GLM",
  anthropic: "Anthropic",
  "openai-compatible": "OpenAI兼容",
};

const providerDefaultBase: Record<Exclude<AiProvider, "openai-compatible">, string> = {
  deepseek: "https://api.deepseek.com/v1",
  minimax: "https://api.minimax.chat/v1",
  glm: "https://open.bigmodel.cn/api/paas/v4",
  anthropic: "https://api.anthropic.com/v1",
};

function endpointBase(input: AiConnectionTestInput): string {
  const trimmed = input.baseUrl?.trim();
  if (trimmed) return trimmed.replace(/\/$/, "");
  if (input.provider === "openai-compatible") return "";
  return providerDefaultBase[input.provider].replace(/\/$/, "");
}

function endpointHost(baseUrl: string): string | undefined {
  try {
    return new URL(baseUrl).host;
  } catch {
    return undefined;
  }
}

function failureResult(input: AiConnectionTestInput, category: AiConnectionFailureCategory, message: string, nextActions: string[]): AiConnectionTestResult {
  const baseUrl = endpointBase(input);
  return {
    status: category === "missing_key" || category === "missing_base_url" ? "not_configured" : "failed",
    provider: input.provider,
    providerLabel: providerLabels[input.provider],
    model: input.model,
    checkedAt: new Date().toISOString(),
    failureCategory: category,
    message,
    nextActions,
    endpointHost: baseUrl ? endpointHost(baseUrl) : undefined,
  };
}

export function classifyAiConnectionHttpFailure(status: number): AiConnectionFailureCategory {
  if (status === 401 || status === 403) return "auth_error";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "provider_error";
  return "http_error";
}

export function aiConnectionFailureActions(category: AiConnectionFailureCategory): string[] {
  if (category === "missing_key") return ["在用户中心填写 API Key，或关闭个人模型配置后使用全局模型。"];
  if (category === "missing_base_url") return ["OpenAI兼容提供商必须填写 Base URL，例如 https://example.com/v1。"];
  if (category === "auth_error") return ["检查 API Key 是否复制完整、是否属于当前提供商、是否已过期或被禁用。"];
  if (category === "rate_limited") return ["当前模型供应商限流，稍后重试，或临时切换到全局模型/其他供应商。"];
  if (category === "provider_error") return ["模型供应商服务异常，稍后重试；如果持续失败，切换备用模型。"];
  if (category === "network_error") return ["检查 Vercel/本机网络到模型供应商的连通性，以及 Base URL 是否可访问。"];
  if (category === "invalid_response") return ["模型返回格式异常，请确认该接口兼容 chat/completions 或 Anthropic messages 协议。"];
  return ["检查模型名称、Base URL、API Key 和供应商是否匹配。"];
}

function sanitizeErrorText(value: string): string {
  return value
    .replace(/sk-[A-Za-z0-9_-]{8,}/g, "[redacted]")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [redacted]")
    .slice(0, 240);
}

async function readTextSafely(response: Response): Promise<string> {
  try {
    return sanitizeErrorText(await response.text());
  } catch {
    return "";
  }
}

function anthropicRequest(input: AiConnectionTestInput) {
  return {
    path: "/messages",
    body: {
      model: input.model,
      system: "你是连接测试助手。只回复 OK。",
      messages: [{ role: "user", content: "请回复 OK" }],
      max_tokens: 8,
      temperature: 0,
    },
    headers: {
      "Content-Type": "application/json",
      "x-api-key": input.apiKey ?? "",
      "anthropic-version": "2023-06-01",
    },
  };
}

function openAiCompatibleRequest(input: AiConnectionTestInput) {
  return {
    path: "/chat/completions",
    body: {
      model: input.model,
      messages: [
        { role: "system", content: "你是连接测试助手。只回复 OK。" },
        { role: "user", content: "请回复 OK" },
      ],
      max_tokens: 8,
      temperature: 0,
    },
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${input.apiKey ?? ""}`,
    },
  };
}

function responsePreview(provider: AiProvider, payload: unknown): string {
  if (provider === "anthropic") {
    const content = (payload as { content?: Array<{ text?: string }> }).content;
    return Array.isArray(content) ? content.map(item => item.text || "").join("").slice(0, 80) : "";
  }
  const choices = (payload as { choices?: Array<{ message?: { content?: string } }> }).choices;
  return choices?.[0]?.message?.content?.slice(0, 80) || "";
}

export async function testAiConnection(input: AiConnectionTestInput, fetcher: Fetcher = fetch): Promise<AiConnectionTestResult> {
  if (input.enabled === false) {
    return failureResult(input, "missing_key", "个人模型配置未启用。", ["启用个人模型配置后再测试，或继续使用全局模型。"]);
  }
  if (!input.apiKey?.trim()) {
    return failureResult(input, "missing_key", "缺少 API Key，无法测试模型连通性。", aiConnectionFailureActions("missing_key"));
  }
  const baseUrl = endpointBase(input);
  if (!baseUrl) {
    return failureResult(input, "missing_base_url", "OpenAI兼容模型缺少 Base URL。", aiConnectionFailureActions("missing_base_url"));
  }

  const request = input.provider === "anthropic" ? anthropicRequest(input) : openAiCompatibleRequest(input);
  const startedAt = Date.now();
  try {
    const response = await fetcher(`${baseUrl}${request.path}`, {
      method: "POST",
      headers: request.headers,
      body: JSON.stringify(request.body),
    });
    const latencyMs = Date.now() - startedAt;
    if (!response.ok) {
      const category = classifyAiConnectionHttpFailure(response.status);
      const detail = await readTextSafely(response);
      return {
        ...failureResult(input, category, `${providerLabels[input.provider]} 测试失败：HTTP ${response.status}${detail ? ` / ${detail}` : ""}`, aiConnectionFailureActions(category)),
        latencyMs,
      };
    }
    const payload = await response.json().catch(() => null);
    const preview = responsePreview(input.provider, payload);
    if (!preview) {
      return {
        ...failureResult(input, "invalid_response", "模型接口返回成功，但未识别到有效回复内容。", aiConnectionFailureActions("invalid_response")),
        latencyMs,
      };
    }
    return {
      status: "ok",
      provider: input.provider,
      providerLabel: providerLabels[input.provider],
      model: input.model,
      checkedAt: new Date().toISOString(),
      latencyMs,
      message: `${providerLabels[input.provider]} 模型连通性正常。`,
      nextActions: ["可以保存并启用该模型配置；业务功能将优先使用个人模型，失败时再按系统策略降级。"],
      endpointHost: endpointHost(baseUrl),
      responsePreview: preview,
    };
  } catch (error) {
    return failureResult(
      input,
      "network_error",
      `模型测试请求失败：${sanitizeErrorText(error instanceof Error ? error.message : String(error))}`,
      aiConnectionFailureActions("network_error"),
    );
  }
}
