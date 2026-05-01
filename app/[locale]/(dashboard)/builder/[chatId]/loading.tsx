function SkeletonBlock({ className = "" }: { className?: string }) {
  return <div className={`rounded bg-gray-200 ${className}`} />;
}

export default function BuilderLoading() {
  return (
    <div
      className="h-full flex"
      aria-busy="true"
      aria-live="polite"
    >
      <div className="flex h-full flex-1">
        <div className="h-full w-[30%] min-w-[280px] rounded-lg bg-background overflow-hidden flex flex-col">
          <div className="shrink-0 border-b border-gray-200/70 bg-white/60 px-4 py-3 backdrop-blur">
            <div className="flex items-center justify-between gap-3 animate-pulse">
              <div className="flex items-center gap-2">
                <div className="size-7 rounded-full bg-gray-200" />
                <SkeletonBlock className="h-4 w-32" />
              </div>
              <div className="flex items-center gap-2">
                <SkeletonBlock className="h-7 w-7 rounded-full" />
                <SkeletonBlock className="h-7 w-7 rounded-full" />
              </div>
            </div>
          </div>

          <div className="flex flex-1 min-h-0 flex-col gap-4 px-4 py-6 overflow-hidden">
            <div className="flex justify-end">
              <div className="max-w-[75%] animate-pulse space-y-2 rounded-2xl bg-gray-200/80 px-4 py-3">
                <SkeletonBlock className="h-3 w-48 bg-gray-300" />
                <SkeletonBlock className="h-3 w-32 bg-gray-300" />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <div className="max-w-[85%] animate-pulse space-y-2 rounded-2xl bg-gray-100 px-4 py-3">
                <SkeletonBlock className="h-3 w-3/5 bg-gray-200" />
                <SkeletonBlock className="h-3 w-4/5 bg-gray-200" />
                <SkeletonBlock className="h-3 w-2/5 bg-gray-200" />
              </div>
              <div className="ml-2 flex items-center gap-1.5 text-gray-400">
                <span
                  className="inline-block h-1.5 w-1.5 rounded-full bg-gray-300"
                  style={{ animation: "pulse-dot 1.4s infinite ease-in-out" }}
                />
                <span
                  className="inline-block h-1.5 w-1.5 rounded-full bg-gray-300"
                  style={{
                    animation: "pulse-dot 1.4s infinite ease-in-out",
                    animationDelay: "0.16s",
                  }}
                />
                <span
                  className="inline-block h-1.5 w-1.5 rounded-full bg-gray-300"
                  style={{
                    animation: "pulse-dot 1.4s infinite ease-in-out",
                    animationDelay: "0.32s",
                  }}
                />
              </div>
            </div>

            <div className="mt-auto">
              <div className="rounded-2xl border border-gray-200 bg-white/70 p-3 backdrop-blur">
                <div className="animate-pulse space-y-3">
                  <SkeletonBlock className="h-4 w-2/3 bg-gray-100" />
                  <div className="flex items-center justify-between">
                    <SkeletonBlock className="h-7 w-7 rounded-full" />
                    <SkeletonBlock className="h-8 w-20 rounded-md" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="w-px shrink-0 bg-gray-200/80" aria-hidden />

        <div className="h-full flex-1 rounded-lg bg-background overflow-hidden flex flex-col pr-1">
          <div className="shrink-0 border-b border-gray-200/70 bg-white/60 px-4 py-3 backdrop-blur">
            <div className="flex items-center justify-between gap-3 animate-pulse">
              <div className="flex items-center gap-2">
                <SkeletonBlock className="h-7 w-20 rounded-md" />
                <SkeletonBlock className="h-7 w-20 rounded-md bg-gray-100" />
                <SkeletonBlock className="h-7 w-20 rounded-md bg-gray-100" />
              </div>
              <div className="flex items-center gap-2">
                <SkeletonBlock className="h-7 w-7 rounded-full" />
                <SkeletonBlock className="h-7 w-24 rounded-full" />
              </div>
            </div>
          </div>

          <div className="relative flex-1 min-h-0 rounded-lg pb-2">
            <div className="absolute inset-2 overflow-hidden rounded-lg border border-gray-200 bg-white/70 backdrop-blur">
              <div className="h-full w-full animate-pulse">
                <div className="h-10 border-b border-gray-100 bg-gray-50/80" />
                <div className="flex flex-col gap-4 p-6">
                  <SkeletonBlock className="h-8 w-2/3 bg-gray-200" />
                  <SkeletonBlock className="h-4 w-1/2 bg-gray-100" />
                  <div className="mt-2 grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <div className="aspect-video rounded-lg bg-gray-100" />
                    <div className="aspect-video rounded-lg bg-gray-100" />
                    <div className="aspect-video rounded-lg bg-gray-100" />
                  </div>
                  <SkeletonBlock className="mt-4 h-4 w-3/4 bg-gray-100" />
                  <SkeletonBlock className="h-4 w-2/3 bg-gray-100" />
                  <SkeletonBlock className="h-4 w-1/2 bg-gray-100" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
