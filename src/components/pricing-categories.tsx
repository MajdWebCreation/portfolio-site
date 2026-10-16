"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { trackEvent } from "@/lib/analytics/track";
import {
  getProductCategory,
  isPackageId,
  isProductCategory,
  productCategories,
  type ProductCategory,
} from "@/lib/pricing";

export type PricingCategoryTab = {
  id: ProductCategory;
  name: string;
  descriptor: string;
};

type PricingCategoriesProps = {
  tabs: PricingCategoryTab[];
  /** The panel per category, rendered on the server; this component only decides which one shows. */
  panels: Record<ProductCategory, ReactNode>;
  /** Id of the heading that asks the question the tabs answer. */
  labelledBy: string;
  /** Before the open tab's name under the tabs: "Je bekijkt". */
  viewingLabel: string;
};

/*
  The URL hash names either a project type (#business, from a card or a
  deep link) or a category (#custom, from a route next to the cards). Both
  say which tab should be open; read without touching state.
*/
const subscribeHash = (onChange: () => void) => {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
};
const readHash = (): ProductCategory | null => {
  const hash = window.location.hash.slice(1);
  if (isProductCategory(hash)) return hash;
  if (isPackageId(hash)) return getProductCategory(hash);
  return null;
};
const noHash = () => null;

const defaultCategory: ProductCategory = productCategories[0];

/**
 * The first choice on the pricing page: website, webshop or custom work.
 * Three tabs, one panel visible at a time, so a visitor compares the two
 * or three types that fit what they want made rather than all five.
 *
 * Every panel is in the HTML, so the content is there without JavaScript
 * and for search engines; JavaScript only decides which one is shown, with
 * the website panel as the default. A hash on arrival or from a link on
 * the page (a type's details, "see custom work") opens the tab that holds
 * it; a tap on a tab is not written to the URL, so the hash keeps meaning
 * what a card or a detail row put there.
 */
export default function PricingCategories({ tabs, panels, labelledBy, viewingLabel }: PricingCategoriesProps) {
  const hashCategory = useSyncExternalStore(subscribeHash, readHash, noHash);
  const [choice, setChoice] = useState<ProductCategory | null>(null);
  /* A new hash wins over the last tap, as on the detail rows. */
  const [seenHash, setSeenHash] = useState(hashCategory);
  if (hashCategory !== seenHash) {
    setSeenHash(hashCategory);
    if (hashCategory) setChoice(hashCategory);
  }
  const active = choice ?? hashCategory ?? defaultCategory;
  const tabRefs = useRef<Partial<Record<ProductCategory, HTMLButtonElement | null>>>({});

  /*
    A hash that points into a panel other than the default one arrives
    while that panel is still hidden, so the browser could not scroll to
    it. Once the tab has switched, bring the target into view: the type's
    detail row, or the tabs themselves for a category hash.
  */
  useEffect(() => {
    if (!hashCategory) return;
    const hash = window.location.hash.slice(1);
    const target = isPackageId(hash) ? document.getElementById(hash) : tabRefs.current[hashCategory];
    const frame = window.requestAnimationFrame(() => {
      target?.scrollIntoView({ block: "start" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [hashCategory]);

  const select = (id: ProductCategory) => {
    if (id === active) return;
    trackEvent("pricing_category_select", { product_category: id });
    setChoice(id);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    const keys = ["ArrowRight", "ArrowLeft", "Home", "End"];
    if (!keys.includes(event.key)) return;
    event.preventDefault();
    const last = tabs.length - 1;
    const next =
      event.key === "ArrowRight"
        ? (index + 1) % tabs.length
        : event.key === "ArrowLeft"
          ? (index - 1 + tabs.length) % tabs.length
          : event.key === "Home"
            ? 0
            : last;
    const id = tabs[next].id;
    tabRefs.current[id]?.focus();
    select(id);
  };

  const activeTab = tabs.find((tab) => tab.id === active) ?? tabs[0];

  return (
    <div>
      {/* Three cells in one strip. The open one is set apart three ways at
          once -- a tinted fill, an accent bar along its top and ink text --
          so which category is being looked at reads at a glance; the other
          two stay plain, in the muted text of the rest of the page. */}
      <div
        role="tablist"
        aria-labelledby={labelledBy}
        className="grid grid-cols-3 gap-px overflow-hidden rounded-sm border border-line bg-line"
      >
        {tabs.map((tab, index) => {
          const selected = tab.id === active;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`pricing-tab-${tab.id}`}
              aria-selected={selected}
              aria-controls={`pricing-panel-${tab.id}`}
              tabIndex={selected ? 0 : -1}
              ref={(node) => {
                tabRefs.current[tab.id] = node;
              }}
              onClick={() => select(tab.id)}
              onKeyDown={(event) => onKeyDown(event, index)}
              className={`min-h-14 border-t-[3px] px-3 pb-3.5 pt-3 text-left transition-colors duration-200 focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-accent sm:px-5 sm:pb-4 sm:pt-3.5 ${
                selected
                  ? "border-accent bg-paper-deep text-ink"
                  : "border-transparent bg-paper text-muted hover:bg-paper-deep/60 hover:text-ink"
              }`}
            >
              <span className="block text-[1.05rem] font-semibold leading-snug tracking-[-0.01em] sm:text-[1.15rem]">
                {tab.name}
              </span>
              <span
                className={`mt-1 hidden max-w-[22rem] pr-2 text-[0.88rem] font-normal leading-snug sm:block ${
                  selected ? "text-body" : "text-muted"
                }`}
              >
                {tab.descriptor}
              </span>
            </button>
          );
        })}
      </div>
      {/* Says in words which tab is open: the name in ink, then who it is for. */}
      <p className="pt-4 text-[0.95rem] leading-snug text-muted">
        <span className="label-mono mr-2">{viewingLabel}</span>
        <strong className="font-semibold text-ink">{activeTab.name}</strong>
        <span aria-hidden="true"> · </span>
        {activeTab.descriptor}
      </p>

      {tabs.map((tab) => (
        <div
          key={tab.id}
          id={`pricing-panel-${tab.id}`}
          role="tabpanel"
          aria-labelledby={`pricing-tab-${tab.id}`}
          hidden={tab.id !== active}
          tabIndex={0}
          className="pt-7 outline-none sm:pt-9"
        >
          {panels[tab.id]}
        </div>
      ))}
    </div>
  );
}
