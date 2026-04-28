import {
  desc,
  and,
  eq,
  isNull,
  max,
  asc,
  lte,
  lt,
  or,
  gt,
  sql,
  count,
  inArray,
} from "drizzle-orm";
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
  chatTurnRuns,
  chatTurnRunLiveState,
  chatStreamCursors,
  chatStreamEvents,
  siteAssets,
  publishedSites,
  inspirations,
  accounts,
  subscriptions,
  plans,
} from "./schema";
import type {
  ChatTurnRunLivePreviewState,
  ChatTurnRunLiveState as ChatTurnRunLiveStateRow,
} from "./schema";
import { nanoid } from "nanoid";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/auth/session";
import { generateText } from "ai";
import { getAIModel } from "@/lib/ai/get-ai-model";
import { buildChatNamePrompt } from "@/prompts/chat-name-prompt";
import { localeLanguageLabel } from "@/lib/i18n/detect-language";
import type { AppLocale } from "@/i18n/routing";
import {
  MAX_PUBLISH_PUBLIC_ID_LENGTH,
  slugifyChatTitleForPublish,
} from "@/lib/publish/publish-slug";

function buildFallbackChatName(userQuery: string): string {
  const cleaned = userQuery
    .replace(/\s+/g, " ")
    .replace(/^["'\s]+|["'\s]+$/g, "")
    .trim();

  if (!cleaned) {
    return "New Project";
  }

  return cleaned.slice(0, 60);
}

export async function generateChatName(
  userQuery: string,
  context?: {
    userId?: number;
    chatId?: string;
    responseLanguage?: string;
  },
): Promise<string> {
  try {
    const model = await getAIModel(true);
    const { text } = await generateText({
      model,
      prompt: buildChatNamePrompt(userQuery, context?.responseLanguage),
      experimental_telemetry: {
        isEnabled: true,
        functionId: "generate-chat-name",
        metadata: context
          ? {
              ...(context.userId != null && { userId: context.userId }),
              ...(context.chatId != null && { chatId: context.chatId }),
            }
          : undefined,
      },
    });
    let cleaned = text.trim();
    if (
      (cleaned.startsWith('"') && cleaned.endsWith('"')) ||
      (cleaned.startsWith("'") && cleaned.endsWith("'"))
    ) {
      cleaned = cleaned.slice(1, -1).trim();
    }
    return cleaned.slice(0, 60) || buildFallbackChatName(userQuery);
  } catch (error) {
    console.warn("Chat title generation failed, using fallback title:", {
      userId: context?.userId ?? null,
      chatId: context?.chatId ?? null,
      error: error instanceof Error ? error.message : String(error),
    });
    return buildFallbackChatName(userQuery);
  }
}

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

export async function getUserById(userId: number) {
  const user = await db
    .select()
    .from(users)
    .where(and(eq(users.id, userId), isNull(users.deletedAt)))
    .limit(1);

  return user[0] ?? null;
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
  },
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

const MAX_REVISION_RETRIES = 5;

export async function createLandingSiteRevision(data: {
  chatId: string;
  userId: number;
}) {
  for (let attempt = 0; attempt < MAX_REVISION_RETRIES; attempt++) {
    const revisionNumber = await getNextLandingSiteRevisionNumber(data.chatId);
    try {
      const result = await db
        .insert(landingSiteRevisions)
        .values({
          chatId: data.chatId,
          userId: data.userId,
          revisionNumber,
        })
        .returning();

      return result[0];
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      if (code === "23505" && attempt < MAX_REVISION_RETRIES - 1) {
        continue;
      }
      throw err;
    }
  }
  throw new Error("Failed to create revision after retries");
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
    .where(
      and(eq(landingSiteFiles.chatId, chatId), eq(landingSiteFiles.path, path)),
    )
    .limit(1);

  return result.length > 0 ? result[0] : null;
}

export async function getLatestLandingSiteFileContent(
  chatId: string,
  path: string,
) {
  const result = await db
    .select({
      content: landingSiteFileVersions.content,
      revisionNumber: landingSiteRevisions.revisionNumber,
      revisionId: landingSiteRevisions.id,
      fileId: landingSiteFiles.id,
    })
    .from(landingSiteFiles)
    .innerJoin(
      landingSiteFileVersions,
      eq(landingSiteFileVersions.fileId, landingSiteFiles.id),
    )
    .innerJoin(
      landingSiteRevisions,
      eq(landingSiteRevisions.id, landingSiteFileVersions.revisionId),
    )
    .where(
      and(eq(landingSiteFiles.chatId, chatId), eq(landingSiteFiles.path, path)),
    )
    .orderBy(desc(landingSiteRevisions.revisionNumber))
    .limit(1);

  return result.length > 0 ? result[0] : null;
}

export async function getExistingLandingSiteFilesContent(
  chatId: string,
  excludePath?: string,
): Promise<Array<{ path: string; content: string }>> {
  const rows = await db
    .select({
      path: landingSiteFiles.path,
      content: landingSiteFileVersions.content,
      revisionNumber: landingSiteRevisions.revisionNumber,
    })
    .from(landingSiteFiles)
    .innerJoin(
      landingSiteFileVersions,
      eq(landingSiteFileVersions.fileId, landingSiteFiles.id),
    )
    .innerJoin(
      landingSiteRevisions,
      eq(landingSiteRevisions.id, landingSiteFileVersions.revisionId),
    )
    .where(eq(landingSiteFiles.chatId, chatId));

  const latestByPath = new Map<
    string,
    { content: string; revisionNumber: number }
  >();
  for (const row of rows) {
    const existing = latestByPath.get(row.path);
    if (!existing || (row.revisionNumber ?? 0) > existing.revisionNumber) {
      latestByPath.set(row.path, {
        content: row.content,
        revisionNumber: row.revisionNumber ?? 0,
      });
    }
  }

  if (excludePath) {
    latestByPath.delete(excludePath);
  }

  return Array.from(latestByPath.entries()).map(([path, { content }]) => ({
    path,
    content,
  }));
}

function isLandingSectionTsxPath(path: string): boolean {
  const n = path.replace(/\\/g, "/").toLowerCase();
  return n.startsWith("landing/sections/") && n.endsWith(".tsx");
}

/**
 * For codegen consistency context: the one other section file that was saved
 * most recently (by latest revision number), excluding the file being generated.
 * Only considers landing/sections/*.tsx — not index, pages, or runtime.
 */
export async function getPreviousLandingSectionContentForCodegen(
  chatId: string,
  excludePath: string,
): Promise<{ path: string; content: string } | null> {
  const normalizedExclude = excludePath.replace(/\\/g, "/");
  const excludeLower = normalizedExclude.toLowerCase();
  const rows = await db
    .select({
      path: landingSiteFiles.path,
      content: landingSiteFileVersions.content,
      revisionNumber: landingSiteRevisions.revisionNumber,
    })
    .from(landingSiteFiles)
    .innerJoin(
      landingSiteFileVersions,
      eq(landingSiteFileVersions.fileId, landingSiteFiles.id),
    )
    .innerJoin(
      landingSiteRevisions,
      eq(landingSiteRevisions.id, landingSiteFileVersions.revisionId),
    )
    .where(eq(landingSiteFiles.chatId, chatId));

  const latestByPath = new Map<
    string,
    { content: string; revisionNumber: number }
  >();
  for (const row of rows) {
    if (!isLandingSectionTsxPath(row.path)) continue;
    const existing = latestByPath.get(row.path);
    if (!existing || (row.revisionNumber ?? 0) > existing.revisionNumber) {
      latestByPath.set(row.path, {
        content: row.content,
        revisionNumber: row.revisionNumber ?? 0,
      });
    }
  }

  type Candidate = { path: string; content: string; revisionNumber: number };
  const candidates: Candidate[] = [];
  for (const [path, { content, revisionNumber }] of latestByPath.entries()) {
    if (path.replace(/\\/g, "/").toLowerCase() === excludeLower) continue;
    candidates.push({ path, content, revisionNumber });
  }
  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    if (b.revisionNumber !== a.revisionNumber) {
      return b.revisionNumber - a.revisionNumber;
    }
    return a.path.localeCompare(b.path);
  });

  const pick = candidates[0]!;
  return { path: pick.path, content: pick.content };
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
    .innerJoin(
      landingSiteFileVersions,
      eq(landingSiteFileVersions.fileId, landingSiteFiles.id),
    )
    .innerJoin(
      landingSiteRevisions,
      eq(landingSiteRevisions.id, landingSiteFileVersions.revisionId),
    )
    .where(
      and(
        eq(landingSiteFiles.chatId, data.chatId),
        eq(landingSiteFiles.path, data.path),
        lte(landingSiteRevisions.revisionNumber, data.revisionNumber),
      ),
    )
    .orderBy(desc(landingSiteRevisions.revisionNumber))
    .limit(1);

  return result.length > 0 ? result[0] : null;
}

