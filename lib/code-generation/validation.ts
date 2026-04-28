import {
  getExistingLandingSiteFilesContent,
  getLatestLandingSiteRevision,
} from "@/lib/db/queries";
import { createRenderSnapshotToken } from "@/lib/render-snapshot-token";
import { getScreenshotCaptureOrigin } from "@/lib/screenshots/public-app-origin";
import { captureUrlWithScreenshotOne } from "@/lib/screenshots/screenshot-one-url";
import { generateText } from "ai";
import { getAIModel } from "@/lib/ai/get-ai-model";
import { z } from "zod";
import { buildCompletenessValidationPrompt } from "@/prompts/tool-validate-completeness-prompt";
import {
  IMAGE_ASSET_COMPONENT_PATH,
  IMAGE_ASSET_MAP_PATH,
} from "@/lib/site-assets/conventions";

export type ValidationSeverity = "critical" | "warning";

export interface ValidationFinding {
  severity: ValidationSeverity;
  issueCode: string;
  message: string;
  path?: string;
  suggestedFix?: string;
}

export interface ValidationToolResult {
  success: boolean;
  status: "pass" | "fail";
  reportType: "completeness" | "ui_consistency";
  summary: string;
  criticalFindings: ValidationFinding[];
  warningFindings: ValidationFinding[];
  nextAction: "continue_fixing" | "proceed_to_next_validator" | "finish";
  score?: number;
  metadata?: Record<string, unknown>;
  error?: string;
}

type SiteFile = { path: string; content: string };
const MAX_SITE_SNAPSHOT_CHARS = 60_000;

const IMPORT_RE =
  /import\s+(?:\*\s+as\s+\w+|\{[^}]*\}|\w+)\s+from\s+['"]([^'"]+)['"]|import\s+['"]([^'"]+)['"]/g;

/**
 * Capture every static `import` statement so we can validate not just that the
 * target file exists (covered by `extractRelativeImports`) but that every
 * *named* symbol it brings in is actually exported by the target. Bug we
 * repeatedly hit: the LLM generates Navbar.tsx with
 * `import { colorBgNavbar, colorTextNavbar } from "../theme"` while
 * theme.tsx only exports `colorBgBase`, `colorBgSurface`, etc. esbuild then
 * fails with "No matching export ..." — the bundle endpoint returns 500 and
 * the iframe paints a generic "failed to load script" message that hides the
 * real cause. Catching this here surfaces the four missing names as critical
 * findings on the completeness card so the AI repair loop fixes them before
 * the user ever sees a broken preview.
 *
 * Captures:
 *   1: full clause between `import ` and ` from ` (default ident, `* as ns`,
 *      `{ a, b as c }`, or any combination, possibly multi-line)
 *   2: module specifier
 */
const ANY_IMPORT_RE =
  /import\s+([\s\S]*?)\s+from\s+['"]([^'"]+)['"]/g;
const MOTION_REACT_IMPORT_RE = /from\s+["']motion\/react["']/;
const MOTION_ELEMENT_RE = /<motion\.[A-Za-z][\w]*/g;
const ANIMATE_PRESENCE_RE = /<AnimatePresence\b/g;
const TAILWIND_ANIMATION_RE = /\banimate-[\w:-]+/g;
const ARBITRARY_ANIMATION_RE = /\[animation:[^\]]+\]/g;
const INLINE_ANIMATION_STYLE_RE = /\banimation\s*:/g;
const INLINE_FONT_FAMILY_RE = /\bfontFamily\s*:/g;
const ARBITRARY_FONT_CLASS_RE = /\bfont-\[[^\]]+\]/g;
const THEME_FILE_PATH = "landing/theme.tsx";

function normalizePath(input: string): string {
  return input.replace(/\\/g, "/").replace(/\/{2,}/g, "/");
}

function resolveImportPath(fromPath: string, importSpec: string): string | null {
  const spec = importSpec.trim();
  if (!spec || !spec.startsWith(".")) return null;
  const fromParts = normalizePath(fromPath).split("/");
  fromParts.pop();
  const segs = spec.split("/");
  const out = [...fromParts];
  for (const seg of segs) {
    if (!seg || seg === ".") continue;
    if (seg === "..") {
      out.pop();
      continue;
    }
    out.push(seg);
  }
  let resolved = out.join("/");
  if (!/\.(tsx|ts|jsx)$/i.test(resolved)) {
    resolved += ".tsx";
  }
  return normalizePath(resolved);
}

function extractRelativeImports(content: string): string[] {
  const imports: string[] = [];
  IMPORT_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = IMPORT_RE.exec(content)) !== null) {
    const spec = (match[1] ?? match[2] ?? "").trim();
    if (spec.startsWith("./") || spec.startsWith("../")) {
      imports.push(spec);
    }
  }
  return imports;
}

interface ParsedImport {
  /** e.g. `../theme`, `./Hero`, `react-router-dom` */
  spec: string;
  /** Imported named symbols (after stripping `type` specifiers and `as` aliases). */
  named: string[];
  /** True if the statement uses a default import (`import X from '...'`). */
  hasDefault: boolean;
  /** True for `import * as ns from '...'` — we only check that the target exists. */
  isNamespace: boolean;
  /** True for `import type { ... } from '...'` — we skip these entirely (TS-erased). */
  isTypeOnly: boolean;
}

