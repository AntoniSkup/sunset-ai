import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/drizzle";
import {
  users,
  teams,
  teamMembers,
  activityLogs,
} from "@/lib/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { setSession } from "@/lib/auth/session";
import { hashPassword, comparePasswords } from "@/lib/auth/session";
import { ActivityType } from "@/lib/db/schema";
import { createCheckoutSession } from "@/lib/payments/stripe";

const OAUTH_PLACEHOLDER_PASSWORD = "oauth:google";

async function logActivity(
  teamId: number | null | undefined,
  userId: number,
  type: ActivityType
) {
  if (teamId == null) return;
  try {
    await db.insert(activityLogs).values({
      teamId,
      userId,
      action: type,
      ipAddress: "",
    });
  } catch (error) {
    console.error("Error logging activity:", error);
  }
}

export async function GET(request: NextRequest) {
  const baseUrl = process.env.BASE_URL || "http://localhost:3000";
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.error("Google OAuth credentials not configured");
    return NextResponse.redirect(new URL("/sign-in?error=config", baseUrl));
  }

  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const error = searchParams.get("error");
  const stateParam = searchParams.get("state");

  if (error) {
    console.error("Google OAuth error:", error);
    return NextResponse.redirect(new URL("/sign-in?error=denied", baseUrl));
  }

  if (!code) {
    return NextResponse.redirect(new URL("/sign-in?error=no_code", baseUrl));
  }

  let state: { redirect?: string; priceId?: string; inviteId?: string } = {};
  try {
    if (stateParam) {
      state = JSON.parse(
        Buffer.from(stateParam, "base64url").toString("utf-8")
      );
    }
  } catch {
    // ignore invalid state
  }

  const redirectUri = `${baseUrl}/api/auth/google/callback`;

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!tokenResponse.ok) {
    const err = await tokenResponse.text();
    console.error("Google token exchange failed:", err);
    return NextResponse.redirect(new URL("/sign-in?error=token", baseUrl));
  }

  const tokens = await tokenResponse.json();
  const accessToken = tokens.access_token;

  const userInfoResponse = await fetch(
    "https://www.googleapis.com/oauth2/v2/userinfo",
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  if (!userInfoResponse.ok) {
    console.error("Failed to fetch Google user info");
    return NextResponse.redirect(new URL("/sign-in?error=userinfo", baseUrl));
  }

  const googleUser = await userInfoResponse.json();
  const email = googleUser.email;
  const name = googleUser.name || googleUser.email?.split("@")[0] || "User";

  if (!email) {
    return NextResponse.redirect(new URL("/sign-in?error=no_email", baseUrl));
  }

  const existingUser = await db
    .select({
      user: users,
      team: teams,
    })
    .from(users)
    .leftJoin(teamMembers, eq(users.id, teamMembers.userId))
    .leftJoin(teams, eq(teamMembers.teamId, teams.id))
    .where(and(eq(users.email, email), isNull(users.deletedAt)))
    .limit(1);

  let userToSession;
  let userTeam: (typeof teams.$inferSelect) | null = null;

  if (existingUser.length > 0) {
    const { user: foundUser, team } = existingUser[0];
    const isOAuthUser = await comparePasswords(
      OAUTH_PLACEHOLDER_PASSWORD,
      foundUser.passwordHash
    );
    if (isOAuthUser) {
      userToSession = foundUser;
      userTeam = team ?? null;
      if (team) {
        await logActivity(team.id, foundUser.id, ActivityType.SIGN_IN);
      }
    } else {
      return NextResponse.redirect(
        new URL(
          "/sign-in?error=email_exists&message=An+account+with+this+email+already+exists.+Please+sign+in+with+password.",
          baseUrl
        )
      );
    }
  } else {
    const passwordHash = await hashPassword(OAUTH_PLACEHOLDER_PASSWORD);
    const [newUser] = await db
      .insert(users)
      .values({
        email,
        name,
        passwordHash,
        role: "member",
      })
      .returning();

    if (!newUser) {
      return NextResponse.redirect(
        new URL("/sign-in?error=create_failed", baseUrl)
      );
    }

    const [newTeam] = await db
      .insert(teams)
      .values({ name: `${name}'s Team` })
      .returning();

    if (newTeam) {
      await db.insert(teamMembers).values({
        userId: newUser.id,
        teamId: newTeam.id,
        role: "owner",
      });
      await logActivity(newTeam.id, newUser.id, ActivityType.SIGN_IN);
      userTeam = newTeam;
    }

    userToSession = newUser;
  }

  await setSession(userToSession);

  if (state.redirect === "checkout" && state.priceId && userTeam) {
    return createCheckoutSession({
      team: userTeam,
      priceId: state.priceId,
    });
  }

  return NextResponse.redirect(new URL("/dashboard", baseUrl));
}
