export interface PreviewUpdatePayload {
  type: "UPDATE_PREVIEW";
  versionId: number;
  versionNumber: number;
  chatId: string;
  previewUrl?: string;
}

export interface PreviewLoadingPayload {
  type: "LOADING";
  message?: string;
}

export type PreviewMessagePayload =
  | PreviewUpdatePayload
  | PreviewLoadingPayload;

const PREVIEW_EVENT_NAME = "preview-update";

function dispatchPreviewEvent(payload: PreviewMessagePayload): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const event = new CustomEvent<PreviewMessagePayload>(PREVIEW_EVENT_NAME, {
      detail: payload,
    });
    window.dispatchEvent(event);
  } catch (error) {
    console.error("Failed to dispatch preview update event:", error);
  }
}

export const PREVIEW_EVENT_TYPE = PREVIEW_EVENT_NAME;

export function showPreviewLoader(message?: string): void {
  const payload: PreviewLoadingPayload = {
    type: "LOADING",
    message: message || "Generating landing page...",
  };
  dispatchPreviewEvent(payload);
}

export function updatePreviewPanel(
  versionId: number,
  versionNumber: number,
  chatId: string,
  previewUrl?: string
): void {
  const payload: PreviewUpdatePayload = {
    type: "UPDATE_PREVIEW",
    versionId,
    versionNumber,
    chatId,
    previewUrl,
  };
  dispatchPreviewEvent(payload);
}
