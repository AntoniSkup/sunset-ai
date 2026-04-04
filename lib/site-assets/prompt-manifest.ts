import { IMAGE_ASSET_COMPONENT_NAME } from "./conventions";
import type { SiteAssetPromptDescriptor } from "./types";

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
    "- Import path examples: in landing/index.tsx use `./_runtime/ImageAsset`; in landing/pages/* or landing/sections/* use `../_runtime/ImageAsset`.",
    "- Prefer using uploaded user assets first when they clearly fit the requested slot or content.",
    "- Stock assets may be used to fill missing image slots when uploaded assets are unavailable or insufficient.",
    "- Assets with intent=reference are visual inspiration only and must not be rendered directly unless the user explicitly asks.",
    "- Assets with intent=site_asset or intent=both may be rendered on the site when appropriate.",
    "- Prefer reusing the provided aliases exactly as given.",
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
