import "server-only";
import type { ComponentType } from "react";
import * as esbuild from "esbuild";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { pathToFileURL } from "node:url";
import {
  getLandingSiteFileContentAtOrBeforeRevision,
  getAllLandingSiteFilesAtOrBeforeRevision,
} from "@/lib/db/queries";

const ENTRY_PATH = "landing/index.tsx";
const MAX_FILES = 50;
const MAX_DEPTH = 10;
const COMPOSE_REACT_DEBUG = process.env.COMPOSE_REACT_DEBUG === "1";

function debugLog(...args: unknown[]) {
  if (!COMPOSE_REACT_DEBUG) return;
  console.log("[compose-react][debug]", ...args);
}

function resolveImportPath(fromPath: string, importSpec: string): string | null {
  const spec = importSpec.trim();
  if (!spec || spec.startsWith(".") === false) return null;
  const fromDir = path.dirname(fromPath);
  let resolved = path.join(fromDir, spec).replace(/\\/g, "/");
  if (!resolved.startsWith("landing/")) return null;
  resolved = resolved.replace(/\/{2,}/g, "/");
  if (resolved.split("/").some((s) => s === ".." || s === "")) return null;
  if (!resolved.endsWith(".tsx") && !resolved.endsWith(".ts") && !resolved.endsWith(".jsx")) {
    resolved = resolved + ".tsx";
  }
  return resolved;
}

/** Find a path in the list that matches requestedPath case-insensitively (and try .tsx/.ts/.jsx). */
function findPathMatch(
  requestedPath: string,
  allPaths: Array<{ path: string; content: string }>
): { path: string; content: string } | null {
  const requestedLower = requestedPath.toLowerCase();
  const base = requestedPath.replace(/\.(tsx|ts|jsx)$/i, "");
  for (const { path: p, content } of allPaths) {
    const pLower = p.toLowerCase();
    if (pLower === requestedLower) return { path: requestedPath, content };
    const pBase = p.replace(/\.(tsx|ts|jsx)$/i, "");
    if (pBase.toLowerCase() === base.toLowerCase()) return { path: requestedPath, content };
  }
  return null;
}

const IMPORT_RE =
  /import\s+(?:\*\s+as\s+\w+|\{[^}]*\}|\w+)\s+from\s+['"]([^'"]+)['"]|import\s+['"]([^'"]+)['"]/g;

function extractImportPaths(content: string): string[] {
  const paths: string[] = [];
  let m: RegExpExecArray | null;
  IMPORT_RE.lastIndex = 0;
  while ((m = IMPORT_RE.exec(content)) !== null) {
    const spec = m[1] ?? m[2] ?? "";
    if (spec && (spec.startsWith("./") || spec.startsWith("../"))) {
      paths.push(spec);
    }
  }
  return paths;
}

async function collectFileMap(params: {
  chatId: string;
  revisionNumber: number;
  entryPath: string;
  map: Map<string, string>;
  depth: number;
  allFiles: Array<{ path: string; content: string }>;
}): Promise<void> {
  if (params.depth > MAX_DEPTH || params.map.size >= MAX_FILES) return;

  const { entryPath, map, depth, allFiles } = params;
  if (map.has(entryPath)) return;

  const match = findPathMatch(entryPath, allFiles);
  if (!match) return;

  map.set(match.path, match.content);

  const importSpecs = extractImportPaths(match.content);
  debugLog("collect", {
    entryPath,
    depth,
    importSpecs,
  });
  for (const spec of importSpecs) {
    const resolved = resolveImportPath(entryPath, spec);
    if (resolved && !map.has(resolved)) {
      await collectFileMap({
        ...params,
        entryPath: resolved,
        map,
        depth: depth + 1,
      });
    }
  }
}

const TAILWIND_CDN =
  '<script src="https://cdn.tailwindcss.com"></script>';

