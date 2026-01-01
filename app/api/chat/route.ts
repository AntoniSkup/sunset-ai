import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/db/queries";
import { streamText, convertToModelMessages } from "ai";
import type { UIMessage } from "ai";
import { generateLandingPageCodeTool } from "@/lib/code-generation/generate-code";
import { getAIModel } from "@/lib/ai/get-ai-model";

const requestQueues = new Map<string, Promise<void>>();

async function processRequestQueue(sessionId: string): Promise<void> {
  const queue = requestQueues.get(sessionId);
  if (queue) {
    await queue;
  }
}

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
    const { messages } = body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(
        { error: "Invalid messages", code: "INVALID_MESSAGE" },
        { status: 400 }
      );
    }

    const model = await getAIModel();

    const modelMessages = await convertToModelMessages(
      messages as Array<Omit<UIMessage, "id">>
    );

    const tools = {
      generate_landing_page_code: generateLandingPageCodeTool,
    };

    console.log(
      "Tool definition:",
      JSON.stringify(tools.generate_landing_page_code, null, 2)
    );

    const result = streamText({
      model,
      messages: modelMessages,
      tools,
    });

    return result.toUIMessageStreamResponse();
  } catch (error) {
    console.error("Chat API error:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json(
      { error: errorMessage, code: "AI_SERVICE_ERROR" },
      { status: 500 }
    );
  }
}
