const DEBUG_STREAM_DIAGNOSTICS = process.env.DEBUG_STREAM_DIAGNOSTICS === "1";
const DEBUG_CHAT_STREAM = process.env.DEBUG_CHAT_STREAM === "1";
const DEBUG_STREAM_BUS = process.env.DEBUG_STREAM_BUS === "1";

function toTimestamp(value: Date | string | number | null | undefined): number | null {
  if (value == null) return null;
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

export function diffMs(
  later: Date | string | number | null | undefined,
  earlier: Date | string | number | null | undefined
): number | null {
  const laterTs = toTimestamp(later);
  const earlierTs = toTimestamp(earlier);
  if (laterTs == null || earlierTs == null) return null;
  return laterTs - earlierTs;
}

function logDiagnostic(prefix: string, message: string, data?: Record<string, unknown>) {
  console.info(`${prefix} ${message}`, data ?? {});
}

export function logChatStreamDiagnostic(
  message: string,
  data?: Record<string, unknown>
) {
  if (!DEBUG_STREAM_DIAGNOSTICS && !DEBUG_CHAT_STREAM) return;
  logDiagnostic("[chat-stream-debug]", message, data);
}

export function logStreamBusDiagnostic(
  message: string,
  data?: Record<string, unknown>
) {
  if (!DEBUG_STREAM_DIAGNOSTICS && !DEBUG_STREAM_BUS) return;
  logDiagnostic("[stream-bus-debug]", message, data);
}
