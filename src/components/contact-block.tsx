import Link from "next/link";
import ContactForm from "@/components/contact-form";
import { getLocalizedPath, legalRoutes } from "@/lib/content/routes";
import {
  businessInfo,
  type Locale,
  type SiteContent,
} from "@/lib/content/site-content";

type ContactBlockProps = {
  locale: Locale;
  content: SiteContent["contact"];
  kvkLabel: string;
};

const formCopy = {
  nl: {
    nameLabel: "Naam",
    emailLabel: "E-mail",
    companyLabel: "Bedrijf",
    messageLabel: "Bericht",
    namePlaceholder: "Voor- en achternaam",
    emailPlaceholder: "naam@bedrijf.nl",
    companyPlaceholder: "Optioneel",
    messagePlaceholder:
      "Wat wil je laten bouwen, voor wie, en is er al een website of systeem?",
    submitLabel: "Verstuur bericht",
    sendingLabel: "Versturen…",
    successMessage: "Bericht ontvangen. Je krijgt een bevestiging per e-mail en snel een inhoudelijke reactie.",
    errorMessage:
      "Versturen is niet gelukt. Probeer het opnieuw of mail naar contact@ymcreations.com.",
  },
  en: {
    nameLabel: "Name",
    emailLabel: "Email",
    companyLabel: "Company",
    messageLabel: "Message",
    namePlaceholder: "First and last name",
    emailPlaceholder: "name@company.com",
    companyPlaceholder: "Optional",
    messagePlaceholder:
      "What do you want built, for whom, and is there an existing website or system?",
    submitLabel: "Send message",
    sendingLabel: "Sending…",
    successMessage: "Message received. You get an email confirmation and a substantive reply soon.",
    errorMessage:
      "Sending failed. Try again or email contact@ymcreations.com.",
  },
} as const;

/**
 * Direct contact details next to the form. Used on the homepage and the
 * contact page; each page provides its own introduction above it.
 */
export default function ContactBlock({
  locale,
  content,
  kvkLabel,
}: ContactBlockProps) {
  return (
    <div className="grid gap-10 lg:grid-cols-12 lg:gap-8">
      <div className="lg:col-span-4">
        <p className="label-mono">{content.directLabel}</p>
        <dl className="mt-3 divide-y divide-line border-y border-line">
          <div className="grid grid-cols-[5.5rem_1fr] gap-4 py-3 text-[0.98rem]">
            <dt className="text-muted">E-mail</dt>
            <dd>
              <a
                href={`mailto:${businessInfo.email}`}
                className="link-static break-all text-ink"
              >
                {businessInfo.email}
              </a>
            </dd>
          </div>
          <div className="grid grid-cols-[5.5rem_1fr] gap-4 py-3 text-[0.98rem]">
            <dt className="text-muted">{locale === "nl" ? "Telefoon" : "Phone"}</dt>
            <dd>
              <a
                href={`tel:${businessInfo.phone}`}
                className="link-static tabular text-ink"
              >
                {businessInfo.phoneDisplay}
              </a>
            </dd>
          </div>
          <div className="grid grid-cols-[5.5rem_1fr] gap-4 py-3 text-[0.98rem]">
            <dt className="text-muted">{kvkLabel}</dt>
            <dd className="tabular text-ink">{businessInfo.kvk}</dd>
          </div>
        </dl>
        <p className="mt-4 text-[0.9rem] text-muted">{content.replyNote}</p>
        <p className="mt-6 text-[0.95rem] leading-relaxed text-body">
          <Link
            href={getLocalizedPath(locale, "projectPlanner")}
            className="link-static"
            data-track-event="primary_cta_click"
            data-track-category="contact"
            data-track-label="project-planner"
            data-track-location="contact-block"
          >
            {content.plannerLabel}
          </Link>
        </p>
      </div>

      <div className="lg:col-span-7 lg:col-start-6">
        <ContactForm
          copy={formCopy[locale]}
          locale={locale}
          note={{
            text: content.businessNote,
            termsLabel: content.termsLabel,
            termsHref: legalRoutes.terms,
          }}
        />
      </div>
    </div>
  );
}
