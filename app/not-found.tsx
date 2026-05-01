import Link from "next/link";
import { NotFoundShell } from "@/components/not-found-shell";

/**
 * Fallback for URLs the i18n middleware does not associate with a locale
 * (see matcher / bypass rules).
 */
export default function NotFound() {
  return (
    <NotFoundShell
      title="Page not found"
      description="The page you are looking for might have been removed, had its name changed, or is temporarily unavailable."
      headerLogo={
        <Link
          href="/"
          className="inline-flex shrink-0 transition-opacity hover:opacity-80"
        >
          <img
            src="/sunset-logo.png"
            alt="Sunset"
            className="h-8 w-auto object-contain"
          />
        </Link>
      }
      headerAction={
        <Link
          href="/"
          className="inline-flex h-9 items-center rounded-full bg-gray-900 px-4 text-sm font-medium text-white transition-colors hover:bg-gray-800"
        >
          Back to home
        </Link>
      }
    />
  );
}
