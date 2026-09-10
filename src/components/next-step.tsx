import CtaLink from "@/components/cta-link";

type NextStepProps = {
  title: string;
  text: string;
  primaryLabel: string;
  primaryHref: string;
  secondaryLabel?: string;
  secondaryHref?: string;
  trackingContext?: "service" | "article" | "projects" | "pricing" | "process";
};

/**
 * Closing block of a sub page: one question, one sentence, one primary action,
 * set on an ink panel so the page ends with a clear visual full stop.
 */
export default function NextStep({
  title,
  text,
  primaryLabel,
  primaryHref,
  secondaryLabel,
  secondaryHref,
  trackingContext = "service",
}: NextStepProps) {
  const eventName =
    trackingContext === "article" ? "article_cta_click" : "contact_cta_click";

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
          <CtaLink
            href={primaryHref}
            variant="inverse"
            data-track-event={eventName}
            data-track-category={trackingContext}
            data-track-label={primaryLabel}
            data-track-location="next-step-primary"
          >
            {primaryLabel}
          </CtaLink>
          {secondaryLabel && secondaryHref ? (
            <CtaLink
              href={secondaryHref}
              variant="text-light"
              data-track-event="primary_cta_click"
              data-track-category={trackingContext}
              data-track-label={secondaryLabel}
              data-track-location="next-step-secondary"
            >
              {secondaryLabel}
            </CtaLink>
          ) : null}
        </div>
      </div>
    </section>
  );
}
