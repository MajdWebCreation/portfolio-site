"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import { trackEvent } from "@/lib/analytics/track";
import CtaLink from "@/components/cta-link";
import { isPackageId, type PackageId } from "@/lib/pricing";

export type SelectorAddOn = {
  label: string;
  price: string;
  /** Base amount, struck through, while the development discount is active: "€75". */
  originalPrice?: string;
};
export type SelectorAddOnGroup = {
  label: string;
  /** Context under the group, e.g. that app amounts cover a first version. */
  note?: string;
  items: SelectorAddOn[];
};

export type SelectorPackage = {
  id: PackageId;
  name: string;
  /** One short line: who the type is for. */
  tagline: string;
  /** "vanaf € 1.495": the starting amount with its word, for the detail rows. */
  price: string;
  /** "€ 1.495"; the label above it says it is a starting price. */
  priceAmount: string;
  /** Base amount while the development discount is active: "€ 1.495". */
  originalPriceAmount?: string;
  /** "vanaf € 29 p/m" */
  monthly: string;
  scopeDriven: boolean;
  /** Three to five points that set the type apart, for the overview cards. */
  highlights: string[];
  included: string[];
  addOnGroups: SelectorAddOnGroup[];
  /** Boundary text; for custom work the scope explanation. */
  boundary: string;
  plannerHref: string;
};

export type SelectorLabels = {
  onceFromLabel: string;
  monthlyLabel: string;
  scopeNote: string;
  includedLabel: string;
  addOnsLabel: string;
  boundaryLabel: string;
  scopeLabel: string;
  ctaLabel: string;
};

/** Copy for an active development discount; absent when there is none. */
export type SelectorDiscount = {
  /** "Tijdelijk 30% korting op de ontwikkelkosten" */
  note: string;
  /** Screen-reader label before a struck-through base amount. */
  originalLabel: string;
};

type PricingSelectorProps = {
  packages: SelectorPackage[];
  labels: SelectorLabels;
  discount?: SelectorDiscount;
};

/* A base amount the development discount replaces: quiet, struck through. */
export function OriginalPrice({ amount, label }: { amount: string; label: string }) {
  return (
    <s className="text-faint decoration-[0.06em]">
      <span className="sr-only">{label} </span>
      {amount}
    </s>
  );
}

/* A deep link (#business) opens that type; read without touching state. */
const subscribeHash = (onChange: () => void) => {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
};
const readHash = () => {
  const hash = window.location.hash.slice(1);
  return isPackageId(hash) ? hash : null;
};
const noHash = () => null;

/**
 * The full detail of each project type, one at a time: what is included,
 * which extensions belong to it, where its boundary lies and what it costs
 * per month. Closed by default, so the overview above stays the first thing
 * read; a row opens on a tap, or through the type's hash, which the cards
 * above link to. Every panel is in the HTML, so the content is there without
 * JavaScript and for search engines; JavaScript only decides which one is
 * shown. The call to action leads to the project planner with the type
 * preselected.
 */
