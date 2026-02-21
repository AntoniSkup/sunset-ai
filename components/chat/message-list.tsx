"use client";

import { useRef, useEffect, useState, useMemo } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
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

export function MessageList({
  messages,
  isLoading,
  errorMessages = [],
  onRetry,
}: MessageListProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const bottomSpacerRef = useRef<HTMLDivElement>(null);
  const [isMounted, setIsMounted] = useState(false);
  const lastUserMessageIdRef = useRef<string | null>(null);
  const hasScrolledToBottomInitiallyRef = useRef(false);
  type ScrollMode = "auto" | "smooth";

  useEffect(() => {
    setIsMounted(true);
  }, []);

  type MergedMessage =
    | { type: "message"; data: UIMessage }
    | { type: "error"; data: ErrorMessage };

  const mergedMessages: MergedMessage[] = useMemo(() => {
    const result: MergedMessage[] = [];
    const errorMap = new Map(
      errorMessages.map((e) => [e.userMessageId || "", e])
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
      (e) => !e.userMessageId || !messages.some((m) => m.id === e.userMessageId)
    );
    for (const error of orphanedErrors) {
      result.push({ type: "error", data: error });
    }

    return result;
  }, [messages, errorMessages]);

  const getScrollElement = useMemo(() => () => parentRef.current, []);

  const virtualizer = useVirtualizer({
    count: mergedMessages.length,
    getScrollElement,
    estimateSize: () => 100,
    overscan: 5,
  });

  const scrollToBottom = (behavior: ScrollMode = "auto") => {
    if (mergedMessages.length === 0) return;

    if (bottomSpacerRef.current) {
      bottomSpacerRef.current.scrollIntoView({ behavior, block: "end" });
      return;
    }

    parentRef.current?.scrollTo({
      top: parentRef.current.scrollHeight,
      behavior,
    });
  };

  const virtualItems = isMounted ? virtualizer.getVirtualItems() : [];

  useEffect(() => {
    if (!isMounted) return;

    const lastMessage = messages[messages.length - 1];
    if (!lastMessage || lastMessage.role !== "user") return;

    if (lastUserMessageIdRef.current === lastMessage.id) return;
    lastUserMessageIdRef.current = lastMessage.id;

    requestAnimationFrame(() => {
      scrollToBottom("smooth");
    });
  }, [isMounted, messages, mergedMessages.length]);

  useEffect(() => {
    if (parentRef.current && mergedMessages.length > 0) {
      const element = parentRef.current;
      const isAtBottom =
        element.scrollHeight - element.scrollTop - element.clientHeight < 50;

      if (isAtBottom) {
        requestAnimationFrame(() => {
          scrollToBottom("smooth");
        });
      }
    }
  }, [mergedMessages.length, isLoading]);

  useEffect(() => {
    if (!isMounted || mergedMessages.length === 0 || hasScrolledToBottomInitiallyRef.current)
      return;

    hasScrolledToBottomInitiallyRef.current = true;
    requestAnimationFrame(() => {
      scrollToBottom("auto");
    });
  }, [isMounted, mergedMessages.length]);

  if (!isMounted) {
    return (
      <div className="message-list-scroll h-full overflow-y-auto overflow-x-hidden">
        <div className="flex flex-col gap-8">
          {mergedMessages.map((item, index) => {
            if (item.type === "error") {
              return (
                <ErrorMessageItem
                  key={item.data.id}
                  error={item.data.message}
                  onRetry={
                    onRetry
                      ? () => onRetry(item.data.id)
                      : () => {
                        /* no-op */
                      }
                  }
                />
              );
            }

            const message = item.data;
            const lastMessage = mergedMessages[mergedMessages.length - 1];
            const isLastMessage =
              index === mergedMessages.length - 1 ||
              (lastMessage?.type === "message" &&
                message.id === lastMessage.data.id);

            return (
              <MessageItem
                key={message.id}
                message={message}
                isStreaming={
                  isLoading && isLastMessage && message.role === "assistant"
                }
              />
            );
          })}
        </div>
        <div ref={bottomSpacerRef} aria-hidden className="h-16" />
      </div>
    );
  }

  return (
    <div
      ref={parentRef}
      className="message-list-scroll h-full overflow-y-auto overflow-x-hidden p-2 md:p-4"
    >
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: "100%",
          position: "relative",
        }}
        className="p-1"
      >
        {virtualItems.map((virtualRow) => {
          const item = mergedMessages[virtualRow.index];
          const isLastMessage = virtualRow.index === mergedMessages.length - 1;

          if (item.type === "error") {
            return (
              <div
                key={virtualRow.key}
                data-index={virtualRow.index}
                ref={virtualizer.measureElement}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  right: 0,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
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
            <div
              key={virtualRow.key}
              data-index={virtualRow.index}
              ref={virtualizer.measureElement}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${virtualRow.start}px)`,
              }}
              className="py-4"
            >
              <MessageItem
                message={message}
                isStreaming={
                  isLoading && isLastMessage && message.role === "assistant"
                }
              />
            </div>
          );
        })}
      </div>
      <div ref={bottomSpacerRef} aria-hidden className="h-64" />
    </div>
  );
}
