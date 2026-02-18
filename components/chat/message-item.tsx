"use client";

import React from "react";
import type { UIMessage } from "ai";
import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import { ErrorMessage } from "./error-message";
import { ToolCallIndicator } from "./tool-call-indicator";

interface MessageItemProps {
  message: UIMessage;
  isStreaming?: boolean;
}

type RenderToken =
  | { type: "text"; text: string }
  | {
    type: "tool-call";
    toolCallId: string;
    toolName: string;
    isComplete: boolean;
    destination?: string;
  };

function unescapeAttr(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&");
}

function tokenizeTextWithToolMarkers(text: string): RenderToken[] {
  if (!text) return [];

  const tokens: RenderToken[] = [];
  tokens.push({ type: "text", text });

  return tokens
    .map((t) =>
      t.type === "text"
        ? { ...t, text: t.text.replace(/\n{3,}/g, "\n\n") }
        : t
    )
    .filter((t) => (t.type === "text" ? t.text.trim().length > 0 : true));
}

function getTextContent(message: UIMessage): string {
  const textParts = message.parts
    .filter((part) => part.type === "text")
    .map((part) => (part as { text: string }).text);
  return textParts.join("");
}

function getDefaultFileNameForTool(toolName: string): string {
  if (toolName === "create_site") return "landing/index.html";
  if (toolName === "create_section") return "landing/sections/section.html";
  return "file.html";
}

function buildRenderTokens(message: UIMessage): RenderToken[] {
  const tokens: RenderToken[] = [];
  if (!message.parts || message.parts.length === 0) return tokens;

  const hasResultById = new Map<string, boolean>();
  for (const part of message.parts as any[]) {
    const partType = String(part?.type || "");
    if (partType === "tool-result") {
      const toolCallId = String(part?.toolCallId || "");
      if (toolCallId) hasResultById.set(toolCallId, true);
    }
    if (partType.startsWith("tool-")) {
      const toolCallId = String(part?.toolCallId || "");
      const hasResult = part?.result != null || part?.output != null;
      if (toolCallId && hasResult) hasResultById.set(toolCallId, true);
    }
  }

  for (const part of message.parts as any[]) {
    const partType = String(part?.type || "");

    if (partType === "text") {
      const text = String(part?.text || "");
      tokens.push(...tokenizeTextWithToolMarkers(text));
      continue;
    }

    if (partType === "tool-call") {
      const toolCallId = String(part?.toolCallId || "");
      const toolName = String(part?.toolName || "unknown");
      const destination =
        typeof part?.args?.destination === "string"
          ? String(part.args.destination)
          : typeof part?.input?.destination === "string"
            ? String(part.input.destination)
            : undefined;
      tokens.push({
        type: "tool-call",
        toolCallId,
        toolName,
        isComplete: !!(toolCallId && hasResultById.get(toolCallId)),
        destination,
      });
      continue;
    }

    if (partType === "tool-result") {
      continue;
    }

    if (partType.startsWith("tool-")) {
      const toolName = partType.replace("tool-", "");
      const toolCallId = String(part?.toolCallId || "");
      const hasResult = part?.result != null || part?.output != null;
      const destination =
        typeof part?.args?.destination === "string"
          ? String(part.args.destination)
          : typeof part?.input?.destination === "string"
            ? String(part.input.destination)
            : undefined;
      tokens.push({
        type: "tool-call",
        toolCallId,
        toolName,
        isComplete: hasResult || !!(toolCallId && hasResultById.get(toolCallId)),
        destination,
      });
      continue;
    }
  }

  return tokens;
}

export const MessageItem = React.memo(function MessageItem({
  message,
  isStreaming,
}: MessageItemProps) {
  const isUser = message.role === "user";
  const tokens = !isUser ? buildRenderTokens(message) : [];
  const content = isUser ? getTextContent(message) : "";

  return (
    <Message from={message.role}>
      <MessageContent>
        {isUser ? (
          <p className="whitespace-pre-wrap">{content}</p>
        ) : (
          <>
            {tokens.map((t, idx) => {
              if (t.type === "text") {
                return <MessageResponse key={`t-${idx}`}>{t.text}</MessageResponse>;
              }

              const fileName = t.destination || getDefaultFileNameForTool(t.toolName);
              return (
                <div key={`c-${t.toolCallId || idx}`} className="my-1">
                  <ToolCallIndicator
                    toolName={t.toolName}
                    fileName={fileName}
                    isComplete={t.isComplete}
                  />
                </div>
              );
            })}

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
