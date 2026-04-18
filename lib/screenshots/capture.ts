import { put } from "@vercel/blob";
import { getComposedHtml } from "@/lib/preview/compose-html";
import { getComposedReactHtml } from "@/lib/preview/compose-react";
import { updateChatScreenshotUrl } from "@/lib/db/queries";
import { createRenderSnapshotToken } from "@/lib/render-snapshot-token";
import { getPublicAppOrigin } from "@/lib/screenshots/public-app-origin";
import { captureUrlWithScreenshotOne } from "@/lib/screenshots/screenshot-one-url";

const SCREENSHOTONE_API = "https://api.screenshotone.com/take";

/**
 * Captures a screenshot of the landing page at the given revision,
 * uploads to Vercel Blob, and updates the chat's screenshot_url.
 * Designed to run in the background (fire-and-forget).
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
    const origin = getPublicAppOrigin();
    const token = await createRenderSnapshotToken({ chatId, revisionNumber });

    if (origin && token) {
      const renderUrl = `${origin}/api/render-snapshot?token=${encodeURIComponent(token)}`;
      const imageBuffer = await captureUrlWithScreenshotOne({
        url: renderUrl,
        viewportWidth: 1920,
        viewportHeight: 1080,
        imageWidth: 624,
        imageHeight: 350,
        imageQuality: 80,
      });
      if (imageBuffer && imageBuffer.byteLength > 0) {
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
      console.warn(
        "[Screenshot] URL capture failed or empty; falling back to static HTML"
      );
    } else if (!origin) {
      console.warn(
        "[Screenshot] No public app origin (set SCREENSHOT_BROWSER_BASE_URL, NEXT_PUBLIC_APP_URL, or deploy with VERCEL_URL); falling back to static HTML"
      );
    } else if (!token) {
      console.warn(
        "[Screenshot] Could not mint render token (set RENDER_SNAPSHOT_SECRET or AUTH_SECRET); falling back to static HTML"
      );
    }

    const html =
      (await getComposedReactHtml({ chatId, revisionNumber })) ??
      (await getComposedHtml({ chatId, revisionNumber }));
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
