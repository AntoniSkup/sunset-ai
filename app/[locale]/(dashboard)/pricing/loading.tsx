function SkeletonBlock({ className = "" }: { className?: string }) {
  return <div className={`rounded bg-gray-200 ${className}`} />;
}

function PlanCardSkeleton({ accent = false }: { accent?: boolean }) {
  return (
    <div
      className={`relative overflow-hidden rounded-xl border bg-background shadow-md ${
        accent ? "border-orange-200" : "border-border"
      }`}
    >
      {accent && (
        <div className="absolute inset-x-0 top-0 h-1 bg-orange-500/70" />
      )}
      <div className="space-y-6 p-6">
        <div className="flex items-center justify-between gap-3 animate-pulse">
          <SkeletonBlock className="h-6 w-28 rounded-full" />
          <SkeletonBlock className="h-6 w-32 rounded-full bg-gray-100" />
        </div>

        <div className="animate-pulse space-y-3">
          <SkeletonBlock className="h-7 w-40" />
          <SkeletonBlock className="h-4 w-3/4 bg-gray-100" />
        </div>

        <div className="animate-pulse space-y-3">
          <SkeletonBlock className="h-10 w-32" />
          <SkeletonBlock className="h-4 w-2/3 bg-gray-100" />
        </div>

        <ul className="animate-pulse space-y-3 pt-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <li key={i} className="flex items-start gap-3">
              <div className="mt-0.5 h-4 w-4 shrink-0 rounded-full bg-gray-200" />
              <SkeletonBlock
                className={`h-3 bg-gray-100 ${
                  ["w-3/4", "w-2/3", "w-5/6", "w-1/2"][i] ?? "w-2/3"
                }`}
              />
            </li>
          ))}
        </ul>

        <div className="animate-pulse space-y-2 pt-2">
          <SkeletonBlock className="h-10 w-full rounded-xl" />
          <SkeletonBlock className="mx-auto h-3 w-1/2 bg-gray-100" />
        </div>
      </div>
    </div>
  );
}

export default function PricingLoading() {
  return (
    <main
      className="relative min-h-full px-4 py-6 sm:px-6 lg:px-8 lg:py-8"
      aria-busy="true"
      aria-live="polite"
    >
      <div className="absolute left-4 top-6 sm:left-6 lg:left-8 lg:top-8">
        <div className="animate-pulse">
          <SkeletonBlock className="h-9 w-9 rounded-full" />
        </div>
      </div>

      <div className="mx-auto mt-8 max-w-5xl p-6 sm:mt-10 sm:p-8 lg:mt-12 lg:p-10">
        <div className="mx-auto max-w-3xl space-y-4 text-center">
          <div className="flex justify-center">
            <SkeletonBlock className="h-6 w-28 rounded-full bg-orange-100/80 animate-pulse" />
          </div>
          <div className="flex justify-center">
            <SkeletonBlock className="h-10 w-3/4 sm:h-12 animate-pulse" />
          </div>
          <div className="flex justify-center">
            <SkeletonBlock className="h-5 w-2/3 bg-gray-100 animate-pulse" />
          </div>
        </div>

        <div className="mx-auto mt-10 grid max-w-5xl gap-6 lg:grid-cols-2">
          <PlanCardSkeleton accent />
          <PlanCardSkeleton />
        </div>
      </div>
    </main>
  );
}
