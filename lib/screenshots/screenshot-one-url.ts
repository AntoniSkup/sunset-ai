import "server-only";

const SCREENSHOTONE_API = "https://api.screenshotone.com/take";

/** ScreenshotOne can take up to `timeout` seconds server-side; allow headroom for the HTTP response. */
const FETCH_DEADLINE_MS = 120_000;

export type ScreenshotOneUrlCaptureOptions = {
  url: string;
  viewportWidth?: number;
  viewportHeight?: number;
  imageWidth?: number;
  imageHeight?: number;
  imageQuality?: number;
};

/**
 * Extra headers ScreenshotOne sends on the initial navigation.
 * `ngrok-skip-browser-warning` skips the free-ngrok browser interstitial (otherwise headless hits timeout).
 * Other origins typically ignore this header.
 *
 * Add more via `SCREENSHOTONE_NAVIGATION_HEADERS` as `Name:Value` lines or comma-separated.
 */
function screenshotOneNavigationHeaders(): string[] {
  const out: string[] = ["ngrok-skip-browser-warning:1"];
  const extra = process.env.SCREENSHOTONE_NAVIGATION_HEADERS?.trim();
  if (extra) {
    for (const part of extra.split(/[\n,]+/)) {
      const line = part.trim();
      if (line.includes(":")) out.push(line);
    }
  }
  return out;
}

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

  const navHeaders = screenshotOneNavigationHeaders();

  try {
    const response = await fetch(SCREENSHOTONE_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Access-Key": accessKey,
      },
      signal: AbortSignal.timeout(FETCH_DEADLINE_MS),
      body: JSON.stringify({
        url,
        format: "jpeg",
        viewport_width: viewportWidth,
        viewport_height: viewportHeight,
        full_page: false,
        image_width: imageWidth,
        image_height: imageHeight,
        image_quality: imageQuality,
        wait_until: ["load"],
        navigation_timeout: 30,
        timeout: 90,
        bypass_csp: true,
        wait_for_selector: 'html[data-landing-snapshot="1"]',
        delay: 2,
        headers: navHeaders,
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
