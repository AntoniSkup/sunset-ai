import { getTranslations } from "next-intl/server";
import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import { SwitchToEnglishLink } from "./_switch-to-english";

export function isLegalPlReviewed(): boolean {
  const flag = process.env.LEGAL_PL_REVIEWED;
  if (typeof flag !== "string") return false;
  const v = flag.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

export async function LegalDraftBanner() {
  if (isLegalPlReviewed()) return null;
  const t = await getTranslations("legal.draftBanner");
  return (
    <div
      role="note"
      className="mb-8 flex items-start gap-3 rounded-2xl border border-amber-300/70 bg-amber-50/90 p-4 text-amber-900 shadow-[0_4px_18px_-10px_rgba(180,83,9,0.15)] backdrop-blur"
    >
      <ExclamationTriangleIcon
        className="mt-0.5 h-5 w-5 shrink-0 text-amber-600"
        aria-hidden="true"
      />
      <div className="space-y-1.5">
        <p className="text-sm font-semibold">{t("title")}</p>
        <p className="text-sm leading-6 text-amber-900/90">
          {t("description")}
        </p>
        <SwitchToEnglishLink />
      </div>
    </div>
  );
}
