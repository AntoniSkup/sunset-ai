import type { routing } from "./i18n/routing";
import type messages from "./messages/en.json";

/**
 * next-intl module augmentation. Narrows the return type of
 * `useLocale()`/`getLocale()` to the configured locale union (`"en" | "pl"`)
 * and gives `useTranslations()` / `getTranslations()` autocomplete on the
 * keys defined in `messages/en.json`.
 *
 * `en.json` is the source of truth for the message shape; `pl.json` and
 * any future locales must mirror its keys.
 */
declare module "next-intl" {
  interface AppConfig {
    Locale: (typeof routing.locales)[number];
    Messages: typeof messages;
  }
}
