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
import { signUp } from "@/app/(login)/actions";
import type { ActionState } from "@/lib/auth/middleware";
import { ArrowPathIcon } from "@heroicons/react/24/outline";

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

  const errorFromGoogle =
    oauthError === "email_exists"
      ? oauthMessage ||
      "An account with this email already exists. Please sign in with your password."
      : oauthError === "config"
        ? "Google sign-up is not configured. Please sign up with your email."
        : oauthError === "denied"
          ? "Google sign-up was cancelled."
          : oauthError === "token" || oauthError === "userinfo"
            ? "Google sign-up failed. Please try again or sign up with your email."
            : null;

  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    signUp,
    { error: "" }
  );

  const signInHref = `/sign-in${redirect ? `?redirect=${redirect}` : ""}${priceId ? `&priceId=${priceId}` : ""}${inviteId ? `&inviteId=${inviteId}` : ""}`;

  const googleParams = new URLSearchParams();
  if (redirect) googleParams.set("redirect", redirect);
  if (priceId) googleParams.set("priceId", priceId);
  if (inviteId) googleParams.set("inviteId", inviteId);
  const googleAuthHref = `/api/auth/google${googleParams.toString() ? `?${googleParams.toString()}` : ""}`;

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card className="overflow-hidden p-0">
        <CardContent className="grid p-0 md:grid-cols-2">
          <form className="p-6 md:p-8" action={formAction}>
            <input type="hidden" name="redirect" value={redirect || ""} />
            <input type="hidden" name="priceId" value={priceId || ""} />
            <input type="hidden" name="inviteId" value={inviteId || ""} />
            <FieldGroup>
              <div className="flex flex-col items-center gap-2 text-center">
                <h1 className="text-2xl font-bold">Create an account</h1>
                <p className="text-muted-foreground text-balance">
                  Get started with your free account
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
                  autoComplete="new-password"
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
                <Button type="submit" disabled={isPending} className="w-full">
                  {isPending ? (
                    <>
                      <ArrowPathIcon className="mr-2 h-4 w-4 animate-spin" />
                      Creating account...
                    </>
                  ) : (
                    "Sign up"
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
                  className="w-full"
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
                Already have an account?{" "}
                <Link href={signInHref} className="underline underline-offset-4">
                  Sign in
                </Link>
              </FieldDescription>
            </FieldGroup>
          </form>
          <div className="bg-muted relative hidden md:block">
            <img
              src="/login-sunset.png"
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
            />
          </div>
        </CardContent>
      </Card>
      <FieldDescription className="px-6 text-center">
        By signing up, you agree to our{" "}
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
