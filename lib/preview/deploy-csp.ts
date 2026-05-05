import { parseHttpOriginCandidate } from "@/lib/url/resolve-http-origin";

/**
 * Content-Security-Policy applied to every HTML/JS response served from the
 * deploy origin (`stronkaai-deploy.com`).
 *
 * Defense-in-depth on top of the cross-origin sandbox: even if AI-generated
 * code somehow escapes our compile pipeline or the iframe's `sandbox` attr is
 * relaxed in the future, this CSP prevents the worst classes of behavior:
 *
 *   - `frame-ancestors` keeps anyone but the main app from embedding previews.
 *   - `connect-src` blocks XHR/fetch/WebSocket back to the main app's APIs.
 *   - `script-src` only allows our own bundle + the React esm.sh + Tailwind
 *     CDN scripts the shell intentionally loads.
 */
export function buildDeployContentSecurityPolicy(): string {
  const mainAppOrigin = parseHttpOriginCandidate(
    process.env.NEXT_PUBLIC_APP_ORIGIN ??
      process.env.APP_BASE_URL ??
      process.env.BASE_URL
  );

  const frameAncestors = ["'self'"];
  if (mainAppOrigin) frameAncestors.push(mainAppOrigin);
  // ScreenshotOne / browserless capture services don't iframe us, they
  // navigate top-level, so omitting them here is fine.

  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": [
      "'self'",
      "'unsafe-inline'",
      "https://cdn.tailwindcss.com",
      "https://esm.sh",
    ],
    "style-src": [
      "'self'",
      "'unsafe-inline'",
      "https://cdn.tailwindcss.com",
      "https://fonts.googleapis.com",
    ],
    "font-src": ["'self'", "data:", "https://fonts.gstatic.com"],
    "img-src": ["'self'", "data:", "blob:", "https:"],
    "connect-src": ["'self'", "https://esm.sh"],
    "frame-ancestors": frameAncestors,
    "form-action": ["'self'"],
    "base-uri": ["'self'"],
    "object-src": ["'none'"],
  };

  return Object.entries(directives)
    .map(([key, values]) => `${key} ${values.join(" ")}`)
    .join("; ");
}

/** Headers attached to every deploy-origin HTML/JS response. */
export function buildDeploySecurityHeaders(): Record<string, string> {
  return {
    "Content-Security-Policy": buildDeployContentSecurityPolicy(),
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": "geolocation=(), camera=(), microphone=(), payment=()",
  };
}
