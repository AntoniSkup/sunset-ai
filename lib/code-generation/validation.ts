import { getExistingLandingSiteFilesContent } from "@/lib/db/queries";
import { getComposedReactHtml } from "@/lib/preview/compose-react";
import { generateText } from "ai";
import { getAIModel } from "@/lib/ai/get-ai-model";
import { z } from "zod";
import { buildCompletenessValidationPrompt } from "@/prompts/tool-validate-completeness-prompt";

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

    const allPaths = new Set(files.map((f) => f.path.toLowerCase()));
    const unresolvedImports: Array<{ from: string; target: string }> = [];
    for (const file of files) {
      if (!file.path.startsWith("landing/")) continue;
      if (/<style[\s>]/i.test(file.content)) {
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
      for (const spec of imports) {
        const resolved = resolveImportPath(file.path, spec);
        if (!resolved) continue;
        if (!allPaths.has(resolved.toLowerCase())) {
          unresolvedImports.push({ from: file.path, target: resolved });
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

    const llmResult = await runLlmCompletenessCheck({
      files,
      siteSpec: params.siteSpec,
    });
    if (llmResult.ok) {
      findings.push(...llmResult.findings);
    } else {
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
        llmCompleteness: llmResult.ok
          ? {
              status: llmResult.status,
              confidence: llmResult.confidence,
              summary: llmResult.summary,
            }
          : {
              status: "error",
              error: llmResult.error,
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

  // Phase 2 branch: capture renderability signal from composed HTML before model-based visual scoring.
  const html = await getComposedReactHtml({
    chatId: params.chatId,
    revisionNumber: 2_147_483_647,
  });
  if (!html) {
    return [
      {
        severity: "warning",
        issueCode: "SCREENSHOT_COMPOSE_FAILED",
        message:
          "Could not compose HTML for screenshot-assisted validation; using code-only checks.",
      },
    ];
  }

  try {
    const response = await fetch("https://api.screenshotone.com/take", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Access-Key": key,
      },
      body: JSON.stringify({
        html,
        format: "jpeg",
        viewport_width: 1440,
        viewport_height: 900,
        full_page: false,
        image_width: 720,
        image_height: 450,
        image_quality: 70,
      }),
    });
    if (!response.ok) {
      return [
        {
          severity: "warning",
          issueCode: "SCREENSHOT_CAPTURE_FAILED",
          message:
            "Screenshot API request failed during UI validation; using code-only checks.",
        },
      ];
    }
    const imageBytes = await response.arrayBuffer();
    if (imageBytes.byteLength < 10_000) {
      return [
        {
          severity: "warning",
          issueCode: "SCREENSHOT_TOO_SMALL",
          message:
            "Screenshot output looks unusually small; review visual rendering manually.",
        },
      ];
    }
    return [];
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

      if (/<style[\s>]/i.test(file.content)) {
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
