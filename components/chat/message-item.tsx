"use client";

import React from "react";
import type { FileUIPart, UIMessage } from "ai";
import {
  Message,
  MessageAttachment,
  MessageAttachments,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import { ErrorMessage } from "./error-message";
import { ToolCallIndicator } from "./tool-call-indicator";
import { CompletenessToolCallIndicator } from "./completeness-tool-call-indicator";
import {
  ValidationReportCard,
  type ValidationReportPayload,
} from "./validation-report-card";
import { useTypewriter } from "./use-typewriter";

function StreamedText({
  text,
  isStreaming,
}: {
  text: string;
  isStreaming: boolean;
}) {
  const visible = useTypewriter(text, { enabled: isStreaming });
  return <MessageResponse>{visible}</MessageResponse>;
}

interface MessageItemProps {
  message: UIMessage;
  isStreaming?: boolean;
}

type RenderToken =
  | { type: "text"; text: string }
  | { type: "tool-marker"; id: string; title: string; toolName: string }
  | {
      type: "tool-call";
      toolCallId: string;
      toolName: string;
      isComplete: boolean;
      destination?: string;
    }
  | {
      type: "validation-report";
      toolCallId: string;
      toolName: string;
      report: ValidationReportPayload;
      isPending: boolean;
    };

function isValidationTool(toolName: string): boolean {
  return (
    toolName === "validate_completeness" ||
    toolName === "validate_ui_consistency"
  );
}

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
  const toolTagRegex = /<tool\s+([^>]*?)\/>/gi;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = toolTagRegex.exec(text)) !== null) {
    const start = match.index;
    const end = toolTagRegex.lastIndex;
    const attrs = match[1] ?? "";

    if (start > lastIndex) {
      const chunk = text.slice(lastIndex, start);
      if (chunk) tokens.push({ type: "text", text: chunk });
    }

    const titleMatch = String(attrs).match(/title\s*=\s*"([^"]*)"/i);
    const toolNameMatch = String(attrs).match(/toolName\s*=\s*"([^"]*)"/i);
    const idMatch = String(attrs).match(/id\s*=\s*("?)([0-9]+)\1/i);
    const titleRaw = titleMatch?.[1] ?? "tool";
    const toolNameRaw = toolNameMatch?.[1] ?? "unknown";
    const idRaw = idMatch?.[2] ?? "";

    tokens.push({
      type: "tool-marker",
      id: idRaw,
      title: unescapeAttr(titleRaw),
      toolName: unescapeAttr(toolNameRaw),
    });

    lastIndex = end;
  }

  if (lastIndex < text.length) {
    const chunk = text.slice(lastIndex);
    if (chunk) tokens.push({ type: "text", text: chunk });
  }

  return tokens
    .map((t) =>
      t.type === "text" ? { ...t, text: t.text.replace(/\n{3,}/g, "\n\n") } : t
    )
    .filter((t) => (t.type === "text" ? t.text.trim().length > 0 : true));
}

function getTextContent(message: UIMessage): string {
  const textParts = message.parts
    .filter((part) => part.type === "text")
    .map((part) => (part as { text: string }).text);
  return textParts.join("");
}

function getFileParts(message: UIMessage): FileUIPart[] {
  return message.parts.filter((part) => part.type === "file") as FileUIPart[];
}

// Return empty string when there's no real file name; the ToolCallIndicator
// already maps `toolName` to a translated target label via i18n.
function getDefaultFileNameForTool(_toolName: string): string {
  return "";
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
      if (isValidationTool(toolName)) {
        tokens.push({
          type: "validation-report",
          toolCallId,
          toolName,
          report: {
            reportType:
              toolName === "validate_completeness"
                ? "completeness"
                : "ui_consistency",
          },
          isPending: true,
        });
        continue;
      }
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
      const toolName = String(part?.toolName || "unknown");
      if (isValidationTool(toolName)) {
        tokens.push({
          type: "validation-report",
          toolCallId: String(part?.toolCallId || ""),
          toolName,
          report: (part?.result ?? {}) as ValidationReportPayload,
          isPending: false,
        });
      }
      continue;
    }

    if (partType.startsWith("tool-")) {
      const toolName = partType.replace("tool-", "");
      const toolCallId = String(part?.toolCallId || "");
      const hasResult = part?.result != null || part?.output != null;
      if (isValidationTool(toolName) && hasResult) {
        tokens.push({
          type: "validation-report",
          toolCallId,
          toolName,
          report: (part?.result ??
            part?.output ??
            {}) as ValidationReportPayload,
          isPending: false,
        });
        continue;
      }
      if (isValidationTool(toolName) && !hasResult) {
        tokens.push({
          type: "validation-report",
          toolCallId,
          toolName,
          report: {
            reportType:
              toolName === "validate_completeness"
                ? "completeness"
                : "ui_consistency",
          },
          isPending: true,
        });
        continue;
      }
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
        isComplete:
          hasResult || !!(toolCallId && hasResultById.get(toolCallId)),
        destination,
      });
      continue;
    }
  }

  // Merge adjacent text tokens so streaming appears as one continuous response
  // instead of segmented "parts" when multiple text parts are present.
  const merged: RenderToken[] = [];
  for (const token of tokens) {
    const last = merged[merged.length - 1];
    if (token.type === "text" && last?.type === "text") {
      last.text += token.text;
      continue;
    }
    merged.push(token);
  }

  // Collapse validator pending/result into one visible card per tool call.
  const collapsed: RenderToken[] = [];
  const validationIndexByCallId = new Map<string, number>();
  for (const token of merged) {
    if (token.type !== "validation-report") {
      collapsed.push(token);
      continue;
    }
    const key = token.toolCallId || `${token.toolName}-anon`;
    const existingIdx = validationIndexByCallId.get(key);
    if (existingIdx == null) {
      validationIndexByCallId.set(key, collapsed.length);
      collapsed.push(token);
      continue;
    }
    collapsed[existingIdx] = token;
  }

  return collapsed;
}

