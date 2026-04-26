import { parseHttpOriginCandidate } from "@/lib/url/resolve-http-origin";

/**
 * Origin where AI-generated landing pages are rendered.
 *
 * This MUST be a different host from the main app so the iframe runs in a
 * separate browser origin (no shared cookies, no shared storage, no
 * `fetch("/api/...")` against the real app). All consumers — builder iframe,
 * ScreenshotOne capture, published share links — point here.
 *
 * Production: `https://sunset-deploy.com`
 * Local dev: `http://deploy.localhost:3000` (treated as a separate origin from
 * `localhost` by all major browsers, so cookie/storage isolation still applies).
 */
export function getDeployOrigin(): string {
  const origin = parseHttpOriginCandidate(
    process.env.NEXT_PUBLIC_DEPLOY_ORIGIN
  );
  if (!origin) {
    throw new Error(
      "NEXT_PUBLIC_DEPLOY_ORIGIN is not configured. Set it to the public origin of the preview/publish host (e.g. https://sunset-deploy.com)."
    );
  }
  return origin;
}

/**
 * Like {@link getDeployOrigin} but returns null instead of throwing when the
 * env var is missing — useful in non-critical paths that should degrade
 * gracefully (e.g. screenshot captures during local dev without the env var
 * set).
 */
export function getDeployOriginOrNull(): string | null {
  return parseHttpOriginCandidate(process.env.NEXT_PUBLIC_DEPLOY_ORIGIN);
}

/** Host portion of the deploy origin, e.g. `sunset-deploy.com`. */
export function getDeployHost(): string | null {
  const origin = getDeployOriginOrNull();
  if (!origin) return null;
  try {
    return new URL(origin).host.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Returns true when the incoming request's `host` header matches the
 * configured deploy origin host.
 */
export function isDeployHost(host: string | null | undefined): boolean {
  if (!host) return false;
  const deployHost = getDeployHost();
  if (!deployHost) return false;
  return host.toLowerCase() === deployHost;
}

/** Builds a URL on the deploy origin from a path (must start with `/`). */
export function buildDeployUrl(path: string): string {
  const origin = getDeployOrigin();
  return `${origin}${path.startsWith("/") ? path : `/${path}`}`;
}
