"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  LockClosedIcon,
  TrashIcon,
  ArrowPathIcon,
} from "@heroicons/react/24/outline";
import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { useDynamicTranslate } from "@/i18n/dynamic-translate";
import { updatePassword, deleteAccount } from "@/app/[locale]/(login)/actions";
import type { ActionState } from "@/lib/auth/middleware";

type PasswordState = ActionState & {
  currentPassword?: string;
  newPassword?: string;
  confirmPassword?: string;
};

type DeleteState = ActionState & {
  password?: string;
};

const cardClass =
  "rounded-2xl border border-gray-200 bg-white/80 backdrop-blur shadow-[0_8px_30px_-12px_rgba(15,23,42,0.08)]";
const inputClass = "h-10 rounded-lg border-gray-200 bg-white/70";

export default function SecurityPage() {
  const t = useDynamicTranslate();
  const tSec = useTranslations("dashboard.security");
  const [passwordState, passwordAction, isPasswordPending] = useActionState<
    PasswordState,
    FormData
  >(updatePassword, {});

  const [deleteState, deleteAction, isDeletePending] = useActionState<
    DeleteState,
    FormData
  >(deleteAccount, {});

  const passwordError = t(passwordState.errorKey, passwordState.messageParams);
  const passwordSuccess = t(
    passwordState.successKey,
    passwordState.messageParams
  );
  const deleteError = t(deleteState.errorKey, deleteState.messageParams);

  return (
    <section className="flex-1 px-4 py-6 lg:px-8">
      <div className="mx-auto w-full max-w-3xl">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900 sm:text-3xl">
            {tSec("title")}
          </h1>
          <p className="mt-2 text-sm text-gray-500">{tSec("subtitle")}</p>
        </div>

        <Card className={`${cardClass} mb-6`}>
          <CardHeader>
            <CardTitle className="text-base font-semibold tracking-tight text-gray-900">
              {tSec("passwordTitle")}
            </CardTitle>
            <CardDescription>{tSec("passwordSubtitle")}</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" action={passwordAction}>
              <div>
                <Label
                  htmlFor="current-password"
                  className="mb-2 text-sm text-gray-700"
                >
                  {tSec("currentPassword")}
                </Label>
                <Input
                  id="current-password"
                  name="currentPassword"
                  type="password"
                  autoComplete="current-password"
                  required
                  minLength={8}
                  maxLength={100}
                  defaultValue={passwordState.currentPassword}
                  className={inputClass}
                />
              </div>
              <div>
                <Label
                  htmlFor="new-password"
                  className="mb-2 text-sm text-gray-700"
                >
                  {tSec("newPassword")}
                </Label>
                <Input
                  id="new-password"
                  name="newPassword"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  maxLength={100}
                  defaultValue={passwordState.newPassword}
                  className={inputClass}
                />
              </div>
              <div>
                <Label
                  htmlFor="confirm-password"
                  className="mb-2 text-sm text-gray-700"
                >
                  {tSec("confirmPassword")}
                </Label>
                <Input
                  id="confirm-password"
                  name="confirmPassword"
                  type="password"
                  required
                  minLength={8}
                  maxLength={100}
                  defaultValue={passwordState.confirmPassword}
                  className={inputClass}
                />
              </div>
              {passwordError && (
                <p className="text-sm text-red-500">{passwordError}</p>
              )}
              {passwordSuccess && (
                <p className="text-sm text-green-600">{passwordSuccess}</p>
              )}
              <Button
                type="submit"
                className="h-10 rounded-full bg-gray-900 px-5 text-sm font-medium text-white hover:bg-gray-800 disabled:bg-gray-200 disabled:text-gray-500"
                disabled={isPasswordPending}
              >
                {isPasswordPending ? (
                  <>
                    <ArrowPathIcon className="h-4 w-4 animate-spin" />
                    {tSec("updating")}
                  </>
                ) : (
                  <>
                    <LockClosedIcon className="h-4 w-4" />
                    {tSec("updatePassword")}
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card
          className={`${cardClass} border-red-200/70 bg-gradient-to-b from-white/80 to-red-50/40`}
        >
          <CardHeader>
            <CardTitle className="text-base font-semibold tracking-tight text-gray-900">
              {tSec("deleteAccountTitle")}
            </CardTitle>
            <CardDescription className="text-red-700/80">
              {tSec("deleteAccountSubtitle")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={deleteAction} className="space-y-4">
              <div>
                <Label
                  htmlFor="delete-password"
                  className="mb-2 text-sm text-gray-700"
                >
                  {tSec("deleteConfirmPassword")}
                </Label>
                <Input
                  id="delete-password"
                  name="password"
                  type="password"
                  required
                  minLength={8}
                  maxLength={100}
                  defaultValue={deleteState.password}
                  className={inputClass}
                />
              </div>
              {deleteError && (
                <p className="text-sm text-red-500">{deleteError}</p>
              )}
              <Button
                type="submit"
                variant="destructive"
                className="h-10 rounded-full bg-red-600 px-5 text-sm font-medium text-white hover:bg-red-700"
                disabled={isDeletePending}
              >
                {isDeletePending ? (
                  <>
                    <ArrowPathIcon className="h-4 w-4 animate-spin" />
                    {tSec("deleting")}
                  </>
                ) : (
                  <>
                    <TrashIcon className="h-4 w-4" />
                    {tSec("deleteAccount")}
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
