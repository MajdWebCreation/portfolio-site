"use client";

import { Fragment, useRef, useState, useSyncExternalStore } from "react";
import CtaLink from "@/components/cta-link";
import { isPackageId, type PackageId } from "@/lib/pricing";

export type SelectorAddOn = { label: string; price: string };
export type SelectorAddOnGroup = { label: string; items: SelectorAddOn[] };

export type SelectorPackage = {
  id: PackageId;
  name: string;
  /** One short line: who the type is for. Shown once, in the header. */
  tagline: string;
  /** "vanaf €1.495" */
  price: string;
  /** "€1.495" or "€4.995+" */
  priceAmount: string;
  /** "vanaf €25 p/m" */
  monthly: string;
  scopeDriven: boolean;
  included: string[];
  addOnGroups: SelectorAddOnGroup[];
  /** Boundary text; for custom work the scope explanation. */
  boundary: string;
  plannerHref: string;
};

export type SelectorLabels = {
  onceLabel: string;
  monthlyLabel: string;
  scopeTag: string;
  includedLabel: string;
  addOnsLabel: string;
  boundaryLabel: string;
  scopeLabel: string;
  ctaLabel: string;
};

type PricingSelectorProps = {
  packages: SelectorPackage[];
  labels: SelectorLabels;
  initialId: PackageId;
};

const DESKTOP = "(min-width: 64rem)";

/* A deep link (#business) opens that level; read without touching state. */
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
 * One package at a time. On wide screens the list of levels sits on the
 * left and the selected level's detail on the right; on narrow screens the
 * same markup behaves as an accordion. Every panel is in the HTML, so the
 * content is there without JavaScript and for search engines; JavaScript
 * only decides which one is shown. Selecting sends nothing: the call to
 * action leads to the project planner with the package preselected.
 */
export default function PricingSelector({ packages, labels, initialId }: PricingSelectorProps) {
  const hashId = useSyncExternalStore(subscribeHash, readHash, noHash);
  /* undefined = no choice made yet; null = closed (narrow screens only). */
  const [choice, setChoice] = useState<PackageId | null | undefined>(undefined);
  const active = choice === undefined ? (hashId ?? initialId) : choice;
  const headRefs = useRef<Partial<Record<PackageId, HTMLButtonElement | null>>>({});

  const isDesktop = () => window.matchMedia(DESKTOP).matches;

  const select = (id: PackageId) => {
    const next = active === id ? (isDesktop() ? active : null) : id;
    setChoice(next);
    /* Keep the choice in the URL hash (no history entry), so back from the planner reopens it. */
    window.history.replaceState(null, "", next ? `#${next}` : window.location.pathname);
    if (!isDesktop()) {
      /* Keep the tapped header in view after the panel above it closes. */
      window.requestAnimationFrame(() => {
        headRefs.current[id]?.scrollIntoView({ block: "nearest" });
      });
    }
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
    <div className="ps grid lg:grid-cols-12 lg:gap-x-8">
      {packages.map((pkg, index) => {
        const open = active === pkg.id;
        const headId = `ps-head-${pkg.id}`;
        const panelId = `ps-panel-${pkg.id}`;

        return (
          <Fragment key={pkg.id}>
            <h3
              className="ps-head lg:col-span-4"
              style={{ "--row": index + 1 } as React.CSSProperties}
            >
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
                className={`ps-button group flex w-full flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-4 text-left ${
                  open ? "is-open" : ""
                }`}
              >
                <span className="min-w-0">
                  <span className="ps-name block text-[1.1rem] font-semibold leading-snug tracking-[-0.02em] text-ink lg:text-[1.05rem] xl:text-[1.2rem]">
                    {pkg.name}
                  </span>
                  <span className="mt-0.5 block text-[0.88rem] leading-snug text-muted">
                    {pkg.tagline}
                  </span>
                </span>
                <span className="flex shrink-0 items-baseline gap-3">
                  <span className="text-[0.95rem] text-muted">{pkg.price}</span>
                  <span aria-hidden="true" className="ps-arrow text-faint">
                    →
                  </span>
                </span>
              </button>
            </h3>

            <div
              id={panelId}
              role="region"
              aria-labelledby={headId}
              hidden={!open}
              className="ps-panel lg:col-span-8 lg:col-start-5"
            >
              <div className="ps-panel-inner">
                <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4 lg:flex-nowrap">
                  <p className="display-sm hidden lg:block">{pkg.name}</p>
                  {/* Two different amounts: the build once, management per month. */}
                  <dl className="ps-prices grid shrink-0 grid-cols-2 gap-x-6 lg:block lg:text-right">
                    <div>
                      <dt className="label-mono">{labels.onceLabel}</dt>
                      <dd className="mt-1 text-[1.9rem] font-semibold leading-none tracking-[-0.03em] text-ink lg:text-[2.2rem]">
                        {pkg.priceAmount}
                      </dd>
                      {pkg.scopeDriven ? (
                        <dd className="label-mono mt-2 text-accent">{labels.scopeTag}</dd>
                      ) : null}
                    </div>
                    <div className="border-l border-line pl-6 lg:mt-3 lg:border-l-0 lg:border-t lg:pl-0 lg:pt-3">
                      <dt className="label-mono">{labels.monthlyLabel}</dt>
                      <dd className="mt-1 text-[1.05rem] font-medium leading-snug text-body">
                        {pkg.monthly}
                      </dd>
                    </div>
                  </dl>
                </div>

                <div className="mt-8 grid gap-8 border-t border-line pt-6 sm:grid-cols-2">
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
                                <span className="shrink-0 text-ink">{item.price}</span>
                              </li>
                            ))}
                          </ul>
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
                    data-track-event="primary_cta_click"
                    data-track-category="pricing"
                    data-track-label={pkg.id}
                    data-track-location="pricing-selector"
                  >
                    {labels.ctaLabel}
                  </CtaLink>
                </div>
              </div>
            </div>
          </Fragment>
        );
      })}
    </div>
  );
}
