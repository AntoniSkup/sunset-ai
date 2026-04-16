import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { trace } from "@opentelemetry/api";
import {
  startActiveObservation,
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
import type { SystemModelMessage, UIMessage } from "ai";
import {
  createSectionTool,
  createResolveImageSlotsTool,
  createSiteTool,
  createValidateCompletenessTool,
} from "@/lib/code-generation/generate-code";
import {
  getAIModel,
  getAIModelId,
  isAnthropicChatPromptCachingEnabled,
} from "@/lib/ai/get-ai-model";
import {
  buildChatSystemPrompt,
  buildChatSystemPromptParts,
} from "@/prompts/chat-system-prompt";
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

const BUILDER_TOOLS = new Set([
  "create_site",
  "create_section",
  "resolve_image_slots",
  "validate_completeness",
]);
const TEXT_DELTA_FLUSH_MS = 30;
const TEXT_DELTA_FLUSH_CHARS = 8;
const TURN_EVENT_FLUSH_MS = 60;
const TURN_EVENT_BATCH_SIZE = 24;

function normalizeErrorMessage(
  value: unknown,
  fallback = "Internal server error"
): string {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed || trimmed === "[object Object]") return fallback;
    return trimmed;
  }

  if (value instanceof Error) {
    const message = value.message?.trim();
    if (message && message !== "[object Object]") {
      return message;
    }

    const maybeCause = (value as Error & { cause?: unknown }).cause;
    if (maybeCause !== undefined) {
      return normalizeErrorMessage(maybeCause, fallback);
    }

    return fallback;
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const direct =
      (typeof record.message === "string" && record.message.trim()) ||
      (typeof record.error === "string" && record.error.trim()) ||
      (typeof record.summary === "string" && record.summary.trim()) ||
      "";
    if (direct && direct !== "[object Object]") return direct;

    const code =
      typeof record.code === "string" && record.code.trim()
        ? record.code.trim()
        : "";
    if (code) return `${fallback} (${code})`;

    try {
      const serialized = JSON.stringify(record);
      return serialized && serialized !== "{}" ? serialized : fallback;
    } catch {
      return fallback;
    }
  }

  return fallback;
}

function getToolTitle(toolName: string): string {
  if (toolName === "create_site") {
    return "Site layout";
  }
  if (toolName === "create_section") {
    return "Section layout";
  }
  if (toolName === "resolve_image_slots") {
    return "Image library";
  }
  if (toolName === "validate_completeness") {
    return "Completeness check";
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

    const flushPendingTurnEvents = async () => {
      if (!turnRunId || pendingTurnEvents.length === 0) return;

      while (pendingTurnEvents.length > 0) {
        const events = pendingTurnEvents.splice(0, TURN_EVENT_BATCH_SIZE);
        try {
          await publishStreamEvents({
            chatId: chat.id,
            runId: turnRunId,
            events,
          });
        } catch (error) {
        }
      }
    };

    const queueTurnEventFlush = () => {
      turnEventsFlushChain = turnEventsFlushChain
        .then(async () => {
          await flushPendingTurnEvents();
        })
        .catch(() => {});
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
    const contextMessages: Array<Omit<UIMessage, "id">  > =
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
    const promptableSiteAssets = toSiteAssetPromptDescriptors(
      await getSiteAssetsByChatId(chatId, user.id)
    );
    const siteAssetContext = buildSiteAssetPromptContext(promptableSiteAssets);
    const { staticSystemPrompt, dynamicSystemSuffix } = buildChatSystemPromptParts({
      siteAssetContext,
    });
    const useChatPromptCache = isAnthropicChatPromptCachingEnabled();
    const systemPrompt: string | SystemModelMessage | SystemModelMessage[] =
      useChatPromptCache
        ? [
            {
              role: "system",
              content: staticSystemPrompt,
              providerOptions: {
                anthropic: {
                  cacheControl: { type: "ephemeral" },
                },
              },
            },
            ...(dynamicSystemSuffix
              ? [{ role: "system" as const, content: dynamicSystemSuffix }]
              : []),
          ]
        : buildChatSystemPrompt({ siteAssetContext });

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
    const validateCompletenessToolCall = createValidateCompletenessTool(
      chatId,
      user.id,
      billingSession.ensureChargedForAction
    );
    const resolveImageSlotsToolCall = createResolveImageSlotsTool(
      chatId,
      user.id,
      billingSession.ensureChargedForAction
    );
    const tools = {
      create_site: createSiteToolCall,
      create_section: createSectionToolCall,
      resolve_image_slots: resolveImageSlotsToolCall,
      validate_completeness: validateCompletenessToolCall,
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
        chatPromptCache: useChatPromptCache,
      },
    });
    updateActiveTrace({
      name: "chat-message",
      sessionId: chatId,
      userId: String(user.id),
      input: lastUserText.trim() || undefined,
      metadata: {
        model: modelId,
        chatPromptCache: useChatPromptCache,
      },
    });

    const flushLiveTextDelta = async () => {
      if (!liveTextBuffer) return;
      const chunk = liveTextBuffer;
      liveTextBuffer = "";
      emittedAssistantChars += chunk.length;
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
          chatPromptCache: useChatPromptCache,
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
              if (toolName === "validate_completeness") {
                console.log("[chat-route] validator tool_call detected (chunk)", {
                  toolName,
                  toolCallId,
                  chatId,
                  turnRunId: turnRunId ?? null,
                });
              }
              await emitTurnEvent("tool_call", {
                toolCallId,
                toolName,
                destination,
              });
            }
          }

          // Prevent tool payload JSON (args/input) from leaking into assistant text stream.
          if (isNonAssistantOrToolChunkType(eventType)) {
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
            return;
          }
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
              if (toolName === "validate_completeness") {
                console.log("[chat-route] validator tool_call persisted", {
                  toolName,
                  toolCallId,
                  chatId,
                  stepNumber,
                });
              }
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
            if (toolName === "validate_completeness") {
              console.log("[chat-route] validator tool_result emitted", {
                toolName,
                toolCallId,
                chatId,
                stepNumber,
                success:
                  (res as any)?.success ?? (res as any)?.output?.success ?? null,
                status:
                  (res as any)?.status ??
                  (res as any)?.output?.status ??
                  null,
              });
            }

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
      },
      onError: async (error) => {
        if (liveTextFlushTimer) {
          clearTimeout(liveTextFlushTimer);
          liveTextFlushTimer = null;
        }
        await flushLiveTextDelta();

        const errMsg = normalizeErrorMessage(error, "Generation failed");
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
      },
    });

    after(async () => langfuseSpanProcessor.forceFlush());

    return result.toUIMessageStreamResponse();
  } catch (error) {
    console.error("Chat API error:", error);
    const errorMessage = normalizeErrorMessage(error, "Internal server error");
    return NextResponse.json(
      { error: errorMessage, code: "AI_SERVICE_ERROR" },
      { status: 500 }
    );
  }
}

/**
 * Use startActiveObservation (OTEL startActiveSpan) instead of observe().
 * observe() only wrapped the first sync tick of the async handler with an active
 * span, so streamText + nested generateText/tool telemetry often lost parent
 * context and showed up as separate Langfuse traces.
 */
export async function POST(request: NextRequest) {
  return startActiveObservation(
    "chat-message",
    async () => {
      return chatHandler(request);
    },
    { endOnExit: false }
  );
}