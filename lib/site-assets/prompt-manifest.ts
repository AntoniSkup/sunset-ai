import type { ImagePart, TextPart } from "@ai-sdk/provider-utils";
import { IMAGE_ASSET_COMPONENT_NAME } from "./conventions";
import type { SiteAssetPromptDescriptor } from "./types";

/**
 * Hard cap on how many image previews we attach as multimodal content per
 * codegen call. Each attached image costs tokens (and money) on the provider
 * side, so we keep this conservative even when a chat has many uploaded or
 * resolved stock assets. The textual manifest still lists every asset.
 */
const DEFAULT_MAX_VISUAL_IMAGES_PER_CODEGEN = 16;

function serializeAssetLine(asset: SiteAssetPromptDescriptor): string {
  const extras = [
    asset.sourceType ? `sourceType=${asset.sourceType}` : null,
    asset.slotKey ? `slot=${asset.slotKey}` : null,
    asset.label ? `label="${asset.label}"` : null,
    asset.altHint ? `altHint="${asset.altHint}"` : null,
  ]
    .filter(Boolean)
    .join(" ");

  return `- ${asset.alias} | intent=${asset.intent} | url=${asset.url}${extras ? ` | ${extras}` : ""}`;
}

export function buildSiteAssetManifest(
  assets: SiteAssetPromptDescriptor[]
): string {
  if (assets.length === 0) {
    return "";
  }

  const lines = assets.map(serializeAssetLine).join("\n");

  return [
    "Available site assets:",
    lines,
  ].join("\n");
}

export function toSiteAssetPromptDescriptors(
  assets: Array<{
    alias: string;
    blobUrl: string;
    intent: string;
    status: string;
    sourceType?: string | null;
    slotKey?: string | null;
    altHint?: string | null;
    label?: string | null;
  }>
): SiteAssetPromptDescriptor[] {
  return assets
    .filter((asset) => asset.status === "ready")
    .map((asset) => ({
      alias: asset.alias,
      intent: asset.intent as SiteAssetPromptDescriptor["intent"],
      url: asset.blobUrl,
      sourceType:
        asset.sourceType === "stock" ? "stock" : "upload",
      slotKey: asset.slotKey ?? null,
      altHint: asset.altHint ?? null,
      label: asset.label ?? null,
    }));
}

export function buildSiteAssetPromptGuidance(): string {
  return [
    "Site image rules:",
    `- Use ${IMAGE_ASSET_COMPONENT_NAME} for images that should appear on the website.`,
    "- The component must reference the asset alias, never the raw blob URL.",
    '- Example: <ImageAsset asset="hero.jpg" alt="Hero image" className="..." />',
    "- Import the component as a NAMED import: `import { ImageAsset } from '<runtime-path>'`. Both `import { ImageAsset }` and `import ImageAsset` resolve at runtime, but use the named form for consistency.",
    "- Import path examples: in landing/index.tsx use `./_runtime/ImageAsset`; in landing/pages/* or landing/sections/* use `../_runtime/ImageAsset`.",
    "- Prefer using uploaded user assets first when they clearly fit the requested slot or content.",
    "- Stock assets may be used to fill missing image slots when uploaded assets are unavailable or insufficient.",
    "- Assets with intent=reference are visual inspiration only and must not be rendered directly unless the user explicitly asks.",
    "- Assets with intent=site_asset or intent=both may be rendered on the site when appropriate.",
    "- Use the provided alias exactly as written. Do not rename it, beautify it, translate it, or derive a new filename from the label, alt text, or slot.",
    "- If a manifest line includes slot=hero and alias=hero.jpg, then the component must use asset=\"hero.jpg\" exactly.",
    "- Do not invent new asset aliases or raw external image URLs.",
  ].join("\n");
}

export function buildSiteAssetPromptContext(
  assets: SiteAssetPromptDescriptor[]
): string {
  if (assets.length === 0) {
    return "";
  }

  return [buildSiteAssetManifest(assets), buildSiteAssetPromptGuidance()]
    .filter(Boolean)
    .join("\n\n");
}

