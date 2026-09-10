import CtaLink from "@/components/cta-link";

type ProcessCtaProps = {
  headingId: string;
  label: string;
  title: string;
  text: string;
  primaryLabel: string;
  primaryHref: string;
  secondaryLabel: string;
  secondaryHref: string;
};

/**
 * Closing block of the werkwijze page: the next step, set as a last node on
 * the same rail as the phases instead of a separate panel.
 */
export default function ProcessCta({
  headingId,
  label,
  title,
  text,
  primaryLabel,
  primaryHref,
  secondaryLabel,
  secondaryHref,
}: ProcessCtaProps) {
  return (
    <div className="container-x">
      <div className="pt-cta-rail relative grid gap-x-8 gap-y-6 border-t border-line-strong pl-9 pt-8 sm:pl-12 lg:grid-cols-12 lg:pt-10">
        <span
          aria-hidden="true"
          className="absolute left-0 top-[2.35rem] block h-[11px] w-[11px] rounded-full bg-ink lg:top-[2.85rem]"
        />
        <div className="lg:col-span-7">
          <p className="label-mono text-accent">{label}</p>
          <h2 id={headingId} className="display-md mt-2 max-w-[18ch]">
            {title}
          </h2>
          <p className="mt-4 max-w-[32rem] text-[1.05rem] leading-relaxed text-muted">{text}</p>
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-4 lg:col-span-5 lg:justify-end lg:self-end">
          <CtaLink
            href={primaryHref}
            data-track-event="contact_cta_click"
            data-track-category="process"
            data-track-label={primaryLabel}
            data-track-location="process-cta-primary"
          >
            {primaryLabel}
          </CtaLink>
          <CtaLink
            href={secondaryHref}
            variant="text"
            data-track-event="primary_cta_click"
            data-track-category="process"
            data-track-label={secondaryLabel}
            data-track-location="process-cta-secondary"
          >
            {secondaryLabel}
          </CtaLink>
        </div>
      </div>
    </div>
  );
}
