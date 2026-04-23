"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import type { UIMessage } from "ai";
import useSWR from "swr";
import { useRealtimeRunWithStreams } from "@trigger.dev/react-hooks";
import { WelcomeMessage } from "./welcome-message";
import { MessageList } from "./message-list";
import { ChatInput } from "./chat-input";
import { CreditsLimitModal } from "./credits-limit-modal";
import {
  UploadProgressToast,
  type UploadProgressToastState,
} from "./upload-progress-toast";
import {
  hidePreviewLoader,
  showPreviewLoader,
  updatePreviewPanel,
} from "@/lib/preview/update-preview";
import { usePendingMessageStore } from "@/lib/stores/usePendingMessageStore";
import type { BillingApiResponse } from "@/app/api/billing/route";
import { toast } from "sonner";
import {
  CHAT_TURN_TRIGGER_STREAM_KEY,
  type ChatTurnRealtimeStreamPart,
} from "@/lib/chat/realtime-stream";

const billingFetcher = (url: string) => fetch(url).then((res) => res.json());
const MIN_CREDITS_TO_SEND = 0.5;
const CHAT_STREAM_DEBUG_ENABLED = true;
const FORCE_TRIGGER_REALTIME_STREAM = true;
type PendingAttachment = {
  localId: string;
  id: number | null;
  alias: string;
  blobUrl: string;
  mimeType: string;
  intent: "reference" | "site_asset" | "both";
  altHint?: string | null;
  label?: string | null;
  isUploading?: boolean;
};

type StreamEnvelope = {
  logicalEventId: number;
  chatId: number;
  runId: string;
  eventType: string;
  payload: Record<string, any>;
  createdAt: string;
};

type LiveTurnRunState = {
  runId: string;
  status: string;
  assistantParts: UIMessage["parts"];
  previewState?: {
    revisionId?: number;
    revisionNumber?: number;
  } | null;
  lastLogicalEventId: number;
};

type TriggerRealtimeSession = {
  runId: string;
  accessToken: string;
};

type ChatStreamDebugEvent = {
  eventType: string;
  logicalEventId?: number;
  lagMs?: number | null;
  gapMs?: number | null;
  textDeltaChars?: number;
  note?: string;
};

function buildTriggerRealtimeSessionStorageKey(chatId: string, runId: string): string {
  return `chat-trigger-realtime:${chatId}:${runId}`;
}

function normalizeErrorMessage(
  value: unknown,
  fallback = "Generation failed"
): string {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed || trimmed === "[object Object]") {
      return fallback;
    }
    return trimmed;
  }

  if (value instanceof Error) {
    return value.message || fallback;
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const direct =
      (typeof record.message === "string" && record.message.trim()) ||
      (typeof record.error === "string" && record.error.trim()) ||
      (typeof record.summary === "string" && record.summary.trim()) ||
      "";
    if (direct) return direct;

    const code =
      typeof record.code === "string" && record.code.trim()
        ? record.code.trim()
        : "";
    if (code) {
      return `${fallback} (${code})`;
    }

    try {
      return JSON.stringify(record);
    } catch {
      return fallback;
    }
  }

  return fallback;
}

interface ChatProps {
  chatId?: string;
}

export function Chat({ chatId: providedChatId }: ChatProps = {}) {
  if (providedChatId) {
    return <ChatWithHistory chatId={providedChatId} />;
  }

  return <ChatInner />;
}

function ChatWithHistory({ chatId }: { chatId: string }) {
  const pendingForMountRef = useRef(false);
  const [initialMessages, setInitialMessages] = useState<UIMessage[] | null>(
    () => {
      const pending = usePendingMessageStore.getState().pendingMessage;
      pendingForMountRef.current = pending != null && pending.chatId === chatId;
      return pendingForMountRef.current ? [] : null;
    }
  );
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const hasPendingForThisChat = pendingForMountRef.current;
    setInitialMessages(hasPendingForThisChat ? [] : null);
    setLoadError(null);

    (async () => {
      try {
        const res = await fetch(
          `/api/chats/${encodeURIComponent(chatId)}/messages`
        );
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          throw new Error(data?.error || "Failed to load chat messages");
        }
        const data = await res.json();
        if (!cancelled) {
          setInitialMessages(
            Array.isArray(data?.messages) ? data.messages : []
          );
        }
      } catch (e) {
        if (!cancelled) {
          setLoadError(e instanceof Error ? e.message : "Failed to load chat");
          setInitialMessages([]);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [chatId]);

  if (initialMessages === null) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
        Loading chat…
      </div>
    );
  }

  if (loadError) {
    console.warn(loadError);
  }

  return (
    <ChatInner key={chatId} chatId={chatId} initialMessages={initialMessages} />
  );
}

