import {
  updateActiveObservation,
  updateActiveTrace,
} from "@langfuse/tracing";
import { streamText, convertToModelMessages, stepCountIs } from "ai";
import type { SystemModelMessage, UIMessage } from "ai";
import type { Chat, User } from "@/lib/db/schema";
import {
  createChatMessage,
  createChatToolCall,
  getChatMessagesByPublicId,
  getSiteAssetsByChatId,
  updateChatByPublicId,
  generateChatName,
  markChatTurnRunSucceeded,
  markChatTurnRunFailed,
  getChatTurnRunById,
} from "@/lib/db/queries";
import {
  getOrCreateAccountForUser,
  getSubscriptionByAccountId,
} from "@/lib/billing/accounts";
import { ensureDailyCreditsForAccount } from "@/lib/billing/daily-credits";
import { getCreditsBreakdown } from "@/lib/billing/credits-breakdown";
import {
  billingActionTypeFromSuccessfulCodegenDestination,
  finalizeSuccessfulChatTurnBilling,
} from "@/lib/credits/chat-turn-billing";
import { getCreditsCostForAction } from "@/lib/credits/pricing";
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
import { applyStreamEventsToChatTurnRunLiveState } from "@/lib/chat/live-state";
import type { StreamEventEnvelope } from "@/lib/chat/stream-bus/types";
import { logChatStreamDiagnostic } from "@/lib/chat/stream-diagnostics";

const BUILDER_TOOLS = new Set([
  "create_site",
  "create_section",
  "resolve_image_slots",
  "validate_completeness",
]);
const TEXT_DELTA_FLUSH_MS = 40;
const TEXT_DELTA_FLUSH_CHARS = 24;
const TURN_EVENT_FLUSH_MS = 32;
const TURN_EVENT_BATCH_SIZE = 32;
const MAX_CHAT_STEPS_PER_TURN = 20;

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

// Chunk types delivered to `streamText` `onChunk` in ai@6 (see
// `ai/src/generate-text/stream-text.ts` in the published source). Anything else
// that arrives is unexpected and will be logged so we can extend the whitelist.
const AI_SDK_V6_ONCHUNK_TYPES = new Set<string>([
  "text-delta",
  "reasoning-delta",
  "source",
  "tool-call",
  "tool-input-start",
  "tool-input-delta",
  "tool-result",
  "raw",
]);

function isKnownOnChunkType(eventType: string): boolean {
  return AI_SDK_V6_ONCHUNK_TYPES.has(eventType);
}

function isToolCallLikeChunkType(eventType: string): boolean {
  return (
    eventType === "tool-call" ||
    eventType === "tool-input-start" ||
    eventType === "tool-input-delta" ||
    eventType === "tool-result"
  );
}

// Pulls user-visible text out of a v6 onChunk event. The callback shape is
// `{ chunk: TextStreamPart }`, so prefer `evt.chunk.text` and fall back to
// legacy / alternative shapes defensively.
function extractChunkText(evt: any): string | null {
  return (
    (typeof evt?.chunk?.text === "string" ? evt.chunk.text : null) ??
    (typeof evt?.chunk?.textDelta === "string" ? evt.chunk.textDelta : null) ??
    (typeof evt?.chunk?.delta === "string" ? evt.chunk.delta : null) ??
    (typeof evt?.text === "string" ? evt.text : null) ??
    (typeof evt?.textDelta === "string" ? evt.textDelta : null) ??
    (typeof evt?.delta === "string" ? evt.delta : null) ??
    null
  );
}

