"use client";

import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
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
import { signIn } from "@/app/(login)/actions";
import type { ActionState } from "@/lib/auth/middleware";
import { ArrowPathIcon } from "@heroicons/react/24/outline";

export function LoginForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect");
  const priceId = searchParams.get("priceId");
  const inviteId = searchParams.get("inviteId");
  const oauthError = searchParams.get("error");
  const oauthMessage = searchParams.get("message");

  const errorFromGoogle =
    oauthError === "email_exists"
      ? oauthMessage ||
        "An account with this email already exists. Please sign in with your password."
      : oauthError === "config"
        ? "Google sign-in is not configured. Please sign in with your password."
        : oauthError === "denied"
          ? "Google sign-in was cancelled."
          : oauthError === "token" || oauthError === "userinfo"
            ? "Google sign-in failed. Please try again or sign in with your password."
            : null;

  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    signIn,
    { error: "" }
  );

  const signUpHref = `/sign-up${redirect ? `?redirect=${redirect}` : ""}${priceId ? `&priceId=${priceId}` : ""}${inviteId ? `&inviteId=${inviteId}` : ""}`;

  const googleParams = new URLSearchParams();
  if (redirect) googleParams.set("redirect", redirect);
  if (priceId) googleParams.set("priceId", priceId);
  if (inviteId) googleParams.set("inviteId", inviteId);
  const googleAuthHref = `/api/auth/google${googleParams.toString() ? `?${googleParams.toString()}` : ""}`;

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
                  alt="Sunset"
                  className="h-9 w-auto select-none object-contain drop-shadow-sm"
                  draggable={false}
                />
                <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
                  Welcome back
                </h1>
                <p className="text-balance text-sm text-gray-500">
                  Sign in to your{" "}
                  <span className="bg-gradient-to-r from-[#ff6313] via-[#ff8a3d] to-[#ffb066] bg-clip-text font-medium text-transparent">
                    Sunset
                  </span>{" "}
                  account
                </p>
              </div>
              <Field>
                <FieldLabel htmlFor="email">Email</FieldLabel>
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
                <FieldLabel htmlFor="password">Password</FieldLabel>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  required
                  minLength={8}
                  maxLength={100}
                  defaultValue={state?.password}
                />
              </Field>
              {(state?.error || errorFromGoogle) && (
                <p className="text-sm text-destructive">
                  {state?.error || errorFromGoogle}
                </p>
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
                      Signing in...
                    </>
                  ) : (
                    "Sign in"
                  )}
                </Button>
              </Field>
              <FieldSeparator className="*:data-[slot=field-separator-content]:bg-card">
                Or continue with
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
                    Continue with Google
                  </a>
                </Button>
              </Field>
              <FieldDescription className="text-center">
                Don&apos;t have an account?{" "}
                <Link
                  href={signUpHref}
                  className="font-medium text-gray-900 underline underline-offset-4 hover:text-[#ff6313]"
                >
                  Sign up
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
        By signing in, you agree to our{" "}
        <Link href="#" className="underline underline-offset-4">
          Terms of Service
        </Link>{" "}
        and{" "}
        <Link href="#" className="underline underline-offset-4">
          Privacy Policy
        </Link>
        .
      </FieldDescription>
    </div>
  );
}
