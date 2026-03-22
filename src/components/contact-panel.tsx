import Image from "next/image";
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
    <div className="grid gap-8 lg:grid-cols-[0.95fr_1.05fr] lg:items-start">
      <section className="relative overflow-hidden rounded-[2.3rem] border border-white/10 bg-[#07111a] p-6 md:p-8">
        <Image
          src="/images/visuals/contact-signal-visual.png"
          alt=""
          fill
          sizes="(min-width: 1024px) 36vw, 100vw"
          className="object-cover object-center opacity-24"
        />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(4,7,12,0.22),rgba(4,7,12,0.78)_55%,rgba(4,7,12,0.96))]" />
        <div className="absolute inset-x-0 top-0 h-32 bg-[radial-gradient(circle_at_top,rgba(113,227,255,0.18),transparent_62%)]" />
        <div className="relative">
          <p className="mb-4 text-sm uppercase tracking-[0.3em] text-cyan-300/80">
            {content.eyebrow}
          </p>
          <h2 className="max-w-3xl text-4xl font-semibold leading-tight text-white sm:text-5xl">
            {content.title}
          </h2>
          <p className="mt-6 max-w-2xl text-base leading-8 text-white/65">
            {content.description}
          </p>

          <div className="mt-10">
            <p className="text-xs uppercase tracking-[0.28em] text-cyan-300/75">
              {content.signal}
            </p>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div className="border-b border-white/10 pb-4 text-sm text-white/72">
                <p>{businessInfo.email}</p>
                <p className="mt-3">{businessInfo.phone}</p>
              </div>
              <div className="border-b border-white/10 pb-4 text-sm text-white/72">
                <p>ymcreations.com</p>
                <p className="mt-3">
                  {footer.kvkLabel}: {businessInfo.kvk}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <ContactForm copy={formCopy} className="min-h-full" />
    </div>
  );
}
