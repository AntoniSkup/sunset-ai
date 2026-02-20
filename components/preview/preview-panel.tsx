"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import type {
  PreviewMessagePayload,
  PreviewUpdatePayload,
  PreviewLoadingPayload,
} from "@/lib/preview/update-preview";
import { PREVIEW_EVENT_TYPE } from "@/lib/preview/update-preview";
import loader from "@/components/icons/loader.svg";

interface PreviewPanelProps {
  className?: string;
  chatId: string;
}

function LoadingDots() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setIndex((i) => (i + 1) % 3), 1800);
    return () => clearInterval(id);
  }, []);

  return (
    <span className="inline-block min-w-[1.5em] text-left">
      {[0, 1, 2].map((i) =>
        index >= i ? (
          <motion.span
            key={i}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2 }}
            className="inline-block"
          >
            .
          </motion.span>
        ) : null
      )}
    </span>
  );
}

function BuilderTipsFromButton({
  active,
  className,
}: {
  active: boolean;
  className?: string;
}) {
  const tips = [
    {
      body: "Tell the AI the goal, audience, and vibe.",
    },
    {
      body: "Request a hero, features, social proof, pricing, FAQ, and a clear CTA.",
    },
    {
      body: "Say what to change: “shorter hero copy”, “more contrast”.",
    },
  ] as const;

  const [tipIndex, setTipIndex] = useState(0);

  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => {
      setTipIndex((i) => (i + 1) % tips.length);
    }, 5000);
    return () => {
      window.clearInterval(id);
    };
  }, [active, tips.length]);

  if (!active) return null;

  const tip = tips[tipIndex];

  return (
    <div className={className}>
      <div className="flex flex-col items-center">
        <div className="relative min-h-[3.5rem] w-[min(320px,calc(100vw-2rem))] flex items-center justify-center text-center">
          <AnimatePresence mode="wait" initial={false}>
            <motion.p
              key={tipIndex}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.22, ease: "easeOut" }}
              className="absolute inset-x-0 text-sm text-muted-foreground font-medium leading-relaxed"
            >
              {tip.body}
            </motion.p>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

export function PreviewPanel({ className, chatId }: PreviewPanelProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState<string>("");
  const [currentVersionId, setCurrentVersionId] = useState<number | null>(null);
  const loaderSrc = typeof loader === "string" ? loader : loader.src;

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
        <div className="absolute inset-0 bg-white rounded-lg ">

          <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 px-4">

            <div className="text-center flex-col flex">
              <object
                key={loaderSrc}
                data={loaderSrc}
                type="image/svg+xml"
                aria-label="Loading"
                className="mx-auto mb-3 h-72 w-72"
              >
                <img
                  src={loaderSrc}
                  alt="Loading"
                  className="mx-auto mb-3 h-72 w-72"
                />
              </object>
              <span className="text-2xl font-medium">
                Bringing your idea to life
                <LoadingDots />
              </span>
            </div>
            <BuilderTipsFromButton active className="mt-1" />
          </div>
        </div>
      )}
    </div>
  );
}
