import { put } from "@vercel/blob";
import { NextResponse } from "next/server";
import {
  createSiteAsset,
  getChatByPublicId,
  getSiteAssetAliasesByChatId,
  getSiteAssetsByChatId,
  getUser,
  updateSiteAsset,
} from "@/lib/db/queries";
import {
  SITE_ASSET_ALLOWED_IMAGE_TYPES,
  SITE_ASSET_MAX_FILE_SIZE_BYTES,
} from "@/lib/site-assets/conventions";
import { createUniqueSiteAssetAlias } from "@/lib/site-assets/alias";
import { SITE_ASSET_INTENTS } from "@/lib/site-assets/types";

const SITE_ASSET_ALLOWED_IMAGE_TYPE_SET = new Set<string>(
  SITE_ASSET_ALLOWED_IMAGE_TYPES
);
const SITE_ASSET_INTENT_SET = new Set<string>(SITE_ASSET_INTENTS);
const SITE_ASSET_ALIAS_RETRY_LIMIT = 5;

function getStringField(formData: FormData, key: string): string | null {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : null;
}

function getExtensionForMimeType(mimeType: string): string {
  switch (mimeType) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    default:
      return "png";
  }
}

function isSiteAssetAliasUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;

  const maybePg = error as {
    code?: string;
    constraint_name?: string;
    constraint?: string;
    message?: string;
  };

  return (
    maybePg.code === "23505" &&
    (maybePg.constraint_name === "site_assets_chat_alias_unique" ||
      maybePg.constraint === "site_assets_chat_alias_unique" ||
      String(maybePg.message || "").includes("site_assets_chat_alias_unique"))
  );
}

export async function GET(request: Request) {
  const user = await getUser();
  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized", code: "UNAUTHORIZED" },
      { status: 401 }
    );
  }

  const url = new URL(request.url);
  const chatId = url.searchParams.get("chatId")?.trim();

  if (!chatId) {
    return NextResponse.json(
      { error: "Chat ID is required", code: "CHAT_ID_REQUIRED" },
      { status: 400 }
    );
  }

  const chat = await getChatByPublicId(chatId, user.id);
  if (!chat) {
    return NextResponse.json(
      { error: "Chat not found", code: "CHAT_NOT_FOUND" },
      { status: 404 }
    );
  }

  const assets = await getSiteAssetsByChatId(chatId, user.id);
  return NextResponse.json({ assets });
}

