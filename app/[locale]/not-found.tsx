import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { LanguageSwitcher } from "@/components/i18n/language-switcher";
import { StatusPageShell } from "@/components/status-page-shell";

export default async function LocaleNotFound() {
  const t = await getTranslations("notFound");
  const tCommon = await getTranslations("common");

  return (
    <StatusPageShell
      eyebrow="404"
      title={t("title")}
      description={t("description")}
      headerLogo={
        <Link href="/" className="inline-flex shrink-0 transition-opacity hover:opacity-80">
          <img
            src="/sunset-logo.png"
            alt={tCommon("appName")}
            className="h-8 w-auto object-contain"
          />
        </Link>
      }
      headerAction={
        <Link
          href="/"
          className="inline-flex h-9 items-center rounded-full bg-gray-900 px-4 text-sm font-medium text-white transition-colors hover:bg-gray-800"
        >
          {t("backHome")}
        </Link>
      }
      footerExtra={<LanguageSwitcher />}
    />
  );
}
