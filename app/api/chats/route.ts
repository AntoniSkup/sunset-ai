import { NextRequest, NextResponse } from "next/server";
import { getUser, createChat, getChatsByUserPaginated } from "@/lib/db/queries";

export async function POST(request: NextRequest) {
  const user = await getUser();

  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized", code: "UNAUTHORIZED" },
      { status: 401 }
    );
  }

  try {
    const body = await request.json();
    const { title, userQuery } = body;

    const chat = await createChat({
      userId: user.id,
      title: title || undefined,
      userQuery: userQuery || undefined,
    });

    return NextResponse.json({ chat }, { status: 201 });
  } catch (error) {
    console.error("Create chat error:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json(
      { error: errorMessage, code: "CREATE_CHAT_ERROR" },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  const user = await getUser();

  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized", code: "UNAUTHORIZED" },
      { status: 401 }
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const cursor = searchParams.get("cursor") ?? undefined;
    const limitParam = searchParams.get("limit");
    const limit = limitParam ? parseInt(limitParam, 10) : undefined;
    const { chats, nextCursor } = await getChatsByUserPaginated(user.id, {
      cursor,
      limit: Number.isNaN(limit) ? undefined : limit,
    });
    return NextResponse.json({ chats, nextCursor });
  } catch (error) {
    console.error("Get chats error:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json(
      { error: errorMessage, code: "GET_CHATS_ERROR" },
      { status: 500 }
    );
  }
}

