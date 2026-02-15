import {
  createLandingPageVersion,
  getNextVersionNumber,
} from "@/lib/db/queries";
import type { CodeGenerationResult } from "./types";

const pendingSaves = new Map<
  string,
  { code: string; userId: number; chatId: string; versionNumber: number }
>();

export async function saveCodeToDatabase(data: {
  userId: number;
  chatId: string;
  versionNumber: number;
  codeContent: string;
}): Promise<
  { success: true; versionId: number } | { success: false; error: string }
> {
  try {
    const version = await createLandingPageVersion({
      userId: data.userId,
      chatId: data.chatId,
      versionNumber: data.versionNumber,
      codeContent: data.codeContent,
    });

    return {
      success: true,
      versionId: version.id,
    };
  } catch (error) {
    console.error("[Code Generation] Failed to save landing page version", {
      userId: data.userId,
      chatId: data.chatId,
      versionNumber: data.versionNumber,
      error,
    });

    const err = error as any;
    const baseMessage =
      error instanceof Error ? error.message : "Database save failed";
    const pgCode = typeof err?.code === "string" ? ` (pg:${err.code})` : "";
    const pgDetail = typeof err?.detail === "string" ? ` ${err.detail}` : "";

    let hint = "";
    if (/column\s+"chat_id"\s+does not exist/i.test(baseMessage)) {
      hint = " Hint: your database is likely missing the newer migration that adds landing_page_versions.chat_id. Run `pnpm db:migrate`.";
    } else if (/relation\s+"landing_page_versions"\s+does not exist/i.test(baseMessage)) {
      hint = " Hint: your database is missing the landing_page_versions table. Run `pnpm db:migrate`.";
    } else if (/violates foreign key constraint/i.test(baseMessage)) {
      hint =
        " Hint: the chat row may not exist (FK landing_page_versions.chat_id -> chats.public_id). Ensure the chat was created successfully before generating.";
    }

    const errorMessage = `${baseMessage}${pgCode}${pgDetail}${hint}`;
    return {
      success: false,
      error: errorMessage,
    };
  }
}

export async function saveCodeWithRetry(data: {
  userId: number;
  chatId: string;
  versionNumber: number;
  codeContent: string;
}): Promise<CodeGenerationResult> {
  const saveKey = `${data.userId}-${data.chatId}-${data.versionNumber}`;

  const result = await saveCodeToDatabase(data);

  if (result.success) {
    pendingSaves.delete(saveKey);

    return {
      success: true,
      versionId: result.versionId,
      versionNumber: data.versionNumber,
      codeContent: data.codeContent,
    };
  }

  pendingSaves.set(saveKey, {
    code: data.codeContent,
    userId: data.userId,
    chatId: data.chatId,
    versionNumber: data.versionNumber,
  });

  return {
    success: false,
    error: result.error,
  };
}

export function getPendingSave(
  userId: number,
  chatId: string
): { code: string; versionNumber: number } | null {
  for (const [key, value] of pendingSaves.entries()) {
    if (value.userId === userId && value.chatId === chatId) {
      return {
        code: value.code,
        versionNumber: value.versionNumber,
      };
    }
  }
  return null;
}

export async function retryPendingSave(
  userId: number,
  chatId: string
): Promise<CodeGenerationResult> {
  const pending = getPendingSave(userId, chatId);
  if (!pending) {
    return {
      success: false,
      error: "No pending save found",
    };
  }

  const versionNumber = await getNextVersionNumber(chatId);
  return await saveCodeWithRetry({
    userId,
    chatId,
    versionNumber,
    codeContent: pending.code,
  });
}

setInterval(
  () => {
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    for (const [key] of pendingSaves.entries()) {
      pendingSaves.delete(key);
    }
  },
  60 * 60 * 1000
);
