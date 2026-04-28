import type { Metadata } from "next";
import LandingPage from "./landing-page";
import { absoluteUrl, siteConfig } from "@/lib/seo/site";

const fullTitle = `${siteConfig.name} — ${siteConfig.tagline}`;
const pageDescription = siteConfig.description;
const pageUrl = absoluteUrl("/");
const ogImageUrl = absoluteUrl(siteConfig.ogImagePath);

export const metadata: Metadata = {
  title: {
    absolute: fullTitle,
  },
  description: pageDescription,
  keywords: [...siteConfig.keywords],
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    url: pageUrl,
    siteName: siteConfig.name,
    title: fullTitle,
    description: siteConfig.shortDescriptionSocial,
    locale: siteConfig.locale,
    images: [
      {
        url: ogImageUrl,
        width: 1200,
        height: 630,
        alt: `${siteConfig.name} — ${siteConfig.shortDescription}`,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: fullTitle,
    description: siteConfig.shortDescriptionSocial,
    images: [ogImageUrl],
  },
};

export default function Page() {
  const softwareApplicationLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: siteConfig.name,
    alternateName: siteConfig.legalName,
    applicationCategory: "WebApplication",
    operatingSystem: "Web",
    url: pageUrl,
    description: pageDescription,
    image: ogImageUrl,
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
