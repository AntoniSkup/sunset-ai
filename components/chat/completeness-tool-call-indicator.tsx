"use client";

import { useTranslations } from "next-intl";
import { CircleDashed, ListChecks } from "lucide-react";
import { cn } from "@/lib/utils";

export function CompletenessToolCallIndicator({
  className,
}: {
  className?: string;
}) {
  const t = useTranslations("builder.completeness");
  return (
    <div
      className={cn(
        "rounded-lg border border-blue-300/60 bg-blue-50/50 px-3 py-2 text-sm",
        className
      )}
    >
      <div className="flex items-center gap-2">
        <CircleDashed className="h-4 w-4 animate-spin text-blue-700" />
        <span className="font-medium text-blue-900">{t("title")}</span>
        <span className="ml-auto rounded-full border border-blue-300 px-2 py-0.5 text-[11px] text-blue-800">
          {t("requiredBadge")}
        </span>
      </div>

      <div className="mt-1 flex items-center gap-2 text-xs text-blue-800/80">
        <ListChecks className="h-3.5 w-3.5" />
        <span>{t("detail")}</span>
      </div>
    </div>
  );
}
