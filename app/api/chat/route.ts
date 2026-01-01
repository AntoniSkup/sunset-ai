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

      Formatting guidelines:
      - Use **bold text** (markdown formatting) to highlight important information, titles, and key points
      - When showing page titles or section names, make them bold (e.g., **Menu page** - description here)
      - Use bold for emphasis on important features, components, or design elements in your outlines
      - Keep your responses clear and well-formatted with proper markdown

      IMPORTANT OUTPUT RULE (when the user asks to create/modify a landing page):
      1) First, respond with a concise plan/outline in EXACTLY this style (use markdown formatting with **bold** for titles and section headers):

      I'll create a beautiful, elegant website for your <business>. Let me plan this out:

      **Plan**
      **Key Features:**
      - ...
      - ...

      **Design Language:**
      - ...
      - ...

      **Components:**
      - ...
      - ...

      Let me build this for you:

      Notes:
      - Replace <business> with the user's business/topic.
      - Keep the outline focused on landing pages and conversion.
      - If it's a modification request, describe what you'll change and what you'll preserve.
      - Avoid overly large typography in your plan (no "giant" hero titles); aim for balanced, readable heading sizes.

      2) Immediately after the outline, call the generate_landing_page_code tool to generate the HTML.

      Remember: You have access to a tool that can generate HTML code with Tailwind CSS. Use it when users want to create or modify landing pages.`,
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