/**
 * Parse all static `import` statements in a file and return a structured view
 * of each one. Type-only imports (`import type { X }`) are flagged so callers
 * can skip them — they don't need a runtime export.
 */
function parseImports(content: string): ParsedImport[] {
  const out: ParsedImport[] = [];
  ANY_IMPORT_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = ANY_IMPORT_RE.exec(content)) !== null) {
    const rawClause = match[1].trim();
    const spec = match[2];
    const isTypeOnly = /^type\s+/.test(rawClause);
    const clause = isTypeOnly ? rawClause.replace(/^type\s+/, "") : rawClause;

    if (/^\*\s+as\s+[A-Za-z_$][\w$]*$/.test(clause)) {
      out.push({ spec, named: [], hasDefault: false, isNamespace: true, isTypeOnly });
      continue;
    }

    let hasDefault = false;
    let bracedList: string | null = null;
    let rest = clause;

    // Optional default identifier at the head: `Foo` or `Foo, { ... }`.
    const defaultMatch = rest.match(/^([A-Za-z_$][\w$]*)\s*(?:,\s*)?/);
    if (defaultMatch && !rest.startsWith("{")) {
      hasDefault = true;
      rest = rest.slice(defaultMatch[0].length);
    }
    if (rest.startsWith("{") && rest.endsWith("}")) {
      bracedList = rest.slice(1, -1);
    }

    const named: string[] = [];
    if (bracedList != null) {
      for (const raw of bracedList.split(",")) {
        const piece = raw.trim();
        if (!piece) continue;
        // Skip inline `type` specifiers: `import { type Foo, bar } from '...'`
        // — these are TS-erased and don't need a runtime export.
        if (/^type\s+/.test(piece)) continue;
        // `foo` or `foo as bar` — what we look up in the target is the source
        // name (`foo`), not the local alias (`bar`).
        const nameMatch = piece.match(/^([A-Za-z_$][\w$]*)\s*(?:as\s+[A-Za-z_$][\w$]*)?$/);
        if (!nameMatch) continue;
        named.push(nameMatch[1]);
      }
    }

    out.push({ spec, named, hasDefault, isNamespace: false, isTypeOnly });
  }
  return out;
}

const EXPORT_DECL_RE =
  /\bexport\s+(?:async\s+)?(?:const|let|var|function\s*\*?|class)\s+([A-Za-z_$][\w$]*)/g;
const EXPORT_NAMED_LIST_RE = /\bexport\s*\{([^}]*)\}/g;
const EXPORT_DEFAULT_RE = /\bexport\s+default\b/;
const EXPORT_STAR_RE = /\bexport\s*\*\s+from\s+['"]/;
const EXPORT_TYPE_DECL_RE = /\bexport\s+(?:type|interface)\s+([A-Za-z_$][\w$]*)/g;

interface ExportSet {
  /** Exported symbol names (excluding `default`). */
  named: Set<string>;
  /** True if the file has `export default`. */
  hasDefault: boolean;
  /**
   * True if the file uses `export * from '...'`. When set, we conservatively
   * accept any imported name from this file — we'd need a real module graph
   * to follow the re-export, which is overkill for a static check.
   */
  hasStarReexport: boolean;
}

/**
 * Collect every export declaration in a TS/TSX file. We deliberately strip
 * `export type` / `export interface` (TS-erased, irrelevant at runtime) and
 * keep value exports (`const`, `let`, `var`, `function`, `class`, named
 * `{ ... }` lists).
 */
function extractExports(content: string): ExportSet {
  const named = new Set<string>();
  let hasDefault = false;
  let hasStarReexport = false;

  // Strip type-only export decls so they don't pollute the named set.
  // (`export type Foo = ...` would otherwise also match the value regex.)
  const typeNames = new Set<string>();
  EXPORT_TYPE_DECL_RE.lastIndex = 0;
  let typeMatch: RegExpExecArray | null;
  while ((typeMatch = EXPORT_TYPE_DECL_RE.exec(content)) !== null) {
    typeNames.add(typeMatch[1]);
  }

  EXPORT_DECL_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = EXPORT_DECL_RE.exec(content)) !== null) {
    const name = m[1];
    if (typeNames.has(name)) continue;
    named.add(name);
  }

  EXPORT_NAMED_LIST_RE.lastIndex = 0;
  while ((m = EXPORT_NAMED_LIST_RE.exec(content)) !== null) {
    for (const raw of m[1].split(",")) {
      const piece = raw.trim();
      if (!piece) continue;
      if (/^type\s+/.test(piece)) continue;
      // `foo` or `foo as bar` — for re-export we expose the *outward* name
      // (the part after `as`, or `foo` itself if there's no rename).
      const partMatch = piece.match(
        /^([A-Za-z_$][\w$]*)\s*(?:as\s+([A-Za-z_$][\w$]*))?$/,
      );
      if (!partMatch) continue;
      const exposedName = partMatch[2] ?? partMatch[1];
      if (exposedName === "default") {
        hasDefault = true;
      } else {
        named.add(exposedName);
      }
    }
  }

  if (EXPORT_DEFAULT_RE.test(content)) hasDefault = true;
  if (EXPORT_STAR_RE.test(content)) hasStarReexport = true;

  return { named, hasDefault, hasStarReexport };
}

