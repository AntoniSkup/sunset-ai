import { NextRequest, NextResponse } from "next/server";
import {
  cancelAllActiveChatTurnRunsForChat,
  getChatByPublicId,
  getUser,
} from "@/lib/db/queries";
import { publishStreamEvents } from "@/lib/chat/stream-bus";

/**
 * Cancels any pending/running turn runs for this chat (e.g. user stop before run id is known).
 */
export async function POST(
  _request: NextRequest,
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
  const chat = await getChatByPublicId(chatPublicId, user.id);
  if (!chat) {
    return NextResponse.json(
      { error: "Chat not found", code: "CHAT_NOT_FOUND" },
      { status: 404 }
    );
  }

  const canceled = await cancelAllActiveChatTurnRunsForChat(chat.id, user.id);

  for (const row of canceled) {
    await publishStreamEvents({
      chatId: chat.id,
      runId: row.id,
      events: [
        {
          eventType: "run_canceled",
          payload: { runId: row.id },
        },
      ],
    });
  }

  return NextResponse.json({
    ok: true as const,
    canceledIds: canceled.map((r) => r.id),
  });
}
