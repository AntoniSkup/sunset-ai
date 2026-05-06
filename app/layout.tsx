import "./globals.css";
import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans } from "next/font/google";
import Script from "next/script";
import { getLocale, getTranslations } from "next-intl/server";
import { getUser, getTeamForUser } from "@/lib/db/queries";

import { SWRConfig } from "swr";
import { Analytics } from "@vercel/analytics/next";
import NextTopLoader from "nextjs-toploader";
import { Toaster } from "sonner";
import { absoluteUrl, siteConfig } from "@/lib/seo/site";
import {
  getOgAlternateLocales,
  getOgImageUrl,
  getOgLocale,
  localizedAlternates,
} from "@/lib/seo/metadata";
import { routing, type AppLocale } from "@/i18n/routing";
import { SpeedInsights } from "@vercel/speed-insights/next";

const ibmPlexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-ibm-plex-sans",
});

const gaId = process.env.NEXT_PUBLIC_GA_ID;

function resolveAppLocale(value: string): AppLocale {
  return (routing.locales as readonly string[]).includes(value)
    ? (value as AppLocale)
    : routing.defaultLocale;
}

/**
 * Root metadata. Generated per-request because every value depends on
 * the active locale (title/description copy, og:locale, hreflang
 * alternates). Page-level `generateMetadata` exports merge over these
 * defaults — pages still need their own `alternates` because canonical
 * URLs are per-path.
 */
export async function generateMetadata(): Promise<Metadata> {
  const localeStr = await getLocale();
  const locale = resolveAppLocale(localeStr);
  const tSeo = await getTranslations({ locale, namespace: "seo" });

  const defaultTitle = tSeo("app.defaultTitle");
  const titleTemplate = tSeo("app.titleTemplate");
  const description = tSeo("home.description");
  const ogTitle = tSeo("home.ogTitle");
  const ogDescription = tSeo("home.ogDescription");
  const ogImageAlt = tSeo("home.ogImageAlt");
  const keywords = tSeo("home.keywords")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);

  const ogImageUrl = getOgImageUrl(locale);

  return {
    metadataBase: new URL(siteConfig.url),
    title: {
      default: defaultTitle,
      template: titleTemplate,
    },
    description,
    applicationName: siteConfig.name,
    generator: "Next.js",
    keywords,
    authors: [{ name: siteConfig.legalName, url: siteConfig.url }],
    creator: siteConfig.legalName,
    publisher: siteConfig.legalName,
    category: "technology",
    formatDetection: {
      email: false,
      address: false,
      telephone: false,
    },
    openGraph: {
      type: "website",
      siteName: siteConfig.name,
      title: ogTitle,
      description: ogDescription,
      url: localizedAlternates("/", locale).canonical as string,
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
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        "max-image-preview": "large",
        "max-snippet": -1,
        "max-video-preview": -1,
      },
    },
    // Per-locale canonical + reciprocal hreflang for the home path.
    // Pages override this with their own path; layouts only set the
    // home alternates as a sensible default.
    alternates: localizedAlternates("/", locale),
  };
}

export const viewport: Viewport = {
  maximumScale: 1,
  themeColor: siteConfig.themeColor,
  colorScheme: "light",
};

const organizationJsonLd = (description: string) => ({
  "@context": "https://schema.org",
  "@type": "Organization",
  name: siteConfig.legalName,
  alternateName: siteConfig.name,
  url: siteConfig.url,
  logo: absoluteUrl("/icon.png"),
  description,
});

function buildWebsiteJsonLd(locale: AppLocale, description: string) {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: siteConfig.name,
    url: localizedAlternates("/", locale).canonical,
    description,
    inLanguage: getOgLocale(locale).replace("_", "-"),
    publisher: {
      "@type": "Organization",
      name: siteConfig.legalName,
      url: siteConfig.url,
    },
  };
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Falls back to `routing.defaultLocale` ("pl") for non-localized surfaces
  // (deploy-host route handlers, global not-found) where no locale segment
  // exists. See `i18n/request.ts`.
  const localeStr = await getLocale();
  const locale = resolveAppLocale(localeStr);
  const tSeo = await getTranslations({ locale, namespace: "seo" });
  const description = tSeo("home.description");
  const websiteJsonLd = buildWebsiteJsonLd(locale, description);
  const orgJsonLd = organizationJsonLd(tSeo("app.applicationDescription"));

  return (
    <html
      lang={locale}
      className={`${ibmPlexSans.variable} bg-white dark:bg-gray-950 text-black dark:text-white`}
    >
      <body className={`${ibmPlexSans.className} min-h-[100dvh] bg-[#f8fafc]`}>
        <NextTopLoader
          color="#ff6313"
          height={3}
          showSpinner={false}
          shadow={false}
          easing="ease"
          speed={250}
        />
        <script
          type="application/ld+json"
          suppressHydrationWarning
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(orgJsonLd),
          }}
        />
        <script
          type="application/ld+json"
          suppressHydrationWarning
          dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd) }}
        />
        <Script
          id="Cookiebot"
          src="https://consent.cookiebot.com/uc.js"
          data-cbid="fa66f7ec-cddf-41c1-97bc-cb485fd72ff4"
          strategy="beforeInteractive"
        />
        <SWRConfig
          value={{
            fallback: {
              // We do NOT await here
              // Only components that read this data will suspend
              "/api/user": getUser(),
              "/api/team": getTeamForUser(),
            },
          }}
        >
          {children}
        </SWRConfig>
        <Toaster richColors closeButton />
        <SpeedInsights />
        {gaId ? (
          <>
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`}
              strategy="afterInteractive"
            />
            <Script id="ga-init" strategy="afterInteractive">
              {`
                window.dataLayer = window.dataLayer || [];
                function gtag(){dataLayer.push(arguments);}
                window.gtag = gtag;
                gtag('js', new Date());
                gtag('config', '${gaId}');
              `}
            </Script>
          </>
        ) : null}
        <Analytics />
      </body>
    </html>
  );
}
