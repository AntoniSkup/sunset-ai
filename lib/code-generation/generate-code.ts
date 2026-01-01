import { generateText, tool } from "ai";
import { nanoid } from "nanoid";
import { z } from "zod";
import { getAIModel } from "@/lib/ai/get-ai-model";
import { getUser } from "@/lib/db/queries";
import type { CodeGenerationRequest, CodeGenerationResult } from "./types";
import { validateAndFixCode } from "@/lib/code-generation/fix-code-errors";
import { saveCodeWithRetry } from "@/lib/code-generation/save-code";
import { getNextVersionNumber, getLatestVersion } from "@/lib/db/queries";
import { checkRateLimit } from "@/lib/code-generation/rate-limit";

export function buildCodeGenerationPrompt(
  userRequest: string,
  previousCodeVersion?: string,
  isModification?: boolean
): string {
  const cleanedPreviousCodeVersion = previousCodeVersion
    ?.trim()
    .startsWith("```")
    ? previousCodeVersion
        .trim()
        .replace(/^```[^\r\n]*\r?\n/, "")
        .replace(/\r?\n```$/, "")
        .replace(/```$/, "")
        .trim()
    : previousCodeVersion;

  const basePrompt = `You are an expert web developer specializing in creating beautiful, modern landing pages using HTML and Tailwind CSS.

Your task is to generate a complete, valid HTML document with Tailwind CSS classes for styling.

Requirements:
- Generate a complete HTML5 document (include <!DOCTYPE html>, <html>, <head>, and <body> tags)
- Use Tailwind CSS utility classes for all styling (e.g., bg-blue-500, text-white, p-4, flex, grid)
- Include Tailwind CSS via CDN: <script src="https://cdn.tailwindcss.com"></script>
- Use semantic HTML elements (header, nav, main, section, footer, etc.)
- Ensure accessibility (proper heading hierarchy, alt attributes for images, ARIA labels where needed)
- Make the design modern, responsive, and visually appealing
- Include proper spacing, typography, and color schemes
- The landing page should be complete and ready to render in a browser
- Output MUST be raw HTML only
- Do NOT wrap the output in Markdown code fences (no backticks, no \`\`\`html)
- The first characters of your response must be <!DOCTYPE html>

${
  isModification && cleanedPreviousCodeVersion
    ? `\nThis is a modification request. The previous code version is:\n\n${cleanedPreviousCodeVersion}\n\nPlease modify ONLY the parts requested by the user while preserving the rest of the structure and content.`
    : ""
}

User's request: ${userRequest}

Generate the complete HTML code now:`;

  return basePrompt;
}

export async function generateCodeWithAI(prompt: string): Promise<string> {
  const model = await getAIModel();

  const result = await generateText({
    model,
    prompt,
  });

  return result.text;
}

/**
 * Generates landing page code based on user request.
 *
 * Note: Preview loader is shown client-side when tool call starts (detected in Chat component).
 * See components/chat/chat.tsx for preview integration.
 */
export async function generateCode(
  request: CodeGenerationRequest,
  userId: number
): Promise<CodeGenerationResult> {
  try {
    const rateLimit = checkRateLimit(userId);
    if (!rateLimit.allowed) {
      const resetInSeconds = Math.ceil((rateLimit.resetAt - Date.now()) / 1000);
      return {
        success: false,
        error: `Rate limit exceeded. Please try again in ${resetInSeconds} seconds. Maximum 10 requests per minute.`,
      };
    }

    if (!request.userRequest || request.userRequest.trim().length === 0) {
      return {
        success: false,
        error: "User request cannot be empty",
      };
    }

    if (request.userRequest.length > 10000) {
      return {
        success: false,
        error: "User request exceeds maximum length of 10,000 characters",
      };
    }

    if (!request.sessionId || request.sessionId.trim().length === 0) {
      return {
        success: false,
        error: "Session ID is required",
      };
    }

    if (request.sessionId.length > 255) {
      return {
        success: false,
        error: "Session ID exceeds maximum length of 255 characters",
      };
    }

    let previousCode: string | undefined;
    if (request.isModification && request.previousCodeVersion) {
      previousCode = request.previousCodeVersion;
    } else if (request.isModification) {
      const latestVersion = await getLatestVersion(request.sessionId);
      if (latestVersion) {
        previousCode = latestVersion.codeContent;
      }
    }

    const prompt = buildCodeGenerationPrompt(
      request.userRequest,
      previousCode,
      request.isModification
    );

    const generatedCode = await generateCodeWithAI(prompt);

    if (!generatedCode || generatedCode.trim().length === 0) {
      console.error(
        `[Code Generation] Empty result for user ${userId}, session ${request.sessionId}`
      );
      return {
        success: false,
        error: "Code generation returned empty result",
      };
    }

    const validationResult = await validateAndFixCode(generatedCode);

    if (!validationResult.isValid && validationResult.errors.length > 0) {
      console.error(
        `[Code Generation] Validation failed for user ${userId}, session ${request.sessionId}: ${validationResult.errors.join(", ")}`
      );
      return {
        success: false,
        error: `Code validation failed: ${validationResult.errors.join(", ")}`,
      };
    }

    const versionNumber = await getNextVersionNumber(request.sessionId);

    const saveResult = await saveCodeWithRetry({
      userId,
      sessionId: request.sessionId,
      versionNumber,
      codeContent: validationResult.fixedCode,
    });

    if (!saveResult.success) {
      console.error(
        `[Code Generation] Save failed for user ${userId}, session ${request.sessionId}, version ${versionNumber}: ${saveResult.error}`
      );
      return {
        success: false,
        error: saveResult.error || "Failed to save code to database",
      };
    }

    return {
      success: true,
      versionId: saveResult.versionId,
      versionNumber,
      codeContent: validationResult.fixedCode,
      fixesApplied: validationResult.fixesApplied,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error occurred";
    console.error(
      `[Code Generation] Unexpected error for user ${userId}: ${errorMessage}`,
      error
    );
    return {
      success: false,
      error: `Code generation failed: ${errorMessage}`,
    };
  }
}

const generateLandingPageCodeSchema = z.object({
  userRequest: z
    .string()
    .min(1, "User request cannot be empty")
    .describe(
      "The user's natural language request describing the landing page they want to create or modify"
    ),
  isModification: z
    .boolean()
    .optional()
    .describe(
      "Whether this is a modification to an existing landing page (true) or a new landing page (false)"
    ),
  previousCodeVersion: z
    .string()
    .optional()
    .describe(
      "The previous version of the code if this is a modification request"
    ),
  sessionId: z
    .string()
    .optional()
    .describe(
      "Unique session identifier for version tracking. If not provided, a new session will be created."
    ),
});

export const generateLandingPageCodeTool = tool({
  description:
    "Generate HTML code with Tailwind CSS for landing pages. Use this when users request to create, build, or modify a landing page. Include conversation context and previous code versions for iterative refinement.",
  inputSchema: generateLandingPageCodeSchema,
  execute: async ({
    userRequest,
    isModification,
    previousCodeVersion,
    sessionId,
  }: z.infer<typeof generateLandingPageCodeSchema>) => {
    const user = await getUser();
    if (!user) {
      return {
        success: false,
        error: "User not authenticated",
      };
    }

    const finalSessionId = sessionId || `session-${user.id}-${nanoid()}`;

    const request: CodeGenerationRequest = {
      userRequest,
      isModification,
      previousCodeVersion,
      sessionId: finalSessionId,
    };

    const result = await generateCode(request, user.id);

    if (result.success) {
      return {
        success: true,
        versionId: result.versionId,
        versionNumber: result.versionNumber,
        codeContent: result.codeContent,
        fixesApplied: result.fixesApplied || [],
        sessionId: finalSessionId,
      };
    }

    return {
      success: false,
      error: result.error || "Code generation failed",
    };
  },
} as any);