export const MessageItem = React.memo(function MessageItem({
  message,
  isStreaming,
}: MessageItemProps) {
  const isUser = message.role === "user";
  const tokens = !isUser ? buildRenderTokens(message) : [];
  const content = isUser ? getTextContent(message) : "";
  const attachments = isUser ? getFileParts(message) : [];
  // The pulse dot is a "thinking" indicator shown while we're still waiting
  // for the first token. Once any actual text has streamed in, the user can
  // see text growing in place, so the dot becomes redundant and distracting.
  const hasStreamedText =
    !isUser &&
    tokens.some((t) => t.type === "text" && t.text.trim().length > 0);

  return (
    <Message from={message.role}>
      {isUser && attachments.length > 0 && (
        <MessageAttachments className="mb-2">
          {attachments.map((attachment, index) => (
            <MessageAttachment
              key={`${attachment.url}-${index}`}
              data={attachment}
              className="size-16"
            />
          ))}
        </MessageAttachments>
      )}
      <MessageContent>
        {isUser ? (
          <>{content && <p className="whitespace-pre-wrap">{content}</p>}</>
        ) : (
          <>
            {tokens.map((t, idx) => {
              switch (t.type) {
                case "text":
                  return (
                    <StreamedText
                      key={`t-${idx}`}
                      text={t.text}
                      isStreaming={!!isStreaming}
                    />
                  );
                case "tool-marker":
                  if (isValidationTool(t.toolName)) {
                    return (
                      <div key={`m-${t.id || idx}`} className="my-2">
                        <ValidationReportCard
                          toolName={t.toolName}
                          report={{
                            reportType:
                              t.toolName === "validate_completeness"
                                ? "completeness"
                                : "ui_consistency",
                            summary: t.title,
                          }}
                          isPending={false}
                        />
                      </div>
                    );
                  }
                  return (
                    <div key={`m-${t.id || idx}`} className="my-1">
                      <ToolCallIndicator
                        toolName={t.toolName}
                        fileName={t.title}
                        isComplete={true}
                      />
                    </div>
                  );
                case "tool-call": {
                  const fileName =
                    t.destination || getDefaultFileNameForTool(t.toolName);
                  return (
                    <div key={`c-${t.toolCallId || idx}`} className="my-1">
                      <ToolCallIndicator
                        toolName={t.toolName}
                        fileName={fileName}
                        isComplete={t.isComplete}
                      />
                    </div>
                  );
                }
                case "validation-report":
                  if (
                    t.isPending &&
                    t.toolName === "validate_completeness"
                  ) {
                    return (
                      <div key={`v-${t.toolCallId || idx}`} className="my-2">
                        <CompletenessToolCallIndicator />
                      </div>
                    );
                  }
                  return (
                    <div key={`v-${t.toolCallId || idx}`} className="my-2">
                      <ValidationReportCard
                        toolName={t.toolName}
                        report={t.report}
                        isPending={t.isPending}
                      />
                    </div>
                  );
                default:
                  return ((_: never) => null)(t);
              }
            })}

            {isStreaming && !hasStreamedText && (
              <span className="inline-block h-4 w-4 rounded-full bg-current animate-pulse ml-1" />
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
  errorId: string;
  chatId?: string | null;
}

export const ErrorMessageItem = React.memo(function ErrorMessageItem({
  error,
  onRetry,
  errorId,
  chatId,
}: ErrorMessageItemProps) {
  return (
    <Message from="assistant">
      <MessageContent className="rounded-3xl overflow-visible p-2">
        <ErrorMessage
          error={error}
          onRetry={onRetry}
          errorId={errorId}
          chatId={chatId}
        />
      </MessageContent>
    </Message>
  );
});
