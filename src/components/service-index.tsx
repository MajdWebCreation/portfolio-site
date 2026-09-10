import Link from "next/link";
import type { CSSProperties } from "react";
import {
  serviceFamilies,
  type LocalizedService,
  type ServiceFamily,
  type ServiceKey,
} from "@/lib/content/services";
import type { Locale } from "@/lib/content/site-content";

type FamilyCopy = ServiceFamily["locale"][Locale];

type PricingCopy = {
  package: string;
  custom: string;
  improve: Partial<Record<ServiceKey, string>>;
};

type ServiceIndexProps = {
  locale: Locale;
  services: LocalizedService[];
  pricing: PricingCopy;
  pricingHref: string;
  buildTitle: string;
  improveTitle: string;
  improveText: string;
  trackingLocation: string;
};

const tracking = (label: string, location: string) => ({
  "data-track-event": "service_cta_click",
  "data-track-category": "services",
  "data-track-label": label,
  "data-track-location": location,
});

function PriceLabel({
  service,
  pricing,
  pricingHref,
}: {
  service: LocalizedService;
  pricing: PricingCopy;
  pricingHref: string;
}) {
  if (service.kind === "package") {
    return (
      <Link
        href={pricingHref}
        className="label-mono link-static inline-block text-muted hover:text-ink"
        data-track-event="primary_cta_click"
        data-track-category="services"
        data-track-label="pricing"
        data-track-location="services-index-price"
      >
        {pricing.package}
      </Link>
    );
  }

  const label =
    service.kind === "improve"
      ? (pricing.improve[service.key] ?? pricing.custom)
      : pricing.custom;

  return <span className="label-mono inline-block">{label}</span>;
}

