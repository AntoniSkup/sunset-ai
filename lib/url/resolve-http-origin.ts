/**
 * Resolves env-style base strings into a usable browser origin.
 * Rejects bare tokens (e.g. API keys mistaken for BASE_URL) that are not real hostnames.
 */

function isPlausibleHttpHostname(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === "localhost" || h === "127.0.0.1") return true;
  // Typical internet / tunnel / Vercel hosts include a label boundary.
  if (h.includes(".")) return true;
  return false;
}

/**
 * Parses a single candidate into `protocol//host[:port]` (URL `origin`), or null if invalid / not a plausible public host.
 */
export function parseHttpOriginCandidate(
  candidate: string | undefined | null
): string | null {
  const s = candidate?.trim();
  if (!s) return null;
  const withScheme =
    s.startsWith("http://") || s.startsWith("https://") ? s : `https://${s}`;
  let u: URL;
  try {
    u = new URL(withScheme);
  } catch {
    return null;
  }
  if (u.username || u.password) return null;
  const host = u.hostname;
  if (!host || !isPlausibleHttpHostname(host)) return null;
  return u.origin;
}

/** First non-null origin from candidates (in order). */
export function firstHttpOriginFromCandidates(
  candidates: Array<string | undefined | null>
): string | null {
  for (const c of candidates) {
    const o = parseHttpOriginCandidate(c);
    if (o) return o;
  }
  return null;
}

/**
 * True when this origin points at loopback. Remote screenshot services cannot reach it.
 *
 * Includes any `*.localhost` subdomain (e.g. `deploy.localhost`): per RFC 6761
 * those resolve to the loopback interface on the local machine, so a remote
 * service like ScreenshotOne either cannot resolve them at all or resolves
 * them to its own 127.0.0.1 — never the developer's box.
 */
export function isLoopbackHttpOrigin(origin: string): boolean {
  try {
    const h = new URL(origin).hostname.toLowerCase();
    if (h === "localhost" || h === "127.0.0.1" || h === "[::1]" || h === "::1") {
      return true;
    }
    if (h.endsWith(".localhost")) return true;
    return false;
  } catch {
    return true;
  }
}