function ChatInner({
  chatId: providedChatId,
  initialMessages = [],
}: {
  chatId?: string;
  initialMessages?: UIMessage[];
}) {
  const [input, setInput] = useState("");
  const [chatId, setChatId] = useState<string | null>(providedChatId || null);
  const [isCreatingChat, setIsCreatingChat] = useState(false);
  const [showCreditsLimitModal, setShowCreditsLimitModal] = useState(false);
  const [pendingAttachments, setPendingAttachments] = useState<
    PendingAttachment[]
  >([]);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [isUploadingAttachments, setIsUploadingAttachments] = useState(false);
  const [uploadToast, setUploadToast] =
    useState<UploadProgressToastState | null>(null);
  const insertTextFromGlobalKey = useCallback((text: string) => {
    setInput((prev) => prev + text);
  }, []);
  const lastUserMessageRef = useRef<string>("");
  const lastUserMessagePartsRef = useRef<UIMessage["parts"]>([]);
  const lastPreviewVersionIdRef = useRef<number | null>(null);
  const pendingPreviewUpdateRef = useRef<{
    versionId: number;
    versionNumber: number;
  } | null>(null);
  const uploadToastTimerRef = useRef<number | null>(null);
  const pendingMessage = usePendingMessageStore((s) => s.pendingMessage);
  const setPendingMessage = usePendingMessageStore((s) => s.setPendingMessage);
  const consumedPendingIdsRef = useRef<Set<string>>(new Set());
  const {
    data: billing,
    error: billingError,
    isLoading: isBillingLoading,
    mutate: mutateBilling,
  } = useSWR<BillingApiResponse>("/api/billing", billingFetcher);
  /** Require a loaded balance; never treat "still fetching" as sufficient credits. */
  const hasCredits =
    billing != null && Number(billing.balance) >= MIN_CREDITS_TO_SEND;

  const scheduleUploadToastHide = useCallback((delayMs: number) => {
    if (uploadToastTimerRef.current != null) {
      window.clearTimeout(uploadToastTimerRef.current);
    }
    uploadToastTimerRef.current = window.setTimeout(() => {
      setUploadToast(null);
      uploadToastTimerRef.current = null;
    }, delayMs);
  }, []);

  useEffect(() => {
    return () => {
      if (uploadToastTimerRef.current != null) {
        window.clearTimeout(uploadToastTimerRef.current);
        uploadToastTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const createNewChat = async () => {
      if (chatId || isCreatingChat || providedChatId) return;

      setIsCreatingChat(true);
      try {
        const response = await fetch("/api/chats", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({}),
        });

        if (response.ok) {
          const data = await response.json();
          setChatId(data.chat.publicId);
        } else {
          console.error("Failed to create chat");
        }
      } catch (error) {
        console.error("Error creating chat:", error);
      } finally {
        setIsCreatingChat(false);
      }
    };

    createNewChat();
  }, [chatId, isCreatingChat, providedChatId]);

  const [errorMessages, setErrorMessages] = useState<
    Array<{ id: string; message: string; userMessageId?: string }>
  >([]);
  const [messages, setMessages] = useState<UIMessage[]>(initialMessages);
  const [status, setStatus] = useState<"ready" | "submitted" | "streaming">(
    "ready"
  );
  const [streamDebugText, setStreamDebugText] = useState<string>("");
  const [triggerRealtime, setTriggerRealtime] =
    useState<TriggerRealtimeSession | null>(null);
  const activeAssistantMessageIdRef = useRef<string | null>(null);
  const lastEventIdRef = useRef<number>(0);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const streamInitializedRef = useRef(false);
  const streamConnectionIdRef = useRef(0);
  const toolErrorKeysRef = useRef<Set<string>>(new Set());
  const turnFetchAbortRef = useRef<AbortController | null>(null);
  const activeTurnRunIdRef = useRef<string | null>(null);
  const reconnectStreamRef = useRef<(() => void) | null>(null);
  const drainTriggerStreamRef = useRef<(() => void) | null>(null);
  const triggerStreamPartsRef = useRef<ChatTurnRealtimeStreamPart[]>([]);
  const statusRef = useRef(status);
  const chatIdRef = useRef(chatId);
  const lastStreamEventAtRef = useRef<number | null>(null);
  const lastTextDeltaAtRef = useRef<number | null>(null);
  const textDeltaCounterRef = useRef(0);
  const lastDebugUiUpdateAtRef = useRef(0);
  const {
    streams: triggerRealtimeStreams,
    error: triggerRealtimeError,
  } = useRealtimeRunWithStreams(triggerRealtime?.runId ?? "", {
    accessToken: triggerRealtime?.accessToken ?? "",
    enabled: Boolean(
      FORCE_TRIGGER_REALTIME_STREAM &&
        triggerRealtime?.runId &&
        triggerRealtime?.accessToken
    ),
    throttleInMs: 24,
  });
  const triggerStreamParts = (
    triggerRealtimeStreams?.[CHAT_TURN_TRIGGER_STREAM_KEY] ?? []
  ) as ChatTurnRealtimeStreamPart[];
  useEffect(() => {
    statusRef.current = status;
  }, [status]);
  useEffect(() => {
    chatIdRef.current = chatId;
  }, [chatId]);
  const loadMessages = useCallback(async () => {
    if (!chatId) return;
    const res = await fetch(
      `/api/chats/${encodeURIComponent(chatId)}/messages`
    );
    if (!res.ok) {
      throw new Error("Failed to load chat messages");
    }
    const data = await res.json();
    setMessages(Array.isArray(data?.messages) ? data.messages : []);
  }, [chatId]);

  const pushStreamDebug = useCallback((event: ChatStreamDebugEvent) => {
    if (!CHAT_STREAM_DEBUG_ENABLED) return;

    const details = {
      chatId: chatIdRef.current,
      status: statusRef.current,
      runId: activeTurnRunIdRef.current,
      ...event,
    };
    try {
      console.debug(`[chat-stream-debug:client] ${JSON.stringify(details)}`);
    } catch {
      console.debug("[chat-stream-debug:client]", details);
    }

    const now = Date.now();
    if (now - lastDebugUiUpdateAtRef.current < 220) return;
    lastDebugUiUpdateAtRef.current = now;

    const lagPart =
      typeof event.lagMs === "number" ? `lag=${event.lagMs}ms` : "lag=n/a";
    const gapPart =
      typeof event.gapMs === "number" ? `gap=${event.gapMs}ms` : "gap=n/a";
    const part = `[${event.eventType}] ${lagPart} ${gapPart}`;
    const note = event.note ? ` ${event.note}` : "";
    setStreamDebugText(`${part}${note}`);
  }, []);
  useEffect(() => {
    triggerStreamPartsRef.current = Array.isArray(triggerStreamParts)
      ? triggerStreamParts
      : [];
    if (drainTriggerStreamRef.current) {
      drainTriggerStreamRef.current();
    }
  }, [triggerStreamParts]);
  useEffect(() => {
    if (triggerRealtimeError) {
      pushStreamDebug({
        eventType: "trigger_realtime_error",
        note: triggerRealtimeError.message,
      });
    }
  }, [triggerRealtimeError, pushStreamDebug]);

  const buildUserMessageParts = (
    text: string,
    attachments: PendingAttachment[]
  ): UIMessage["parts"] => {
    const parts: UIMessage["parts"] = [];

    if (text.trim()) {
      parts.push({ type: "text", text: text.trim() });
    }

    for (const attachment of attachments) {
      parts.push({
        type: "file",
        url: attachment.blobUrl,
        mediaType: attachment.mimeType,
        filename: attachment.alias,
        assetId: attachment.id,
        assetAlias: attachment.alias,
        assetIntent: attachment.intent,
        altHint: attachment.altHint ?? undefined,
        label: attachment.label ?? undefined,
      } as UIMessage["parts"][number]);
    }

    return parts;
  };

  const getRetryableUserParts = (message: UIMessage): UIMessage["parts"] =>
    message.parts.filter(
      (part) => part.type === "text" || part.type === "file"
    ) as UIMessage["parts"];

  useEffect(() => {
    setMessages((prev) => {
      if (initialMessages.length === 0 && prev.length > 0) {
        return prev;
      }
      return initialMessages;
    });
  }, [initialMessages]);

  const enqueueTurnRun = useCallback(
    async (parts: UIMessage["parts"]) => {
      if (!chatId || parts.length === 0) return;

      const userMessageId = `local-user-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2)}`;
      const assistantMessageId = `local-assistant-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2)}`;
      activeAssistantMessageIdRef.current = assistantMessageId;

      setMessages((prev) => [
        ...prev,
        {
          id: userMessageId,
          role: "user",
          parts,
        },
        {
          id: assistantMessageId,
          role: "assistant",
          parts: [{ type: "text", text: "" }],
        },
      ]);

      setStatus("submitted");

      const idempotencyKey = `turn-${chatId}-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 10)}`;
      const enqueueStartedAt = Date.now();

      const ac = new AbortController();
      turnFetchAbortRef.current = ac;
      activeTurnRunIdRef.current = null;

      try {
        const response = await fetch(
          `/api/chats/${encodeURIComponent(chatId)}/turn-runs`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            signal: ac.signal,
            body: JSON.stringify({
              payload: {
                chatId,
                messages: [{ role: "user", parts }],
              },
              idempotencyKey,
            }),
          }
        );

        if (!response.ok) {
          const data = await response.json().catch(() => null);
          if (
            response.status === 402 ||
            data?.code === "INSUFFICIENT_CREDITS"
          ) {
            setMessages((prev) =>
              prev.filter(
                (m) => m.id !== userMessageId && m.id !== assistantMessageId
              )
            );
            setShowCreditsLimitModal(true);
            void mutateBilling();
            setStatus("ready");
            return;
          }
          if (
            response.status === 429 ||
            data?.code === "TOO_MANY_ACTIVE_REQUESTS"
          ) {
            setMessages((prev) =>
              prev.filter(
                (m) => m.id !== userMessageId && m.id !== assistantMessageId
              )
            );
            toast.warning(
              "Max 3 requests at once. Please wait for one to finish."
            );
            setStatus("ready");
            return;
          }
          const errMsg = normalizeErrorMessage(
            data?.error ?? data,
            `Failed to queue generation (${response.status})`
          );
          setErrorMessages((prev) => [
            ...prev,
            {
              id: `error-${Date.now()}-${Math.random()}`,
              message: errMsg,
              userMessageId,
            },
          ]);
          setStatus("ready");
          return;
        }

        const data = await response.json().catch(() => null);
        const runId =
          data &&
          typeof data === "object" &&
          data.run &&
          typeof (data as { run: { id?: unknown } }).run.id === "string"
            ? (data as { run: { id: string } }).run.id
            : null;
        if (runId) {
          activeTurnRunIdRef.current = runId;
        }
        const realtime =
          data &&
          typeof data === "object" &&
          data.triggerRealtime &&
          typeof (data as { triggerRealtime?: { runId?: unknown } })
            .triggerRealtime?.runId === "string" &&
          typeof (data as { triggerRealtime?: { accessToken?: unknown } })
            .triggerRealtime?.accessToken === "string"
            ? (data as {
                triggerRealtime: { runId: string; accessToken: string };
              }).triggerRealtime
            : null;
        if (realtime && chatId) {
          setTriggerRealtime(realtime);
          window.sessionStorage.setItem(
            buildTriggerRealtimeSessionStorageKey(chatId, realtime.runId),
            realtime.accessToken
          );
          pushStreamDebug({
            eventType: "trigger_realtime_armed",
            note: `runId=${realtime.runId}`,
          });
        } else {
          pushStreamDebug({
            eventType: "trigger_realtime_missing",
            note: "No realtime credentials returned; fallback to SSE",
          });
        }
        pushStreamDebug({
          eventType: "turn_run_accepted",
          note: `requestMs=${Date.now() - enqueueStartedAt}`,
        });
        setStatus("streaming");
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          try {
            await fetch(
              `/api/chats/${encodeURIComponent(chatId)}/turn-runs/cancel`,
              { method: "POST" }
            );
          } catch {
            // ignore
          }
          setMessages((prev) =>
            prev.filter(
              (m) => m.id !== userMessageId && m.id !== assistantMessageId
            )
          );
          setStatus("ready");
          activeAssistantMessageIdRef.current = null;
          hidePreviewLoader();
          return;
        }
        const errMsg = normalizeErrorMessage(err, "Failed to queue generation");
        pushStreamDebug({
          eventType: "turn_run_failed",
          note: errMsg,
        });
        setErrorMessages((prev) => [
          ...prev,
          {
            id: `error-${Date.now()}-${Math.random()}`,
            message: errMsg,
            userMessageId,
          },
        ]);
        setStatus("ready");
      } finally {
        turnFetchAbortRef.current = null;
      }
    },
    [chatId, mutateBilling, pushStreamDebug]
  );

  useEffect(() => {
    if (
      chatId &&
      pendingMessage &&
      pendingMessage.chatId === chatId &&
      status === "ready"
    ) {
      const consumedStorageKey = `pending-consumed:${pendingMessage.id}`;
      const alreadyConsumedInSession =
        typeof window !== "undefined" &&
        window.sessionStorage.getItem(consumedStorageKey) === "1";
      if (
        consumedPendingIdsRef.current.has(pendingMessage.id) ||
        alreadyConsumedInSession
      ) {
        return;
      }

      if (isBillingLoading && billing == null) {
        return;
      }
      if (billing == null && billingError) {
        return;
      }

      if (!hasCredits) {
        consumedPendingIdsRef.current.add(pendingMessage.id);
        if (typeof window !== "undefined") {
          window.sessionStorage.setItem(consumedStorageKey, "1");
        }
        setPendingMessage(null);
        setShowCreditsLimitModal(true);
        return;
      }

      consumedPendingIdsRef.current.add(pendingMessage.id);
      if (typeof window !== "undefined") {
        window.sessionStorage.setItem(consumedStorageKey, "1");
      }
      setPendingMessage(null);

      const parts: UIMessage["parts"] = [];
      if (pendingMessage.message.trim()) {
        parts.push({ type: "text", text: pendingMessage.message.trim() });
      }
      if (Array.isArray(pendingMessage.attachments)) {
        for (const attachment of pendingMessage.attachments) {
          parts.push({
            type: "file",
            url: attachment.blobUrl,
            mediaType: attachment.mimeType,
            filename: attachment.alias,
            assetId: attachment.id,
            assetAlias: attachment.alias,
            assetIntent: attachment.intent,
            altHint: attachment.altHint ?? undefined,
            label: attachment.label ?? undefined,
          } as UIMessage["parts"][number]);
        }
      }
      if (parts.length === 0) return;
      lastUserMessagePartsRef.current = parts;
      void enqueueTurnRun(parts);
    }
  }, [
    chatId,
    pendingMessage,
    messages.length,
    status,
    enqueueTurnRun,
    setPendingMessage,
    billing,
    billingError,
    isBillingLoading,
  ]);

  const isLoading = status === "streaming" || status === "submitted";

  const handleAttachmentUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    if (!chatId) {
      setAttachmentError("Please wait for the chat to initialize.");
      return;
    }

    setAttachmentError(null);
    setIsUploadingAttachments(true);

    try {
      const selectedFiles = Array.from(files);
      if (uploadToastTimerRef.current != null) {
        window.clearTimeout(uploadToastTimerRef.current);
        uploadToastTimerRef.current = null;
      }
      setUploadToast({
        status: "uploading",
        total: selectedFiles.length,
        completed: 0,
      });
      const optimisticAttachments: PendingAttachment[] = selectedFiles.map(
        (file) => ({
          localId: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          id: null,
          alias: file.name || "image",
          blobUrl: URL.createObjectURL(file),
          mimeType: file.type || "image/png",
          intent: "site_asset",
          isUploading: true,
        })
      );

      setPendingAttachments((prev) => [...prev, ...optimisticAttachments]);

      const uploads = optimisticAttachments.map(async (attachment, index) => {
        const file = selectedFiles[index];
        try {
          const formData = new FormData();
          formData.append("chatId", chatId);
          formData.append("file", file);
          formData.append("intent", "site_asset");

          const res = await fetch("/api/site-assets", {
            method: "POST",
            body: formData,
          });

          const data = await res.json().catch(() => null);
          if (!res.ok || !data?.asset) {
            throw new Error(
              data?.error || `Failed to upload ${file.name || "image"}`
            );
          }

          return {
            localId: attachment.localId,
            asset: data.asset as Omit<
              PendingAttachment,
              "localId" | "isUploading"
            >,
          };
        } finally {
          setUploadToast((prev) => {
            if (!prev || prev.status !== "uploading") return prev;
            return {
              ...prev,
              completed: Math.min(prev.total, prev.completed + 1),
            };
          });
        }
      });

      const settled = await Promise.allSettled(uploads);
      const uploadErrors: string[] = [];

      setPendingAttachments((prev) => {
        let next = [...prev];

        for (const result of settled) {
          if (result.status === "fulfilled") {
            const { localId, asset } = result.value;
            next = next.map((item) => {
              if (item.localId !== localId) return item;
              if (item.blobUrl.startsWith("blob:")) {
                URL.revokeObjectURL(item.blobUrl);
              }
              return {
                ...asset,
                localId,
                isUploading: false,
              };
            });
          } else {
            const message =
              result.reason instanceof Error
                ? result.reason.message
                : "Failed to upload image.";
            uploadErrors.push(message);
          }
        }

        const failedLocalIds = new Set<string>();
        settled.forEach((result, index) => {
          if (result.status === "rejected") {
            const localId = optimisticAttachments[index]?.localId;
            if (localId) failedLocalIds.add(localId);
          }
        });

        for (const item of next) {
          if (
            failedLocalIds.has(item.localId) &&
            item.blobUrl.startsWith("blob:")
          ) {
            URL.revokeObjectURL(item.blobUrl);
          }
        }

        return next.filter((item) => !failedLocalIds.has(item.localId));
      });

      if (uploadErrors.length > 0) {
        setAttachmentError(uploadErrors[0]);
        setUploadToast({
          status: "error",
          total: selectedFiles.length,
          completed: selectedFiles.length,
          message: uploadErrors[0],
        });
        scheduleUploadToastHide(3500);
      } else {
        setUploadToast({
          status: "success",
          total: selectedFiles.length,
          completed: selectedFiles.length,
          message:
            selectedFiles.length === 1
              ? "Upload complete."
              : "All files uploaded.",
        });
        scheduleUploadToastHide(1800);
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to upload image.";
      setAttachmentError(message);
      setUploadToast({
        status: "error",
        total: 1,
        completed: 1,
        message,
      });
      scheduleUploadToastHide(3500);
    } finally {
      setIsUploadingAttachments(false);
    }
  };

  const handleAttachmentIntentChange = async (
    assetId: number,
    intent: PendingAttachment["intent"]
  ) => {
    if (!chatId) return;

    const current = pendingAttachments.find((asset) => asset.id === assetId);
    if (!current || current.intent === intent) return;

    setAttachmentError(null);
    setPendingAttachments((prev) =>
      prev.map((asset) => (asset.id === assetId ? { ...asset, intent } : asset))
    );

    const res = await fetch("/api/site-assets", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: assetId,
        chatId,
        intent,
      }),
    });

    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.asset) {
      setPendingAttachments((prev) =>
        prev.map((asset) =>
          asset.id === assetId ? { ...asset, intent: current.intent } : asset
        )
      );
      setAttachmentError(data?.error || "Failed to update image usage intent.");
    }
  };

  const handleRemovePendingAttachment = (localId: string) => {
    setPendingAttachments((prev) => {
      const target = prev.find((asset) => asset.localId === localId);
      if (target?.blobUrl.startsWith("blob:")) {
        URL.revokeObjectURL(target.blobUrl);
      }
      return prev.filter((asset) => asset.localId !== localId);
    });
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (
      (input.trim().length === 0 && pendingAttachments.length === 0) ||
      isLoading ||
      isUploadingAttachments ||
      !chatId
    ) {
      return;
    }

    if (isBillingLoading && billing == null) {
      return;
    }

    if (!hasCredits) {
      setShowCreditsLimitModal(true);
      return;
    }

    const message = input.trim();
    const readyAttachments = pendingAttachments.filter((a) => a.id != null);
    const parts = buildUserMessageParts(message, readyAttachments);
    lastUserMessageRef.current = message;
    lastUserMessagePartsRef.current = parts;
    setInput("");
    setPendingAttachments((prev) => {
      for (const attachment of prev) {
        if (attachment.blobUrl.startsWith("blob:")) {
          URL.revokeObjectURL(attachment.blobUrl);
        }
      }
      return [];
    });
    setAttachmentError(null);
    void enqueueTurnRun(parts);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
  };

  const handleRetry = (errorMessageId: string) => {
    if (isLoading) return;
    if (isBillingLoading && billing == null) return;

    const errorMsg = errorMessages.find((e) => e.id === errorMessageId);
    if (!errorMsg) return;

    let messageToRetry = lastUserMessageRef.current;
    let partsToRetry = lastUserMessagePartsRef.current;

    if (errorMsg.userMessageId) {
      const userMessage = messages.find((m) => m.id === errorMsg.userMessageId);
      if (userMessage) {
        partsToRetry = getRetryableUserParts(userMessage);
        messageToRetry =
          userMessage.parts
            .filter((p) => p.type === "text")
            .map((p) => (p as { text: string }).text)
            .join("") || messageToRetry;
      }
    }

    if (!messageToRetry && partsToRetry.length === 0) return;

    if (!hasCredits) {
      setShowCreditsLimitModal(true);
      return;
    }

    setErrorMessages((prev) => prev.filter((e) => e.id !== errorMessageId));
    lastUserMessagePartsRef.current = partsToRetry;
    void enqueueTurnRun(partsToRetry);
  };

  const handleStopGeneration = useCallback(() => {
    if (!chatId) return;

    turnFetchAbortRef.current?.abort();

    void (async () => {
      try {
        if (activeTurnRunIdRef.current) {
          await fetch(
            `/api/chats/${encodeURIComponent(chatId)}/turn-runs/${encodeURIComponent(activeTurnRunIdRef.current)}`,
            { method: "DELETE" }
          );
        } else {
          await fetch(
            `/api/chats/${encodeURIComponent(chatId)}/turn-runs/cancel`,
            { method: "POST" }
          );
        }
      } catch {
        // ignore network errors; local UI still resets
      } finally {
        activeTurnRunIdRef.current = null;
      }
    })();

    streamConnectionIdRef.current += 1;
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    if (reconnectTimerRef.current != null) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    reconnectStreamRef.current?.();
    pushStreamDebug({
      eventType: "stop_generation",
      note: "User canceled generation",
    });

    setTriggerRealtime(null);
    setStatus("ready");
    hidePreviewLoader();
    activeAssistantMessageIdRef.current = null;
    void loadMessages();
  }, [
    chatId,
    loadMessages,
    pushStreamDebug,
    triggerRealtime?.runId,
    triggerRealtime?.accessToken,
  ]);

  useEffect(() => {
    if (!chatId) return;

    let cancelled = false;
    let processedTriggerParts = 0;
    let terminalEventPending: null | "completed" | "failed" | "canceled" = null;
    let pendingFailureMessage: string | null = null;
    streamInitializedRef.current = false;
    lastEventIdRef.current = 0;
    lastStreamEventAtRef.current = null;
    lastTextDeltaAtRef.current = null;
    textDeltaCounterRef.current = 0;
    pushStreamDebug({
      eventType: "stream_bootstrap",
      note: "Initializing SSE stream lifecycle",
    });
    const shouldUseTriggerRealtime = Boolean(
      FORCE_TRIGGER_REALTIME_STREAM &&
        triggerRealtime?.runId &&
        triggerRealtime?.accessToken
    );

    const TRACKED_PROGRESS_TOOLS = new Set([
      "create_site",
      "create_section",
      "resolve_image_slots",
      "validate_completeness",
    ]);
    const NAVBAR_VIRTUAL_KEY = "virtual:section:navbar";
    const FOOTER_VIRTUAL_KEY = "virtual:section:footer";
    type ProgressStepKind =
      | "section"
      | "layout"
      | "assets"
      | "validation"
      | "other";
    const STEP_WEIGHT: Record<ProgressStepKind, number> = {
      section: 1.35,
      layout: 0.75,
      assets: 0.45,
      validation: 0.8,
      other: 0.65,
    };
    const STEP_DURATION_MS: Record<ProgressStepKind, number> = {
      section: 30_000,
      layout: 12_000,
      assets: 10_000,
      validation: 8_000,
      other: 12_000,
    };
    const BASELINE_TOTAL_SECTION_STEPS = 10;
    const plannedStepKeys: string[] = [];
    const plannedStepSet = new Set<string>();
    const stepLabelsByKey = new Map<string, string>();
    const stepKindByKey = new Map<string, ProgressStepKind>();
    const stepStartedAtByKey = new Map<string, number>();
    const stepVerbByKey = new Map<string, "Building" | "Generating">();
    const completedStepSet = new Set<string>();
    const stepKeyByToolCallId = new Map<string, string>();
    let activeStepKey: string | null = null;
    let sawCompletenessCheck = false;
    let progressTickerId: number | null = null;
    let hasBuilderActivity = false;

    const clamp01 = (value: number): number => {
      if (!Number.isFinite(value)) return 0;
      return Math.min(1, Math.max(0, value));
    };

    const humanizeFileName = (value: string): string => {
      const withSpaces = value
        .replace(/\.[a-z0-9]+$/i, "")
        .replace(/[-_]+/g, " ")
        .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
        .replace(/\s+/g, " ")
        .trim();
      if (!withSpaces) return value;
      return withSpaces.charAt(0).toUpperCase() + withSpaces.slice(1);
    };

    const getStepLabel = (toolName: string, destination?: string): string => {
      if (typeof destination === "string" && destination.trim()) {
        const parts = destination.split("/");
        const fileName = parts[parts.length - 1] || "";
        if (fileName) {
          if (fileName.toLowerCase().startsWith("index.")) {
            return "App layout";
          }
          return humanizeFileName(fileName);
        }
      }

      if (toolName === "validate_completeness") return "Completeness check";
      if (toolName === "resolve_image_slots") return "Visuals";
      if (toolName === "create_site") return "App layout";
      if (toolName === "create_section") return "Section";
      return "Layout";
    };

    const inferStepKind = (
      toolName: string,
      destination?: string
    ): ProgressStepKind => {
      const d =
        typeof destination === "string" ? destination.toLowerCase() : "";
      if (toolName === "create_site") {
        return "section";
      }
      if (toolName === "create_section" || d.includes("/sections/")) {
        return "section";
      }
      if (d.endsWith("/index.tsx")) {
        return "layout";
      }
      if (toolName === "resolve_image_slots") {
        return "assets";
      }
      if (toolName === "validate_completeness") {
        return "validation";
      }
      return "other";
    };

    const getStepWeight = (stepKey: string): number =>
      STEP_WEIGHT[stepKindByKey.get(stepKey) ?? "other"];

    const isSectionLikeLabel = (label: string): boolean => {
      const normalized = label.trim().toLowerCase();
      if (!normalized) return false;
      if (normalized.includes("section")) return true;
      return (
        normalized === "navbar" ||
        normalized === "footer" ||
        normalized === "hero" ||
        normalized === "about" ||
        normalized === "features" ||
        normalized === "products" ||
        normalized === "process" ||
        normalized === "testimonials" ||
        normalized === "cta"
      );
    };

    const pickVerbForStep = (stepKey: string): "Building" | "Generating" => {
      const existing = stepVerbByKey.get(stepKey);
      if (existing) return existing;
      let hash = 0;
      for (let i = 0; i < stepKey.length; i += 1) {
        hash = (hash * 31 + stepKey.charCodeAt(i)) >>> 0;
      }
      const verb: "Building" | "Generating" =
        hash % 2 === 0 ? "Building" : "Generating";
      stepVerbByKey.set(stepKey, verb);
      return verb;
    };

    const formatStepStatusText = (stepKey: string | null): string => {
      if (!stepKey) return "Building layout";
      const label = (stepLabelsByKey.get(stepKey) || "layout").trim();
      const kind = stepKindByKey.get(stepKey) ?? "other";
      const verb = pickVerbForStep(stepKey);

      if (kind === "validation") {
        return "Running completeness check";
      }
      if (kind === "assets") {
        return `${verb} visuals`;
      }
      if (kind === "section" || isSectionLikeLabel(label)) {
        const withSectionSuffix = /section$/i.test(label)
          ? label
          : `${label} section`;
        return `${verb} ${withSectionSuffix}`;
      }
      return `${verb} ${label}`;
    };

    const ensureVirtualStep = (
      stepKey: string,
      label: string,
      kind: ProgressStepKind
    ) => {
      if (plannedStepSet.has(stepKey)) return;
      plannedStepSet.add(stepKey);
      plannedStepKeys.push(stepKey);
      stepLabelsByKey.set(stepKey, label);
      stepKindByKey.set(stepKey, kind);
    };

    const syncVirtualSectionCompletionFromLabel = (label: string) => {
      const normalized = label.trim().toLowerCase();
      if (normalized === "navbar" || normalized.includes("navbar")) {
        completedStepSet.add(NAVBAR_VIRTUAL_KEY);
      }
      if (normalized === "footer" || normalized.includes("footer")) {
        completedStepSet.add(FOOTER_VIRTUAL_KEY);
      }
    };

    const startProgressTicker = () => {
      if (progressTickerId != null) return;
      progressTickerId = window.setInterval(() => {
        emitPreviewProgress();
      }, 900);
    };

    const stopProgressTicker = () => {
      if (progressTickerId == null) return;
      window.clearInterval(progressTickerId);
      progressTickerId = null;
    };

    const beginBuilderPreviewProgress = () => {
      if (hasBuilderActivity) return;
      hasBuilderActivity = true;
      ensureVirtualStep(NAVBAR_VIRTUAL_KEY, "Navbar", "section");
      ensureVirtualStep(FOOTER_VIRTUAL_KEY, "Footer", "section");
      startProgressTicker();
      showPreviewLoader("Planning landing page...", {
        progress: 0,
        completedSteps: 0,
        totalSteps: plannedStepKeys.length + 1,
        currentStep: "Planning landing page...",
      });
    };

    const ensureProgressStep = (
      toolName: string,
      toolCallId: string,
      destination?: string
    ): string => {
      const normalizedCallId = toolCallId.trim();
      const existingKey =
        normalizedCallId && stepKeyByToolCallId.has(normalizedCallId)
          ? stepKeyByToolCallId.get(normalizedCallId)!
          : null;

      const inferredLabel = getStepLabel(toolName, destination);
      const inferredKind = inferStepKind(toolName, destination);
      if (existingKey) {
        stepLabelsByKey.set(existingKey, inferredLabel);
        stepKindByKey.set(existingKey, inferredKind);
        return existingKey;
      }

      const fallbackKey = `${toolName}:${destination || inferredLabel}:${plannedStepKeys.length}`;
      const key = normalizedCallId || fallbackKey;
      if (!plannedStepSet.has(key)) {
        plannedStepSet.add(key);
        plannedStepKeys.push(key);
      }
      stepLabelsByKey.set(key, inferredLabel);
      stepKindByKey.set(key, inferredKind);
      if (normalizedCallId) {
        stepKeyByToolCallId.set(normalizedCallId, key);
      }
      return key;
    };

    const emitPreviewProgress = (messageOverride?: string) => {
      const discoveredSteps = plannedStepKeys.length;
      const discoveredSectionSteps = plannedStepKeys.filter(
        (key) => (stepKindByKey.get(key) ?? "other") === "section"
      ).length;
      const predictedRemainingSectionSteps = Math.max(
        0,
        BASELINE_TOTAL_SECTION_STEPS - discoveredSectionSteps
      );
      const totalSteps = Math.max(
        1,
        discoveredSteps +
          predictedRemainingSectionSteps +
          (sawCompletenessCheck ? 0 : 1)
      );
      const reservedCompletenessWeight = sawCompletenessCheck
        ? 0
        : STEP_WEIGHT.validation;
      const baseTotalWeight = plannedStepKeys.reduce(
        (sum, key) => sum + getStepWeight(key),
        0
      );
      const predictedRemainingWeight =
        predictedRemainingSectionSteps * STEP_WEIGHT.section;
      const totalWeight = Math.max(
        0.0001,
        baseTotalWeight + predictedRemainingWeight + reservedCompletenessWeight
      );
      const completedWeight = plannedStepKeys.reduce((sum, key) => {
        if (!completedStepSet.has(key)) return sum;
        return sum + getStepWeight(key);
      }, 0);
      let inFlightWeight = 0;
      if (activeStepKey && !completedStepSet.has(activeStepKey)) {
        const kind = stepKindByKey.get(activeStepKey) ?? "other";
        const startedAt = stepStartedAtByKey.get(activeStepKey) ?? Date.now();
        const elapsed = Math.max(0, Date.now() - startedAt);
        const fractional = Math.min(
          0.92,
          clamp01(elapsed / STEP_DURATION_MS[kind])
        );
        inFlightWeight = getStepWeight(activeStepKey) * fractional;
      }
      const progress = clamp01(
        (completedWeight + inFlightWeight) / totalWeight
      );
      const completedSteps = Math.min(completedStepSet.size, discoveredSteps);
      const currentStepLabel =
        messageOverride ||
        formatStepStatusText(activeStepKey) ||
        "Building layout";

      showPreviewLoader(currentStepLabel, {
        progress,
        completedSteps,
        totalSteps,
        currentStep: currentStepLabel,
      });
    };

    const upsertAssistantText = (deltaText: string) => {
      const text = String(deltaText || "");
      if (!text) return;
      const assistantId =
        activeAssistantMessageIdRef.current ||
        `local-assistant-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      activeAssistantMessageIdRef.current = assistantId;

      setMessages((prev) => {
        const idx = prev.findIndex((m) => m.id === assistantId);
        if (idx === -1) {
          return [
            ...prev,
            {
              id: assistantId,
              role: "assistant",
              parts: [{ type: "text", text }],
            },
          ];
        }
        const next = [...prev];
        const message = { ...next[idx] };
        const parts = [...message.parts];
        const lastPart = parts[parts.length - 1];
        if (!lastPart || lastPart.type !== "text") {
          parts.push({ type: "text", text });
        } else {
          const existing = (lastPart as { type: "text"; text: string }).text;
          parts[parts.length - 1] = {
            type: "text",
            text: `${existing}${text}`,
          };
        }
        message.parts = parts;
        next[idx] = message;
        return next;
      });
    };

    const finalizeTerminalEventIfReady = () => {
      if (!terminalEventPending) return;

      const terminalType = terminalEventPending;
      terminalEventPending = null;

      if (terminalType === "completed") {
        activeTurnRunIdRef.current = null;
        setTriggerRealtime(null);
        const pendingPreview = pendingPreviewUpdateRef.current;
        if (
          pendingPreview &&
          chatId &&
          lastPreviewVersionIdRef.current !== pendingPreview.versionId
        ) {
          lastPreviewVersionIdRef.current = pendingPreview.versionId;
          updatePreviewPanel(
            pendingPreview.versionId,
            pendingPreview.versionNumber,
            chatId
          );
        }
        pendingPreviewUpdateRef.current = null;
        setStatus("ready");
        activeAssistantMessageIdRef.current = null;
        void loadMessages();
        return;
      }

      if (terminalType === "canceled") {
        activeTurnRunIdRef.current = null;
        setTriggerRealtime(null);
        pendingPreviewUpdateRef.current = null;
        setStatus("ready");
        activeAssistantMessageIdRef.current = null;
        void loadMessages();
        return;
      }

      pendingPreviewUpdateRef.current = null;
      activeTurnRunIdRef.current = null;
      setTriggerRealtime(null);
      setStatus("ready");
      activeAssistantMessageIdRef.current = null;
      const err = normalizeErrorMessage(
        pendingFailureMessage,
        "Generation failed"
      );
      pendingFailureMessage = null;
      setErrorMessages((prev) => [
        ...prev,
        {
          id: `error-${Date.now()}-${Math.random()}`,
          message: err,
        },
      ]);
    };

    const appendAssistantPart = (part: any) => {
      const assistantId =
        activeAssistantMessageIdRef.current ||
        `local-assistant-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      activeAssistantMessageIdRef.current = assistantId;
      setMessages((prev) => {
        const idx = prev.findIndex((m) => m.id === assistantId);
        if (idx === -1) {
          return [
            ...prev,
            { id: assistantId, role: "assistant", parts: [part] },
          ];
        }
        const next = [...prev];
        const message = { ...next[idx], parts: [...next[idx]!.parts, part] };
        next[idx] = message;
        return next;
      });
    };

    const restoreAssistantFromLiveState = (liveState: LiveTurnRunState) => {
      const assistantId = `live-assistant-${liveState.runId}`;
      activeAssistantMessageIdRef.current = assistantId;
      const assistantParts =
        Array.isArray(liveState.assistantParts) &&
        liveState.assistantParts.length > 0
          ? liveState.assistantParts
          : ([{ type: "text", text: "" }] as UIMessage["parts"]);

      setMessages((prev) => {
        const idx = prev.findIndex((m) => m.id === assistantId);
        if (idx === -1) {
          return [
            ...prev,
            {
              id: assistantId,
              role: "assistant",
              parts: assistantParts,
            },
          ];
        }

        const next = [...prev];
        next[idx] = {
          ...next[idx],
          role: "assistant",
          parts: assistantParts,
        };
        return next;
      });
    };

    const upsertAssistantToolCallPart = ({
      toolCallId,
      toolName,
      destination,
    }: {
      toolCallId: string;
      toolName: string;
      destination?: string;
    }) => {
      if (!toolCallId) {
        // Skip anonymous tool-call parts to avoid permanent fallback labels.
        return;
      }

      const assistantId =
        activeAssistantMessageIdRef.current ||
        `local-assistant-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      activeAssistantMessageIdRef.current = assistantId;

      setMessages((prev) => {
        const idx = prev.findIndex((m) => m.id === assistantId);
        if (idx === -1) {
          return [
            ...prev,
            {
              id: assistantId,
              role: "assistant",
              parts: [
                {
                  type: "tool-call",
                  toolCallId,
                  toolName,
                  args: destination ? { destination } : undefined,
                },
              ],
            } as any,
          ];
        }

        const next = [...prev];
        const message = { ...next[idx] };
        const parts = [...message.parts];
        const existingIdx = parts.findIndex(
          (p: any) => p?.type === "tool-call" && p?.toolCallId === toolCallId
        );

        if (existingIdx === -1) {
          parts.push({
            type: "tool-call",
            toolCallId,
            toolName,
            args: destination ? { destination } : undefined,
          } as any);
        } else {
          const existing = parts[existingIdx] as any;
          parts[existingIdx] = {
            ...existing,
            toolName:
              typeof existing?.toolName === "string" &&
              existing.toolName.length > 0 &&
              existing.toolName !== "unknown"
                ? existing.toolName
                : toolName,
            args:
              destination && (!existing?.args || !existing.args.destination)
                ? { ...(existing?.args ?? {}), destination }
                : existing?.args,
          } as any;
        }

        message.parts = parts;
        next[idx] = message;
        return next;
      });
    };

    const handleEnvelope = (envelope: StreamEnvelope) => {
      if (envelope.logicalEventId <= lastEventIdRef.current) return;

      const now = Date.now();
      const parsedCreatedAtMs = Date.parse(String(envelope.createdAt));
      const lagMs = Number.isFinite(parsedCreatedAtMs)
        ? Math.max(0, now - parsedCreatedAtMs)
        : null;
      const gapMs =
        lastStreamEventAtRef.current == null
          ? null
          : Math.max(0, now - lastStreamEventAtRef.current);
      lastStreamEventAtRef.current = now;

      lastEventIdRef.current = envelope.logicalEventId;

      const payload = envelope.payload ?? {};
      const eventType = envelope.eventType;
      if (eventType === "text_delta") {
        textDeltaCounterRef.current += 1;
        const textPart = String(payload.text ?? "");
        const textGapMs =
          lastTextDeltaAtRef.current == null
            ? null
            : Math.max(0, now - lastTextDeltaAtRef.current);
        lastTextDeltaAtRef.current = now;
        const shouldReportTextDelta =
          textDeltaCounterRef.current % 8 === 0 ||
          (typeof textGapMs === "number" && textGapMs >= 1000);
        if (shouldReportTextDelta) {
          pushStreamDebug({
            eventType,
            logicalEventId: envelope.logicalEventId,
            lagMs,
            gapMs: textGapMs,
            textDeltaChars: textPart.length,
            note:
              typeof textGapMs === "number" && textGapMs >= 1800
                ? "Large text gap detected"
                : undefined,
          });
        }
      } else {
        pushStreamDebug({
          eventType,
          logicalEventId: envelope.logicalEventId,
          lagMs,
          gapMs,
        });
      }

      if (eventType === "run_enqueued") {
        return;
      }
      if (eventType === "run_started") {
        setStatus("streaming");
        activeStepKey = null;
        plannedStepKeys.length = 0;
        plannedStepSet.clear();
        stepLabelsByKey.clear();
        stepKindByKey.clear();
        stepStartedAtByKey.clear();
        stepVerbByKey.clear();
        completedStepSet.clear();
        stepKeyByToolCallId.clear();
        sawCompletenessCheck = false;
        hasBuilderActivity = false;
        return;
      }
      if (eventType === "text_delta") {
        setStatus("streaming");
        upsertAssistantText(String(payload.text ?? ""));
        return;
      }
      if (eventType === "tool_call") {
        const toolCallId = String(payload.toolCallId ?? "");
        const toolName = String(payload.toolName ?? "unknown");
        const destination =
          typeof payload.destination === "string"
            ? payload.destination
            : undefined;
        upsertAssistantToolCallPart({
          toolCallId,
          toolName,
          destination,
        });
        if (TRACKED_PROGRESS_TOOLS.has(toolName)) {
          beginBuilderPreviewProgress();
          if (toolName === "validate_completeness") {
            sawCompletenessCheck = true;
          }
          activeStepKey = ensureProgressStep(toolName, toolCallId, destination);
          stepStartedAtByKey.set(activeStepKey, Date.now());
          emitPreviewProgress();
        }
        return;
      }
      if (eventType === "tool_result") {
        const toolCallId = String(payload.toolCallId ?? "");
        const toolName = String(payload.toolName ?? "unknown");
        const result = payload.result ?? null;
        const destination =
          typeof result?.destination === "string"
            ? String(result.destination)
            : undefined;
        if (toolCallId && destination) {
          upsertAssistantToolCallPart({
            toolCallId,
            toolName,
            destination,
          });
        }
        appendAssistantPart({
          type: "tool-result",
          toolCallId,
          toolName,
          result,
        });
        if (
          result?.success === false &&
          typeof result?.error === "string" &&
          result.error
        ) {
          const key = `${toolCallId || "tool"}:${result.error}`;
          if (!toolErrorKeysRef.current.has(key)) {
            toolErrorKeysRef.current.add(key);
            setErrorMessages((prev) => [
              ...prev,
              {
                id: `tool-error-${Date.now()}-${Math.random()}`,
                message: `Generation failed: ${result.error}`,
              },
            ]);
          }
        }
        if (TRACKED_PROGRESS_TOOLS.has(toolName)) {
          beginBuilderPreviewProgress();
          if (toolName === "validate_completeness") {
            sawCompletenessCheck = true;
          }
          const stepKey = ensureProgressStep(toolName, toolCallId, destination);
          const resolvedLabel = stepLabelsByKey.get(stepKey) ?? "";
          syncVirtualSectionCompletionFromLabel(resolvedLabel);
          completedStepSet.add(stepKey);
          if (activeStepKey === stepKey) {
            activeStepKey = null;
          }
          emitPreviewProgress();
        }
        return;
      }
      if (eventType === "preview_update") {
        const versionNumber = Number(payload.revisionNumber ?? 0);
        const versionId = Number(payload.revisionId ?? 0);
        if (versionId && versionNumber && chatId) {
          pendingPreviewUpdateRef.current = { versionId, versionNumber };
        }
        return;
      }
      if (eventType === "run_completed") {
        stopProgressTicker();
        if (hasBuilderActivity) {
          showPreviewLoader("Finalizing preview...", {
            progress: 1,
            completedSteps: Math.max(completedStepSet.size, 1),
            totalSteps: Math.max(completedStepSet.size, 1),
            currentStep: "Completeness check",
          });
          hidePreviewLoader();
        }
        terminalEventPending = "completed";
        finalizeTerminalEventIfReady();
        return;
      }
      if (eventType === "run_canceled") {
        stopProgressTicker();
        hidePreviewLoader();
        terminalEventPending = "canceled";
        finalizeTerminalEventIfReady();
        return;
      }
      if (eventType === "run_failed") {
        stopProgressTicker();
        hidePreviewLoader();
        pendingFailureMessage = normalizeErrorMessage(
          payload.error,
          "Generation failed"
        );
        terminalEventPending = "failed";
        finalizeTerminalEventIfReady();
      }
    };

    const drainTriggerStream = () => {
      if (!shouldUseTriggerRealtime || cancelled) return;
      const parts = triggerStreamPartsRef.current;
      if (!Array.isArray(parts) || parts.length === 0) return;
      if (processedTriggerParts < 0 || processedTriggerParts > parts.length) {
        processedTriggerParts = 0;
      }

      for (let i = processedTriggerParts; i < parts.length; i += 1) {
        const chunk = parts[i];
        if (!chunk || typeof chunk !== "object") continue;
        handleEnvelope({
          logicalEventId: Number(chunk.logicalEventId ?? 0),
          chatId: Number(chunk.chatId ?? 0),
          runId: String(chunk.runId ?? ""),
          eventType: String(chunk.eventType ?? ""),
          payload:
            chunk.payload && typeof chunk.payload === "object"
              ? chunk.payload
              : {},
          createdAt: String(chunk.createdAt ?? new Date().toISOString()),
        });
      }

      processedTriggerParts = parts.length;
    };

    const connect = (afterEventId: number) => {
      streamConnectionIdRef.current += 1;
      const connectionId = streamConnectionIdRef.current;
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      const source = new EventSource(
        `/api/chats/${encodeURIComponent(chatId)}/stream?afterEventId=${afterEventId}`
      );
      eventSourceRef.current = source;
      pushStreamDebug({
        eventType: "sse_connect",
        note: `connectionId=${connectionId}, afterEventId=${afterEventId}`,
      });

      const eventTypes = [
        "run_enqueued",
        "run_started",
        "text_delta",
        "tool_call",
        "tool_result",
        "preview_update",
        "run_completed",
        "run_failed",
        "run_canceled",
      ];

      const listener = (event: MessageEvent) => {
        if (connectionId !== streamConnectionIdRef.current) return;
        try {
          const envelope = JSON.parse(event.data) as StreamEnvelope;
          handleEnvelope(envelope);
        } catch {
          pushStreamDebug({
            eventType: "sse_parse_error",
            note: "Malformed SSE event payload",
          });
        }
      };

      for (const eventType of eventTypes) {
        source.addEventListener(eventType, listener as EventListener);
      }

      source.onopen = () => {
        if (connectionId !== streamConnectionIdRef.current) return;
        pushStreamDebug({
          eventType: "sse_open",
          note: `connectionId=${connectionId}`,
        });
      };

      source.onerror = () => {
        if (connectionId !== streamConnectionIdRef.current) return;
        pushStreamDebug({
          eventType: "sse_error",
          note: `connectionId=${connectionId}, reconnectInMs=1200`,
        });
        source.close();
        if (cancelled) return;
        reconnectTimerRef.current = window.setTimeout(() => {
          connect(lastEventIdRef.current);
        }, 1200);
      };
    };

    const bootstrap = async () => {
      if (!streamInitializedRef.current) {
        try {
          const bootstrapStartedAt = Date.now();
          const liveRes = await fetch(
            `/api/chats/${encodeURIComponent(chatId)}/turn-runs/live`
          );
          const liveData = await liveRes.json().catch(() => null);
          const liveState = liveData?.liveState as LiveTurnRunState | null;
          const liveRunId =
            liveData?.run && typeof liveData.run.id === "string"
              ? liveData.run.id
              : null;
          const liveTriggerRunId =
            liveData?.run && typeof liveData.run.triggerRunId === "string"
              ? liveData.run.triggerRunId
              : null;

          if (
            liveRes.ok &&
            liveState &&
            liveState.status === "running" &&
            typeof liveState.runId === "string"
          ) {
            restoreAssistantFromLiveState(liveState);
            activeTurnRunIdRef.current = liveRunId ?? liveState.runId;
            const snapshotEventId = Number(liveState.lastLogicalEventId ?? 0);
            if (Number.isFinite(snapshotEventId) && snapshotEventId > 0) {
              lastEventIdRef.current = snapshotEventId;
            }
            if (
              liveState.previewState?.revisionId &&
              liveState.previewState?.revisionNumber
            ) {
              pendingPreviewUpdateRef.current = {
                versionId: Number(liveState.previewState.revisionId),
                versionNumber: Number(liveState.previewState.revisionNumber),
              };
            }
            setStatus("streaming");
            if (
              FORCE_TRIGGER_REALTIME_STREAM &&
              liveTriggerRunId &&
              typeof window !== "undefined"
            ) {
              const storedAccessToken = window.sessionStorage.getItem(
                buildTriggerRealtimeSessionStorageKey(chatId, liveTriggerRunId)
              );
              if (storedAccessToken) {
                setTriggerRealtime({
                  runId: liveTriggerRunId,
                  accessToken: storedAccessToken,
                });
                pushStreamDebug({
                  eventType: "trigger_realtime_recovered",
                  note: `runId=${liveTriggerRunId}`,
                });
              } else {
                pushStreamDebug({
                  eventType: "trigger_realtime_missing",
                  note: `Missing token for runId=${liveTriggerRunId}; fallback SSE`,
                });
              }
            }
            pushStreamDebug({
              eventType: "live_state_bootstrap",
              logicalEventId: lastEventIdRef.current,
              note: `recovered=true requestMs=${Date.now() - bootstrapStartedAt}`,
            });
          } else {
            const res = await fetch(
              `/api/chats/${encodeURIComponent(chatId)}/turn-runs?latest=1`
            );
            const data = await res.json().catch(() => null);
            const latestId = Number(data?.event?.logicalEventId ?? 0);
            if (Number.isFinite(latestId) && latestId > 0) {
              lastEventIdRef.current = latestId;
            }
            pushStreamDebug({
              eventType: "live_state_bootstrap",
              logicalEventId: lastEventIdRef.current,
              note: `recovered=false requestMs=${Date.now() - bootstrapStartedAt}`,
            });
          }
        } catch {
          pushStreamDebug({
            eventType: "live_state_bootstrap_error",
            note: "Failed to bootstrap live state",
          });
          // fallback to 0 when latest lookup fails
        }
        streamInitializedRef.current = true;
      }
      if (shouldUseTriggerRealtime) {
        pushStreamDebug({
          eventType: "trigger_realtime_connected",
          note: `runId=${triggerRealtime?.runId}`,
        });
        drainTriggerStream();
      } else {
        connect(lastEventIdRef.current);
      }
    };

    void bootstrap();

    reconnectStreamRef.current = () => {
      void bootstrap();
    };
    drainTriggerStreamRef.current = drainTriggerStream;
    drainTriggerStream();

    return () => {
      cancelled = true;
      reconnectStreamRef.current = null;
      drainTriggerStreamRef.current = null;
      stopProgressTicker();
      pushStreamDebug({
        eventType: "stream_cleanup",
        note: "Chat stream effect cleanup",
      });
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (reconnectTimerRef.current != null) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
    };
  }, [chatId, loadMessages, pushStreamDebug]);

  useEffect(() => {
    const lastMessage = messages[messages.length - 1];
    if (lastMessage?.role === "user") {
      lastUserMessagePartsRef.current = getRetryableUserParts(lastMessage);
      const messageText = lastMessage.parts
        .filter((p) => p.type === "text")
        .map((p) => (p as { text: string }).text)
        .join("");
      if (messageText) {
        lastUserMessageRef.current = messageText;
      }
    }

    if (
      lastMessage?.role === "assistant" &&
      errorMessages.length > 0 &&
      status !== "streaming" &&
      status !== "submitted"
    ) {
      const lastUserMessage = [...messages]
        .reverse()
        .find((m) => m.role === "user");
      if (lastUserMessage) {
        setErrorMessages((prev) =>
          prev.filter((e) => e.userMessageId !== lastUserMessage.id)
        );
      }
    }
  }, [messages, errorMessages.length, status]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 min-h-0 overflow-hidden">
        {messages.length === 0 && errorMessages.length === 0 ? (
          <WelcomeMessage />
        ) : (
          <MessageList
            messages={messages}
            isLoading={isLoading}
            errorMessages={errorMessages}
            onRetry={handleRetry}
            chatId={providedChatId ?? chatId}
          />
        )}
      </div>
      <ChatInput
        input={input}
        handleSubmit={handleSubmit}
        handleInputChange={handleInputChange}
        isLoading={isLoading}
        onStop={handleStopGeneration}
        isUploadingAttachments={isUploadingAttachments}
        pendingAttachments={pendingAttachments}
        attachmentError={attachmentError}
        onFilesSelected={handleAttachmentUpload}
        onAttachmentIntentChange={handleAttachmentIntentChange}
        onAttachmentRemove={handleRemovePendingAttachment}
        captureGlobalTyping={Boolean(providedChatId)}
        onInsertText={insertTextFromGlobalKey}
      />
      {CHAT_STREAM_DEBUG_ENABLED ? (
        <div className="px-3 py-1 text-[11px] text-muted-foreground border-t border-border/40 font-mono">
          {streamDebugText || "stream debug enabled - waiting for events"}
        </div>
      ) : null}
      <CreditsLimitModal
        open={showCreditsLimitModal}
        onOpenChange={(open) => {
          setShowCreditsLimitModal(open);
          if (!open) mutateBilling();
        }}
      />
      <UploadProgressToast toast={uploadToast} />
    </div>
  );
}
