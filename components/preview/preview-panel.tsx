"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import type {
  PreviewMessagePayload,
  PreviewUpdatePayload,
  PreviewLoadingPayload,
} from "@/lib/preview/update-preview";
import { PREVIEW_EVENT_TYPE } from "@/lib/preview/update-preview";

interface PreviewPanelProps {
  className?: string;
  chatId: string;
}

export function PreviewPanel({ className, chatId }: PreviewPanelProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState<string>("");
  const [currentVersionId, setCurrentVersionId] = useState<number | null>(null);

  useEffect(() => {
    const handlePreviewUpdate = (event: CustomEvent<PreviewMessagePayload>) => {
      const payload = event.detail;

      if (payload.type === "LOADING") {
        setIsLoading(true);
        setLoadingMessage(
          (payload as PreviewLoadingPayload).message ||
          "Generating landing page..."
        );
      } else if (payload.type === "STOP_LOADING") {
        setIsLoading(false);
        setLoadingMessage("");
      } else if (payload.type === "UPDATE_PREVIEW") {
        const updatePayload = payload as PreviewUpdatePayload;
        setIsLoading(false);
        setLoadingMessage("");
        setCurrentVersionId(updatePayload.versionId);

        if (iframeRef.current) {
          const previewUrl =
            updatePayload.previewUrl ||
            `/api/preview/${updatePayload.chatId}/${updatePayload.versionNumber}`;
          iframeRef.current.src = previewUrl;
        }
      }
    };

    window.addEventListener(
      PREVIEW_EVENT_TYPE,
      handlePreviewUpdate as EventListener
    );

    return () => {
      window.removeEventListener(
        PREVIEW_EVENT_TYPE,
        handlePreviewUpdate as EventListener
      );
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadLatestPreview() {
      if (!chatId || typeof chatId !== "string") {
        return;
      }

      try {
        const res = await fetch(`/api/preview/${chatId}/latest`, {
          cache: "no-store",
        });

        if (res.status === 204 || res.status === 404) {
          return;
        }

        if (!res.ok) {
          throw new Error(`Failed to load latest preview: ${res.status}`);
        }

        const data = (await res.json()) as {
          versionId?: number;
          versionNumber?: number;
          revisionId?: number;
          revisionNumber?: number;
          previewUrl: string;
        };

        if (cancelled) {
          return;
        }

        const id = Number(data?.revisionId ?? data?.versionId ?? 0);
        if (id && data?.previewUrl && iframeRef.current) {
          setCurrentVersionId(id);
          iframeRef.current.src = data.previewUrl;
        }
      } catch (e) {
        console.error("Failed to load latest preview:", e);
      }
    }

    loadLatestPreview();

    return () => {
      cancelled = true;
    };
  }, [chatId]);

  return (
    <div className={`relative h-full w-full ${className || ""} rounded-lg border shadow-xs overflow-hidden `}>
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-background z-10">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {loadingMessage || "Generating landing page..."}
            </p>
          </div>
        </div>
      )}
      <iframe
        ref={iframeRef}
        data-preview="true"
        id="preview-iframe"
        className="h-full w-full  rounded-lg"
        title="Website Preview"
        sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
      />
      {!isLoading && !currentVersionId && (
        <div className="absolute inset-0 flex items-center justify-center bg-background">
          <div className="text-center">
            <p className="text-lg font-medium mb-2">Website Preview</p>
            <p className="text-sm text-muted-foreground">
              Preview will appear here
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
