import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import LandingPage from "./landing-page";
import { absoluteUrl, siteConfig } from "@/lib/seo/site";
import {
  getOgAlternateLocales,
  getOgImageUrl,
  getOgLocale,
  localizedAlternates,
  localizedUrl,
} from "@/lib/seo/metadata";
import { routing, type AppLocale } from "@/i18n/routing";

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
  const tSeo = await getTranslations({ locale, namespace: "seo" });

  const title = tSeo("home.title");
  const description = tSeo("home.description");
  const ogTitle = tSeo("home.ogTitle");
  const ogDescription = tSeo("home.ogDescription");
  const ogImageAlt = tSeo("home.ogImageAlt");
  const keywords = tSeo("home.keywords")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);

  const alternates = localizedAlternates("/", locale);
  const ogImageUrl = getOgImageUrl(locale);

  return {
    title: { absolute: title },
    description,
    keywords,
    alternates,
    openGraph: {
      type: "website",
      url: alternates.canonical as string,
      siteName: siteConfig.name,
      title: ogTitle,
      description: ogDescription,
      locale: getOgLocale(locale),
      alternateLocale: getOgAlternateLocales(locale),
      images: [
        {
          url: ogImageUrl,
          width: 1200,
          height: 630,
          alt: ogImageAlt,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: ogTitle,
      description: ogDescription,
      images: [ogImageUrl],
    },
  };
}

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: localeParam } = await params;
  const locale = resolveAppLocale(localeParam);
  const tSeo = await getTranslations({ locale, namespace: "seo" });

  const description = tSeo("home.description");
  const pageUrl = localizedUrl("/", locale);
  const ogImageUrl = getOgImageUrl(locale);

  const softwareApplicationLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: siteConfig.name,
    alternateName: siteConfig.legalName,
    applicationCategory: "WebApplication",
    operatingSystem: "Web",
    url: pageUrl,
    description,
    image: ogImageUrl,
    inLanguage: getOgLocale(locale).replace("_", "-"),
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
      availability: "https://schema.org/InStock",
      url: absoluteUrl("/pricing"),
    },
    creator: {
      "@type": "Organization",
      name: siteConfig.legalName,
      url: siteConfig.url,
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        suppressHydrationWarning
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(softwareApplicationLd),
        }}
      />
      <LandingPage />
    </>
  );
}
