import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { trace } from "@opentelemetry/api";
import {
  observe,
  updateActiveObservation,
  updateActiveTrace,
} from "@langfuse/tracing";
import {
  getUser,
  getChatByPublicId,
  createChatMessage,
  createChatToolCall,
  updateChatByPublicId,
  generateChatName,
} from "@/lib/db/queries";
import { streamText, convertToModelMessages, stepCountIs } from "ai";
import type { UIMessage } from "ai";
import { createSectionTool, createSiteTool } from "@/lib/code-generation/generate-code";
import { getAIModel } from "@/lib/ai/get-ai-model";
import { shouldUseLighterModel } from "@/lib/ai/should-use-lighter-model";
import { chatSystemPrompt } from "@/prompts/chat-system-prompt";
import { captureLandingPageScreenshot } from "@/lib/screenshots/capture";
import { langfuseSpanProcessor } from "@/instrumentation";

const BUILDER_TOOLS = new Set(["create_site", "create_section"]);

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

/** Single segment of the assistant response: either text or a tool marker (in order). */
type ContentSegment =
  | { type: "text"; text: string }
  | { type: "tool"; id: number; title: string; toolName: string };

function buildOrderedAssistantContent(segments: ContentSegment[]): string {
  const parts: string[] = [];
  for (const seg of segments) {
    if (seg.type === "text") {
      const t = seg.text.trim();
      if (t) parts.push(t);
    } else {
      parts.push(
        `<tool toolName="${escapeToolAttr(seg.toolName)}" title="${escapeToolAttr(seg.title)}" id=${seg.id} />`
      );
    }
  }
  return parts.join("\n\n").trim();
}

async function processRequestQueue(chatId: string): Promise<void> {
  const queue = requestQueues.get(chatId);
  if (queue) {
    await queue;
  }
}

async function chatHandler(request: NextRequest) {
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

    const useLighterModel = await decideOnLighterModel(messages as Array<Omit<UIMessage, "id">>, {
      userId: user.id,
      chatId,
    });

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

        if (!chat.title) {
          const title = await generateChatName(userText.trim(), {
            userId: user.id,
            chatId,
          });
          await updateChatByPublicId(chatId, user.id, { title });
        }
      }
    }

    // Here we start with the chat request
    // Accumulate assistant content in true order: text, tool, text, tool, ... (per step.content)
    const contentSegments: ContentSegment[] = [];
    let stepCounter = 0;
    let lastSuccessfulRevision: {
      chatId: string;
      revisionNumber: number;
    } | null = null;

    const lastUserText =
      (lastMessage?.role === "user" && Array.isArray(lastMessage.parts)
        ? lastMessage.parts
          .filter((p: any) => p?.type === "text")
          .map((p: any) => p.text)
          .join("")
        : lastMessage?.role === "user" && typeof lastMessage.content === "string"
          ? lastMessage.content
          : "") || "";
          
    // Langfuse
    updateActiveObservation({ input: lastUserText.trim() || undefined });
    updateActiveTrace({
      name: "chat-message",
      sessionId: chatId,
      userId: String(user.id),
      input: lastUserText.trim() || undefined,
    });

    const result = streamText({
      model,
      system: chatSystemPrompt,
      messages: modelMessages,
      tools,
      stopWhen: stepCountIs(20),
      experimental_telemetry: {
        isEnabled: true,
        functionId: "chat-stream",
        metadata: {
          userId: user.id,
          chatId,
          sessionId: chatId,
        },
      },
      onStepFinish: async (step) => {
        try {
          stepCounter += 1;
          const stepNumber = stepCounter;
          const content = Array.isArray((step as any).content)
            ? ((step as any).content as Array<{ type: string; text?: string; toolCallId?: string; toolName?: string; args?: unknown; input?: unknown }>)
            : [];
          const staticResults = (step as any).staticToolResults ?? [];

          // Process step.content in order so DB message reflects "Text 1" → tool 1 → "Text 2" structure
          for (const part of content) {
            if (part?.type === "text" && typeof part.text === "string") {
              const t = part.text.trim();
              if (t) contentSegments.push({ type: "text", text: t });
            } else if (part?.type === "tool-call") {
              const toolName =
                (part as any).toolName ?? (part as any).name ?? "unknown";
              const toolCallId =
                (part as any).toolCallId ?? (part as any).id ?? null;
              const callPayload = {
                toolCallId,
                toolName,
                args: (part as any).args ?? (part as any).input,
              };
              const toolRow = await createChatToolCall({
                chatId: chat.id,
                stepNumber,
                state: "call",
                toolName,
                toolCallId,
                input: callPayload,
              });
              const destination = getDestinationFromToolCall(part as any);
              contentSegments.push({
                type: "tool",
                id: toolRow.id,
                title:
                  destination ||
                  (toolName === "create_site"
                    ? "landing/index.tsx"
                    : getToolTitle(toolName)),
                toolName,
              });
            }
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

            if (BUILDER_TOOLS.has(toolName)) {
              const output = (res as any).output ?? (res as any).result ?? res;
              if (output?.success === true && output?.revisionNumber != null) {
                lastSuccessfulRevision = {
                  chatId,
                  revisionNumber: Number(output.revisionNumber),
                };
              }
            }
          }
        } catch (e) {
          console.error("Failed to persist tool calls/results:", e);
        }
      },
      onFinish: async () => {
        const finalText = buildOrderedAssistantContent(contentSegments);
        if (finalText) {
          try {
            await createChatMessage({
              chatId: chat.id,
              role: "assistant",
              content: finalText,
            });
          } catch (e) {
            console.error("Failed to persist assistant message:", e);
          }
        }
        updateActiveObservation({ output: finalText || undefined });
        updateActiveTrace({ output: finalText || undefined });
        trace.getActiveSpan()?.end();

        if (lastSuccessfulRevision) {
          void captureLandingPageScreenshot({
            chatId: lastSuccessfulRevision.chatId,
            revisionNumber: lastSuccessfulRevision.revisionNumber,
            userId: user.id,
          });
        }
      },
      onError: async (error) => {
        const errMsg = error instanceof Error ? error.message : String(error);
        updateActiveObservation({ output: errMsg, level: "ERROR" });
        updateActiveTrace({ output: errMsg });
        trace.getActiveSpan()?.end();
      },
    });

    after(async () => langfuseSpanProcessor.forceFlush());

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

const decideOnLighterModel = async (
  messages: Array<Omit<UIMessage, "id">>,
  context?: { userId?: number; chatId?: string }
): Promise<boolean> => {
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
    useLighterModel = await shouldUseLighterModel(userQuestion.trim(), context);
  }
  return useLighterModel;
}

export const POST = observe(chatHandler, {
  name: "chat-message",
  endOnExit: false,
});