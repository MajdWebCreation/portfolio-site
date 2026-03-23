import Link from "next/link";

type SeoCtaProps = {
  title: string;
  text: string;
  primaryLabel: string;
  primaryHref: string;
  secondaryLabel: string;
  secondaryHref: string;
  trackingContext?: "service" | "article" | "projects" | "contact";
};

export default function SeoCta({
  title,
  text,
  primaryLabel,
  primaryHref,
  secondaryLabel,
  secondaryHref,
  trackingContext = "service",
}: SeoCtaProps) {
  return (
    <section className="relative border-t border-white/10 pt-10">
      <div className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-end">
        <div className="max-w-3xl">
          <p className="text-[11px] uppercase tracking-[0.3em] text-cyan-200/72">
            Next move
          </p>
          <h2 className="mt-4 text-3xl font-semibold leading-tight text-white sm:text-4xl">
            {title}
          </h2>
          <p className="mt-4 max-w-2xl text-base leading-8 text-white/58">
            {text}
          </p>
        </div>

        <div className="flex flex-wrap gap-x-6 gap-y-3 lg:justify-end">
          <Link
            href={primaryHref}
            data-track-event={
              trackingContext === "article" ? "article_cta_click" : "primary_cta_click"
            }
            data-track-category={trackingContext}
            data-track-label={primaryLabel}
            data-track-location="seo-cta-primary"
            className="rounded-full border border-white/12 bg-white px-6 py-3 text-sm font-medium text-black transition hover:opacity-90"
          >
            {primaryLabel}
          </Link>

          <Link
            href={secondaryHref}
            data-track-event={
              trackingContext === "article" ? "article_cta_click" : "primary_cta_click"
            }
            data-track-category={trackingContext}
            data-track-label={secondaryLabel}
            data-track-location="seo-cta-secondary"
            className="inline-flex items-center text-sm font-medium text-white/58 transition hover:text-white"
          >
            {secondaryLabel}
            <span className="ml-2 text-cyan-200/72">→</span>
          </Link>
        </div>
      </div>
    </section>
  );
}