import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/db/queries";
import { streamText, convertToModelMessages } from "ai";
import type { UIMessage } from "ai";

async function getAIModel() {
  const modelProvider = process.env.AI_MODEL_PROVIDER;
  const modelName = process.env.AI_MODEL_NAME || "gpt-5.2";

  if (!modelProvider) {
    throw new Error("AI_MODEL_PROVIDER environment variable is not set");
  }

  if (modelProvider === "openai") {
    const { openai } = await import("@ai-sdk/openai");
    return openai(modelName);
  }

  throw new Error(`Unsupported AI model provider: ${modelProvider}`);
}

export async function POST(request: NextRequest) {
  const user = await getUser();

  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized", code: "UNAUTHORIZED" },
      { status: 401 }
    );
  }

  try {
    const body = await request.json();
    const { messages } = body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(
        { error: "Invalid messages", code: "INVALID_MESSAGE" },
        { status: 400 }
      );
    }

    const model = await getAIModel();

    const modelMessages = await convertToModelMessages(
      messages as Array<Omit<UIMessage, "id">>
    );

    const result = streamText({
      model,
      messages: modelMessages,
    });

    return result.toUIMessageStreamResponse();
  } catch (error) {
    console.error("Chat API error:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json(
      { error: errorMessage, code: "AI_SERVICE_ERROR" },
      { status: 500 }
    );
  }
}
