"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import type { UIMessage } from "ai";
import { WelcomeMessage } from "./welcome-message";
import { MessageList } from "./message-list";
import { ChatInput } from "./chat-input";
import {
  showPreviewLoader,
  updatePreviewPanel,
} from "@/lib/preview/update-preview";
import { usePendingMessageStore } from "@/lib/stores/usePendingMessageStore";

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
        const res = await fetch(`/api/chats/${encodeURIComponent(chatId)}/messages`);
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          throw new Error(data?.error || "Failed to load chat messages");
        }
        const data = await res.json();
        if (!cancelled) {
          setInitialMessages(Array.isArray(data?.messages) ? data.messages : []);
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
  const lastUserMessageRef = useRef<string>("");
  const lastPreviewVersionIdRef = useRef<number | null>(null);
  const previewLoaderShownForToolCallIdsRef = useRef<Set<string>>(new Set());
  const pendingMessage = usePendingMessageStore((s) => s.pendingMessage);
  const setPendingMessage = usePendingMessageStore((s) => s.setPendingMessage);
  const consumedPendingIdsRef = useRef<Set<string>>(new Set());

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
      consumedPendingIdsRef.current.add(pendingMessage.id);

      setPendingMessage(null);

      sendMessage({
        role: "user",
        parts: [{ type: "text", text: pendingMessage.message }],
      });
    }
  }, [chatId, pendingMessage, messages.length, status, sendMessage, setPendingMessage]);

  const isLoading = status === "streaming" || status === "submitted";

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!input.trim() || isLoading || !chatId) return;

    const message = input.trim();
    lastUserMessageRef.current = message;
    setInput("");
    sendMessage({
      role: "user",
      parts: [{ type: "text", text: message }],
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

    if (errorMsg.userMessageId) {
      const userMessage = messages.find((m) => m.id === errorMsg.userMessageId);
      if (userMessage) {
        messageToRetry =
          userMessage.parts
            .filter((p) => p.type === "text")
            .map((p) => (p as { text: string }).text)
            .join("") || messageToRetry;
      }
    }

    if (!messageToRetry) return;

    setErrorMessages((prev) => prev.filter((e) => e.id !== errorMessageId));

    sendMessage({
      role: "user",
      parts: [{ type: "text", text: messageToRetry }],
    });
  };

  useEffect(() => {
    let newestSuccessful:
      | { versionId: number; versionNumber: number; chatId: string }
      | null = null;
    let newestFailure: { error: string; toolCallId?: string } | null = null;
    const lastUserMessageId = [...messages].reverse().find((m) => m.role === "user")?.id;

    for (const message of messages) {
      if (message.role !== "assistant") continue;

      for (const part of message.parts as any[]) {
        const partType = String(part?.type || "");

        // Show loader when we detect a call for the landing page generation tool.
        if (partType === "tool-call" && part?.toolName === "generate_landing_page_code") {
          const toolCallId = String(part?.toolCallId || "generate_landing_page_code");
          if (!previewLoaderShownForToolCallIdsRef.current.has(toolCallId)) {
            previewLoaderShownForToolCallIdsRef.current.add(toolCallId);
            showPreviewLoader("Generating landing page...");
          }
        }

        if (partType.startsWith("tool-")) {
          const toolName = partType.replace("tool-", "");
          if (toolName === "generate_landing_page_code") {
            const hasResult = "result" in part || "output" in part;
            if (!hasResult) {
              const toolCallId = String(part?.toolCallId || "generate_landing_page_code");
              if (!previewLoaderShownForToolCallIdsRef.current.has(toolCallId)) {
                previewLoaderShownForToolCallIdsRef.current.add(toolCallId);
                showPreviewLoader("Generating landing page...");
              }
            }
          }
        }

        if (partType === "tool-result" && part?.toolName === "generate_landing_page_code") {
          const result = part?.result ?? part?.output ?? null;
          if (result?.success === true && result?.versionId && result?.versionNumber) {
            const candidate = {
              versionId: Number(result.versionId),
              versionNumber: Number(result.versionNumber),
              chatId: String(chatId || ""),
            };
            if (!newestSuccessful || candidate.versionNumber > newestSuccessful.versionNumber) {
              newestSuccessful = candidate;
            }
          }
          if (result?.success === false && typeof result?.error === "string" && result.error) {
            newestFailure = {
              error: result.error,
              toolCallId: String(part?.toolCallId || ""),
            };
          }
        }

        if (partType.startsWith("tool-")) {
          const toolName = partType.replace("tool-", "");
          if (toolName !== "generate_landing_page_code") continue;
          const result = part?.result ?? part?.output ?? null;
          if (result?.success === true && result?.versionId && result?.versionNumber) {
            const candidate = {
              versionId: Number(result.versionId),
              versionNumber: Number(result.versionNumber),
              chatId: String(chatId || ""),
            };
            if (!newestSuccessful || candidate.versionNumber > newestSuccessful.versionNumber) {
              newestSuccessful = candidate;
            }
          }
          if (result?.success === false && typeof result?.error === "string" && result.error) {
            newestFailure = {
              error: result.error,
              toolCallId: String(part?.toolCallId || ""),
            };
          }
        }
      }
    }

    if (newestFailure?.error) {
      const key = `${newestFailure.toolCallId || "generate_landing_page_code"}:${newestFailure.error}`;
      if (!toolErrorKeysRef.current.has(key)) {
        toolErrorKeysRef.current.add(key);
        setErrorMessages((prev) => [
          ...prev,
          {
            id: `tool-error-${Date.now()}-${Math.random()}`,
            message: `Landing page generation failed to save: ${newestFailure.error}`,
            userMessageId: lastUserMessageId,
          },
        ]);
      }
    }

    if (
      newestSuccessful &&
      newestSuccessful.versionId &&
      newestSuccessful.chatId &&
      lastPreviewVersionIdRef.current !== newestSuccessful.versionId
    ) {
      lastPreviewVersionIdRef.current = newestSuccessful.versionId;
      updatePreviewPanel(
        newestSuccessful.versionId,
        newestSuccessful.versionNumber,
        newestSuccessful.chatId
      );
    }
  }, [messages]);

  useEffect(() => {
    const lastMessage = messages[messages.length - 1];
    if (lastMessage?.role === "user") {
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
          />
        )}
      </div>
      <ChatInput
        input={input}
        handleSubmit={handleSubmit}
        handleInputChange={handleInputChange}
        isLoading={isLoading}
      />
    </div>
  );
}
