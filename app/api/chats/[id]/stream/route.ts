import { NextRequest, NextResponse } from "next/server";
import {
  getUser,
  getChatByPublicId,
} from "@/lib/db/queries";
import {
  isStreamBusDebugEnabled,
  readStreamEventsAfter,
} from "@/lib/chat/stream-bus";

export const dynamic = "force-dynamic";
const SSE_POLL_INTERVAL_BASE_MS = 300;
const SSE_POLL_INTERVAL_MAX_MS = 700;
const SSE_HEARTBEAT_INTERVAL_MS = 15000;
const SSE_ERROR_RETRY_BASE_MS = 500;
const SSE_ERROR_RETRY_MAX_MS = 3000;
const STREAM_SSE_DEBUG_ENABLED = isStreamBusDebugEnabled();

function debugStreamSse(message: string, payload?: Record<string, unknown>) {
  if (!STREAM_SSE_DEBUG_ENABLED) return;
  if (payload) {
    console.log(`[stream-sse] ${message}`, payload);
    return;
  }
  console.log(`[stream-sse] ${message}`);
}

function sseFrame(params: {
  id?: number;
  event?: string;
  data: Record<string, unknown>;
}) {
  const lines: string[] = [];
  if (params.id != null) lines.push(`id: ${params.id}`);
  if (params.event) lines.push(`event: ${params.event}`);
  lines.push(`data: ${JSON.stringify(params.data)}`);
  return `${lines.join("\n")}\n\n`;
}

export async function GET(
  request: NextRequest,
  {
    params,
  }: {
    params: Promise<{ id: string }>;
  }
) {
  const user = await getUser();
  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized", code: "UNAUTHORIZED" },
      { status: 401 }
    );
  }

  const { id: chatPublicId } = await params;
  if (!chatPublicId) {
    return NextResponse.json(
      { error: "Invalid chat ID", code: "INVALID_CHAT_ID" },
      { status: 400 }
    );
  }

  const chat = await getChatByPublicId(chatPublicId, user.id);
  if (!chat) {
    return NextResponse.json(
      { error: "Chat not found", code: "CHAT_NOT_FOUND" },
      { status: 404 }
    );
  }

  const url = new URL(request.url);
  let afterEventId = Number(url.searchParams.get("afterEventId") ?? "0");
  if (!Number.isFinite(afterEventId) || afterEventId < 0) {
    afterEventId = 0;
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      let consecutiveReadErrors = 0;

      const close = () => {
        if (closed) return;
        closed = true;
        try {
          controller.close();
        } catch {
          // ignore close race
        }
      };

      const sendHeartbeat = () => {
        if (closed) return;
        controller.enqueue(encoder.encode(`: heartbeat ${Date.now()}\n\n`));
      };

      const sendLoop = async () => {
        let pollIntervalMs = SSE_POLL_INTERVAL_BASE_MS;
        let lastHeartbeatAtMs = 0;
        let idlePolls = 0;
        while (!closed) {
          try {
            const beforeReadId = afterEventId;
            const events = await readStreamEventsAfter({
              chatId: chat.id,
              afterEventId,
              limit: 100,
            });
            consecutiveReadErrors = 0;
            if (events.length > 0) {
              idlePolls = 0;
              debugStreamSse("poll-events", {
                chatId: chat.id,
                requestedAfterEventId: beforeReadId,
                returned: events.length,
                firstId: events[0]?.id ?? null,
                lastId: events[events.length - 1]?.id ?? null,
              });
            } else {
              idlePolls += 1;
              if (idlePolls % 10 === 0) {
                debugStreamSse("poll-idle", {
                  chatId: chat.id,
                  requestedAfterEventId: beforeReadId,
                  pollIntervalMs,
                  idlePolls,
                });
              }
            }

            for (const event of events) {
              if (closed) break;
              afterEventId = event.id;
              controller.enqueue(
                encoder.encode(
                  sseFrame({
                    id: event.id,
                    event: event.eventType,
                    data: {
                      id: event.id,
                      chatId: event.chatId,
                      runId: event.runId,
                      eventType: event.eventType,
                      payload: event.payload,
                      createdAt: event.createdAt,
                    },
                  })
                )
              );
            }

            if (events.length === 0) {
              // Back off polling when idle to reduce DB pressure.
              pollIntervalMs = Math.min(
                SSE_POLL_INTERVAL_MAX_MS,
                Math.floor(pollIntervalMs * 1.5)
              );
              const nowMs = Date.now();
              if (nowMs - lastHeartbeatAtMs >= SSE_HEARTBEAT_INTERVAL_MS) {
                sendHeartbeat();
                lastHeartbeatAtMs = nowMs;
              }
            } else {
              // Reset to low latency when there is activity.
              pollIntervalMs = SSE_POLL_INTERVAL_BASE_MS;

              // If we hit batch limit there may be more rows queued; poll again immediately.
              if (events.length >= 100) {
                continue;
              }
            }

            await new Promise((resolve) =>
              setTimeout(resolve, pollIntervalMs)
            );
          } catch (error) {
            consecutiveReadErrors += 1;
            const retryDelayMs = Math.min(
              SSE_ERROR_RETRY_MAX_MS,
              SSE_ERROR_RETRY_BASE_MS * Math.max(1, consecutiveReadErrors)
            );
            console.error("Chat SSE loop read failed:", error);
            debugStreamSse("poll-error", {
              chatId: chat.id,
              afterEventId,
              consecutiveReadErrors,
              retryDelayMs,
              error:
                error instanceof Error ? error.message : String(error),
            });
            if (closed || request.signal.aborted) {
              close();
              return;
            }
            await new Promise((resolve) =>
              setTimeout(resolve, retryDelayMs)
            );
          }
        }
      };

      void sendLoop();

      request.signal.addEventListener("abort", () => {
        debugStreamSse("abort", {
          chatId: chat.id,
          afterEventId,
        });
        close();
      });
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
