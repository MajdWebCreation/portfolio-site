import Link from "next/link";
import CtaLink from "@/components/cta-link";
import { getLocalizedPath } from "@/lib/content/routes";
import {
  businessInfo,
  type Locale,
  type SiteContent,
} from "@/lib/content/site-content";

type ContactCtaProps = {
  locale: Locale;
  content: SiteContent["contactCta"];
  headingId?: string;
};

/**
 * Closing block of the homepage: one line, one action, and the direct contact
 * details. The form itself lives on the contact page.
 */
export default function ContactCta({ locale, content, headingId }: ContactCtaProps) {
  return (
    <div className="grid gap-8 border-t-2 border-ink pt-8 lg:grid-cols-12 lg:gap-8 lg:pt-10">
      <div className="lg:col-span-7">
        <h2 id={headingId} className="display-lg max-w-[16ch]">
          {content.title}
        </h2>
        <p className="mt-5 max-w-lg text-[1.05rem] leading-relaxed text-muted max-md:hidden">
          {content.description}
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-4 max-md:mt-6">
          <CtaLink
            href={getLocalizedPath(locale, "contact")}
            data-track-event="contact_cta_click"
            data-track-category="homepage"
            data-track-label={content.primaryLabel}
            data-track-location="contact-cta"
          >
            {content.primaryLabel}
          </CtaLink>
          <Link
            href={getLocalizedPath(locale, "projectPlanner")}
            className="link-static text-[0.95rem] text-muted"
            data-track-event="primary_cta_click"
            data-track-category="homepage"
            data-track-label="project-planner"
            data-track-location="contact-cta"
          >
            {content.plannerLabel}
          </Link>
        </div>
      </div>
      <dl className="grid gap-4 self-end text-[0.98rem] lg:col-span-4 lg:col-start-9">
        <div className="border-t border-line pt-3">
          <dt className="label-mono">E-mail</dt>
          <dd className="mt-1">
            <a href={`mailto:${businessInfo.email}`} className="link-static text-ink">
              {businessInfo.email}
            </a>
          </dd>
        </div>
        <div className="border-t border-line pt-3">
          <dt className="label-mono">{locale === "nl" ? "Telefoon" : "Phone"}</dt>
          <dd className="mt-1">
            <a href={`tel:${businessInfo.phone}`} className="link-static tabular text-ink">
              {businessInfo.phoneDisplay}
            </a>
          </dd>
        </div>
        <p className="flex items-center gap-2.5 text-[0.85rem] text-muted">
          <span aria-hidden="true" className="block h-[7px] w-[7px] rounded-full bg-accent" />
          {content.replyNote}
        </p>
      </dl>
    </div>
  );
}
