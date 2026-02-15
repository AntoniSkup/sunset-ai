import { put } from "@vercel/blob";
import { getComposedHtml } from "@/lib/preview/compose-html";
import { updateChatScreenshotUrl } from "@/lib/db/queries";

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
