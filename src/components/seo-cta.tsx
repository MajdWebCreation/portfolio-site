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
    <section className="relative border-t border-[color:var(--line)] pt-10">
      <div className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-end">
        <div className="max-w-3xl">
          <p className="text-[11px] uppercase tracking-[0.3em] text-[var(--accent-text)]">
            Next move
          </p>
          <h2 className="mt-4 text-3xl font-semibold leading-tight text-[var(--foreground)] sm:text-4xl">
            {title}
          </h2>
          <p className="mt-4 max-w-2xl text-base leading-8 text-[color:var(--muted-foreground)]">
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
            className="rounded-full border border-[color:var(--line-strong)] bg-[var(--button-bg)] px-6 py-3 text-sm font-medium text-[var(--button-text)] transition hover:opacity-92"
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
            className="inline-flex items-center text-sm font-medium text-[color:var(--muted-foreground)] transition hover:text-[var(--foreground)]"
          >
            {secondaryLabel}
            <span className="ml-2 text-[var(--accent-text)]">→</span>
          </Link>
        </div>
      </div>
    </section>
  );
}