/**
 * Implicit exports the bundler synthesizes at compose time and that are
 * always available even if the user-authored landing file doesn't list them.
 *
 *  - `landing/theme.tsx`: `compose-react.ts::ensureThemeTypographyCompatExports`
 *    appends `fontSans` / `fontSerif` if the LLM forgets them. We must include
 *    those here so we don't false-flag a section that imports them.
 *  - `landing/_runtime/ImageAsset.tsx` / `landing/_runtime/assets.ts`: server-
 *    generated at compose time (see `buildRuntimeFiles`); the user-authored
 *    file map will not contain them, but the runtime knows them.
 */
const IMPLICIT_EXPORTS: Record<string, ExportSet> = {
  "landing/theme.tsx": {
    named: new Set(["fontSans", "fontSerif"]),
    hasDefault: false,
    hasStarReexport: false,
  },
  [IMAGE_ASSET_COMPONENT_PATH]: {
    named: new Set(["ImageAsset"]),
    hasDefault: true,
    hasStarReexport: false,
  },
  [IMAGE_ASSET_MAP_PATH]: {
    named: new Set(["ASSET_MAP", "resolveAsset", "getAssetMeta"]),
    hasDefault: false,
    hasStarReexport: false,
  },
};

function mergeWithImplicit(filePath: string, set: ExportSet): ExportSet {
  const implicit = IMPLICIT_EXPORTS[filePath];
  if (!implicit) return set;
  return {
    named: new Set([...set.named, ...implicit.named]),
    hasDefault: set.hasDefault || implicit.hasDefault,
    hasStarReexport: set.hasStarReexport || implicit.hasStarReexport,
  };
}

function splitFindings(findings: ValidationFinding[]) {
  return {
    criticalFindings: findings.filter((f) => f.severity === "critical"),
    warningFindings: findings.filter((f) => f.severity === "warning"),
  };
}

function buildSummary(
  reportType: "completeness" | "ui_consistency",
  criticalCount: number,
  warningCount: number
): string {
  if (criticalCount === 0 && warningCount === 0) {
    return reportType === "completeness"
      ? "Completeness checks passed. All required composition references resolve."
      : "UI consistency checks passed with no notable issues.";
  }
  if (criticalCount > 0) {
    return `${reportType === "completeness" ? "Completeness" : "UI"} validation found ${criticalCount} critical and ${warningCount} warning issue(s).`;
  }
  return `${reportType === "completeness" ? "Completeness" : "UI"} validation found ${warningCount} warning issue(s).`;
}

function calcUiScore(criticalCount: number, warningCount: number): number {
  const raw = 100 - criticalCount * 25 - warningCount * 8;
  return Math.max(0, Math.min(100, raw));
}