export default function PricingSelector({ packages, labels, discount }: PricingSelectorProps) {
  const hashId = useSyncExternalStore(subscribeHash, readHash, noHash);
  const [choice, setChoice] = useState<PackageId | null>(null);
  /* A new hash (from a card link, or the URL on arrival) wins over the last tap. */
  const [seenHash, setSeenHash] = useState(hashId);
  if (hashId !== seenHash) {
    setSeenHash(hashId);
    if (hashId) setChoice(hashId);
  }
  const active = choice;
  const headRefs = useRef<Partial<Record<PackageId, HTMLButtonElement | null>>>({});

  const select = (id: PackageId) => {
    const next = active === id ? null : id;
    /* Opening a type is interest; closing it again is not. */
    if (next) trackEvent("pricing_package_select", { package_id: id });
    setChoice(next);
    /* Keep the choice in the URL hash (no history entry), so back from the planner reopens it. */
    window.history.replaceState(null, "", next ? `#${next}` : window.location.pathname);
    /* Keep the tapped header in view after a panel above it closes. */
    window.requestAnimationFrame(() => {
      headRefs.current[id]?.scrollIntoView({ block: "nearest" });
    });
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    const keys = ["ArrowDown", "ArrowUp", "Home", "End"];
    if (!keys.includes(event.key)) return;
    event.preventDefault();
    const last = packages.length - 1;
    const next =
      event.key === "ArrowDown"
        ? Math.min(index + 1, last)
        : event.key === "ArrowUp"
          ? Math.max(index - 1, 0)
          : event.key === "Home"
            ? 0
            : last;
    headRefs.current[packages[next].id]?.focus();
  };

  return (
    <div className="border-t border-line">
      {packages.map((pkg, index) => {
        const open = active === pkg.id;
        const headId = `ps-head-${pkg.id}`;
        const panelId = `ps-panel-${pkg.id}`;

        return (
          /* The id is the hash target, so a card's link lands on this row. */
          <div key={pkg.id} id={pkg.id} className="ps-head">
            <h3>
              <button
                type="button"
                id={headId}
                ref={(node) => {
                  headRefs.current[pkg.id] = node;
                }}
                aria-expanded={open}
                aria-controls={panelId}
                onClick={() => select(pkg.id)}
                onKeyDown={(event) => onKeyDown(event, index)}
                className={`ps-button group grid w-full grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4 gap-y-2 py-4 text-left sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center ${
                  open ? "is-open" : ""
                }`}
              >
                {/* Same three slots in every row, whatever the name's length:
                    name and tagline, the starting price, the arrow. Narrow
                    screens put the price on its own line under the text. */}
                <span className="col-start-1 row-start-1 min-w-0">
                  <span className="ps-name block text-[1.1rem] font-semibold leading-snug tracking-[-0.02em] text-ink lg:text-[1.2rem]">
                    {pkg.name}
                  </span>
                  <span className="mt-0.5 block text-[0.88rem] leading-snug text-muted">
                    {pkg.tagline}
                  </span>
                </span>
                <span className="col-start-1 row-start-2 flex items-baseline gap-x-3 whitespace-nowrap sm:col-start-2 sm:row-start-1 sm:flex-col sm:items-end sm:gap-y-0.5">
                  {discount && pkg.originalPriceAmount ? (
                    <span className="text-[0.85rem] leading-snug">
                      <OriginalPrice amount={pkg.originalPriceAmount} label={discount.originalLabel} />
                    </span>
                  ) : null}
                  <span className="text-[0.95rem] leading-snug text-muted">{pkg.price}</span>
                </span>
                <span
                  aria-hidden="true"
                  className="ps-arrow col-start-2 row-start-1 leading-[1.6] text-faint sm:col-start-3"
                >
                  →
                </span>
              </button>
            </h3>

            <div
              id={panelId}
              role="region"
              aria-labelledby={headId}
              hidden={!open}
              className="ps-panel"
            >
              <div className="ps-panel-inner">
                {/* Two different amounts: the build once, management per month. */}
                <dl className="grid max-w-[36rem] grid-cols-2 gap-x-6">
                  <div>
                    <dt className="label-mono">{labels.onceFromLabel}</dt>
                    <dd className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <span className="tabular text-[1.9rem] font-semibold leading-none tracking-[-0.03em] text-ink lg:text-[2.2rem]">
                        {pkg.priceAmount}
                      </span>
                      {discount && pkg.originalPriceAmount ? (
                        <span className="text-[1rem] leading-none">
                          <OriginalPrice amount={pkg.originalPriceAmount} label={discount.originalLabel} />
                        </span>
                      ) : null}
                    </dd>
                    {discount && pkg.originalPriceAmount ? (
                      <dd className="mt-2 max-w-[16rem] text-[0.82rem] leading-snug text-muted">
                        {discount.note}
                      </dd>
                    ) : null}
                    {pkg.scopeDriven ? (
                      <dd className="mt-2 max-w-[16rem] text-[0.82rem] leading-snug text-muted">
                        {labels.scopeNote}
                      </dd>
                    ) : null}
                  </div>
                  <div className="border-l border-line pl-6">
                    <dt className="label-mono">{labels.monthlyLabel}</dt>
                    <dd className="mt-1 text-[1.05rem] font-medium leading-snug text-body">
                      {pkg.monthly}
                    </dd>
                  </div>
                </dl>

                <div className="mt-8 grid gap-8 border-t border-line pt-6 sm:grid-cols-2 lg:gap-12">
                  <div>
                    <p className="label-mono">{labels.includedLabel}</p>
                    <ul className="mt-3 space-y-2 text-[0.95rem] leading-snug text-body">
                      {pkg.included.map((item) => (
                        <li key={item} className="flex gap-3">
                          <span aria-hidden="true" className="mt-[0.65em] h-px w-3 shrink-0 bg-ink" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="label-mono">{labels.addOnsLabel}</p>
                    <div className="mt-3 space-y-4">
                      {pkg.addOnGroups.map((group) => (
                        <div key={group.label}>
                          <p className="text-[0.78rem] uppercase tracking-[0.06em] text-faint">
                            {group.label}
                          </p>
                          <ul className="mt-1 divide-y divide-line border-b border-line">
                            {group.items.map((item) => (
                              <li
                                key={item.label}
                                className="flex items-baseline justify-between gap-4 py-1.5 text-[0.92rem] leading-snug"
                              >
                                <span className="text-body">{item.label}</span>
                                <span className="shrink-0 text-ink">
                                  {discount && item.originalPrice ? (
                                    <span className="mr-2 text-[0.85rem]">
                                      <OriginalPrice amount={item.originalPrice} label={discount.originalLabel} />
                                    </span>
                                  ) : null}
                                  {item.price}
                                </span>
                              </li>
                            ))}
                          </ul>
                          {group.note ? (
                            <p className="mt-1.5 text-[0.82rem] leading-snug text-muted">{group.note}</p>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="mt-8 border-t border-line pt-6">
                  <div className="max-w-[36rem] border-l-2 border-accent pl-4">
                    <p className="label-mono text-accent">
                      {pkg.scopeDriven ? labels.scopeLabel : labels.boundaryLabel}
                    </p>
                    <p className="mt-2 text-[0.95rem] leading-relaxed text-body">{pkg.boundary}</p>
                  </div>
                </div>

                <div className="mt-8 border-t border-line pt-6">
                  <CtaLink
                    href={pkg.plannerHref}
                    data-track-event="pricing_cta_click"
                    data-track-package-id={pkg.id}
                    data-track-cta-target="planner"
                    data-track-placement="pricing_details"
                  >
                    {labels.ctaLabel}
                  </CtaLink>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
