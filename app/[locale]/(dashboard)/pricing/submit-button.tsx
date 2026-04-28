"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ArrowRightIcon, ArrowPathIcon } from "@heroicons/react/24/outline";
import type { VariantProps } from "class-variance-authority";
import { useFormStatus } from "react-dom";
import { buttonVariants } from "@/components/ui/button";

type SubmitButtonProps = {
  label?: string;
  className?: string;
} & VariantProps<typeof buttonVariants>;

export function SubmitButton({
  label,
  className,
  variant = "outline",
  size = "default",
}: SubmitButtonProps) {
  const { pending } = useFormStatus();
  const t = useTranslations("pricing.submit");

  return (
    <Button
      type="submit"
      disabled={pending}
      variant={variant}
      size={size}
      className={cn("w-full rounded-full", className)}
    >
      {pending ? (
        <>
          <ArrowPathIcon className="animate-spin mr-2 h-4 w-4" />
          {t("loading")}
        </>
      ) : (
        <>
          {label ?? t("getStarted")}
          <ArrowRightIcon className="ml-2 h-4 w-4" />
        </>
      )}
    </Button>
  );
}
