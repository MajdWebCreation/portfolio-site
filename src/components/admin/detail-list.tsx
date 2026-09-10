import type { ReactNode } from "react";

/** Compact term/value rows on hairlines, for detail pages. */
export function DetailList({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <dl className={`border-t border-line ${className}`}>{children}</dl>;
}

export function DetailRow({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="grid gap-x-6 gap-y-1 border-b border-line py-2.5 sm:grid-cols-[9.5rem_minmax(0,1fr)]">
      <dt className="text-[0.85rem] text-muted sm:pt-0.5">{term}</dt>
      <dd className="min-w-0 break-words text-[0.95rem] text-ink">{children}</dd>
    </div>
  );
}
