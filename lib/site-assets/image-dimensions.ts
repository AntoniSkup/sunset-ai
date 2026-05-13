/**
 * Lightweight image-dimension parser for the formats accepted by site
 * uploads (`SITE_ASSET_ALLOWED_IMAGE_TYPES`): PNG, JPEG, and WebP. Pulled
 * out of the `/api/site-assets` upload route so we can capture intrinsic
 * pixel dimensions at upload time without adding an external dependency.
 *
 * The AI agent later uses these dimensions in two ways:
 *   1. The textual asset manifest surfaces `width`/`height`/orientation
 *      so the LLM can pick aliases whose aspect ratio matches the slot
 *      it is filling (landscape image → wide hero, portrait → tall card).
 *   2. The injected `landing/_runtime/assets.ts` stores the same numbers
 *      so the rendered `<ImageAsset>` defaults to the natural width and
 *      height attributes — preventing the browser from upscaling small
 *      images into a pixelated full-bleed hero.
 *
 * Only the bytes we actually need are read; we never hold the whole file
 * past the buffer the caller already has in memory.
 */

export type SupportedImageMimeType =
  | "image/png"
  | "image/jpeg"
  | "image/webp";

export interface ImageDimensions {
  width: number;
  height: number;
}

/**
 * Best-effort intrinsic pixel-dimension extraction from raw image bytes.
 * Returns `null` for any unsupported / malformed input rather than
 * throwing — callers should treat missing dimensions as "unknown" and
 * proceed normally.
 */
export function readImageDimensionsFromBuffer(
  buffer: Uint8Array,
  mimeType: string
): ImageDimensions | null {
  if (!buffer || buffer.byteLength < 12) return null;
  const normalized = mimeType.trim().toLowerCase();
  switch (normalized) {
    case "image/png":
      return readPngDimensions(buffer);
    case "image/jpeg":
    case "image/jpg":
      return readJpegDimensions(buffer);
    case "image/webp":
      return readWebpDimensions(buffer);
    default:
      return null;
  }
}

function readUInt32BE(buffer: Uint8Array, offset: number): number {
  return (
    buffer[offset] * 0x1000000 +
    ((buffer[offset + 1] << 16) | (buffer[offset + 2] << 8) | buffer[offset + 3])
  );
}

function readUInt16BE(buffer: Uint8Array, offset: number): number {
  return (buffer[offset] << 8) | buffer[offset + 1];
}

function readUInt24LE(buffer: Uint8Array, offset: number): number {
  return (
    buffer[offset] +
    buffer[offset + 1] * 0x100 +
    buffer[offset + 2] * 0x10000
  );
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function readPngDimensions(buffer: Uint8Array): ImageDimensions | null {
  if (buffer.byteLength < 24) return null;
  for (let i = 0; i < PNG_SIGNATURE.length; i += 1) {
    if (buffer[i] !== PNG_SIGNATURE[i]) return null;
  }
  // The IHDR chunk follows the signature; width @16, height @20 (big-endian).
  const width = readUInt32BE(buffer, 16);
  const height = readUInt32BE(buffer, 20);
  if (!Number.isFinite(width) || !Number.isFinite(height)) return null;
  if (width <= 0 || height <= 0) return null;
  return { width, height };
}

function readJpegDimensions(buffer: Uint8Array): ImageDimensions | null {
  if (buffer.byteLength < 4) return null;
  // SOI marker.
  if (buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;

  let offset = 2;
  const len = buffer.byteLength;
  while (offset < len) {
    if (buffer[offset] !== 0xff) return null;
    let marker = buffer[offset + 1];
    offset += 2;
    while (marker === 0xff && offset < len) {
      marker = buffer[offset];
      offset += 1;
    }
    if (marker === 0xd8 || marker === 0xd9) return null;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      continue;
    }
    if (offset + 2 > len) return null;
    const segmentLength = readUInt16BE(buffer, offset);
    if (segmentLength < 2) return null;
    // SOFn markers carrying frame dimensions. Skip DHT (0xC4), JPG (0xC8),
    // DAC (0xCC) which share the 0xCx range but don't encode size.
    if (
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf)
    ) {
      if (offset + segmentLength > len) return null;
      const height = readUInt16BE(buffer, offset + 3);
      const width = readUInt16BE(buffer, offset + 5);
      if (width <= 0 || height <= 0) return null;
      return { width, height };
    }
    offset += segmentLength;
  }
  return null;
}

