import Link from "next/link";
import type { ReactNode } from "react";
import { formatDate } from "@/lib/admin/format";
import { formatCents, formatQuantity, lineNetCents, type DocumentTotals } from "@/lib/money";
import type { PortalLine } from "@/lib/portal/lines";

/**
 * The few shapes every portal page is built from: a heading, a list of
 * documents, the lines of one document with its totals, and a plain
 * download link. Small on purpose -- the portal shows records, it does not
 * decorate them.
 */

/** "12 okt 2026" for a calendar date (YYYY-MM-DD), read at noon so no time zone moves the day. */
export function day(dateKey: string): string {
  return formatDate(`${dateKey}T12:00:00`);
}

export function PageHeader({ label, title, children }: { label: string; title: string; children?: ReactNode }) {
  return (
    <header>
      <p className="label-mono">{label}</p>
      <h1 className="display-md mt-4">{title}</h1>
      {children ? <div className="mt-4 max-w-prose text-[1rem] leading-relaxed text-body">{children}</div> : null}
    </header>
  );
}

export function Section({ title, children, className = "" }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section className={`mt-12 ${className}`}>
      <h2 className="label-mono text-muted">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="border-y border-line py-6 text-[0.95rem] text-muted">{children}</p>;
}

/** One row in a list of documents: what it is on the left, the amount and the state on the right. */
export function DocumentRow({
  href,
  number,
  meta,
  amount,
  badge,
}: {
  href: string;
  number: string;
  meta: ReactNode;
  amount?: ReactNode;
  badge?: ReactNode;
}) {
  return (
    <li className="border-b border-line">
      <Link href={href} className="group grid gap-x-6 gap-y-1 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
        <span className="min-w-0">
          <span className="block font-medium text-ink group-hover:underline">{number}</span>
          <span className="mt-0.5 block text-[0.86rem] text-muted">{meta}</span>
        </span>
        <span className="flex flex-wrap items-center gap-3 sm:justify-end">
          {amount ? <span className="tabular text-[0.95rem] text-ink">{amount}</span> : null}
          {badge}
        </span>
      </Link>
    </li>
  );
}

export function DocumentList({ children }: { children: ReactNode }) {
  return <ul className="border-t border-line">{children}</ul>;
}

/** The lines of a document and its totals, stacked so it reads on a phone as on a desk. */
export function DocumentLines({ lines, totals }: { lines: readonly PortalLine[]; totals: DocumentTotals }) {
  return (
    <div>
      <ul className="border-t border-line">
        {lines.map((line) => (
          <li key={line.position} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-6 border-b border-line py-3">
            <div className="min-w-0">
              <p className="whitespace-pre-line break-words text-[0.95rem] text-ink">{line.description}</p>
              <p className="mt-0.5 text-[0.84rem] text-muted">
                {formatQuantity(line.quantityHundredths)} × {formatCents(line.unitPriceCents)} · {line.vatRate}% btw
              </p>
            </div>
            <p className="tabular text-right text-[0.95rem] text-ink">
              {formatCents(lineNetCents(line))}
            </p>
          </li>
        ))}
      </ul>
      <dl className="ml-auto mt-4 max-w-sm text-[0.92rem]">
        <TotalRow term="Subtotaal excl. btw" value={formatCents(totals.subtotalCents)} />
        {totals.vatGroups.map((group) => (
          <TotalRow key={group.rate} term={`Btw ${group.rate}% over ${formatCents(group.netCents)}`} value={formatCents(group.vatCents)} />
        ))}
        <TotalRow term="Totaal incl. btw" value={formatCents(totals.totalCents)} strong />
      </dl>
    </div>
  );
}

export function TotalRow({ term, value, strong = false }: { term: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between gap-6 py-1.5 ${strong ? "border-t border-line-strong font-medium text-ink" : "text-body"}`}>
      <dt>{term}</dt>
      <dd className="tabular">{value}</dd>
    </div>
  );
}

/** A plain link to the stored PDF; the route checks access and the file before it answers. */
export function DownloadLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} className="link-static inline-flex min-h-10 items-center text-[0.95rem] text-ink" download>
      {children}
    </a>
  );
}
