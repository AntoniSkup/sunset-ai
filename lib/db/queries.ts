import { desc, and, eq, isNull, max, asc, lte } from "drizzle-orm";
import { db } from "./drizzle";
import {
  activityLogs,
  teamMembers,
  teams,
  users,
  landingPageVersions,
  landingSiteFiles,
  landingSiteRevisions,
  landingSiteFileVersions,
  chats,
  chatMessages,
  chatToolCalls,
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

export async function getNextVersionNumber(chatId: string) {
  const result = await db
    .select({ max: max(landingPageVersions.versionNumber) })
    .from(landingPageVersions)
    .where(eq(landingPageVersions.chatId, chatId));

  return (result[0]?.max ?? 0) + 1;
}

export async function getLatestVersion(chatId: string) {
  const result = await db
    .select()
    .from(landingPageVersions)
    .where(eq(landingPageVersions.chatId, chatId))
    .orderBy(desc(landingPageVersions.versionNumber))
    .limit(1);

  return result.length > 0 ? result[0] : null;
}

export async function createLandingPageVersion(data: {
  userId: number;
  chatId: string;
  versionNumber: number;
  codeContent: string;
}) {
  const result = await db
    .insert(landingPageVersions)
    .values({
      userId: data.userId,
      chatId: data.chatId,
      versionNumber: data.versionNumber,
      codeContent: data.codeContent,
    })
    .returning();

  return result[0];
}

export async function getAllVersionsForChat(chatId: string) {
  return await db
    .select()
    .from(landingPageVersions)
    .where(eq(landingPageVersions.chatId, chatId))
    .orderBy(asc(landingPageVersions.versionNumber));
}

export async function getNextLandingSiteRevisionNumber(chatId: string) {
  const result = await db
    .select({ max: max(landingSiteRevisions.revisionNumber) })
    .from(landingSiteRevisions)
    .where(eq(landingSiteRevisions.chatId, chatId));

  return (result[0]?.max ?? 0) + 1;
}

export async function getLatestLandingSiteRevision(chatId: string) {
  const result = await db
    .select()
    .from(landingSiteRevisions)
    .where(eq(landingSiteRevisions.chatId, chatId))
    .orderBy(desc(landingSiteRevisions.revisionNumber))
    .limit(1);

  return result.length > 0 ? result[0] : null;
}

export async function upsertLandingSiteFile(data: {
  chatId: string;
  path: string;
  kind?: string;
}) {
  const kind = data.kind ?? "section";
  const result = await db
    .insert(landingSiteFiles)
    .values({
      chatId: data.chatId,
      path: data.path,
      kind,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [landingSiteFiles.chatId, landingSiteFiles.path],
      set: { kind, updatedAt: new Date() },
    })
    .returning();

  return result[0];
}

export async function createLandingSiteRevision(data: {
  chatId: string;
  userId: number;
}) {
  const revisionNumber = await getNextLandingSiteRevisionNumber(data.chatId);
  const result = await db
    .insert(landingSiteRevisions)
    .values({
      chatId: data.chatId,
      userId: data.userId,
      revisionNumber,
    })
    .returning();

  return result[0];
}

export async function createLandingSiteFileVersion(data: {
  fileId: number;
  revisionId: number;
  content: string;
}) {
  const result = await db
    .insert(landingSiteFileVersions)
    .values({
      fileId: data.fileId,
      revisionId: data.revisionId,
      content: data.content,
    })
    .returning();

  return result[0];
}

export async function getLandingSiteFileByPath(chatId: string, path: string) {
  const result = await db
    .select()
    .from(landingSiteFiles)
    .where(and(eq(landingSiteFiles.chatId, chatId), eq(landingSiteFiles.path, path)))
    .limit(1);

  return result.length > 0 ? result[0] : null;
}

export async function getLatestLandingSiteFileContent(chatId: string, path: string) {
  const result = await db
    .select({
      content: landingSiteFileVersions.content,
      revisionNumber: landingSiteRevisions.revisionNumber,
      revisionId: landingSiteRevisions.id,
      fileId: landingSiteFiles.id,
    })
    .from(landingSiteFiles)
    .innerJoin(landingSiteFileVersions, eq(landingSiteFileVersions.fileId, landingSiteFiles.id))
    .innerJoin(
      landingSiteRevisions,
      eq(landingSiteRevisions.id, landingSiteFileVersions.revisionId)
    )
    .where(and(eq(landingSiteFiles.chatId, chatId), eq(landingSiteFiles.path, path)))
    .orderBy(desc(landingSiteRevisions.revisionNumber))
    .limit(1);

  return result.length > 0 ? result[0] : null;
}

export async function getLandingSiteFileContentAtOrBeforeRevision(data: {
  chatId: string;
  path: string;
  revisionNumber: number;
}) {
  const result = await db
    .select({
      content: landingSiteFileVersions.content,
      revisionNumber: landingSiteRevisions.revisionNumber,
      revisionId: landingSiteRevisions.id,
      fileId: landingSiteFiles.id,
    })
    .from(landingSiteFiles)
    .innerJoin(landingSiteFileVersions, eq(landingSiteFileVersions.fileId, landingSiteFiles.id))
    .innerJoin(
      landingSiteRevisions,
      eq(landingSiteRevisions.id, landingSiteFileVersions.revisionId)
    )
    .where(
      and(
        eq(landingSiteFiles.chatId, data.chatId),
        eq(landingSiteFiles.path, data.path),
        lte(landingSiteRevisions.revisionNumber, data.revisionNumber)
      )
    )
    .orderBy(desc(landingSiteRevisions.revisionNumber))
    .limit(1);

  return result.length > 0 ? result[0] : null;
}

export async function createChat(data: {
  userId: number;
  title?: string;
}) {
  const publicId = nanoid();
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

export async function createChatMessage(data: {
  chatId: number;
  role: "user" | "assistant";
  content: string;
}) {
  const result = await db
    .insert(chatMessages)
    .values({
      chatId: data.chatId,
      role: data.role,
      content: data.content,
    })
    .returning();

  await db
    .update(chats)
    .set({ updatedAt: new Date() })
    .where(eq(chats.id, data.chatId));

  return result[0];
}

export async function getChatMessagesByPublicId(
  chatPublicId: string,
  userId: number
) {
  const chat = await getChatByPublicId(chatPublicId, userId);
  if (!chat) return null;

  const messages = await db
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.chatId, chat.id))
    .orderBy(asc(chatMessages.createdAt), asc(chatMessages.id));

  return { chat, messages };
}

export async function createChatToolCall(data: {
  chatId: number;
  stepNumber?: number | null;
  state: "call" | "result";
  toolName: string;
  toolCallId?: string | null;
  input?: unknown;
  output?: unknown;
}) {
  const result = await db
    .insert(chatToolCalls)
    .values({
      chatId: data.chatId,
      stepNumber: data.stepNumber ?? null,
      state: data.state,
      toolName: data.toolName,
      toolCallId: data.toolCallId ?? null,
      input: data.input ?? null,
      output: data.output ?? null,
    })
    .returning();

  await db.update(chats).set({ updatedAt: new Date() }).where(eq(chats.id, data.chatId));

  return result[0];
}
