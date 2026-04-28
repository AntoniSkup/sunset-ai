import { Suspense } from "react";
import { LoginForm } from "@/components/login-form";

export default function SignInPage() {
  return (
    <div className="relative flex min-h-svh flex-col items-center justify-center overflow-hidden bg-white p-6 md:p-10">
      <AuthBackgroundDecor />
      <div className="relative z-10 w-full max-w-sm md:max-w-4xl">
        <Suspense>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}

function AuthBackgroundDecor() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 -z-0 isolate overflow-hidden [contain:paint]"
    >
      <div className="absolute inset-0 [background:radial-gradient(60%_50%_at_50%_-10%,rgba(255,138,61,0.18),transparent_70%),radial-gradient(40%_30%_at_85%_15%,rgba(255,99,19,0.12),transparent_70%)]" />
      <div
        className="absolute -top-40 left-1/2 h-[560px] w-[560px] rounded-full bg-[radial-gradient(closest-side,rgba(255,176,102,0.45),transparent)] opacity-90 [filter:blur(80px)] [transform:translate3d(-50%,0,0)] [will-change:transform]"
      />
      <div
        className="absolute right-[-12%] top-2/3 h-80 w-80 rounded-full bg-[radial-gradient(closest-side,rgba(255,176,102,0.32),transparent)] opacity-80 [filter:blur(80px)] [transform:translate3d(0,0,0)] [will-change:transform]"
      />
      <div className="absolute inset-0 [background-image:linear-gradient(to_bottom,transparent,white_85%)]" />
    </div>
  );
}
