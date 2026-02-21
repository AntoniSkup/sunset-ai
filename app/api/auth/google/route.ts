import { NextRequest, NextResponse } from "next/server";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";

export async function GET(request: NextRequest) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const baseUrl = process.env.BASE_URL || "http://localhost:3000";

  if (!clientId) {
    console.error("GOOGLE_CLIENT_ID is not configured");
    return NextResponse.redirect(new URL("/sign-in?error=config", baseUrl));
  }

  const searchParams = request.nextUrl.searchParams;
  const redirect = searchParams.get("redirect");
  const priceId = searchParams.get("priceId");
  const inviteId = searchParams.get("inviteId");

  const state = Buffer.from(
    JSON.stringify({ redirect, priceId, inviteId })
  ).toString("base64url");

  const redirectUri = `${baseUrl}/api/auth/google/callback`;
  const scopes = [
    "openid",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
  ].join(" ");

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: scopes,
    access_type: "online",
    state,
    prompt: "select_account",
  });

  const authUrl = `${GOOGLE_AUTH_URL}?${params.toString()}`;
  return NextResponse.redirect(authUrl);
}
