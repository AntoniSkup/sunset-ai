import type { LanguageModel } from "ai";

/**
 * Shared helper to construct the AI model instance.
 *
 * Kept in `lib/` so other server-only modules (e.g. code generation) can use it
 * without importing Next.js route handlers (which can cause circular imports).
 *
 * Switch models via env vars:
 *   AI_MODEL_PROVIDER=google|openai|anthropic
 *   AI_MODEL_NAME=gemini-3-pro-preview (main) or gpt-5.2 or claude-sonnet-4-6
 *   AI_LIGHTER_MODEL_NAME=gemini-3-flash-preview (fast) or gpt-4o-mini or claude-3-5-haiku-20241022
 *
 * AI Gateway mode (optional):
 *   AI_USE_GATEWAY=true - Route requests through Vercel AI Gateway instead of direct providers
 *   AI_GATEWAY_API_KEY=*** - Get from https://vercel.com/dashboard → AI Gateway → API Keys
 *   When deployed on Vercel, OIDC auth works automatically (no API key needed in prod)
 */
const DEFAULT_MODELS = {
  google: {
    main: "gemini-3-pro-preview",
    lighter: "gemini-3-flash-preview",
  },
  openai: {
    main: "gpt-5.2",
    lighter: "gpt-4o-mini",
  },
  anthropic: {
    main: "claude-sonnet-4-6",
    lighter: "claude-3-5-haiku-20241022",
  },
} as const;

const GATEWAY_PROVIDERS = ["google", "openai", "anthropic"] as const;

export async function getAIModel(useLighterModel: boolean = false): Promise<LanguageModel> {
  const modelProvider = process.env.AI_MODEL_PROVIDER;
  const defaults = DEFAULT_MODELS[modelProvider as keyof typeof DEFAULT_MODELS] ?? DEFAULT_MODELS.openai;
  const modelName = process.env.AI_MODEL_NAME || defaults.main;
  const lighterModelName = process.env.AI_LIGHTER_MODEL_NAME || defaults.lighter;

  if (!modelProvider) {
    throw new Error("AI_MODEL_PROVIDER environment variable is not set");
  }

  const useGateway = process.env.AI_USE_GATEWAY === "true";

  if (useGateway) {
    if (!GATEWAY_PROVIDERS.includes(modelProvider as (typeof GATEWAY_PROVIDERS)[number])) {
      throw new Error(
        `AI Gateway only supports providers: ${GATEWAY_PROVIDERS.join(", ")}. Got: ${modelProvider}`,
      );
    }
    const { gateway } = await import("ai");
    const modelId = `${modelProvider}/${useLighterModel ? lighterModelName : modelName}`;
    return gateway(modelId) as LanguageModel;
  }

  if (modelProvider === "google") {
    const { google } = await import("@ai-sdk/google");
    return google(useLighterModel ? lighterModelName : modelName) as LanguageModel;
  }

  if (modelProvider === "openai") {
    const { openai } = await import("@ai-sdk/openai");
    return openai(useLighterModel ? lighterModelName : modelName) as LanguageModel;
  }

  throw new Error(`Unsupported AI model provider: ${modelProvider}`);
}
