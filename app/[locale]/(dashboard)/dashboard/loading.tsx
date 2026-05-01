const cardClass =
  "rounded-2xl border border-gray-200 bg-white/80 backdrop-blur shadow-[0_8px_30px_-12px_rgba(15,23,42,0.08)]";

function SkeletonBlock({ className = "" }: { className?: string }) {
  return <div className={`rounded bg-gray-200 ${className}`} />;
}

export default function DashboardLoading() {
  return (
    <section
      className="flex-1 px-4 py-6 lg:px-8"
      aria-busy="true"
      aria-live="polite"
    >
      <div className="mx-auto w-full max-w-4xl">
        <div className="mb-8 animate-pulse">
          <SkeletonBlock className="h-8 w-56 sm:h-9 sm:w-72" />
          <SkeletonBlock className="mt-3 h-4 w-80 max-w-full bg-gray-100" />
        </div>

        <div className={`${cardClass} mb-6`}>
          <div className="px-6 pt-6">
            <div className="animate-pulse">
              <SkeletonBlock className="h-5 w-40" />
            </div>
          </div>
          <div className="px-6 pb-6 pt-4">
            <div className="animate-pulse space-y-4">
              <SkeletonBlock className="h-7 w-44" />
              <SkeletonBlock className="h-4 w-64 bg-gray-100" />
              <div className="flex flex-wrap gap-2 pt-2">
                <SkeletonBlock className="h-9 w-32 rounded-full" />
                <SkeletonBlock className="h-9 w-40 rounded-full" />
              </div>
            </div>
          </div>
        </div>

        <div className={cardClass}>
          <div className="px-6 pt-6">
            <div className="animate-pulse">
              <SkeletonBlock className="h-5 w-32" />
            </div>
          </div>
          <div className="px-6 pb-6 pt-4">
            <ul className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <li
                  key={i}
                  className="flex items-center justify-between rounded-xl border border-gray-100 bg-white/60 px-3 py-2.5"
                >
                  <div className="flex items-center gap-3 animate-pulse">
                    <div className="size-9 rounded-full bg-gray-200" />
                    <div className="space-y-2">
                      <SkeletonBlock className="h-4 w-32" />
                      <SkeletonBlock className="h-3 w-16 bg-gray-100" />
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
