import { generateText, tool } from "ai";
import { z } from "zod";
import { getAIModel } from "@/lib/ai/get-ai-model";
import { getUser } from "@/lib/db/queries";
import type { CodeGenerationResult } from "./types";
import { parse } from "node-html-parser";
import {
  validateAndFixDocument,
  validateAndFixFragment,
} from "@/lib/code-generation/fix-code-errors";
import {
  createLandingSiteFileVersion,
  createLandingSiteRevision,
  getLatestLandingSiteFileContent,
  upsertLandingSiteFile,
} from "@/lib/db/queries";
import { checkRateLimit } from "@/lib/code-generation/rate-limit";
import {
  buildModificationContext,
  buildUserRequestSection,
  createSectionPrompt,
} from "@/prompts/tool-generate-code-prompt";

function normalizeDestinationPath(input: string): string | null {
  if (!input) return null;
  let p = String(input).trim();
  if (!p) return null;
  p = p.replace(/\\/g, "/");
  p = p.replace(/^\.\/+/, "");
  p = p.replace(/\/{2,}/g, "/");
  if (p.startsWith("/")) return null;
  if (p.includes("\0")) return null;
  if (p.split("/").some((seg) => seg === ".." || seg === "")) return null;
  if (!p.toLowerCase().endsWith(".html")) return null;
  return p;
}

function inferFileKind(destination: string): "layout" | "page" | "section" | "other" {
  const d = destination.toLowerCase();
  if (d === "landing/index.html") return "layout";
  if (d.startsWith("landing/pages/")) return "page";
  if (d.startsWith("landing/sections/")) return "section";
  return "other";
}

function isFragmentDestination(destination: string): boolean {
  const d = destination.toLowerCase();
  return d.startsWith("landing/pages/") || d.startsWith("landing/sections/");
}

function isIndexDestination(destination: string): boolean {
  return destination.toLowerCase() === "landing/index.html";
}

function enforceIndexShell(html: string): string {
  const includeLine = "<!-- include: landing/pages/home.html -->";

  const bodyRe = /(<body\b[^>]*>)([\s\S]*?)(<\/body>)/i;
  const match = html.match(bodyRe);
  if (!match) {
    return html;
  }

  const open = match[1];
  const close = match[3];
  const replacement = `${open}\n  ${includeLine}\n${close}`;
  return html.replace(bodyRe, replacement);
}

export function buildCodeGenerationPrompt(params: {
  destination: string;
  userRequest: string;
  previousCodeVersion?: string;
  isModification?: boolean;
}): string {
  const previousCodeVersion = params.previousCodeVersion;
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

  const basePrompt = createSectionPrompt();

  const modificationContext =
    params.isModification && cleanedPreviousCodeVersion
      ? buildModificationContext(cleanedPreviousCodeVersion)
      : "";

  const userRequestSection = buildUserRequestSection(
    `Destination: ${params.destination}\n\n${params.userRequest}`
  );

  return basePrompt + modificationContext + userRequestSection;
}

async function generateAndSaveSingleFile(params: {
  chatId: string;
  userId: number;
  destination: string;
  userRequest: string;
  isModification?: boolean;
}): Promise<
  | (CodeGenerationResult & {
    destination: string;
    revisionId?: number;
    revisionNumber?: number;
  })
  | { success: false; error: string }
