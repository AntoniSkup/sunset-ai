"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";

export function SwitchToEnglishLink() {
  const t = useTranslations("legal.draftBanner");
  const pathname = usePathname();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(() => {
          router.replace(pathname, { locale: "en" });
        })
      }
      className="inline-flex items-center text-sm font-medium underline decoration-amber-700/60 underline-offset-4 transition-colors hover:text-amber-700 hover:decoration-amber-700 disabled:opacity-60"
    >
      {t("viewEnglish")}
    </button>
  );
}
