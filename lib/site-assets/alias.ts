import { SITE_ASSET_MAX_ALIAS_LENGTH } from "./conventions";

const DEFAULT_EXTENSION = "png";
const FALLBACK_BASENAME = "image";

function splitFilename(
  filename?: string | null,
  fallbackExtension = DEFAULT_EXTENSION
): {
  basename: string;
  extension: string;
} {
  const trimmed = (filename ?? "").trim();
  if (!trimmed) {
    return { basename: FALLBACK_BASENAME, extension: fallbackExtension };
  }

  const lastDot = trimmed.lastIndexOf(".");
  if (lastDot <= 0 || lastDot === trimmed.length - 1) {
    return { basename: trimmed, extension: fallbackExtension };
  }

  return {
    basename: trimmed.slice(0, lastDot),
    extension: trimmed.slice(lastDot + 1),
  };
}

function sanitizeSegment(value: string): string {
  const cleaned = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");

  return cleaned || FALLBACK_BASENAME;
}

function normalizeExtension(extension: string): string {
  const cleaned = extension.toLowerCase().replace(/[^a-z0-9]/g, "");
  return cleaned || DEFAULT_EXTENSION;
}

export function normalizeSiteAssetAlias(
  filename?: string | null,
  fallbackExtension = DEFAULT_EXTENSION
): string {
  const { basename, extension } = splitFilename(filename, fallbackExtension);
  const safeBase = sanitizeSegment(basename);
  const safeExt = normalizeExtension(extension);
  const maxBaseLength = Math.max(
    1,
    SITE_ASSET_MAX_ALIAS_LENGTH - safeExt.length - 1
  );
  const truncatedBase = safeBase.slice(0, maxBaseLength);
  return `${truncatedBase}.${safeExt}`;
}

export function createUniqueSiteAssetAlias(
  filename: string | null | undefined,
  existingAliases: Iterable<string>,
  fallbackExtension = DEFAULT_EXTENSION
): string {
  const normalized = normalizeSiteAssetAlias(filename, fallbackExtension);
  const aliasSet = new Set(Array.from(existingAliases, (alias) => alias.toLowerCase()));

  if (!aliasSet.has(normalized.toLowerCase())) {
    return normalized;
  }

  const { basename, extension } = splitFilename(normalized);
  let counter = 2;

  while (counter < 1000) {
    const suffix = `-${counter}`;
    const maxBaseLength = Math.max(
      1,
      SITE_ASSET_MAX_ALIAS_LENGTH - extension.length - suffix.length - 1
    );
    const candidate = `${basename.slice(0, maxBaseLength)}${suffix}.${extension}`;
    if (!aliasSet.has(candidate.toLowerCase())) {
      return candidate;
    }
    counter += 1;
  }

  return `${basename.slice(0, 8)}-${Date.now()}.${extension}`;
}
