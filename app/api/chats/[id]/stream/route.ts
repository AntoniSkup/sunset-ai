import { NextRequest, NextResponse } from "next/server";
import {
  getUser,
  getChatByPublicId,
} from "@/lib/db/queries";
import {
  readStreamEventsAfter,
} from "@/lib/chat/stream-bus";
import { diffMs, logChatStreamDiagnostic } from "@/lib/chat/stream-diagnostics";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 240;
const SSE_POLL_INTERVAL_BASE_MS = 40;
const SSE_POLL_INTERVAL_MAX_MS = 120;
const SSE_HEARTBEAT_INTERVAL_MS = 15000;
const SSE_ERROR_RETRY_BASE_MS = 150;
const SSE_ERROR_RETRY_MAX_MS = 800;
const SSE_CONNECTION_MAX_MS = 240000;
const SSE_IDLE_NO_EVENTS_CLOSE_MS = 20000;
const SSE_IDLE_POST_EVENT_CLOSE_MS = 10000;

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
      const connectionStartedAt = Date.now();

      logChatStreamDiagnostic("SSE connection opened", {
        chatId: chat.id,
        chatPublicId,
        userId: user.id,
        afterEventId,
      });

      const close = () => {
        if (closed) return;
        closed = true;
        logChatStreamDiagnostic("SSE connection closed", {
          chatId: chat.id,
          chatPublicId,
          userId: user.id,
          afterEventId,
          connectedForMs: Date.now() - connectionStartedAt,
        });
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
        let lastEventAtMs = 0;
        while (!closed) {
          if (request.signal.aborted) {
            close();
            return;
          }
          if (Date.now() - connectionStartedAt >= SSE_CONNECTION_MAX_MS) {
            logChatStreamDiagnostic("SSE connection recycled before runtime timeout", {
              chatId: chat.id,
              chatPublicId,
              userId: user.id,
              afterEventId,
              connectedForMs: Date.now() - connectionStartedAt,
              maxConnectionMs: SSE_CONNECTION_MAX_MS,
            });
            close();
            return;
          }
          const idleForMs =
            lastEventAtMs === 0
              ? Date.now() - connectionStartedAt
              : Date.now() - lastEventAtMs;
          const idleThresholdMs =
            lastEventAtMs === 0
              ? SSE_IDLE_NO_EVENTS_CLOSE_MS
              : SSE_IDLE_POST_EVENT_CLOSE_MS;
          if (idleForMs >= idleThresholdMs) {
            logChatStreamDiagnostic("SSE connection closing on idle threshold", {
              chatId: chat.id,
              chatPublicId,
              userId: user.id,
              afterEventId,
              idleForMs,
              idleThresholdMs,
              hasReceivedEvents: lastEventAtMs > 0,
            });
            close();
            return;
          }
          try {
            const readStartedAt = Date.now();
            const events = await readStreamEventsAfter({
              chatId: chat.id,
              afterLogicalEventId: afterEventId,
              limit: 100,
            });
            const readDurationMs = Date.now() - readStartedAt;
            consecutiveReadErrors = 0;
            if (events.length > 0) {
              idlePolls = 0;
              lastEventAtMs = Date.now();
            } else {
              idlePolls += 1;
            }

            if (
              events.length > 0 ||
              readDurationMs >= 250 ||
              idlePolls === 1 ||
              idlePolls % 20 === 0
            ) {
              const newestEvent = events[events.length - 1];
              logChatStreamDiagnostic("SSE poll completed", {
                chatId: chat.id,
                afterEventId,
                eventCount: events.length,
                idlePolls,
                pollIntervalMs,
                readDurationMs,
                newestEventLagMs: newestEvent
                  ? diffMs(Date.now(), newestEvent.createdAt)
                  : null,
              });
            }

            for (const event of events) {
              if (closed) break;
              afterEventId = event.logicalEventId;
              controller.enqueue(
                encoder.encode(
                  sseFrame({
                    id: event.logicalEventId,
                    event: event.eventType,
                    data: {
                      // dbId is the globally monotonic postgres SERIAL id and
                      // is the client's primary dedupe/ordering key.
                      // logicalEventId is per-chat and has been observed to
                      // collide across distinct events in production, so we
                      // keep it purely for SSE `afterEventId` resume cursors.
                      dbId: event.dbId,
                      logicalEventId: event.logicalEventId,
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
              // Keep tight polling in strict Redis mode for smooth delivery.
              pollIntervalMs = Math.min(
                SSE_POLL_INTERVAL_MAX_MS,
                Math.max(SSE_POLL_INTERVAL_BASE_MS, pollIntervalMs + 10)
              );
              const nowMs = Date.now();
              if (nowMs - lastHeartbeatAtMs >= SSE_HEARTBEAT_INTERVAL_MS) {
                sendHeartbeat();
                lastHeartbeatAtMs = nowMs;
              }
            } else {
              // Reset to lowest latency when there is activity.
              pollIntervalMs = SSE_POLL_INTERVAL_BASE_MS;

              // If we hit batch limit there may be more rows queued; poll again immediately.
              if (events.length >= 100) {
                continue;
              }
            }

            await new Promise((resolve) =>
              setTimeout(resolve, pollIntervalMs)
            );
          } catch {
            consecutiveReadErrors += 1;
            const retryDelayMs = Math.min(
              SSE_ERROR_RETRY_MAX_MS,
              SSE_ERROR_RETRY_BASE_MS * Math.max(1, consecutiveReadErrors)
            );
            logChatStreamDiagnostic("SSE poll failed", {
              chatId: chat.id,
              afterEventId,
              consecutiveReadErrors,
              retryDelayMs,
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
