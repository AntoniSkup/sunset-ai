import { IMAGE_ASSET_COMPONENT_NAME } from "./conventions";
import type { SiteAssetPromptDescriptor } from "./types";

function serializeAssetLine(asset: SiteAssetPromptDescriptor): string {
  const extras = [
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
    "Available uploaded site assets:",
    lines,
  ].join("\n");
}

export function toSiteAssetPromptDescriptors(
  assets: Array<{
    alias: string;
    blobUrl: string;
    intent: string;
    status: string;
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
      altHint: asset.altHint ?? null,
      label: asset.label ?? null,
    }));
}

export function buildSiteAssetPromptGuidance(): string {
  return [
    "Uploaded image rules:",
    `- Use ${IMAGE_ASSET_COMPONENT_NAME} for images that should appear on the website.`,
    "- The component must reference the asset alias, never the raw blob URL.",
    '- Example: <ImageAsset asset="hero.jpg" alt="Hero image" className="..." />',
    "- Import path examples: in landing/index.tsx use `./_runtime/ImageAsset`; in landing/pages/* or landing/sections/* use `../_runtime/ImageAsset`.",
    "- Assets with intent=reference are visual inspiration only and must not be rendered directly unless the user explicitly asks.",
    "- Assets with intent=site_asset or intent=both may be rendered on the site when appropriate.",
    "- Prefer reusing the provided aliases exactly as given.",
    "- Do not invent new uploaded asset aliases.",
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