/** Manifest + guidance when assets exist; explicit notice when none (codegen). */
export function buildSiteAssetPromptContextForCodegen(
  assets: SiteAssetPromptDescriptor[]
): string {
  if (assets.length === 0) {
    return [
      "**Site images (ImageAsset aliases)**",
      "No image assets are registered for this chat. This is a hard constraint with no exceptions:",
      "- Do NOT use <img> tags with any external URL.",
      "- Do NOT use CSS background-image with any external URL (including Unsplash, Pexels, Pixabay, or any other CDN or stock provider).",
      "- Do NOT invent raw blob URLs, placeholder CDN URLs, or direct stock-provider URLs anywhere in the generated TSX.",
      "Where the design calls for visual weight, use non-image alternatives: CSS gradients, solid color fields, geometric or noise-texture backgrounds (Tailwind utilities / CSS only), layered transparencies, or bold typographic treatments. Do not attempt to simulate missing imagery with placeholder URLs of any kind.",
    ].join("\n");
  }

  return buildSiteAssetPromptContext(assets);
}

/**
 * Build multimodal message parts that let the codegen model actually SEE the
 * images that are available for this chat, not just read their aliases.
 *
 * Each preview is preceded by a short text label that pins the alias/intent/
 * slot to that visual, so when the LLM later decides to render imagery in a
 * section it can pick the right `<ImageAsset asset="..." />` based on what the
 * picture actually depicts (e.g. "the warm interior shot" vs. "the espresso
 * detail") instead of guessing from the filename alone.
 *
 * Returns an empty array when no assets exist or none have a usable URL, so
 * callers can spread it directly into a `content` array without conditional
 * branching.
 */
export function buildSiteAssetVisualPromptParts(
  assets: SiteAssetPromptDescriptor[],
  options?: { maxImages?: number }
): Array<TextPart | ImagePart> {
  if (assets.length === 0) {
    return [];
  }

  const max = Math.max(0, options?.maxImages ?? DEFAULT_MAX_VISUAL_IMAGES_PER_CODEGEN);
  if (max === 0) {
    return [];
  }

  const limited = assets.slice(0, max);
  const parts: Array<TextPart | ImagePart> = [];
  const omitted = assets.length - limited.length;

  parts.push({
    type: "text",
    text: [
      "**Visual previews of available site image assets**",
      `The next ${limited.length} message part(s) attach the actual image bytes for the assets listed in the textual manifest. Each preview is paired with the EXACT alias to use in <${IMAGE_ASSET_COMPONENT_NAME} asset="..." />. Pick the alias whose preview visually matches the slot you are filling; do not invent new aliases or rename them.`,
      omitted > 0
        ? `Showing ${limited.length} of ${assets.length} ready assets (capped to keep the prompt small); the textual manifest above still lists all of them by alias.`
        : null,
    ]
      .filter(Boolean)
      .join("\n"),
  });

  for (const asset of limited) {
    let imageUrl: URL;
    try {
      imageUrl = new URL(asset.url);
    } catch {
      continue;
    }

    const meta = [
      `alias=${asset.alias}`,
      `intent=${asset.intent}`,
      asset.sourceType ? `sourceType=${asset.sourceType}` : null,
      asset.slotKey ? `slot=${asset.slotKey}` : null,
      asset.label ? `label="${asset.label}"` : null,
      asset.altHint ? `altHint="${asset.altHint}"` : null,
    ]
      .filter(Boolean)
      .join(" | ");

    parts.push({ type: "text", text: `Preview for ${meta}` });
    parts.push({ type: "image", image: imageUrl });
  }

  // If every URL was malformed we'd be left with only the intro label, which
  // is misleading; drop it so the prompt stays clean.
  if (parts.length === 1) {
    return [];
  }

  return parts;
}
