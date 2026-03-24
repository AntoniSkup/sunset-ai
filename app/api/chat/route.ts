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
  getUserById,
  getChatByPublicId,
  createChatMessage,
  createChatToolCall,
  getSiteAssetsByChatId,
  updateChatByPublicId,
  generateChatName,
  appendChatStreamEvent,
  markChatTurnRunSucceeded,
  markChatTurnRunFailed,
} from "@/lib/db/queries";
import { getOrCreateAccountForUser } from "@/lib/billing/accounts";
import { ensureDailyCreditsForAccount } from "@/lib/billing/daily-credits";
import { InsufficientCreditsError } from "@/lib/credits/debit";
import { createMessageBillingSession } from "@/lib/credits/message-billing";
import { streamText, convertToModelMessages, stepCountIs } from "ai";
import type { UIMessage } from "ai";
import { createSectionTool, createSiteTool } from "@/lib/code-generation/generate-code";
import { getAIModel, getAIModelId } from "@/lib/ai/get-ai-model";
import { shouldUseLighterModel } from "@/lib/ai/should-use-lighter-model";
import { buildChatSystemPrompt } from "@/prompts/chat-system-prompt";
import { captureLandingPageScreenshot } from "@/lib/screenshots/capture";
import { langfuseSpanProcessor } from "@/instrumentation";
import {
  extractTextFromMessageParts,
  hasDisplayableMessageParts,
  sanitizePersistedMessageParts,
} from "@/lib/chat/message-parts";
import {
  buildSiteAssetPromptContext,
  toSiteAssetPromptDescriptors,
} from "@/lib/site-assets/prompt-manifest";

const BUILDER_TOOLS = new Set(["create_site", "create_section"]);
const TEXT_DELTA_FLUSH_MS = 90;
const TEXT_DELTA_FLUSH_CHARS = 24;

const CHAT_STREAM_DEBUG_ENABLED = process.env.DEBUG_CHAT_STREAM === "1";

function debugChatStream(message: string, payload?: Record<string, unknown>) {
  if (!CHAT_STREAM_DEBUG_ENABLED) return;
  if (payload) {
    console.log(`[chat-stream-debug] ${message}`, payload);
    return;
  }
  console.log(`[chat-stream-debug] ${message}`);
}

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

