export type AiProvider = "deepseek" | "minimax" | "glm" | "anthropic" | "openai-compatible";

export type AiModelSource = "user" | "global" | "default";

export interface AiModelSummary {
  provider: AiProvider;
  providerLabel: string;
  model: string;
  source: AiModelSource;
  configured: boolean;
}

type Environment = Record<string, string | undefined>;

type UserAiSettingsRow = {
  provider?: string | null;
  model?: string | null;
  api_key?: string | null;
  api_key_encrypted?: string | null;
  api_key_last4?: string | null;
  enabled?: boolean | null;
};

const providerLabels: Record<AiProvider, string> = {
  deepseek: "DeepSeek",
  minimax: "MiniMax",
  glm: "GLM",
  anthropic: "Anthropic",
  "openai-compatible": "OpenAI兼容",
};

const defaultModels: Record<Exclude<AiProvider, "openai-compatible">, string> = {
  deepseek: "deepseek-chat",
  minimax: "MiniMax-M3",
  glm: "glm-4.5",
  anthropic: "claude-sonnet-4-5",
};

function providerFrom(value: unknown): AiProvider | null {
  if (
    value === "deepseek" ||
    value === "minimax" ||
    value === "glm" ||
    value === "anthropic" ||
    value === "openai-compatible"
  ) {
    return value;
  }
  return null;
}

function summary(provider: AiProvider, model: string, source: AiModelSource, configured: boolean): AiModelSummary {
  return {
    provider,
    providerLabel: providerLabels[provider],
    model,
    source,
    configured,
  };
}

export function getGlobalAiModelSummary(environment: Environment = process.env): AiModelSummary {
  const minimaxModel = environment.MINIMAX_MODEL?.trim() || defaultModels.minimax;
  if (environment.MINIMAX_API_KEY?.trim()) {
    return summary("minimax", minimaxModel, "global", true);
  }
  if (environment.DEEPSEEK_API_KEY?.trim()) {
    return summary("deepseek", defaultModels.deepseek, "global", true);
  }
  if (environment.GLM_API_KEY?.trim()) {
    return summary("glm", environment.GLM_MODEL?.trim() || defaultModels.glm, "global", true);
  }
  if (environment.ANTHROPIC_API_KEY?.trim()) {
    return summary("anthropic", environment.ANTHROPIC_MODEL?.trim() || defaultModels.anthropic, "global", true);
  }

  return summary("minimax", minimaxModel, "default", false);
}

export function getUserAiModelSummary(row: UserAiSettingsRow | null | undefined): AiModelSummary | null {
  const configured = Boolean(row?.api_key_last4?.trim() || row?.api_key_encrypted?.trim() || row?.api_key?.trim());
  if (!row || row.enabled === false || !configured) return null;
  const provider = providerFrom(row.provider);
  if (!provider) return null;
  const model = row.model?.trim() || (provider === "openai-compatible" ? "自定义模型" : defaultModels[provider]);
  return summary(provider, model, "user", true);
}

export async function getEffectiveAiModelSummary(userId?: string | null): Promise<AiModelSummary> {
  if (userId) {
    try {
      const auth = await import("../auth/server.ts");
      if (auth.isAuthStorageConfigured()) {
        const supabase = auth.getAuthSupabase();
        const { data, error } = await supabase
          .from("user_ai_settings")
          .select("provider,model,api_key_last4,enabled")
          .eq("user_id", userId)
          .maybeSingle();
        if (!error) {
          const userSummary = getUserAiModelSummary(data as UserAiSettingsRow | null);
          if (userSummary) return userSummary;
        }
      }
    } catch {
      // Fall back to global runtime settings. Never surface credentials or storage errors here.
    }
  }

  return getGlobalAiModelSummary();
}
