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
    <section className="relative overflow-hidden rounded-[2.3rem] border border-white/10 bg-[#07111a] px-6 py-8 md:px-8 md:py-10">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.18),transparent_32%),radial-gradient(circle_at_bottom_right,rgba(110,180,255,0.12),transparent_28%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.01))]" />
      <div className="relative grid gap-8 lg:grid-cols-[1fr_auto] lg:items-end">
        <div>
          <p className="text-[11px] uppercase tracking-[0.3em] text-cyan-200/74">
            Next move
          </p>
          <h2 className="mt-4 max-w-3xl text-3xl font-semibold text-white sm:text-4xl">
          {title}
          </h2>
          <p className="mt-4 max-w-2xl text-base leading-8 text-white/65">
            {text}
          </p>
        </div>
        <div className="flex flex-wrap gap-3 lg:justify-end">
          <Link
            href={primaryHref}
            data-track-event={
              trackingContext === "article" ? "article_cta_click" : "primary_cta_click"
            }
            data-track-category={trackingContext}
            data-track-label={primaryLabel}
            data-track-location="seo-cta-primary"
            className="rounded-full border border-cyan-200/10 bg-white px-6 py-3 text-sm font-medium text-black shadow-[0_0_40px_rgba(255,255,255,0.12)] transition hover:opacity-90"
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
            className="rounded-full border border-white/15 bg-white/5 px-6 py-3 text-sm font-medium text-white transition hover:border-cyan-400/50 hover:bg-white/10"
          >
            {secondaryLabel}
          </Link>
        </div>
      </div>
    </section>
  );
}
