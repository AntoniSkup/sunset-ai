import { notFound } from "next/navigation";

/**
 * Ensures unknown paths under `[locale]` invoke `notFound()` so Next.js
 * renders `app/[locale]/not-found.tsx` instead of an empty UI. See:
 * https://next-intl.dev/docs/environments/error-files
 */
export default function CatchAllUnknownLocalePath() {
  notFound();
}
