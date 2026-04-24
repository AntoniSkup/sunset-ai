import { NextResponse } from "next/server";
import {
  getChatByPublicId,
  getLatestChatStreamEvent,
  getRunningChatTurnRun,
  getRunningChatTurnRunLiveState,
  getUser,
} from "@/lib/db/queries";
import { createTriggerRealtimeSessionForRun } from "@/lib/chat/trigger-realtime-auth";
import { logChatStreamDiagnostic } from "@/lib/chat/stream-diagnostics";

export async function GET(
  _request: Request,
  {
    params,
  }: {
    params: Promise<{ id: string }>;
  }
) {
  const requestStartedAt = Date.now();
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

  const fetchStartedAt = Date.now();
  const [run, liveState, latestEvent] = await Promise.all([
    getRunningChatTurnRun(chat.id),
    getRunningChatTurnRunLiveState(chat.id, user.id),
    // dbId of the most recent persisted event. Client uses this to seed its
    // dedupe cursor (lastDbIdRef) so a running-run recovery doesn't re-process
    // events we already rendered before reconnecting.
    getLatestChatStreamEvent(chat.id),
  ]);
  const queryMs = Date.now() - fetchStartedAt;
  const lastDbId = latestEvent?.id ?? 0;
  const tokenStartedAt = Date.now();
  const triggerRealtime = run?.triggerRunId
    ? await createTriggerRealtimeSessionForRun(run.triggerRunId)
    : null;
  const triggerRealtimeSessionMs = Date.now() - tokenStartedAt;

  logChatStreamDiagnostic("Live state bootstrap request completed", {
    chatId: chat.id,
    chatPublicId,
    runId: run?.id ?? null,
    hasLiveState: Boolean(liveState),
    queryMs,
    triggerRealtimeSessionMs,
    totalRequestMs: Date.now() - requestStartedAt,
  });

  return NextResponse.json({
    run: run ?? null,
    liveState: liveState ?? null,
    triggerRealtime,
    lastDbId,
  });
}
