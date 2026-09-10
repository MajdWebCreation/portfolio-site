import type { ReactNode } from "react";

type AdminSectionProps = {
  id: string;
  title: string;
  /** Short note next to the title, e.g. the source of the data. */
  note?: string;
  children: ReactNode;
};

/** A titled block on an admin page: mono heading on a hairline, content below. */
export default function AdminSection({ id, title, note, children }: AdminSectionProps) {
  return (
    <section aria-labelledby={id} className="border-t border-line-strong pt-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <h2 id={id} className="label-mono text-ink">
          {title}
        </h2>
        {note ? <p className="text-[0.85rem] text-muted">{note}</p> : null}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}
