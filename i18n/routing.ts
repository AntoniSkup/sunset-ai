import { defineRouting } from "next-intl/routing";

/**
 * Locale routing config for the app.
 *
 * - `en` is the default and is served at bare paths (`/`, `/dashboard`, ...).
 * - `pl` is opt-in and prefixed (`/pl`, `/pl/dashboard`, ...).
 *
 * `localePrefix: "as-needed"` means the default locale (`en`) has no prefix,
 * while `pl` is always prefixed. Switching the default later is a config
 * change here, not a folder move.
 *
 * NOTE: locale routing only applies to routes living under `app/[locale]/`.
 * Host-bound surfaces are explicitly bypassed in `middleware.ts`:
 *   - the deploy host (sunset-deploy.com) and its `/p/*`, `/s/*` shells
 *   - the screenshot-tunnel host (ngrok in dev)
 *   - `/api/*`
 */
export const routing = defineRouting({
  locales: ["en", "pl"] as const,
  defaultLocale: "en",
  localePrefix: "as-needed",
  localeCookie: {
    name: "NEXT_LOCALE",
    maxAge: 60 * 60 * 24 * 365,
  },
});

export type AppLocale = (typeof routing.locales)[number];
