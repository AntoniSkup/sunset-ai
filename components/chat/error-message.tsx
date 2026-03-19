"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  ArrowPathIcon,
  ExclamationCircleIcon,
} from "@heroicons/react/24/outline";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const PUBLIC_SUPPORT =
  typeof process.env.NEXT_PUBLIC_SUPPORT_EMAIL === "string"
    ? process.env.NEXT_PUBLIC_SUPPORT_EMAIL.trim()
    : "";

interface ErrorMessageProps {
  error: string;
  onRetry: () => void;
  errorId: string;
  chatId?: string | null;
}

export function ErrorMessage({
  error,
  onRetry,
  errorId,
  chatId,
}: ErrorMessageProps) {
  const [reportOpen, setReportOpen] = useState(false);
  const [reportText, setReportText] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  function openReport() {
    setSendError(null);
    setSent(false);
    setReportText("");
    setReportOpen(true);
  }

  function buildMailtoBody(userNote: string) {
    return [
      `User note:\n${userNote}`,
      "",
      `Error:\n${error}`,
      errorId ? `Ref: ${errorId}` : "",
      chatId ? `Chat: ${chatId}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  }

  async function submitReport() {
    const note = reportText.trim();
    if (!note) {
      setSendError("Please describe what happened.");
      return;
    }
    setSending(true);
    setSendError(null);
    try {
      const res = await fetch("/api/support/report-chat-error", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: note,
          errorText: error,
          errorId,
          chatId: chatId ?? undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        setSent(true);
        setTimeout(() => {
          setReportOpen(false);
          setSent(false);
          setReportText("");
        }, 1500);
        return;
      }

      if (res.status === 503 && data?.useMailto && PUBLIC_SUPPORT) {
        const subject = encodeURIComponent("Sunset — chat error report");
        const body = encodeURIComponent(buildMailtoBody(note));
        window.location.href = `mailto:${PUBLIC_SUPPORT}?subject=${subject}&body=${body}`;
        setReportOpen(false);
        setReportText("");
        return;
      }

      setSendError(
        typeof data?.error === "string"
          ? data.error
          : "Could not send report. Try again later."
      );
    } catch {
      if (PUBLIC_SUPPORT) {
        const subject = encodeURIComponent("Sunset — chat error report");
        const body = encodeURIComponent(buildMailtoBody(note));
        window.open(
          `mailto:${PUBLIC_SUPPORT}?subject=${subject}&body=${body}`,
          "_blank"
        );
        setReportOpen(false);
        setReportText("");
        return;
      }
      setSendError("Network error. Please try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-start gap-2 rounded-2xl border border-red-500/30 bg-red-500/5 px-3 py-2">
        <ExclamationCircleIcon className="h-4 w-4 mt-0.5 shrink-0 text-red-600" />
        <p className="text-sm flex-1 text-red-900">{error}</p>
      </div>
      <div className="flex items-center justify-end gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={onRetry}
          className="self-start rounded-lg cursor-pointer"
          disabled={!onRetry}
        >
          <ArrowPathIcon className="h-4 w-4 " />
          Retry
        </Button>
        <Button
          type="button"
          variant="default"
          size="sm"
          onClick={openReport}
          className="self-start rounded-lg bg-[#ed7333] text-white hover:bg-[#d9662d]"
        >
          Report
        </Button>
      </div>

      <Dialog open={reportOpen} onOpenChange={setReportOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Report this error</DialogTitle>
            <DialogDescription>
              Tell us what happened. We&apos;ll look into it right away and
              resolve it immidiatelly.
            </DialogDescription>
          </DialogHeader>
          {sent ? (
            <p className="text-sm text-green-600 font-medium py-4">
              Thanks — we&apos;ve received this and will fix it as soon as
              possible.
            </p>
          ) : (
            <>
              <textarea
                className="w-full min-h-[120px] rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                placeholder="Tell us what you were trying to do and what went wrong."
                value={reportText}
                onChange={(e) => setReportText(e.target.value)}
                disabled={sending}
                maxLength={4000}
              />
              {sendError && (
                <p className="text-sm text-destructive">{sendError}</p>
              )}
            </>
          )}
          {!sent && (
            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                onClick={() => setReportOpen(false)}
                disabled={sending}
              >
                Cancel
              </Button>
              <Button
                type="button"
                className="bg-[#ed7333] text-white hover:bg-[#d9662d] ml-2"
                onClick={submitReport}
                disabled={sending}
              >
                {sending ? "Sending…" : "Send"}
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
