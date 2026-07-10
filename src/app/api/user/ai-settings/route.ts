import { NextResponse } from "next/server";
import { getAuthSupabase, getCurrentUser, isAuthStorageConfigured } from "@/features/auth/server";
import {
  aiApiKeyCredentialContext,
  encryptCredential,
  resolveStoredCredential,
} from "@/features/security/credential-encryption";

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

  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "请求格式无效" }, { status: 400 });
  }
  const provider = String(body.provider || "").trim();
  if (!isProvider(provider)) {
    return NextResponse.json({ error: "不支持的模型提供商" }, { status: 400 });
  }
  const model = String(body.model || defaultModels[provider]).trim();
  const baseUrl = String(body.baseUrl || "").trim();
  const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
  if (!model) return NextResponse.json({ error: "请填写模型名称" }, { status: 400 });

  const supabase = getAuthSupabase();
  const { data: existing, error: existingError } = await supabase
    .from("user_ai_settings")
    .select("api_key,api_key_encrypted,api_key_last4,credential_key_version")
    .eq("user_id", user.id)
    .maybeSingle();
  if (existingError) {
    return NextResponse.json({ error: "AI_SETTINGS_STORAGE_FAILED" }, { status: 500 });
  }

  const payload: Record<string, unknown> = {
    user_id: user.id,
    provider,
    model,
    base_url: baseUrl || null,
    enabled: body.enabled !== false,
    api_key: null,
    api_key_encrypted: null,
    credential_key_version: null,
    updated_at: new Date().toISOString(),
  };
  try {
    const stored = resolveStoredCredential({
      encrypted: existing?.api_key_encrypted,
      plaintext: existing?.api_key,
      context: aiApiKeyCredentialContext(user.id),
    });
    const value = apiKey || stored.value;
    if (value) {
      const encrypted = encryptCredential(value, aiApiKeyCredentialContext(user.id));
      payload.api_key_encrypted = encrypted.encrypted;
      payload.credential_key_version = encrypted.keyVersion;
      payload.api_key = null;
      payload.api_key_last4 = value.slice(-4);
    }
  } catch {
    return NextResponse.json({ error: "CREDENTIAL_ENCRYPTION_UNAVAILABLE" }, { status: 503 });
  }

  const { data, error } = await supabase
    .from("user_ai_settings")
    .upsert(payload, { onConflict: "user_id" })
    .select("provider,model,base_url,api_key_last4,enabled")
    .single();

  if (error) return NextResponse.json({ error: "AI_SETTINGS_STORAGE_FAILED" }, { status: 500 });
  return NextResponse.json({ settings: safeSettings(data) });
}
