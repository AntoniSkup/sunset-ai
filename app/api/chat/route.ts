import { NextRequest, NextResponse } from "next/server";
import { getUser, getChatByPublicId } from "@/lib/db/queries";
import { streamText, convertToModelMessages } from "ai";
import type { UIMessage } from "ai";
import { createGenerateLandingPageCodeToolWithChatId } from "@/lib/code-generation/generate-code";
import { getAIModel } from "@/lib/ai/get-ai-model";
import { chatSystemPrompt } from "@/prompts/chat-system-prompt";

const requestQueues = new Map<string, Promise<void>>();

async function processRequestQueue(chatId: string): Promise<void> {
  const queue = requestQueues.get(chatId);
  if (queue) {
    await queue;
  }
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
    const { messages, chatId } = body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(
        { error: "Invalid messages", code: "INVALID_MESSAGE" },
        { status: 400 }
      );
    }

    if (!chatId || typeof chatId !== "string") {
      return NextResponse.json(
        { error: "Chat ID is required", code: "CHAT_ID_REQUIRED" },
        { status: 400 }
      );
    }

    const chat = await getChatByPublicId(chatId, user.id);
    if (!chat) {
      return NextResponse.json(
        { error: "Chat not found", code: "CHAT_NOT_FOUND" },
        { status: 404 }
      );
    }

    const model = await getAIModel();

    const modelMessages = await convertToModelMessages(
      messages as Array<Omit<UIMessage, "id">>
    );

    const generateLandingPageCodeToolWithChatId =
      createGenerateLandingPageCodeToolWithChatId(chatId);

    const tools = {
      generate_landing_page_code: generateLandingPageCodeToolWithChatId,
    };

    const result = streamText({
      model,
      system: chatSystemPrompt,
      messages: modelMessages,
      tools,
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
