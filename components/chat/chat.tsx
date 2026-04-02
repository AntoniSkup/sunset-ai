"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import type { UIMessage } from "ai";
import useSWR from "swr";
import { WelcomeMessage } from "./welcome-message";
import { MessageList } from "./message-list";
import { ChatInput } from "./chat-input";
import { CreditsLimitModal } from "./credits-limit-modal";
import {
  UploadProgressToast,
  type UploadProgressToastState,
} from "./upload-progress-toast";
import { updatePreviewPanel } from "@/lib/preview/update-preview";
import { usePendingMessageStore } from "@/lib/stores/usePendingMessageStore";
import type { BillingApiResponse } from "@/app/api/billing/route";

const billingFetcher = (url: string) => fetch(url).then((res) => res.json());
const MIN_CREDITS_TO_SEND = 0.5;
const CHAT_PENDING_DEBUG_ENABLED =
  process.env.NEXT_PUBLIC_CHAT_DEBUG_PENDING === "1";
const CHAT_STREAM_CLIENT_DEBUG_ENABLED =
  process.env.NEXT_PUBLIC_CHAT_DEBUG_STREAM === "1";

function debugPendingFlow(message: string, payload?: Record<string, unknown>) {
  if (!CHAT_PENDING_DEBUG_ENABLED) return;
  if (payload) {
    console.log(`[chat-pending-debug] ${message}`, payload);
    return;
  }
  console.log(`[chat-pending-debug] ${message}`);
}

