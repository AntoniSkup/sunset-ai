import type { LanguageModel } from "ai";

const ANTHROPIC_LIGHTER_DEFAULT = "claude-haiku-4.5";

export type ModelRoutingDecision = {
  useLighterModel: boolean;
  routerModelId: string | null;
  routerProvider: string | null;
  usedFallbackModel: boolean;
};

function isAnthropicModelNotFoundError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const maybeStatusCode = (error as { statusCode?: unknown }).statusCode;
  if (maybeStatusCode !== 404) return false;

  const responseBody = (error as { responseBody?: unknown }).responseBody;
  if (typeof responseBody !== "string") {
    const maybeType = (error as { type?: unknown }).type;
    return typeof maybeType === "string" && maybeType.toLowerCase() === "model_not_found";
  }

  const lower = responseBody.toLowerCase();
  return lower.includes("not_found_error") || lower.includes("model_not_found");
}

export async function shouldUseLighterModel(
  userQuestion: string,
  context?: { userId?: number; chatId?: string }
): Promise<ModelRoutingDecision> {
  const modelProvider = process.env.AI_MODEL_PROVIDER;

  if (!modelProvider) {
    return {
      useLighterModel: false,
      routerModelId: null,
      routerProvider: null,
      usedFallbackModel: false,
    };
  }

  try {
    const useGateway = process.env.AI_USE_GATEWAY === "true";
    const lighterModelName = process.env.AI_LIGHTER_MODEL_NAME;
    const configuredModelName =
      lighterModelName ||
      (modelProvider === "google"
        ? "gemini-3-flash-preview"
        : modelProvider === "openai"
          ? "gpt-4o-mini"
          : modelProvider === "anthropic"
            ? ANTHROPIC_LIGHTER_DEFAULT
            : "");

    const { generateText, gateway } = await import("ai");

    const buildModel = async (modelName: string): Promise<LanguageModel> => {
      if (useGateway) {
        return gateway(`${modelProvider}/${modelName}`) as LanguageModel;
      }
      if (modelProvider === "google") {
        const { google } = await import("@ai-sdk/google");
        return google(modelName) as LanguageModel;
      }
      if (modelProvider === "openai") {
        const { openai } = await import("@ai-sdk/openai");
        return openai(modelName) as LanguageModel;
      }
      if (modelProvider === "anthropic") {
        const { anthropic } = await import("@ai-sdk/anthropic");
        return anthropic(modelName) as LanguageModel;
      }
      throw new Error(`Unsupported router model provider: ${modelProvider}`);
    };

    const toRouterModelId = (modelName: string) =>
      useGateway ? `${modelProvider}/${modelName}` : modelName;

    const routeQuestion = async (model: LanguageModel) =>
      generateText({
        model,
        experimental_telemetry: {
          isEnabled: true,
          functionId: "model-router",
          metadata: context
            ? {
                ...(context.userId != null && { userId: context.userId }),
                ...(context.chatId != null && { chatId: context.chatId }),
              }
            : undefined,
        },
        system: `You are a routing assistant. Analyze the user's question and determine if it's a simple change request that can be answered with a lighter, faster model.

      Simple questions include:
      - Small, straightforward code changes (e.g., "make it blue", "change the font", "add a button")
      - Simple modifications to existing code
      - Clear, unambiguous requests

      Complex questions that require the advanced model include:
      - Architecture or design decisions
      - Multi-file refactoring
      - Debugging unclear issues
      - Security-related questions
      - Performance optimization
      - Questions requiring deep reasoning or context

      Respond with ONLY "true" or "false" (lowercase, no quotes, no explanation). Default to "false" if uncertain.`,
        prompt: userQuestion,
      });

    let result;
    let finalRouterModelName = configuredModelName;
    let usedFallbackModel = false;
    try {
      result = await routeQuestion(await buildModel(configuredModelName));
    } catch (error) {
      const shouldRetryWithAnthropicFallback =
        modelProvider === "anthropic" &&
        configuredModelName !== ANTHROPIC_LIGHTER_DEFAULT &&
        isAnthropicModelNotFoundError(error);
      if (!shouldRetryWithAnthropicFallback) {
        throw error;
      }
      finalRouterModelName = ANTHROPIC_LIGHTER_DEFAULT;
      usedFallbackModel = true;
      result = await routeQuestion(await buildModel(ANTHROPIC_LIGHTER_DEFAULT));
    }

    const response = result.text.trim().toLowerCase();
    return {
      useLighterModel: response === "true",
      routerModelId: toRouterModelId(finalRouterModelName),
      routerProvider: modelProvider,
      usedFallbackModel,
    };
  } catch (error) {
    console.error("Error in model router:", error);
    return {
      useLighterModel: false,
      routerModelId: null,
      routerProvider: modelProvider,
      usedFallbackModel: false,
    };
  }
}
