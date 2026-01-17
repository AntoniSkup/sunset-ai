import { desc, and, eq, isNull, max, asc } from "drizzle-orm";
import { db } from "./drizzle";
import {
  activityLogs,
  teamMembers,
  teams,
  users,
  landingPageVersions,
  chats,
} from "./schema";
import { nanoid } from "nanoid";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/auth/session";

export async function getUser() {
  const sessionCookie = (await cookies()).get("session");
  if (!sessionCookie || !sessionCookie.value) {
    return null;
  }

  const sessionData = await verifyToken(sessionCookie.value);
  if (
    !sessionData ||
    !sessionData.user ||
    typeof sessionData.user.id !== "number"
  ) {
    return null;
  }

  if (new Date(sessionData.expires) < new Date()) {
    return null;
  }

  const user = await db
    .select()
    .from(users)
    .where(and(eq(users.id, sessionData.user.id), isNull(users.deletedAt)))
    .limit(1);

  if (user.length === 0) {
    return null;
  }

  return user[0];
}

export async function getTeamByStripeCustomerId(customerId: string) {
  const result = await db
    .select()
    .from(teams)
    .where(eq(teams.stripeCustomerId, customerId))
    .limit(1);

  return result.length > 0 ? result[0] : null;
}

export async function updateTeamSubscription(
  teamId: number,
  subscriptionData: {
    stripeSubscriptionId: string | null;
    stripeProductId: string | null;
    planName: string | null;
    subscriptionStatus: string;
  }
) {
  await db
    .update(teams)
    .set({
      ...subscriptionData,
      updatedAt: new Date(),
    })
    .where(eq(teams.id, teamId));
}

export async function getUserWithTeam(userId: number) {
  const result = await db
    .select({
      user: users,
      teamId: teamMembers.teamId,
    })
    .from(users)
    .leftJoin(teamMembers, eq(users.id, teamMembers.userId))
    .where(eq(users.id, userId))
    .limit(1);

  return result[0];
}

export async function getActivityLogs() {
  const user = await getUser();
  if (!user) {
    throw new Error("User not authenticated");
  }

  return await db
    .select({
      id: activityLogs.id,
      action: activityLogs.action,
      timestamp: activityLogs.timestamp,
      ipAddress: activityLogs.ipAddress,
      userName: users.name,
    })
    .from(activityLogs)
    .leftJoin(users, eq(activityLogs.userId, users.id))
    .where(eq(activityLogs.userId, user.id))
    .orderBy(desc(activityLogs.timestamp))
    .limit(10);
}

export async function getTeamForUser() {
  const user = await getUser();
  if (!user) {
    return null;
  }

  const result = await db.query.teamMembers.findFirst({
    where: eq(teamMembers.userId, user.id),
    with: {
      team: {
        with: {
          teamMembers: {
            with: {
              user: {
                columns: {
                  id: true,
                  name: true,
                  email: true,
                },
              },
            },
          },
        },
      },
    },
  });

  return result?.team || null;
}

export async function getNextVersionNumber(sessionId: string) {
  const result = await db
    .select({ max: max(landingPageVersions.versionNumber) })
    .from(landingPageVersions)
    .where(eq(landingPageVersions.sessionId, sessionId));

  return (result[0]?.max ?? 0) + 1;
}

export async function getLatestVersion(sessionId: string) {
  const result = await db
    .select()
    .from(landingPageVersions)
    .where(eq(landingPageVersions.sessionId, sessionId))
    .orderBy(desc(landingPageVersions.versionNumber))
    .limit(1);

  return result.length > 0 ? result[0] : null;
}

export async function createLandingPageVersion(data: {
  userId: number;
  sessionId: string;
  versionNumber: number;
  codeContent: string;
}) {
  const result = await db
    .insert(landingPageVersions)
    .values({
      userId: data.userId,
      sessionId: data.sessionId,
      versionNumber: data.versionNumber,
      codeContent: data.codeContent,
    })
    .returning();

  return result[0];
}

export async function getAllVersionsForSession(sessionId: string) {
  return await db
    .select()
    .from(landingPageVersions)
    .where(eq(landingPageVersions.sessionId, sessionId))
    .orderBy(asc(landingPageVersions.versionNumber));
}

export async function createChat(data: {
  userId: number;
  title?: string;
}) {
  const publicId = `chat_${nanoid()}`;
  const result = await db
    .insert(chats)
    .values({
      publicId,
      userId: data.userId,
      title: data.title || null,
    })
    .returning();

  return result[0];
}

export async function getChatByPublicId(chatPublicId: string, userId: number) {
  const result = await db
    .select()
    .from(chats)
    .where(and(eq(chats.publicId, chatPublicId), eq(chats.userId, userId)))
    .limit(1);

  return result.length > 0 ? result[0] : null;
}

export async function getChatsByUser(userId: number) {
  return await db
    .select()
    .from(chats)
    .where(eq(chats.userId, userId))
    .orderBy(desc(chats.updatedAt));
}

export async function updateChatByPublicId(
  chatPublicId: string,
  userId: number,
  data: { title?: string }
) {
  const result = await db
    .update(chats)
    .set({
      ...data,
      updatedAt: new Date(),
    })
    .where(and(eq(chats.publicId, chatPublicId), eq(chats.userId, userId)))
    .returning();

  return result.length > 0 ? result[0] : null;
}
