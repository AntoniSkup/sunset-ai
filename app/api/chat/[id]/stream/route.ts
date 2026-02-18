import { NextRequest } from "next/server";
import { after } from "next/server";
import { UI_MESSAGE_STREAM_HEADERS } from "ai";
import { createResumableStreamContext } from "resumable-stream";
import { getChatByPublicId, getUser } from "@/lib/db/queries";
import {
  clearActiveStreamId,
  getActiveStreamId,
} from "@/lib/streams/active-stream";

export async function GET(
  _request: NextRequest,
  {
    params,
  }: {
    params: Promise<{ id: string }>;
  }
) {
  const user = await getUser();

  if (!user) {
    return new Response(null, { status: 401 });
  }

  const { id: chatId } = await params;
  if (!chatId || typeof chatId !== "string") {
    return new Response(null, { status: 400 });
  }

  const chat = await getChatByPublicId(chatId, user.id);
  if (!chat) {
    return new Response(null, { status: 404 });
  }

  const activeStreamId = await getActiveStreamId(chatId);
  if (!activeStreamId) {
    return new Response(null, { status: 204 });
  }

  const streamContext = createResumableStreamContext({ waitUntil: after });
  const resumed = await streamContext.resumeExistingStream(activeStreamId);

  if (!resumed) {
    await clearActiveStreamId(chatId, activeStreamId);
    return new Response(null, { status: 204 });
  }

  const body = resumed.pipeThrough(new TextEncoderStream());
  return new Response(body, { headers: UI_MESSAGE_STREAM_HEADERS });
}

