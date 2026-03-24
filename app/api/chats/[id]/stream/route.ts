import { NextRequest, NextResponse } from "next/server";
import {
  getUser,
  getChatByPublicId,
  getChatStreamEventsAfter,
} from "@/lib/db/queries";

export const dynamic = "force-dynamic";
const SSE_POLL_INTERVAL_MS = 300;

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
        while (!closed) {
          try {
            const events = await getChatStreamEventsAfter({
              chatId: chat.id,
              afterEventId,
              limit: 100,
            });

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
              sendHeartbeat();
            }

            await new Promise((resolve) =>
              setTimeout(resolve, SSE_POLL_INTERVAL_MS)
            );
          } catch {
            close();
            return;
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
