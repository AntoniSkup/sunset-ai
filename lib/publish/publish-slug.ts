const RESERVED = new Set([
  "www",
  "app",
  "api",
  "p",
  "s",
  "admin",
  "mail",
  "ftp",
  "staging",
  "dev",
  "test",
  "null",
  "root",
]);

/** DNS / URL label max length (subdomain label). */
export const MAX_PUBLISH_PUBLIC_ID_LENGTH = 63;

/**
 * Derives a stable URL slug from a chat title for the published site hostname.
 */
export function slugifyChatTitleForPublish(
  title: string | null | undefined,
): string {
  const raw = (title?.trim() || "site")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 55);

  let base = (raw || "site").slice(0, MAX_PUBLISH_PUBLIC_ID_LENGTH);
  if (!base) base = "site";
  if (RESERVED.has(base) || /^\d+$/.test(base)) {
    return "site";
  }
  return base;
}
