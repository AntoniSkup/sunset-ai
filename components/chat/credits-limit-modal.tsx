"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CheckIcon } from "@heroicons/react/24/solid";

interface CreditsLimitModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const UPGRADE_FEATURE_KEYS = [
  "userRoles",
  "customDomains",
  "removeBadge",
  "downgradeAnytime",
  "creditsRollover",
] as const;

// Hardcoded for now — should come from billing config eventually.
const UPGRADE_PRICE = "59 PLN";
const UPGRADE_CREDITS = 100;

export function CreditsLimitModal({
  open,
  onOpenChange,
}: CreditsLimitModalProps) {
  const t = useTranslations("builder.creditsLimit");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={true}
        className="bg-[#1a1b1e] border-gray-700 text-white sm:max-w-md"
      >
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-white">
            {t("title")}
          </DialogTitle>
          <DialogDescription className="text-gray-300 text-sm mt-1">
            {t("description")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="rounded-lg bg-[#25262b] border border-gray-600 p-4">
            <p className="text-sm font-medium text-gray-200 mb-1">
              {t("upgradeLabel")}
            </p>
            <p className="text-2xl font-bold text-white">{UPGRADE_PRICE}</p>
            <p className="text-xs text-gray-400 mt-0.5">{t("perMonthVat")}</p>
            <p className="text-xs text-gray-400 mt-1">
              {t("creditsPerMonth", { credits: UPGRADE_CREDITS })}
            </p>
          </div>

          <div>
            <p className="text-sm font-medium text-gray-200 mb-2">
              {t("youWillUnlock")}
            </p>
            <ul className="space-y-2">
              {UPGRADE_FEATURE_KEYS.map((key) => (
                <li
                  key={key}
                  className="flex items-center gap-2 text-sm text-gray-300"
                >
                  <CheckIcon className="h-4 w-4 text-green-500 shrink-0" />
                  {t(`features.${key}`)}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <DialogFooter className="flex-row gap-2 sm:justify-end mt-4">
          <Button
            type="button"
            variant="secondary"
            className="bg-gray-700 text-gray-200 hover:bg-gray-600"
            onClick={() => onOpenChange(false)}
          >
            {t("cancel")}
          </Button>
          <Button asChild className="bg-white text-gray-900 hover:bg-gray-100">
            <Link href="/pricing" onClick={() => onOpenChange(false)}>
              {t("upgradeCta")}
            </Link>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
