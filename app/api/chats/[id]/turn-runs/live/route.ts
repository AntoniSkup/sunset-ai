import { NextResponse } from "next/server";
import {
  getChatByPublicId,
  getRunningChatTurnRun,
  getRunningChatTurnRunLiveState,
  getUser,
} from "@/lib/db/queries";
import { createTriggerRealtimeSessionForRun } from "@/lib/chat/trigger-realtime-auth";

export async function GET(
  _request: Request,
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

  const [run, liveState] = await Promise.all([
    getRunningChatTurnRun(chat.id),
    getRunningChatTurnRunLiveState(chat.id, user.id),
  ]);
  const triggerRealtime = run?.triggerRunId
    ? await createTriggerRealtimeSessionForRun(run.triggerRunId)
    : null;

  return NextResponse.json({
    run: run ?? null,
    liveState: liveState ?? null,
    triggerRealtime,
  });
}
