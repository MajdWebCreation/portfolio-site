import CtaLink from "@/components/cta-link";
import {
  OriginalPrice,
  type SelectorDiscount,
  type SelectorPackage,
} from "@/components/pricing-selector";

export type PricingCardLabels = {
  /** Above the starting amount: "Vanaf". */
  fromLabel: string;
  /** Before the monthly amount: "Technisch beheer" + "vanaf € 15 p/m". */
  managementLabel: string;
  /** Under a scope-driven amount: what the starting price covers. */
  scopeNote: string;
  /** Jump to the type's full detail further down the panel. */
  detailsLabel: string;
};

type PricingCardsProps = {
  packages: SelectorPackage[];
  labels: PricingCardLabels;
  discount?: SelectorDiscount;
};

/**
 * The project types of one category side by side: name, who it is for,
 * what it starts at and three to five points that set it apart. Everything
 * a visitor needs to compare the types is visible without opening
 * anything; the full list of what is included sits in the details under
 * the cards, which the second link on every card jumps to. The main action
 * leads to the contact form with the type filled in.
 *
 * As many columns as there are types, never more: two types share a row
 * from a tablet up, one type keeps a column's width and leaves the rest of
 * the row open rather than reserving cells nothing fills. The cells are
 * separated by hairlines rather than boxed, in line with the rest of the
 * site, and stretch to the tallest cell so the actions line up. From sm up
 * the grid hangs a cell's padding outside the container, so the text of the
 * first and last cell aligns with the headings above.
 */
export default function PricingCards({ packages, labels, discount }: PricingCardsProps) {
  const columns =
    packages.length === 1
      ? "sm:max-w-[36rem] sm:border-r sm:border-line"
      : "sm:-mx-5 sm:grid-cols-2 lg:-mx-6";

  return (
    <ul className={`grid gap-px border-y border-line bg-line ${columns}`}>
      {packages.map((pkg) => {
        const action = { href: pkg.requestHref, label: pkg.requestLabel, target: "contact" as const };

        return (
          <li key={pkg.id} className="flex flex-col bg-paper py-6 sm:px-5 lg:px-6">
            <h3 className="text-[1.25rem] font-semibold leading-snug tracking-[-0.02em] text-ink">
              {pkg.name}
            </h3>
            <p className="mt-1 text-[0.92rem] leading-snug text-muted">{pkg.tagline}</p>

            <div className="mt-6">
              <p className="label-mono">{labels.fromLabel}</p>
              <p className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="tabular text-[2rem] font-semibold leading-none tracking-[-0.03em] text-ink">
                  {pkg.priceAmount}
                </span>
                {discount && pkg.originalPriceAmount ? (
                  <span className="text-[1rem] leading-none">
                    <OriginalPrice amount={pkg.originalPriceAmount} label={discount.originalLabel} />
                  </span>
                ) : null}
              </p>
              {discount && pkg.originalPriceAmount ? (
                <p className="mt-2 text-[0.82rem] leading-snug text-muted">{discount.note}</p>
              ) : null}
              {pkg.scopeDriven ? (
                <p className="mt-2 max-w-[18rem] text-[0.82rem] leading-snug text-muted">{labels.scopeNote}</p>
              ) : null}
              <p className="mt-2 text-[0.85rem] leading-snug text-muted">
                {labels.managementLabel} {pkg.monthly}
              </p>
            </div>

            <ul className="mt-6 space-y-2 border-t border-line pt-5 text-[0.95rem] leading-snug text-body">
              {pkg.highlights.map((item) => (
                <li key={item} className="flex gap-3">
                  <span aria-hidden="true" className="mt-[0.65em] h-px w-3 shrink-0 bg-ink" />
                  {item}
                </li>
              ))}
            </ul>

            <div className="mt-auto pt-8">
              <CtaLink
                href={action.href}
                className="w-full"
                data-track-event="pricing_cta_click"
                data-track-package-id={pkg.id}
                data-track-product-category={pkg.category}
                data-track-cta-target={action.target}
                data-track-placement="pricing_cards"
              >
                {action.label}
              </CtaLink>
              <div className="mt-3 flex flex-wrap items-baseline gap-x-5 gap-y-1 text-[0.9rem]">
                <a
                  href={`#${pkg.id}`}
                  className="link-static inline-block text-muted hover:text-ink"
                  data-track-event="pricing_package_select"
                  data-track-package-id={pkg.id}
                  data-track-product-category={pkg.category}
                >
                  {labels.detailsLabel}
                  <span aria-hidden="true" className="ml-1.5">
                    ↓
                  </span>
                </a>
                {pkg.secondaryAction ? (
                  <CtaLink
                    href={pkg.secondaryAction.href}
                    variant="text"
                    className="text-[0.9rem] text-muted"
                    data-track-event="pricing_cta_click"
                    data-track-package-id={pkg.id}
                    data-track-product-category={pkg.category}
                    data-track-cta-target={pkg.secondaryAction.target}
                    data-track-placement="pricing_cards"
                  >
                    {pkg.secondaryAction.label}
                  </CtaLink>
                ) : null}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
