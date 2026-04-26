import { tasks } from "@trigger.dev/sdk/v3";
import { captureLandingPageScreenshot } from "@/lib/screenshots/capture";

export type ScheduleLandingScreenshotParams = {
  chatId: string;
  revisionNumber: number;
  userId: number;
};

/**
 * Schedule a landing-page screenshot capture for a chat revision.
 *
 * When the Trigger queue is enabled (`ENABLE_TRIGGER_CHAT_QUEUE=1`) this
 * enqueues a dedicated `capture-landing-screenshot` task so the capture runs
 * to completion regardless of what the parent chat run is doing. That fixes
 * the production bug where the previous fire-and-forget promise was killed
 * with the chat worker before ScreenshotOne returned.
 *
 * When the queue is disabled (e.g. local dev without `pnpm dev:trigger`) we
 * fall back to running the capture inline. The legacy `/api/chat` Vercel
 * route is the only caller in that mode, and its function may freeze before
 * we finish — but inline still gives `next dev` users working thumbnails.
 *
 * Always returns once the work is *scheduled*; never throws.
 */
export async function scheduleLandingScreenshotCapture(
  params: ScheduleLandingScreenshotParams
): Promise<void> {
  const { chatId, revisionNumber, userId } = params;

  if (process.env.ENABLE_TRIGGER_CHAT_QUEUE === "1") {
    try {
      await tasks.trigger("capture-landing-screenshot", {
        chatId,
        revisionNumber,
        userId,
      });
      return;
    } catch (error) {
      console.error(
        "[Screenshot] Failed to enqueue capture-landing-screenshot task; falling back to inline capture",
        error
      );
      // fall through to inline path
    }
  }

  // Inline fallback: best-effort fire-and-forget. We deliberately do NOT
  // await this because the only caller paths that hit it (local dev w/o
  // Trigger, or Trigger-enqueue failures) prefer not to delay the response.
  void captureLandingPageScreenshot({
    chatId,
    revisionNumber,
    userId,
  }).catch((error) => {
    console.error("[Screenshot] Inline capture failed:", error);
  });
}