/* The three website routes inside the websites family. */
function WebsiteEntries({
  family,
  services,
  trackingLocation,
}: {
  family: ServiceFamily;
  services: LocalizedService[];
  trackingLocation: string;
}) {
  return (
    <ul className="border-t border-line">
      {family.members.map((key) => {
        const service = services.find((item) => item.key === key);
        if (!service) return null;
        const minor = family.minor?.includes(key);

        return (
          <li key={key} className="border-b border-line">
            <Link
              href={service.path}
              {...tracking(service.navLabel, trackingLocation)}
              className={`svc-row group grid gap-x-6 gap-y-1 sm:grid-cols-[minmax(0,13rem)_1fr_auto] sm:items-baseline ${
                minor ? "py-3.5" : "py-5"
              }`}
            >
              <span
                className={`svc-title font-semibold leading-snug tracking-[-0.02em] text-ink ${
                  minor ? "text-[1.05rem]" : "text-[1.3rem] sm:text-[1.4rem]"
                }`}
              >
                {service.navLabel}
              </span>
              <span
                className={`leading-relaxed text-muted ${
                  minor ? "text-[0.92rem]" : "text-[0.98rem]"
                }`}
              >
                {service.summary}
              </span>
              <span aria-hidden="true" className="svc-arrow hidden text-faint sm:block">
                →
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/* Layers of an application: a vertical rail that lights up top to bottom. */
function LayersDetail({ label, items }: { label: string; items: string[] }) {
  return (
    <div>
      <p className="label-mono">{label}</p>
      <ol className="relative mt-3 grid gap-x-8 sm:grid-cols-2">
        {items.map((item, index) => (
          <li
            key={item}
            className="svc-seq flex items-center gap-3 border-t border-line py-2 text-[0.95rem] text-body"
            style={{ "--i": index } as CSSProperties}
          >
            <span aria-hidden="true" className="svc-dot block h-[7px] w-[7px] shrink-0 rounded-full border border-line-strong bg-surface" />
            {item}
          </li>
        ))}
      </ol>
    </div>
  );
}

/* Steps of a configurator: left to right, joined by a hairline. */
function FlowDetail({ label, items }: { label: string; items: string[] }) {
  return (
    <div>
      <p className="label-mono">{label}</p>
      <ol className="mt-3 flex flex-wrap items-center gap-y-2">
        {items.map((item, index) => (
          <li
            key={item}
            className="svc-seq flex items-center text-[0.92rem] text-body"
            style={{ "--i": index } as CSSProperties}
          >
            {index > 0 ? (
              <span aria-hidden="true" className="svc-joint mx-2 block h-px w-4 bg-line-strong sm:w-5" />
            ) : null}
            <span className="svc-step rounded-xs border border-line px-2 py-1 leading-none">
              {item}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/* Systems an integration connects: a plain inline list. */
function ListDetail({ label, items }: { label: string; items: string[] }) {
  return (
    <div>
      <p className="label-mono">{label}</p>
      <ul className="mt-3 flex flex-wrap gap-x-2 gap-y-2">
        {items.map((item, index) => (
          <li
            key={item}
            className="svc-seq flex items-center gap-2 text-[0.92rem] text-body"
            style={{ "--i": index } as CSSProperties}
          >
            {index > 0 ? (
              <span aria-hidden="true" className="text-faint">
                ·
              </span>
            ) : null}
            <span className="svc-step">{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function FamilyDetail({ copy }: { copy: FamilyCopy }) {
  if (!copy.detail) return null;
  if (copy.detail.kind === "layers") return <LayersDetail {...copy.detail} />;
  if (copy.detail.kind === "flow") return <FlowDetail {...copy.detail} />;
  return <ListDetail {...copy.detail} />;
}

/**
 * The services index as one editorial composition: four product families at
 * two scales for new work, then a compact band for improving what exists.
 * A family with one route is a single link; the websites family lists its
 * three routes. Hover fills the family's top rule and lights up its detail.
 */
export default function ServiceIndex({
  locale,
  services,
  pricing,
  pricingHref,
  buildTitle,
  improveTitle,
  improveText,
  trackingLocation,
}: ServiceIndexProps) {
  const families = serviceFamilies;
  const improveServices = services.filter((service) => service.group === "improve");
  const xl = families.filter((family) => family.scale === "xl");
  const lg = families.filter((family) => family.scale === "lg");

  const renderHead = (
    family: ServiceFamily,
    copy: FamilyCopy,
    service?: LocalizedService,
    linked = false,
  ) => (
    <div>
      <span className="flex items-baseline gap-3">
        {family.emphasis ? (
          <span aria-hidden="true" className="relative top-[-0.15em] block h-[8px] w-[8px] shrink-0 rounded-full bg-accent" />
        ) : null}
        <h3
          className={`svc-title text-ink ${
            family.scale === "xl" ? "display-md" : "display-sm"
          }`}
        >
          {copy.title}
        </h3>
        {linked ? (
          <span
            aria-hidden="true"
            className={`svc-arrow ml-auto hidden pl-4 text-faint sm:block ${
              family.scale === "xl" ? "display-sm" : ""
            }`}
          >
            →
          </span>
        ) : null}
      </span>
      <p
        className={`mt-3 leading-relaxed text-muted ${
          family.scale === "xl" ? "max-w-md text-[1rem]" : "max-w-sm text-[0.95rem]"
        }`}
      >
        {copy.text}
      </p>
      {service ? (
        <p className="mt-4">
          <PriceLabel service={service} pricing={pricing} pricingHref={pricingHref} />
        </p>
      ) : null}
    </div>
  );

  return (
    <div>
      {/* New digital product. */}
      <section aria-labelledby="services-build" className="container-x">
        <h2 id="services-build" className="label-mono border-b border-line pb-3 text-ink">
          {buildTitle}
        </h2>

        {xl.map((family) => {
          const copy = family.locale[locale];
          const single =
            family.members.length === 1
              ? services.find((item) => item.key === family.members[0])
              : undefined;

          if (single) {
            return (
              <Link
                key={family.key}
                href={single.path}
                {...tracking(copy.title, trackingLocation)}
                className="svc-family group relative grid gap-8 border-t-2 border-ink py-9 lg:grid-cols-12 lg:gap-8 lg:py-12"
              >
                <div className="lg:col-span-5">{renderHead(family, copy, single, true)}</div>
                <div className="lg:col-span-6 lg:col-start-7">
                  <FamilyDetail copy={copy} />
                </div>
              </Link>
            );
          }

          const first = services.find((item) => item.key === family.members[0]);

          return (
            <div
              key={family.key}
              className="grid gap-8 border-t-2 border-ink py-9 lg:grid-cols-12 lg:gap-8 lg:py-12"
            >
              <div className="lg:col-span-5">{renderHead(family, copy, first)}</div>
              <div className="lg:col-span-7">
                <WebsiteEntries
                  family={family}
                  services={services}
                  trackingLocation={trackingLocation}
                />
              </div>
            </div>
          );
        })}

        <div className="grid border-t-2 border-ink md:grid-cols-2">
          {lg.map((family, index) => {
            const copy = family.locale[locale];
            const service = services.find((item) => item.key === family.members[0]);
            if (!service) return null;

            return (
              <Link
                key={family.key}
                href={service.path}
                {...tracking(copy.title, trackingLocation)}
                className={`svc-family group relative flex flex-col justify-between gap-7 py-8 lg:py-10 ${
                  index === 0
                    ? "border-b border-line md:border-b-0 md:border-r md:pr-10 lg:pr-14"
                    : "md:pl-10 lg:pl-14"
                }`}
              >
                <div>{renderHead(family, copy, service, true)}</div>
                <FamilyDetail copy={copy} />
              </Link>
            );
          })}
        </div>
      </section>

      {/* Improving an existing environment. */}
      <section aria-labelledby="services-improve" className="mt-16 bg-paper-deep lg:mt-24">
        <div className="container-x grid gap-8 py-14 lg:grid-cols-12 lg:gap-8 lg:py-20">
          <div className="lg:col-span-4">
            <h2 id="services-improve" className="display-sm">
              {improveTitle}
            </h2>
            <p className="mt-3 max-w-sm text-[0.98rem] leading-relaxed text-muted">
              {improveText}
            </p>
          </div>
          <ul className="border-t border-line-strong lg:col-span-7 lg:col-start-6">
            {improveServices.map((service) => (
              <li key={service.key} className="border-b border-line-strong">
                <Link
                  href={service.path}
                  {...tracking(service.navLabel, `${trackingLocation}-improve`)}
                  className="svc-row group grid gap-x-6 gap-y-1.5 py-5 sm:grid-cols-[1fr_auto] sm:items-start"
                >
                  <span>
                    <span className="svc-title block text-[1.2rem] font-semibold leading-snug tracking-[-0.02em] text-ink">
                      {service.navLabel}
                    </span>
                    <span className="mt-1 block max-w-lg text-[0.95rem] leading-relaxed text-muted">
                      {service.summary}
                    </span>
                  </span>
                  <span className="flex items-baseline gap-4 sm:pt-1">
                    <PriceLabel service={service} pricing={pricing} pricingHref={pricingHref} />
                    <span aria-hidden="true" className="svc-arrow hidden text-faint sm:block">
                      →
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
