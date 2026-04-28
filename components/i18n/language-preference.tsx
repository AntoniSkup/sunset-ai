"use client";

import { useLocale, useTranslations } from "next-intl";
import { useTransition } from "react";
import { usePathname, useRouter } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { Button } from "@/components/ui/button";
import { setUserLocale } from "@/app/[locale]/(login)/actions";
import { cn } from "@/lib/utils";

/**
 * Logged-in language preference picker. Persists the selected locale to
 * `users.locale` (so server-side work like emails/AI uses it) AND
 * navigates to the localized URL (so the cookie + `<html lang>` reflect
 * it for the current session).
 */
export function LanguagePreference() {
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function localeLabel(l: (typeof routing.locales)[number]): string {
    // Exhaustive over `routing.locales`. Add a branch when adding a locale.
    if (l === "en") return tCommon("english");
    return tCommon("polish");
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {routing.locales.map((l) => {
          const active = l === locale;
          return (
            <Button
              key={l}
              type="button"
              variant={active ? "default" : "outline"}
              size="sm"
              disabled={pending || active}
              onClick={() => {
                startTransition(async () => {
                  await setUserLocale(l);
                  router.replace(pathname, { locale: l });
                });
              }}
              className={cn(
                "h-9 rounded-full px-4 text-sm font-medium",
                active
                  ? "bg-gray-900 text-white hover:bg-gray-800"
                  : "border-gray-200 text-gray-700 hover:bg-gray-100 hover:text-gray-900"
              )}
            >
              {localeLabel(l)}
            </Button>
          );
        })}
      </div>
    </div>
  );
}
