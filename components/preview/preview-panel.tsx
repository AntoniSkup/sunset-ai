"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";
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
  const t = useTranslations("builder.preview");
  const tips = [
    { body: t("tipGoalAudienceVibe") },
    { body: t("tipSections") },
    { body: t("tipSayWhatToChange") },
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
  const t = useTranslations("builder.preview");
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
  const [isCheckingLiveRun, setIsCheckingLiveRun] = useState(true);

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
    let cancelled = false;

    async function fetchTokenAndPoint() {
      if (cancelled) return;
      // Mints a new short-lived JWT and returns an absolute URL on the deploy
      // origin (`stronkaai-deploy.com/p/<token>`). Fetched fresh on every
      // revision change because tokens encode `(chatId, revisionNumber)`.
      try {
        const res = await fetch(`/api/preview/${chatId}/token`, {
          cache: "no-store",
        });
        if (cancelled) return;
        if (res.status === 204 || res.status === 404) return;
        if (!res.ok) {
          console.error(`Failed to mint preview token: ${res.status}`);
          return;
        }
        const data = (await res.json()) as {
          revisionId: number;
          revisionNumber: number;
          previewUrl: string;
        };
        if (cancelled) return;
        if (data.previewUrl && iframeRef.current) {
          setCurrentVersionId(data.revisionId);
          setRevisionNumber(data.revisionNumber);
          setIsIframeLoading(true);
          iframeRef.current.src = data.previewUrl;
        }
      } catch (e) {
        console.error("Failed to load latest preview:", e);
      }
    }

    const handlePreviewUpdate = (event: CustomEvent<PreviewMessagePayload>) => {
      const payload = event.detail;

      if (payload.type === "LOADING") {
        const loadingPayload = payload as PreviewLoadingPayload;
        const nextMessage =
          loadingPayload.progress?.currentStep ||
          loadingPayload.message ||
          t("generatingLandingPageEllipsis");
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
        // Re-mint the JWT for the new revision so the iframe URL points at
        // the fresh bundle on the deploy origin.
        void fetchTokenAndPoint();
      }
    };

    window.addEventListener(
      PREVIEW_EVENT_TYPE,
      handlePreviewUpdate as EventListener
    );

    return () => {
      cancelled = true;
      window.removeEventListener(
        PREVIEW_EVENT_TYPE,
        handlePreviewUpdate as EventListener
      );
    };
  }, [chatId, t]);

  useEffect(() => {
    if (!chatId || typeof chatId !== "string") {
      setIsCheckingLiveRun(false);
      return;
    }

    let cancelled = false;
    setIsCheckingLiveRun(true);

    async function loadLatestPreview() {
      try {
        const res = await fetch(`/api/preview/${chatId}/token`, {
          cache: "no-store",
        });
        if (cancelled) return;
        if (res.status === 204 || res.status === 404) return;
        if (!res.ok) {
          throw new Error(`Failed to mint preview token: ${res.status}`);
        }
        const data = (await res.json()) as {
          revisionId: number;
          revisionNumber: number;
          previewUrl: string;
        };
        if (cancelled) return;
        if (data.previewUrl && iframeRef.current) {
          setCurrentVersionId(data.revisionId);
          setRevisionNumber(data.revisionNumber);
          setIsIframeLoading(true);
          iframeRef.current.src = data.previewUrl;
        }
      } catch (e) {
        console.error("Failed to load latest preview:", e);
      }
    }

    (async () => {
      let hasRunningTurnRun = false;
      try {
        const res = await fetch(
          `/api/chats/${encodeURIComponent(chatId)}/turn-runs/live`,
          { cache: "no-store" }
        );
        if (cancelled) return;
        if (res.ok) {
          const data = (await res.json()) as {
            run?: { id?: string } | null;
            liveState?: { status?: string } | null;
          };
          if (cancelled) return;
          hasRunningTurnRun =
            Boolean(data?.run) || data?.liveState?.status === "running";
          if (hasRunningTurnRun) {
            setIsLoading(true);
            setLoadingMessage((prev) => prev || t("generatingLandingPage"));
            setLoadingStep((prev) => prev || t("generatingLandingPage"));
          }
        }
      } catch {
        // Best-effort: if the live lookup fails we just fall back to the
        // existing event-driven flow.
      } finally {
        if (!cancelled) {
          setIsCheckingLiveRun(false);
        }
      }

      if (cancelled) return;

      if (hasRunningTurnRun) {
        // A turn-run is mid-flight. Each in-flight tool call commits its own
        // partial `landingSiteRevisions` row (e.g. Hero.tsx without its sibling
        // sections / theme.tsx yet), and `getLatestLandingSiteRevision` does
        // not distinguish "complete" from "partial". If we fetched + loaded
        // that latest revision into the iframe right now, esbuild would
        // resolve every unsatisfied `../sections/Foo` import via
        // `injectMissingLandingImportStubs` (lib/preview/compose-react.ts) and
        // the iframe would render a wall of "Missing source file (preview
        // placeholder)" panels — exactly the bug we're avoiding.
        //
        // Instead, leave `currentVersionId` null so the loader overlay stays
        // up, and wait for chat.tsx to dispatch UPDATE_PREVIEW on
        // `run_completed`, which calls `fetchTokenAndPoint` above to load
        // the now-complete revision.
        return;
      }

      await loadLatestPreview();
    })();

    return () => {
      cancelled = true;
    };
  }, [chatId, t]);

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
                  {t("loadingPreview")}
                </p>
              </div>
            </div>
          )}
          {/*
           * The preview iframe is loaded from the deploy origin
           * (`stronkaai-deploy.com`) — a different host than the main app — so
           * the AI-generated React bundle runs in a separate browser origin
           * with no access to the main app's cookies, storage, or APIs.
           *
           * `allow-same-origin` is required: without it the document has an
           * *opaque* origin (`location.origin === "null"`). The shell still
           * loads from deploy.localhost, but `<script type="module">` and
           * `fetch()` to that host are treated as cross-origin, so Chrome
           * blocks the bundle with `(blocked:origin)` / "Failed to fetch"
           * while opening the same URL in a new tab works.
           *
           * Tradeoff: the preview can read deploy-origin cookies/storage.
           * Mitigate with strict deploy CSP, `frame-ancestors` (only the
           * main app may embed), and avoid storing secrets on the deploy host.
           */}
          <iframe
            ref={iframeRef}
            data-preview="true"
            id="preview-iframe"
            className="h-full w-full  rounded-lg"
            title={t("iframeTitle")}
            sandbox="allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-same-origin"
            onLoad={() => setIsIframeLoading(false)}
            onError={() => setIsIframeLoading(false)}
          />
          {/*
           * The full-screen overlay is intentionally only rendered while
           * there is no preview yet (`!currentVersionId`). Once a website
           * has been generated, follow-up modifications keep the existing
           * iframe visible — the user sees the current version while the
           * builder works, and the iframe reloads with the new bundle when
           * the run completes (UPDATE_PREVIEW handler above).
           */}
          {!currentVersionId && (
            <div className="absolute inset-0 bg-white rounded-lg z-20">
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 px-4">
                <div className="text-center flex-col flex">
                  {isLoading ? (
                    <>
                      <div className="mx-auto mb-10">
                        <LoadingProgressDonut progress={displayProgress} />
                      </div>
                      <span className="text-2xl font-medium mb-2">
                        {t("bringingIdeaToLife")}
                      </span>
                      <LoadingStepMessage
                        message={
                          loadingStep || loadingMessage || t("buildingLayout")
                        }
                      />
                    </>
                  ) : isCheckingLiveRun ? (
                    <div className="mx-auto">
                      <LoadingProgressDonut progress={0} />
                    </div>
                  ) : (
                    <>
                      <img
                        src={sunsetLogoLarge.src}
                        alt={t("logoLargeAlt")}
                        className="mx-auto mb-12"
                      />

                      <span className="text-2xl font-medium mb-2">
                        {t("bringingIdeaToLife")}
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