function debugChatStreamClient(
  message: string,
  payload?: Record<string, unknown>
) {
  if (!CHAT_STREAM_CLIENT_DEBUG_ENABLED) return;
  if (payload) {
    console.log(`[chat-stream-client] ${message}`, payload);
    return;
  }
  console.log(`[chat-stream-client] ${message}`);
}

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
      debugPendingFlow("ChatWithHistory initial pending snapshot", {
        chatId,
        pendingChatId: pending?.chatId ?? null,
        hasPending: Boolean(pending),
      });
      return pendingForMountRef.current ? [] : null;
    }
  );
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const hasPendingForThisChat = pendingForMountRef.current;
    debugPendingFlow("ChatWithHistory effect start", {
      chatId,
      pendingChatId:
        usePendingMessageStore.getState().pendingMessage?.chatId ?? null,
      hasPendingForThisChat,
    });
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
          debugPendingFlow("ChatWithHistory fetched history", {
            chatId,
            fetchedMessages: Array.isArray(data?.messages)
              ? data.messages.length
              : 0,
          });
          setInitialMessages(
            Array.isArray(data?.messages) ? data.messages : []
          );
        }
      } catch (e) {
        if (!cancelled) {
          debugPendingFlow("ChatWithHistory fetch failed", {
            chatId,
            error: e instanceof Error ? e.message : String(e),
          });
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
  const { data: billing, mutate: mutateBilling } = useSWR<BillingApiResponse>(
    "/api/billing",
    billingFetcher
  );
  const hasCredits =
    billing === undefined || Number(billing.balance) >= MIN_CREDITS_TO_SEND;

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
  const activeAssistantMessageIdRef = useRef<string | null>(null);
  const lastEventIdRef = useRef<number>(0);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const streamInitializedRef = useRef(false);
  const streamConnectionIdRef = useRef(0);
  const toolErrorKeysRef = useRef<Set<string>>(new Set());
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
      debugPendingFlow("enqueueTurnRun called", {
        chatId,
        partsCount: parts.length,
        textChars: parts
          .filter((p) => p.type === "text")
          .map((p) => (p as { type: "text"; text: string }).text)
          .join("").length,
      });

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

      const response = await fetch(
        `/api/chats/${encodeURIComponent(chatId)}/turn-runs`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
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
        const errMsg =
          data?.error || `Failed to queue generation (${response.status})`;
        setErrorMessages((prev) => [
          ...prev,
          {
            id: `error-${Date.now()}-${Math.random()}`,
            message: errMsg,
            userMessageId,
          },
        ]);
        setStatus("ready");
        debugPendingFlow("enqueueTurnRun failed", {
          chatId,
          status: response.status,
          error: errMsg,
        });
        return;
      }

      await response.json().catch(() => null);
      debugPendingFlow("enqueueTurnRun accepted", {
        chatId,
      });
      setStatus("streaming");
    },
    [chatId]
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
      debugPendingFlow("pending consume effect candidate", {
        chatId,
        pendingId: pendingMessage.id,
        pendingChatId: pendingMessage.chatId,
        currentMessages: messages.length,
        status,
        alreadyConsumedInSession,
      });
      if (
        consumedPendingIdsRef.current.has(pendingMessage.id) ||
        alreadyConsumedInSession
      ) {
        return;
      }

      if (!hasCredits) {
        consumedPendingIdsRef.current.add(pendingMessage.id);
        if (typeof window !== "undefined") {
          window.sessionStorage.setItem(consumedStorageKey, "1");
        }
        setPendingMessage(null);
        setShowCreditsLimitModal(true);
        debugPendingFlow("pending blocked by credits", {
          chatId,
          pendingId: pendingMessage.id,
        });
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
      debugPendingFlow("pending consumed -> enqueue", {
        chatId,
        pendingId: pendingMessage.id,
        partsCount: parts.length,
      });
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

    setErrorMessages((prev) => prev.filter((e) => e.id !== errorMessageId));
    lastUserMessagePartsRef.current = partsToRetry;
    void enqueueTurnRun(partsToRetry);
  };

  useEffect(() => {
    if (!chatId) return;

    let cancelled = false;
    let terminalEventPending: null | "completed" | "failed" = null;
    let pendingFailureMessage: string | null = null;
    streamInitializedRef.current = false;
    lastEventIdRef.current = 0;

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

      pendingPreviewUpdateRef.current = null;
      setStatus("ready");
      activeAssistantMessageIdRef.current = null;
      const err = pendingFailureMessage || "Generation failed";
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
      lastEventIdRef.current = envelope.logicalEventId;

      const payload = envelope.payload ?? {};
      const eventType = envelope.eventType;

      if (eventType === "run_enqueued") {
        return;
      }
      if (eventType === "run_started") {
        setStatus("streaming");
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
        terminalEventPending = "completed";
        finalizeTerminalEventIfReady();
        return;
      }
      if (eventType === "run_failed") {
        pendingFailureMessage = String(payload.error ?? "Generation failed");
        terminalEventPending = "failed";
        finalizeTerminalEventIfReady();
      }
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
      debugChatStreamClient("connect", {
        chatId,
        afterEventId,
        connectionId,
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
      ];

      const listener = (event: MessageEvent) => {
        if (connectionId !== streamConnectionIdRef.current) return;
        try {
          const envelope = JSON.parse(event.data) as StreamEnvelope;
          debugChatStreamClient("envelope", {
            chatId,
            connectionId,
            eventId: envelope.logicalEventId,
            eventType: envelope.eventType,
          });
          handleEnvelope(envelope);
        } catch {
          // ignore malformed event
        }
      };

      for (const eventType of eventTypes) {
        source.addEventListener(eventType, listener as EventListener);
      }

      source.onopen = () => {
        if (connectionId !== streamConnectionIdRef.current) return;
        debugChatStreamClient("open", {
          chatId,
          connectionId,
          afterEventId,
        });
      };

      source.onerror = () => {
        if (connectionId !== streamConnectionIdRef.current) return;
        debugChatStreamClient("error", {
          chatId,
          connectionId,
          afterEventId: lastEventIdRef.current,
          readyState: source.readyState,
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
          const res = await fetch(
            `/api/chats/${encodeURIComponent(chatId)}/turn-runs?latest=1`
          );
          const data = await res.json().catch(() => null);
          const latestId = Number(data?.event?.logicalEventId ?? 0);
          if (Number.isFinite(latestId) && latestId > 0) {
            lastEventIdRef.current = latestId;
          }
        } catch {
          // fallback to 0 when latest lookup fails
        }
        streamInitializedRef.current = true;
      }
      connect(lastEventIdRef.current);
    };

    void bootstrap();

    return () => {
      cancelled = true;
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (reconnectTimerRef.current != null) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
    };
  }, [chatId, loadMessages]);

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
        isUploadingAttachments={isUploadingAttachments}
        pendingAttachments={pendingAttachments}
        attachmentError={attachmentError}
        onFilesSelected={handleAttachmentUpload}
        onAttachmentIntentChange={handleAttachmentIntentChange}
        onAttachmentRemove={handleRemovePendingAttachment}
        captureGlobalTyping={Boolean(providedChatId)}
        onInsertText={insertTextFromGlobalKey}
      />
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
