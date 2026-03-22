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
            "Vul het formulier in en we nemen zo snel mogelijk contact met je op over je website, webshop of maatwerkproject.",
          nameLabel: "Naam",
          emailLabel: "E-mail",
          companyLabel: "Bedrijf",
          messageLabel: "Bericht",
          namePlaceholder: "Jouw naam",
          emailPlaceholder: "jij@bedrijf.nl",
          companyPlaceholder: "Bedrijfsnaam",
          messagePlaceholder:
            "Vertel kort wat je zoekt, wat voor bedrijf je hebt en wat je ongeveer wilt laten bouwen.",
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
            "Fill in the form and we’ll get back to you as soon as possible about your website, store, or custom project.",
          nameLabel: "Name",
          emailLabel: "Email",
          companyLabel: "Company",
          messageLabel: "Message",
          namePlaceholder: "Your name",
          emailPlaceholder: "you@company.com",
          companyPlaceholder: "Company name",
          messagePlaceholder:
            "Tell us what you need, what kind of business you have, and what you want to build.",
          submitLabel: "Send inquiry",
          sendingLabel: "Sending...",
          successMessage: "Message sent. We’ll get back to you soon.",
          errorMessage:
            "Something went wrong. Try again or email contact@ymcreations.com directly.",
        };

  return (
    <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
      <section className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6 backdrop-blur md:p-8">
        <p className="mb-4 text-sm uppercase tracking-[0.3em] text-cyan-300/80">
          {content.eyebrow}
        </p>
        <h2 className="max-w-3xl text-4xl font-semibold leading-tight text-white sm:text-5xl">
          {content.title}
        </h2>
        <p className="mt-6 max-w-2xl text-base leading-8 text-white/65">
          {content.description}
        </p>

        <div className="mt-8 rounded-[1.5rem] border border-white/10 bg-black/35 p-5">
          <p className="text-xs uppercase tracking-[0.28em] text-cyan-300/75">
            {content.signal}
          </p>
          <div className="mt-5 space-y-4 text-sm text-white/72">
            <p>{businessInfo.email}</p>
            <p>{businessInfo.phone}</p>
            <p>ymcreations.com</p>
            <p>{footer.kvkLabel}: {businessInfo.kvk}</p>
          </div>
        </div>
      </section>

      <ContactForm copy={formCopy} />
    </div>
  );
}
