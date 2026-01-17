"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
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
  const [input, setInput] = useState("");
  const [chatId, setChatId] = useState<string | null>(providedChatId || null);
  const [isCreatingChat, setIsCreatingChat] = useState(false);
  const lastUserMessageRef = useRef<string>("");
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

  const { messages, sendMessage, status } = useChat({
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
    const lastMessage = messages[messages.length - 1];
    if (!lastMessage || lastMessage.role !== "assistant") {
      return;
    }

    for (const part of lastMessage.parts) {
      const partType = part.type as string;

      if (
        partType.startsWith("tool-") &&
        partType === "tool-generate_landing_page_code" &&
        !("result" in part) &&
        !("output" in part)
      ) {
        showPreviewLoader("Generating landing page...");
      }

      if (
        partType.startsWith("tool-") &&
        partType === "tool-generate_landing_page_code" &&
        ("result" in part || "output" in part)
      ) {
        try {
          const result =
            "result" in part
              ? (part as any).result
              : "output" in part
                ? (part as any).output
                : null;

          if (
            result &&
            typeof result === "object" &&
            result.success === true &&
            result.versionId &&
            result.versionNumber
          ) {
            const sessionId =
              result.sessionId ||
              (chatId ? `chat-${chatId}` : null) ||
              ("input" in part ? (part as any).input?.sessionId : null) ||
              `session-${Date.now()}`;

            updatePreviewPanel(
              result.versionId,
              result.versionNumber,
              sessionId
            );
          }
        } catch (error) {
          console.error("Failed to update preview from tool result:", error);
        }
      }
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
