/**
 * Shared helper to construct the AI model instance.
 *
 * Kept in `lib/` so other server-only modules (e.g. code generation) can use it
 * without importing Next.js route handlers (which can cause circular imports).
 *
 * Switch models via env vars:
 *   AI_MODEL_PROVIDER=google|openai
 *   AI_MODEL_NAME=gemini-3-pro-preview (main) or gpt-5.2
 *   AI_LIGHTER_MODEL_NAME=gemini-3-flash-preview (fast) or gpt-4o-mini
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
} as const;

export async function getAIModel(useLighterModel: boolean = false) {
  const modelProvider = process.env.AI_MODEL_PROVIDER;
  const defaults = DEFAULT_MODELS[modelProvider as keyof typeof DEFAULT_MODELS] ?? DEFAULT_MODELS.openai;
  const modelName = process.env.AI_MODEL_NAME || defaults.main;
  const lighterModelName = process.env.AI_LIGHTER_MODEL_NAME || defaults.lighter;

  if (!modelProvider) {
    throw new Error("AI_MODEL_PROVIDER environment variable is not set");
  }

  if (modelProvider === "google") {
    const { google } = await import("@ai-sdk/google");
    return google(useLighterModel ? lighterModelName : modelName);
  }

  if (modelProvider === "openai") {
    const { openai } = await import("@ai-sdk/openai");
    return openai(useLighterModel ? lighterModelName : modelName);
  }

  throw new Error(`Unsupported AI model provider: ${modelProvider}`);
}
