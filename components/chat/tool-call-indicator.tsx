"use client";

import React from "react";
import { useTranslations } from "next-intl";
import {
  ArrowPathIcon,
  PhotoIcon,
  SparklesIcon,
  Squares2X2Icon,
  ShieldCheckIcon,
} from "@heroicons/react/24/outline";
import { FormInput } from "lucide-react";
import { cn } from "@/lib/utils";
import { CheckCircleIcon } from "@heroicons/react/24/solid";

interface ToolCallIndicatorProps {
  toolName: string;
  fileName: string;
  isComplete: boolean;
  className?: string;
}

type ToolCallTranslator = ReturnType<typeof useTranslations<"builder.toolCall">>;

function humanizeName(value: string): string {
  const withoutExt = value.replace(/\.[a-z0-9]+$/i, "");
  const spaced = withoutExt
    .replace(/[-_]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
  if (!spaced) return value;
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function getFriendlyTarget(
  toolName: string,
  fileName: string,
  t: ToolCallTranslator
): string {
  const raw = (fileName || "").trim();
  const normalized = raw.toLowerCase();

  if (toolName === "resolve_image_slots") return t("targetPageVisuals");
  if (toolName === "validate_completeness") return t("targetSiteCompleteness");
  if (toolName === "validate_ui_consistency") return t("targetUiConsistency");

  if (
    normalized.endsWith("landing/index.tsx") ||
    normalized.endsWith("landing/index.html")
  ) {
    return t("targetPageStructure");
  }

  const sectionMatch = raw.match(/landing\/sections\/([^/]+)$/i);
  if (sectionMatch?.[1]) {
    return t("targetSectionSuffix", { name: humanizeName(sectionMatch[1]) });
  }

  const pageMatch = raw.match(/landing\/pages\/([^/]+)$/i);
  if (pageMatch?.[1]) {
    return t("targetPageSuffix", { name: humanizeName(pageMatch[1]) });
  }

  if (raw) {
    const name = humanizeName(raw.split("/").pop() || raw);
    if (
      /navbar|footer|hero|about|products|features|process|testimonials|cta/i.test(
        name
      )
    ) {
      return t("targetSectionSuffix", { name });
    }
    return name.toLowerCase();
  }

  if (toolName === "create_section") return t("targetSection");
  if (toolName === "create_site") return t("targetPageStructure");
  return t("targetPageUpdate");
}

function getActionLabel(
  toolName: string,
  target: string,
  isComplete: boolean,
  t: ToolCallTranslator
): string {
  if (toolName === "resolve_image_slots") {
    return isComplete
      ? t("actionPrepared", { target })
      : t("actionPreparing", { target });
  }
  if (
    toolName === "validate_completeness" ||
    toolName === "validate_ui_consistency"
  ) {
    return isComplete
      ? t("actionChecked", { target })
      : t("actionChecking", { target });
  }
  return isComplete
    ? t("actionBuilt", { target })
    : t("actionBuilding", { target });
}

function getContentIcon(toolName: string, target: string): React.ReactNode {
  const normalizedTarget = target.trim().toLowerCase();

  if (
    toolName === "resolve_image_slots" ||
    /page visuals|grafiki strony/.test(normalizedTarget)
  ) {
    return <PhotoIcon className="h-4 w-4 text-muted-foreground" />;
  }

  if (/page structure|struktura strony/.test(normalizedTarget)) {
    return <FormInput className="h-4 w-4 text-muted-foreground" />;
  }

  if (/home page|strona główna/.test(normalizedTarget)) {
    return <Squares2X2Icon className="h-4 w-4 text-muted-foreground" />;
  }

  if (
    toolName === "validate_completeness" ||
    toolName === "validate_ui_consistency"
  ) {
    return <ShieldCheckIcon className="h-4 w-4 text-muted-foreground" />;
  }

  return <SparklesIcon className="h-4 w-4 text-muted-foreground" />;
}

export function ToolCallIndicator({
  toolName,
  fileName,
  isComplete,
  className,
}: ToolCallIndicatorProps) {
  const t = useTranslations("builder.toolCall");
  const target = getFriendlyTarget(toolName, fileName, t);
  const actionText = getActionLabel(toolName, target, isComplete, t);

  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-sm",
        className
      )}
    >
      {isComplete ? (
        <CheckCircleIcon className="h-4 w-4 text-[#f87c07]" strokeWidth={1.5} />
      ) : (
        <ArrowPathIcon className="h-4 w-4 animate-spin text-muted-foreground" />
      )}
      <span className="text-sm text-foreground">{actionText}</span>
      {getContentIcon(toolName, target)}
      <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
        {isComplete ? t("statusDone") : t("statusInProgress")}
      </span>
    </div>
  );
}
