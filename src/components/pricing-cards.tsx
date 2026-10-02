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
  ctaLabel: string;
  /** Jump to the type's full detail further down the page. */
  detailsLabel: string;
};

type PricingCardsProps = {
  packages: SelectorPackage[];
  labels: PricingCardLabels;
  discount?: SelectorDiscount;
};

/**
 * The website project types side by side: name, who it is for, what it
 * starts at and three to five points that set it apart. Everything a
 * visitor needs to compare the types is visible without opening anything;
 * the full list of what is included sits in the details further down, which
 * the second link on every card jumps to.
 *
 * One column on a phone, two on a tablet or small laptop, four from 1280px
 * up. The cells are separated by hairlines rather than boxed, in line with
 * the rest of the site, and stretch to the tallest cell so the actions line
 * up. From sm up the grid hangs a cell's padding outside the container, so
 * the text of the first and last cell aligns with the headings above.
 */
export default function PricingCards({ packages, labels, discount }: PricingCardsProps) {
  return (
    <ul className="grid gap-px border-y border-line bg-line sm:-mx-5 sm:grid-cols-2 lg:-mx-6 xl:grid-cols-4">
      {packages.map((pkg) => (
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
              href={pkg.plannerHref}
              className="w-full"
              data-track-event="pricing_cta_click"
              data-track-package-id={pkg.id}
              data-track-cta-target="planner"
              data-track-placement="pricing_cards"
            >
              {labels.ctaLabel}
            </CtaLink>
            <a
              href={`#${pkg.id}`}
              className="link-static mt-3 inline-block text-[0.9rem] text-muted hover:text-ink"
              data-track-event="pricing_package_select"
              data-track-package-id={pkg.id}
            >
              {labels.detailsLabel}
              <span aria-hidden="true" className="ml-1.5">
                ↓
              </span>
            </a>
          </div>
        </li>
      ))}
    </ul>
  );
}
