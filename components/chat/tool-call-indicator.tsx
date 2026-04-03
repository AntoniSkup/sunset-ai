"use client";

import React from "react";
import {
  ArrowPathIcon,
  CodeBracketSquareIcon,
  ShieldCheckIcon,
} from "@heroicons/react/24/outline";
import { cn } from "@/lib/utils";
import { CheckCircleIcon  } from '@heroicons/react/24/solid';

interface ToolCallIndicatorProps {
  toolName: string;
  fileName: string;
  isComplete: boolean;
  className?: string;
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
  const file =
    fileName ||
    (toolName === "create_site"
      ? "landing/index.html"
      : toolName === "create_section"
        ? "landing/sections/section.html"
        : toolName === "validate_completeness"
          ? "site completeness"
          : toolName === "validate_ui_consistency"
            ? "ui consistency"
        : "file");

  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 px-3 py-1.5 rounded-md hover:bg-muted text-muted-foreground text-sm",
        className
      )}
    >
      {isComplete ? (
        <>
          <CheckCircleIcon  className="h-4 w-4 text-[#f87c07] " strokeWidth={1.5} />
          <span className="text-sm text-black">
            {isValidationTool ? "Checked" : "Wrote"}
          </span>
          {isValidationTool ? (
            <ShieldCheckIcon className="h-4 w-4" />
          ) : (
            <CodeBracketSquareIcon className="h-4 w-4" />
          )}
          <span className="font-mono text-xs">{file}</span>
        </>
      ) : (
        <>
          <ArrowPathIcon className="h-4 w-4 animate-spin" />
          <span className="text-sm text-black">
            {isValidationTool ? "Checking" : "Writing"}
          </span>
          {isValidationTool ? (
            <ShieldCheckIcon className="h-4 w-4" />
          ) : (
            <CodeBracketSquareIcon className="h-4 w-4" />
          )}
          <span className="font-mono text-xs">{file}</span>
        </>
      )}
    </div>
  );
}
