import ContactForm from "@/components/contact-form";
import {
  businessInfo,
  type Locale,
  type SiteContent,
} from "@/lib/content/site-content";

type ContactPanelProps = {
  locale: Locale;
  content: SiteContent["contact"];
  footer: SiteContent["footer"];
};

export default function ContactPanel({
  locale,
  content,
  footer,
}: ContactPanelProps) {
  const formCopy =
    locale === "nl"
      ? {
          eyebrow: "Contactformulier",
          title: "Vertel kort wat je wilt laten bouwen.",
          description:
            "Vul het formulier in en we nemen zo snel mogelijk contact met je op.",
          nameLabel: "Naam",
          emailLabel: "E-mail",
          companyLabel: "Bedrijf",
          messageLabel: "Bericht",
          namePlaceholder: "Jouw naam",
          emailPlaceholder: "jij@bedrijf.nl",
          companyPlaceholder: "Bedrijfsnaam",
          messagePlaceholder:
            "Vertel kort wat je zoekt en wat je ongeveer wilt laten bouwen.",
          submitLabel: "Verstuur aanvraag",
          sendingLabel: "Versturen...",
          successMessage: "Bericht verzonden. We nemen snel contact op.",
          errorMessage:
            "Er ging iets mis. Probeer het opnieuw of mail direct naar contact@ymcreations.com.",
        }
      : {
          eyebrow: "Contact form",
          title: "Tell us what you want to build.",
          description:
            "Fill in the form and we’ll get back to you as soon as possible.",
          nameLabel: "Name",
          emailLabel: "Email",
          companyLabel: "Company",
          messageLabel: "Message",
          namePlaceholder: "Your name",
          emailPlaceholder: "you@company.com",
          companyPlaceholder: "Company name",
          messagePlaceholder:
            "Tell us what you need and what you want to build.",
          submitLabel: "Send inquiry",
          sendingLabel: "Sending...",
          successMessage: "Message sent. We’ll get back to you soon.",
          errorMessage:
            "Something went wrong. Try again or email contact@ymcreations.com directly.",
        };

  return (
    <div className="grid gap-8 lg:grid-cols-[0.88fr_1.12fr] lg:items-start">
      <section className="rounded-[2.1rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.035),rgba(255,255,255,0.015))] p-6 md:p-8">
        <p className="text-[11px] uppercase tracking-[0.3em] text-cyan-300/76">
          {content.signal}
        </p>

        <h2 className="mt-5 max-w-lg text-3xl font-semibold leading-tight text-white sm:text-4xl">
          {locale === "nl"
            ? "Een kort bericht is genoeg om te starten."
            : "A short message is enough to get started."}
        </h2>

        <p className="mt-5 max-w-md text-sm leading-7 text-white/58">
          {locale === "nl"
            ? "Geen lang intakeformulier. Vertel kort waar je aan werkt, wat je nodig hebt en wat de volgende stap ongeveer moet zijn."
            : "No long intake flow. Briefly share what you’re working on, what you need, and what the next step should roughly be."}
        </p>

        <div className="mt-8 space-y-4 border-t border-white/10 pt-6">
          <div className="flex items-start justify-between gap-4 border-b border-white/8 pb-4">
            <span className="text-[10px] uppercase tracking-[0.26em] text-white/38">
              Email
            </span>
            <span className="text-sm text-white/72">{businessInfo.email}</span>
          </div>

          <div className="flex items-start justify-between gap-4 border-b border-white/8 pb-4">
            <span className="text-[10px] uppercase tracking-[0.26em] text-white/38">
              {locale === "nl" ? "Telefoon" : "Phone"}
            </span>
            <span className="text-sm text-white/72">{businessInfo.phone}</span>
          </div>

          <div className="flex items-start justify-between gap-4 border-b border-white/8 pb-4">
            <span className="text-[10px] uppercase tracking-[0.26em] text-white/38">
              {footer.kvkLabel}
            </span>
            <span className="text-sm text-white/72">{businessInfo.kvk}</span>
          </div>
        </div>
      </section>

      <ContactForm copy={formCopy} className="min-h-full" hideIntro />
    </div>
  );
}