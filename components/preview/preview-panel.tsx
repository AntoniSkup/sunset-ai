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
}

export function PreviewPanel({ className }: PreviewPanelProps) {
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
      } else if (payload.type === "UPDATE_PREVIEW") {
        const updatePayload = payload as PreviewUpdatePayload;
        setIsLoading(false);
        setLoadingMessage("");
        setCurrentVersionId(updatePayload.versionId);

        if (iframeRef.current) {
          const previewUrl =
            updatePayload.previewUrl ||
            `/api/preview/${updatePayload.sessionId}/${updatePayload.versionNumber}`;
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

  return (
    <div className={`relative h-full w-full ${className || ""}`}>
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
        className="h-full w-full border-0"
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
