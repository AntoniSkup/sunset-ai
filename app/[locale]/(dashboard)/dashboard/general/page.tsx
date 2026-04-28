"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { useDynamicTranslate } from "@/i18n/dynamic-translate";
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
import { ArrowPathIcon, CheckIcon } from "@heroicons/react/24/outline";
import { updateAccount } from "@/app/[locale]/(login)/actions";
import { LanguagePreference } from "@/components/i18n/language-preference";
import type { ActionState as MiddlewareActionState } from "@/lib/auth/middleware";
import { User } from "@/lib/db/schema";
import useSWR from "swr";
import { Suspense } from "react";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

type ActionState = MiddlewareActionState & {
  name?: string;
};

type AccountFormProps = {
  state: ActionState;
  nameValue?: string;
  emailValue?: string;
};

function AccountForm({
  state,
  nameValue = "",
  emailValue = "",
}: AccountFormProps) {
  const tCommon = useTranslations("common");
  const tGen = useTranslations("dashboard.general");
  return (
    <>
      <div>
        <Label htmlFor="name" className="mb-2 text-sm text-gray-700">
          {tCommon("name")}
        </Label>
        <Input
          id="name"
          name="name"
          placeholder={tGen("namePlaceholder")}
          defaultValue={state.name || nameValue}
          required
          className="h-10 rounded-lg border-gray-200 bg-white/70"
        />
      </div>
      <div>
        <Label htmlFor="email" className="mb-2 text-sm text-gray-700">
          {tCommon("email")}
        </Label>
        <Input
          id="email"
          name="email"
          type="email"
          placeholder={tGen("emailPlaceholder")}
          defaultValue={emailValue}
          required
          className="h-10 rounded-lg border-gray-200 bg-white/70"
        />
      </div>
    </>
  );
}

function AccountFormWithData({ state }: { state: ActionState }) {
  const { data: user } = useSWR<User>("/api/user", fetcher);
  return (
    <AccountForm
      state={state}
      nameValue={user?.name ?? ""}
      emailValue={user?.email ?? ""}
    />
  );
}

export default function GeneralPage() {
  const t = useDynamicTranslate();
  const tCommon = useTranslations("common");
  const tGen = useTranslations("dashboard.general");
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    updateAccount,
    {}
  );

  const errorMsg = t(state.errorKey, state.messageParams);
  const successMsg = t(state.successKey, state.messageParams);

  return (
    <section className="flex-1 px-4 py-6 lg:px-8">
      <div className="mx-auto w-full max-w-3xl">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900 sm:text-3xl">
            {tGen("title")}
          </h1>
          <p className="mt-2 text-sm text-gray-500">{tGen("subtitle")}</p>
        </div>

        <Card className="rounded-2xl border border-gray-200 bg-white/80 backdrop-blur shadow-[0_8px_30px_-12px_rgba(15,23,42,0.08)]">
          <CardHeader>
            <CardTitle className="text-base font-semibold tracking-tight text-gray-900">
              {tGen("accountInfoTitle")}
            </CardTitle>
            <CardDescription>{tGen("accountInfoSubtitle")}</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" action={formAction}>
              <Suspense fallback={<AccountForm state={state} />}>
                <AccountFormWithData state={state} />
              </Suspense>
              {errorMsg && <p className="text-sm text-red-500">{errorMsg}</p>}
              {successMsg && (
                <p className="text-sm text-green-600">{successMsg}</p>
              )}
              <Button
                type="submit"
                className="h-10 rounded-full bg-gray-900 px-5 text-sm font-medium text-white hover:bg-gray-800 disabled:bg-gray-200 disabled:text-gray-500"
                disabled={isPending}
              >
                {isPending ? (
                  <>
                    <ArrowPathIcon className="h-4 w-4 animate-spin" />
                    {tCommon("saving")}
                  </>
                ) : (
                  <>
                    <CheckIcon className="h-4 w-4" />
                    {tGen("saveChanges")}
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card className="mt-6 rounded-2xl border border-gray-200 bg-white/80 backdrop-blur shadow-[0_8px_30px_-12px_rgba(15,23,42,0.08)]">
          <CardHeader>
            <CardTitle className="text-base font-semibold tracking-tight text-gray-900">
              {tGen("languageTitle")}
            </CardTitle>
            <CardDescription>{tGen("languageSubtitle")}</CardDescription>
          </CardHeader>
          <CardContent>
            <LanguagePreference />
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
