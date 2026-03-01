import "server-only";
import type { ComponentType } from "react";
import { createRequire } from "node:module";
import * as esbuild from "esbuild";
import * as fs from "fs";
import * as path from "path";
import {
  getLandingSiteFileContentAtOrBeforeRevision,
  getAllLandingSiteFilesAtOrBeforeRevision,
} from "@/lib/db/queries";

const ENTRY_PATH = "landing/index.tsx";
const MAX_FILES = 50;
const MAX_DEPTH = 10;
const COMPOSE_REACT_DEBUG = process.env.COMPOSE_REACT_DEBUG === "1";
const KEEP_BUNDLE_ON_ERROR = process.env.COMPOSE_REACT_KEEP_BUNDLE_ON_ERROR === "1";

function debugLog(...args: unknown[]) {
  if (!COMPOSE_REACT_DEBUG) return;
  console.log("[compose-react][debug]", ...args);
}

const runtimeRequire = createRequire(path.join(process.cwd(), "package.json"));

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

function getMockBrowserBaseUrl(): string {
  const base =
    process.env.SCREENSHOT_BROWSER_BASE_URL ??
    process.env.BASE_URL ??
    "http://localhost:3000";
  return base.replace(/\/+$/, "");
}

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

export function getPreviewHtml(params: {
  chatId: string;
  revisionNumber: number;
  basePath: string;
}): string {
  const { basePath } = params;
  const scriptSrc = `${basePath}/bundle`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Landing Page</title>
  ${TAILWIND_CDN}
</head>
<body>
  <div id="root"></div>
  <script src="${scriptSrc}" type="module"></script>
</body>
</html>`;
}

const CLIENT_ENTRY = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from 'landing/index.tsx';
const root = document.getElementById('root');
if (root) createRoot(root).render(React.createElement(App));
`.trim();

export async function getPreviewBrowserBundle(params: {
  chatId: string;
  revisionNumber: number;
}): Promise<string | null> {
  const { chatId, revisionNumber } = params;
  debugLog("browser bundle start", { chatId, revisionNumber });

  const entry = await getLandingSiteFileContentAtOrBeforeRevision({
    chatId,
    path: ENTRY_PATH,
    revisionNumber,
  });
  if (!entry?.content) return null;

  const allFiles = await getAllLandingSiteFilesAtOrBeforeRevision({
    chatId,
    revisionNumber,
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

  try {
    const result = await esbuild.build({
      stdin: {
        contents: CLIENT_ENTRY,
        sourcefile: "client-entry.jsx",
        loader: "jsx",
        resolveDir: process.cwd(),
      },
      bundle: true,
      format: "esm",
      platform: "browser",
      jsx: "automatic",
      write: false,
      plugins: [
        {
          name: "landing-browser",
          setup(build) {
            build.onResolve(
              { filter: /^(react|react-dom|react-router-dom)(\/.*)?$/ },
              (args) => {
                try {
                  const p = runtimeRequire.resolve(args.path, {
                    paths: [process.cwd()],
                  });
                  return { path: p, namespace: "file" };
                } catch {
                  const pkgName = args.path.split("/")[0];
                  const pkgDir = path.join(
                    process.cwd(),
                    "node_modules",
                    pkgName
                  );
                  const pkgJsonPath = path.join(pkgDir, "package.json");
                  if (fs.existsSync(pkgJsonPath)) {
                    const pkgJson = JSON.parse(
                      fs.readFileSync(pkgJsonPath, "utf-8")
                    );
                    const subpath = args.path.slice(pkgName.length);
                    let entryPath: string;
                    if (subpath) {
                      const sub = subpath.startsWith("/") ? subpath.slice(1) : subpath;
                      const exports = pkgJson.exports as Record<string, unknown> | undefined;
                      const expKey = sub ? `./${sub}` : ".";
                      const exp = exports?.[expKey];
                      const resolved = typeof exp === "string" ? exp : (exp as { require?: string })?.require ?? (exp as { default?: string })?.default;
                      if (resolved) {
                        entryPath = path.join(pkgDir, resolved);
                      } else {
                        entryPath = path.join(pkgDir, sub + ".js");
                      }
                    } else {
                      const main = pkgJson.main ?? pkgJson.module ?? "index.js";
                      entryPath = path.join(pkgDir, typeof main === "string" ? main : (main as { default?: string })?.default ?? "index.js");
                    }
                    if (fs.existsSync(entryPath)) {
                      return { path: path.resolve(entryPath), namespace: "file" };
                    }
                  }
                  return null;
                }
              }
            );
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
                return { path: resolved, namespace: "landing" };
              }
              return null;
            });
            build.onResolve({ filter: /^landing\// }, (args) => {
              let resolved = args.path.replace(/\\/g, "/");
              if (
                !resolved.endsWith(".tsx") &&
                !resolved.endsWith(".ts") &&
                !resolved.endsWith(".jsx")
              ) {
                resolved = resolved + ".tsx";
              }
              if (fileMap.has(resolved)) {
                return { path: resolved, namespace: "landing" };
              }
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
      console.error("[compose-react] browser bundle produced no output");
      return null;
    }
    return result.outputFiles[0].text;
  } catch (err) {
    console.error("[compose-react] browser bundle failed:", err);
    return null;
  }
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
      format: "cjs",
      platform: "node",
      jsx: "automatic",
      write: false,
      external: [
        "react",
        "react-dom",
        "react-dom/server",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
      ],
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
  const tmpDir = path.join(process.cwd(), ".next", "cache", "landing-preview");
  fs.mkdirSync(tmpDir, { recursive: true });
  const tmpFile = path.join(
    tmpDir,
    `landing-${chatId}-${revisionNumber}-${Date.now()}.cjs`
  );

  const mockBaseUrl = getMockBrowserBaseUrl();
  const mockWindow = {
    location: {
      hash: "#/",
      href: `${mockBaseUrl}/#/`,
      pathname: "/",
      search: "",
      origin: mockBaseUrl,
    },
    addEventListener: () => {},
    removeEventListener: () => {},
    matchMedia: () => ({
      matches: false,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
      media: "",
      onchange: null,
    }),
  };
  const mockDocument = {
    documentElement: {},
    body: {},
    createElement: () => ({}),
    querySelector: () => null,
    getElementById: () => null,
  };

  const previousWindow = (global as any).window;
  const previousLocation = (global as any).location;
  const previousDocument = (global as any).document;
  let loadedBundleOk = false;
  try {
    (global as any).window = mockWindow;
    (global as any).location = mockWindow.location;
    (global as any).document = mockDocument;
    fs.writeFileSync(tmpFile, bundle, "utf-8");
    const loadBundle = new Function("r", "p", "return r(p)");
    const mod = loadBundle(runtimeRequire, tmpFile);
    RootComponent = mod.default ?? mod;
    loadedBundleOk = true;
  } catch (err) {
    console.error("[compose-react] load bundle failed:", err);
    if (KEEP_BUNDLE_ON_ERROR) {
      console.warn("[compose-react] bundle preserved for debugging:", tmpFile);
    }
    return null;
  } finally {
    (global as any).window = previousWindow;
    (global as any).location = previousLocation;
    (global as any).document = previousDocument;
    try {
      if (fs.existsSync(tmpFile) && (loadedBundleOk || !KEEP_BUNDLE_ON_ERROR)) {
        fs.unlinkSync(tmpFile);
      }
    } catch {
      // ignore
    }
  }

  if (RootComponent == null || typeof RootComponent !== "function") {
    console.error("[compose-react] bundle did not export a default component");
    return null;
  }

  const ReactDefault = runtimeRequire("react");
  const ReactDOMServerDefault = runtimeRequire("react-dom/server");

  let bodyHtml: string;
  try {
    (global as any).window = mockWindow;
    (global as any).location = mockWindow.location;
    (global as any).document = mockDocument;
    bodyHtml = ReactDOMServerDefault.renderToStaticMarkup(
      ReactDefault.createElement(RootComponent, {})
    );
  } catch (err) {
    console.error("[compose-react] render failed:", err);
    return null;
  } finally {
    (global as any).window = previousWindow;
    (global as any).location = previousLocation;
    (global as any).document = previousDocument;
  }

  return wrapInHtml(bodyHtml);
}
