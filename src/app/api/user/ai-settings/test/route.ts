import { NextResponse } from "next/server";
import { testAiConnection } from "@/features/ai/connection-test";
import { getAuthSupabase, getCurrentUser, isAuthStorageConfigured } from "@/features/auth/server";
import type { AiProvider } from "@/features/ai/settings";

export const runtime = "nodejs";

const providerOptions = ["deepseek", "minimax", "glm", "anthropic", "openai-compatible"] as const;
type Provider = typeof providerOptions[number];

const defaultModels: Record<Provider, string> = {
  deepseek: "deepseek-chat",
  minimax: "MiniMax-M3",
  glm: "glm-4.5",
  anthropic: "claude-sonnet-4",
  "openai-compatible": "custom-model",
};

type UserAiSettingsRow = {
  provider?: string | null;
  model?: string | null;
  base_url?: string | null;
  api_key?: string | null;
  enabled?: boolean | null;
};

function isProvider(value: unknown): value is Provider {
  return providerOptions.includes(value as Provider);
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  if (!isAuthStorageConfigured()) {
    return NextResponse.json({ request_id: requestId, status: "not_configured", warning: "AUTH_STORAGE_NOT_CONFIGURED" }, { status: 503 });
  }

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ request_id: requestId, status: "unauthorized", warning: "请先登录" }, { status: 401 });

  let body: Record<string, unknown> = {};
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    body = {};
  }

  const supabase = getAuthSupabase();
  const { data: existing, error } = await supabase
    .from("user_ai_settings")
    .select("provider,model,base_url,api_key,enabled")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) return NextResponse.json({ request_id: requestId, status: "failed", warning: error.message }, { status: 500 });

  const row = existing as UserAiSettingsRow | null;
  const requestedProvider = text(body.provider) || row?.provider || "minimax";
  if (!isProvider(requestedProvider)) {
    return NextResponse.json({ request_id: requestId, status: "failed", warning: "不支持的模型提供商" }, { status: 400 });
  }
  const provider = requestedProvider as AiProvider;
  const model = text(body.model) || row?.model?.trim() || defaultModels[requestedProvider];
  const baseUrl = body.baseUrl === undefined ? row?.base_url || "" : text(body.baseUrl);
  const apiKey = text(body.apiKey) || row?.api_key || "";
  const enabled = body.enabled === undefined ? row?.enabled !== false : body.enabled !== false;

  const result = await testAiConnection({
    provider,
    model,
    baseUrl,
    apiKey,
    enabled,
  });

  return NextResponse.json({ request_id: requestId, test: result }, {
    status: result.status === "ok" ? 200 : result.status === "not_configured" ? 400 : 502,
    headers: { "Cache-Control": "no-store", "X-Request-Id": requestId },
  });
}
