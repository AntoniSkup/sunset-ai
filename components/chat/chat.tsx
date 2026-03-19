"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import type { UIMessage } from "ai";
import useSWR from "swr";
import { WelcomeMessage } from "./welcome-message";
import { MessageList } from "./message-list";
import { ChatInput } from "./chat-input";
import { CreditsLimitModal } from "./credits-limit-modal";
import {
  showPreviewLoader,
  hidePreviewLoader,
  updatePreviewPanel,
} from "@/lib/preview/update-preview";
import { usePendingMessageStore } from "@/lib/stores/usePendingMessageStore";
import type { BillingApiResponse } from "@/app/api/billing/route";

const billingFetcher = (url: string) => fetch(url).then((res) => res.json());
const MIN_CREDITS_TO_SEND = 0.5;

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
  const [initialMessages, setInitialMessages] = useState<UIMessage[] | null>(
    null
  );
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setInitialMessages(null);
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

  return <ChatInner chatId={chatId} initialMessages={initialMessages} />;
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
  const lastUserMessageRef = useRef<string>("");
  const lastUserMessagePartsRef = useRef<UIMessage["parts"]>([]);
  const lastPreviewVersionIdRef = useRef<number | null>(null);
  const previewLoaderShownForToolCallIdsRef = useRef<Set<string>>(new Set());
  const pendingMessage = usePendingMessageStore((s) => s.pendingMessage);
  const setPendingMessage = usePendingMessageStore((s) => s.setPendingMessage);
  const consumedPendingIdsRef = useRef<Set<string>>(new Set());
  const { data: billing, mutate: mutateBilling } = useSWR<BillingApiResponse>(
    "/api/billing",
    billingFetcher
  );
  const hasCredits =
    billing === undefined || Number(billing.balance) >= MIN_CREDITS_TO_SEND;

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

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        async fetch(url, options) {
          if (chatId && options?.body) {
            const body = JSON.parse(options.body as string);
            body.chatId = chatId;
            options.body = JSON.stringify(body);
          }
          return fetch(url, options);
        },
      }),
    [chatId]
  );

  const [errorMessages, setErrorMessages] = useState<
    Array<{ id: string; message: string; userMessageId?: string }>
  >([]);
  const toolErrorKeysRef = useRef<Set<string>>(new Set());

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

  const { messages, sendMessage, status } = useChat({
    messages: initialMessages,
    transport,
    onError: (error) => {
      const errorMessage =
        error.message || "An error occurred. Please try again.";
      const lastUserMessage = [...messages]
        .reverse()
        .find((m) => m.role === "user");
      setErrorMessages((prev) => [
        ...prev,
        {
          id: `error-${Date.now()}-${Math.random()}`,
          message: errorMessage,
          userMessageId: lastUserMessage?.id,
        },
      ]);
    },
  });

  const statusRef = useRef(status);
  useEffect(() => {
    if (
      chatId &&
      pendingMessage &&
      pendingMessage.chatId === chatId &&
      messages.length === 0 &&
      status !== "streaming" &&
      status !== "submitted"
    ) {
      if (consumedPendingIdsRef.current.has(pendingMessage.id)) return;

      if (!hasCredits) {
        consumedPendingIdsRef.current.add(pendingMessage.id);
        setPendingMessage(null);
        setShowCreditsLimitModal(true);
        return;
      }

      consumedPendingIdsRef.current.add(pendingMessage.id);
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
      sendMessage({
        role: "user",
        parts,
      });
    }
  }, [
    chatId,
    pendingMessage,
    messages.length,
    status,
    sendMessage,
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
          asset: data.asset as Omit<PendingAttachment, "localId" | "isUploading">,
        };
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
          if (failedLocalIds.has(item.localId) && item.blobUrl.startsWith("blob:")) {
            URL.revokeObjectURL(item.blobUrl);
          }
        }

        return next.filter((item) => !failedLocalIds.has(item.localId));
      });

      if (uploadErrors.length > 0) {
        setAttachmentError(uploadErrors[0]);
      }
    } catch (error) {
      setAttachmentError(
        error instanceof Error ? error.message : "Failed to upload image."
      );
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
    sendMessage({
      role: "user",
      parts,
    });
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

    sendMessage({
      role: "user",
      parts: partsToRetry,
    });
  };

  useEffect(() => {
    let newestSuccessful: {
      versionId: number;
      versionNumber: number;
      chatId: string;
    } | null = null;
    let newestFailure: { error: string; toolCallId?: string } | null = null;
    const lastUserMessageId = [...messages]
      .reverse()
      .find((m) => m.role === "user")?.id;

    const builderToolNames = new Set([
      "create_site",
      "create_section",
      "generate_landing_page_code",
    ]);

    const isBuilderTool = (toolName: unknown) =>
      typeof toolName === "string" && builderToolNames.has(toolName);

    const extractVersionLike = (result: any) => {
      if (!result || result.success !== true) return null;
      const id = result.revisionId ?? result.versionId;
      const num = result.revisionNumber ?? result.versionNumber;
      if (!id || !num) return null;
      return { versionId: Number(id), versionNumber: Number(num) };
    };

    for (const message of messages) {
      if (message.role !== "assistant") continue;

      for (const part of message.parts as any[]) {
        const partType = String(part?.type || "");

        if (partType === "tool-call" && isBuilderTool(part?.toolName)) {
          const toolCallId = String(
            part?.toolCallId || part?.toolName || "tool"
          );
          if (!previewLoaderShownForToolCallIdsRef.current.has(toolCallId)) {
            previewLoaderShownForToolCallIdsRef.current.add(toolCallId);
            showPreviewLoader("Generating website...");
          }
        }

        if (partType.startsWith("tool-")) {
          const toolName = partType.replace("tool-", "");
          if (isBuilderTool(toolName)) {
            const hasResult = "result" in part || "output" in part;
            if (!hasResult) {
              const toolCallId = String(part?.toolCallId || toolName || "tool");
              if (
                !previewLoaderShownForToolCallIdsRef.current.has(toolCallId)
              ) {
                previewLoaderShownForToolCallIdsRef.current.add(toolCallId);
                showPreviewLoader("Generating website...");
              }
            }
          }
        }

        if (partType === "tool-result" && isBuilderTool(part?.toolName)) {
          const result = part?.result ?? part?.output ?? null;
          const extracted = extractVersionLike(result);
          if (extracted) {
            const candidate = {
              versionId: extracted.versionId,
              versionNumber: extracted.versionNumber,
              chatId: String(chatId || ""),
            };
            if (
              !newestSuccessful ||
              candidate.versionNumber > newestSuccessful.versionNumber
            ) {
              newestSuccessful = candidate;
            }
          }
          if (
            result?.success === false &&
            typeof result?.error === "string" &&
            result.error
          ) {
            newestFailure = {
              error: result.error,
              toolCallId: String(part?.toolCallId || ""),
            };
          }
        }

        if (partType.startsWith("tool-")) {
          const toolName = partType.replace("tool-", "");
          if (!isBuilderTool(toolName)) continue;
          const result = part?.result ?? part?.output ?? null;
          const extracted = extractVersionLike(result);
          if (extracted) {
            const candidate = {
              versionId: extracted.versionId,
              versionNumber: extracted.versionNumber,
              chatId: String(chatId || ""),
            };
            if (
              !newestSuccessful ||
              candidate.versionNumber > newestSuccessful.versionNumber
            ) {
              newestSuccessful = candidate;
            }
          }
          if (
            result?.success === false &&
            typeof result?.error === "string" &&
            result.error
          ) {
            newestFailure = {
              error: result.error,
              toolCallId: String(part?.toolCallId || ""),
            };
          }
        }
      }
    }

    if (newestFailure?.error) {
      const key = `${newestFailure.toolCallId || "tool"}:${newestFailure.error}`;
      if (!toolErrorKeysRef.current.has(key)) {
        toolErrorKeysRef.current.add(key);
        setErrorMessages((prev) => [
          ...prev,
          {
            id: `tool-error-${Date.now()}-${Math.random()}`,
            message: `Generation failed: ${newestFailure.error}`,
            userMessageId: lastUserMessageId,
          },
        ]);
      }
    }

    const isTurnFinished = status !== "streaming" && status !== "submitted";
    if (!isTurnFinished) return;

    if (newestSuccessful?.versionId && newestSuccessful.chatId) {
      if (lastPreviewVersionIdRef.current !== newestSuccessful.versionId) {
        lastPreviewVersionIdRef.current = newestSuccessful.versionId;
        updatePreviewPanel(
          newestSuccessful.versionId,
          newestSuccessful.versionNumber,
          newestSuccessful.chatId
        );
      } else {
        hidePreviewLoader();
      }
      return;
    }

    if (newestFailure?.error) {
      hidePreviewLoader();
    }
  }, [messages, status]);

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
      />
      <CreditsLimitModal
        open={showCreditsLimitModal}
        onOpenChange={(open) => {
          setShowCreditsLimitModal(open);
          if (!open) mutateBilling();
        }}
      />
    </div>
  );
}
