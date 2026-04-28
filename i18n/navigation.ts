import { createNavigation } from "next-intl/navigation";
import { routing } from "./routing";

/**
 * Locale-aware navigation primitives. Use these in place of the
 * `next/navigation` and `next/link` originals anywhere we navigate to an
 * internal path:
 *
 *   - `Link`, `useRouter`, `usePathname` keep the active locale when
 *     building/inspecting URLs.
 *   - `redirect(href, locale)` (and `permanentRedirect(href, locale)`)
 *     are SYNCHRONOUS and return `never` — they throw the Next.js
 *     redirect signal, just like `next/navigation`'s `redirect`. This
 *     means TypeScript's control-flow analysis correctly narrows nullable
 *     values after them (something it does NOT do for `await
 *     Promise<never>`, see microsoft/TypeScript#34955). Callers must
 *     resolve the active locale themselves via `await getLocale()` and
 *     pass it in:
 *
 *       const locale = await getLocale();
 *       if (!user) redirect("/sign-in", locale);
 *
 *   - `getPathname({ locale, href })` builds a localized URL
 *     programmatically (e.g. for sitemap `alternates`).
 *
 * `notFound`, `useParams`, etc. should still be imported from
 * `next/navigation` directly — those are locale-agnostic.
 *
 * For redirects to URLs OUTSIDE our app (e.g. Stripe-hosted checkout),
 * use `redirect` from `next/navigation` directly — this helper only
 * understands internal paths.
 */
const intlNav = createNavigation(routing);

export const Link = intlNav.Link;
export const usePathname = intlNav.usePathname;
export const useRouter = intlNav.useRouter;
export const getPathname = intlNav.getPathname;

export function redirect(
  href: string,
  locale: (typeof routing.locales)[number]
): never {
  intlNav.redirect({ href, locale });
  // Unreachable: `intlNav.redirect` throws Next.js's redirect signal.
  throw new Error("redirect returned");
}

export function permanentRedirect(
  href: string,
  locale: (typeof routing.locales)[number]
): never {
  intlNav.permanentRedirect({ href, locale });
  throw new Error("permanentRedirect returned");
}
