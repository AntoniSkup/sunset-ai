"use client";

import { useActionState } from "react";
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
import { updateAccount } from "@/app/(login)/actions";
import { User } from "@/lib/db/schema";
import useSWR from "swr";
import { Suspense } from "react";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

type ActionState = {
  name?: string;
  error?: string;
  success?: string;
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
  return (
    <>
      <div>
        <Label htmlFor="name" className="mb-2 text-sm text-gray-700">
          Name
        </Label>
        <Input
          id="name"
          name="name"
          placeholder="Enter your name"
          defaultValue={state.name || nameValue}
          required
          className="h-10 rounded-lg border-gray-200 bg-white/70"
        />
      </div>
      <div>
        <Label htmlFor="email" className="mb-2 text-sm text-gray-700">
          Email
        </Label>
        <Input
          id="email"
          name="email"
          type="email"
          placeholder="Enter your email"
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
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    updateAccount,
    {}
  );

  return (
    <section className="flex-1 px-4 py-6 lg:px-8">
      <div className="mx-auto w-full max-w-3xl">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900 sm:text-3xl">
            General settings
          </h1>
          <p className="mt-2 text-sm text-gray-500">
            Update your account information and personal details.
          </p>
        </div>

        <Card className="rounded-2xl border border-gray-200 bg-white/80 backdrop-blur shadow-[0_8px_30px_-12px_rgba(15,23,42,0.08)]">
          <CardHeader>
            <CardTitle className="text-base font-semibold tracking-tight text-gray-900">
              Account information
            </CardTitle>
            <CardDescription>
              This information is visible to your teammates.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" action={formAction}>
              <Suspense fallback={<AccountForm state={state} />}>
                <AccountFormWithData state={state} />
              </Suspense>
              {state.error && (
                <p className="text-sm text-red-500">{state.error}</p>
              )}
              {state.success && (
                <p className="text-sm text-green-600">{state.success}</p>
              )}
              <Button
                type="submit"
                className="h-10 rounded-full bg-gray-900 px-5 text-sm font-medium text-white hover:bg-gray-800 disabled:bg-gray-200 disabled:text-gray-500"
                disabled={isPending}
              >
                {isPending ? (
                  <>
                    <ArrowPathIcon className="h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <CheckIcon className="h-4 w-4" />
                    Save changes
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
