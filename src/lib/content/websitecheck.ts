import { getDevelopmentDiscountCopy } from "@/lib/content/pricing";
import type { PricingCatalog } from "@/lib/pricing/catalog";

/**
 * Copy of the /websitecheck landing page. Dutch only: the page is the landing
 * page of a Dutch campaign and has no English counterpart.
 *
 * Every claim here is one the business can keep: the check is free, it is
 * done by a person, and the findings arrive by email. No response time for
 * the check itself, no rankings, no traffic, no results.
 */
export const websitecheckContent = {
  meta: {
    title: "Gratis websitecheck voor je bedrijfswebsite",
    description:
      "Vraag een gratis, vrijblijvende websitecheck aan. YM Creations bekijkt je huidige website persoonlijk op uitstraling, mobiel gebruik, duidelijkheid en techniek en stuurt je de bevindingen per e-mail.",
  },
  hero: {
    label: "Gratis websitecheck",
    title: "Past je website nog bij de kwaliteit van je bedrijf?",
    intro:
      "Ontvang gratis een korte, persoonlijke beoordeling van je huidige website en ontdek waar je online uitstraling beter kan.",
    trust: ["Vrijblijvend", "Geen verplichtingen", "Persoonlijk bekeken door YM Creations"],
  },
  scope: {
    label: "Wat we bekijken",
    title: "Zes punten die bepalen hoe je website overkomt",
    intro:
      "Geen technische audit van tientallen pagina's, maar een korte beoordeling in gewone taal die je meteen kunt gebruiken.",
    points: [
      {
        title: "Eerste indruk",
        text: "Ziet je website er net zo professioneel uit als je bedrijf? Uitstraling, beeld en typografie.",
      },
      {
        title: "Mobiel",
        text: "Werkt alles goed op een telefoon: leesbaar, makkelijk te bedienen, niets dat wegvalt.",
      },
      {
        title: "Duidelijkheid",
        text: "Begrijpt een bezoeker binnen een paar seconden wat je doet, voor wie, en waarom bij jou?",
      },
      {
        title: "Techniek en snelheid",
        text: "Laadtijd, basisveiligheid en technische staat, uitgelegd zonder jargon.",
      },
      {
        title: "Vertrouwen",
        text: "Zijn de signalen aanwezig die twijfel wegnemen: referenties, contactgegevens, bedrijfsinformatie?",
      },
      {
        title: "Structuur en volgende stap",
        text: "Is de opbouw logisch en is het duidelijk wat een bezoeker moet doen om contact op te nemen?",
      },
    ],
  },
  how: {
    label: "Zo werkt het",
    title: "Drie stappen, geen voorbereiding",
    note:
      "Een websitecheck is geen offerte en geen opdracht. Wil je daarna iets laten verbeteren of opnieuw laten bouwen, dan bespreken we dat pas als jij dat wilt.",
    steps: [
      {
        title: "Je vult het adres van je website in",
        text: "Meer hebben we niet nodig. Je hoeft niets voor te bereiden of toegang te geven.",
      },
      {
        title: "We bekijken je website persoonlijk",
        text: "Geen automatische scan: iemand van YM Creations loopt door je website op de zes punten hierboven.",
      },
      {
        title: "Je ontvangt de bevindingen per e-mail",
        text: "Kort en concreet: wat goed is, wat beter kan en wat het meest de moeite waard is om eerst op te pakken. Wat je ermee doet, bepaal je zelf.",
      },
    ],
  },
  who: {
    label: "Wie kijkt er",
    title: "Beoordeeld door mensen die zelf bouwen",
    text:
      "YM Creations is een Nederlands webbedrijf dat websites, webshops en webapplicaties in eigen code bouwt voor zakelijke opdrachtgevers. De beoordeling komt van dezelfde mensen die ze bouwen, niet uit een geautomatiseerde tool. Een paar websites die nu live draaien:",
    projectsLabel: "Bekijk alle projecten",
    visitLabel: "Bekijk de site",
  },
  faq: {
    label: "Veelgestelde vragen",
    title: "Voor je aanvraagt",
    items: [
      {
        question: "Wat kost een websitecheck?",
        answer: "Niets. De websitecheck is gratis en vrijblijvend. Je zit nergens aan vast en er volgt geen factuur.",
      },
      {
        question: "Moet ik daarna bij YM Creations laten bouwen?",
        answer:
          "Nee. Je ontvangt de bevindingen en beslist zelf wat je ermee doet. Wil je iets laten verbeteren of opnieuw laten bouwen, dan bespreken we dat pas als jij daarom vraagt.",
      },
      {
        question: "Hoe grondig is de beoordeling?",
        answer:
          "Het is een korte, persoonlijke beoordeling op de zes punten hierboven, geen volledige audit van elke pagina. Genoeg om te zien waar je website nu staat en wat het meest de moeite waard is om eerst op te pakken.",
      },
      {
        question: "Wat gebeurt er met mijn gegevens?",
        answer:
          "We gebruiken het adres van je website, je naam en je e-mailadres alleen om de websitecheck te maken en je de bevindingen te sturen. Meer daarover staat in de privacyverklaring, onderaan deze pagina.",
      },
    ],
  },
  closing: {
    title: "Benieuwd waar je website nu staat?",
    ctaLabel: "Vraag mijn gratis websitecheck aan",
    note: "Gratis en vrijblijvend",
  },
  form: {
    title: "Vraag je gratis websitecheck aan",
    websiteLabel: "Adres van je website",
    websitePlaceholder: "www.jouwbedrijf.nl",
    nameLabel: "Naam",
    namePlaceholder: "Voor- en achternaam",
    emailLabel: "E-mail",
    emailPlaceholder: "naam@bedrijf.nl",
    phoneLabel: "Telefoonnummer",
    phonePlaceholder: "06 12345678",
    optionalLabel: "optioneel",
    submitLabel: "Vraag mijn gratis websitecheck aan",
    sendingLabel: "Versturen…",
    confirmationNote: "Je ontvangt direct een bevestiging per e-mail.",
    businessNote: "YM Creations werkt voor zakelijke opdrachtgevers. Een websitecheck is vrijblijvend en nog geen opdracht.",
    privacyNote: "Je gegevens gebruiken we alleen om je websitecheck te maken en te beantwoorden. Meer daarover in de",
    privacyLabel: "privacyverklaring.",
    errors: {
      websiteUrl: "Vul het adres van je website in, bijvoorbeeld www.jouwbedrijf.nl",
      name: "Vul je naam in",
      email: "Vul een geldig e-mailadres in",
      phone: "Controleer je telefoonnummer",
    },
    checkFields: "Controleer de gemarkeerde velden en probeer opnieuw.",
    errorMessage: "Versturen is niet gelukt. Probeer het opnieuw of mail naar contact@ymcreations.com.",
    success: {
      label: "Aanvraag ontvangen",
      title: "Bedankt, we bekijken {host}.",
      text: "Je ontvangt nu eerst een bevestiging op {email}. Daarna bekijken we je website persoonlijk en sturen we de bevindingen naar hetzelfde adres.",
      note: "Iets toevoegen of een vraag? Mail naar contact@ymcreations.com.",
    },
  },
  promotion: {
    /** Under the campaign line: what the campaign does not touch. */
    scope: "Alleen op eenmalige ontwikkelkosten, niet op hosting of technisch beheer.",
  },
} as const;

export type WebsitecheckFormCopy = typeof websitecheckContent.form;

/** The campaign as the landing page shows it, or nothing. */
export type WebsitecheckPromotion = {
  /** "Tijdelijk 30% korting op de ontwikkelkosten", from the shared discount copy. */
  note: string;
  scope: string;
};

/**
 * The temporary discount on development costs, as a line on the landing
 * page. The percentage is the one the admin stored; the pricing page and the
 * planner read the same setting. Off, or a setting outside the accepted
 * range, means no line at all: the page carries no campaign of its own.
 */
export function websitecheckPromotion(catalog: Pick<PricingCatalog, "developmentDiscount">): WebsitecheckPromotion | null {
  const discount = catalog.developmentDiscount;
  if (!discount) return null;
  return {
    note: getDevelopmentDiscountCopy("nl", discount.percent).note,
    scope: websitecheckContent.promotion.scope,
  };
}
