import { NextResponse } from "next/server";
import { getAuthSupabase, getCurrentUser, isAuthStorageConfigured } from "@/features/auth/server";

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

function isProvider(value: unknown): value is Provider {
  return providerOptions.includes(value as Provider);
}

function safeSettings(row: {
  provider?: string | null;
  model?: string | null;
  base_url?: string | null;
  api_key_last4?: string | null;
  enabled?: boolean | null;
} | null) {
  const provider = isProvider(row?.provider) ? row.provider : "minimax";
  return {
    provider,
    model: row?.model || defaultModels[provider],
    baseUrl: row?.base_url || "",
    enabled: row?.enabled ?? true,
    apiKeyConfigured: Boolean(row?.api_key_last4),
    apiKeyLast4: row?.api_key_last4 || "",
    providerOptions,
    defaultModels,
  };
}

export async function GET() {
  if (!isAuthStorageConfigured()) {
    return NextResponse.json({ error: "AUTH_STORAGE_NOT_CONFIGURED" }, { status: 503 });
  }

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  const supabase = getAuthSupabase();
  const { data, error } = await supabase
    .from("user_ai_settings")
    .select("provider,model,base_url,api_key_last4,enabled")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ settings: safeSettings(data) });
}

export async function PUT(request: Request) {
  if (!isAuthStorageConfigured()) {
    return NextResponse.json({ error: "AUTH_STORAGE_NOT_CONFIGURED" }, { status: 503 });
  }

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  const body = await request.json();
  const provider = String(body.provider || "").trim();
  if (!isProvider(provider)) {
    return NextResponse.json({ error: "不支持的模型提供商" }, { status: 400 });
  }
  const model = String(body.model || defaultModels[provider]).trim();
  const baseUrl = String(body.baseUrl || "").trim();
  const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
  if (!model) return NextResponse.json({ error: "请填写模型名称" }, { status: 400 });

  const supabase = getAuthSupabase();
  const { data: existing } = await supabase
    .from("user_ai_settings")
    .select("api_key,api_key_last4")
    .eq("user_id", user.id)
    .maybeSingle();

  const payload: Record<string, unknown> = {
    user_id: user.id,
    provider,
    model,
    base_url: baseUrl || null,
    enabled: body.enabled !== false,
    updated_at: new Date().toISOString(),
  };
  if (apiKey) {
    payload.api_key = apiKey;
    payload.api_key_last4 = apiKey.slice(-4);
  } else if (existing?.api_key) {
    payload.api_key = existing.api_key;
    payload.api_key_last4 = existing.api_key_last4;
  }

  const { data, error } = await supabase
    .from("user_ai_settings")
    .upsert(payload, { onConflict: "user_id" })
    .select("provider,model,base_url,api_key_last4,enabled")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ settings: safeSettings(data) });
}
