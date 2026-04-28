"use client";

import { useTranslations } from "next-intl";
import {
  ArrowPathIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/outline";

export type UploadProgressToastState = {
  status: "uploading" | "success" | "error";
  total: number;
  completed: number;
  message?: string;
};

interface UploadProgressToastProps {
  toast: UploadProgressToastState | null;
}

export function UploadProgressToast({ toast }: UploadProgressToastProps) {
  const t = useTranslations("builder.uploadToast");
  if (!toast) return null;

  const progress = Math.min(
    100,
    Math.round((toast.completed / Math.max(toast.total, 1)) * 100)
  );

  const titleByStatus = {
    uploading: t("uploadingFiles"),
    success: t("uploadFinished"),
    error: t("uploadFailedTitle"),
  } as const;

  return (
    <div className="fixed bottom-5 right-5 z-50 w-80 rounded-lg border bg-background p-3 shadow-lg">
      <div className="flex items-start gap-2">
        {toast.status === "uploading" ? (
          <ArrowPathIcon className="mt-0.5 h-4 w-4 animate-spin text-muted-foreground" />
        ) : toast.status === "success" ? (
          <CheckCircleIcon className="mt-0.5 h-4 w-4 text-emerald-600" />
        ) : (
          <ExclamationTriangleIcon className="mt-0.5 h-4 w-4 text-destructive" />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{titleByStatus[toast.status]}</p>
          <p className="text-xs text-muted-foreground">
            {toast.message ??
              t("countOfTotal", {
                completed: toast.completed,
                total: toast.total,
              })}
          </p>
          <div className="mt-2 h-1.5 w-full rounded-full bg-muted">
            <div
              className={`h-full rounded-full transition-all ${
                toast.status === "error" ? "bg-destructive" : "bg-primary"
              }`}
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
