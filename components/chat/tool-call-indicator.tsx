"use client";

import React from "react";
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

function getFriendlyTarget(toolName: string, fileName: string): string {
  const raw = (fileName || "").trim();
  const normalized = raw.toLowerCase();

  if (toolName === "resolve_image_slots") return "page visuals";
  if (toolName === "validate_completeness") return "site completeness";
  if (toolName === "validate_ui_consistency") return "UI consistency";

  if (
    normalized.endsWith("landing/index.tsx") ||
    normalized.endsWith("landing/index.html")
  ) {
    return "page structure";
  }

  const sectionMatch = raw.match(/landing\/sections\/([^/]+)$/i);
  if (sectionMatch?.[1]) {
    return `${humanizeName(sectionMatch[1])} section`;
  }

  const pageMatch = raw.match(/landing\/pages\/([^/]+)$/i);
  if (pageMatch?.[1]) {
    return `${humanizeName(pageMatch[1])} page`;
  }

  if (raw) {
    const name = humanizeName(raw.split("/").pop() || raw);
    if (/navbar|footer|hero|about|products|features|process|testimonials|cta/i.test(name)) {
      return `${name} section`;
    }
    return name.toLowerCase();
  }

  if (toolName === "create_section") return "section";
  if (toolName === "create_site") return "page structure";
  return "page update";
}

function getActionLabel(
  toolName: string,
  target: string,
  isComplete: boolean
): string {
  if (toolName === "resolve_image_slots") {
    return `${isComplete ? "Prepared" : "Preparing"} ${target}`;
  }
  if (toolName === "validate_completeness" || toolName === "validate_ui_consistency") {
    return `${isComplete ? "Checked" : "Checking"} ${target}`;
  }
  return `${isComplete ? "Built" : "Building"} ${target}`;
}

function getContentIcon(toolName: string, target: string): React.ReactNode {
  const normalizedTarget = target.trim().toLowerCase();

  if (toolName === "resolve_image_slots" || normalizedTarget === "page visuals") {
    return <PhotoIcon className="h-4 w-4 text-muted-foreground" />;
  }

  if (normalizedTarget === "page structure") {
    return <FormInput className="h-4 w-4 text-muted-foreground" />;
  }

  if (normalizedTarget === "home page") {
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
  const isValidationTool =
    toolName === "validate_completeness" ||
    toolName === "validate_ui_consistency";
  const target = getFriendlyTarget(toolName, fileName);
  const actionText = getActionLabel(toolName, target, isComplete);

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
        {isComplete ? "Done" : "In progress"}
      </span>
    </div>
  );
}