// Builds a compact, safe summary of an onChunk event for `CHAT_STREAM_DEBUG_RAW`
// diagnostics. Clips long strings and avoids dumping deep provider objects.
function summarizeRawChunk(evt: any): Record<string, unknown> {
  const chunk = (evt?.chunk ?? evt ?? {}) as Record<string, unknown>;
  const out: Record<string, unknown> = {
    type: typeof chunk.type === "string" ? chunk.type : "unknown",
  };
  const passthrough: readonly (keyof typeof chunk)[] = [
    "id",
    "toolCallId",
    "toolName",
    "providerExecuted",
  ];
  for (const key of passthrough) {
    const v = chunk[key];
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
      out[key as string] = v;
    }
  }
  const text = extractChunkText(evt);
  if (typeof text === "string") {
    out.textChars = text.length;
    if (text.length > 0) out.textSnippet = text.slice(0, 80);
  }
  const rawValue = (chunk as { rawValue?: unknown }).rawValue;
  if (rawValue !== undefined) {
    try {
      const str = JSON.stringify(rawValue);
      out.rawValuePreview =
        str.length > 240 ? `${str.slice(0, 240)}…(${str.length - 240} more)` : str;
    } catch {
      out.rawValuePreview = "[unserializable]";
    }
  }
  return out;
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

export type CreateChatTurnStreamParams = {
  user: User;
  chat: Chat;
  chatPublicId: string;
  messages: Array<Omit<UIMessage, "id">>;
  turnRunId?: string;
  persistIncomingUserMessage?: boolean;
  emitRunStarted?: boolean;
  onPublishedTurnEvents?: (events: StreamEventEnvelope[]) => Promise<void> | void;
};

