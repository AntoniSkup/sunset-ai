"use client";

import { CheckCircle2, AlertTriangle, CircleDashed } from "lucide-react";
import { cn } from "@/lib/utils";

type ValidationFinding = {
  severity?: "critical" | "warning";
  issueCode?: string;
  message?: string;
  path?: string;
};

export interface ValidationReportPayload {
  status?: "pass" | "fail";
  reportType?: "completeness" | "ui_consistency";
  summary?: string;
  score?: number;
  criticalFindings?: ValidationFinding[];
  warningFindings?: ValidationFinding[];
}

export function ValidationReportCard({
  toolName,
  report,
  isPending = false,
  className,
}: {
  toolName?: string;
  report: ValidationReportPayload;
  isPending?: boolean;
  className?: string;
}) {
  const status = report.status ?? (isPending ? "fail" : "pass");
  const isPass = !isPending && status === "pass";
  const inferredReportType =
    report.reportType ??
    (toolName === "validate_ui_consistency"
      ? "ui_consistency"
      : "completeness");
  const isUi = inferredReportType === "ui_consistency";
  const title = isUi ? "UI consistency check" : "Completeness check";
  const criticalCount = report.criticalFindings?.length ?? 0;
  const warningCount = report.warningFindings?.length ?? 0;
  const topFindings = [
    ...(report.criticalFindings ?? []).slice(0, 2),
    ...(report.warningFindings ?? []).slice(0, 1),
  ];

  return (
    <div
      className={cn(
        "rounded-lg border px-3 py-2 text-sm bg-background/70",
        isPass
          ? "border-emerald-300/60"
          : "border-amber-300/60",
        className
      )}
    >
      <div className="flex items-center gap-2">
        {isPending ? (
          <CircleDashed className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : isPass ? (
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
        ) : (
          <AlertTriangle className="h-4 w-4 text-amber-600" />
        )}
        <span className="font-medium">{title}</span>
        {isUi && typeof report.score === "number" && (
          <span className="text-xs text-muted-foreground ml-auto">
            score {report.score}/100
          </span>
        )}
      </div>
      <div className="mt-1 flex items-center gap-2 text-[11px]">
        <span
          className={cn(
            "rounded-full px-2 py-0.5 border",
            isPending
              ? "border-muted-foreground/30 text-muted-foreground"
              : isPass
                ? "border-emerald-300 text-emerald-700"
                : "border-amber-300 text-amber-700"
          )}
        >
          {isPending ? "running" : status}
        </span>
        {!isPending && (
          <>
            <span className="rounded-full px-2 py-0.5 border border-red-200 text-red-700">
              critical {criticalCount}
            </span>
            <span className="rounded-full px-2 py-0.5 border border-amber-200 text-amber-700">
              warnings {warningCount}
            </span>
          </>
        )}
      </div>

      <p className="mt-1 text-xs text-muted-foreground">
        {report.summary ??
          (isPending ? "Running validation..." : "Validation result available.")}
      </p>

      {!isPending && topFindings.length > 0 && (
        <ul className="mt-1 text-xs text-muted-foreground">
          {topFindings.map((f, idx) => (
            <li key={`${f.issueCode || "finding"}-${idx}`}>
              {f.path ? `${f.path}: ` : ""}
              {f.message ?? "Issue detected"}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
