"use client";

import React from "react";
import {
  ArrowPathIcon,
  CodeBracketSquareIcon,
  CheckCircleIcon,
} from "@heroicons/react/24/outline";
import { cn } from "@/lib/utils";

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
  const file =
    fileName ||
    (toolName === "create_site"
      ? "landing/index.html"
      : toolName === "create_section"
        ? "landing/sections/section.html"
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
          <CheckCircleIcon className="h-4 w-4 text-green-600" />
          <span className="text-sm text-black">Wrote</span>
          <CodeBracketSquareIcon className="h-4 w-4" />
          <span className="font-mono text-xs">{file}</span>
        </>
      ) : (
        <>
          <ArrowPathIcon className="h-4 w-4 animate-spin" />
          <span className="text-sm text-black">Writing</span>
          <CodeBracketSquareIcon className="h-4 w-4" />
          <span className="font-mono text-xs">{file}</span>
        </>
      )}
    </div>
  );
}
