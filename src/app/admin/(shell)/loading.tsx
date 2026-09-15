/**
 * What the content column shows while a page under (shell) renders on the
 * server. Next wraps the layout's children in a Suspense boundary with this as
 * the fallback, so a click in the sidebar commits at once: the sidebar and the
 * top bar are the layout's and stay put, and only the column the page fills
 * changes. Before this file existed, nothing happened on screen until the
 * whole page had arrived.
 *
 * It also gives the router something to prefetch. For a dynamic route, the
 * default `next/link` prefetch reaches down to the nearest loading boundary;
 * without one there was nothing to fetch ahead, and the click paid for the
 * full round trip.
 *
 * Generic on purpose: the outline of an admin page -- eyebrow, title, one line
 * of context, an action, then titled sections with rows -- in the same
 * measures the real components use, so the swap to the page does not move
 * anything. The pulse is skipped for people who asked for reduced motion.
 */
export default function AdminLoading() {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="space-y-8">
      <span className="sr-only">Pagina laden</span>

      <div aria-hidden="true" className="space-y-8 motion-safe:animate-pulse">
        {/* Mirrors AdminPageHeader. */}
        <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4 pb-2">
          <div className="min-w-0">
            <Bar className="mb-3 h-3 w-24" />
            <Bar className="h-8 w-56 sm:h-9 sm:w-80" />
            <Bar className="mt-3 h-4 w-40" />
          </div>
          <Bar className="h-5 w-24" />
        </header>

        {/* Mirrors AdminSection: mono heading on a hairline, rows below. */}
        <section className="border-t border-line-strong pt-4">
          <Bar className="h-3 w-32" />
          <div className="mt-6 space-y-3">
            <Bar className="h-9 w-full" />
            <Bar className="h-9 w-full" />
            <Bar className="h-9 w-full" />
            <Bar className="h-9 w-11/12" />
          </div>
        </section>

        <section className="border-t border-line-strong pt-4">
          <Bar className="h-3 w-40" />
          <div className="mt-6 space-y-3">
            <Bar className="h-9 w-full" />
            <Bar className="h-9 w-10/12" />
          </div>
        </section>
      </div>
    </div>
  );
}

/** One placeholder line, in the deeper paper tone the sidebar uses for hover. */
function Bar({ className }: { className: string }) {
  return <div className={`rounded-xs bg-paper-deep ${className}`} />;
}
