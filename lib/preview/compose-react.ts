import "server-only";
import { createRequire } from "node:module";
import * as esbuild from "esbuild";
import * as fs from "fs";
import * as path from "path";
import {
  getLandingSiteFileContentAtOrBeforeRevision,
  getAllLandingSiteFilesAtOrBeforeRevision,
  getReadySiteAssetsByChatId,
} from "@/lib/db/queries";
import {
  IMAGE_ASSET_COMPONENT_PATH,
  IMAGE_ASSET_MAP_PATH,
} from "@/lib/site-assets/conventions";

const ENTRY_PATH = "landing/index.tsx";
const THEME_PATH = "landing/theme.tsx";
const MAX_FILES = 50;
const MAX_DEPTH = 10;
const COMPOSE_REACT_DEBUG = process.env.COMPOSE_REACT_DEBUG === "1";

function debugLog(...args: unknown[]) {
  if (!COMPOSE_REACT_DEBUG) return;
  console.log("[compose-react][debug]", ...args);
}

/** Wait after first paint before `data-landing-snapshot` (ScreenshotOne / thumbnails). */
function snapshotPostPaintDelayMs(): number {
  const raw = process.env.LANDING_SNAPSHOT_POST_PAINT_MS?.trim();
  const n = raw != null && raw !== "" ? Number(raw) : NaN;
  if (!Number.isFinite(n)) return 3800;
  return Math.min(30_000, Math.max(800, Math.round(n)));
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
  const preferLast = requestedLower.startsWith("landing/_runtime/");
  const iterable = preferLast ? [...allPaths].reverse() : allPaths;
  for (const { path: p, content } of iterable) {
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

/**
 * The browser bundle treats React as external because:
 *   - On Vercel, NFT does not always ship `react-dom/client.js`,
 *     `react/jsx-runtime.js`, or `react/cjs/react.development.js` into the
 *     serverless function bundle, so esbuild can't resolve them at build
 *     time when bundling for the browser.
 *   - Bundling React would also significantly inflate the iframe payload.
 *
 * Instead, the iframe HTML declares an importmap pointing every React
 * specifier to esm.sh, and the bundled browser code uses bare `import`s
 * which the browser resolves through that map.
 */
const REACT_BROWSER_EXTERNALS = [
  "react",
  "react-dom",
  "react-dom/client",
  "react/jsx-runtime",
  "react/jsx-dev-runtime",
] as const;

function getBrowserReactImportMap(): string {
  const reactVersion = "19";
  const entries = {
    react: `https://esm.sh/react@${reactVersion}`,
    "react/": `https://esm.sh/react@${reactVersion}/`,
    "react-dom": `https://esm.sh/react-dom@${reactVersion}`,
    "react-dom/": `https://esm.sh/react-dom@${reactVersion}/`,
  };
  return `<script type="importmap">${JSON.stringify({ imports: entries })}</script>`;
}

function escapeForJsString(value: string): string {
  return JSON.stringify(value);
}

function ensureThemeTypographyCompatExports(content: string): string {
  const hasFontSans = /\bexport\s+(?:const|let|var|function)\s+fontSans\b/.test(
    content
  );
  const hasFontSerif = /\bexport\s+(?:const|let|var|function)\s+fontSerif\b/.test(
    content
  );
  if (hasFontSans && hasFontSerif) {
    return content;
  }

  const compatLines: string[] = [];
  if (!hasFontSans) {
    compatLines.push(
      "export const fontSans = (typeof THEME !== 'undefined' && THEME?.typography?.fontBody) ? THEME.typography.fontBody : \"system-ui, sans-serif\";"
    );
  }
  if (!hasFontSerif) {
    compatLines.push(
      "export const fontSerif = (typeof THEME !== 'undefined' && THEME?.typography?.fontHeading) ? THEME.typography.fontHeading : \"Georgia, serif\";"
    );
  }
  if (compatLines.length === 0) {
    return content;
  }

  return `${content.trimEnd()}\n\n${compatLines.join("\n")}\n`;
}

function buildRuntimeAssetMapModule(
  assets: Array<{
    alias: string;
    blobUrl: string;
    altHint?: string | null;
    label?: string | null;
    intent: string;
  }>
): string {
  const entries = assets
    .map(
      (asset) =>
        `  ${escapeForJsString(asset.alias)}: { url: ${escapeForJsString(
          asset.blobUrl
        )}, altHint: ${
          asset.altHint ? escapeForJsString(asset.altHint) : "undefined"
        }, label: ${
          asset.label ? escapeForJsString(asset.label) : "undefined"
        }, intent: ${escapeForJsString(asset.intent)} }`
    )
    .join(",\n");

  return `
export const ASSET_MAP = {
${entries}
};

export function resolveAsset(alias) {
  return ASSET_MAP[alias]?.url ?? "";
}

export function getAssetMeta(alias) {
  return ASSET_MAP[alias] ?? null;
}
`.trim();
}

function buildRuntimeImageAssetModule(): string {
  return `
import React from "react";
import { getAssetMeta, resolveAsset } from "./assets";

export default function ImageAsset({ asset, alt, ...props }) {
  const meta = getAssetMeta(asset);
  const src = resolveAsset(asset);
  const resolvedAlt = alt ?? meta?.altHint ?? meta?.label ?? asset;

  if (!src) {
    return (
      <div
        className={props.className}
        data-missing-asset={asset}
      >
        Missing asset: {asset}
      </div>
    );
  }

  return <img {...props} src={src} alt={resolvedAlt} />;
}
`.trim();
}

function buildRuntimeFiles(
  assets: Array<{
    alias: string;
    blobUrl: string;
    altHint?: string | null;
    label?: string | null;
    intent: string;
  }>
): Array<{ path: string; content: string }> {
  return [
    {
      path: IMAGE_ASSET_MAP_PATH,
      content: buildRuntimeAssetMapModule(assets),
    },
    {
      path: IMAGE_ASSET_COMPONENT_PATH,
      content: buildRuntimeImageAssetModule(),
    },
  ];
}

export function getPreviewHtml(params: {
  chatId: string;
  revisionNumber: number;
  basePath: string;
  /** Appended after `${basePath}/bundle`, e.g. `?token=…` for signed public bundles */
  bundleSuffix?: string;
}): string {
  const { basePath, bundleSuffix = "" } = params;
  const scriptSrc = `${basePath}/bundle${bundleSuffix}`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Landing Page</title>
  ${getBrowserReactImportMap()}
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
function landingHasRenderableSubtree(el) {
  return Boolean(el && el.querySelector('*'));
}
let snapshotMarked = false;
function markSnapshotReady() {
  if (snapshotMarked) return;
  snapshotMarked = true;
  document.documentElement.setAttribute('data-landing-snapshot', '1');
}
function scheduleSnapshotReadyMark() {
  setTimeout(markSnapshotReady, ${snapshotPostPaintDelayMs()});
}
function tryRender() {
  try {
    createRoot(root).render(React.createElement(App));
    return true;
  } catch (err) {
    try { console.error('[landing] render failed', err); } catch {}
    return false;
  }
}
if (root) {
  const rendered = tryRender();
  if (!rendered) {
    // Render itself blew up; mark immediately so external screenshotters
    // capture *something* (the empty/error shell) instead of timing out on
    // wait_for_selector and producing nothing.
    markSnapshotReady();
  } else if (landingHasRenderableSubtree(root)) {
    scheduleSnapshotReadyMark();
  } else {
    const mo = new MutationObserver(() => {
      if (landingHasRenderableSubtree(root)) {
        mo.disconnect();
        scheduleSnapshotReadyMark();
      }
    });
    mo.observe(root, { childList: true, subtree: true });
    // Hard cap: if React never commits a tree (runtime crash on mount,
    // suspended forever, etc.), we still mark the page ready so the
    // ScreenshotOne wait_for_selector doesn't block until the 90s
    // request timeout. Better to capture an empty shell than to hang.
    setTimeout(() => {
      try { mo.disconnect(); } catch {}
      markSnapshotReady();
    }, 25000);
  }
} else {
  // No root element at all — extremely unlikely, but mark anyway so we
  // don't leave external capture services waiting forever.
  markSnapshotReady();
}
`.trim();

const PREVIEW_SHIM_MODULES = new Set(["react-router-dom", "motion/react"]);
const PREVIEW_SHIM_NAMESPACE = "preview-shim";

function getPreviewShimModule(specifier: string): string | null {
  if (specifier === "react-router-dom") {
    return `
import React from "react";

const Fragment = React.Fragment;

export function HashRouter({ children }) {
  return React.createElement(Fragment, null, children);
}

export function BrowserRouter({ children }) {
  return React.createElement(Fragment, null, children);
}

export function MemoryRouter({ children }) {
  return React.createElement(Fragment, null, children);
}

export function Routes({ children }) {
  return React.createElement(Fragment, null, children);
}

export function Route({ element = null, children = null }) {
  return element ?? children ?? null;
}

export function Outlet() {
  return null;
}

export function Link({ to = "#", children, ...props }) {
  const href = typeof to === "string" ? to : "#";
  return React.createElement("a", { ...props, href }, children);
}

export function NavLink({ to = "#", children, ...props }) {
  const href = typeof to === "string" ? to : "#";
  return React.createElement("a", { ...props, href }, children);
}

export function useLocation() {
  return { pathname: "/", search: "", hash: "", state: null, key: "preview" };
}

export function useNavigate() {
  return () => {};
}

export function useParams() {
  return {};
}
`.trim();
  }

  if (specifier === "motion/react") {
    // Preview-only shim. The real Framer Motion runtime is intentionally not
    // bundled into the iframe (size + cost). Components render statically as
    // their underlying DOM tag, and hooks return stable values that won't
    // crash render. Animations don't play in preview, but layout/markup
    // matches what the production runtime would mount.
    return `
import React from "react";

const noop = () => {};
const noopAsync = () => Promise.resolve();

function isMotionValue(v) {
  return v && typeof v === "object" && typeof v.get === "function" && v.__isMV === true;
}

function createMotionValue(initial) {
  let current = initial;
  const subs = new Set();
  const mv = {
    __isMV: true,
    get: () => current,
    set: (v) => { current = v; subs.forEach((cb) => { try { cb(v); } catch {} }); },
    on: (_event, cb) => { subs.add(cb); return () => subs.delete(cb); },
    onChange: (cb) => { subs.add(cb); return () => subs.delete(cb); },
    destroy: noop,
    isAnimating: () => false,
    getVelocity: () => 0,
    stop: noop,
    clearListeners: () => subs.clear(),
  };
  return mv;
}

// motion components accept MotionValues in style/props in real Framer Motion,
// but plain DOM elements would throw / warn. Flatten to current values so the
// preview doesn't blow up if AI-generated code mixes useTransform + motion.div.
function sanitizeStyle(style) {
  if (!style || typeof style !== "object") return style;
  const out = {};
  for (const key in style) {
    const v = style[key];
    out[key] = isMotionValue(v) ? v.get() : v;
  }
  return out;
}

const STRIP_KEYS = new Set([
  "initial",
  "animate",
  "exit",
  "transition",
  "variants",
  "whileHover",
  "whileTap",
  "whileFocus",
  "whileDrag",
  "whileInView",
  "viewport",
  "drag",
  "dragConstraints",
  "dragElastic",
  "dragMomentum",
  "dragControls",
  "dragListener",
  "dragSnapToOrigin",
  "dragTransition",
  "layout",
  "layoutId",
  "layoutDependency",
  "layoutScroll",
  "layoutRoot",
  "onAnimationStart",
  "onAnimationComplete",
  "onUpdate",
  "onDrag",
  "onDragStart",
  "onDragEnd",
  "onDirectionLock",
  "onViewportEnter",
  "onViewportLeave",
  "onHoverStart",
  "onHoverEnd",
  "onTap",
  "onTapStart",
  "onTapCancel",
  "custom",
  "transformTemplate",
  "transformValues",
  "inherit",
]);

function sanitizeProps(props) {
  if (!props) return props;
  const out = {};
  for (const key in props) {
    if (STRIP_KEYS.has(key)) continue;
    if (key === "style") {
      out.style = sanitizeStyle(props.style);
      continue;
    }
    out[key] = props[key];
  }
  return out;
}

function passthrough(tag) {
  return React.forwardRef(function MotionComponent(props, ref) {
    const safe = sanitizeProps(props);
    return React.createElement(tag, { ...safe, ref }, props?.children);
  });
}

export const AnimatePresence = ({ children }) =>
  React.createElement(React.Fragment, null, children);

export const LayoutGroup = ({ children }) =>
  React.createElement(React.Fragment, null, children);

export const MotionConfig = ({ children }) =>
  React.createElement(React.Fragment, null, children);

export const LazyMotion = ({ children }) =>
  React.createElement(React.Fragment, null, children);

export const Reorder = {
  Group: ({ children, as: As = "ul", ...rest }) =>
    React.createElement(As, sanitizeProps(rest), children),
  Item: ({ children, as: As = "li", ...rest }) =>
    React.createElement(As, sanitizeProps(rest), children),
};

export const motion = new Proxy(
  { create: (tag) => passthrough(typeof tag === "string" ? tag : "div") },
  {
    get(target, prop) {
      if (prop === "create" && typeof target.create === "function") {
        return target.create;
      }
      if (typeof prop !== "string") return passthrough("div");
      return passthrough(prop);
    },
  }
);

export const m = motion;

export function useInView() {
  return true;
}

export function useScroll() {
  return {
    scrollX: createMotionValue(0),
    scrollY: createMotionValue(0),
    scrollXProgress: createMotionValue(0),
    scrollYProgress: createMotionValue(0),
  };
}

export function useTransform(_input, _inputRange, outputRange) {
  if (Array.isArray(outputRange) && outputRange.length > 0) {
    return createMotionValue(outputRange[0]);
  }
  return createMotionValue(0);
}

export function useMotionValue(initial) {
  return createMotionValue(initial ?? 0);
}

export function useMotionValueEvent() {
  return undefined;
}

export function useMotionTemplate(strings) {
  if (Array.isArray(strings)) return createMotionValue(strings.join(""));
  return createMotionValue("");
}

export function useSpring(initial) {
  return createMotionValue(typeof initial === "number" ? initial : 0);
}

export function useVelocity() {
  return createMotionValue(0);
}

export function useAnimation() {
  return { start: noopAsync, stop: noop, set: noop, mount: noop };
}

export function useAnimate() {
  const scope = React.useRef(null);
  return [scope, noopAsync];
}

export function useAnimationFrame() {
  return undefined;
}

export function useDragControls() {
  return { start: noop };
}

export function useReducedMotion() {
  return false;
}

export function useReducedMotionConfig() {
  return false;
}

export function useCycle(...args) {
  const [index, setIndex] = React.useState(0);
  const cycle = (next) => {
    if (typeof next === "number") {
      const n = ((next % args.length) + args.length) % args.length;
      setIndex(n);
    } else {
      setIndex((i) => (i + 1) % args.length);
    }
  };
  return [args[index], cycle];
}

export function usePresence() {
  return [true, noop];
}

export function useIsPresent() {
  return true;
}

export function useTime() {
  return createMotionValue(0);
}

export function useWillChange() {
  return { get: () => "auto", set: noop, __isMV: true };
}

export function animate() {
  const ctrl = {
    then: (onResolve) => Promise.resolve().then(onResolve),
    stop: noop,
    pause: noop,
    play: noop,
    cancel: noop,
    complete: noop,
    time: 0,
    speed: 1,
  };
  return ctrl;
}

export const stagger = () => 0;

export const domAnimation = {};
export const domMax = {};
`.trim();
  }

  return null;
}

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
  const runtimeFiles = buildRuntimeFiles(await getReadySiteAssetsByChatId(chatId));
  const allFilesWithRuntime = [...allFiles, ...runtimeFiles];
  const fileMap = new Map<string, string>();
  await collectFileMap({
    chatId,
    revisionNumber,
    entryPath: ENTRY_PATH,
    map: fileMap,
    depth: 0,
    allFiles: allFilesWithRuntime,
  });

  const reactExternalsSet = new Set<string>(REACT_BROWSER_EXTERNALS);

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
      // Externalize React so the iframe loads it from the importmap (esm.sh)
      // declared in `getPreviewHtml`. We can't reliably resolve these from
      // node_modules at build time on Vercel because NFT does not always
      // ship the client-side React entry points into the function bundle.
      external: [...REACT_BROWSER_EXTERNALS],
      write: false,
      plugins: [
        {
          name: "landing-browser",
          setup(build) {
            // Defense in depth: the bundle is intended for the browser, but
            // if a malicious or buggy AI-generated file imports a Node
            // built-in (e.g. `child_process`, `fs`), the bundle MUST fail
            // loudly rather than silently producing a broken-but-loadable
            // module — and definitely never accidentally execute server-side.
            // The `node:` prefix variants are blocked too.
            build.onResolve({ filter: /^(node:)?(fs|child_process|net|dns|http|https|tls|os|path|process|vm|worker_threads|cluster|crypto|stream|zlib|util|module|querystring|url|buffer|inspector|perf_hooks|readline|repl|v8|trace_events|async_hooks)(\/.*)?$/ }, (args) => ({
              errors: [
                {
                  text: `Refusing to bundle Node built-in "${args.path}" — landing pages are browser-only.`,
                },
              ],
            }));
            build.onResolve(
              { filter: /^(react|react-dom|react-router-dom)(\/.*)?$/ },
              (args) => {
                if (PREVIEW_SHIM_MODULES.has(args.path)) {
                  return { path: args.path, namespace: PREVIEW_SHIM_NAMESPACE };
                }
                if (reactExternalsSet.has(args.path)) {
                  return { path: args.path, external: true };
                }
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
            build.onResolve({ filter: /^motion\/react$/ }, () => ({
              path: "motion/react",
              namespace: PREVIEW_SHIM_NAMESPACE,
            }));
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
              const patchedContent =
                args.path === THEME_PATH
                  ? ensureThemeTypographyCompatExports(content)
                  : content;
              return {
                contents: patchedContent,
                loader: "tsx",
                resolveDir: process.cwd(),
              };
            });
            build.onLoad({ filter: /.*/, namespace: PREVIEW_SHIM_NAMESPACE }, (args) => {
              const contents = getPreviewShimModule(args.path);
              if (!contents) return null;
              return {
                contents,
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

// NOTE: A previous SSR fallback (`getComposedReactHtml`) compiled the bundle
// for `platform: "node"` and ran it via `new Function(...)` with a real
// project-anchored `require`. That gave any AI-generated landing file
// effective RCE on the server (could `require("child_process")`,
// `require("fs")`, read `process.env`). It has been removed: every consumer
// (builder iframe, ScreenshotOne capture, published share links, UI-validation
// screenshot) now goes through `getPreviewBrowserBundle` and renders only in
// the browser, on a separate origin. AI-generated JavaScript is never
// evaluated on the server.
