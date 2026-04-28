"use client";

import { useTranslations } from "next-intl";

export function WelcomeMessage() {
  const t = useTranslations("builder.welcome");
  return (
    <div className="flex flex-col items-center justify-center h-full p-8 text-center">
      <h2 className="text-2xl font-semibold mb-3">{t("title")}</h2>
      <p className="text-muted-foreground mb-8 max-w-md text-base">
        {t("subtitle")}
      </p>
      <div className="flex flex-col gap-3 text-sm">
        <p className="text-muted-foreground font-medium">{t("tryExamples")}</p>
        <ul className="flex flex-col gap-2 text-left max-w-md">
          <li className="flex items-start gap-2">
            <span className="text-muted-foreground mt-0.5">•</span>
            <span className="text-foreground">{t("example1")}</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-muted-foreground mt-0.5">•</span>
            <span className="text-foreground">{t("example2")}</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-muted-foreground mt-0.5">•</span>
            <span className="text-foreground">{t("example3")}</span>
          </li>
        </ul>
      </div>
    </div>
  );
}
