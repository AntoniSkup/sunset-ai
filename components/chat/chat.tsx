"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { WelcomeMessage } from "./welcome-message";
import { MessageList } from "./message-list";
import { ChatInput } from "./chat-input";
import type { UIMessage } from "ai";

export function Chat() {
  const [input, setInput] = useState("");
  const lastUserMessageRef = useRef<string>("");

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
      }),
    []
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

  const isLoading = status === "streaming" || status === "submitted";

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

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
