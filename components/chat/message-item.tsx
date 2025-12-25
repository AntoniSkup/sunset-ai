"use client";

import React from "react";
import type { UIMessage } from "ai";
import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import { ErrorMessage } from "./error-message";

interface MessageItemProps {
  message: UIMessage;
  isStreaming?: boolean;
}

function getTextContent(message: UIMessage): string {
  const textParts = message.parts
    .filter((part) => part.type === "text")
    .map((part) => (part as { text: string }).text);
  return textParts.join("");
}

export const MessageItem = React.memo(function MessageItem({
  message,
  isStreaming,
}: MessageItemProps) {
  const content = getTextContent(message);
  const isUser = message.role === "user";

  return (
    <Message from={message.role}>
      <MessageContent>
        {isUser ? (
          <p className="whitespace-pre-wrap">{content}</p>
        ) : (
          <>
            <MessageResponse>{content}</MessageResponse>
            {isStreaming && (
              <span className="inline-block w-2 h-4 bg-current animate-pulse ml-1" />
            )}
          </>
        )}
      </MessageContent>
    </Message>
  );
});

interface ErrorMessageItemProps {
  error: string;
  onRetry: () => void;
}

export const ErrorMessageItem = React.memo(function ErrorMessageItem({
  error,
  onRetry,
}: ErrorMessageItemProps) {
  return (
    <Message from="assistant">
      <MessageContent className="bg-destructive text-destructive-foreground">
        <ErrorMessage error={error} onRetry={onRetry} />
      </MessageContent>
    </Message>
  );
});
