import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { signToken, verifyToken } from "@/lib/auth/session";
import {
  isDeployHost,
  getPublishedSiteLabelFromHost,
} from "@/lib/preview/deploy-host";
import { getScreenshotCaptureHost } from "@/lib/screenshots/public-app-origin";

const protectedRoutePrefixes = ["/dashboard", "/start"];

const DEPLOY_HOST_ALLOWED_PREFIXES = ["/p/", "/s/"];
const DEPLOY_HOST_ALLOWED_EXACT = new Set(["/favicon.ico", "/robots.txt"]);

/**
 * Path is considered "preview-shell-only" — only renderable on the deploy
 * origin (`sunset-deploy.com`), never on the main app.
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
  // can never leak the main app surface onto sunset-deploy.com.
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

  const sessionCookie = request.cookies.get("session");
  const isProtectedRoute = protectedRoutePrefixes.some((prefix) =>
    pathname.startsWith(prefix)
  );

  if (isProtectedRoute && !sessionCookie) {
    return NextResponse.redirect(new URL("/sign-in", request.url));
  }

  let res = NextResponse.next();

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
        return NextResponse.redirect(new URL("/sign-in", request.url));
      }
    }
  }

  return res;
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
  runtime: "nodejs",
};
