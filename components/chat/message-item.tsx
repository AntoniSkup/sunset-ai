"use client";

import React from "react";
import ReactMarkdown from "react-markdown";
import { MessageRole } from "@/lib/chat/types";
import { cn } from "@/lib/utils";
import { ErrorMessage } from "./error-message";

interface MessageItemProps {
  role: MessageRole;
  content: string;
  isStreaming?: boolean;
  onRetry?: () => void;
}

export const MessageItem = React.memo(function MessageItem({
  role,
  content,
  isStreaming,
  onRetry,
}: MessageItemProps) {
  const isUser = role === "user";
  const isAssistant = role === "assistant";
  const isError = role === "error";

  return (
    <div
      className={cn(
        "flex w-full mb-4",
        isUser && "justify-end",
        (isAssistant || isError) && "justify-start"
      )}
    >
      <div
        className={cn(
          "rounded-lg px-4 py-2.5 max-w-[80%] shadow-sm",
          isUser && "bg-primary text-primary-foreground",
          isAssistant && "bg-muted text-foreground border",
          isError && "bg-destructive text-destructive-foreground"
        )}
      >
        {isError && onRetry ? (
          <ErrorMessage error={content} onRetry={onRetry} />
        ) : isAssistant ? (
          <div className="prose prose-sm dark:prose-invert max-w-none">
            <ReactMarkdown>{content}</ReactMarkdown>
            {isStreaming && (
              <span className="inline-block w-2 h-4 bg-current animate-pulse ml-1" />
            )}
          </div>
        ) : (
          <p className="text-sm whitespace-pre-wrap">{content}</p>
        )}
      </div>
    </div>
  );
});
