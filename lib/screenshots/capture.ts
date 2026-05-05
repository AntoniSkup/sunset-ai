import { put } from "@vercel/blob";
import { updateChatScreenshotUrl } from "@/lib/db/queries";
import { createRenderSnapshotToken } from "@/lib/render-snapshot-token";
import { getScreenshotCaptureOrigin } from "@/lib/screenshots/public-app-origin";
import { captureUrlWithScreenshotOne } from "@/lib/screenshots/screenshot-one-url";

/** URL-capture JPEGs smaller than this are usually blank / error placeholders; treat as a failed capture. */
const MIN_URL_CAPTURE_JPEG_BYTES = 12_000;

/**
 * Captures a screenshot of the landing page at the given revision,
 * uploads to Vercel Blob, and updates the chat's screenshot_url.
 * Designed to run in the background (fire-and-forget).
 *
 * Capture path:
 *   URL capture via the deploy origin (`https://stronkaai-deploy.com/p/<token>`).
 *   The origin is resolved by `getScreenshotCaptureOrigin()`, which prefers
 *   `NEXT_PUBLIC_DEPLOY_ORIGIN` and falls back to the configured
 *   `SCREENSHOT_BROWSER_BASE_URL` tunnel when the deploy origin is loopback
 *   (e.g. `deploy.localhost` in dev). Same bundle the user sees in the
 *   builder iframe — no static-HTML fallback exists.
 */
export async function captureLandingPageScreenshot(params: {
  chatId: string;
  revisionNumber: number;
  userId: number;
}): Promise<void> {
  const { chatId, revisionNumber, userId } = params;

  const accessKey = process.env.SCREENSHOTONE_ACCESS_KEY;
  if (!accessKey) {
    console.warn("[Screenshot] SCREENSHOTONE_ACCESS_KEY not set, skipping capture");
    return;
  }

  try {
    const captureOrigin = getScreenshotCaptureOrigin();
    if (!captureOrigin) {
      console.warn(
        "[Screenshot] No reachable origin for URL capture. Set NEXT_PUBLIC_DEPLOY_ORIGIN to a public host, or SCREENSHOT_BROWSER_BASE_URL to a tunnel URL (ngrok) for local dev."
      );
      return;
    }

    const token = await createRenderSnapshotToken({ chatId, revisionNumber });
    if (!token) {
      console.warn(
        "[Screenshot] Could not mint render token (set RENDER_SNAPSHOT_SECRET or AUTH_SECRET); skipping capture"
      );
      return;
    }

    const renderUrl = `${captureOrigin}/p/${encodeURIComponent(token)}`;
    console.log("[Screenshot] capturing URL", {
      chatId,
      revisionNumber,
      renderUrl,
    });
    const imageBuffer = await captureUrlWithScreenshotOne({
      url: renderUrl,
      viewportWidth: 1920,
      viewportHeight: 1080,
      imageWidth: 624,
      imageHeight: 350,
      imageQuality: 80,
    });

    if (!imageBuffer || imageBuffer.byteLength === 0) {
      console.warn("[Screenshot] URL capture failed or empty; nothing to upload");
      return;
    }
    if (imageBuffer.byteLength < MIN_URL_CAPTURE_JPEG_BYTES) {
      console.warn(
        `[Screenshot] URL capture JPEG too small (${imageBuffer.byteLength} bytes); discarding likely error placeholder`
      );
      return;
    }

    const blob = await put(
      `screenshots/${chatId}-${revisionNumber}-${Date.now()}.jpg`,
      imageBuffer,
      {
        access: "public",
        addRandomSuffix: false,
      }
    );
    await updateChatScreenshotUrl(chatId, userId, blob.url);
  } catch (error) {
    console.error("[Screenshot] Capture failed:", error);
  }
}