function detectRouteElements(indexContent: string): string[] {
  const routeElements: string[] = [];
  const routeRe = /<Route\b[^>]*\belement=\{\s*<([A-Z][A-Za-z0-9_]*)/g;
  let match: RegExpExecArray | null;
  while ((match = routeRe.exec(indexContent)) !== null) {
    routeElements.push(match[1]);
  }
  return routeElements;
}

function countMatches(input: string, pattern: RegExp): number {
  return input.match(pattern)?.length ?? 0;
}

function analyzeAnimationStrategy(files: SiteFile[]) {
  const landingFiles = files.filter((file) => file.path.startsWith("landing/"));
  let motionImportCount = 0;
  let motionUsageCount = 0;
  let cssAnimationCount = 0;
  const cssAnimationFiles: string[] = [];

  for (const file of landingFiles) {
    const hasMotionImport = MOTION_REACT_IMPORT_RE.test(file.content);
    const fileMotionUsageCount =
      countMatches(file.content, MOTION_ELEMENT_RE) +
      countMatches(file.content, ANIMATE_PRESENCE_RE);
    const fileCssAnimationCount =
      countMatches(file.content, TAILWIND_ANIMATION_RE) +
      countMatches(file.content, ARBITRARY_ANIMATION_RE) +
      countMatches(file.content, INLINE_ANIMATION_STYLE_RE);

    if (hasMotionImport) {
      motionImportCount += 1;
    }
    motionUsageCount += fileMotionUsageCount;
    cssAnimationCount += fileCssAnimationCount;

    if (fileCssAnimationCount > 0) {
      cssAnimationFiles.push(file.path);
    }
  }

  return {
    motionImportCount,
    motionUsageCount,
    cssAnimationCount,
    cssAnimationFiles,
  };
}

function buildSiteSnapshot(files: SiteFile[]): string {
  const sorted = [...files].sort((a, b) => a.path.localeCompare(b.path));
  const chunks: string[] = [];
  let used = 0;
  for (const file of sorted) {
    const block = `--- ${file.path} ---\n${file.content}\n`;
    if (used + block.length > MAX_SITE_SNAPSHOT_CHARS) {
      const remaining = MAX_SITE_SNAPSHOT_CHARS - used;
      if (remaining > 200) {
        chunks.push(block.slice(0, remaining));
      }
      break;
    }
    chunks.push(block);
    used += block.length;
  }
  return chunks.join("\n");
}

const llmCompletenessSchema = z.object({
  status: z.enum(["pass", "fail"]),
  summary: z.string().min(1),
  missingItems: z.array(z.string()).optional().default([]),
  criticalFindings: z
    .array(
      z.object({
        issueCode: z.string().min(1),
        message: z.string().min(1),
        path: z.string().optional(),
        suggestedFix: z.string().optional(),
      })
    )
    .optional()
    .default([]),
  warningFindings: z
    .array(
      z.object({
        issueCode: z.string().min(1),
        message: z.string().min(1),
        path: z.string().optional(),
        suggestedFix: z.string().optional(),
      })
    )
    .optional()
    .default([]),
  confidence: z.number().min(0).max(1).optional().default(0.5),
});

async function runLlmCompletenessCheck(params: {
  files: SiteFile[];
  siteSpec?: string;
}): Promise<
  | {
      ok: true;
      status: "pass" | "fail";
      summary: string;
      confidence: number;
      findings: ValidationFinding[];
    }
  | { ok: false; error: string }
> {
  try {
    const model = await getAIModel();
    const siteSnapshot = buildSiteSnapshot(params.files);
    const prompt = buildCompletenessValidationPrompt({
      siteSpec: params.siteSpec,
      siteSnapshot,
    });

    const out = await generateText({
      model,
      prompt,
      experimental_telemetry: {
        isEnabled: true,
        functionId: "validate-completeness-llm",
      },
    });

    const raw = out.text.trim();
    const jsonCandidate =
      raw.startsWith("{") && raw.endsWith("}")
        ? raw
        : (raw.match(/\{[\s\S]*\}/)?.[0] ?? "");
    if (!jsonCandidate) {
      return { ok: false, error: "LLM validator returned non-JSON output." };
    }
    const parsed = llmCompletenessSchema.safeParse(JSON.parse(jsonCandidate));
    if (!parsed.success) {
      return { ok: false, error: "LLM validator JSON did not match schema." };
    }
    const data = parsed.data;
    const llmFindings: ValidationFinding[] = [
      ...data.missingItems.map((item) => ({
        severity: "critical" as const,
        issueCode: "LLM_MISSING_ITEM",
        message: item,
      })),
      ...data.criticalFindings.map((f) => ({
        severity: "critical" as const,
        issueCode: f.issueCode,
        message: f.message,
        path: f.path,
        suggestedFix: f.suggestedFix,
      })),
      ...data.warningFindings.map((f) => ({
        severity: "warning" as const,
        issueCode: f.issueCode,
        message: f.message,
        path: f.path,
        suggestedFix: f.suggestedFix,
      })),
    ];
    return {
      ok: true,
      status: data.status,
      summary: data.summary,
      confidence: data.confidence,
      findings: llmFindings,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function loadLatestSiteFiles(chatId: string): Promise<SiteFile[]> {
  const rows = await getExistingLandingSiteFilesContent(chatId);
  return rows.map((r) => ({
    path: normalizePath(r.path),
    content: r.content,
  }));
}

function findFile(
  files: SiteFile[],
  exactPath: string
): SiteFile | undefined {
  const target = normalizePath(exactPath).toLowerCase();
  return files.find((f) => f.path.toLowerCase() === target);
}

export async function validateCompleteness(params: {
  chatId: string;
  siteSpec?: string;
}): Promise<ValidationToolResult> {
  try {
    const files = await loadLatestSiteFiles(params.chatId);
    const findings: ValidationFinding[] = [];
    if (files.length === 0) {
      return {
        success: true,
        status: "fail",
        reportType: "completeness",
        summary: "No generated site files were found.",
        criticalFindings: [
          {
            severity: "critical",
            issueCode: "NO_FILES",
            message: "No landing site files exist yet.",
            suggestedFix:
              "Generate landing/index.tsx, landing/pages/Home.tsx, and required sections before finishing.",
          },
        ],
        warningFindings: [],
        nextAction: "continue_fixing",
      };
    }

    const indexFile = findFile(files, "landing/index.tsx");
    const homePage = findFile(files, "landing/pages/Home.tsx");
    const navbar = findFile(files, "landing/sections/Navbar.tsx");
    const footer = findFile(files, "landing/sections/Footer.tsx");
    const themeFile = findFile(files, THEME_FILE_PATH);

    if (!indexFile) {
      findings.push({
        severity: "critical",
        issueCode: "MISSING_INDEX",
        message: "Missing required entry file landing/index.tsx.",
        path: "landing/index.tsx",
        suggestedFix: "Create landing/index.tsx with HashRouter and page routes.",
      });
    }
    if (!homePage) {
      findings.push({
        severity: "critical",
        issueCode: "MISSING_HOME_PAGE",
        message: "Missing required page file landing/pages/Home.tsx.",
        path: "landing/pages/Home.tsx",
        suggestedFix: "Create landing/pages/Home.tsx and render primary sections.",
      });
    }
    if (!navbar) {
      findings.push({
        severity: "critical",
        issueCode: "MISSING_NAVBAR",
        message: "Missing required section file landing/sections/Navbar.tsx.",
        path: "landing/sections/Navbar.tsx",
      });
    }
    if (!footer) {
      findings.push({
        severity: "critical",
        issueCode: "MISSING_FOOTER",
        message: "Missing required section file landing/sections/Footer.tsx.",
        path: "landing/sections/Footer.tsx",
      });
    }
    if (!themeFile) {
      findings.push({
        severity: "warning",
        issueCode: "MISSING_THEME_TOKENS",
        message:
          "Missing landing/theme.tsx. Reusable typography and global Google Font loading should be centralized there.",
        path: THEME_FILE_PATH,
        suggestedFix:
          "Create landing/theme.tsx with shared typography tokens and an idempotent ensureThemeFonts() helper.",
      });
    }

    const allPaths = new Set([
      ...files.map((f) => f.path.toLowerCase()),
      IMAGE_ASSET_COMPONENT_PATH.toLowerCase(),
      IMAGE_ASSET_MAP_PATH.toLowerCase(),
    ]);
    const fileByPath = new Map<string, SiteFile>();
    for (const f of files) fileByPath.set(f.path.toLowerCase(), f);
    // Cache ExportSet per target path so we don't re-parse theme.tsx N times
    // when N sections each import from it.
    const exportsByPath = new Map<string, ExportSet>();
    function getExports(targetPath: string): ExportSet | null {
      const key = targetPath.toLowerCase();
      const cached = exportsByPath.get(key);
      if (cached) return cached;
      const target = fileByPath.get(key);
      const base: ExportSet = target
        ? extractExports(target.content)
        : { named: new Set(), hasDefault: false, hasStarReexport: false };
      const merged = mergeWithImplicit(targetPath, base);
      exportsByPath.set(key, merged);
      return merged;
    }

    const unresolvedImports: Array<{ from: string; target: string }> = [];
    const missingNamedExports: Array<{
      from: string;
      target: string;
      missing: string[];
      available: string[];
    }> = [];
    const missingDefaultExports: Array<{ from: string; target: string }> = [];
    const hardcodedFontFiles = new Set<string>();
    for (const file of files) {
      if (!file.path.startsWith("landing/")) continue;
      if (/<style[\s>\/]/.test(file.content)) {
        findings.push({
          severity: "critical",
          issueCode: "INLINE_STYLE_TAG",
          path: file.path,
          message:
            "Inline <style> tag detected; section and page files must use Tailwind utilities instead.",
          suggestedFix:
            "Remove the <style> tag and replace it with Tailwind classes or inline style props only for dynamic values.",
        });
      }
      const imports = extractRelativeImports(file.content);
      if (file.path !== THEME_FILE_PATH) {
        const hardcodedFontCount =
          countMatches(file.content, INLINE_FONT_FAMILY_RE) +
          countMatches(file.content, ARBITRARY_FONT_CLASS_RE);
        if (hardcodedFontCount > 0) {
          hardcodedFontFiles.add(file.path);
        }
      }
      for (const spec of imports) {
        const resolved = resolveImportPath(file.path, spec);
        if (!resolved) continue;
        if (!allPaths.has(resolved.toLowerCase())) {
          unresolvedImports.push({ from: file.path, target: resolved });
        }
      }

      // Per-file: also verify each *named* relative import names a symbol
      // that the target actually exports. esbuild treats unresolved named
      // imports from a known file as a hard error — without this check, the
      // first time the user sees the problem is when the bundle endpoint
      // returns 500 and the iframe paints a generic "failed to load script".
      const parsed = parseImports(file.content);
      for (const imp of parsed) {
        if (imp.isTypeOnly) continue;
        if (imp.isNamespace) continue;
        if (!imp.spec.startsWith("./") && !imp.spec.startsWith("../")) continue;
        const resolved = resolveImportPath(file.path, imp.spec);
        if (!resolved) continue;
        // File-existence already produced an UNRESOLVED_IMPORT finding above;
        // skip the named-export check to avoid double-reporting.
        if (!allPaths.has(resolved.toLowerCase())) continue;
        const exports = getExports(resolved);
        if (!exports) continue;
        if (exports.hasStarReexport) continue;

        const missing: string[] = [];
        for (const name of imp.named) {
          if (!exports.named.has(name)) missing.push(name);
        }
        if (missing.length > 0) {
          missingNamedExports.push({
            from: file.path,
            target: resolved,
            missing,
            available: Array.from(exports.named).sort(),
          });
        }
        if (imp.hasDefault && !exports.hasDefault) {
          missingDefaultExports.push({ from: file.path, target: resolved });
        }
      }
    }
    for (const missing of unresolvedImports) {
      findings.push({
        severity: "critical",
        issueCode: "UNRESOLVED_IMPORT",
        message: `Unresolved import reference to ${missing.target}.`,
        path: missing.from,
        suggestedFix: `Create ${missing.target} or update imports in ${missing.from}.`,
      });
    }
    for (const m of missingNamedExports) {
      // Cap the listed-available names so the AI repair card stays readable.
      const availableHint =
        m.available.length === 0
          ? "(none)"
          : m.available.length <= 12
            ? m.available.join(", ")
            : `${m.available.slice(0, 12).join(", ")}, …`;
      findings.push({
        severity: "critical",
        issueCode: "MISSING_NAMED_EXPORT",
        message:
          `${m.from} imports { ${m.missing.join(", ")} } from "${m.target}" ` +
          `but that file does not export ${m.missing.length === 1 ? "this symbol" : "these symbols"}. ` +
          `Available exports: ${availableHint}.`,
        path: m.from,
        suggestedFix:
          `Either add the missing export${m.missing.length === 1 ? "" : "s"} ` +
          `(${m.missing.join(", ")}) to ${m.target}, or change ${m.from} to ` +
          `import only symbols that exist in the target's available exports.`,
      });
    }
    for (const m of missingDefaultExports) {
      findings.push({
        severity: "critical",
        issueCode: "MISSING_DEFAULT_EXPORT",
        message: `${m.from} default-imports from "${m.target}" but that file has no \`export default\`.`,
        path: m.from,
        suggestedFix:
          `Add \`export default …\` to ${m.target}, or switch ${m.from} to a named import.`,
      });
    }
    if (hardcodedFontFiles.size >= 3) {
      findings.push({
        severity: "warning",
        issueCode: "DUPLICATED_FONT_DECLARATIONS",
        message:
          "Font declarations appear in many files. Prefer centralizing typography in landing/theme.tsx and only override locally when necessary.",
        path: Array.from(hardcodedFontFiles)[0],
        suggestedFix:
          "Move shared font declarations to landing/theme.tsx tokens and keep section-level overrides intentional and rare.",
      });
    }

    const animationStrategy = analyzeAnimationStrategy(files);
    if (
      animationStrategy.cssAnimationCount > 0 &&
      animationStrategy.motionUsageCount === 0
    ) {
      findings.push({
        severity: "critical",
        issueCode: "CSS_ANIMATION_WITHOUT_MOTION",
        message:
          "Landing site uses CSS/Tailwind animation but does not use Motion for React. Primary animation should use `motion/react`, with CSS animation reserved for fallback effects only.",
        path: animationStrategy.cssAnimationFiles[0],
        suggestedFix:
          "Refactor animated landing sections to import from `motion/react` and implement reveals, entrances, and staggered motion there. Keep CSS animation only for minimal fallback or tiny ambient loops.",
      });
    } else if (
      animationStrategy.motionUsageCount > 0 &&
      animationStrategy.cssAnimationCount >
        animationStrategy.motionUsageCount * 2
    ) {
      findings.push({
        severity: "warning",
        issueCode: "CSS_ANIMATION_OUTWEIGHS_MOTION",
        message:
          "Landing site appears to rely more on CSS/Tailwind animation than Motion for React. The builder should use `motion/react` for most notable animation and keep CSS animation as fallback.",
        path: animationStrategy.cssAnimationFiles[0],
        suggestedFix:
          "Move the main animated choreography to `motion/react` and keep CSS animation limited to secondary fallback effects.",
      });
    }

    if (indexFile) {
      if (!/HashRouter/.test(indexFile.content)) {
        findings.push({
          severity: "warning",
          issueCode: "INDEX_ROUTER_MISSING",
          message:
            "landing/index.tsx does not appear to use HashRouter; preview routing may fail.",
          path: "landing/index.tsx",
        });
      }
      if (!/<Routes[\s>]/.test(indexFile.content)) {
        findings.push({
          severity: "warning",
          issueCode: "INDEX_ROUTES_MISSING",
          message:
            "landing/index.tsx does not appear to define <Routes>; multi-page flow may be incomplete.",
          path: "landing/index.tsx",
        });
      }

      const routeElements = detectRouteElements(indexFile.content);
      if (routeElements.length === 0) {
        findings.push({
          severity: "warning",
          issueCode: "NO_ROUTE_ELEMENTS",
          message: "No <Route element={<Component/>}> definitions detected.",
          path: "landing/index.tsx",
        });
      }
    }

    const preLlmCriticalCount = findings.filter(
      (finding) => finding.severity === "critical"
    ).length;
    const shouldRunLlmCompleteness = preLlmCriticalCount === 0;
    const llmResult = shouldRunLlmCompleteness
      ? await runLlmCompletenessCheck({
          files,
          siteSpec: params.siteSpec,
        })
      : null;
    if (llmResult?.ok) {
      findings.push(...llmResult.findings);
    } else if (llmResult && !llmResult.ok) {
      findings.push({
        severity: "warning",
        issueCode: "LLM_COMPLETENESS_UNAVAILABLE",
        message: "LLM semantic completeness check was unavailable.",
        suggestedFix: llmResult.error,
      });
    }

    const { criticalFindings, warningFindings } = splitFindings(findings);
    const status = criticalFindings.length > 0 ? "fail" : "pass";
    return {
      success: true,
      status,
      reportType: "completeness",
      summary: buildSummary("completeness", criticalFindings.length, warningFindings.length),
      criticalFindings,
      warningFindings,
      nextAction: status === "fail" ? "continue_fixing" : "finish",
      metadata: {
        fileCount: files.length,
        unresolvedImportCount: unresolvedImports.length,
        missingNamedExportCount: missingNamedExports.length,
        missingDefaultExportCount: missingDefaultExports.length,
        animationStrategy,
        llmCompleteness:
          llmResult?.ok === true
            ? {
                status: llmResult.status,
                confidence: llmResult.confidence,
                summary: llmResult.summary,
              }
            : llmResult && !llmResult.ok
              ? {
                  status: "error",
                  error: llmResult.error,
                }
              : {
                  status: "skipped_due_to_deterministic_failures",
                  skipped: true,
                  preLlmCriticalCount,
                },
      },
    };
  } catch (error) {
    return {
      success: false,
      status: "fail",
      reportType: "completeness",
      summary: "Completeness validation failed unexpectedly.",
      criticalFindings: [],
      warningFindings: [],
      nextAction: "continue_fixing",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function maybeRunScreenshotCheck(params: {
  chatId: string;
  files: SiteFile[];
  includeScreenshot: boolean;
}): Promise<ValidationFinding[]> {
  if (!params.includeScreenshot) return [];
  if (process.env.UI_VALIDATION_SCREENSHOT_ENABLED !== "1") {
    return [
      {
        severity: "warning",
        issueCode: "SCREENSHOT_VALIDATION_DISABLED",
        message:
          "Screenshot-assisted validation is disabled (set UI_VALIDATION_SCREENSHOT_ENABLED=1 to enable).",
      },
    ];
  }
  const key = process.env.SCREENSHOTONE_ACCESS_KEY;
  if (!key) {
    return [
      {
        severity: "warning",
        issueCode: "SCREENSHOT_KEY_MISSING",
        message:
          "Screenshot-assisted validation requested but SCREENSHOTONE_ACCESS_KEY is missing.",
      },
    ];
  }
  const latestIndexLike = params.files.find((f) => f.path === "landing/index.tsx");
  if (!latestIndexLike) {
    return [
      {
        severity: "warning",
        issueCode: "SCREENSHOT_SKIPPED_NO_INDEX",
        message:
          "Skipped screenshot-assisted checks because landing/index.tsx is missing.",
      },
    ];
  }

  const latestRev = await getLatestLandingSiteRevision(params.chatId);
  if (!latestRev) {
    return [
      {
        severity: "warning",
        issueCode: "SCREENSHOT_SKIPPED_NO_REVISION",
        message:
          "Skipped screenshot-assisted checks because no landing revision exists.",
      },
    ];
  }
  const revisionNumber = latestRev.revisionNumber;

  const captureOrigin = getScreenshotCaptureOrigin();
  if (!captureOrigin) {
    return [
      {
        severity: "warning",
        issueCode: "SCREENSHOT_DEPLOY_ORIGIN_MISSING",
        message:
          "Skipped screenshot-assisted validation: no reachable origin for ScreenshotOne (set NEXT_PUBLIC_DEPLOY_ORIGIN to a public host or SCREENSHOT_BROWSER_BASE_URL to a tunnel URL).",
      },
    ];
  }

  const token = await createRenderSnapshotToken({
    chatId: params.chatId,
    revisionNumber,
  });
  if (!token) {
    return [
      {
        severity: "warning",
        issueCode: "SCREENSHOT_TOKEN_UNAVAILABLE",
        message:
          "Skipped screenshot-assisted validation because RENDER_SNAPSHOT_SECRET / AUTH_SECRET is missing.",
      },
    ];
  }

  try {
    const renderUrl = `${captureOrigin}/p/${encodeURIComponent(token)}`;
    const imageBytes = await captureUrlWithScreenshotOne({
      url: renderUrl,
      viewportWidth: 1440,
      viewportHeight: 900,
      imageWidth: 720,
      imageHeight: 450,
      imageQuality: 70,
    });
    if (imageBytes && imageBytes.byteLength >= 10_000) {
      return [];
    }
    if (imageBytes && imageBytes.byteLength < 10_000) {
      return [
        {
          severity: "warning",
          issueCode: "SCREENSHOT_TOO_SMALL",
          message:
            "Screenshot output looks unusually small; review visual rendering manually.",
        },
      ];
    }
    return [
      {
        severity: "warning",
        issueCode: "SCREENSHOT_CAPTURE_FAILED",
        message:
          "Screenshot API URL capture failed during UI validation; using code-only checks.",
      },
    ];
  } catch {
    return [
      {
        severity: "warning",
        issueCode: "SCREENSHOT_CAPTURE_EXCEPTION",
        message:
          "Screenshot-assisted validation hit an exception; using code-only checks.",
      },
    ];
  }
}

export async function validateUiConsistency(params: {
  chatId: string;
  includeScreenshot?: boolean;
}): Promise<ValidationToolResult> {
  try {
    const files = await loadLatestSiteFiles(params.chatId);
    const findings: ValidationFinding[] = [];
    const includeScreenshot = Boolean(params.includeScreenshot);

    if (files.length === 0) {
      return {
        success: true,
        status: "fail",
        reportType: "ui_consistency",
        summary: "UI consistency checks cannot run because no files are generated.",
        criticalFindings: [
          {
            severity: "critical",
            issueCode: "NO_FILES",
            message: "No landing files found for UI validation.",
          },
        ],
        warningFindings: [],
        nextAction: "continue_fixing",
        score: 0,
      };
    }

    const headingFilesWithoutH1: string[] = [];
    let totalH1 = 0;
    let totalClassAttr = 0;
    let totalClassNameAttr = 0;
    const hasHashRouter = files.some(
      (f) => f.path === "landing/index.tsx" && /HashRouter/.test(f.content)
    );
    for (const file of files) {
      if (!file.path.startsWith("landing/")) continue;
      const hasH1 = /<h1[\s>]/i.test(file.content);
      if (file.path.startsWith("landing/pages/") && !hasH1) {
        headingFilesWithoutH1.push(file.path);
      }
      if (hasH1) {
        totalH1 += (file.content.match(/<h1[\s>]/gi) ?? []).length;
      }
      totalClassAttr += (file.content.match(/\bclass=/g) ?? []).length;
      totalClassNameAttr += (file.content.match(/\bclassName=/g) ?? []).length;

      if (/<style[\s>\/]/.test(file.content)) {
        findings.push({
          severity: "critical",
          issueCode: "INLINE_STYLE_TAG",
          path: file.path,
          message: "Inline <style> tag detected; Tailwind utility classes are required.",
          suggestedFix: "Replace style tags with Tailwind utility classes.",
        });
      }
      if (/window\.location\.hash/.test(file.content)) {
        findings.push({
          severity: "warning",
          issueCode: "MANUAL_HASH_ROUTING",
          path: file.path,
          message:
            "Manual hash routing detected; prefer HashRouter + Link for consistent navigation.",
        });
      }
      if (/href=["']#\/[^"']*["']/.test(file.content)) {
        findings.push({
          severity: "warning",
          issueCode: "HASH_LINK_INCONSISTENT",
          path: file.path,
          message:
            "Found #/ links. For React Router navigation, prefer <Link to=\"/...\">.",
        });
      }
      if (hasHashRouter && /href=["']#(?!\/)[^"']+["']/.test(file.content)) {
        findings.push({
          severity: "warning",
          issueCode: "HASH_SECTION_LINK_WITH_ROUTER",
          path: file.path,
          message:
            "HashRouter app contains raw #section links. Prefer smart section navigation (scroll on '/' route, otherwise navigate then scroll).",
        });
      }
      if (/text-\[(?:8|9)\dpx\]/.test(file.content)) {
        findings.push({
          severity: "warning",
          issueCode: "OVERSIZED_TEXT",
          path: file.path,
          message:
            "Very large heading text class detected; verify hero typography remains readable.",
        });
      }
      if (!/max-w-[\w-]+/.test(file.content) && /landing\/(pages|sections)\//.test(file.path)) {
        findings.push({
          severity: "warning",
          issueCode: "MISSING_CONTAINER_PATTERN",
          path: file.path,
          message:
            "No max-width container pattern detected; spacing/layout consistency may be weak.",
        });
      }
    }

    const animationStrategy = analyzeAnimationStrategy(files);
    if (
      animationStrategy.cssAnimationCount > 0 &&
      animationStrategy.motionUsageCount === 0
    ) {
      findings.push({
        severity: "critical",
        issueCode: "CSS_ANIMATION_WITHOUT_MOTION",
        message:
          "Animated landing files use CSS/Tailwind animation but never import Motion for React. Primary animation should use `motion/react`.",
        path: animationStrategy.cssAnimationFiles[0],
        suggestedFix:
          "Refactor the animated sections to use `motion/react` for reveals, entrances, and staggered interactions. Keep CSS animation only as a simple fallback.",
      });
    } else if (
      animationStrategy.motionUsageCount > 0 &&
      animationStrategy.cssAnimationCount >
        animationStrategy.motionUsageCount * 2
    ) {
      findings.push({
        severity: "warning",
        issueCode: "CSS_ANIMATION_OUTWEIGHS_MOTION",
        message:
          "CSS/Tailwind animation appears to outweigh Motion for React in landing files. Prefer `motion/react` for most notable animated behavior.",
        path: animationStrategy.cssAnimationFiles[0],
      });
    }

    if (totalClassAttr > 0 && totalClassNameAttr === 0) {
      findings.push({
        severity: "critical",
        issueCode: "CLASSNAME_USAGE",
        message:
          "Detected class= without className=. JSX/TSX likely invalid for React components.",
        suggestedFix: "Replace class attributes with className in TSX files.",
      });
    }
    for (const pagePath of headingFilesWithoutH1) {
      findings.push({
        severity: "warning",
        issueCode: "MISSING_PAGE_H1",
        path: pagePath,
        message: "Page component has no <h1>; heading hierarchy may be unclear.",
      });
    }
    if (totalH1 > 4) {
      findings.push({
        severity: "warning",
        issueCode: "TOO_MANY_H1",
        message:
          "Many <h1> tags detected across the site. Ensure heading hierarchy remains coherent.",
      });
    }

    const screenshotFindings = await maybeRunScreenshotCheck({
      chatId: params.chatId,
      files,
      includeScreenshot,
    });
    findings.push(...screenshotFindings);

    const { criticalFindings, warningFindings } = splitFindings(findings);
    const score = calcUiScore(criticalFindings.length, warningFindings.length);
    const status = criticalFindings.length > 0 ? "fail" : "pass";
    return {
      success: true,
      status,
      reportType: "ui_consistency",
      summary: buildSummary("ui_consistency", criticalFindings.length, warningFindings.length),
      criticalFindings,
      warningFindings,
      nextAction: status === "fail" ? "continue_fixing" : "finish",
      score,
      metadata: {
        fileCount: files.length,
        screenshotAssisted: includeScreenshot,
        animationStrategy,
      },
    };
  } catch (error) {
    return {
      success: false,
      status: "fail",
      reportType: "ui_consistency",
      summary: "UI consistency validation failed unexpectedly.",
      criticalFindings: [],
      warningFindings: [],
      nextAction: "continue_fixing",
      score: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
