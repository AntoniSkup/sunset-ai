import { useTranslations } from "next-intl";

/**
 * Translate a key that's only known at runtime — e.g. `state.errorKey`
 * returned from a server action. The default `useTranslations()` helper
 * is strongly typed against the messages dictionary and refuses arbitrary
 * string keys / refuses params for keys that don't declare placeholders.
 *
 * This wrapper trades that compile-time guarantee for runtime flexibility.
 * If a key is missing in `messages/<locale>.json`, next-intl will surface
 * its standard "missing translation" warning at runtime — same behavior
 * as a static call.
 */
export function useDynamicTranslate(): (
  key: string | null | undefined,
  params?: Record<string, string | number>
) => string | null {
  const t = useTranslations();
  return (key, params) => {
    if (!key) return null;
    return (t as unknown as (k: string, p?: Record<string, unknown>) => string)(
      key,
      params
    );
  };
}
