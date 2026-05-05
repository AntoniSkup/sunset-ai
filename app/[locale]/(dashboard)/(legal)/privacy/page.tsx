import type { Metadata } from "next";
import { getLocale } from "next-intl/server";
import PrivacyPageEn from "./_en";
import PrivacyPagePl from "./_pl";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  if (locale === "pl") {
    return {
      title: "Polityka prywatności",
      description:
        "Jak Stronka AI zbiera, wykorzystuje i chroni Twoje dane osobowe zgodnie z RODO.",
      alternates: { canonical: "/privacy" },
      robots: { index: true, follow: true },
    };
  }
  return {
    title: "Privacy Policy",
    description:
      "How Stronka AI collects, uses, and protects your personal data under the EU GDPR.",
    alternates: { canonical: "/privacy" },
    robots: { index: true, follow: true },
  };
}

export default async function PrivacyPage() {
  const locale = await getLocale();
  if (locale === "pl") return <PrivacyPagePl />;
  return <PrivacyPageEn />;
}
