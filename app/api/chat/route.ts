import { NextRequest, NextResponse } from "next/server";
import {
  getUser,
  getChatByPublicId,
  createChatMessage,
  createChatToolCall,
} from "@/lib/db/queries";
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

    const lastMessage = messages[messages.length - 1] as any;
    if (lastMessage?.role === "user" && Array.isArray(lastMessage.parts)) {
      const userText = lastMessage.parts
        .filter((p: any) => p?.type === "text")
        .map((p: any) => p.text)
        .join("");
      if (userText && typeof userText === "string" && userText.trim()) {
        await createChatMessage({
          chatId: chat.id,
          role: "user",
          content: userText.trim(),
        });
      }
    }

    const result = streamText({
      model,
      system: chatSystemPrompt,
      messages: modelMessages,
      tools,
      onStepFinish: async (step) => {
        try {
          const stepNumber = (step as any).step ?? null;
          const staticCalls = (step as any).staticToolCalls ?? [];
          const staticResults = (step as any).staticToolResults ?? [];

          for (const call of staticCalls) {
            const toolName =
              (call as any).toolName ?? (call as any).name ?? "unknown";
            const toolCallId = (call as any).toolCallId ?? (call as any).id ?? null;
            await createChatToolCall({
              chatId: chat.id,
              stepNumber,
              state: "call",
              toolName,
              toolCallId,
              input: call,
            });
          }

          for (const res of staticResults) {
            const toolName =
              (res as any).toolName ?? (res as any).name ?? "unknown";
            const toolCallId = (res as any).toolCallId ?? (res as any).id ?? null;
            await createChatToolCall({
              chatId: chat.id,
              stepNumber,
              state: "result",
              toolName,
              toolCallId,
              output: res,
            });
          }
        } catch (e) {
          console.error("Failed to persist tool calls/results:", e);
        }
      },
      onFinish: async ({ text }) => {
        if (text && text.trim()) {
          try {
            await createChatMessage({
              chatId: chat.id,
              role: "assistant",
              content: text.trim(),
            });
          } catch (e) {
            console.error("Failed to persist assistant message:", e);
          }
        }
      },
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
