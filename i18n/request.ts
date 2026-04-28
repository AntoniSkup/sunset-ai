import { getRequestConfig } from "next-intl/server";
import { hasLocale } from "next-intl";
import { routing } from "./routing";

/**
 * Per-request next-intl config. Resolves the active locale from the
 * URL segment (set by `app/[locale]/layout.tsx`) and loads the matching
 * messages bundle.
 *
 * For Phase 1 we ship the whole bundle per request because the dictionary
 * is small. Switch to per-namespace `pick`-style loading later if bundle
 * size starts mattering.
 */
export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested)
    ? requested
    : routing.defaultLocale;

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
