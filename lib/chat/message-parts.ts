import type { UIMessage } from "ai";

type MessagePart = UIMessage["parts"][number];

function sanitizeTextPart(part: unknown) {
  const candidate = part as { type?: unknown; text?: unknown };
  if (candidate?.type !== "text" || typeof candidate.text !== "string") {
    return null;
  }

  return {
    type: "text" as const,
    text: candidate.text,
  };
}

function sanitizeFilePart(part: unknown) {
  const candidate = part as {
    type?: unknown;
    url?: unknown;
    mediaType?: unknown;
    filename?: unknown;
    assetId?: unknown;
    assetAlias?: unknown;
    assetIntent?: unknown;
    altHint?: unknown;
    label?: unknown;
  };

  if (
    candidate?.type !== "file" ||
    typeof candidate.url !== "string" ||
    !candidate.url.trim()
  ) {
    return null;
  }

  return {
    type: "file" as const,
    url: candidate.url,
    mediaType:
      typeof candidate.mediaType === "string" ? candidate.mediaType : undefined,
    filename:
      typeof candidate.filename === "string" ? candidate.filename : undefined,
    ...(typeof candidate.assetId === "number"
      ? { assetId: candidate.assetId }
      : {}),
    ...(typeof candidate.assetAlias === "string"
      ? { assetAlias: candidate.assetAlias }
      : {}),
    ...(typeof candidate.assetIntent === "string"
      ? { assetIntent: candidate.assetIntent }
      : {}),
    ...(typeof candidate.altHint === "string"
      ? { altHint: candidate.altHint }
      : {}),
    ...(typeof candidate.label === "string" ? { label: candidate.label } : {}),
  };
}

export function sanitizePersistedMessageParts(parts: unknown): MessagePart[] {
  if (!Array.isArray(parts)) {
    return [];
  }

  return parts
    .map((part) => sanitizeTextPart(part) ?? sanitizeFilePart(part))
    .filter((part): part is MessagePart => part !== null);
}

export function extractTextFromMessageParts(parts: unknown): string {
  return sanitizePersistedMessageParts(parts)
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("");
}

export function hasDisplayableMessageParts(parts: unknown): boolean {
  return sanitizePersistedMessageParts(parts).some((part) => {
    if (part.type === "text") {
      return part.text.trim().length > 0;
    }

    return part.type === "file";
  });
}
