import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import createIntlMiddleware from "next-intl/middleware";
import { signToken, verifyToken } from "@/lib/auth/session";
import { routing } from "@/i18n/routing";
import {
  isDeployHost,
  getPublishedSiteLabelFromHost,
} from "@/lib/preview/deploy-host";
import { getScreenshotCaptureHost } from "@/lib/screenshots/public-app-origin";

const protectedRoutePrefixes = ["/dashboard", "/start"];

const intlMiddleware = createIntlMiddleware(routing);

/**
 * Paths the i18n middleware must NOT touch:
 *   - Next.js framework outputs (sitemap, robots, og-image, favicon variants)
 *     — these are crawler/asset URLs that must not be prefix-redirected.
 *   - Anything that *looks* like a static asset (has a file extension).
 *
 * `/api/*` is already excluded by the matcher below, so it doesn't need a
 * check here.
 */
function shouldBypassIntl(pathname: string): boolean {
  if (
    pathname === "/sitemap.xml" ||
    pathname === "/robots.txt" ||
    pathname === "/opengraph-image" ||
    pathname.startsWith("/opengraph-image/") ||
    pathname === "/icon" ||
    pathname === "/apple-icon"
  ) {
    return true;
  }
  return /\.(ico|png|jpe?g|svg|webp|gif|css|js|map|txt|xml|json|woff2?)$/i.test(
    pathname
  );
}

/**
 * Strip a non-default locale prefix from a pathname so we can compare
 * against bare route prefixes ("/dashboard", "/start") regardless of which
 * locale the user is browsing in.
 *
 * Returns `{ locale: "en", path: "/dashboard" }` for the bare default-locale
 * case, and `{ locale: "pl", path: "/dashboard" }` for `/pl/dashboard`.
 */
function stripLocalePrefix(pathname: string): {
  locale: (typeof routing.locales)[number];
  path: string;
} {
  for (const locale of routing.locales) {
    if (locale === routing.defaultLocale) continue;
    if (pathname === `/${locale}`) {
      return { locale, path: "/" };
    }
    if (pathname.startsWith(`/${locale}/`)) {
      return { locale, path: pathname.slice(locale.length + 1) };
    }
  }
  return { locale: routing.defaultLocale, path: pathname };
}

function localizedPath(
  locale: (typeof routing.locales)[number],
  bare: string
): string {
  if (locale === routing.defaultLocale) return bare;
  return `/${locale}${bare === "/" ? "" : bare}`;
}

const DEPLOY_HOST_ALLOWED_PREFIXES = ["/p/", "/s/"];
const DEPLOY_HOST_ALLOWED_EXACT = new Set(["/favicon.ico", "/robots.txt"]);

/**
 * Path is considered "preview-shell-only" — only renderable on the deploy
 * origin (`stronkaai-deploy.com`), never on the main app.
 */
function isDeployOnlyPath(pathname: string): boolean {
  return DEPLOY_HOST_ALLOWED_PREFIXES.some((p) => pathname.startsWith(p));
}

function isDeployHostAllowedPath(pathname: string): boolean {
  if (isDeployOnlyPath(pathname)) return true;
  if (DEPLOY_HOST_ALLOWED_EXACT.has(pathname)) return true;
  return false;
}

/**
 * Normalize an HTTP host (`host` / `x-forwarded-host` value) for comparison:
 * lowercase, drop default ports, take the first comma-separated value
 * (proxies sometimes append upstream hosts).
 */
function normalizeHostForCompare(value: string | null | undefined): string | null {
  if (!value) return null;
  const first = value.split(",")[0]?.trim();
  if (!first) return null;
  const lower = first.toLowerCase();
  return lower
    .replace(/:80$/, "")
    .replace(/:443$/, "");
}

