import { generateText, tool } from "ai";
import { z } from "zod";
import { transform } from "esbuild";
import { getAIModel } from "@/lib/ai/get-ai-model";
import { getOrCreateAccountForUser } from "@/lib/billing/accounts";
import { runWithCredits } from "@/lib/credits/run-with-credits";
import { InsufficientCreditsError } from "@/lib/credits/debit";
import type { CodeGenerationResult, CodeValidationResult } from "./types";
import { parse } from "node-html-parser";
import {
  validateAndFixDocument,
  validateAndFixFragment,
  stripMarkdownCodeFences,
} from "@/lib/code-generation/fix-code-errors";
import {
  createLandingSiteFileVersion,
  createLandingSiteRevision,
  getExistingLandingSiteFilesContent,
  getLatestLandingSiteFileContent,
  getSiteAssetsByChatId,
  upsertLandingSiteFile,
} from "@/lib/db/queries";
import { checkRateLimit } from "@/lib/code-generation/rate-limit";
import {
  buildExistingSectionsContext,
  buildSiteAssetContextSection,
  buildModificationContext,
  buildUserRequestSection,
  createSectionPrompt,
} from "@/prompts/tool-generate-code-prompt";
import {
  buildSiteAssetPromptContext,
  toSiteAssetPromptDescriptors,
} from "@/lib/site-assets/prompt-manifest";
import {
  validateCompleteness,
  validateUiConsistency,
} from "@/lib/code-generation/validation";
import { resolveImageSlots } from "@/lib/site-assets/resolve-image-slots";

const DEBUG_SITE_IMAGES = process.env.DEBUG_SITE_IMAGES === "1";

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
  const lower = p.toLowerCase();
  if (!lower.endsWith(".html") && !lower.endsWith(".tsx")) return null;
  if (lower.startsWith("landing/_runtime/")) return null;
  return p;
}

function inferFileKind(destination: string): "layout" | "page" | "section" | "other" {
  const d = destination.toLowerCase();
  if (d === "landing/index.html" || d === "landing/index.tsx") return "layout";
  if (d.startsWith("landing/pages/")) return "page";
  if (d.startsWith("landing/sections/")) return "section";
  return "other";
}

function isFragmentDestination(destination: string): boolean {
  const d = destination.toLowerCase();
  return d.startsWith("landing/pages/") || d.startsWith("landing/sections/");
}

function isIndexDestination(destination: string): boolean {
  const d = destination.toLowerCase();
  return d === "landing/index.html" || d === "landing/index.tsx";
}

