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
import {
  streamText,
  convertToModelMessages,
  stepCountIs,
  generateId,
} from "ai";
import type { UIMessage } from "ai";
import { createSectionTool, createSiteTool } from "@/lib/code-generation/generate-code";
import { getAIModel } from "@/lib/ai/get-ai-model";
import { shouldUseLighterModel } from "@/lib/ai/should-use-lighter-model";
import { chatSystemPrompt } from "@/prompts/chat-system-prompt";
import { captureLandingPageScreenshot } from "@/lib/screenshots/capture";
import { langfuseSpanProcessor } from "@/instrumentation";
import { createResumableStreamContext } from "resumable-stream";
import {
  clearActiveStreamId,
  trySetActiveStreamId,
  setActiveStreamId,
} from "@/lib/streams/active-stream";

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

    const streamId = generateId();
    const acquired = await trySetActiveStreamId(chatId, streamId);
    if (!acquired) {
      return NextResponse.json(
        { error: "Stream already active", code: "STREAM_ACTIVE" },
        { status: 409 }
      );
    }

    const modelMessages = await convertToModelMessages(
      messages as Array<Omit<UIMessage, "id">>
    );

    const useLighterModel = await decideOnLighterModel(messages as Array<Omit<UIMessage, "id">>, {
      userId: user.id,
      chatId,
    });
    console.log("useLighterModel", useLighterModel);
    const model = await getAIModel(useLighterModel);

    const createSiteToolCall = createSiteTool(chatId, user.id);
    const createSectionToolCall = createSectionTool(chatId, user.id);

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

    let lastSuccessfulRevision: {
      chatId: string;
      revisionNumber: number;
    } | null = null;
    const persistedToolKeys = new Set<string>();

    const lastUserText =
      (lastMessage?.role === "user" && Array.isArray(lastMessage.parts)
        ? lastMessage.parts
          .filter((p: any) => p?.type === "text")
          .map((p: any) => p.text)
          .join("")
        : lastMessage?.role === "user" && typeof lastMessage.content === "string"
          ? lastMessage.content
          : "") || "";
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
            if (toolCallId) {
              persistedToolKeys.add(`call:${toolCallId}`);
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
            if (toolCallId) {
              persistedToolKeys.add(`result:${toolCallId}`);
            }

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
      onFinish: async ({ text }) => {
        const finalText = text?.trim() ?? "";
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

    return result.toUIMessageStreamResponse({
      async consumeSseStream({ stream }) {
        const streamContext = createResumableStreamContext({ waitUntil: after });

        // Persist the outgoing UI message stream in Redis so the client can
        // reconnect after a refresh and continue streaming.
        await streamContext.createNewResumableStream(streamId, () => stream);
        // ensure TTL refreshed even if lock existed long:
        await setActiveStreamId(chatId, streamId);
      },
      onFinish: async ({ responseMessage }) => {
        // Persist tool call/result parts from the UI message stream.
        // This is more reliable than onStepFinish staticToolCalls/staticToolResults
        // (which can be empty depending on AI SDK/tool execution mode).
        try {
          for (const part of (responseMessage as any)?.parts ?? []) {
            const type = String(part?.type ?? "");

            // Legacy tool parts
            if (type === "tool-call") {
              const toolCallId = String(part?.toolCallId || "");
              const toolName = String(part?.toolName || "");
              if (!toolCallId || !toolName) continue;
              const key = `call:${toolCallId}`;
              if (persistedToolKeys.has(key)) continue;
              persistedToolKeys.add(key);
              await createChatToolCall({
                chatId: chat.id,
                state: "call",
                toolName,
                toolCallId,
                input: part,
              });
              continue;
            }

            if (type === "tool-result") {
              const toolCallId = String(part?.toolCallId || "");
              const toolName = String(part?.toolName || "");
              if (!toolCallId || !toolName) continue;
              const key = `result:${toolCallId}`;
              if (persistedToolKeys.has(key)) continue;
              persistedToolKeys.add(key);
              await createChatToolCall({
                chatId: chat.id,
                state: "result",
                toolName,
                toolCallId,
                output: part,
              });
              continue;
            }

            // AI SDK v5 tool UI parts: `tool-${name}` with state/input/output
            if (type.startsWith("tool-")) {
              const toolName = type.replace("tool-", "");
              const toolCallId = String(part?.toolCallId || "");
              if (!toolCallId || !toolName) continue;

              const hasOutput = part?.output != null || part?.result != null;
              const callKey = `call:${toolCallId}`;
              const resultKey = `result:${toolCallId}`;

              if (!persistedToolKeys.has(callKey)) {
                persistedToolKeys.add(callKey);
                await createChatToolCall({
                  chatId: chat.id,
                  state: "call",
                  toolName,
                  toolCallId,
                  input: part,
                });
              }

              if (hasOutput && !persistedToolKeys.has(resultKey)) {
                persistedToolKeys.add(resultKey);
                await createChatToolCall({
                  chatId: chat.id,
                  state: "result",
                  toolName,
                  toolCallId,
                  output: part,
                });
              }
            }
          }
        } catch (e) {
          console.error("Failed to persist tool parts from UI stream:", e);
        } finally {
          // Clear the active stream mapping when the stream is finished.
          try {
            await clearActiveStreamId(chatId, streamId);
          } catch (e) {
            console.error("Failed to clear active stream id:", e);
          }
        }
      },
    });
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