export async function POST(request: Request) {
  const user = await getUser();
  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized", code: "UNAUTHORIZED" },
      { status: 401 }
    );
  }

  const formData = await request.formData().catch(() => null);
  if (!formData) {
    return NextResponse.json(
      { error: "Invalid form data", code: "INVALID_FORM_DATA" },
      { status: 400 }
    );
  }

  const chatId = getStringField(formData, "chatId");
  if (!chatId) {
    return NextResponse.json(
      { error: "Chat ID is required", code: "CHAT_ID_REQUIRED" },
      { status: 400 }
    );
  }

  const chat = await getChatByPublicId(chatId, user.id);
  if (!chat) {
    return NextResponse.json(
      { error: "Chat not found", code: "CHAT_NOT_FOUND" },
      { status: 404 }
    );
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "Image file is required", code: "FILE_REQUIRED" },
      { status: 400 }
    );
  }

  const mimeType = file.type.trim().toLowerCase();
  if (!SITE_ASSET_ALLOWED_IMAGE_TYPE_SET.has(mimeType)) {
    return NextResponse.json(
      {
        error: "Unsupported image type. Use JPG, PNG, or WEBP.",
        code: "UNSUPPORTED_FILE_TYPE",
      },
      { status: 400 }
    );
  }

  if (file.size <= 0 || file.size > SITE_ASSET_MAX_FILE_SIZE_BYTES) {
    return NextResponse.json(
      {
        error: `Image must be between 1 byte and ${SITE_ASSET_MAX_FILE_SIZE_BYTES} bytes.`,
        code: "INVALID_FILE_SIZE",
      },
      { status: 400 }
    );
  }

  const rawIntent = getStringField(formData, "intent") ?? "site_asset";
  if (!SITE_ASSET_INTENT_SET.has(rawIntent)) {
    return NextResponse.json(
      { error: "Invalid asset intent", code: "INVALID_ASSET_INTENT" },
      { status: 400 }
    );
  }

  const requestedAlias = getStringField(formData, "alias");
  const fallbackExtension = getExtensionForMimeType(mimeType);
  const label = getStringField(formData, "label");
  const altHint = getStringField(formData, "altHint");

  try {
    for (let attempt = 0; attempt < SITE_ASSET_ALIAS_RETRY_LIMIT; attempt += 1) {
      const existingAliases = await getSiteAssetAliasesByChatId(chatId, user.id);
      const alias = createUniqueSiteAssetAlias(
        requestedAlias || file.name,
        existingAliases,
        fallbackExtension
      );

      try {
        const blob = await put(`site-assets/${chatId}/${Date.now()}-${alias}`, file, {
          access: "public",
          addRandomSuffix: false,
          contentType: mimeType,
        });

        const asset = await createSiteAsset({
          chatId,
          userId: user.id,
          alias,
          blobUrl: blob.url,
          intent: rawIntent,
          status: "ready",
          mimeType,
          sizeBytes: file.size,
          width: null,
          height: null,
          originalFilename: file.name || null,
          altHint,
          label,
        });

        return NextResponse.json({ asset }, { status: 201 });
      } catch (error) {
        if (
          isSiteAssetAliasUniqueViolation(error) &&
          attempt < SITE_ASSET_ALIAS_RETRY_LIMIT - 1
        ) {
          continue;
        }
        throw error;
      }
    }

    return NextResponse.json(
      { error: "Failed to reserve a unique filename", code: "ALIAS_CONFLICT" },
      { status: 409 }
    );
  } catch (error) {
    console.error("[site-assets] Upload failed:", error);
    return NextResponse.json(
      { error: "Failed to upload image", code: "UPLOAD_FAILED" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  const user = await getUser();
  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized", code: "UNAUTHORIZED" },
      { status: 401 }
    );
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json(
      { error: "Invalid JSON body", code: "INVALID_JSON" },
      { status: 400 }
    );
  }

  const chatId =
    typeof body.chatId === "string" ? body.chatId.trim() : "";
  const id = typeof body.id === "number" ? body.id : Number(body.id);
  const intent =
    typeof body.intent === "string" ? body.intent.trim() : undefined;
  const altHint =
    typeof body.altHint === "string" ? body.altHint.trim() : undefined;
  const label =
    typeof body.label === "string" ? body.label.trim() : undefined;

  if (!chatId) {
    return NextResponse.json(
      { error: "Chat ID is required", code: "CHAT_ID_REQUIRED" },
      { status: 400 }
    );
  }

  if (!Number.isFinite(id)) {
    return NextResponse.json(
      { error: "Asset ID is required", code: "ASSET_ID_REQUIRED" },
      { status: 400 }
    );
  }

  const chat = await getChatByPublicId(chatId, user.id);
  if (!chat) {
    return NextResponse.json(
      { error: "Chat not found", code: "CHAT_NOT_FOUND" },
      { status: 404 }
    );
  }

  if (intent && !SITE_ASSET_INTENT_SET.has(intent)) {
    return NextResponse.json(
      { error: "Invalid asset intent", code: "INVALID_ASSET_INTENT" },
      { status: 400 }
    );
  }

  const asset = await updateSiteAsset({
    id,
    chatId,
    userId: user.id,
    intent,
    altHint: altHint ?? null,
    label: label ?? null,
  });

  if (!asset) {
    return NextResponse.json(
      { error: "Asset not found", code: "ASSET_NOT_FOUND" },
      { status: 404 }
    );
  }

  return NextResponse.json({ asset });
}
