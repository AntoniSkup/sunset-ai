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

/**
 * Always-on staged log for the bundle pipeline. Prefixed so it's grep-able
 * (`[landing-bundle]`) in `pnpm dev` output. Each call includes the
 * `<chatId>@<revision>` tag so concurrent requests stay separable, the
 * stage name, and a stage-specific payload (typically `{ ms, ... }`).
 *
 * Intentionally NOT gated behind COMPOSE_REACT_DEBUG: when the iframe is
 * showing "bundle endpoint likely returned a non-200 response" we need
 * server-side breadcrumbs unconditionally, otherwise we have no idea
 * whether the DB query, the file-map walk, or esbuild itself is hanging.
 */
function bundleLog(tag: string, stage: string, payload?: Record<string, unknown>): void {
  if (payload === undefined) {
    console.log(`[landing-bundle] ${tag} ${stage}`);
  } else {
    console.log(`[landing-bundle] ${tag} ${stage}`, payload);
  }
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

export function ImageAsset({ asset, alt, ...props }) {
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

export default ImageAsset;
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

/**
 * Inline classic <script> that runs synchronously at the top of <head>, before
 * the deferred ES module bundle is fetched / evaluated. It exposes:
 *
 *   window.__landingShowRenderError(err)   - paint visible diagnostic in <body>
 *   window.__landingMarkSnapshotReady()    - set data-landing-snapshot="1" once
 *   window.__landingSnapshotMarked()       - boolean accessor for the flag
 *
 * It also installs early `window` listeners for `error` (capture phase, so
 * resource-load failures on the bundle <script> tag are caught) and
 * `unhandledrejection`. These are intentionally in an *inline classic script*,
 * not in the bundle, because the bundle module can fail in three ways that no
 * in-bundle handler can ever catch:
 *
 *   1. The bundle endpoint returns a non-200 (e.g. esbuild build failure).
 *      `<script type="module">` silently fails, the bundle never executes,
 *      and any handler defined inside it never gets a chance to register.
 *
 *   2. The bundle parses fine but throws at top-level evaluation (e.g.
 *      AI-generated theme.tsx imports `next/font/google` whose runtime
 *      file is an empty stub, so `Merriweather(...)` becomes
 *      `(void 0)(...)`). The throw aborts module evaluation BEFORE the
 *      bundle gets to its own `window.addEventListener('error', ...)` line,
 *      again leaving nothing to catch the error.
 *
 *   3. A transitive ES-module dependency declared in the importmap (e.g.
 *      `https://esm.sh/react@19` or `…/react-dom@19/client`) fails to
 *      fetch — network / DNS, ad blocker, esm.sh outage, or CSP block.
 *      Module loading aborts and the *bundle* `<script>` element fires its
 *      own `error` event, which makes the diagnostic look like the bundle
 *      URL itself is the problem. The active probe below disambiguates.
 *
 * On `<script>` `error`, the bootstrap actively re-fetches the bundle URL and
 * the importmap dependency URLs, dumps every result to `console.log` (right-
 * click the iframe → Inspect frame to view), and renders the full breakdown
 * in the iframe overlay so you don't have to guess which layer broke.
 */
function buildEarlyDiagnosticBootstrap(): string {
  return `(function(){
  var snapshotMarked = false;
  var DIAG_LOGS = [];
  function diagLog(){
    var args = Array.prototype.slice.call(arguments);
    DIAG_LOGS.push(args.map(function(a){ try { return typeof a === 'string' ? a : JSON.stringify(a); } catch (_){ return String(a); } }).join(' '));
    try { console.log.apply(console, ['[landing-iframe]'].concat(args)); } catch (_){ }
  }
  function diagWarn(){
    var args = Array.prototype.slice.call(arguments);
    DIAG_LOGS.push('[warn] ' + args.map(function(a){ try { return typeof a === 'string' ? a : JSON.stringify(a); } catch (_){ return String(a); } }).join(' '));
    try { console.warn.apply(console, ['[landing-iframe]'].concat(args)); } catch (_){ }
  }
  function escapeHtml(s){
    return String(s == null ? '' : s).replace(/[<>&"']/g, function(c){ return ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":"&#39;"})[c]; });
  }
  function markSnapshotReady(){
    if (snapshotMarked) return;
    snapshotMarked = true;
    try { document.documentElement.setAttribute('data-landing-snapshot','1'); } catch (_){ }
  }
  function paintDiagnostic(safeBodyHtml, captureLogs){
    var logsHtml = '';
    if (captureLogs && DIAG_LOGS.length) {
      logsHtml =
        '<details style="margin-top:12px;"><summary style="cursor:pointer;color:#9a3412;">Diagnostic console (' + DIAG_LOGS.length + ' lines)</summary>' +
        '<pre style="white-space:pre-wrap;background:#0f172a;color:#e2e8f0;padding:10px;border-radius:6px;font-size:11px;overflow:auto;max-height:30vh;margin-top:8px;">' +
          escapeHtml(DIAG_LOGS.join('\\n')) +
        '</pre></details>';
    }
    var html =
      '<div data-landing-render-error="1" style="font:14px/1.5 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:#1f2937;background:#fff7ed;border:1px solid #fdba74;padding:24px;margin:24px;border-radius:12px;max-width:1100px;">' +
        '<div style="font-weight:600;color:#9a3412;margin-bottom:8px;">Landing preview failed to render</div>' +
        '<div style="color:#7c2d12;margin-bottom:12px;">Right-click anywhere in this iframe and pick "Inspect frame" / "Inspect Element" to see the full network + console output.</div>' +
        safeBodyHtml +
        logsHtml +
      '</div>';
    function paint(){
      try { if (document.body) document.body.innerHTML = html; } catch (_){ }
    }
    if (document.body) paint();
    else document.addEventListener('DOMContentLoaded', paint, { once: true });
  }
  function showRenderError(err){
    if (snapshotMarked) return;
    try {
      var raw = (err && (err.stack || err.message)) || (typeof err === 'string' ? err : null) || 'Unknown render error';
      var safe = escapeHtml(raw);
      paintDiagnostic(
        '<pre style="white-space:pre-wrap;background:#1f2937;color:#fef3c7;padding:12px;border-radius:8px;font-size:12px;overflow:auto;max-height:60vh;">' + safe + '</pre>',
        true
      );
    } catch (_){ }
    markSnapshotReady();
  }
  window.__landingShowRenderError = showRenderError;
  window.__landingMarkSnapshotReady = markSnapshotReady;
  window.__landingSnapshotMarked = function(){ return snapshotMarked; };

  // Probe an HTTP(S) URL with fetch and return a structured result. Failure
  // is captured (never thrown) so callers can render multiple results
  // side-by-side even if one of them errors out at the network layer. The
  // optional init is merged on top of the defaults so callers can try
  // alternative modes (no-cors, no-store-credentials, HEAD, ...) to
  // disambiguate "Failed to fetch" - the generic TypeError covers half a
  // dozen distinct browser failure modes.
  function probeUrl(url, init){
    var t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    var defaults = { cache: 'no-store', credentials: 'same-origin', method: 'GET', mode: 'cors', redirect: 'follow' };
    var merged = Object.assign({}, defaults, init || {});
    return fetch(url, merged).then(function(r){
      var ct = r.headers.get('content-type') || '(none)';
      return r.text().then(function(text){
        var t1 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
        return { url: url, init: merged, ok: true, status: r.status, statusText: r.statusText, contentType: ct, bodyLen: text.length, ms: Math.round(t1 - t0), preview: text.slice(0, 4000) };
      }).catch(function(readErr){
        var t1 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
        return { url: url, init: merged, ok: false, error: 'response.text() failed: ' + ((readErr && readErr.name) ? readErr.name + ': ' + readErr.message : String(readErr)), status: r.status, ms: Math.round(t1 - t0) };
      });
    }).catch(function(err){
      var t1 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
      var name = (err && err.name) ? err.name : 'Error';
      var msg = (err && err.message) ? err.message : String(err);
      return { url: url, init: merged, ok: false, error: name + ': ' + msg, errorName: name, errorMessage: msg, ms: Math.round(t1 - t0) };
    });
  }

  // Read the importmap declared in <head> so we know exactly which URLs the
  // bundle's bare \`import 'react'\` / \`import 'react-dom/client'\` will resolve
  // to. Failing one of these will fire 'error' on the *bundle* <script>
  // element, even though the bundle URL itself returned 200 OK.
  function getImportmapTargets(){
    try {
      var maps = document.querySelectorAll('script[type="importmap"]');
      var out = [];
      for (var i = 0; i < maps.length; i++) {
        try {
          var spec = JSON.parse(maps[i].textContent || '{}');
          var imports = spec && spec.imports ? spec.imports : {};
          for (var k in imports) {
            if (Object.prototype.hasOwnProperty.call(imports, k) && !/\\/$/.test(k)) {
              out.push({ specifier: k, url: imports[k] });
            }
          }
        } catch (_){ }
      }
      // Also probe the typical bundle dependency 'react-dom/client' against
      // the prefix mapping if present.
      try {
        var mapImports = (function(){ try { return JSON.parse(maps[0].textContent || '{}').imports || {}; } catch(_){ return {}; } })();
        if (mapImports['react-dom/']) out.push({ specifier: 'react-dom/client', url: mapImports['react-dom/'] + 'client' });
        if (mapImports['react/']) out.push({ specifier: 'react/jsx-runtime', url: mapImports['react/'] + 'jsx-runtime' });
      } catch (_){ }
      return out;
    } catch (_){ return []; }
  }

  function renderProbes(bundleUrl, bundleResults, depResults, originInfo){
    function modeLabel(init){
      if (!init) return 'fetch';
      return (init.method || 'GET') + ' / mode=' + (init.mode || 'cors') + (init.credentials ? ' / credentials=' + init.credentials : '');
    }
    function fmt(r){
      var head;
      if (r.ok) {
        head = 'OK ' + r.status + ' ' + (r.statusText || '') + ' \\u00B7 ' + (r.contentType || '(no ct)') + ' \\u00B7 ' + r.bodyLen + ' bytes \\u00B7 ' + r.ms + 'ms';
      } else {
        head = 'FAIL: ' + r.error + ' (' + r.ms + 'ms)';
      }
      var body = '';
      if (r.ok && r.preview) {
        body = '<details style="margin-top:6px;"><summary style="cursor:pointer;color:#7c2d12;">Body preview (first 4000 chars)</summary><pre style="white-space:pre-wrap;background:#0f172a;color:#e2e8f0;padding:8px;border-radius:6px;font-size:11px;overflow:auto;max-height:24vh;margin-top:6px;">' + escapeHtml(r.preview) + '</pre></details>';
      }
      return '<div style="margin:8px 0;padding:8px;background:#fff;border:1px solid #fdba74;border-radius:6px;">' +
        '<div style="font-size:11px;color:#7c2d12;margin-bottom:2px;">[' + escapeHtml(modeLabel(r.init)) + ']</div>' +
        '<div style="font-weight:600;color:#9a3412;word-break:break-all;">' + escapeHtml(r.url) + '</div>' +
        '<div style="color:' + (r.ok ? '#166534' : '#b91c1c') + ';font-size:12px;margin-top:4px;">' + escapeHtml(head) + '</div>' +
        body +
      '</div>';
    }
    var bundleSection = '<div style="margin:12px 0;">' +
        '<div style="font-weight:600;color:#9a3412;margin-bottom:6px;">Bundle URL probes (multiple fetch modes)</div>';
    for (var i = 0; i < bundleResults.length; i++) bundleSection += fmt(bundleResults[i]);
    bundleSection += '</div>';

    var depsSection = '';
    if (depResults && depResults.length) {
      depsSection += '<div style="margin:12px 0;"><div style="font-weight:600;color:#9a3412;margin-bottom:6px;">Importmap dependency probes (transitive ES module imports)</div>';
      for (var j = 0; j < depResults.length; j++) depsSection += fmt(depResults[j]);
      depsSection += '</div>';
    }

    var primary = bundleResults[0];
    var anyBundleOk = bundleResults.some(function(r){ return r.ok && r.status >= 200 && r.status < 300; });
    var noCorsOk = bundleResults.some(function(r){ return r.ok && r.init && r.init.mode === 'no-cors'; });
    var anyDepFailed = (depResults || []).some(function(d){ return !d.ok || d.status < 200 || d.status >= 400; });
    var bundleHealthy = primary.ok && primary.status >= 200 && primary.status < 300 && /javascript|ecmascript/.test(primary.contentType || '');

    var verdict = '';
    if (bundleHealthy && anyDepFailed) {
      verdict =
        '<b>Verdict:</b> bundle URL is healthy (200 + JS), but at least one importmap dep failed. The original <code>&lt;script&gt;</code> error came from a <b>transitive ES module import failure</b>. Likely causes: ad-blocker blocking esm.sh, network / DNS issue, esm.sh outage.';
    } else if (bundleHealthy) {
      verdict =
        '<b>Verdict:</b> bundle (200 + JS) and all importmap deps fetched fine. The script must have failed at <b>module evaluation</b> rather than load. Right-click iframe → Inspect frame and read the JS console — the parse / runtime error is there.';
    } else if (originInfo && originInfo.isOpaqueOrigin && !bundleHealthy) {
      verdict =
        '<b>Verdict:</b> this iframe uses an <b>opaque document origin</b> (see Tuple origin above). That happens when the parent embeds the preview in a <code>sandbox</code> iframe <b>without</b> <code>allow-same-origin</code>. The address bar still shows <code>deploy.localhost</code>, but <code>&lt;script type="module"&gt;</code> and <code>fetch()</code> to that host are <b>cross-origin</b>, so Chrome reports <code>(blocked:origin)</code> or <code>TypeError: Failed to fetch</code> while <code>no-cors</code> may show status 0. Opening the bundle in a new tab works because the tab has a real tuple origin. <b>Fix:</b> add <code>allow-same-origin</code> to the preview iframe sandbox (see <code>components/preview/preview-panel.tsx</code>).';
    } else if (!primary.ok && noCorsOk) {
      verdict =
        '<b>Verdict:</b> CORS-mode requests fail but <code>no-cors</code> completes (opaque response). The network path to the dev server may still work; if Tuple origin is not opaque, suspect an extension, antivirus, or proxy rewriting responses. Check Application → Service Workers; try Incognito with extensions disabled.';
    } else if (!primary.ok && !noCorsOk && anyBundleOk) {
      verdict =
        '<b>Verdict:</b> some bundle probes succeeded but not all. Mixed result suggests an intermittent / connection-pool issue with the dev server. See per-mode results above.';
    } else if (!primary.ok && primary.errorName === 'TypeError' && /^Failed to fetch/i.test(primary.errorMessage || '')) {
      verdict =
        '<b>Verdict:</b> all fetches to the bundle URL failed at the network layer (<code>TypeError: Failed to fetch</code>). The browser cannot reach <code>' + escapeHtml((originInfo && originInfo.origin) || 'this origin') + '</code> from inside the iframe even though same-origin requests should work. Likely causes (in order): ' +
        '<ol style="margin:6px 0 0 18px;padding:0;font-size:12px;">' +
          '<li>A <b>service worker</b> is registered on this origin and is failing the request — open DevTools → Application → Service Workers → Unregister.</li>' +
          '<li>An <b>HTTPS upgrader / Privacy Badger / uBlock</b> extension is blocking the URL because the long base64 path looks like a tracker — try in Incognito with extensions disabled.</li>' +
          '<li>The dev server <b>closed the keep-alive connection</b> mid-flight after the first response — hard-reload (Ctrl+Shift+R) and watch the Network tab.</li>' +
          '<li>Antivirus / corporate proxy is intercepting <code>localhost</code> traffic.</li>' +
        '</ol>';
    } else if (!primary.ok) {
      verdict = '<b>Verdict:</b> the bundle URL failed: ' + escapeHtml(primary.error || 'unknown') + '.';
    } else {
      verdict = '<b>Verdict:</b> bundle responded with status ' + escapeHtml(primary.status + ' ' + (primary.statusText || '')) + '. Inspect the body preview above for the real reason.';
    }
    verdict =
      '<div style="margin:12px 0;padding:10px;background:#fef3c7;border:1px solid #fbbf24;border-radius:6px;color:#78350f;font-size:13px;line-height:1.5;">' +
        verdict +
      '</div>';

    var originHtml = '';
    if (originInfo) {
      var tupleNote = originInfo.isOpaqueOrigin
        ? ' <span style="color:#b91c1c;font-weight:700;">(opaque — module scripts / fetch to the URL host are cross-origin)</span>'
        : '';
      var ser = originInfo.serializedOrigin ? ' &nbsp;&nbsp; <b>Window serialized origin:</b> ' + escapeHtml(originInfo.serializedOrigin) : '';
      originHtml =
        '<div style="margin:8px 0;padding:8px;background:#fff;border:1px solid #fdba74;border-radius:6px;font-size:12px;color:#7c2d12;">' +
          '<b>Tuple origin (document):</b> ' + escapeHtml(originInfo.origin) + tupleNote + ser +
          ' &nbsp;&nbsp; <b>UA:</b> ' + escapeHtml((originInfo.ua || '').slice(0, 120)) +
          ' &nbsp;&nbsp; <b>SW registered:</b> ' + (originInfo.swRegistered ? 'YES (likely culprit — unregister via DevTools Application tab)' : 'no') +
        '</div>';
    }

    var openLinks =
      '<div style="margin:12px 0;font-size:12px;">' +
        '<a href="' + escapeHtml(bundleUrl) + '" target="_blank" rel="noopener" style="color:#1d4ed8;text-decoration:underline;margin-right:12px;">Open bundle in new tab</a>' +
      '</div>';
    paintDiagnostic(verdict + originHtml + openLinks + bundleSection + depsSection, true);
    markSnapshotReady();
  }

  // Probe-pipeline orchestrator: hits the bundle URL with several different
  // fetch options so we can disambiguate "Failed to fetch" — that single
  // error string covers CORS rejection, service-worker rejection, connection
  // refused, DNS failure, HTTPS-upgrader extensions, and aborted requests.
  function runProbePipeline(bundleUrl){
    var bundleProbes = [
      probeUrl(bundleUrl),
      probeUrl(bundleUrl, { mode: 'no-cors' }),
      probeUrl(bundleUrl, { method: 'HEAD' }),
      probeUrl(bundleUrl, { credentials: 'omit' })
    ];
    var deps = getImportmapTargets();
    var depProbes = deps.map(function(d){ return probeUrl(d.url); });

    var swCheck;
    try {
      swCheck = (typeof navigator !== 'undefined' && navigator.serviceWorker && typeof navigator.serviceWorker.getRegistrations === 'function')
        ? navigator.serviceWorker.getRegistrations().then(function(rs){ return rs && rs.length > 0; }).catch(function(){ return false; })
        : Promise.resolve(false);
    } catch (_){ swCheck = Promise.resolve(false); }

    Promise.all([Promise.all(bundleProbes), Promise.all(depProbes), swCheck]).then(function(triple){
      var brs = triple[0];
      var drs = triple[1];
      var swRegistered = triple[2];
      diagLog('bundle probes', brs.map(function(r){ return { mode: modeLabelLite(r.init), ok: r.ok, status: r.status, error: r.error }; }));
      for (var i = 0; i < drs.length; i++) diagLog('dep probe ' + deps[i].specifier, { ok: drs[i].ok, status: drs[i].status, ms: drs[i].ms });
      diagLog('service worker registered', swRegistered);
      var origin = (typeof location !== 'undefined') ? location.origin : '';
      var serialized = '';
      try {
        if (typeof self !== 'undefined' && self.origin !== undefined) serialized = String(self.origin);
      } catch (_){}
      // Sandboxed iframe without allow-same-origin: tuple serialization is the
      // string "null" on Window, while location.origin may still show the URL
      // host in some engines — use both.
      var isOpaqueOrigin = origin === 'null' || serialized === 'null';
      var ua = (typeof navigator !== 'undefined' && navigator.userAgent) ? navigator.userAgent : '';
      renderProbes(bundleUrl, brs, drs, {
        origin: origin,
        serializedOrigin: serialized,
        ua: ua,
        swRegistered: swRegistered,
        isOpaqueOrigin: isOpaqueOrigin
      });
    }).catch(function(err){
      diagWarn('probe pipeline crashed', { error: (err && err.message) || String(err) });
      showRenderError('Diagnostic probe pipeline crashed: ' + ((err && err.message) || String(err)));
    });
  }
  function modeLabelLite(init){
    if (!init) return 'GET/cors';
    return (init.method || 'GET') + '/' + (init.mode || 'cors') + (init.credentials ? '/' + init.credentials : '');
  }

  // Capture phase so we also see resource-load failures on <script>/<link>
  // elements, which dispatch on the element only and do not bubble.
  window.addEventListener('error', function(e){
    if (snapshotMarked) return;
    var target = e && e.target;
    if (target && target !== window && (target.tagName === 'SCRIPT' || target.tagName === 'LINK')) {
      var url = (target.src || target.href || '');
      diagWarn('script/link error event', {
        tag: target.tagName,
        url: url,
        type: target.type || '',
        crossOrigin: target.crossOrigin || '',
        readyState: target.readyState || '',
        eventMessage: e.message || '',
        eventErrorName: e.error && e.error.name,
        eventErrorMessage: e.error && e.error.message
      });
      if (typeof fetch !== 'function' || !/^https?:/.test(url)) {
        showRenderError('Failed to load ' + String(target.tagName).toLowerCase() + ': ' + url + ' (no fetch API available, cannot probe further).');
        return;
      }
      var deps = getImportmapTargets();
      diagLog('probing bundle URL with multiple modes + ' + deps.length + ' importmap targets');
      runProbePipeline(url);
      return;
    }
    diagWarn('window error', { message: e && e.message, error: e && e.error && e.error.stack });
    showRenderError((e && (e.error || e.message)) || 'window error');
  }, true);

  window.addEventListener('unhandledrejection', function(e){
    if (snapshotMarked) return;
    diagWarn('unhandled rejection', { reason: e && e.reason && (e.reason.stack || e.reason.message || String(e.reason)) });
    showRenderError((e && e.reason) || 'unhandled rejection');
  });
})();`;
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
  <script>${buildEarlyDiagnosticBootstrap()}</script>
</head>
<body>
  <div id="root"></div>
  <script src="${scriptSrc}" type="module"></script>
</body>
</html>`;
}

// The diagnostic painter, snapshot-ready flag, and global error / unhandled-
// rejection listeners are intentionally *not* defined here. They live in
// `buildEarlyDiagnosticBootstrap()` (an inline classic <script> in the HTML
// shell) so they exist BEFORE this module is fetched / evaluated. That is
// the only way to surface (a) bundle endpoint 500s and (b) top-level module
// evaluation errors — both of which abort this script before any handler it
// declares could possibly register. The helpers below are thin proxies onto
// the window globals installed by that bootstrap.
const CLIENT_ENTRY = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from 'landing/index.tsx';
const root = document.getElementById('root');
function landingHasRenderableSubtree(el) {
  return Boolean(el && el.querySelector('*'));
}
function markSnapshotReady() {
  if (typeof window !== 'undefined' && typeof window.__landingMarkSnapshotReady === 'function') {
    window.__landingMarkSnapshotReady();
  }
}
function snapshotAlreadyMarked() {
  return typeof window !== 'undefined'
    && typeof window.__landingSnapshotMarked === 'function'
    && Boolean(window.__landingSnapshotMarked());
}
function showRenderError(err) {
  if (typeof window !== 'undefined' && typeof window.__landingShowRenderError === 'function') {
    window.__landingShowRenderError(err);
  }
}
function scheduleSnapshotReadyMark() {
  setTimeout(markSnapshotReady, ${snapshotPostPaintDelayMs()});
}

class LandingErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    try { console.error('[landing] render failed', error, info); } catch {}
    // Defer to give createRoot a chance to settle, then paint diagnostic.
    setTimeout(() => showRenderError(error), 0);
  }
  render() {
    if (this.state.error) return null;
    return this.props.children;
  }
}

function tryRender() {
  try {
    createRoot(root).render(
      React.createElement(LandingErrorBoundary, null, React.createElement(App))
    );
    return true;
  } catch (err) {
    try { console.error('[landing] render failed', err); } catch {}
    showRenderError(err);
    return false;
  }
}

if (root) {
  const rendered = tryRender();
  if (!rendered) {
    // Render itself blew up; diagnostic is already painted. Mark immediately
    // so external screenshotters capture *something* (the error shell)
    // instead of timing out on wait_for_selector and producing nothing.
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
    // suspended forever, etc.), surface that to the user too instead of
    // leaving them with a blank iframe.
    setTimeout(() => {
      try { mo.disconnect(); } catch {}
      if (!landingHasRenderableSubtree(root) && !snapshotAlreadyMarked()) {
        showRenderError(
          'React mounted but produced no visible output within 25s. ' +
          'The site may be incomplete (entry imports a page/section that does not exist or returns null).'
        );
      }
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

/**
 * Format an esbuild build failure (or any thrown error) into a human-readable
 * string that the iframe can paint verbatim. We deliberately keep raw paths
 * (e.g. `landing/sections/Footer.tsx:1:9`) and the original esbuild text — the
 * AI / user reading the diagnostic needs that to fix the offending file.
 */
function formatBundleBuildError(err: unknown): string {
  if (err && typeof err === "object" && "errors" in err) {
    const errors = (err as { errors?: Array<{ text: string; location?: { file?: string; line?: number; column?: number } }> }).errors;
    if (Array.isArray(errors) && errors.length > 0) {
      return [
        "Landing bundle build failed:",
        ...errors.map((e) => {
          const loc = e.location;
          const where = loc?.file
            ? `  at ${loc.file}${loc.line != null ? `:${loc.line}${loc.column != null ? `:${loc.column}` : ""}` : ""}`
            : "";
          return `- ${e.text}${where ? `\n${where}` : ""}`;
        }),
      ].join("\n");
    }
  }
  if (err instanceof Error) return `Landing bundle build failed: ${err.message}`;
  return `Landing bundle build failed: ${String(err)}`;
}

/**
 * Wrap an error message in a JS module that, when loaded by the preview HTML
 * shell, calls the early-diagnostic global to paint the actual error in the
 * iframe. Returning this from `/p/<token>/bundle` (with status 200) is much
 * more useful than returning 500 — the iframe stays blank otherwise, or shows
 * only a generic "failed to load script" message that hides the real cause.
 */
function buildErrorBundleStub(message: string): string {
  // Encode as a JSON string literal so quotes / backticks / newlines / unicode
  // in esbuild error text are safe to embed in a JS source.
  const literal = JSON.stringify(message);
  return `// Landing preview bundle failed to build. Surface the real reason.
(function(){
  var msg = ${literal};
  try {
    if (typeof window !== "undefined" && typeof window.__landingShowRenderError === "function") {
      window.__landingShowRenderError(msg);
      return;
    }
  } catch (_) {}
  // Fallback if the early-diagnostic bootstrap script somehow didn't run.
  try {
    if (typeof document !== "undefined") {
      var pre = document.createElement("pre");
      pre.style.cssText = "white-space:pre-wrap;padding:24px;margin:24px;background:#fff7ed;border:1px solid #fdba74;border-radius:12px;color:#7c2d12;font:13px ui-monospace,monospace;";
      pre.textContent = msg;
      (document.body || document.documentElement).appendChild(pre);
    }
  } catch (_) {}
})();
`;
}

export async function getPreviewBrowserBundle(params: {
  chatId: string;
  revisionNumber: number;
}): Promise<string> {
  const { chatId, revisionNumber } = params;
  const tag = `${chatId}@${revisionNumber}`;
  const startedAt = Date.now();
  bundleLog(tag, "start");
  debugLog("browser bundle start", { chatId, revisionNumber });

  // Wrap the entire pipeline in one try/catch so any failure mode (DB
  // exception, esbuild build error, plugin throw, unexpected bug) becomes
  // a visible iframe diagnostic instead of a silent 500 / blank preview.
  let stage = "entry-fetch";
  try {
    let phaseStart = Date.now();
    const entry = await getLandingSiteFileContentAtOrBeforeRevision({
      chatId,
      path: ENTRY_PATH,
      revisionNumber,
    });
    bundleLog(tag, "entry-fetch:ok", {
      ms: Date.now() - phaseStart,
      hasContent: !!entry?.content,
      len: entry?.content?.length ?? 0,
    });
    if (!entry?.content) {
      const stub = buildErrorBundleStub(
        `Landing bundle build failed: no entry file at "${ENTRY_PATH}" for chat ${chatId} (revision ${revisionNumber}). ` +
          `The AI must generate "${ENTRY_PATH}" before any sections / pages.`,
      );
      bundleLog(tag, "done:no-entry", {
        totalMs: Date.now() - startedAt,
        stubLen: stub.length,
      });
      return stub;
    }

    stage = "all-files-fetch";
    phaseStart = Date.now();
    const allFiles = await getAllLandingSiteFilesAtOrBeforeRevision({
      chatId,
      revisionNumber,
    });
    bundleLog(tag, "all-files-fetch:ok", {
      ms: Date.now() - phaseStart,
      count: allFiles.length,
      paths: allFiles.map((f) => f.path),
    });

    stage = "assets-fetch";
    phaseStart = Date.now();
    const assets = await getReadySiteAssetsByChatId(chatId);
    bundleLog(tag, "assets-fetch:ok", {
      ms: Date.now() - phaseStart,
      count: assets.length,
    });

    stage = "filemap-build";
    phaseStart = Date.now();
    const runtimeFiles = buildRuntimeFiles(assets);
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
    bundleLog(tag, "filemap-build:ok", {
      ms: Date.now() - phaseStart,
      fileCount: fileMap.size,
      files: [...fileMap.keys()],
    });

    stage = "esbuild";
    const reactExternalsSet = new Set<string>(REACT_BROWSER_EXTERNALS);
    const esbuildStart = Date.now();
    bundleLog(tag, "esbuild:start");
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
            // Refuse any `next/*` import. Next.js modules (next/font/google,
            // next/image, next/link, next/router, …) are not real ES modules —
            // they are processed by the Next.js compiler. Their runtime files
            // in node_modules are often empty stubs, so esbuild would happily
            // "bundle" them and produce `(void 0)(...)` calls that throw
            // silently at module evaluation time (white iframe with no React
            // error boundary catch). Fail the bundle build loudly instead, so
            // the iframe paints the early-error diagnostic with a clear
            // message instead of going blank.
            build.onResolve({ filter: /^next(\/|$)/ }, (args) => ({
              errors: [
                {
                  text:
                    `Refusing to bundle "${args.path}" — landing pages are browser-only and cannot import any "next/*" module. ` +
                    "Common cause: theme.tsx was generated with `import { ... } from \"next/font/google\"`. " +
                    "Replace it with the `ensureThemeFonts()` helper in landing/theme.tsx (it appends preconnect + a https://fonts.googleapis.com/css2 stylesheet link to document.head).",
                },
              ],
            }));
            // Refuse `server-only` and similar markers. Same failure mode as
            // next/*: the runtime file is empty / throws on import on the
            // server, but bundling it for the browser silently turns it into
            // a no-op that may still break downstream symbols.
            build.onResolve({ filter: /^(server-only|client-only)$/ }, (args) => ({
              errors: [
                {
                  text:
                    `Refusing to bundle "${args.path}" — landing pages are browser-only and must not use Next.js / Server Components markers.`,
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
      bundleLog(tag, "esbuild:no-output", {
        ms: Date.now() - esbuildStart,
        warnings: result.warnings?.length ?? 0,
      });
      const stub = buildErrorBundleStub(
        "Landing bundle build failed: esbuild succeeded but produced no output files.",
      );
      bundleLog(tag, "done:no-output", {
        totalMs: Date.now() - startedAt,
        stubLen: stub.length,
      });
      return stub;
    }
    const out = result.outputFiles[0].text;
    bundleLog(tag, "esbuild:ok", {
      ms: Date.now() - esbuildStart,
      outputLen: out.length,
      warnings: result.warnings?.length ?? 0,
    });
    bundleLog(tag, "done:ok", {
      totalMs: Date.now() - startedAt,
      bundleLen: out.length,
    });
    return out;
  } catch (err) {
    const message = formatBundleBuildError(err);
    bundleLog(tag, `${stage}:fail`, {
      totalMs: Date.now() - startedAt,
      message,
    });
    console.error(`[landing-bundle] ${tag} ${stage}:fail (raw error)`, err);
    const stub = buildErrorBundleStub(message);
    bundleLog(tag, "done:error-stub", {
      totalMs: Date.now() - startedAt,
      stubLen: stub.length,
    });
    return stub;
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
