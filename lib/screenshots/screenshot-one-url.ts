import "server-only";

const SCREENSHOTONE_API = "https://api.screenshotone.com/take";

export type ScreenshotOneUrlCaptureOptions = {
  url: string;
  viewportWidth?: number;
  viewportHeight?: number;
  imageWidth?: number;
  imageHeight?: number;
  imageQuality?: number;
};

/**
 * Renders a public URL via ScreenshotOne (JPEG). Returns null on failure.
 */
export async function captureUrlWithScreenshotOne(
  params: ScreenshotOneUrlCaptureOptions
): Promise<ArrayBuffer | null> {
  const accessKey = process.env.SCREENSHOTONE_ACCESS_KEY;
  if (!accessKey) return null;

  const {
    url,
    viewportWidth = 1920,
    viewportHeight = 1080,
    imageWidth = 624,
    imageHeight = 350,
    imageQuality = 80,
  } = params;

  try {
    const response = await fetch(SCREENSHOTONE_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Access-Key": accessKey,
      },
      body: JSON.stringify({
        url,
        format: "jpeg",
        viewport_width: viewportWidth,
        viewport_height: viewportHeight,
        full_page: false,
        image_width: imageWidth,
        image_height: imageHeight,
        image_quality: imageQuality,
        wait_until: ["networkidle2"],
        delay: 3,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(
        `[ScreenshotOne] URL capture failed ${response.status}: ${errText}`
      );
      return null;
    }

    return await response.arrayBuffer();
  } catch (error) {
    console.error("[ScreenshotOne] URL capture exception:", error);
    return null;
  }
}
