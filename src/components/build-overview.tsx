import Link from "next/link";
import CtaLink from "@/components/cta-link";
import type { ServiceKey } from "@/lib/content/services";

type BuildGroup = {
  key: string;
  title: string;
  text: string;
  /** One-line version shown on mobile, where the index has to stay compact. */
  short: string;
  serviceKey: ServiceKey;
  size: "xl" | "lg";
  emphasis?: boolean;
  /**
   * Other services in the same family, as their own links.
   *
   * A family names more than one product but its tile can only lead to one of
   * them, so the rest are unreachable from here. These sit next to the tile
   * link rather than inside it: an anchor cannot contain an anchor.
   */
  more?: readonly { label: string; serviceKey: ServiceKey }[];
};

type BuildOverviewProps = {
  headingId: string;
  title: string;
  description: string;
  linkLabel: string;
  linkHref: string;
  groups: readonly BuildGroup[];
  hrefFor: (serviceKey: ServiceKey) => string;
};

const spans = ["xl:col-span-12", "xl:col-span-12", "xl:col-span-6", "xl:col-span-6"];

/**
 * The capabilities section as one composition on the ink band: an
 * introduction on the left, and on the right four product families set at
 * different scales and widths rather than six identical tiles.
 *
 * Below md the same markup collapses into a compact service index: heading,
 * four names with one short line each, and the link to all services last.
 */
export default function BuildOverview({
  headingId,
  title,
  description,
  linkLabel,
  linkHref,
  groups,
  hrefFor,
}: BuildOverviewProps) {
  return (
    <div className="container-x grid gap-12 py-16 max-md:gap-7 max-md:py-12 lg:grid-cols-12 lg:gap-8 lg:py-24">
      <div className="max-md:contents lg:col-span-4">
        <h2 id={headingId} className="display-lg text-paper">
          {title}
        </h2>
        <p className="mt-4 max-w-sm text-[1rem] leading-relaxed text-paper/70 max-md:hidden">
          {description}
        </p>
        <div className="mt-7 max-md:order-last max-md:mt-0">
          <CtaLink
            href={linkHref}
            variant="text-light"
            data-track-event="cta_click"
            data-track-cta-id="home_build_overview_services"
            data-track-cta-target="services"
            data-track-placement="build_overview"
          >
            {linkLabel}
          </CtaLink>
        </div>
      </div>

      <ul className="grid gap-x-8 border-t border-paper/15 lg:col-span-7 lg:col-start-6 xl:grid-cols-12">
        {groups.map((group, index) => (
          <li
            key={group.key}
            className={`border-b border-paper/15 ${spans[index % spans.length]} ${
              group.size === "xl" ? "py-7 max-md:py-4 lg:py-9" : "py-6 max-md:py-4 lg:py-8"
            }`}
          >
            <Link
              href={hrefFor(group.serviceKey)}
              data-track-event="service_cta_click"
              data-track-service-id={group.serviceKey}
              data-track-cta-id="build_overview_family"
              data-track-cta-target="service"
              data-track-placement="build_overview"
              className="group block"
            >
              <span className="flex items-baseline gap-4">
                {group.emphasis ? (
                  <span
                    aria-hidden="true"
                    className="relative top-[-0.15em] block h-[9px] w-[9px] shrink-0 rounded-full bg-accent-soft"
                  />
                ) : null}
                <span
                  className={`font-semibold leading-[1.05] tracking-[-0.025em] text-paper transition-transform duration-300 ease-out group-hover:translate-x-1 ${
                    group.size === "xl"
                      ? "text-[clamp(1.9rem,1.3rem+2.2vw,3.1rem)] max-md:text-[1.55rem]"
                      : "text-[clamp(1.45rem,1.15rem+1.1vw,1.85rem)] max-md:text-[1.35rem]"
                  }`}
                >
                  {group.title}
                </span>
                <span
                  aria-hidden="true"
                  className="ml-auto block text-paper/40 transition-[color,transform] duration-300 group-hover:translate-x-1 group-hover:text-paper"
                >
                  →
                </span>
              </span>
              <span
                className={`mt-2 block max-w-lg leading-relaxed text-paper/65 max-md:hidden ${
                  group.size === "xl" ? "text-[1rem]" : "text-[0.95rem]"
                }`}
              >
                {group.text}
              </span>
              <span className="mt-1 block text-[0.9rem] leading-snug text-paper/65 md:hidden">
                {group.short}
              </span>
            </Link>

            {group.more && group.more.length > 0 ? (
              <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 max-md:mt-2">
                {group.more.map((item) => (
                  <li key={item.serviceKey}>
                    <Link
                      href={hrefFor(item.serviceKey)}
                      data-track-event="service_cta_click"
                      data-track-service-id={item.serviceKey}
                      data-track-cta-id="build_overview_more"
                      data-track-cta-target="service"
                      data-track-placement="build_overview"
                      className="text-[0.95rem] text-paper/80 underline decoration-paper/35 underline-offset-4 transition-colors hover:text-paper hover:decoration-paper max-md:text-[0.9rem]"
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
