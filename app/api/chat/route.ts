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
  getChatMessagesByPublicId,
  createChatMessage,
  createChatToolCall,
  getSiteAssetsByChatId,
  updateChatByPublicId,
  generateChatName,
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
import { publishStreamEvents } from "@/lib/chat/stream-bus";

const BUILDER_TOOLS = new Set(["create_site", "create_section"]);
const TEXT_DELTA_FLUSH_MS = 40;
const TEXT_DELTA_FLUSH_CHARS = 10;
const TURN_EVENT_FLUSH_MS = 120;
const TURN_EVENT_BATCH_SIZE = 24;

const CHAT_STREAM_DEBUG_ENABLED = process.env.DEBUG_CHAT_STREAM === "1";
const STREAM_DIAGNOSTICS_ENABLED =
  process.env.DEBUG_STREAM_DIAGNOSTICS === "1";

function debugChatStream(message: string, payload?: Record<string, unknown>) {
  if (!CHAT_STREAM_DEBUG_ENABLED) return;
  if (payload) {
    console.log(`[chat-stream-debug] ${message}`, payload);
    return;
  }
  console.log(`[chat-stream-debug] ${message}`);
}

function debugStreamDiagnostics(
  message: string,
  payload?: Record<string, unknown>
) {
  if (!STREAM_DIAGNOSTICS_ENABLED) return;
  if (payload) {
    console.log(`[stream-diag] ${message}`, payload);
    return;
  }
  console.log(`[stream-diag] ${message}`);
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
  const normalize = (value: unknown): string | null => {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    return trimmed || null;
  };

  const fromObject = (obj: unknown): string | null => {
    if (!obj || typeof obj !== "object") return null;
    return normalize((obj as Record<string, unknown>).destination);
  };

  const fromMaybeJson = (value: unknown): string | null => {
    const direct = fromObject(value);
    if (direct) return direct;
    if (typeof value !== "string") return null;
    try {
      return fromObject(JSON.parse(value));
    } catch {
      return null;
    }
  };

  return (
    fromMaybeJson(c?.input) ??
    fromMaybeJson(c?.args) ??
    fromMaybeJson(c?.arguments) ??
    fromMaybeJson(c?.parameters) ??
    fromMaybeJson(c?.chunk?.input) ??
    fromMaybeJson(c?.chunk?.args) ??
    fromMaybeJson(c?.chunk?.arguments) ??
    fromMaybeJson(c?.chunk?.parameters) ??
    null
  );
}

function escapeToolAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function normalizeChunkEventType(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "unknown";
}

function isNonAssistantOrToolChunkType(eventType: string): boolean {
  const t = normalizeChunkEventType(eventType);
  return (
    t.includes("tool") ||
    t.includes("input-json") ||
    t.includes("arguments") ||
    t.includes("reasoning") ||
    t.includes("metadata")
  );
}

function isToolCallLikeChunkType(eventType: string): boolean {
  const t = normalizeChunkEventType(eventType);
  return (
    t.includes("tool-call") ||
    t.includes("tool_call") ||
    t.includes("tool-input") ||
    t.includes("tool_input")
  );
}