export async function createChatTurnStream({
  user,
  chat,
  chatPublicId,
  messages,
  turnRunId,
  persistIncomingUserMessage = false,
  emitRunStarted = true,
  onPublishedTurnEvents,
}: CreateChatTurnStreamParams) {
  const streamStartedAt = Date.now();
  const executionTimings: Record<string, number> = {};
  const measure = async <T,>(label: string, work: () => Promise<T>): Promise<T> => {
    const startedAt = Date.now();
    try {
      return await work();
    } finally {
      executionTimings[label] = Date.now() - startedAt;
    }
  };
  let firstModelChunkAtMs: number | null = null;
  let firstTextDeltaQueuedAtMs: number | null = null;
  let firstTextDeltaPersistedAtMs: number | null = null;

  const publishTurnEvents = async (
    events: Array<{
      eventType: string;
      payload: Record<string, unknown>;
    }>
  ) => {
    if (!turnRunId || events.length === 0) return;
    const publishedEvents = await measure("publishTurnEventsMs", () =>
      publishStreamEvents(
        {
          chatId: chat.id,
          runId: turnRunId,
          events,
        },
        {
          onEventsPersisted: onPublishedTurnEvents,
        }
      )
    );
    if (firstTextDeltaPersistedAtMs == null) {
      const firstPersistedTextDelta = publishedEvents.find(
        (event) => event.eventType === "text_delta"
      );
      if (firstPersistedTextDelta) {
        firstTextDeltaPersistedAtMs = Date.now();
        logChatStreamDiagnostic("Persisted first text delta batch", {
          chatId: chat.id,
          chatPublicId,
          turnRunId,
          logicalEventId: firstPersistedTextDelta.logicalEventId,
          elapsedMs: firstTextDeltaPersistedAtMs - streamStartedAt,
        });
      }
    }
    await applyStreamEventsToChatTurnRunLiveState({
      runId: turnRunId,
      chatId: chat.id,
      userId: user.id,
      events: publishedEvents,
    });
  };

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
        await publishTurnEvents(events);
      } catch {
        // keep stream alive; diagnostics are emitted by the stream bus
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

  if (turnRunId && emitRunStarted) {
    await emitTurnEvent(
      "run_started",
      {
        chatId: chatPublicId,
        turnRunId,
      },
      { urgent: true }
    );
  }

  let billingAccountId: number | null = null;
  const turnBillingIdempotencyKey =
    typeof turnRunId === "string" && turnRunId.trim()
      ? `chat-turn-bill-${turnRunId.trim()}`
      : `chat-turn-bill-${chatPublicId}-${user.id}-${messages.length}`;

  if (!turnRunId) {
    const account = await measure("accountLookupMs", () =>
      getOrCreateAccountForUser(user.id)
    );
    billingAccountId = account.id;
    await measure("ensureDailyCreditsMs", () =>
      ensureDailyCreditsForAccount(account.id)
    );
    const subscriptionForGate = await measure("subscriptionLookupMs", () =>
      getSubscriptionByAccountId(account.id)
    );
    const { balance: balanceForGate } = await measure("creditsBreakdownMs", () =>
      getCreditsBreakdown(account.id, subscriptionForGate)
    );
    const minCreditsToStartTurn = await measure("creditsCostLookupMs", () =>
      getCreditsCostForAction("chat_message", subscriptionForGate?.planId ?? null)
    );
    if (balanceForGate < minCreditsToStartTurn) {
      throw new Error(
        "Insufficient credits. Please upgrade your plan or buy more credits."
      );
    }
  }

  const lastIncomingMessage = messages[messages.length - 1] as any;
  if (
    persistIncomingUserMessage &&
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
        void (async () => {
          try {
            const title = await generateChatName(userText.trim(), {
              userId: user.id,
              chatId: chatPublicId,
            });
            await updateChatByPublicId(chatPublicId, user.id, { title });
          } catch (error) {
            console.error("Failed to persist generated chat title:", error);
          }
        })();
      }
    }
  }

  const persistedContext = await measure("contextMessagesLookupMs", () =>
    getChatMessagesByPublicId(chatPublicId, user.id)
  );
  const contextMessages: Array<Omit<UIMessage, "id">> =
    persistedContext?.messages?.length
      ? persistedContext.messages.map((m) => {
          const parts = sanitizePersistedMessageParts(m.parts);
          return {
            role: m.role as UIMessage["role"],
            parts:
              parts.length > 0
                ? parts
                : [{ type: "text", text: m.content ?? "" }],
          };
        })
      : messages;

  const modelMessages = await measure("convertModelMessagesMs", () =>
    convertToModelMessages(contextMessages)
  );

  const [model, modelId] = await measure("modelLookupMs", () =>
    Promise.all([getAIModel(), getAIModelId()])
  );
  const promptableSiteAssets = toSiteAssetPromptDescriptors(
    await measure("siteAssetsLookupMs", () =>
      getSiteAssetsByChatId(chatPublicId, user.id)
    )
  );
  const siteAssetContext = buildSiteAssetPromptContext(promptableSiteAssets);
  const { staticSystemPrompt, dynamicSystemSuffix } = await measure(
    "buildPromptMs",
    async () =>
      buildChatSystemPromptParts({
        siteAssetContext,
      })
  );
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

  const [
    createSiteToolCall,
    createSectionToolCall,
    validateCompletenessToolCall,
    resolveImageSlotsToolCall,
  ] = await measure("toolSetupMs", async () => [
    createSiteTool(chatPublicId, user.id, {
      deferredChatTurnBilling: true,
    }),
    createSectionTool(chatPublicId, user.id, {
      deferredChatTurnBilling: true,
    }),
    createValidateCompletenessTool(chatPublicId, user.id),
    createResolveImageSlotsTool(chatPublicId, user.id),
  ]);
  const tools = {
    create_site: createSiteToolCall,
    create_section: createSectionToolCall,
    resolve_image_slots: resolveImageSlotsToolCall,
    validate_completeness: validateCompletenessToolCall,
  };

  const lastMessage = contextMessages[contextMessages.length - 1] as any;
  const contentSegments: ContentSegment[] = [];
  let liveTextBuffer = "";
  let liveTextFlushTimer: ReturnType<typeof setTimeout> | null = null;
  let emittedAssistantChars = 0;
  let fallbackEmittedChars = 0;
  let stepCounter = 0;
  const chunkTypeCounts = new Map<string, number>();
  let textDeltaEventsEmitted = 0;

  // Diagnostics: we whitelist `text-delta` for user-visible text, but keep
  // counters for everything else so we can verify nothing user-facing is
  // hiding in reasoning / unknown chunk types when debugging.
  let reasoningDeltaChars = 0;
  let reasoningDeltaLogs = 0;
  let unknownChunkTypeChars = 0;
  let unknownChunkTypeLogs = 0;
  let rawChunkDumpCount = 0;
  const MAX_REASONING_SNIPPET_LOGS = 5;
  const MAX_UNKNOWN_CHUNK_LOGS = 5;
  const MAX_RAW_CHUNK_DUMPS = 150;
  const rawChunkDebugEnabled = true;

  const emittedToolCallMeta = new Map<string, { hasDestination: boolean }>();
  let lastSuccessfulRevision: {
    chatId: string;
    revisionNumber: number;
    revisionId: number;
  } | null = null;
  const billableTiersThisTurn = new Set<string>();

  const lastUserText =
    (lastMessage?.role === "user" && Array.isArray(lastMessage.parts)
      ? lastMessage.parts
          .filter((p: any) => p?.type === "text")
          .map((p: any) => p.text)
          .join("")
      : lastMessage?.role === "user" && typeof lastMessage.content === "string"
        ? lastMessage.content
        : "") || "";

  updateActiveObservation({
    input: lastUserText.trim() || undefined,
    metadata: {
      model: modelId,
      chatPromptCache: useChatPromptCache,
    },
  });
  updateActiveTrace({
    name: "chat-message",
    sessionId: chatPublicId,
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
    textDeltaEventsEmitted += 1;
    if (firstTextDeltaQueuedAtMs == null) {
      firstTextDeltaQueuedAtMs = Date.now();
      logChatStreamDiagnostic("Queued first text delta batch", {
        chatId: chat.id,
        chatPublicId,
        turnRunId,
        chars: chunk.length,
        elapsedMs: firstTextDeltaQueuedAtMs - streamStartedAt,
      });
    }
    await emitTurnEvent("text_delta", { text: chunk });
  };

  const queueLiveTextFlush = () => {
    if (liveTextFlushTimer) return;
    liveTextFlushTimer = setTimeout(() => {
      liveTextFlushTimer = null;
      void flushLiveTextDelta();
    }, TEXT_DELTA_FLUSH_MS);
  };

  const turnRunAbortController =
    typeof turnRunId === "string" && turnRunId.trim()
      ? new AbortController()
      : null;
  let lastTurnCancelPollMs = 0;
  const pollTurnCanceled = async (): Promise<boolean> => {
    if (!turnRunAbortController || !turnRunId) return false;
    const now = Date.now();
    if (now - lastTurnCancelPollMs < 450) return false;
    lastTurnCancelPollMs = now;
    const run = await getChatTurnRunById(turnRunId);
    if (run?.status === "canceled") {
      turnRunAbortController.abort();
      return true;
    }
    return false;
  };

  return streamText({
    model,
    system: systemPrompt,
    messages: modelMessages,
    tools,
    abortSignal: turnRunAbortController?.signal,
    stopWhen: stepCountIs(MAX_CHAT_STEPS_PER_TURN),
    // When `CHAT_STREAM_DEBUG_RAW` is set we also ask the SDK for provider-native
    // raw chunks so we can see exactly what Anthropic/OpenAI/etc. emitted. See
    // https://ai-sdk.dev/docs/ai-sdk-core/generating-text (#onChunk callback).
    includeRawChunks: rawChunkDebugEnabled,
    experimental_telemetry: {
      isEnabled: true,
      functionId: "chat-stream",
      metadata: {
        userId: user.id,
        chatId: chatPublicId,
        sessionId: chatPublicId,
        chatPromptCache: useChatPromptCache,
      },
    },
    onChunk: async (chunkEvent: unknown) => {
      try {
        if (await pollTurnCanceled()) return;
        const evt = chunkEvent as any;
        const rawEventType =
          typeof evt?.chunk?.type === "string"
            ? evt.chunk.type
            : typeof evt?.type === "string"
              ? evt.type
              : "unknown";
        const eventType = normalizeChunkEventType(rawEventType);
        chunkTypeCounts.set(
          eventType,
          (chunkTypeCounts.get(eventType) ?? 0) + 1
        );

        if (rawChunkDebugEnabled && rawChunkDumpCount < MAX_RAW_CHUNK_DUMPS) {
          rawChunkDumpCount += 1;
          logChatStreamDiagnostic("Raw chunk sample", {
            chatId: chat.id,
            chatPublicId,
            turnRunId,
            seq: rawChunkDumpCount,
            chunk: summarizeRawChunk(evt),
          });
        }

        // Tool-call-like chunks: emit tool_call meta, never forward as text.
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
          }
          return;
        }

        // Reasoning deltas are internal to the model. We don't surface them,
        // but we count chars + log a few snippets so we can prove no
        // user-visible text is hiding here when debugging.
        if (eventType === "reasoning-delta") {
          const reasoningText = extractChunkText(evt);
          if (typeof reasoningText === "string" && reasoningText.length > 0) {
            reasoningDeltaChars += reasoningText.length;
            if (reasoningDeltaLogs < MAX_REASONING_SNIPPET_LOGS) {
              reasoningDeltaLogs += 1;
              logChatStreamDiagnostic("Reasoning delta observed", {
                chatId: chat.id,
                chatPublicId,
                turnRunId,
                chars: reasoningText.length,
                snippet: reasoningText.slice(0, 60),
              });
            }
          }
          return;
        }

        // WHITELIST: only `text-delta` chunks become user-visible assistant text.
        if (eventType !== "text-delta") {
          if (!isKnownOnChunkType(eventType)) {
            // The AI SDK / provider emitted a chunk type we don't model. Log
            // the first few with a text snippet so we can extend our handling
            // if a future SDK version introduces a new visible-text type.
            const maybeText = extractChunkText(evt);
            if (typeof maybeText === "string" && maybeText.length > 0) {
              unknownChunkTypeChars += maybeText.length;
            }
            if (unknownChunkTypeLogs < MAX_UNKNOWN_CHUNK_LOGS) {
              unknownChunkTypeLogs += 1;
              logChatStreamDiagnostic("Unknown chunk type", {
                chatId: chat.id,
                chatPublicId,
                turnRunId,
                eventType,
                textChars:
                  typeof maybeText === "string" ? maybeText.length : 0,
                snippet:
                  typeof maybeText === "string" && maybeText.length > 0
                    ? maybeText.slice(0, 60)
                    : undefined,
              });
            }
          }
          return;
        }

        const textDelta = extractChunkText(evt);
        if (!textDelta) {
          return;
        }
        if (firstModelChunkAtMs == null) {
          firstModelChunkAtMs = Date.now();
          logChatStreamDiagnostic("Received first model text chunk", {
            chatId: chat.id,
            chatPublicId,
            turnRunId,
            chars: textDelta.length,
            elapsedMs: firstModelChunkAtMs - streamStartedAt,
            executionTimings,
          });
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
        if (await pollTurnCanceled()) return;
        stepCounter += 1;
        const stepNumber = stepCounter;
        const content = Array.isArray((step as any).content)
          ? ((step as any).content as Array<{
              type: string;
              text?: string;
              toolCallId?: string;
              toolName?: string;
              args?: unknown;
              input?: unknown;
            }>)
          : [];
        const staticResults = (step as any).staticToolResults ?? [];

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
            const toolCallId = (part as any).toolCallId ?? (part as any).id ?? null;
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
              fallbackEmittedChars += fallbackDelta.length;
              textDeltaEventsEmitted += 1;
              logChatStreamDiagnostic(
                "Emitted fallback text_delta from onStepFinish",
                {
                  chatId: chat.id,
                  chatPublicId,
                  turnRunId,
                  chars: fallbackDelta.length,
                  snippetHead: fallbackDelta.slice(0, 60),
                }
              );
              await emitTurnEvent("text_delta", { text: fallbackDelta });
            }
          }
        }

        for (const res of staticResults) {
          const toolName = (res as any).toolName ?? (res as any).name ?? "unknown";
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
                chatId: chatPublicId,
                revisionNumber: Number(output.revisionNumber),
                revisionId: Number(output.revisionId ?? output.versionId ?? 0),
              };
              if (toolName === "create_site") {
                billableTiersThisTurn.add("generate_page");
              } else if (toolName === "create_section") {
                const tier = billingActionTypeFromSuccessfulCodegenDestination(
                  typeof output.destination === "string" ? output.destination : null
                );
                if (tier) billableTiersThisTurn.add(tier);
              }
            }
          }
        }
      } catch (e) {
        console.error("Failed to persist tool calls/results:", e);
      }
    },
    onAbort: async () => {
      if (liveTextFlushTimer) {
        clearTimeout(liveTextFlushTimer);
        liveTextFlushTimer = null;
      }
      await flushLiveTextDelta();
      await flushTurnEventsNow();
    },
    onFinish: async () => {
      if (liveTextFlushTimer) {
        clearTimeout(liveTextFlushTimer);
        liveTextFlushTimer = null;
      }
      await flushLiveTextDelta();

      if (turnRunId) {
        const run = await getChatTurnRunById(turnRunId);
        if (run?.status === "canceled") {
          await flushTurnEventsNow();
          return;
        }
      }

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
      if (!chat.title && lastUserText.trim()) {
        try {
          const title = await generateChatName(lastUserText.trim(), {
            userId: user.id,
            chatId: chatPublicId,
          });
          await updateChatByPublicId(chatPublicId, user.id, { title });
        } catch (error) {
          console.error("Failed to generate chat title after completion:", error);
        }
      }
      if (lastSuccessfulRevision) {
        await emitTurnEvent("preview_update", {
          chatId: lastSuccessfulRevision.chatId,
          revisionNumber: lastSuccessfulRevision.revisionNumber,
          revisionId: lastSuccessfulRevision.revisionId,
        });
      }
      try {
        if (billingAccountId == null) {
          billingAccountId = (
            await measure("billingAccountLookupMs", () =>
              getOrCreateAccountForUser(user.id)
            )
          ).id;
        }
        await finalizeSuccessfulChatTurnBilling({
          accountId: billingAccountId,
          userId: user.id,
          observedTiers: billableTiersThisTurn,
          idempotencyKey: turnBillingIdempotencyKey,
        });
      } catch (billingErr) {
        console.error("[chat] End-of-turn billing failed", billingErr);
      }
      if (turnRunId) {
        await markChatTurnRunSucceeded(turnRunId);
        await emitTurnEvent(
          "run_completed",
          {
            chatId: chatPublicId,
            turnRunId,
            hasAssistantText: Boolean(finalText),
          },
          { urgent: true }
        );
      }
      updateActiveObservation({ output: finalText || undefined });
      updateActiveTrace({ output: finalText || undefined });

      if (lastSuccessfulRevision) {
        void captureLandingPageScreenshot({
          chatId: lastSuccessfulRevision.chatId,
          revisionNumber: lastSuccessfulRevision.revisionNumber,
          userId: user.id,
        });
      }
      const chunkTypeSummary = Array.from(chunkTypeCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([type, count]) => `${type}:${count}`)
        .join(",");
      // Parity check: `emittedAssistantChars + fallbackEmittedChars` should
      // equal `finalText.length` (modulo trimming). If not, we dropped text
      // somewhere on the emission path; if `unknownChunkTypeChars > 0`, the
      // provider sent a new chunk type our whitelist doesn't cover.
      logChatStreamDiagnostic("Chat turn stream finished", {
        chatId: chat.id,
        chatPublicId,
        turnRunId,
        totalStreamMs: Date.now() - streamStartedAt,
        firstModelChunkMs:
          firstModelChunkAtMs == null ? null : firstModelChunkAtMs - streamStartedAt,
        firstTextDeltaQueuedMs:
          firstTextDeltaQueuedAtMs == null
            ? null
            : firstTextDeltaQueuedAtMs - streamStartedAt,
        firstTextDeltaPersistedMs:
          firstTextDeltaPersistedAtMs == null
            ? null
            : firstTextDeltaPersistedAtMs - streamStartedAt,
        emittedAssistantChars,
        fallbackEmittedChars,
        textDeltaEventsEmitted,
        finalTextLength: finalText.length,
        finalTextHead: finalText.slice(0, 80),
        finalTextTail: finalText.slice(-80),
        reasoningDeltaChars,
        unknownChunkTypeChars,
        unknownChunkTypeLogs,
        rawChunkDumpCount: rawChunkDebugEnabled ? rawChunkDumpCount : undefined,
        chunkTypes: chunkTypeSummary,
        executionTimings,
      });
    },
    onError: async (event: { error: unknown }) => {
      if (liveTextFlushTimer) {
        clearTimeout(liveTextFlushTimer);
        liveTextFlushTimer = null;
      }
      await flushLiveTextDelta();

      const rootError = event?.error;

      if (turnRunId) {
        const run = await getChatTurnRunById(turnRunId);
        if (run?.status === "canceled") {
          await flushTurnEventsNow();
          return;
        }
      }

      const abortCause = rootError instanceof Error ? rootError.cause : undefined;
      const isAbortError =
        (rootError instanceof Error && rootError.name === "AbortError") ||
        (abortCause instanceof Error && abortCause.name === "AbortError");

      if (isAbortError && turnRunId) {
        return;
      }

      const errMsg = normalizeErrorMessage(rootError, "Generation failed");
      if (turnRunId) {
        await markChatTurnRunFailed({
          runId: turnRunId,
          errorMessage: errMsg,
        });
        await emitTurnEvent(
          "run_failed",
          {
            chatId: chatPublicId,
            turnRunId,
            error: errMsg,
          },
          { urgent: true }
        );
      }
      updateActiveObservation({ output: errMsg, level: "ERROR" });
      updateActiveTrace({ output: errMsg });
      logChatStreamDiagnostic("Chat turn stream failed", {
        chatId: chat.id,
        chatPublicId,
        turnRunId,
        error: errMsg,
        totalStreamMs: Date.now() - streamStartedAt,
        firstModelChunkMs:
          firstModelChunkAtMs == null ? null : firstModelChunkAtMs - streamStartedAt,
        firstTextDeltaQueuedMs:
          firstTextDeltaQueuedAtMs == null
            ? null
            : firstTextDeltaQueuedAtMs - streamStartedAt,
        firstTextDeltaPersistedMs:
          firstTextDeltaPersistedAtMs == null
            ? null
            : firstTextDeltaPersistedAtMs - streamStartedAt,
        executionTimings,
      });
    },
  });
}

export async function executeChatTurn(params: CreateChatTurnStreamParams) {
  const result = await createChatTurnStream(params);
  const streamResult = result as unknown as {
    consumeStream?: () => PromiseLike<void>;
    fullStream?: AsyncIterable<unknown>;
    textStream?: AsyncIterable<unknown>;
  };

  if (typeof streamResult.consumeStream === "function") {
    await streamResult.consumeStream();
  } else if (streamResult.fullStream) {
    for await (const _ of streamResult.fullStream) {
      // drain stream so onFinish/onError callbacks run in task mode
    }
  } else if (streamResult.textStream) {
    for await (const _ of streamResult.textStream) {
      // fallback drain path for older result objects
    }
  }
}
