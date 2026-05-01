import type { ReactNode } from "react";

type NotFoundShellProps = {
  title: string;
  description: string;
  /** Wrapped logo link (e.g. next-intl `Link` or `next/link`) */
  headerLogo: ReactNode;
  /** Primary nav action, typically “Back to home” (matches legal layout CTA). */
  headerAction: ReactNode;
  /** e.g. `LanguageSwitcher` on localized surfaces */
  footerExtra?: ReactNode;
};

/**
 * Marketing-style 404 chrome aligned with `app/[locale]/(dashboard)/(legal)/layout.tsx`
 * (background wash, sticky header, footer).
 */
export function NotFoundShell({
  title,
  description,
  headerLogo,
  headerAction,
  footerExtra,
}: NotFoundShellProps) {
  const year = new Date().getFullYear();

  return (
    <div className="relative flex min-h-[100dvh] flex-col overflow-y-auto bg-white">
      <BackgroundDecor />

      <header className="sticky top-0 z-30 shrink-0 border-b border-gray-200/60 bg-white/65 backdrop-blur-md backdrop-saturate-150 supports-[backdrop-filter]:bg-white/55">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
          {headerLogo}
          {headerAction}
        </div>
      </header>

      <main className="relative z-10 flex flex-1 flex-col items-center justify-center px-4 py-12 text-center sm:px-6">
        <div className="mx-auto flex w-full max-w-lg flex-col items-center">
          <p className="mb-3 text-sm font-semibold uppercase tracking-[0.2em] text-orange-600">
            404
          </p>
          <h1 className="text-balance text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
            {title}
          </h1>
          <p className="mt-4 max-w-md text-pretty text-base leading-relaxed text-gray-600">
            {description}
          </p>
        </div>
      </main>

      <footer className="relative z-10 shrink-0 border-t border-gray-100 py-8">
        <div className="mx-auto flex w-full max-w-7xl flex-col items-center justify-between gap-4 px-4 text-xs text-gray-400 sm:flex-row sm:px-6 lg:px-8">
          <span>© {year} Sunset.</span>
          {footerExtra ? (
            <div className="flex flex-wrap items-center justify-center gap-4">
              {footerExtra}
            </div>
          ) : null}
        </div>
      </footer>
    </div>
  );
}

function BackgroundDecor() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 -z-0 isolate overflow-hidden [contain:paint]"
    >
      <div className="absolute inset-0 [background:radial-gradient(60%_50%_at_50%_-10%,rgba(255,138,61,0.14),transparent_70%),radial-gradient(40%_30%_at_85%_5%,rgba(255,99,19,0.10),transparent_70%)]" />
      <div className="absolute inset-0 [background-image:linear-gradient(to_bottom,transparent,white_85%)]" />
    </div>
  );
}
