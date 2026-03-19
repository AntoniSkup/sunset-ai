export const IMAGE_ASSET_COMPONENT_NAME = "ImageAsset";
export const IMAGE_ASSET_RUNTIME_DIR = "landing/_runtime";
export const IMAGE_ASSET_COMPONENT_PATH = `${IMAGE_ASSET_RUNTIME_DIR}/ImageAsset.tsx`;
export const IMAGE_ASSET_MAP_PATH = `${IMAGE_ASSET_RUNTIME_DIR}/assets.ts`;

export const SITE_ASSET_ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export const SITE_ASSET_MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
export const SITE_ASSET_MAX_FILES_PER_MESSAGE = 6;
export const SITE_ASSET_MAX_ALIAS_LENGTH = 40;

export const SITE_ASSET_ALIAS_SLOT_HINTS = [
  "logo",
  "hero",
  "feature",
  "gallery",
  "product",
  "testimonial",
] as const;
