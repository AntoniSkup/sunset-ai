import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { signToken, verifyToken } from "@/lib/auth/session";
import {
  isDeployHost,
  getPublishedSiteLabelFromHost,
} from "@/lib/preview/deploy-host";

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

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const host =
    request.headers.get("x-forwarded-host") ?? request.headers.get("host");

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

  // Main app: deploy-only routes must not be reachable here. Defense in depth
  // against URL leaks (e.g. someone pasting a /p/<token> link into the app).
  if (isDeployOnlyPath(pathname)) {
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
