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
