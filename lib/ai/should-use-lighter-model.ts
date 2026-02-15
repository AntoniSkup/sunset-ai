export async function shouldUseLighterModel(userQuestion: string): Promise<boolean> {
  const modelProvider = process.env.AI_MODEL_PROVIDER;

  if (!modelProvider) {
    return false;
  }

  try {
    let routerModel;
    if (modelProvider === "openai") {
      const { openai } = await import("@ai-sdk/openai");
      routerModel = openai("gpt-4o-mini");
    } else {
      return false;
    }

    const { generateText } = await import("ai");

    const result = await generateText({
      model: routerModel,
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
      maxTokens: 10,
    });

    const response = result.text.trim().toLowerCase();
    return response === "true";
  } catch (error) {
    console.error("Error in model router:", error);
    return false;
  }
}