async function chatHandler(request: NextRequest) {
  try {
    const body = await request.json();
    const { messages, chatId, turnRunId } = body as {
      messages?: Array<Omit<UIMessage, "id">>;
      chatId?: string;
      userId?: number;
      turnRunId?: string;
    };
    const internalSecret = request.headers.get("x-internal-job-secret");
    const isInternalJobCall =
      Boolean(process.env.INTERNAL_JOB_SECRET) &&
      internalSecret === process.env.INTERNAL_JOB_SECRET;

    const user = isInternalJobCall
      ? await getUserById(Number((body as any)?.userId))
      : await getUser();

    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized", code: "UNAUTHORIZED" },
        { status: 401 }
      );
    }

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

    const emitTurnEvent = async (
      eventType: string,
      payload: Record<string, unknown>
    ) => {
      if (!turnRunId) return;
      try {
        await appendChatStreamEvent({
          chatId: chat.id,
          runId: turnRunId,
          eventType,
          payload,
        });
      } catch (error) {
        console.error(`Failed to append ${eventType} stream event:`, error);
      }
    };
    if (turnRunId) {
      await emitTurnEvent("run_started", {
        chatId,
        turnRunId,
      });
    }
    debugChatStream("run-started", {
      chatId,
      turnRunId: turnRunId ?? null,
      userId: user.id,
      messageCount: messages.length,
      internalCall: isInternalJobCall,
    });

    const account = await getOrCreateAccountForUser(user.id);
    await ensureDailyCreditsForAccount(account.id);
    const idempotencyKey =
      typeof turnRunId === "string" && turnRunId.trim()
        ? `chat-turn-${turnRunId.trim()}`
        : `chat-${chatId}-${user.id}-${messages.length}`;
    const billingSession = createMessageBillingSession({
      accountId: account.id,
      userId: user.id,
      idempotencyKey,
    });

    try {
      await billingSession.ensureChargedForAction("chat_message");
    } catch (err) {
      if (err instanceof InsufficientCreditsError) {
        return NextResponse.json(
          {
            error:
              "Insufficient credits. Please upgrade your plan or buy more credits.",
            code: "INSUFFICIENT_CREDITS",
          },
          { status: 402 }
        );
      }
      throw err;
    }

    const modelMessages = await convertToModelMessages(
      messages as Array<Omit<UIMessage, "id">>
    );

    const useLighterModel = await decideOnLighterModel(messages as Array<Omit<UIMessage, "id">>, {
      userId: user.id,
      chatId,
    });

    const [model, modelId] = await Promise.all([
      getAIModel(useLighterModel),
      getAIModelId(useLighterModel),
    ]);
    const promptableSiteAssets = toSiteAssetPromptDescriptors(
      await getSiteAssetsByChatId(chatId, user.id)
    );
    const systemPrompt = buildChatSystemPrompt({
      siteAssetContext: buildSiteAssetPromptContext(promptableSiteAssets),
    });

    const createSiteToolCall = createSiteTool(
      chatId,
      billingSession.ensureChargedForAction
    );
    const createSectionToolCall = createSectionTool(
      chatId,
      billingSession.ensureChargedForAction
    );

    const tools = {
      create_site: createSiteToolCall,
      create_section: createSectionToolCall,
    };

    const lastMessage = messages[messages.length - 1] as any;
    if (!isInternalJobCall && lastMessage?.role === "user" && Array.isArray(lastMessage.parts)) {
      const persistedParts = sanitizePersistedMessageParts(lastMessage.parts);
      const userText = extractTextFromMessageParts(persistedParts);
      if (hasDisplayableMessageParts(persistedParts)) {
        await createChatMessage({
          chatId: chat.id,
          role: "user",
          content: userText.trim(),
          parts: persistedParts,
        });

        if (!chat.title && userText.trim()) {
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
    let liveTextBuffer = "";
    let liveTextFlushTimer: ReturnType<typeof setTimeout> | null = null;
    let emittedAssistantChars = 0;
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
    updateActiveObservation({ input: lastUserText.trim() || undefined, metadata: { model: modelId } });
    updateActiveTrace({
      name: "chat-message",
      sessionId: chatId,
      userId: String(user.id),
      input: lastUserText.trim() || undefined,
      metadata: { model: modelId },
    });

    const flushLiveTextDelta = async () => {
      if (!liveTextBuffer) return;
      const chunk = liveTextBuffer;
      liveTextBuffer = "";
      emittedAssistantChars += chunk.length;
      debugChatStream("emit-text-delta", {
        chatId,
        turnRunId: turnRunId ?? null,
        chunkLength: chunk.length,
        emittedAssistantChars,
        chunkPreview: chunk.slice(0, 120),
      });
      await emitTurnEvent("text_delta", { text: chunk });
    };

    const queueLiveTextFlush = () => {
      if (liveTextFlushTimer) return;
      liveTextFlushTimer = setTimeout(() => {
        liveTextFlushTimer = null;
        void flushLiveTextDelta();
      }, TEXT_DELTA_FLUSH_MS);
    };

    const result = streamText({
      model,
      system: systemPrompt,
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
      onChunk: async (chunkEvent: unknown) => {
        try {
          const evt = chunkEvent as any;
          const eventType =
            typeof evt?.type === "string"
              ? evt.type
              : typeof evt?.chunk?.type === "string"
              ? evt.chunk.type
              : "unknown";
          const textDelta =
            (typeof evt?.textDelta === "string" ? evt.textDelta : null) ??
            (typeof evt?.delta === "string" ? evt.delta : null) ??
            (typeof evt?.text === "string" ? evt.text : null) ??
            (typeof evt?.chunk?.textDelta === "string"
              ? evt.chunk.textDelta
              : null) ??
            (typeof evt?.chunk?.delta === "string" ? evt.chunk.delta : null) ??
            (typeof evt?.chunk?.text === "string" ? evt.chunk.text : null) ??
            null;

          if (!textDelta) {
            debugChatStream("chunk-without-text-delta", {
              chatId,
              turnRunId: turnRunId ?? null,
              eventType,
              evtKeys: evt && typeof evt === "object" ? Object.keys(evt).slice(0, 12) : [],
              chunkKeys:
                evt?.chunk && typeof evt.chunk === "object"
                  ? Object.keys(evt.chunk).slice(0, 12)
                  : [],
            });
            return;
          }
          debugChatStream("chunk-text-delta", {
            chatId,
            turnRunId: turnRunId ?? null,
            eventType,
            deltaLength: textDelta.length,
            deltaPreview: textDelta.slice(0, 120),
          });
          liveTextBuffer += textDelta;

          if (liveTextBuffer.length >= TEXT_DELTA_FLUSH_CHARS) {
            if (liveTextFlushTimer) {
              clearTimeout(liveTextFlushTimer);
              liveTextFlushTimer = null;
            }
            await flushLiveTextDelta();
          } else {
            queueLiveTextFlush();
          }
        } catch (e) {
          console.error("Failed to process chunk delta:", e);
        }
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
          const stepTextParts: string[] = [];
          for (const part of content) {
            if (part?.type === "text" && typeof part.text === "string") {
              const t = part.text.trim();
              if (t) {
                contentSegments.push({ type: "text", text: t });
                stepTextParts.push(t);
              }
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
              await emitTurnEvent("tool_call", {
                toolCallId,
                toolName,
                stepNumber,
                destination,
              });
            }
          }
          debugChatStream("step-finish-summary", {
            chatId,
            turnRunId: turnRunId ?? null,
            stepNumber,
            stepTextPartsCount: stepTextParts.length,
            stepTextTotalLength: stepTextParts.reduce((sum, t) => sum + t.length, 0),
            contentPartsCount: content.length,
            staticResultsCount: staticResults.length,
          });

          // Fallback for providers/paths where onChunk doesn't emit text deltas:
          // emit only the assistant suffix that wasn't emitted yet.
          if (stepTextParts.length > 0) {
            if (liveTextFlushTimer) {
              clearTimeout(liveTextFlushTimer);
              liveTextFlushTimer = null;
            }
            await flushLiveTextDelta();

            const aggregated = contentSegments
              .filter(
                (segment): segment is Extract<ContentSegment, { type: "text" }> =>
                  segment.type === "text"
              )
              .map((segment) => segment.text)
              .join("");

            if (aggregated.length > emittedAssistantChars) {
              const fallbackDelta = aggregated.slice(emittedAssistantChars);
              if (fallbackDelta) {
                emittedAssistantChars += fallbackDelta.length;
                debugChatStream("fallback-step-delta", {
                  chatId,
                  turnRunId: turnRunId ?? null,
                  stepNumber,
                  fallbackLength: fallbackDelta.length,
                  emittedAssistantChars,
                  fallbackPreview: fallbackDelta.slice(0, 120),
                });
                await emitTurnEvent("text_delta", { text: fallbackDelta });
              }
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
            await emitTurnEvent("tool_result", {
              toolCallId,
              toolName,
              stepNumber,
              result: res,
            });

            if (BUILDER_TOOLS.has(toolName)) {
              const output = (res as any).output ?? (res as any).result ?? res;
              if (output?.success === true && output?.revisionNumber != null) {
                lastSuccessfulRevision = {
                  chatId,
                  revisionNumber: Number(output.revisionNumber),
                };
                await emitTurnEvent("preview_update", {
                  chatId,
                  revisionNumber: Number(output.revisionNumber),
                  revisionId: Number(output.revisionId ?? output.versionId ?? 0),
                });
              }
            }
          }
        } catch (e) {
          console.error("Failed to persist tool calls/results:", e);
        }
      },
      onFinish: async () => {
        if (liveTextFlushTimer) {
          clearTimeout(liveTextFlushTimer);
          liveTextFlushTimer = null;
        }
        await flushLiveTextDelta();

        const finalText = buildOrderedAssistantContent(contentSegments);
        debugChatStream("run-finish", {
          chatId,
          turnRunId: turnRunId ?? null,
          contentSegments: contentSegments.length,
          finalTextLength: finalText.length,
          emittedAssistantChars,
          finalTextPreview: finalText.slice(0, 160),
        });
        if (finalText) {
          try {
            await createChatMessage({
              chatId: chat.id,
              role: "assistant",
              content: finalText,
              parts: [{ type: "text", text: finalText }],
            });
          } catch (e) {
            console.error("Failed to persist assistant message:", e);
          }
        }
        await billingSession.markSucceeded();
        if (turnRunId) {
          await markChatTurnRunSucceeded(turnRunId);
          await emitTurnEvent("run_completed", {
            chatId,
            turnRunId,
            hasAssistantText: Boolean(finalText),
          });
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
        if (liveTextFlushTimer) {
          clearTimeout(liveTextFlushTimer);
          liveTextFlushTimer = null;
        }
        await flushLiveTextDelta();

        const errMsg = error instanceof Error ? error.message : String(error);
        debugChatStream("run-error", {
          chatId,
          turnRunId: turnRunId ?? null,
          error: errMsg,
        });
        await billingSession.markFailed(errMsg);
        if (turnRunId) {
          await markChatTurnRunFailed({
            runId: turnRunId,
            errorMessage: errMsg,
          });
          await emitTurnEvent("run_failed", {
            chatId,
            turnRunId,
            error: errMsg,
          });
        }
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
  if (Array.isArray(lastMessage?.parts)) {
    const hasFileParts = lastMessage.parts.some((p: any) => p?.type === "file");
    if (hasFileParts) {
      return false;
    }
  }

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