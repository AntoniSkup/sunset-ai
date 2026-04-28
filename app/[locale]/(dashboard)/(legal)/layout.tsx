import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { SunsetLogoMenu } from "@/components/nav/sunset-logo-menu";
import { LanguageSwitcher } from "@/components/i18n/language-switcher";

export default async function LegalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const t = await getTranslations("legal.nav");

  return (
    <div className="relative h-full overflow-y-auto bg-white">
      <BackgroundDecor />

      <header className="sticky top-0 z-30 border-b border-gray-200/60 bg-white/65 backdrop-blur-md backdrop-saturate-150 supports-[backdrop-filter]:bg-white/55">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
          <SunsetLogoMenu />
          <nav className="flex items-center gap-1.5">
            <Link
              href="/privacy"
              className="hidden h-9 items-center rounded-full px-3 text-sm font-medium text-gray-600 transition-colors hover:text-gray-900 sm:inline-flex"
            >
              {t("privacy")}
            </Link>
            <Link
              href="/terms"
              className="hidden h-9 items-center rounded-full px-3 text-sm font-medium text-gray-600 transition-colors hover:text-gray-900 sm:inline-flex"
            >
              {t("terms")}
            </Link>
            <Link
              href="/pricing"
              className="hidden h-9 items-center rounded-full px-3 text-sm font-medium text-gray-600 transition-colors hover:text-gray-900 sm:inline-flex"
            >
              {t("pricing")}
            </Link>
            <Link
              href="/"
              className="ml-1 inline-flex h-9 items-center rounded-full bg-gray-900 px-4 text-sm font-medium text-white transition-colors hover:bg-gray-800"
            >
              {t("backToHome")}
            </Link>
          </nav>
        </div>
      </header>

      <main className="relative z-10 mx-auto w-full max-w-3xl px-4 pb-24 pt-12 sm:px-6 sm:pt-16 lg:px-8">
        {children}
      </main>

      <footer className="relative z-10 border-t border-gray-100 py-8">
        <div className="mx-auto flex w-full max-w-3xl flex-col items-center justify-between gap-4 px-4 text-xs text-gray-400 sm:flex-row sm:px-6 lg:px-8">
          <span>© {new Date().getFullYear()} Sunset.</span>
          <div className="flex flex-wrap items-center justify-center gap-4">
            <Link href="/privacy" className="hover:text-gray-700">
              {t("privacy")}
            </Link>
            <Link href="/terms" className="hover:text-gray-700">
              {t("terms")}
            </Link>
            <Link href="/pricing" className="hover:text-gray-700">
              {t("pricing")}
            </Link>
            <LanguageSwitcher />
          </div>
        </div>
      </footer>
    </div>
  );
}

function BackgroundDecor() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 -z-0 isolate overflow-hidden [contain:paint]"
    >
      <div className="absolute inset-0 [background:radial-gradient(60%_50%_at_50%_-10%,rgba(255,138,61,0.14),transparent_70%),radial-gradient(40%_30%_at_85%_5%,rgba(255,99,19,0.10),transparent_70%)]" />
      <div className="absolute inset-0 [background-image:linear-gradient(to_bottom,transparent,white_85%)]" />
    </div>
  );
}

