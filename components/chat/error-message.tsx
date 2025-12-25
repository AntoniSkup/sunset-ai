"use client";

import { Button } from "@/components/ui/button";
import { AlertCircle } from "lucide-react";

interface ErrorMessageProps {
  error: string;
  onRetry: () => void;
}

export function ErrorMessage({ error, onRetry }: ErrorMessageProps) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-start gap-2">
        <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
        <p className="text-sm flex-1">{error}</p>
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={onRetry}
        className="self-start"
      >
        Retry
      </Button>
    </div>
  );
}
