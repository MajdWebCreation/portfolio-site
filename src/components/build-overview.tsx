import Link from "next/link";
import CtaLink from "@/components/cta-link";
import type { ServiceKey } from "@/lib/content/services";

type BuildGroup = {
  key: string;
  title: string;
  text: string;
  serviceKey: ServiceKey;
  size: "xl" | "lg";
  emphasis?: boolean;
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
    <div className="container-x grid gap-12 py-16 lg:grid-cols-12 lg:gap-8 lg:py-24">
      <div className="lg:col-span-4">
        <h2 id={headingId} className="display-lg text-paper">
          {title}
        </h2>
        <p className="mt-4 max-w-sm text-[1rem] leading-relaxed text-paper/70">
          {description}
        </p>
        <div className="mt-7">
          <CtaLink
            href={linkHref}
            variant="text-light"
            data-track-event="primary_cta_click"
            data-track-category="homepage"
            data-track-label={linkLabel}
            data-track-location="build-overview"
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
              group.size === "xl" ? "py-7 lg:py-9" : "py-6 lg:py-8"
            }`}
          >
            <Link
              href={hrefFor(group.serviceKey)}
              data-track-event="service_cta_click"
              data-track-category="homepage"
              data-track-label={group.title}
              data-track-location="build-overview"
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
                      ? "text-[clamp(1.9rem,1.3rem+2.2vw,3.1rem)]"
                      : "text-[clamp(1.45rem,1.15rem+1.1vw,1.85rem)]"
                  }`}
                >
                  {group.title}
                </span>
                <span
                  aria-hidden="true"
                  className="ml-auto hidden text-paper/40 transition-[color,transform] duration-300 group-hover:translate-x-1 group-hover:text-paper sm:block"
                >
                  →
                </span>
              </span>
              <span
                className={`mt-2 block max-w-lg leading-relaxed text-paper/65 ${
                  group.size === "xl" ? "text-[1rem]" : "text-[0.95rem]"
                }`}
              >
                {group.text}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
