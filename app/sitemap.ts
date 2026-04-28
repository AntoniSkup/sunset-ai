import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/seo/site";
import { routing } from "@/i18n/routing";

/**
 * Public sitemap. Each indexable path is emitted once at its canonical
 * (default-locale) URL and includes `alternates.languages` mapping every
 * configured locale to its localized URL plus an `x-default` pointing at
 * the default locale. This is what Google reads to surface the right
 * page per searcher language.
 *
 * The locale-prefixing rule mirrors `localePrefix: "as-needed"` in
 * `i18n/routing.ts`: the default locale is served at the bare path,
 * non-default locales get a `/<locale>` prefix.
 */
function localizedUrl(path: string, locale: string): string {
  if (locale === routing.defaultLocale) return absoluteUrl(path);
  const trimmed = path === "/" ? "" : path;
  return absoluteUrl(`/${locale}${trimmed}`);
}

function languagesFor(path: string): Record<string, string> {
  const languages: Record<string, string> = {
    "x-default": localizedUrl(path, routing.defaultLocale),
  };
  for (const locale of routing.locales) {
    languages[locale] = localizedUrl(path, locale);
  }
  return languages;
}

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  const indexable: Array<{
    path: string;
    changeFrequency: "weekly" | "monthly" | "yearly";
    priority: number;
  }> = [
    { path: "/", changeFrequency: "weekly", priority: 1 },
    { path: "/pricing", changeFrequency: "monthly", priority: 0.8 },
    { path: "/privacy", changeFrequency: "yearly", priority: 0.3 },
    { path: "/terms", changeFrequency: "yearly", priority: 0.3 },
  ];

  return indexable.map(({ path, changeFrequency, priority }) => ({
    url: localizedUrl(path, routing.defaultLocale),
    lastModified: now,
    changeFrequency,
    priority,
    alternates: { languages: languagesFor(path) },
  }));
}
