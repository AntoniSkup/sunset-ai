import { NextRequest, NextResponse } from "next/server";
import {
  getUser,
  getChatByPublicId,
  createChatMessage,
  createChatToolCall,
} from "@/lib/db/queries";
import { streamText, convertToModelMessages, stepCountIs } from "ai";
import type { UIMessage } from "ai";
import { createSectionTool, createSiteTool } from "@/lib/code-generation/generate-code";
import { getAIModel } from "@/lib/ai/get-ai-model";
import { shouldUseLighterModel } from "@/lib/ai/should-use-lighter-model";
import { chatSystemPrompt } from "@/prompts/chat-system-prompt";

const requestQueues = new Map<string, Promise<void>>();

function getToolTitle(toolName: string): string {
  if (toolName === "create_site") {
    return "Site layout";
  }
  if (toolName === "create_section") {
    return "Section layout";
  }
  return toolName || "tool";
}

function getDestinationFromToolCall(call: unknown): string | null {
  const c = call as any;
  const dest =
    c?.args?.destination ??
    c?.input?.destination ??
    c?.arguments?.destination ??
    c?.parameters?.destination;
  if (typeof dest !== "string") return null;
  const trimmed = dest.trim();
  return trimmed ? trimmed : null;
}

function escapeToolAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function buildToolMarkerLines(
  markers: Array<{ id: number; title: string; toolName: string }>
): string {
  return markers
    .map(
      (m) =>
        `<tool toolName="${escapeToolAttr(m.toolName)}" title="${escapeToolAttr(
          m.title
        )}" id=${m.id} />`
    )
    .join("\n");
}

function injectToolMarkersIntoAssistantText(
  text: string,
  markers: Array<{ id: number; title: string; toolName: string }>
): string {
  if (!markers.length) return text;
  const markerBlock = buildToolMarkerLines(markers);

  const candidates = [
    /(^Let me build this for you:\s*$)/im,
    /(^Let me build this now:\s*$)/im,
    /(^Let me build.*:\s*$)/im,
  ];

  for (const re of candidates) {
    const match = text.match(re);
    if (match && typeof match.index === "number") {
      const insertPos = match.index + match[0].length;
      return (
        text.slice(0, insertPos).trimEnd() +
        "\n\n" +
        markerBlock +
        "\n\n" +
        text.slice(insertPos).trimStart()
      ).trim();
    }
  }

  return `${text.trim()}\n\n${markerBlock}`.trim();
}

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

    const modelMessages = await convertToModelMessages(
      messages as Array<Omit<UIMessage, "id">>
    );

    const useLighterModel = await decideOnLighterModel(messages as Array<Omit<UIMessage, "id">>);
    console.log("useLighterModel", useLighterModel);
    const model = await getAIModel(useLighterModel);

    const createSiteToolCall = createSiteTool(chatId);
    const createSectionToolCall = createSectionTool(chatId);

    const tools = {
      create_site: createSiteToolCall,
      create_section: createSectionToolCall,
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

    const toolMarkers: Array<{ id: number; title: string; toolName: string }> =
      [];

    const result = streamText({
      model,
      system: chatSystemPrompt,
      messages: modelMessages,
      tools,
      stopWhen: stepCountIs(20),
      onStepFinish: async (step) => {
        try {
          const stepNumber = (step as any).step ?? null;
          const staticCalls = (step as any).staticToolCalls ?? [];
          const staticResults = (step as any).staticToolResults ?? [];

          for (const call of staticCalls) {
            const toolName =
              (call as any).toolName ?? (call as any).name ?? "unknown";
            const toolCallId = (call as any).toolCallId ?? (call as any).id ?? null;
            const toolRow = await createChatToolCall({
              chatId: chat.id,
              stepNumber,
              state: "call",
              toolName,
              toolCallId,
              input: call,
            });
            const destination = getDestinationFromToolCall(call);
            toolMarkers.push({
              id: toolRow.id,
              title:
                destination ||
                (toolName === "create_site" ? "landing/index.html" : getToolTitle(toolName)),
              toolName,
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
            const finalText = injectToolMarkersIntoAssistantText(
              text.trim(),
              toolMarkers
            );
            await createChatMessage({
              chatId: chat.id,
              role: "assistant",
              content: finalText,
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

const decideOnLighterModel = async (messages: Array<Omit<UIMessage, "id">>): Promise<boolean> => {
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return false;
  }

  const hasAssistantMessages = messages.some(
    (msg: any) => msg?.role === "assistant"
  );

  const lastMessage = messages[messages.length - 1] as any;
  let userQuestion = "";
  if (lastMessage?.role === "user" && Array.isArray(lastMessage.parts)) {
    userQuestion = lastMessage.parts
      .filter((p: any) => p?.type === "text")
      .map((p: any) => p.text)
      .join("");
  } else if (lastMessage?.role === "user" && typeof lastMessage.content === "string") {
    userQuestion = lastMessage.content;
  }

  let useLighterModel = false;
  if (hasAssistantMessages && userQuestion.trim()) {
    useLighterModel = await shouldUseLighterModel(userQuestion.trim());
  }
  return useLighterModel;
}