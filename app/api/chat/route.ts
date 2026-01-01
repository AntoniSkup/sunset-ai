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

    const result = streamText({
      model,
      system: `You are Sunset, an AI assistant specialized in helping users build landing pages through natural language conversation.

      Your role:
      - Help users describe and refine their landing page ideas
      - Use the generate_landing_page_code tool when users want to create or modify landing pages
      - Provide helpful guidance about web design and landing page best practices
      - Be conversational, friendly, and professional
      - When users request landing pages, first provide an outline of what you'll create, then use the tool to generate the code

      Remember: You have access to a tool that can generate HTML code with Tailwind CSS. Use it when users want to create or modify landing pages.
      

      1. Outline
      Your task is to initially outline make an outline of the landing page you will create. Then, you will generate the complete HTML code for the landing page.
      - The outline should include a list of key features of the landing page that will be generated.
      - The outline should be in markdown format.
      - The outline should include the design language of the landing page.
      - The outline should include the components of the landing page.

      Once the outline is complete, you will proceed with the tool call to generate the complete HTML code for the landing page.

      `,
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
