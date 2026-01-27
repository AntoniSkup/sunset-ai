/**
 * Shared helper to construct the AI model instance.
 *
 * Kept in `lib/` so other server-only modules (e.g. code generation) can use it
 * without importing Next.js route handlers (which can cause circular imports).
 */
export async function getAIModel() {
  const modelProvider = process.env.AI_MODEL_PROVIDER;
  // const modelName = process.env.AI_MODEL_NAME || "gpt-5.2";
  const modelName = process.env.AI_MODEL_NAME || "gpt-5-mini";

  if (!modelProvider) {
    throw new Error("AI_MODEL_PROVIDER environment variable is not set");
  }

  if (modelProvider === "openai") {
    const { openai } = await import("@ai-sdk/openai");
    return openai(modelName);
  }

  throw new Error(`Unsupported AI model provider: ${modelProvider}`);
}
