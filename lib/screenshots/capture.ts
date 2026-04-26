import { put } from "@vercel/blob";
import { getComposedHtml } from "@/lib/preview/compose-html";
import { updateChatScreenshotUrl } from "@/lib/db/queries";
import { createRenderSnapshotToken } from "@/lib/render-snapshot-token";
import { getDeployOriginOrNull } from "@/lib/preview/deploy-host";
import { isLoopbackHttpOrigin } from "@/lib/url/resolve-http-origin";
import { captureUrlWithScreenshotOne } from "@/lib/screenshots/screenshot-one-url";

const SCREENSHOTONE_API = "https://api.screenshotone.com/take";

/** URL-capture JPEGs smaller than this are usually blank / error placeholders; retry static HTML. */
const MIN_URL_CAPTURE_JPEG_BYTES = 12_000;

/**
 * Captures a screenshot of the landing page at the given revision,
 * uploads to Vercel Blob, and updates the chat's screenshot_url.
 * Designed to run in the background (fire-and-forget).
 *
 * Capture strategy:
 *   1. URL capture via the deploy origin (`https://sunset-deploy.com/p/<token>`).
 *      This is the only path that supports React/Tailwind landings, and it
 *      runs the same bundle the user sees in the builder iframe.
 *   2. Legacy `landing/index.html` fallback: send static composed HTML inline
 *      to ScreenshotOne. Only used for older HTML-include chats; never
 *      executes user JS server-side.
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
    const deployOrigin = getDeployOriginOrNull();
    const token = await createRenderSnapshotToken({ chatId, revisionNumber });

    if (deployOrigin && !isLoopbackHttpOrigin(deployOrigin) && token) {
      const renderUrl = `${deployOrigin}/p/${encodeURIComponent(token)}`;
      const imageBuffer = await captureUrlWithScreenshotOne({
        url: renderUrl,
        viewportWidth: 1920,
        viewportHeight: 1080,
        imageWidth: 624,
        imageHeight: 350,
        imageQuality: 80,
      });
      if (
        imageBuffer &&
        imageBuffer.byteLength >= MIN_URL_CAPTURE_JPEG_BYTES
      ) {
        const blob = await put(
          `screenshots/${chatId}-${revisionNumber}-${Date.now()}.jpg`,
          imageBuffer,
          {
            access: "public",
            addRandomSuffix: false,
          }
        );
        await updateChatScreenshotUrl(chatId, userId, blob.url);
        return;
      }
      if (imageBuffer && imageBuffer.byteLength > 0) {
        console.warn(
          `[Screenshot] URL capture JPEG too small (${imageBuffer.byteLength} bytes); falling back to static HTML`
        );
      } else {
        console.warn(
          "[Screenshot] URL capture failed or empty; falling back to static HTML"
        );
      }
    } else if (!deployOrigin) {
      console.warn(
        "[Screenshot] NEXT_PUBLIC_DEPLOY_ORIGIN not set; URL-capture path skipped. Falling back to static HTML if available."
      );
    } else if (isLoopbackHttpOrigin(deployOrigin)) {
      console.warn(
        "[Screenshot] NEXT_PUBLIC_DEPLOY_ORIGIN is loopback; ScreenshotOne cannot reach it. Set it to a public tunnel URL (ngrok) for local dev or use a real domain in prod."
      );
    } else if (!token) {
      console.warn(
        "[Screenshot] Could not mint render token (set RENDER_SNAPSHOT_SECRET or AUTH_SECRET); falling back to static HTML"
      );
    }

    // Legacy fallback for chats whose entry file is `landing/index.html`
    // (no React bundle). The composed HTML is purely static and safe to
    // render in the ScreenshotOne sandbox.
    const html = await getComposedHtml({ chatId, revisionNumber });
    if (!html) {
      console.warn(`[Screenshot] No composed HTML for chat ${chatId} revision ${revisionNumber}`);
      return;
    }

    const response = await fetch(SCREENSHOTONE_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Access-Key": accessKey,
      },
      body: JSON.stringify({
        html,
        format: "jpeg",
        viewport_width: 1920,
        viewport_height: 1080,
        full_page: false,
        image_width: 624,
        image_height: 350,
        image_quality: 80,
        // The composed HTML pulls Tailwind from the play CDN at runtime.
        // Without these waits ScreenshotOne captures before the CDN script
        // injects the generated stylesheet, producing an unstyled JPEG that
        // still passes our size threshold and gets persisted as the project
        // thumbnail. Mirror the URL-capture timings.
        wait_until: ["load", "networkidle2"],
        navigation_timeout: 30,
        timeout: 90,
        delay: 3,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`ScreenshotOne API error ${response.status}: ${errText}`);
    }

    const imageBuffer = await response.arrayBuffer();

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