> {
  try {
    const rateLimit = checkRateLimit(params.userId);
    if (!rateLimit.allowed) {
      const resetInSeconds = Math.ceil((rateLimit.resetAt - Date.now()) / 1000);
      return {
        success: false,
        error: `Rate limit exceeded. Please try again in ${resetInSeconds} seconds. Maximum 10 requests per minute.`,
      };
    }

    if (!params.userRequest || params.userRequest.trim().length === 0) {
      return {
        success: false,
        error: "User request cannot be empty",
      };
    }

    if (params.userRequest.length > 10000) {
      return {
        success: false,
        error: "User request exceeds maximum length of 10,000 characters",
      };
    }

    if (!params.chatId || params.chatId.trim().length === 0) {
      return {
        success: false,
        error: "Chat ID is required",
      };
    }

    if (params.chatId.length > 32) {
      return {
        success: false,
        error: "Chat ID exceeds maximum length of 32 characters",
      };
    }

    const normalizedDestination = normalizeDestinationPath(params.destination);
    if (!normalizedDestination) {
      return { success: false, error: "Invalid destination path" };
    }

    const inferredKind = inferFileKind(normalizedDestination);
    const treatAsFragment = isFragmentDestination(normalizedDestination);

    let previousCode: string | undefined;
    const shouldModify = params.isModification ?? false;
    if (shouldModify) {
      const latest = await getLatestLandingSiteFileContent(
        params.chatId,
        normalizedDestination
      );
      if (latest?.content) previousCode = latest.content;
    }

    const prompt = buildCodeGenerationPrompt({
      destination: normalizedDestination,
      userRequest: params.userRequest,
      previousCodeVersion: previousCode,
      isModification: shouldModify,
    });

    const model = await getAIModel();

    const result = await generateText({
      model,
      prompt,
    });

    const generatedCode = result.text;

    if (!generatedCode || generatedCode.trim().length === 0) {
      console.error(
        `[Code Generation] Empty result for user ${params.userId}, chat ${params.chatId}`
      );
      return {
        success: false,
        error: "Code generation returned empty result",
      };
    }

    const validationResult = treatAsFragment
      ? await validateAndFixFragment(generatedCode)
      : await validateAndFixDocument(generatedCode);

    if (!validationResult.isValid && validationResult.errors.length > 0) {
      console.error(
        `[Code Generation] Validation failed for user ${params.userId}, chat ${params.chatId}, dest ${normalizedDestination}: ${validationResult.errors.join(", ")}`
      );
      return {
        success: false,
        error: `Code validation failed: ${validationResult.errors.join(", ")}`,
      };
    }

    let finalCode = validationResult.fixedCode;

    if (isIndexDestination(normalizedDestination)) {
      finalCode = enforceIndexShell(finalCode);
      const revalidated = await validateAndFixDocument(finalCode);
      if (revalidated.isValid) {
        finalCode = revalidated.fixedCode;
      }
    } else if (!treatAsFragment) {
      try {
        const root = parse(finalCode);
        const nestedHtml = root.querySelector("html html");
        if (nestedHtml) {
          return {
            success: false,
            error:
              "Generated nested <html> tag. Page/section files should be fragments (no <html>/<head>/<body>).",
          };
        }
      } catch {
        // ignore
      }
    }

    const revision = await createLandingSiteRevision({
      chatId: params.chatId,
      userId: params.userId,
    });

    if (!revision?.id || !revision?.revisionNumber) {
      return {
        success: false,
        error: "Failed to create site revision",
      };
    }

    const file = await upsertLandingSiteFile({
      chatId: params.chatId,
      path: normalizedDestination,
      kind: inferredKind,
    });

    if (!file?.id) {
      return { success: false, error: "Failed to upsert site file" };
    }

    await createLandingSiteFileVersion({
      fileId: file.id,
      revisionId: revision.id,
      content: finalCode,
    });

    return {
      success: true,
      revisionId: revision.id,
      revisionNumber: revision.revisionNumber,
      codeContent: finalCode,
      fixesApplied: validationResult.fixesApplied,
      destination: normalizedDestination,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error occurred";
    console.error(
      `[Code Generation] Unexpected error for user ${params.userId}: ${errorMessage}`,
      error
    );
    return {
      success: false,
      error: `Code generation failed: ${errorMessage}`,
    };
  }
}

const createSiteSchema = z.object({
  userRequest: z
    .string()
    .min(1, "User request cannot be empty")
    .describe(
      "High-level description of the site (brand, goal, audience)"
    ),
});

const createSectionSchema = z.object({
  destination: z
    .string()
    .min(1, "Destination is required")
    .describe("Relative .html file path for this file (e.g. landing/sections/hero.html)"),
  userRequest: z
    .string()
    .min(1, "User request cannot be empty")
    .describe("Instructions for ONLY this file"),
  isModification: z
    .boolean()
    .optional()
    .describe("True when modifying existing destination; false when creating new"),
});

const createSiteToolExecute = async (
  { userRequest }: z.infer<typeof createSiteSchema>,
  chatId: string
): Promise<any> => {
  const user = await getUser();
  if (!user) {
    return {
      success: false,
      error: "User not authenticated",
    };
  }

  if (!chatId) {
    return { success: false, error: "Chat ID is required" };
  }

  const result = await generateAndSaveSingleFile({
    chatId,
    userId: user.id,
    destination: "landing/index.html",
    userRequest:
      userRequest +
      "\n\nCreate the entry layout document for the site.\n\nHard requirements:\n- Output a complete HTML document with <!DOCTYPE html>, <html>, <head>, and <body>\n- Include Tailwind via CDN in <head>\n- In <body>, compose the site using exactly this include comment as the main content:\n  <!-- include: landing/pages/home.html -->\n- Do not reference any other includes in landing/index.html",
    isModification: false,
  });

  if (result.success) {
    return {
      success: true,
      chatId,
      destination: result.destination,
      revisionId: (result as any).revisionId,
      revisionNumber: (result as any).revisionNumber,
    };
  }

  return { success: false, error: (result as any).error || "Site creation failed" };
};

const createSectionToolExecute = async (
  { destination, userRequest, isModification }: z.infer<typeof createSectionSchema>,
  chatId: string
): Promise<any> => {
  const user = await getUser();
  if (!user) {
    return {
      success: false,
      error: "User not authenticated",
    };
  }

  if (!chatId) {
    return { success: false, error: "Chat ID is required" };
  }

  const result = await generateAndSaveSingleFile({
    chatId,
    userId: user.id,
    destination,
    userRequest,
    isModification,
  });

  if (result.success) {
    return {
      success: true,
      chatId,
      destination: (result as any).destination,
      revisionId: (result as any).revisionId,
      revisionNumber: (result as any).revisionNumber,
    };
  }

  return {
    success: false,
    error: (result as any).error || "Section creation failed",
  };
};


// export function createGenerateLandingPageTool(chatId: string) {
//   return tool({
//     description:
//       "Generate HTML code with Tailwind CSS for landing pages. Use this when users request to create, build, or modify a landing page. Include conversation context and previous code versions for iterative refinement.",
//     inputSchema: generateLandingPageCodeSchema,
//     execute: async (input: z.infer<typeof generateLandingPageCodeSchema>) => {
//       return generateCodeToolExecute(input, chatId);
//     },
//   } as any);
// }

export function createSiteTool(chatId: string) {
  return tool({
    description:
      "Create a new index.html using the provided brand, goal, and audience, and return a siteId plus any initialized defaults (e.g., theme tokens, pages scaffold) so other tools can add pages/sections to it.",
    inputSchema: createSiteSchema,
    execute: async (input: z.infer<typeof createSiteSchema>) => {
      return createSiteToolExecute(input, chatId);
    },
  } as any);
}


export function createSectionTool(chatId: string) {
  return tool({
    description:
      "Create or modify exactly one HTML file (layout/page/section) for the landing site. One tool call writes exactly one file.",
    inputSchema: createSectionSchema,
    execute: async (input: z.infer<typeof createSectionSchema>) => {
      return createSectionToolExecute(input, chatId);
    },
  } as any);
}
