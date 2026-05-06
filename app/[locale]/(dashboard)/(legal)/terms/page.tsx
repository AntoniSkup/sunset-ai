import type { Metadata } from "next";
import { getLocale } from "next-intl/server";
import TermsPageEn from "./_en";
import TermsPagePl from "./_pl";
import {
  getOgAlternateLocales,
  getOgImageUrl,
  getOgLocale,
  localizedAlternates,
} from "@/lib/seo/metadata";
import { routing, type AppLocale } from "@/i18n/routing";
import { siteConfig } from "@/lib/seo/site";

function resolveAppLocale(value: string): AppLocale {
  return (routing.locales as readonly string[]).includes(value)
    ? (value as AppLocale)
    : routing.defaultLocale;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale: localeParam } = await params;
  const locale = resolveAppLocale(localeParam);
  const alternates = localizedAlternates("/terms", locale);
  const ogImageUrl = getOgImageUrl(locale);

  const title = locale === "pl" ? "Warunki korzystania" : "Terms of Use";
  const description =
    locale === "pl"
      ? "Warunki korzystania regulujące dostęp do platformy Stronka AI oraz korzystanie z niej."
      : "Terms of Use governing your access to and use of the Stronka AI platform.";

  return {
    title,
    description,
    alternates,
    robots: { index: true, follow: true },
    openGraph: {
      type: "article",
      url: alternates.canonical as string,
      siteName: siteConfig.name,
      title,
      description,
      locale: getOgLocale(locale),
      alternateLocale: getOgAlternateLocales(locale),
      images: [{ url: ogImageUrl, width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImageUrl],
    },
  };
}

export default async function TermsPage() {
  const locale = await getLocale();
  if (locale === "pl") return <TermsPagePl />;
  return <TermsPageEn />;
}
