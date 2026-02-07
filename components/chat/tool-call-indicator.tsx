"use client";

import React from "react";
import { Loader2, FileCode, CheckCircle2 } from "lucide-react";
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
        "inline-flex items-center gap-2 px-3 py-1.5 rounded-md hover:bg-muted text-muted-foreground text-sm my-2",
        className
      )}
    >
      {isComplete ? (
        <>
          <CheckCircle2 className="h-4 w-4 text-green-600" />
          <span className="text-sm text-black">Wrote</span>
          <FileCode className="h-4 w-4" />
          <span className="font-mono text-xs">{file}</span>
        </>
      ) : (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm text-black">Writing</span>
          <FileCode className="h-4 w-4" />
          <span className="font-mono text-xs">{file}</span>
        </>
      )}
    </div>
  );
}
