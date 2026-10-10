import Link from "next/link";

export type FinanceTab = "overzicht" | "facturen" | "incassos" | "creditnotas";

export const financeTabs: readonly { key: FinanceTab; label: string }[] = [
  { key: "overzicht", label: "Overzicht" },
  { key: "facturen", label: "Facturen" },
  { key: "incassos", label: "Incasso's" },
  { key: "creditnotas", label: "Creditnota's & refunds" },
];

export function isFinanceTab(value: string | undefined): value is FinanceTab {
  return financeTabs.some((tab) => tab.key === value);
}

export function financeHref(tab: FinanceTab, customerId?: string): string {
  const params = new URLSearchParams();
  if (tab !== "overzicht") params.set("tab", tab);
  if (customerId) params.set("klant", customerId);
  const query = params.toString();
  return `/admin/betalingen${query ? `?${query}` : ""}`;
}

/** The four sections of the payments page, as links so a tab is a URL the admin can keep. */
export default function FinanceTabs({ active, customerId, counts }: { active: FinanceTab; customerId?: string; counts?: Partial<Record<FinanceTab, number>> }) {
  return (
    <nav aria-label="Onderdelen van betalingen" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <ul className="flex min-w-max gap-1 border-b border-line-strong">
        {financeTabs.map((tab) => {
          const current = tab.key === active;
          const count = counts?.[tab.key];
          return (
            <li key={tab.key}>
              <Link
                href={financeHref(tab.key, customerId)}
                aria-current={current ? "page" : undefined}
                className={`-mb-px inline-flex min-h-10 items-center gap-2 border-b-2 px-3 text-[0.92rem] transition-colors ${
                  current ? "border-ink font-medium text-ink" : "border-transparent text-muted hover:text-ink"
                }`}
              >
                {tab.label}
                {count !== undefined && count > 0 ? <span className="label-mono text-faint">{count}</span> : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
