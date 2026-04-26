import { logger, task } from "@trigger.dev/sdk/v3";
import { captureLandingPageScreenshot } from "@/lib/screenshots/capture";

export type CaptureLandingScreenshotPayload = {
  chatId: string;
  revisionNumber: number;
  userId: number;
};

/**
 * Background screenshot capture for a landing page revision.
 *
 * Runs as its own Trigger task (rather than a fire-and-forget promise inside
 * `run-chat-turn`) because:
 * - the chat task's `run()` returns as soon as the model stream is drained, at
 *   which point Trigger is free to evict the worker. Any in-flight screenshot
 *   promise gets killed, which is why thumbnails were disappearing in prod.
 * - the screenshot itself can take 30-90s (ScreenshotOne navigation + paint
 *   delay + upload to Vercel Blob), well beyond what fire-and-forget can
 *   reliably keep alive across worker boundaries.
 *
 * Keeping the chat run snappy and moving the screenshot here also gives us
 * proper retries and observability per capture attempt.
 */
export const captureLandingScreenshotTask = task({
  id: "capture-landing-screenshot",
  maxDuration: 180,
  retry: {
    maxAttempts: 2,
    minTimeoutInMs: 2_000,
    maxTimeoutInMs: 30_000,
    factor: 2,
    randomize: true,
  },
  run: async (payload: CaptureLandingScreenshotPayload) => {
    const { chatId, revisionNumber, userId } = payload ?? ({} as CaptureLandingScreenshotPayload);
    if (!chatId || typeof revisionNumber !== "number" || typeof userId !== "number") {
      throw new Error(
        "captureLandingScreenshotTask requires { chatId, revisionNumber, userId }"
      );
    }

    logger.log("Capturing landing screenshot", {
      chatId,
      revisionNumber,
      userId,
    });

    await captureLandingPageScreenshot({ chatId, revisionNumber, userId });

    return { status: "succeeded" as const, chatId, revisionNumber };
  },
});
