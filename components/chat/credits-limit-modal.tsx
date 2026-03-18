"use client";

import Link from "next/link";
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

const UPGRADE_FEATURES = [
  "User roles & permissions",
  "Custom domains",
  "Remove the Sunset badge",
  "Downgrade anytime",
  "Credits rollover",
];

export function CreditsLimitModal({ open, onOpenChange }: CreditsLimitModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={true}
        className="bg-[#1a1b1e] border-gray-700 text-white sm:max-w-md"
      >
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-white">
            Daily limit reached
          </DialogTitle>
          <DialogDescription className="text-gray-300 text-sm mt-1">
            You&apos;ve used today&apos;s free credits. Upgrade to keep building.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="rounded-lg bg-[#25262b] border border-gray-600 p-4">
            <p className="text-sm font-medium text-gray-200 mb-1">Upgrade</p>
            <p className="text-2xl font-bold text-white">59 PLN</p>
            <p className="text-xs text-gray-400 mt-0.5">per month incl. VAT</p>
            <p className="text-xs text-gray-400 mt-1">100 credits / month</p>
          </div>

          <div>
            <p className="text-sm font-medium text-gray-200 mb-2">
              You will unlock:
            </p>
            <ul className="space-y-2">
              {UPGRADE_FEATURES.map((feature) => (
                <li
                  key={feature}
                  className="flex items-center gap-2 text-sm text-gray-300"
                >
                  <CheckIcon className="h-4 w-4 text-green-500 shrink-0" />
                  {feature}
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
            Cancel
          </Button>
          <Button asChild className="bg-white text-gray-900 hover:bg-gray-100">
            <Link href="/pricing" onClick={() => onOpenChange(false)}>
              Upgrade
            </Link>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
