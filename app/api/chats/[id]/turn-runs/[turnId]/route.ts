import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import {
  cancelChatTurnRunIfActive,
  enqueueChatTurnRun,
  getChatByPublicId,
  getChatTurnRunById,
  getRunningChatTurnRun,
  getUser,
} from "@/lib/db/queries";
import { publishStreamEvents } from "@/lib/chat/stream-bus";
import { triggerChatTurnTask } from "@/lib/chat/trigger-chat-turn-task";

export async function GET(
  _request: NextRequest,
  {
    params,
  }: {
    params: Promise<{ id: string; turnId: string }>;
  }
) {
  const user = await getUser();
  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized", code: "UNAUTHORIZED" },
      { status: 401 }
    );
  }

  const { id: chatPublicId, turnId } = await params;
  const chat = await getChatByPublicId(chatPublicId, user.id);
  if (!chat) {
    return NextResponse.json(
      { error: "Chat not found", code: "CHAT_NOT_FOUND" },
      { status: 404 }
    );
  }

  const run = await getChatTurnRunById(turnId);
  if (!run || run.chatId !== chat.id || run.userId !== user.id) {
    return NextResponse.json(
      { error: "Turn run not found", code: "TURN_RUN_NOT_FOUND" },
      { status: 404 }
    );
  }

  return NextResponse.json({ run });
}

export async function DELETE(
  _request: NextRequest,
  {
    params,
  }: {
    params: Promise<{ id: string; turnId: string }>;
  }
) {
  const user = await getUser();
  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized", code: "UNAUTHORIZED" },
      { status: 401 }
    );
  }

  const { id: chatPublicId, turnId } = await params;
  if (!turnId || typeof turnId !== "string") {
    return NextResponse.json(
      { error: "Invalid turn id", code: "INVALID_TURN_ID" },
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

  const canceled = await cancelChatTurnRunIfActive(turnId, {
    chatId: chat.id,
    userId: user.id,
  });

  if (!canceled) {
    return NextResponse.json(
      {
        error: "Turn run not found or not cancelable",
        code: "NOT_CANCELABLE",
      },
      { status: 404 }
    );
  }

  await publishStreamEvents({
    chatId: chat.id,
    runId: canceled.id,
    events: [
      {
        eventType: "run_canceled",
        payload: { runId: canceled.id },
      },
    ],
  });

  return NextResponse.json({ ok: true as const, runId: canceled.id });
}

export async function POST(
  _request: NextRequest,
  {
    params,
  }: {
    params: Promise<{ id: string; turnId: string }>;
  }
) {
  const user = await getUser();
  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized", code: "UNAUTHORIZED" },
      { status: 401 }
    );
  }

  const { id: chatPublicId, turnId } = await params;
  const chat = await getChatByPublicId(chatPublicId, user.id);
  if (!chat) {
    return NextResponse.json(
      { error: "Chat not found", code: "CHAT_NOT_FOUND" },
      { status: 404 }
    );
  }

  const sourceRun = await getChatTurnRunById(turnId);
  if (!sourceRun || sourceRun.chatId !== chat.id || sourceRun.userId !== user.id) {
    return NextResponse.json(
      { error: "Turn run not found", code: "TURN_RUN_NOT_FOUND" },
      { status: 404 }
    );
  }

  if (sourceRun.status !== "failed") {
    return NextResponse.json(
      { error: "Only failed runs can be retried", code: "TURN_RUN_NOT_RETRYABLE" },
      { status: 409 }
    );
  }

  const hadRunning = Boolean(await getRunningChatTurnRun(chat.id));
  const retryRun = await enqueueChatTurnRun({
    chatId: chat.id,
    userId: user.id,
    idempotencyKey: `retry-${sourceRun.id}-${nanoid(10)}`,
    payload: sourceRun.payload ?? {},
  });

  await publishStreamEvents({
    chatId: chat.id,
    runId: retryRun.id,
    events: [
      {
        eventType: "run_enqueued",
        payload: {
          runId: retryRun.id,
          sequence: retryRun.sequence,
          retryOf: sourceRun.id,
          status: retryRun.status,
        },
      },
    ],
  });

  const processingEnabled = process.env.ENABLE_TRIGGER_CHAT_QUEUE === "1";
  if (!hadRunning && processingEnabled) {
    void triggerChatTurnTask(retryRun.id);
  }

  return NextResponse.json(
    {
      run: retryRun,
      queued: hadRunning,
      processingEnabled,
    },
    { status: 202 }
  );
}
