import { NextRequest, NextResponse } from "next/server";
import { getActiveStreamId } from "@/lib/streams/active-stream";
import { getChatByPublicId, getUser } from "@/lib/db/queries";

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
    return NextResponse.json(
      { error: "Unauthorized", active: false },
      { status: 401 }
    );
  }

  const { id: chatId } = await params;
  if (!chatId || typeof chatId !== "string") {
    return NextResponse.json(
      { error: "Invalid chat ID", active: false },
      { status: 400 }
    );
  }

  const chat = await getChatByPublicId(chatId, user.id);
  if (!chat) {
    return NextResponse.json(
      { error: "Chat not found", active: false },
      { status: 404 }
    );
  }

  const activeStreamId = await getActiveStreamId(chatId);
  const active = !!activeStreamId;

  return NextResponse.json({ active });
}
