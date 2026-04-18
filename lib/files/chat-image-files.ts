const ACCEPTED_IMAGE_MIME = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);

const ACCEPTED_EXT = new Set([".jpg", ".jpeg", ".png", ".webp"]);

export function isAcceptedChatImageFile(file: File): boolean {
  const mime = file.type.trim().toLowerCase();
  if (mime && ACCEPTED_IMAGE_MIME.has(mime)) return true;
  const name = file.name.trim().toLowerCase();
  const i = name.lastIndexOf(".");
  if (i >= 0 && ACCEPTED_EXT.has(name.slice(i))) return true;
  return false;
}

function dedupeImageFiles(files: File[]): File[] {
  const byKey = new Map<string, File>();
  for (const file of files) {
    if (!isAcceptedChatImageFile(file)) continue;
    const type = file.type.trim().toLowerCase() || "application/octet-stream";
    const key = `${file.size}:${file.lastModified}:${type}`;
    byKey.set(key, file);
  }
  return [...byKey.values()];
}

export function pickAcceptedChatImageFilesFromDataTransfer(
  dataTransfer: DataTransfer | null
): File[] {
  if (!dataTransfer) return [];

  const fromItems: File[] = [];
  const items = dataTransfer.items;
  if (items?.length) {
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item?.kind !== "file") continue;
      const f = item.getAsFile();
      if (f) fromItems.push(f);
    }
  }

  const fromItemsAccepted = dedupeImageFiles(fromItems);
  if (fromItemsAccepted.length > 0) {
    return fromItemsAccepted;
  }

  return dedupeImageFiles(Array.from(dataTransfer.files ?? []));
}

export function toFileList(files: File[]): FileList {
  const dt = new DataTransfer();
  for (const f of files) dt.items.add(f);
  return dt.files;
}

export function dataTransferHasFilePayload(
  dataTransfer: DataTransfer | null
): boolean {
  if (!dataTransfer?.types) return false;
  return (
    dataTransfer.types.includes("Files") ||
    Array.from(dataTransfer.types).some((t) => t === "application/x-moz-file")
  );
}
