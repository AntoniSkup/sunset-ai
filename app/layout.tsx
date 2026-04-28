import "./globals.css";
import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans } from "next/font/google";
import Script from "next/script";
import { getUser, getTeamForUser } from "@/lib/db/queries";

import { SWRConfig } from "swr";
import { Analytics } from "@vercel/analytics/next";
import { Toaster } from "sonner";
import { absoluteUrl, siteConfig } from "@/lib/seo/site";

const ibmPlexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-ibm-plex-sans",
});

const gaId = process.env.NEXT_PUBLIC_GA_ID;

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.url),
  title: {
    default: `${siteConfig.name} — ${siteConfig.tagline}`,
    template: `%s — ${siteConfig.name}`,
  },
  description: siteConfig.description,
  applicationName: siteConfig.name,
  generator: "Next.js",
  keywords: [...siteConfig.keywords],
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
    title: `${siteConfig.name} — ${siteConfig.tagline}`,
    description: siteConfig.shortDescriptionSocial,
    url: siteConfig.url,
    locale: siteConfig.locale,
    images: [
      {
        url: siteConfig.ogImagePath,
        width: 1200,
        height: 630,
        alt: `${siteConfig.name} — ${siteConfig.shortDescription}`,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: `${siteConfig.name} — ${siteConfig.tagline}`,
    description: siteConfig.shortDescriptionSocial,
    images: [siteConfig.ogImagePath],
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
  alternates: {
    canonical: "/",
  },
};

export const viewport: Viewport = {
  maximumScale: 1,
  themeColor: siteConfig.themeColor,
  colorScheme: "light",
};

const organizationJsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: siteConfig.legalName,
  alternateName: siteConfig.name,
  url: siteConfig.url,
  logo: absoluteUrl("/icon.png"),
  description: siteConfig.description,
};

const websiteJsonLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: siteConfig.name,
  url: siteConfig.url,
  description: siteConfig.description,
  inLanguage: "en",
  publisher: {
    "@type": "Organization",
    name: siteConfig.legalName,
    url: siteConfig.url,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${ibmPlexSans.variable} bg-white dark:bg-gray-950 text-black dark:text-white`}
    >
      <body className={`${ibmPlexSans.className} min-h-[100dvh] bg-[#f8fafc]`}>
        <script
          type="application/ld+json"
          suppressHydrationWarning
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(organizationJsonLd),
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