function hostMatches(target: string | null, candidates: Array<string | null>): boolean {
  if (!target) return false;
  const t = normalizeHostForCompare(target);
  if (!t) return false;
  return candidates.some((c) => normalizeHostForCompare(c) === t);
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const xfh = request.headers.get("x-forwarded-host");
  const rawHost = request.headers.get("host");
  const host = xfh ?? rawHost;

  // Published site at `<slug>.<deploy host>` — rewrite to `/s/<slug>` and
  // allow `/s/<slug>/...` and `/_next/*` on that host.
  const siteLabel = getPublishedSiteLabelFromHost(host);
  if (siteLabel) {
    if (pathname === "/" || pathname === "") {
      const url = request.nextUrl.clone();
      url.pathname = `/s/${encodeURIComponent(siteLabel)}`;
      return NextResponse.rewrite(url);
    }
    if (pathname === "/bundle") {
      const url = request.nextUrl.clone();
      url.pathname = `/s/${encodeURIComponent(siteLabel)}/bundle`;
      return NextResponse.rewrite(url);
    }
    const publishedSeg = /^\/s\/([^/]+)(?:\/|$)/.exec(pathname);
    if (
      publishedSeg &&
      decodeURIComponent(publishedSeg[1] ?? "") === siteLabel
    ) {
      return NextResponse.next();
    }
    if (
      pathname.startsWith("/_next/") ||
      pathname === "/favicon.ico" ||
      pathname === "/robots.txt"
    ) {
      return NextResponse.next();
    }
    return new NextResponse("Not Found", { status: 404 });
  }

  const onDeploy = isDeployHost(host);

  // Deploy origin: serve only the preview/published shells. Everything else
  // (dashboard, sign-in, billing, /api/*) is invisible here so a misconfig
  // can never leak the main app surface onto stronkaai-deploy.com.
  if (onDeploy) {
    if (!isDeployHostAllowedPath(pathname)) {
      return new NextResponse("Not Found", { status: 404 });
    }
    return NextResponse.next();
  }

  // Screenshot tunnel (e.g. ngrok forwarding `SCREENSHOT_BROWSER_BASE_URL` to
  // the dev server in local dev): treated like the deploy host *only* for the
  // preview/publish shells, so ScreenshotOne can fetch `/p/<token>` and its
  // bundle through the tunnel. Tokens are JWT-gated so a leaked URL is still
  // useless without a valid token. We compare against both `host` and
  // `x-forwarded-host` because ngrok / other proxies may rewrite one but not
  // the other depending on configuration.
  const screenshotHost = getScreenshotCaptureHost();
  const onScreenshotTunnel = hostMatches(screenshotHost, [xfh, rawHost]);
  if (onScreenshotTunnel) {
    if (isDeployHostAllowedPath(pathname)) {
      return NextResponse.next();
    }
    // For non-deploy paths fall through to the normal main-app handling.
  }

  // Main app: deploy-only routes must not be reachable here. Defense in depth
  // against URL leaks (e.g. someone pasting a /p/<token> link into the app).
  if (isDeployOnlyPath(pathname)) {
    console.warn(
      "[middleware] 404 for deploy-only path on main-app host. If this is a ScreenshotOne capture, set SCREENSHOT_BROWSER_BASE_URL to a public tunnel that matches the request host.",
      {
        pathname,
        host: rawHost,
        xForwardedHost: xfh,
        screenshotCaptureHost: screenshotHost,
      }
    );
    return new NextResponse("Not Found", { status: 404 });
  }

  // i18n routing for the main app. Skip framework-asset-shaped paths
  // (sitemap/robots/og-image/etc.) so they're not prefix-redirected to
  // `/pl/sitemap.xml` for Polish-cookie users — that would silently break
  // crawler discovery.
  const intlResponse = shouldBypassIntl(pathname)
    ? NextResponse.next()
    : intlMiddleware(request);

  // If next-intl wants to redirect (e.g. add `/pl` prefix because the user's
  // NEXT_LOCALE cookie is `pl`), let it. Session refresh will run on the
  // follow-up request.
  if (intlResponse.status >= 300 && intlResponse.status < 400) {
    return intlResponse;
  }

  const sessionCookie = request.cookies.get("session");
  const { locale: pathLocale, path: barePath } = stripLocalePrefix(pathname);
  const isProtectedRoute = protectedRoutePrefixes.some((prefix) =>
    barePath.startsWith(prefix)
  );

  if (isProtectedRoute && !sessionCookie) {
    return NextResponse.redirect(
      new URL(localizedPath(pathLocale, "/sign-in"), request.url)
    );
  }

  // Layer session-refresh cookies on top of next-intl's response so the
  // NEXT_LOCALE cookie (set by the i18n middleware when the URL's locale
  // differs from the cookie) is preserved.
  const res = intlResponse;

  if (sessionCookie && request.method === "GET") {
    try {
      const parsed = await verifyToken(sessionCookie.value);
      const expiresInTwoWeeks = new Date(
        Date.now() + 14 * 24 * 60 * 60 * 1000
      );

      res.cookies.set({
        name: "session",
        value: await signToken({
          ...parsed,
          expires: expiresInTwoWeeks.toISOString(),
        }),
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        expires: expiresInTwoWeeks,
      });
    } catch (error) {
      console.error("Error updating session:", error);
      res.cookies.delete("session");
      if (isProtectedRoute) {
        return NextResponse.redirect(
          new URL(localizedPath(pathLocale, "/sign-in"), request.url)
        );
      }
    }
  }

  return res;
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
  runtime: "nodejs",
};
