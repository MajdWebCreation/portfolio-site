import Link from "next/link";
import CtaLink from "@/components/cta-link";

type ServiceCtaProps = {
  headingId: string;
  title: string;
  text: string;
  hintsLabel: string;
  hints: readonly string[];
  primaryLabel: string;
  primaryHref: string;
  secondaryLabel: string;
  secondaryHref: string;
};

/**
 * Closing block of the services index, for visitors who do not yet know which
 * type of product they need: one question, what to mention, one action. Set
 * on paper with a strong rule instead of a dark panel.
 */
export default function ServiceCta({
  headingId,
  title,
  text,
  hintsLabel,
  hints,
  primaryLabel,
  primaryHref,
  secondaryLabel,
  secondaryHref,
}: ServiceCtaProps) {
  return (
    <div className="container-x">
      <div className="grid gap-8 border-t-2 border-ink pt-8 lg:grid-cols-12 lg:gap-8 lg:pt-10">
        <div className="lg:col-span-7">
          <h2 id={headingId} className="display-md max-w-[18ch]">
            {title}
          </h2>
          <p className="mt-4 max-w-lg text-[1.05rem] leading-relaxed text-muted">{text}</p>
          <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-4">
            <CtaLink
              href={primaryHref}
              data-track-event="contact_cta_click"
              data-track-category="services-overview"
              data-track-label={primaryLabel}
              data-track-location="services-cta"
            >
              {primaryLabel}
            </CtaLink>
            <Link
              href={secondaryHref}
              className="link-static text-[0.95rem] text-muted"
              data-track-event="primary_cta_click"
              data-track-category="services-overview"
              data-track-label="project-planner"
              data-track-location="services-cta"
            >
              {secondaryLabel}
            </Link>
          </div>
        </div>
        <div className="lg:col-span-4 lg:col-start-9 lg:pt-2">
          <p className="label-mono">{hintsLabel}</p>
          <ul className="mt-3">
            {hints.map((hint) => (
              <li
                key={hint}
                className="flex gap-3 border-t border-line py-2.5 text-[0.95rem] leading-snug text-body"
              >
                <span aria-hidden="true" className="mt-[0.6em] h-px w-3 shrink-0 bg-accent" />
                {hint}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
