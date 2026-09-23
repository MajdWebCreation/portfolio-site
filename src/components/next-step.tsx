import CtaLink from "@/components/cta-link";
import { ctaTargetForHref } from "@/lib/analytics/targets";

type NextStepProps = {
  title: string;
  text: string;
  primaryLabel: string;
  primaryHref: string;
  secondaryLabel?: string;
  secondaryHref?: string;
  trackingContext?: "service" | "article" | "projects" | "pricing" | "process";
  /** The article this block closes, so its clicks count for that article. */
  articleSlug?: string;
};

/**
 * Closing block of a sub page: one question, one sentence, one primary action,
 * set on an ink panel so the page ends with a clear visual full stop.
 *
 * Measured as `cta_click` with an id that names the page kind and the
 * button, and the target read from the href; on an article, as
 * `article_cta_click` for that article instead.
 */
export default function NextStep({
  title,
  text,
  primaryLabel,
  primaryHref,
  secondaryLabel,
  secondaryHref,
  trackingContext = "service",
  articleSlug,
}: NextStepProps) {
  const tracking = (button: "primary" | "secondary", href: string) =>
    trackingContext === "article" && articleSlug
      ? {
          "data-track-event": "article_cta_click",
          "data-track-article-slug": articleSlug,
          "data-track-cta-target": ctaTargetForHref(href),
          "data-track-placement": "next_step",
        }
      : {
          "data-track-event": "cta_click",
          "data-track-cta-id": `${trackingContext}_next_step_${button}`,
          "data-track-cta-target": ctaTargetForHref(href),
          "data-track-placement": "next_step",
        };

  return (
    <section className="container-x">
      <div className="grid gap-8 rounded-md bg-ink p-6 text-paper sm:p-10 lg:grid-cols-12 lg:gap-8 lg:p-12">
        <div className="lg:col-span-7">
          <h2 className="display-md text-paper">{title}</h2>
          <p className="reading mt-4 text-[1.05rem] leading-relaxed text-paper/72">
            {text}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-4 lg:col-span-5 lg:justify-end lg:self-end">
          <CtaLink href={primaryHref} variant="inverse" {...tracking("primary", primaryHref)}>
            {primaryLabel}
          </CtaLink>
          {secondaryLabel && secondaryHref ? (
            <CtaLink href={secondaryHref} variant="text-light" {...tracking("secondary", secondaryHref)}>
              {secondaryLabel}
            </CtaLink>
          ) : null}
        </div>
      </div>
    </section>
  );
}