function isLandingPageOrSectionDestination(destination: string): boolean {
  const d = destination.toLowerCase();
  return d.startsWith("landing/pages/") || d.startsWith("landing/sections/");
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

function validateReactCode(code: string): CodeValidationResult {
  const { code: stripped, stripped: wasStripped } = stripMarkdownCodeFences(code);
  const trimmed = stripped.trim();
  if (!trimmed) {
    return {
      isValid: false,
      fixedCode: code,
      fixesApplied: [],
      errors: ["Generated code is empty or only contained markdown fences"],
    };
  }

  const fixesApplied = wasStripped ? ["Stripped markdown code fences"] : [];
  return {
    isValid: true,
    fixedCode: trimmed,
    fixesApplied,
    errors: [],
  };
}

async function validateAndFixReactCode(code: string): Promise<CodeValidationResult> {
  const base = validateReactCode(code);
  if (!base.isValid) return base;

  const tryParse = async (input: string) => {
    await transform(input, {
      loader: "tsx",
      format: "esm",
      target: "es2020",
      sourcemap: false,
    });
  };

  try {
    await tryParse(base.fixedCode);
    return base;
  } catch (err) {
    const parseError =
      err instanceof Error ? err.message : "Invalid TSX syntax generated";

    // Minimal heuristic: escape apostrophes in contractions inside single-quoted literals.
    const escapedContractions = base.fixedCode.replace(
      /([A-Za-z])'([A-Za-z])/g,
      "$1\\'$2"
    );

    if (escapedContractions !== base.fixedCode) {
      try {
        await tryParse(escapedContractions);
        return {
          isValid: true,
          fixedCode: escapedContractions,
          fixesApplied: [
            ...base.fixesApplied,
            "Escaped apostrophes in contractions for valid TSX",
          ],
          errors: [],
        };
      } catch (fixErr) {
        const fixError =
          fixErr instanceof Error ? fixErr.message : "Invalid TSX syntax after fix";
        return {
          isValid: false,
          fixedCode: base.fixedCode,
          fixesApplied: base.fixesApplied,
          errors: [parseError, fixError],
        };
      }
    }

    return {
      isValid: false,
      fixedCode: base.fixedCode,
      fixesApplied: base.fixesApplied,
      errors: [parseError],
    };
  }
}

export function buildCodeGenerationPrompt(params: {
  destination: string;
  userRequest: string;
  previousCodeVersion?: string;
  isModification?: boolean;
  existingSections?: Array<{ path: string; content: string }>;
  siteAssetContext?: string;
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

  const existingSectionsContext = params.existingSections?.length
    ? buildExistingSectionsContext(params.existingSections)
    : "";
  const siteAssetContext = buildSiteAssetContextSection(params.siteAssetContext);

  const userRequestSection = buildUserRequestSection(
    `Destination: ${params.destination}\n\n${params.userRequest}`
  );

  const tsxSafetyInstruction = params.destination.toLowerCase().endsWith(".tsx")
    ? "\nTypeScript/TSX string literal safety:\n- Prefer double-quoted strings for text content.\n- If you use single-quoted strings, escape apostrophes (e.g. what\\'s).\n"
    : "";

  return (
    basePrompt +
    modificationContext +
    existingSectionsContext +
    siteAssetContext +
    userRequestSection +
    tsxSafetyInstruction
  );
}

type EnsureChargedForAction = (actionType: string) => Promise<void>;

type GenerateAndSaveSingleFileResult =
  | (CodeGenerationResult & {
      destination: string;
      revisionId?: number;
      revisionNumber?: number;
    })
  | { success: false; error: string };

async function generateAndSaveSingleFile(params: {
  chatId: string;
  userId: number;
  destination: string;
  userRequest: string;
  isModification?: boolean;
  ensureChargedForAction?: EnsureChargedForAction;
}): Promise<GenerateAndSaveSingleFileResult> {
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
    const actionType =
      inferredKind === "section" ? "regenerate_section" : "generate_page";

    const account = params.ensureChargedForAction
      ? null
      : await getOrCreateAccountForUser(params.userId);
    const idempotencyKey = `codegen-${params.chatId}-${normalizedDestination}-${Date.now()}`;

    let previousCode: string | undefined;
    const shouldModify = params.isModification ?? false;
    if (shouldModify) {
      const latest = await getLatestLandingSiteFileContent(
        params.chatId,
        normalizedDestination
      );
      if (latest?.content) previousCode = latest.content;
    }

    let existingSections: Array<{ path: string; content: string }> = [];
    if (!shouldModify) {
      existingSections = await getExistingLandingSiteFilesContent(
        params.chatId,
        normalizedDestination
      );
    }

    const promptableSiteAssets = toSiteAssetPromptDescriptors(
      await getSiteAssetsByChatId(params.chatId, params.userId)
    );
    const siteAssetContext = buildSiteAssetPromptContext(promptableSiteAssets);
    if (DEBUG_SITE_IMAGES) {
      console.log("[site-images] codegen assets", {
        chatId: params.chatId,
        destination: normalizedDestination,
        assetCount: promptableSiteAssets.length,
        assets: promptableSiteAssets.map((asset) => ({
          alias: asset.alias,
          sourceType: asset.sourceType ?? "upload",
          slotKey: asset.slotKey ?? null,
          intent: asset.intent,
          label: asset.label ?? null,
        })),
      });
    }

    const executeGeneration =
      async (): Promise<GenerateAndSaveSingleFileResult> => {
      const prompt = buildCodeGenerationPrompt({
        destination: normalizedDestination,
        userRequest: params.userRequest,
        previousCodeVersion: previousCode,
        isModification: shouldModify,
        existingSections:
          existingSections.length > 0 ? existingSections : undefined,
        siteAssetContext,
      });

      const model = await getAIModel();

      const genResult = await generateText({
        model,
        prompt,
        experimental_telemetry: {
          isEnabled: true,
          functionId: "code-generation",
          metadata: {
            chatId: params.chatId,
            userId: params.userId,
            destination: normalizedDestination,
          },
        },
      });

      const generatedCode = genResult.text;

      if (!generatedCode || generatedCode.trim().length === 0) {
        console.error(
          `[Code Generation] Empty result for user ${params.userId}, chat ${params.chatId}`
        );
        return {
          success: false,
          error: "Code generation returned empty result",
        };
      }

      const isTsx = normalizedDestination.toLowerCase().endsWith(".tsx");
      const validationResult = isTsx
        ? await validateAndFixReactCode(generatedCode)
        : treatAsFragment
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

      if (isIndexDestination(normalizedDestination) && !isTsx) {
        finalCode = enforceIndexShell(finalCode);
        const revalidated = await validateAndFixDocument(finalCode);
        if (revalidated.isValid) {
          finalCode = revalidated.fixedCode;
        }
      } else if (!treatAsFragment && !isTsx) {
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
    };

    try {
      if (params.ensureChargedForAction) {
        await params.ensureChargedForAction(actionType);
        return await executeGeneration();
      }

      return await runWithCredits(
        {
          accountId: account!.id,
          userId: params.userId,
          actionType,
          idempotencyKey,
        },
        executeGeneration
      );
    } catch (err) {
      if (err instanceof InsufficientCreditsError) {
        return {
          success: false,
          error:
            "Insufficient credits. Please upgrade your plan or buy more credits.",
        };
      }
      throw err;
    }
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
    .describe(
      "Relative .tsx file path for this file (e.g. landing/sections/Hero.tsx, landing/pages/Home.tsx)"
    ),
  userRequest: z
    .string()
    .min(1, "User request cannot be empty")
    .describe("Instructions for ONLY this file"),
  isModification: z
    .boolean()
    .optional()
    .describe("True when modifying existing destination; false when creating new"),
});

const validateCompletenessSchema = z.object({
  siteSpec: z
    .string()
    .optional()
    .describe(
      "Optional concise statement of what the site should include (pages, sections, key requirements). Used by LLM semantic completeness validation."
    ),
});

const validateUiConsistencySchema = z.object({
  includeScreenshot: z
    .boolean()
    .optional()
    .describe(
      "Set true to enable optional screenshot-assisted checks when enabled by server config."
    ),
});

const resolveImageSlotsSchema = z.object({
  pageGoal: z
    .string()
    .min(1, "Page goal is required")
    .describe("What this page is trying to achieve for the user or business."),
  brandStyle: z
    .string()
    .optional()
    .describe("Optional concise art-direction guidance for the imagery."),
  slots: z
    .array(
      z.object({
        slotKey: z
          .string()
          .min(1, "slotKey is required")
          .describe("Stable image slot identifier like hero, feature-1, gallery-2."),
        purpose: z
          .string()
          .min(1, "purpose is required")
          .describe("What the image should communicate in the layout."),
        query: z
          .string()
          .min(1, "query is required")
          .describe(
            "Short targeted stock-search query for this single image slot. Use 2-6 concrete keywords, not full sentences or the entire page brief."
          ),
        orientation: z
          .enum(["landscape", "portrait", "square"])
          .optional()
          .describe("Preferred image orientation for the slot."),
        count: z
          .number()
          .int()
          .min(1)
          .max(3)
          .optional()
          .describe("How many candidate images to search for internally."),
      })
    )
    .min(1)
    .max(6)
    .describe("Batched image slots to resolve before section generation."),
});

const createSiteToolExecute = async (
  { userRequest }: z.infer<typeof createSiteSchema>,
  chatId: string,
  userId: number,
  ensureChargedForAction?: EnsureChargedForAction
): Promise<any> => {
  if (!chatId) {
    return { success: false, error: "Chat ID is required" };
  }

  const result = await generateAndSaveSingleFile({
    chatId,
    userId,
    destination: "landing/index.tsx",
    userRequest:
      userRequest +
      "\n\nCreate the entry React component for the site (landing/index.tsx) as a WIREFRAME ONLY.\n\nHard requirements:\n- Use React Router: import { HashRouter, Routes, Route } from 'react-router-dom'. Wrap the whole app in <HashRouter>.\n- Put page content inside <Routes>. Only create Route entries for pages that are actually part of the current site plan. If only Home exists, include only <Route path=\"/\" element={<Home />} />.\n- Import and render ONLY: Navbar from './sections/Navbar', Footer from './sections/Footer', and the page components that really exist under './pages/...'. Do not import About, Contact, or any other page unless that page is part of the current site plan.\n- Structure: <HashRouter><div><Navbar /><main><Routes>...</Routes></main><Footer /></div></HashRouter>.\n- Do NOT use window.location.hash or manual switch; use HashRouter and Routes only.\n- Do NOT output <!DOCTYPE html>, <html>, <head>, or <body>; the app wraps your component.\n- Use Tailwind utility classes (className).",
    isModification: false,
    ensureChargedForAction,
  });

  if (result.success) {
    return {
      success: true,
      chatId,
      destination: result.destination,
      revisionId: (result as any).revisionId,
      revisionNumber: (result as any).revisionNumber,
      codeContent: (result as any).codeContent,
    };
  }

  return { success: false, error: (result as any).error || "Site creation failed" };
};

const createSectionToolExecute = async (
  { destination, userRequest, isModification }: z.infer<typeof createSectionSchema>,
  chatId: string,
  userId: number,
  ensureChargedForAction?: EnsureChargedForAction
): Promise<any> => {
  if (!chatId) {
    return { success: false, error: "Chat ID is required" };
  }

  const normalizedDestination = normalizeDestinationPath(destination);
  if (!normalizedDestination) {
    return { success: false, error: "Invalid destination path" };
  }

  if (isLandingPageOrSectionDestination(normalizedDestination)) {
    const existingIndex = await getLatestLandingSiteFileContent(
      chatId,
      "landing/index.tsx"
    );

    if (!existingIndex?.content?.trim()) {
      return {
        success: false,
        error:
          "Core layout is missing. Create landing/index.tsx first with create_site, then create landing/pages/* and landing/sections/* files.",
      };
    }
  }

  const result = await generateAndSaveSingleFile({
    chatId,
    userId,
    destination: normalizedDestination,
    userRequest,
    isModification,
    ensureChargedForAction,
  });

  if (result.success) {
    return {
      success: true,
      chatId,
      destination: (result as any).destination,
      revisionId: (result as any).revisionId,
      revisionNumber: (result as any).revisionNumber,
      codeContent: (result as any).codeContent,
    };
  }

  return {
    success: false,
    error: (result as any).error || "Section creation failed",
  };
};

const validateCompletenessToolExecute = async (
  input: z.infer<typeof validateCompletenessSchema>,
  chatId: string,
  _userId: number,
  ensureChargedForAction?: EnsureChargedForAction
): Promise<any> => {
  if (!chatId) {
    return { success: false, error: "Chat ID is required" };
  }
  console.log("[tool] validate_completeness called", {
    chatId,
    hasSiteSpec: Boolean(input?.siteSpec?.trim()),
  });
  if (ensureChargedForAction) {
    await ensureChargedForAction("validate_site_completeness");
  }
  return validateCompleteness({
    chatId,
    siteSpec: input?.siteSpec,
  });
};

const validateUiConsistencyToolExecute = async (
  input: z.infer<typeof validateUiConsistencySchema>,
  chatId: string,
  _userId: number,
  ensureChargedForAction?: EnsureChargedForAction
): Promise<any> => {
  if (!chatId) {
    return { success: false, error: "Chat ID is required" };
  }
  if (ensureChargedForAction) {
    await ensureChargedForAction("validate_site_ui");
  }
  return validateUiConsistency({
    chatId,
    includeScreenshot: Boolean(input?.includeScreenshot),
  });
};

const resolveImageSlotsToolExecute = async (
  input: z.infer<typeof resolveImageSlotsSchema>,
  chatId: string,
  userId: number,
  ensureChargedForAction?: EnsureChargedForAction
): Promise<any> => {
  if (!chatId) {
    return { success: false, error: "Chat ID is required" };
  }
  if (ensureChargedForAction) {
    await ensureChargedForAction("resolve_site_images");
  }

  const result = await resolveImageSlots({
    chatId,
    userId,
    pageGoal: input.pageGoal,
    brandStyle: input.brandStyle,
    slots: input.slots,
  });

  return {
    success: true,
    chatId,
    resolved: result.resolved,
    unresolved: result.unresolved,
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

export function createSiteTool(
  chatId: string,
  userId: number,
  ensureChargedForAction?: EnsureChargedForAction
) {
  return tool({
    description:
      "Create the entry React component (landing/index.tsx) for a new site as a WIREFRAME ONLY. The file must import Navbar from './sections/Navbar', Footer from './sections/Footer', and page(s) from './pages/...', and render only those components (no inline navbar/footer markup). Call once at the start of building a new website.",
    inputSchema: createSiteSchema,
    execute: async (input: z.infer<typeof createSiteSchema>) => {
      return createSiteToolExecute(
        input,
        chatId,
        userId,
        ensureChargedForAction
      );
    },
  } as any);
}


export function createSectionTool(
  chatId: string,
  userId: number,
  ensureChargedForAction?: EnsureChargedForAction
) {
  return tool({
    description:
      "Create or modify exactly one React/TSX file (layout, page, or section) for the landing site. One tool call writes exactly one file. Use .tsx paths (e.g. landing/sections/Hero.tsx, landing/pages/Home.tsx). For landing/pages/* and landing/sections/*, landing/index.tsx must already exist (create it first with create_site).",
    inputSchema: createSectionSchema,
    execute: async (input: z.infer<typeof createSectionSchema>) => {
      return createSectionToolExecute(
        input,
        chatId,
        userId,
        ensureChargedForAction
      );
    },
  } as any);
}

export function createValidateCompletenessTool(
  chatId: string,
  userId: number,
  ensureChargedForAction?: EnsureChargedForAction
) {
  return tool({
    description:
      "Validate generated landing site completeness after all files are created. Uses deterministic checks plus an LLM semantic review to detect missing files, unresolved imports, missing requested sections/pages, and composition gaps.",
    inputSchema: validateCompletenessSchema,
    execute: async (input: z.infer<typeof validateCompletenessSchema>) => {
      return validateCompletenessToolExecute(
        input,
        chatId,
        userId,
        ensureChargedForAction
      );
    },
  } as any);
}

export function createValidateUiConsistencyTool(
  chatId: string,
  userId: number,
  ensureChargedForAction?: EnsureChargedForAction
) {
  return tool({
    description:
      "Validate landing page UI consistency and detect visual/code oddities after completeness passes. Can optionally include screenshot-assisted checks.",
    inputSchema: validateUiConsistencySchema,
    execute: async (input: z.infer<typeof validateUiConsistencySchema>) => {
      return validateUiConsistencyToolExecute(
        input,
        chatId,
        userId,
        ensureChargedForAction
      );
    },
  } as any);
}

export function createResolveImageSlotsTool(
  chatId: string,
  userId: number,
  ensureChargedForAction?: EnsureChargedForAction
) {
  return tool({
    description:
      "Resolve a batch of landing-page image slots using uploaded assets first and stock images second. Use this before generating image-heavy sections so the page can render stable aliased assets via ImageAsset.",
    inputSchema: resolveImageSlotsSchema,
    execute: async (input: z.infer<typeof resolveImageSlotsSchema>) => {
      return resolveImageSlotsToolExecute(
        input,
        chatId,
        userId,
        ensureChargedForAction
      );
    },
  } as any);
}
