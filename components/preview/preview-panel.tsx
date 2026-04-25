"use client";

import { useEffect, useId, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type {
  PreviewMessagePayload,
  PreviewUpdatePayload,
  PreviewLoadingPayload,
} from "@/lib/preview/update-preview";
import { PREVIEW_EVENT_TYPE } from "@/lib/preview/update-preview";
import sunsetLogoLarge from "@/components/icons/sunset_logo_large.png";
import { CodePanel } from "./code-panel";

export type PreviewPanelTab = "preview" | "code";

interface PreviewPanelProps {
  className?: string;
  chatId: string;
  activeTab?: PreviewPanelTab;
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

function clampProgress(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function mapProgressForUX(value: number): number {
  const p = clampProgress(value);
  // Keep early progress calmer, then accelerate near the end.
  return Math.pow(p, 1.28);
}

function LoadingStepMessage({ message }: { message: string }) {
  return (
    <div className="relative min-h-[1.75rem] w-[min(420px,calc(100vw-2rem))] text-center">
      <AnimatePresence mode="wait" initial={false}>
        <motion.p
          key={message}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.22, ease: "easeOut" }}
          className="absolute inset-x-0 text-sm text-muted-foreground font-medium leading-relaxed"
        >
          {message}
          <LoadingDots />
        </motion.p>
      </AnimatePresence>
    </div>
  );
}

function LoadingProgressDonut({ progress }: { progress: number }) {
  const gradientId = useId();
  const size = 112;
  const strokeWidth = 12;
  const radius = size / 2 - strokeWidth;
  const circumference = 2 * Math.PI * radius;
  const normalizedProgress = clampProgress(progress);
  const progressOffset = circumference * (1 - normalizedProgress);

  return (
    <div className="relative">
      <motion.div
        className="absolute inset-0 rounded-full border border-transparent"
        animate={{ rotate: 360 }}
        transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
      />
      <svg width={size} height={size} className="-rotate-90">
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#F87C07" />
            <stop offset="55%" stopColor="#FB923C" />
            <stop offset="100%" stopColor="#FDBA74" />
          </linearGradient>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="transparent"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-muted/35"
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="transparent"
          stroke={`url(#${gradientId})`}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          animate={{ strokeDashoffset: progressOffset }}
          initial={false}
          transition={{ duration: 0.5, ease: "easeOut" }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-sm font-medium text-foreground tabular-nums">
          {Math.round(normalizedProgress * 100)}%
        </span>
      </div>
    </div>
  );
}

export function PreviewPanel({
  className,
  chatId,
  activeTab = "preview",
}: PreviewPanelProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isIframeLoading, setIsIframeLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState<string>("");
  const [loadingStep, setLoadingStep] = useState<string>("");
  const [realProgress, setRealProgress] = useState(0);
  const [displayProgress, setDisplayProgress] = useState(0);
  const [currentVersionId, setCurrentVersionId] = useState<number | null>(null);
  const [revisionNumber, setRevisionNumber] = useState<number | null>(null);
  const realProgressRef = useRef(0);
  const lastMilestoneAtRef = useRef(Date.now());

  useEffect(() => {
    if (!isLoading) {
      realProgressRef.current = 0;
      lastMilestoneAtRef.current = Date.now();
      setDisplayProgress(0);
      return;
    }

    const intervalId = window.setInterval(() => {
      setDisplayProgress((current) => {
        const real = clampProgress(realProgressRef.current);
        const uxReal = mapProgressForUX(real);
        const elapsedSeconds = (Date.now() - lastMilestoneAtRef.current) / 1000;
        const optimism = Math.min(0.12, elapsedSeconds * 0.016);
        const optimisticCap =
          uxReal >= 1 ? 1 : Math.min(0.97, uxReal + optimism);
        const target = Math.max(uxReal, optimisticCap);
        const next =
          current < target ? Math.min(target, current + 0.0065) : current;
        return clampProgress(next);
      });
    }, 80);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [isLoading]);

  useEffect(() => {
    const next = clampProgress(realProgress);
    if (next > realProgressRef.current + 0.0005) {
      lastMilestoneAtRef.current = Date.now();
    }
    realProgressRef.current = next;
    const uxNext = mapProgressForUX(next);
    setDisplayProgress((current) => Math.max(current, uxNext));
  }, [realProgress]);

  useEffect(() => {
    const handlePreviewUpdate = (event: CustomEvent<PreviewMessagePayload>) => {
      const payload = event.detail;

      if (payload.type === "LOADING") {
        const loadingPayload = payload as PreviewLoadingPayload;
        const nextMessage =
          loadingPayload.progress?.currentStep ||
          loadingPayload.message ||
          "Generating landing page...";
        setIsLoading(true);
        setLoadingMessage(nextMessage);
        setLoadingStep(nextMessage);
        const nextProgress = clampProgress(
          loadingPayload.progress?.progress ?? realProgressRef.current
        );
        setRealProgress((current) => Math.max(current, nextProgress));
      } else if (payload.type === "STOP_LOADING") {
        setIsLoading(false);
        setLoadingMessage("");
        setLoadingStep("");
        setRealProgress(0);
      } else if (payload.type === "UPDATE_PREVIEW") {
        const updatePayload = payload as PreviewUpdatePayload;
        setIsLoading(false);
        setLoadingMessage("");
        setLoadingStep("");
        setRealProgress(0);
        setCurrentVersionId(updatePayload.versionId);
        setRevisionNumber(updatePayload.versionNumber);

        if (iframeRef.current) {
          const previewUrl =
            updatePayload.previewUrl ||
            `/api/preview/${updatePayload.chatId}/${updatePayload.versionNumber}`;
          setIsIframeLoading(true);
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

    async function canLoadPreview(previewUrl: string): Promise<boolean> {
      try {
        const previewRes = await fetch(previewUrl, { cache: "no-store" });
        return previewRes.ok;
      } catch {
        return false;
      }
    }

    async function loadLatestPreview() {
      if (!chatId || typeof chatId !== "string") {
        return;
      }

      try {
        // Don't preemptively show the loader just because a run is active —
        // the AI may still be planning before any builder tool has fired.
        // `chat.tsx` will dispatch `showPreviewLoader` via the LOADING event
        // on the first tracked tool call (and replays past tool calls when
        // resuming an in-progress run), which our event listener picks up.

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
        const revNum = data?.revisionNumber ?? data?.versionNumber ?? null;
        if (id && data?.previewUrl && iframeRef.current) {
          const previewReady = await canLoadPreview(data.previewUrl);
          if (!previewReady) {
            return;
          }
          if (cancelled) {
            return;
          }
          setCurrentVersionId(id);
          setRevisionNumber(revNum ?? null);
          setIsIframeLoading(true);
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
    <div
      className={`relative h-full w-full ${className || ""} rounded-lg border shadow-xs overflow-hidden `}
    >
      {activeTab === "code" ? (
        <CodePanel
          chatId={chatId}
          revisionNumber={revisionNumber}
          className="h-full"
        />
      ) : (
        <>
          {isIframeLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-background z-10">
              <div className="flex flex-col items-center gap-3">
                <LoadingProgressDonut progress={1} />
                <p className="text-sm text-muted-foreground">
                  Loading preview...
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
            onLoad={() => setIsIframeLoading(false)}
            onError={() => setIsIframeLoading(false)}
          />
          {!currentVersionId && (
            <div className="absolute inset-0 bg-white rounded-lg ">
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 px-4">
                <div className="text-center flex-col flex">
                  {isLoading ? (
                    <>
                      <div className="mx-auto mb-10">
                        <LoadingProgressDonut progress={displayProgress} />
                      </div>
                      <span className="text-2xl font-medium mb-2">
                        Bringing your idea to life
                      </span>
                      <LoadingStepMessage
                        message={
                          loadingStep || loadingMessage || "Building layout"
                        }
                      />
                    </>
                  ) : (
                    <>
                      <img
                        src={sunsetLogoLarge.src}
                        alt="Sunset logo large"
                        className="mx-auto mb-12"
                      />

                      <span className="text-2xl font-medium mb-2">
                        Bringing your idea to life
                      </span>

                      <BuilderTipsFromButton active />
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
