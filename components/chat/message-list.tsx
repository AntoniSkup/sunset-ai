"use client";

import { useMemo } from "react";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { MessageItem, ErrorMessageItem } from "./message-item";
import type { UIMessage } from "ai";

interface ErrorMessage {
  id: string;
  message: string;
  userMessageId?: string;
}

interface MessageListProps {
  messages: UIMessage[];
  isLoading: boolean;
  errorMessages?: ErrorMessage[];
  onRetry?: (errorMessageId: string) => void;
}

type MergedMessage =
  | { type: "message"; data: UIMessage }
  | { type: "error"; data: ErrorMessage };

function getMergedMessageKey(item: MergedMessage): string {
  return item.type === "message"
    ? `message-${item.data.id}`
    : `error-${item.data.id}`;
}

export function MessageList({
  messages,
  isLoading,
  errorMessages = [],
  onRetry,
}: MessageListProps) {
  const mergedMessages: MergedMessage[] = useMemo(() => {
    const result: MergedMessage[] = [];
    const errorMap = new Map(
      errorMessages.map((error) => [error.userMessageId || "", error])
    );

    for (const message of messages) {
      result.push({ type: "message", data: message });
      if (message.role === "user") {
        const error = errorMap.get(message.id);
        if (error) {
          result.push({ type: "error", data: error });
        }
      }
    }

    const orphanedErrors = errorMessages.filter(
      (error) =>
        !error.userMessageId ||
        !messages.some((m) => m.id === error.userMessageId)
    );

    for (const error of orphanedErrors) {
      result.push({ type: "error", data: error });
    }

    return result;
  }, [messages, errorMessages]);

  return (
    <Conversation className="message-list-scroll h-full overflow-x-hidden">
      <ConversationContent className="gap-0 p-2 md:p-4">
        {mergedMessages.map((item, index) => {
          const isLastMessage = index === mergedMessages.length - 1;

          if (item.type === "error") {
            return (
              <div key={getMergedMessageKey(item)} className="py-4">
                <ErrorMessageItem
                  error={item.data.message}
                  onRetry={
                    onRetry
                      ? () => onRetry(item.data.id)
                      : () => {
                          /* no-op */
                        }
                  }
                />
              </div>
            );
          }

          const message = item.data;

          return (
            <div key={getMergedMessageKey(item)} className="py-4">
              <MessageItem
                message={message}
                isStreaming={
                  isLoading && isLastMessage && message.role === "assistant"
                }
              />
            </div>
          );
        })}
      </ConversationContent>
      <ConversationScrollButton />
    </Conversation>
  );
}