export async function getAllLandingSiteFilesAtOrBeforeRevision(params: {
  chatId: string;
  revisionNumber: number;
}): Promise<Array<{ path: string; content: string }>> {
  const rows = await db
    .select({
      path: landingSiteFiles.path,
      content: landingSiteFileVersions.content,
      revisionNumber: landingSiteRevisions.revisionNumber,
    })
    .from(landingSiteFiles)
    .innerJoin(
      landingSiteFileVersions,
      eq(landingSiteFileVersions.fileId, landingSiteFiles.id),
    )
    .innerJoin(
      landingSiteRevisions,
      eq(landingSiteRevisions.id, landingSiteFileVersions.revisionId),
    )
    .where(
      and(
        eq(landingSiteFiles.chatId, params.chatId),
        lte(landingSiteRevisions.revisionNumber, params.revisionNumber),
      ),
    )
    .orderBy(
      asc(landingSiteFiles.path),
      desc(landingSiteRevisions.revisionNumber),
    );

  const byPath = new Map<string, string>();
  for (const row of rows) {
    if (!byPath.has(row.path)) {
      byPath.set(row.path, row.content);
    }
  }
  return Array.from(byPath.entries()).map(([path, content]) => ({
    path,
    content,
  }));
}

export async function createChat(data: {
  userId: number;
  title?: string;
  userQuery?: string;
  responseLanguage?: string | null;
}) {
  const publicId = nanoid();
  let title = data.title;

  if (!title && data.userQuery) {
    const language = data.responseLanguage
      ? localeLanguageLabel(data.responseLanguage as AppLocale)
      : undefined;
    title = await generateChatName(data.userQuery, {
      userId: data.userId,
      responseLanguage: language,
    });
  }

  const result = await db
    .insert(chats)
    .values({
      publicId,
      userId: data.userId,
      title: title || null,
      responseLanguage: data.responseLanguage ?? null,
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

export async function createSiteAsset(data: {
  chatId: string;
  userId: number;
  alias: string;
  blobUrl: string;
  sourceType?: string;
  provider?: string | null;
  providerAssetId?: string | null;
  providerPageUrl?: string | null;
  searchQuery?: string | null;
  slotKey?: string | null;
  attributionText?: string | null;
  attributionUrl?: string | null;
  tags?: string[] | null;
  intent: string;
  status: string;
  mimeType: string;
  sizeBytes: number;
  width?: number | null;
  height?: number | null;
  originalFilename?: string | null;
  altHint?: string | null;
  label?: string | null;
}) {
  const result = await db
    .insert(siteAssets)
    .values({
      chatId: data.chatId,
      userId: data.userId,
      alias: data.alias,
      blobUrl: data.blobUrl,
      sourceType: data.sourceType ?? "upload",
      provider: data.provider ?? null,
      providerAssetId: data.providerAssetId ?? null,
      providerPageUrl: data.providerPageUrl ?? null,
      searchQuery: data.searchQuery ?? null,
      slotKey: data.slotKey ?? null,
      attributionText: data.attributionText ?? null,
      attributionUrl: data.attributionUrl ?? null,
      tags: data.tags ?? null,
      intent: data.intent,
      status: data.status,
      mimeType: data.mimeType,
      sizeBytes: data.sizeBytes,
      width: data.width ?? null,
      height: data.height ?? null,
      originalFilename: data.originalFilename ?? null,
      altHint: data.altHint ?? null,
      label: data.label ?? null,
      updatedAt: new Date(),
    })
    .returning();

  await db
    .update(chats)
    .set({ updatedAt: new Date() })
    .where(eq(chats.publicId, data.chatId));

  return result[0];
}

export async function getSiteAssetsByChatId(chatId: string, userId: number) {
  return await db
    .select()
    .from(siteAssets)
    .where(and(eq(siteAssets.chatId, chatId), eq(siteAssets.userId, userId)))
    .orderBy(asc(siteAssets.createdAt), asc(siteAssets.id));
}

export async function getReadySiteAssetsByChatId(chatId: string) {
  return await db
    .select()
    .from(siteAssets)
    .where(and(eq(siteAssets.chatId, chatId), eq(siteAssets.status, "ready")))
    .orderBy(asc(siteAssets.createdAt), asc(siteAssets.id));
}

export async function getSiteAssetAliasesByChatId(
  chatId: string,
  userId: number,
) {
  const rows = await db
    .select({ alias: siteAssets.alias })
    .from(siteAssets)
    .where(and(eq(siteAssets.chatId, chatId), eq(siteAssets.userId, userId)));

  return rows.map((row) => row.alias);
}

export async function updateSiteAsset(data: {
  id: number;
  chatId: string;
  userId: number;
  intent?: string;
  altHint?: string | null;
  label?: string | null;
}) {
  const update: Record<string, unknown> = {
    updatedAt: new Date(),
  };

  if (typeof data.intent === "string") {
    update.intent = data.intent;
  }
  if (data.altHint !== undefined) {
    update.altHint = data.altHint;
  }
  if (data.label !== undefined) {
    update.label = data.label;
  }

  const result = await db
    .update(siteAssets)
    .set(update)
    .where(
      and(
        eq(siteAssets.id, data.id),
        eq(siteAssets.chatId, data.chatId),
        eq(siteAssets.userId, data.userId),
      ),
    )
    .returning();

  if (result[0]) {
    await db
      .update(chats)
      .set({ updatedAt: new Date() })
      .where(eq(chats.publicId, data.chatId));
  }

  return result[0] ?? null;
}

export async function getChatsByUser(userId: number) {
  return await db
    .select()
    .from(chats)
    .where(eq(chats.userId, userId))
    .orderBy(desc(chats.updatedAt));
}

const CHATS_PAGE_SIZE = 12;

/** Cursor format: "updatedAt_id" (ISO date_id) for stable pagination */
export async function getChatsByUserPaginated(
  userId: number,
  opts: { cursor?: string; limit?: number } = {},
) {
  const limit = Math.min(opts.limit ?? CHATS_PAGE_SIZE, 50);
  const conditions = [eq(chats.userId, userId)];

  if (opts.cursor) {
    const [cursorUpdatedAt, cursorIdStr] = opts.cursor.split("_");
    const cursorId = parseInt(cursorIdStr, 10);
    if (!Number.isNaN(cursorId) && cursorUpdatedAt) {
      const cursorDate = new Date(cursorUpdatedAt);
      conditions.push(
        or(
          lt(chats.updatedAt, cursorDate),
          and(eq(chats.updatedAt, cursorDate), lt(chats.id, cursorId)),
        )!,
      );
    }
  }

  const rows = await db
    .select()
    .from(chats)
    .where(and(...conditions))
    .orderBy(desc(chats.updatedAt), desc(chats.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const chatsPage = hasMore ? rows.slice(0, limit) : rows;
  const last = chatsPage[chatsPage.length - 1];
  const nextCursor =
    hasMore && last ? `${last.updatedAt.toISOString()}_${last.id}` : undefined;

  return { chats: chatsPage, nextCursor };
}

export async function updateChatByPublicId(
  chatPublicId: string,
  userId: number,
  data: {
    title?: string;
    screenshotUrl?: string | null;
    responseLanguage?: string | null;
  },
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

export async function updateChatScreenshotUrl(
  chatPublicId: string,
  userId: number,
  screenshotUrl: string,
) {
  return updateChatByPublicId(chatPublicId, userId, { screenshotUrl });
}

export async function createChatMessage(data: {
  chatId: number;
  role: "user" | "assistant";
  content: string;
  parts?: unknown[] | null;
}) {
  const result = await db
    .insert(chatMessages)
    .values({
      chatId: data.chatId,
      role: data.role,
      content: data.content,
      parts: data.parts ?? null,
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
  userId: number,
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

  await db
    .update(chats)
    .set({ updatedAt: new Date() })
    .where(eq(chats.id, data.chatId));

  return result[0];
}

export async function getRunningChatTurnRun(chatId: number) {
  const rows = await db
    .select()
    .from(chatTurnRuns)
    .where(
      and(eq(chatTurnRuns.chatId, chatId), eq(chatTurnRuns.status, "running")),
    )
    .limit(1);

  return rows[0] ?? null;
}

export async function countActiveChatTurnRunsByUser(userId: number) {
  const rows = await db
    .select({
      count: sql<number>`count(*)::int`,
    })
    .from(chatTurnRuns)
    .where(
      and(
        eq(chatTurnRuns.userId, userId),
        or(
          eq(chatTurnRuns.status, "pending"),
          eq(chatTurnRuns.status, "running"),
        ),
      ),
    );

  return Number(rows[0]?.count ?? 0);
}

export async function getChatTurnRunByIdempotencyKey(idempotencyKey: string) {
  const rows = await db
    .select()
    .from(chatTurnRuns)
    .where(eq(chatTurnRuns.idempotencyKey, idempotencyKey))
    .limit(1);

  return rows[0] ?? null;
}

export async function getChatTurnRunById(runId: string) {
  const rows = await db
    .select()
    .from(chatTurnRuns)
    .where(eq(chatTurnRuns.id, runId))
    .limit(1);

  return rows[0] ?? null;
}

export async function markChatTurnRunRunning(runId: string) {
  const [row] = await db
    .update(chatTurnRuns)
    .set({
      status: "running",
      startedAt: new Date(),
    })
    .where(and(eq(chatTurnRuns.id, runId), eq(chatTurnRuns.status, "pending")))
    .returning();

  return row ?? null;
}

export async function enqueueChatTurnRun(data: {
  chatId: number;
  userId: number;
  idempotencyKey: string;
  payload: Record<string, unknown>;
}) {
  const [{ nextSequence }] = await db
    .select({
      nextSequence: sql<number>`coalesce(max(${chatTurnRuns.sequence}), 0) + 1`,
    })
    .from(chatTurnRuns)
    .where(eq(chatTurnRuns.chatId, data.chatId));

  const [row] = await db
    .insert(chatTurnRuns)
    .values({
      chatId: data.chatId,
      userId: data.userId,
      status: "pending",
      sequence: nextSequence ?? 1,
      idempotencyKey: data.idempotencyKey,
      payload: data.payload,
    })
    .returning();

  return row;
}

export async function claimNextPendingChatTurnRun(chatId: number) {
  const nextPending = await db
    .select()
    .from(chatTurnRuns)
    .where(
      and(eq(chatTurnRuns.chatId, chatId), eq(chatTurnRuns.status, "pending")),
    )
    .orderBy(asc(chatTurnRuns.sequence))
    .limit(1);

  const candidate = nextPending[0];
  if (!candidate) return null;

  const [claimed] = await db
    .update(chatTurnRuns)
    .set({
      status: "running",
      startedAt: new Date(),
    })
    .where(
      and(
        eq(chatTurnRuns.id, candidate.id),
        eq(chatTurnRuns.status, "pending"),
      ),
    )
    .returning();

  return claimed ?? null;
}

export async function attachTriggerRunIdToChatTurnRun(params: {
  runId: string;
  triggerRunId: string;
}) {
  const [row] = await db
    .update(chatTurnRuns)
    .set({
      triggerRunId: params.triggerRunId,
    })
    .where(eq(chatTurnRuns.id, params.runId))
    .returning();

  return row ?? null;
}

export async function markChatTurnRunSucceeded(runId: string) {
  const [row] = await db
    .update(chatTurnRuns)
    .set({
      status: "succeeded",
      completedAt: new Date(),
    })
    .where(eq(chatTurnRuns.id, runId))
    .returning();

  return row ?? null;
}

export async function markChatTurnRunFailed(params: {
  runId: string;
  errorMessage: string;
}) {
  const [row] = await db
    .update(chatTurnRuns)
    .set({
      status: "failed",
      errorMessage: params.errorMessage.slice(0, 2000),
      completedAt: new Date(),
    })
    .where(eq(chatTurnRuns.id, params.runId))
    .returning();

  return row ?? null;
}

export async function getChatTurnRunLiveStateByRunId(runId: string) {
  const rows = await db
    .select()
    .from(chatTurnRunLiveState)
    .where(eq(chatTurnRunLiveState.runId, runId))
    .limit(1);

  return rows[0] ?? null;
}

export async function upsertChatTurnRunLiveState(data: {
  runId: string;
  chatId: number;
  userId: number;
  status: string;
  assistantParts: ChatTurnRunLiveStateRow["assistantParts"];
  previewState?: ChatTurnRunLivePreviewState;
  lastLogicalEventId: number;
  lastEventCreatedAt?: Date | string | null;
  completedAt?: Date | null;
}) {
  const values = {
    runId: data.runId,
    chatId: data.chatId,
    userId: data.userId,
    status: data.status,
    assistantParts: data.assistantParts,
    previewState: data.previewState ?? null,
    lastLogicalEventId: data.lastLogicalEventId,
    lastEventCreatedAt: data.lastEventCreatedAt
      ? new Date(data.lastEventCreatedAt)
      : null,
    updatedAt: new Date(),
    completedAt: data.completedAt ?? null,
  };

  const [row] = await db
    .insert(chatTurnRunLiveState)
    .values({
      ...values,
      startedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: chatTurnRunLiveState.runId,
      set: values,
    })
    .returning();

  return row ?? null;
}

export async function getRunningChatTurnRunLiveState(chatId: number, userId: number) {
  const rows = await db
    .select()
    .from(chatTurnRunLiveState)
    .where(
      and(
        eq(chatTurnRunLiveState.chatId, chatId),
        eq(chatTurnRunLiveState.userId, userId),
        eq(chatTurnRunLiveState.status, "running")
      )
    )
    .orderBy(desc(chatTurnRunLiveState.updatedAt))
    .limit(1);

  return rows[0] ?? null;
}

/** Cancels a single turn run if it is still pending or running (e.g. user stop). */
export async function cancelChatTurnRunIfActive(
  runId: string,
  scope: { chatId: number; userId: number },
) {
  const [row] = await db
    .update(chatTurnRuns)
    .set({
      status: "canceled",
      errorMessage: "Canceled by user",
      completedAt: new Date(),
    })
    .where(
      and(
        eq(chatTurnRuns.id, runId),
        eq(chatTurnRuns.chatId, scope.chatId),
        eq(chatTurnRuns.userId, scope.userId),
        or(
          eq(chatTurnRuns.status, "pending"),
          eq(chatTurnRuns.status, "running"),
        ),
      ),
    )
    .returning();

  return row ?? null;
}

/** Cancels all pending/running turn runs for a chat (covers race before run id is known). */
export async function cancelAllActiveChatTurnRunsForChat(
  chatId: number,
  userId: number,
) {
  return db
    .update(chatTurnRuns)
    .set({
      status: "canceled",
      errorMessage: "Canceled by user",
      completedAt: new Date(),
    })
    .where(
      and(
        eq(chatTurnRuns.chatId, chatId),
        eq(chatTurnRuns.userId, userId),
        or(
          eq(chatTurnRuns.status, "pending"),
          eq(chatTurnRuns.status, "running"),
        ),
      ),
    )
    .returning({ id: chatTurnRuns.id });
}

export async function appendChatStreamEvent(data: {
  chatId: number;
  runId: string;
  eventType: string;
  payload: Record<string, unknown>;
}) {
  const rows = await appendChatStreamEvents({
    chatId: data.chatId,
    runId: data.runId,
    events: [{ eventType: data.eventType, payload: data.payload }],
  });

  return rows[0] ?? null;
}

export async function appendChatStreamEvents(data: {
  chatId: number;
  runId: string;
  events: Array<{
    eventType: string;
    payload: Record<string, unknown>;
  }>;
}) {
  if (!Array.isArray(data.events) || data.events.length === 0) {
    return [];
  }

  return db.transaction(async (tx) => {
    await tx
      .insert(chatStreamCursors)
      .values({
        chatId: data.chatId,
        lastLogicalEventId: 0,
        updatedAt: new Date(),
      })
      .onConflictDoNothing({ target: chatStreamCursors.chatId });

    const [cursor] = await tx
      .select()
      .from(chatStreamCursors)
      .where(eq(chatStreamCursors.chatId, data.chatId))
      .for("update")
      .limit(1);

    if (!cursor) {
      throw new Error(`Chat stream cursor not found for chat ${data.chatId}`);
    }

    const nextLogicalEventId = Number(cursor.lastLogicalEventId) + 1;
    const finalLogicalEventId = nextLogicalEventId + data.events.length - 1;

    await tx
      .update(chatStreamCursors)
      .set({
        lastLogicalEventId: finalLogicalEventId,
        updatedAt: new Date(),
      })
      .where(eq(chatStreamCursors.chatId, data.chatId));

    const rows = await tx
      .insert(chatStreamEvents)
      .values(
        data.events.map((event, index) => ({
          chatId: data.chatId,
          runId: data.runId,
          logicalEventId: nextLogicalEventId + index,
          eventType: event.eventType,
          payload: event.payload,
        })),
      )
      .returning();

    return rows.sort((a, b) => a.logicalEventId - b.logicalEventId);
  });
}

export async function getChatStreamEventsAfter(data: {
  chatId: number;
  afterEventId?: number;
  limit?: number;
}) {
  const limit = Math.min(data.limit ?? 100, 500);
  const conditions = [eq(chatStreamEvents.chatId, data.chatId)];
  if (
    typeof data.afterEventId === "number" &&
    Number.isFinite(data.afterEventId)
  ) {
    conditions.push(gt(chatStreamEvents.logicalEventId, data.afterEventId));
  }

  return db
    .select()
    .from(chatStreamEvents)
    .where(and(...conditions))
    .orderBy(asc(chatStreamEvents.logicalEventId))
    .limit(limit);
}

export async function getLatestChatStreamEvent(chatId: number) {
  const rows = await db
    .select()
    .from(chatStreamEvents)
    .where(eq(chatStreamEvents.chatId, chatId))
    .orderBy(desc(chatStreamEvents.logicalEventId))
    .limit(1);

  return rows[0] ?? null;
}

export async function getChatTurnRunQueueSummary(chatId: number) {
  const rows = await db
    .select({
      status: chatTurnRuns.status,
      count: sql<number>`count(*)::int`,
    })
    .from(chatTurnRuns)
    .where(
      and(
        eq(chatTurnRuns.chatId, chatId),
        or(
          eq(chatTurnRuns.status, "pending"),
          eq(chatTurnRuns.status, "running"),
        ),
      ),
    )
    .groupBy(chatTurnRuns.status);

  let pendingCount = 0;
  let runningCount = 0;
  for (const row of rows) {
    if (row.status === "pending") pendingCount = Number(row.count ?? 0);
    if (row.status === "running") runningCount = Number(row.count ?? 0);
  }

  return {
    pendingCount,
    runningCount,
    hasActiveRuns: pendingCount > 0 || runningCount > 0,
  };
}

export async function getPublishedSiteByPublicId(publicId: string) {
  const result = await db
    .select()
    .from(publishedSites)
    .where(eq(publishedSites.publicId, publicId))
    .limit(1);

  return result.length > 0 ? result[0] : null;
}

/**
 * Picks a globally unique `public_id` (subdomain label) for a new published site.
 */
export async function allocateUniquePublishPublicId(
  title: string | null | undefined,
): Promise<string> {
  const base = slugifyChatTitleForPublish(title);
  for (let n = 0; n < 30; n++) {
    const suffix = n === 0 ? "" : `-${n}`;
    const maxBase = MAX_PUBLISH_PUBLIC_ID_LENGTH - suffix.length;
    const trimmed = base.slice(0, Math.max(1, maxBase));
    const candidate = `${trimmed}${suffix}`.slice(0, MAX_PUBLISH_PUBLIC_ID_LENGTH);
    const taken = await getPublishedSiteByPublicId(candidate);
    if (!taken) return candidate;
  }
  for (let k = 0; k < 5; k++) {
    const candidate = `${base.slice(0, 40)}-${nanoid(8)}`.slice(
      0,
      MAX_PUBLISH_PUBLIC_ID_LENGTH,
    );
    const taken = await getPublishedSiteByPublicId(candidate);
    if (!taken) return candidate;
  }
  return nanoid(12).slice(0, MAX_PUBLISH_PUBLIC_ID_LENGTH);
}

export async function createPublishedSite(data: {
  publicId: string;
  chatId: string;
  userId: number;
  revisionNumber: number;
}) {
  const result = await db
    .insert(publishedSites)
    .values({
      publicId: data.publicId,
      chatId: data.chatId,
      userId: data.userId,
      revisionNumber: data.revisionNumber,
    })
    .returning();

  return result[0];
}

export async function getPublishedSiteByChatId(chatId: string, userId: number) {
  const result = await db
    .select()
    .from(publishedSites)
    .where(
      and(eq(publishedSites.chatId, chatId), eq(publishedSites.userId, userId)),
    )
    .orderBy(desc(publishedSites.createdAt))
    .limit(1);

  return result.length > 0 ? result[0] : null;
}

export async function updatePublishedSite(
  publicId: string,
  userId: number,
  data: { revisionNumber: number },
) {
  const result = await db
    .update(publishedSites)
    .set({
      ...data,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(publishedSites.publicId, publicId),
        eq(publishedSites.userId, userId),
      ),
    )
    .returning();

  return result.length > 0 ? result[0] : null;
}

export async function createInspiration(data: {
  description: string;
  section: string;
  tags: string[];
  embedding: number[];
  createdByUserId: number;
}) {
  const result = await db
    .insert(inspirations)
    .values({
      description: data.description.trim(),
      section: data.section,
      tags: data.tags,
      embedding: data.embedding,
      createdByUserId: data.createdByUserId,
      updatedAt: new Date(),
    })
    .returning();

  return result[0] ?? null;
}

export async function listInspirations(limit = 100) {
  return db
    .select()
    .from(inspirations)
    .orderBy(desc(inspirations.createdAt))
    .limit(Math.min(Math.max(limit, 1), 500));
}

export async function deleteInspirationById(id: number) {
  const result = await db
    .delete(inspirations)
    .where(eq(inspirations.id, id))
    .returning();

  return result[0] ?? null;
}

export async function updateInspirationEmbedding(
  id: number,
  embedding: number[],
) {
  const result = await db
    .update(inspirations)
    .set({
      embedding,
      updatedAt: new Date(),
    })
    .where(eq(inspirations.id, id))
    .returning();

  return result[0] ?? null;
}

export async function searchInspirationsByEmbedding(params: {
  embedding: number[];
  limit?: number;
}) {
  const limit = Math.min(Math.max(params.limit ?? 8, 1), 50);
  if (!Array.isArray(params.embedding) || params.embedding.length === 0) {
    throw new Error("Embedding vector cannot be empty");
  }

  return db
    .select({
      id: inspirations.id,
      description: inspirations.description,
      section: inspirations.section,
      tags: inspirations.tags,
      createdByUserId: inspirations.createdByUserId,
      createdAt: inspirations.createdAt,
      updatedAt: inspirations.updatedAt,
      similarity: sql<number>`0`,
    })
    .from(inspirations)
    .orderBy(desc(inspirations.createdAt))
    .limit(limit);
}

export type AdminUserRow = {
  id: number;
  email: string;
  name: string | null;
  role: string;
  createdAt: Date;
  lastMessageAt: Date | null;
  planName: string | null;
  chatCount: number;
  messageCount: number;
};

export async function listAdminUsers(limit = 500): Promise<AdminUserRow[]> {
  const safeLimit = Math.min(Math.max(limit, 1), 2000);

  const userRows = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(isNull(users.deletedAt))
    .orderBy(desc(users.createdAt))
    .limit(safeLimit);

  if (userRows.length === 0) {
    return [];
  }

  const userIds = userRows.map((u) => u.id);

  const [chatCountRows, messageStatsRows, subscriptionRows] = await Promise.all([
    db
      .select({
        userId: chats.userId,
        chatCount: count(chats.id),
      })
      .from(chats)
      .where(inArray(chats.userId, userIds))
      .groupBy(chats.userId),

    // One pass over user-authored chat messages gives us both the count and
    // the most recent message timestamp per user — a more reliable signal
    // for "last activity" than sign-in events.
    db
      .select({
        userId: chats.userId,
        messageCount: count(chatMessages.id),
        lastMessageAt: max(chatMessages.createdAt),
      })
      .from(chatMessages)
      .innerJoin(chats, eq(chatMessages.chatId, chats.id))
      .where(
        and(eq(chatMessages.role, "user"), inArray(chats.userId, userIds))
      )
      .groupBy(chats.userId),

    db
      .select({
        ownerUserId: accounts.ownerUserId,
        planName: plans.name,
        status: subscriptions.status,
        updatedAt: subscriptions.updatedAt,
      })
      .from(accounts)
      .leftJoin(subscriptions, eq(subscriptions.accountId, accounts.id))
      .leftJoin(plans, eq(plans.id, subscriptions.planId))
      .where(inArray(accounts.ownerUserId, userIds)),
  ]);

  const chatCountByUser = new Map<number, number>();
  for (const row of chatCountRows) {
    chatCountByUser.set(row.userId, Number(row.chatCount ?? 0));
  }

  const messageCountByUser = new Map<number, number>();
  const lastMessageByUser = new Map<number, Date>();
  for (const row of messageStatsRows) {
    messageCountByUser.set(row.userId, Number(row.messageCount ?? 0));
    if (row.lastMessageAt) {
      lastMessageByUser.set(row.userId, row.lastMessageAt);
    }
  }

  // Pick the most relevant subscription per user. Mirrors getSubscriptionByAccountId:
  // prefer active/trialing, then most recently updated row.
  const planByUser = new Map<number, string>();
  const subscriptionPriorityByUser = new Map<
    number,
    { rank: number; updatedAt: Date | null; planName: string | null }
  >();

  for (const row of subscriptionRows) {
    if (row.ownerUserId == null) continue;
    const rank =
      row.status === "active" || row.status === "trialing" ? 0 : 1;
    const current = subscriptionPriorityByUser.get(row.ownerUserId);
    const candidateUpdatedAt = row.updatedAt ?? null;

    if (!current) {
      subscriptionPriorityByUser.set(row.ownerUserId, {
        rank,
        updatedAt: candidateUpdatedAt,
        planName: row.planName,
      });
      continue;
    }

    const isBetter =
      rank < current.rank ||
      (rank === current.rank &&
        (candidateUpdatedAt?.getTime() ?? 0) >
          (current.updatedAt?.getTime() ?? 0));

    if (isBetter) {
      subscriptionPriorityByUser.set(row.ownerUserId, {
        rank,
        updatedAt: candidateUpdatedAt,
        planName: row.planName,
      });
    }
  }

  for (const [userId, value] of subscriptionPriorityByUser) {
    if (value.planName) {
      planByUser.set(userId, value.planName);
    }
  }

  return userRows.map((user) => ({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    createdAt: user.createdAt,
    lastMessageAt: lastMessageByUser.get(user.id) ?? null,
    planName: planByUser.get(user.id) ?? null,
    chatCount: chatCountByUser.get(user.id) ?? 0,
    messageCount: messageCountByUser.get(user.id) ?? 0,
  }));
}
