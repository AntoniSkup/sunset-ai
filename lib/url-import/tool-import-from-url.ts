import { tool } from "@/lib/ai/langsmith-ai";
import { z } from "zod";
import { importFromUrl } from "./import-from-url";

/**
 * `import_from_url` LLM tool.
 *
 * Lets the model fetch a reference website when the user pastes a link
 * and asks to clone, copy, take inspiration from, or extract content
 * from it. The model picks one of two modes:
 *
 *   - "content"     → return the page's main copy/structure as
 *                     truncated markdown. Used when the user wants to
 *                     reuse text/sections (e.g. "use the about-us copy
 *                     from this page on my site").
 *   - "inspiration" → return only structural + branding signal plus a
 *                     persisted screenshot. Used when the user wants
 *                     the *look*, not the words. The model MUST write
 *                     fresh copy in this mode.
 *
 * Token budget is enforced server-side: the model never sees raw HTML,
 * and even markdown is hard-truncated. Results are persisted per chat,
 * so re-asking the same URL+mode in the same chat costs zero credits.
 */

const importFromUrlSchema = z.object({
  url: z
    .string()
    .min(1)
    .describe(
      "Public http(s) URL of the website the user wants to draw from. Private/loopback hosts are rejected."
    ),
  mode: z
    .enum(["content", "inspiration"])
    .describe(
      "'content' = pull the page's main copy and structure to reuse on the user's site. 'inspiration' = study layout/branding/aesthetic but do NOT verbatim-copy text. Pick 'inspiration' by default; only pick 'content' when the user explicitly asks to copy or import the wording."
    ),
  focus: z
    .string()
    .max(120)
    .optional()
    .describe(
      "Optional one-line hint about what part of the page matters most (e.g. 'pricing tiers', 'hero copy', 'feature grid')."
    ),
});

export function createImportFromUrlTool(chatId: string, userId: number) {
  return tool({
    description:
      "Fetch a reference website the user linked to. Use when the user pastes a URL and asks to clone, copy, take inspiration from, mimic, or pull content/copy from another site. Returns a compact, token-budgeted summary (truncated markdown for 'content' mode; structural/branding signal + screenshot for 'inspiration' mode). Never returns raw HTML. Results are cached per chat — calling twice with the same URL+mode is free. Default to mode='inspiration' unless the user explicitly asks to copy text/content. In 'inspiration' mode, you MUST write fresh copy on the generated site, not verbatim-copy the source.",
    inputSchema: importFromUrlSchema,
    execute: async (input: z.infer<typeof importFromUrlSchema>) => {
      return importFromUrl({
        url: input.url,
        mode: input.mode,
        chatId,
        userId,
      });
    },
  } as any);
}
