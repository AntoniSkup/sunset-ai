import { defineRouting } from "next-intl/routing";

/**
 * Locale routing config for the app.
 *
 * - `pl` is the default and is served at bare paths (`/`, `/dashboard`, ...).
 *   This matches the brand identity (Polish-first product) and gives the
 *   primary search audience the canonical, no-prefix URL.
 * - `en` is opt-in and prefixed (`/en`, `/en/dashboard`, ...).
 *
 * `localePrefix: "as-needed"` means the default locale has no prefix,
 * while every other locale is always prefixed. Switching the default
 * later is a config change here, not a folder move.
 *
 * NOTE: locale routing only applies to routes living under `app/[locale]/`.
 * Host-bound surfaces are explicitly bypassed in `middleware.ts`:
 *   - the deploy host (stronkaai-deploy.com) and its `/p/*`, `/s/*` shells
 *   - the screenshot-tunnel host (ngrok in dev)
 *   - `/api/*`
 */
export const routing = defineRouting({
  locales: ["en", "pl"] as const,
  defaultLocale: "pl",
  localePrefix: "as-needed",
  localeCookie: {
    name: "NEXT_LOCALE",
    maxAge: 60 * 60 * 24 * 365,
  },
});

export type AppLocale = (typeof routing.locales)[number];
