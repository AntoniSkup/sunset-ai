import type { Metadata } from "next";
import { getLocale } from "next-intl/server";
import TermsPageEn from "./_en";
import TermsPagePl from "./_pl";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  if (locale === "pl") {
    return {
      title: "Warunki korzystania",
      description:
        "Warunki korzystania regulujące dostęp do platformy Sunset Builder oraz korzystanie z niej.",
      alternates: { canonical: "/terms" },
      robots: { index: true, follow: true },
    };
  }
  return {
    title: "Terms of Use",
    description:
      "Terms of Use governing your access to and use of the Sunset Builder platform.",
    alternates: { canonical: "/terms" },
    robots: { index: true, follow: true },
  };
}

export default async function TermsPage() {
  const locale = await getLocale();
  if (locale === "pl") return <TermsPagePl />;
  return <TermsPageEn />;
}