function decodeAsciiTag(buffer: Uint8Array, offset: number, length: number): string {
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += String.fromCharCode(buffer[offset + i]);
  }
  return out;
}

function readWebpDimensions(buffer: Uint8Array): ImageDimensions | null {
  if (buffer.byteLength < 30) return null;
  if (decodeAsciiTag(buffer, 0, 4) !== "RIFF") return null;
  if (decodeAsciiTag(buffer, 8, 4) !== "WEBP") return null;

  const chunkTag = decodeAsciiTag(buffer, 12, 4);

  if (chunkTag === "VP8 ") {
    if (buffer.byteLength < 30) return null;
    if (
      buffer[23] !== 0x9d ||
      buffer[24] !== 0x01 ||
      buffer[25] !== 0x2a
    ) {
      return null;
    }
    const width = readUInt16LE(buffer, 26) & 0x3fff;
    const height = readUInt16LE(buffer, 28) & 0x3fff;
    if (width <= 0 || height <= 0) return null;
    return { width, height };
  }

  if (chunkTag === "VP8L") {
    if (buffer.byteLength < 25) return null;
    if (buffer[20] !== 0x2f) return null;
    const b0 = buffer[21];
    const b1 = buffer[22];
    const b2 = buffer[23];
    const b3 = buffer[24];
    const width = 1 + (((b1 & 0x3f) << 8) | b0);
    const height = 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6));
    if (width <= 0 || height <= 0) return null;
    return { width, height };
  }

  if (chunkTag === "VP8X") {
    if (buffer.byteLength < 30) return null;
    const width = 1 + readUInt24LE(buffer, 24);
    const height = 1 + readUInt24LE(buffer, 27);
    if (width <= 0 || height <= 0) return null;
    return { width, height };
  }

  return null;
}

function readUInt16LE(buffer: Uint8Array, offset: number): number {
  return buffer[offset] | (buffer[offset + 1] << 8);
}

export interface AspectClassification {
  width: number;
  height: number;
  ratio: number;
  /**
   * Coarse orientation bucket the LLM can reason about quickly without
   * needing to do its own arithmetic. Thresholds are deliberately loose so
   * "almost square" images don't get flagged as landscape/portrait.
   */
  orientation: "landscape" | "portrait" | "square";
  /**
   * Decimal aspect (w/h) rounded to 2 decimals — easier for the model to
   * compare against typical Tailwind aspect utilities (`16/9 ≈ 1.78`,
   * `4/3 ≈ 1.33`, `3/2 = 1.5`, `1/1 = 1`).
   */
  aspectDecimal: number;
}

const SQUARE_RATIO_LOW = 0.9;
const SQUARE_RATIO_HIGH = 1.1;

export function classifyAspect(
  width: number | null | undefined,
  height: number | null | undefined
): AspectClassification | null {
  if (
    typeof width !== "number" ||
    typeof height !== "number" ||
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return null;
  }

  const ratio = width / height;
  const orientation: AspectClassification["orientation"] =
    ratio >= SQUARE_RATIO_LOW && ratio <= SQUARE_RATIO_HIGH
      ? "square"
      : ratio > SQUARE_RATIO_HIGH
        ? "landscape"
        : "portrait";

  return {
    width,
    height,
    ratio,
    orientation,
    aspectDecimal: Math.round(ratio * 100) / 100,
  };
}