function wrapInHtml(bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Landing Page</title>
  ${TAILWIND_CDN}
</head>
<body>
  <div id="root">${bodyHtml}</div>
</body>
</html>`;
}

export async function getComposedReactHtml(params: {
  chatId: string;
  revisionNumber: number;
}): Promise<string | null> {
  const { chatId, revisionNumber } = params;
  debugLog("start", { chatId, revisionNumber });

  const entry = await getLandingSiteFileContentAtOrBeforeRevision({
    chatId,
    path: ENTRY_PATH,
    revisionNumber,
  });

  if (!entry?.content) {
    return null;
  }

  const allFiles = await getAllLandingSiteFilesAtOrBeforeRevision({
    chatId,
    revisionNumber,
  });
  debugLog("revision files", {
    chatId,
    revisionNumber,
    count: allFiles.length,
    paths: allFiles.map((f) => f.path),
  });

  const fileMap = new Map<string, string>();
  await collectFileMap({
    chatId,
    revisionNumber,
    entryPath: ENTRY_PATH,
    map: fileMap,
    depth: 0,
    allFiles,
  });
  debugLog("fileMap keys", Array.from(fileMap.keys()));

  let bundle: string;
  try {
    const result = await esbuild.build({
      stdin: {
        contents: entry.content,
        sourcefile: ENTRY_PATH,
        loader: "tsx",
        resolveDir: process.cwd(),
      },
      bundle: true,
      format: "esm",
      platform: "node",
      jsx: "automatic",
      write: false,
      plugins: [
        {
          name: "landing-resolve",
          setup(build) {
            build.onResolve({ filter: /^\.\.?\// }, (args) => {
              const importerPath =
                args.importer && args.importer.startsWith("landing/")
                  ? args.importer
                  : ENTRY_PATH;
              const fromDir = path.dirname(importerPath);
              const joined = path.join(fromDir, args.path).replace(/\\/g, "/");
              let resolved = joined.replace(/\/{2,}/g, "/");
              if (!resolved.startsWith("landing/")) return null;
              if (
                !resolved.endsWith(".tsx") &&
                !resolved.endsWith(".ts") &&
                !resolved.endsWith(".jsx")
              ) {
                resolved = resolved + ".tsx";
              }
              if (fileMap.has(resolved)) {
                debugLog("resolved import", {
                  importer: args.importer,
                  request: args.path,
                  resolved,
                });
                return { path: resolved, namespace: "landing" };
              }
              debugLog("UNRESOLVED import", {
                importer: args.importer,
                request: args.path,
                attempted: resolved,
                available: Array.from(fileMap.keys()),
              });
              return null;
            });
            build.onLoad({ filter: /.*/, namespace: "landing" }, (args) => {
              const content = fileMap.get(args.path);
              if (content == null) return null;
              return {
                contents: content,
                loader: "tsx",
                resolveDir: process.cwd(),
              };
            });
          },
        },
      ],
      outfile: "out.js",
    });

    if (result.outputFiles == null || result.outputFiles.length === 0) {
      console.error("[compose-react] esbuild produced no output");
      return null;
    }
    bundle = result.outputFiles[0].text;
  } catch (err) {
    console.error("[compose-react] esbuild failed:", err);
    return null;
  }

  let RootComponent: ComponentType | undefined;
  const tmpDir = os.tmpdir();
  const tmpFile = path.join(
    tmpDir,
    `landing-${chatId}-${revisionNumber}-${Date.now()}.mjs`
  );

  const previousWindow = (global as any).window;
  try {
    (global as any).window = { location: { hash: "#/" } };
    fs.writeFileSync(tmpFile, bundle, "utf-8");
    const url = pathToFileURL(tmpFile).href;
    const loadBundle = new Function("u", "return import(u)");
    const mod = await loadBundle(url);
    RootComponent = mod.default ?? mod;
  } catch (err) {
    console.error("[compose-react] load bundle failed:", err);
    return null;
  } finally {
    (global as any).window = previousWindow;
    try {
      if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
    } catch {
      // ignore
    }
  }

  if (RootComponent == null || typeof RootComponent !== "function") {
    console.error("[compose-react] bundle did not export a default component");
    return null;
  }

  const [React, ReactDOMServer] = await Promise.all([
    import("react"),
    import("react-dom/server"),
  ]);
  const ReactDefault = (React as any).default ?? React;
  const ReactDOMServerDefault = (ReactDOMServer as any).default ?? ReactDOMServer;

  let bodyHtml: string;
  try {
    bodyHtml = ReactDOMServerDefault.renderToStaticMarkup(
      ReactDefault.createElement(RootComponent, {})
    );
  } catch (err) {
    console.error("[compose-react] render failed:", err);
    return null;
  }

  return wrapInHtml(bodyHtml);
}
