import "server-only";
import {
  firstHttpOriginFromCandidates,
  parseHttpOriginCandidate,
  isLoopbackHttpOrigin,
} from "@/lib/url/resolve-http-origin";

/**
 * Absolute origin used when ScreenshotOne (or similar) must fetch this app over the internet.
 *
 * - Skips invalid tokens and loopback URLs (localhost cannot be reached from ScreenshotOne).
 * - For local dev, set `SCREENSHOT_BROWSER_BASE_URL` to a tunnel URL (e.g. ngrok `https://….ngrok-free.app`).
 */
export function getPublicAppOrigin(): string | null {
  const dedicated = parseHttpOriginCandidate(
    process.env.SCREENSHOT_BROWSER_BASE_URL
  );
  if (dedicated && !isLoopbackHttpOrigin(dedicated)) {
    return dedicated;
  }

  const fallback = firstHttpOriginFromCandidates([
    process.env.APP_BASE_URL,
    process.env.BASE_URL,
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.VERCEL_URL,
  ]);
  if (fallback && !isLoopbackHttpOrigin(fallback)) {
    return fallback;
  }
  return null;
}

/**
 * Origin ScreenshotOne uses to fetch the `/p/<token>` preview shell.
 *
 * Prefers `NEXT_PUBLIC_DEPLOY_ORIGIN` (the real deploy host in prod). When
 * that points at loopback (e.g. `deploy.localhost:3000` in dev),
 * falls back to the tunnel URL configured for screenshots
 * (`SCREENSHOT_BROWSER_BASE_URL`, typically an ngrok forwarding origin).
 *
 * Returns `null` when neither is reachable from a remote service — callers
 * should skip URL capture in that case.
 */
export function getScreenshotCaptureOrigin(): string | null {
  const deploy = parseHttpOriginCandidate(
    process.env.NEXT_PUBLIC_DEPLOY_ORIGIN
  );
  if (deploy && !isLoopbackHttpOrigin(deploy)) return deploy;
  return getPublicAppOrigin();
}

/** Lowercase host portion of {@link getScreenshotCaptureOrigin}, or null. */
export function getScreenshotCaptureHost(): string | null {
  const origin = getScreenshotCaptureOrigin();
  if (!origin) return null;
  try {
    return new URL(origin).host.toLowerCase();
  } catch {
    return null;
  }
}
