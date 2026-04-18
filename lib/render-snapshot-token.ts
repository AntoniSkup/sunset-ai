import "server-only";
import { SignJWT, jwtVerify } from "jose";

const PURPOSE = "landing-render-snapshot";

function getSigningKey(): Uint8Array | null {
  const raw =
    process.env.RENDER_SNAPSHOT_SECRET?.trim() ||
    process.env.AUTH_SECRET?.trim();
  if (!raw) return null;
  return new TextEncoder().encode(raw);
}

export async function createRenderSnapshotToken(params: {
  chatId: string;
  revisionNumber: number;
}): Promise<string | null> {
  const key = getSigningKey();
  if (!key) return null;

  return await new SignJWT({
    purpose: PURPOSE,
    chatId: params.chatId,
    revision: params.revisionNumber,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("12m")
    .sign(key);
}

export async function verifyRenderSnapshotToken(
  token: string | null | undefined
): Promise<{ chatId: string; revisionNumber: number } | null> {
  if (!token?.trim()) return null;
  const key = getSigningKey();
  if (!key) return null;

  try {
    const { payload } = await jwtVerify(token, key, {
      algorithms: ["HS256"],
    });
    if (payload.purpose !== PURPOSE) return null;
    const chatId = typeof payload.chatId === "string" ? payload.chatId : null;
    const revision =
      typeof payload.revision === "number" ? payload.revision : null;
    if (!chatId || revision == null || revision < 1) return null;
    return { chatId, revisionNumber: revision };
  } catch {
    return null;
  }
}
