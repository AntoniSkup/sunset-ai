"use client";

import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useDynamicTranslate } from "@/i18n/dynamic-translate";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { signUp } from "@/app/[locale]/(login)/actions";
import type { ActionState } from "@/lib/auth/middleware";
import { ArrowPathIcon } from "@heroicons/react/24/outline";

function oauthErrorKey(code: string | null): string | null {
  if (!code) return null;
  if (code === "email_exists") return "errors.emailExistsOauth";
  if (code === "config") return "errors.oauthNotConfigured";
  if (code === "denied") return "errors.oauthCancelled";
  if (code === "token" || code === "userinfo") return "errors.oauthFailed";
  return null;
}

export function SignUpForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect");
  const priceId = searchParams.get("priceId");
  const inviteId = searchParams.get("inviteId");
  const oauthError = searchParams.get("error");
  const oauthMessage = searchParams.get("message");

  const t = useDynamicTranslate();
  const tAuth = useTranslations("auth");
  const tCommon = useTranslations("common");

  const oauthKey = oauthErrorKey(oauthError);

  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    signUp,
    {}
  );

  const signInHref = `/sign-in${redirect ? `?redirect=${redirect}` : ""}${priceId ? `&priceId=${priceId}` : ""}${inviteId ? `&inviteId=${inviteId}` : ""}`;

  const googleParams = new URLSearchParams();
  if (redirect) googleParams.set("redirect", redirect);
  if (priceId) googleParams.set("priceId", priceId);
  if (inviteId) googleParams.set("inviteId", inviteId);
  const googleAuthHref = `/api/auth/google${googleParams.toString() ? `?${googleParams.toString()}` : ""}`;

  const errorMessage =
    t(state?.errorKey, state?.messageParams) ??
    t(oauthKey) ??
    oauthMessage ??
    null;

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card className="overflow-hidden rounded-2xl border-gray-200 bg-white/85 p-0 shadow-[0_20px_60px_-24px_rgba(15,23,42,0.25)] backdrop-blur">
        <CardContent className="grid p-0 md:grid-cols-2">
          <form className="p-6 md:p-8" action={formAction}>
            <input type="hidden" name="redirect" value={redirect || ""} />
            <input type="hidden" name="priceId" value={priceId || ""} />
            <input type="hidden" name="inviteId" value={inviteId || ""} />
            <FieldGroup>
              <div className="flex flex-col items-center gap-3 text-center">
                <img
                  src="/sunset-logo.png"
                  alt="Stronka AI"
                  className="h-9 w-auto select-none object-contain drop-shadow-sm"
                  draggable={false}
                />
                <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
                  {tAuth("signUpTitle")}
                </h1>
              </div>
              <Field>
                <FieldLabel htmlFor="email">{tCommon("email")}</FieldLabel>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="m@example.com"
                  autoComplete="email"
                  required
                  maxLength={50}
                  defaultValue={state?.email}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="password">
                  {tCommon("password")}
                </FieldLabel>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  placeholder={tAuth("passwordPlaceholder")}
                  required
                  minLength={8}
                  maxLength={100}
                  defaultValue={state?.password}
                />
              </Field>
              {errorMessage && (
                <p className="text-sm text-destructive">{errorMessage}</p>
              )}
              <Field>
                <Button
                  type="submit"
                  disabled={isPending}
                  className="h-10 w-full rounded-full bg-gray-900 text-sm font-medium text-white hover:bg-gray-800 disabled:bg-gray-200 disabled:text-gray-500"
                >
                  {isPending ? (
                    <>
                      <ArrowPathIcon className="mr-2 h-4 w-4 animate-spin" />
                      {tAuth("creatingAccount")}
                    </>
                  ) : (
                    tCommon("signUp")
                  )}
                </Button>
              </Field>
              <FieldSeparator className="*:data-[slot=field-separator-content]:bg-card">
                {tAuth("orContinueWith")}
              </FieldSeparator>
              <Field>
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 w-full rounded-full border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-100 hover:text-gray-900"
                  asChild
                >
                  <a href={googleAuthHref}>
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      className="mr-2 h-4 w-4"
                    >
                      <path
                        d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z"
                        fill="currentColor"
                      />
                    </svg>
                    {tAuth("continueWithGoogle")}
                  </a>
                </Button>
              </Field>
              <FieldDescription className="text-center">
                {tAuth("haveAccount")}{" "}
                <Link
                  href={signInHref}
                  className="font-medium text-gray-900 underline underline-offset-4 hover:text-[#ff6313]"
                >
                  {tCommon("signIn")}
                </Link>
              </FieldDescription>
            </FieldGroup>
          </form>
          <div className="relative hidden bg-gray-900 md:block">
            <img
              src="/login-sunset.png"
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-tr from-[#ff6313]/15 via-transparent to-transparent" />
          </div>
        </CardContent>
      </Card>
      <FieldDescription className="px-6 text-center">
        {tAuth("termsAcceptSignUp")}{" "}
        <Link
          href="/terms"
          className="underline underline-offset-4 hover:text-[#ff6313]"
        >
          {tAuth("termsOfUse")}
        </Link>{" "}
        {tAuth("and")}{" "}
        <Link
          href="/privacy"
          className="underline underline-offset-4 hover:text-[#ff6313]"
        >
          {tAuth("privacyPolicy")}
        </Link>
        .
      </FieldDescription>
    </div>
  );
}
