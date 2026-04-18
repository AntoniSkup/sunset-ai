import "server-only";

/**
 * Absolute origin (no trailing slash) used when ScreenshotOne or other services
 * must fetch a URL on this deployment (e.g. signed render-snapshot page).
 */
export function getPublicAppOrigin(): string | null {
  const explicit =
    process.env.SCREENSHOT_BROWSER_BASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (explicit) {
    try {
      const u = new URL(explicit.startsWith("http") ? explicit : `https://${explicit}`);
      return u.origin;
    } catch {
      return null;
    }
  }
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) {
    const host = vercel.replace(/^https?:\/\//i, "").replace(/\/+$/, "");
    if (host) return `https://${host}`;
  }
  return null;
}
