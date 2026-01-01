import {
  createLandingPageVersion,
  getNextVersionNumber,
} from "@/lib/db/queries";
import type { CodeGenerationResult } from "./types";

const pendingSaves = new Map<
  string,
  { code: string; userId: number; sessionId: string; versionNumber: number }
>();

export async function saveCodeToDatabase(data: {
  userId: number;
  sessionId: string;
  versionNumber: number;
  codeContent: string;
}): Promise<
  { success: true; versionId: number } | { success: false; error: string }
> {
  try {
    const version = await createLandingPageVersion({
      userId: data.userId,
      sessionId: data.sessionId,
      versionNumber: data.versionNumber,
      codeContent: data.codeContent,
    });

    return {
      success: true,
      versionId: version.id,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Database save failed";
    return {
      success: false,
      error: errorMessage,
    };
  }
}

export async function saveCodeWithRetry(data: {
  userId: number;
  sessionId: string;
  versionNumber: number;
  codeContent: string;
}): Promise<CodeGenerationResult> {
  const saveKey = `${data.userId}-${data.sessionId}-${data.versionNumber}`;

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
    sessionId: data.sessionId,
    versionNumber: data.versionNumber,
  });

  return {
    success: false,
    error: result.error,
  };
}

export function getPendingSave(
  userId: number,
  sessionId: string
): { code: string; versionNumber: number } | null {
  for (const [key, value] of pendingSaves.entries()) {
    if (value.userId === userId && value.sessionId === sessionId) {
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
  sessionId: string
): Promise<CodeGenerationResult> {
  const pending = getPendingSave(userId, sessionId);
  if (!pending) {
    return {
      success: false,
      error: "No pending save found",
    };
  }

  const versionNumber = await getNextVersionNumber(sessionId);
  return await saveCodeWithRetry({
    userId,
    sessionId,
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