function getToolCallIdFromChunkEvent(evt: any): string | null {
  const id =
    evt?.toolCallId ??
    evt?.tool_call_id ??
    evt?.chunk?.toolCallId ??
    evt?.chunk?.tool_call_id ??
    null;
  if (typeof id !== "string") return null;
  const trimmed = id.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function getToolNameFromChunkEvent(evt: any): string | null {
  const name =
    evt?.toolName ??
    evt?.tool_name ??
    evt?.name ??
    evt?.chunk?.toolName ??
    evt?.chunk?.tool_name ??
    evt?.chunk?.name ??
    null;
  if (typeof name !== "string") return null;
  const trimmed = name.trim();
  return trimmed.length > 0 ? trimmed : null;
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
    const requestStartedAtMs = Date.now();
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

    const pendingTurnEvents: Array<{
      eventType: string;
      payload: Record<string, unknown>;
    }> = [];
    let turnEventsFlushTimer: ReturnType<typeof setTimeout> | null = null;
    let turnEventsFlushChain: Promise<void> = Promise.resolve();
    let emittedTurnEventsCount = 0;
    let publishedTurnEventsCount = 0;
    let flushAttemptsCount = 0;

    const flushPendingTurnEvents = async () => {
      if (!turnRunId || pendingTurnEvents.length === 0) return;
      flushAttemptsCount += 1;
      const queuedBeforeFlush = pendingTurnEvents.length;

      while (pendingTurnEvents.length > 0) {
        const events = pendingTurnEvents.splice(0, TURN_EVENT_BATCH_SIZE);
        try {
          const published = await publishStreamEvents({
            chatId: chat.id,
            runId: turnRunId,
            events,
          });
          publishedTurnEventsCount += published.length;
          debugStreamDiagnostics("publish-batch-ok", {
            chatId,
            turnRunId,
            batchSize: events.length,
            publishedCount: published.length,
            firstLogicalEventId: published[0]?.logicalEventId ?? null,
            lastLogicalEventId:
              published[published.length - 1]?.logicalEventId ?? null,
            queuedRemaining: pendingTurnEvents.length,
          });
        } catch (error) {
          console.error("Failed to append stream event batch:", error);
          debugStreamDiagnostics("publish-batch-failed", {
            chatId,
            turnRunId,
            batchSize: events.length,
            queuedRemaining: pendingTurnEvents.length,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
      debugStreamDiagnostics("flush-complete", {
        chatId,
        turnRunId,
        queuedBeforeFlush,
        emittedTurnEventsCount,
        publishedTurnEventsCount,
        flushAttemptsCount,
      });
    };

    const queueTurnEventFlush = () => {
      turnEventsFlushChain = turnEventsFlushChain
        .then(async () => {
          await flushPendingTurnEvents();
        })
        .catch((error) => {
          console.error("Failed to flush queued stream events:", error);
        });
      return turnEventsFlushChain;
    };

    const flushTurnEventsNow = async () => {
      if (turnEventsFlushTimer) {
        clearTimeout(turnEventsFlushTimer);
        turnEventsFlushTimer = null;
      }
      await queueTurnEventFlush();
    };

    const emitTurnEvent = async (
      eventType: string,
      payload: Record<string, unknown>,
      options?: { urgent?: boolean }
    ) => {
      if (!turnRunId) return;

      pendingTurnEvents.push({ eventType, payload });
      emittedTurnEventsCount += 1;
      debugStreamDiagnostics("event-enqueued", {
        chatId,
        turnRunId,
        eventType,
        urgent: Boolean(options?.urgent),
        queueDepth: pendingTurnEvents.length,
        emittedTurnEventsCount,
      });

      if (options?.urgent || pendingTurnEvents.length >= TURN_EVENT_BATCH_SIZE) {
        await flushTurnEventsNow();
        return;
      }

      if (!turnEventsFlushTimer) {
        turnEventsFlushTimer = setTimeout(() => {
          turnEventsFlushTimer = null;
          void queueTurnEventFlush();
        }, TURN_EVENT_FLUSH_MS);
      }
    };
    if (turnRunId) {
      await emitTurnEvent("run_started", {
        chatId,
        turnRunId,
      }, { urgent: true });
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

    const lastIncomingMessage = messages[messages.length - 1] as any;
    if (
      !isInternalJobCall &&
      lastIncomingMessage?.role === "user" &&
      Array.isArray(lastIncomingMessage.parts)
    ) {
      const persistedParts = sanitizePersistedMessageParts(lastIncomingMessage.parts);
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

    const persistedContext = await getChatMessagesByPublicId(chatId, user.id);
    const contextMessages: Array<Omit<UIMessage, "id">> =
      persistedContext?.messages?.length
        ? persistedContext.messages.map((m) => {
            const parts = sanitizePersistedMessageParts(m.parts);
            return {
              role: m.role as UIMessage["role"],
              parts: parts.length > 0 ? parts : [{ type: "text", text: m.content ?? "" }],
            };
          })
        : (messages as Array<Omit<UIMessage, "id">>);

    const modelMessages = await convertToModelMessages(contextMessages);

    const [model, modelId] = await Promise.all([
      getAIModel(),
      getAIModelId(),
    ]);
    console.log(`[chat-model] model=${modelId}`);
    const promptableSiteAssets = toSiteAssetPromptDescriptors(
      await getSiteAssetsByChatId(chatId, user.id)
    );
    const systemPrompt = buildChatSystemPrompt({
      siteAssetContext: buildSiteAssetPromptContext(promptableSiteAssets),
    });

    const createSiteToolCall = createSiteTool(
      chatId,
      user.id,
      billingSession.ensureChargedForAction
    );
    const createSectionToolCall = createSectionTool(
      chatId,
      user.id,
      billingSession.ensureChargedForAction
    );

    const tools = {
      create_site: createSiteToolCall,
      create_section: createSectionToolCall,
    };

    const lastMessage = contextMessages[contextMessages.length - 1] as any;

    // Here we start with the chat request
    // Accumulate assistant content in true order: text, tool, text, tool, ... (per step.content)
    const contentSegments: ContentSegment[] = [];
    let liveTextBuffer = "";
    let liveTextFlushTimer: ReturnType<typeof setTimeout> | null = null;
    let emittedAssistantChars = 0;
    let stepCounter = 0;
    const emittedToolCallMeta = new Map<string, { hasDestination: boolean }>();
    let lastSuccessfulRevision: {
      chatId: string;
      revisionNumber: number;
      revisionId: number;
    } | null = null;
    const generationStartedAtMs = Date.now();
    let finalTimingsLogged = false;
    const logFinalTimings = (status: "completed" | "failed", errorMessage?: string) => {
      if (finalTimingsLogged) return;
      finalTimingsLogged = true;
      const nowMs = Date.now();
      const generationSeconds = ((nowMs - generationStartedAtMs) / 1000).toFixed(2);
      const totalSeconds = ((nowMs - requestStartedAtMs) / 1000).toFixed(2);
      const errorSuffix = errorMessage ? ` error="${errorMessage.replace(/\s+/g, " ").slice(0, 200)}"` : "";
      console.log(
        `[chat-timing] status=${status} generation_s=${generationSeconds} total_s=${totalSeconds}${errorSuffix}`
      );
    };

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
    updateActiveObservation({
      input: lastUserText.trim() || undefined,
      metadata: {
        model: modelId,
      },
    });
    updateActiveTrace({
      name: "chat-message",
      sessionId: chatId,
      userId: String(user.id),
      input: lastUserText.trim() || undefined,
      metadata: {
        model: modelId,
      },
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
          const rawEventType =
            typeof evt?.type === "string"
              ? evt.type
              : typeof evt?.chunk?.type === "string"
              ? evt.chunk.type
              : "unknown";
          const eventType = normalizeChunkEventType(rawEventType);

          if (isToolCallLikeChunkType(eventType)) {
            if (liveTextFlushTimer) {
              clearTimeout(liveTextFlushTimer);
              liveTextFlushTimer = null;
            }
            await flushLiveTextDelta();

            const toolCallId = getToolCallIdFromChunkEvent(evt);
            const toolName = getToolNameFromChunkEvent(evt) ?? "unknown";
            const destination = getDestinationFromToolCall(evt);
            if (toolCallId && !emittedToolCallMeta.has(toolCallId)) {
              emittedToolCallMeta.set(toolCallId, {
                hasDestination: Boolean(destination),
              });
              await emitTurnEvent("tool_call", {
                toolCallId,
                toolName,
                destination,
              });
              debugChatStream("tool-call-emitted-from-chunk", {
                chatId,
                turnRunId: turnRunId ?? null,
                eventType,
                toolCallId,
                toolName,
                destination,
              });
            }
          }

          // Prevent tool payload JSON (args/input) from leaking into assistant text stream.
          if (isNonAssistantOrToolChunkType(eventType)) {
            debugChatStream("chunk-skipped-non-assistant-text", {
              chatId,
              turnRunId: turnRunId ?? null,
              eventType,
            });
            return;
          }
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
              const existingMeta =
                toolCallId ? emittedToolCallMeta.get(toolCallId) : undefined;
              const shouldEmitToolCall =
                !toolCallId ||
                !existingMeta ||
                (!existingMeta.hasDestination && Boolean(destination));
              if (toolCallId && shouldEmitToolCall) {
                emittedToolCallMeta.set(toolCallId, {
                  hasDestination:
                    Boolean(destination) || Boolean(existingMeta?.hasDestination),
                });
                await emitTurnEvent("tool_call", {
                  toolCallId,
                  toolName,
                  stepNumber,
                  destination,
                });
              }
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
                  revisionId: Number(output.revisionId ?? output.versionId ?? 0),
                };
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
        if (lastSuccessfulRevision) {
          await emitTurnEvent("preview_update", {
            chatId: lastSuccessfulRevision.chatId,
            revisionNumber: lastSuccessfulRevision.revisionNumber,
            revisionId: lastSuccessfulRevision.revisionId,
          });
        }
        await billingSession.markSucceeded();
        if (turnRunId) {
          await markChatTurnRunSucceeded(turnRunId);
          await emitTurnEvent("run_completed", {
            chatId,
            turnRunId,
            hasAssistantText: Boolean(finalText),
          }, { urgent: true });
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
        debugStreamDiagnostics("run-finished", {
          chatId,
          turnRunId: turnRunId ?? null,
          emittedTurnEventsCount,
          publishedTurnEventsCount,
          flushAttemptsCount,
          finalTextLength: finalText.length,
        });
        logFinalTimings("completed");
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
          }, { urgent: true });
        }
        updateActiveObservation({ output: errMsg, level: "ERROR" });
        updateActiveTrace({ output: errMsg });
        trace.getActiveSpan()?.end();
        debugStreamDiagnostics("run-failed", {
          chatId,
          turnRunId: turnRunId ?? null,
          emittedTurnEventsCount,
          publishedTurnEventsCount,
          flushAttemptsCount,
          error: errMsg,
        });
        logFinalTimings("failed", errMsg);
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

export const POST = observe(chatHandler, {
  name: "chat-message",
  endOnExit: false,
});