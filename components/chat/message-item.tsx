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

function getTextContent(message: UIMessage): string {
  const textParts = message.parts
    .filter((part) => part.type === "text")
    .map((part) => (part as { text: string }).text);
  return textParts.join("");
}

function getToolCalls(message: UIMessage): Array<{
  toolCallId: string;
  toolName: string;
  state: "call" | "result";
}> {
  const toolCalls: Array<{
    toolCallId: string;
    toolName: string;
    state: "call" | "result";
  }> = [];

  for (const part of message.parts) {
    const partType = part.type as string;

    if (partType.startsWith("tool-")) {
      const toolCallId =
        "toolCallId" in part ? (part.toolCallId as string) : "";
      const toolName = partType.replace("tool-", "");

      const hasResult =
        "result" in part ||
        "output" in part ||
        ("state" in part && (part as any).state === "result") ||
        partType.includes("result");

      const state = hasResult ? "result" : "call";

      toolCalls.push({
        toolCallId,
        toolName,
        state,
      });
    } else if (partType === "tool-call") {
      const toolCallId =
        "toolCallId" in part ? (part.toolCallId as string) : "";
      const toolName =
        "toolName" in part ? (part.toolName as string) : "unknown";
      toolCalls.push({
        toolCallId,
        toolName,
        state: "call",
      });
    } else if (partType === "tool-result") {
      const toolCallId =
        "toolCallId" in part ? (part.toolCallId as string) : "";
      const toolName =
        "toolName" in part ? (part.toolName as string) : "unknown";
      toolCalls.push({
        toolCallId,
        toolName,
        state: "result",
      });
    }
  }

  return toolCalls;
}

export const MessageItem = React.memo(function MessageItem({
  message,
  isStreaming,
}: MessageItemProps) {
  const content = getTextContent(message);
  const isUser = message.role === "user";
  const toolCalls = !isUser ? getToolCalls(message) : [];

  const toolCallMap = new Map<
    string,
    { toolName: string; hasCall: boolean; hasResult: boolean }
  >();

  for (const toolCall of toolCalls) {
    const mapKey = toolCall.toolCallId || toolCall.toolName;
    const existing = toolCallMap.get(mapKey) || {
      toolName: toolCall.toolName,
      hasCall: false,
      hasResult: false,
    };
    if (toolCall.state === "call") {
      existing.hasCall = true;
    } else if (toolCall.state === "result") {
      existing.hasCall = true;
      existing.hasResult = true;
    }
    toolCallMap.set(mapKey, existing);
  }

  const allToolCalls = Array.from(toolCallMap.values()).filter(
    (tc) => tc.hasCall
  );

  return (
    <Message from={message.role}>
      <MessageContent>
        {isUser ? (
          <p className="whitespace-pre-wrap">{content}</p>
        ) : (
          <>
            <MessageResponse>{content}</MessageResponse>

            {allToolCalls.length > 0 && (
              <div className="flex flex-col gap-2 mb-2">
                {allToolCalls.map((toolCall, index) => (
                  <ToolCallIndicator
                    key={`${toolCall.toolName}-${index}`}
                    toolName={toolCall.toolName}
                    fileName="file/index.html"
                    isComplete={toolCall.hasResult && !isStreaming}
                  />
                ))}
              </div>
            )}
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
