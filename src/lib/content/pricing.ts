import type { Locale } from "@/lib/content/site-content";

/**
 * Copy of the pricing page. Packages, amounts and extensions live in
 * `@/lib/pricing`; this file only holds the words around them.
 *
 * The page reads top to bottom as one line of thought: what is true of every
 * website (hero and principles), which types there are and what they start
 * at (overview cards), what each type gets exactly (details), the project
 * type for software rather than a website (platform band), how an amount is
 * built up (model) and where to go when the type is not clear yet (closing).
 */
export type PricingPageContent = {
  metaTitle: string;
  metaDescription: string;
  hero: {
    label: string;
    title: string;
    intro: string;
  };
  /** Three short claims that hold for every website; said here and nowhere else on the page. */
  principles: {
    title: string;
    items: { title: string; text: string }[];
  };
  overview: {
    label: string;
    title: string;
    /** Above every starting amount, on the cards. */
    fromLabel: string;
    /** Before the monthly amount on a card: "Technisch beheer vanaf € 15 p/m". */
    managementLabel: string;
    vatNote: string;
    ctaLabel: string;
    /** Jump to the type's full detail further down the page. */
    detailsLabel: string;
  };
  details: {
    label: string;
    title: string;
    onceFromLabel: string;
    monthlyLabel: string;
    /** Under a scope-driven amount: what the starting price covers. */
    scopeNote: string;
    includedLabel: string;
    addOnsLabel: string;
    boundaryLabel: string;
    scopeLabel: string;
    ctaLabel: string;
  };
  platform: {
    label: string;
    title: string;
    text: string;
    fromLabel: string;
    highlightsLabel: string;
    ctaLabel: string;
    /** To the service page about web applications. */
    secondaryLabel: string;
  };
  model: {
    title: string;
    once: { label: string; title: string; text: string };
    monthly: { label: string; title: string; text: string; outside: string; external: string };
    note: string;
  };
  closing: {
    title: string;
    plannerLabel: string;
    contactLabel: string;
  };
};

export const pricingPageContent: Record<Locale, PricingPageContent> = {
  nl: {
    metaTitle: "Tarieven",
    metaDescription:
      "Tarieven van YM Creations: een eigen ontwerp voor iedere website en een duidelijke vanafprijs per projecttype, van compacte website tot webapplicatie of platform.",
    hero: {
      label: "Tarieven",
      title: "Een website die past bij jouw bedrijf. Niet andersom.",
      intro:
        "Iedere website wordt ontworpen en gebouwd rond jouw bedrijf. Kies hieronder het projecttype dat het beste aansluit bij wat je nodig hebt.",
    },
    principles: {
      title: "Wat voor iedere website geldt",
      items: [
        {
          title: "Eigen ontwerp",
          text: "Geen template waarin alleen logo en kleuren wisselen. Opbouw, tekst en beeld volgen jouw bedrijf.",
        },
        {
          title: "Duidelijke vanafprijs",
          text: "Je ziet vooraf in welke prijscategorie je project valt. De offerte maakt het bedrag exact.",
        },
        {
          title: "Gebouwd om mee te groeien",
          text: "Werkt op elke telefoon, is technisch degelijk en kan later uitgebreid worden zonder opnieuw te beginnen.",
        },
      ],
    },
    overview: {
      label: "Projecttypes",
      title: "Wat heb je nodig?",
      fromLabel: "Vanaf",
      managementLabel: "Technisch beheer",
      vatNote: "Vanafprijzen, exclusief btw.",
      ctaLabel: "Kies dit projecttype",
      detailsLabel: "Wat is inbegrepen",
    },
    details: {
      label: "Details",
      title: "Wat je per projecttype krijgt.",
      onceFromLabel: "Eenmalig vanaf",
      monthlyLabel: "Technisch beheer",
      scopeNote: "Voor een afgebakende eerste versie. Functionaliteit en omvang bepalen de uiteindelijke prijs.",
      includedLabel: "Inbegrepen",
      addOnsLabel: "Uitbreidingen bij dit type",
      boundaryLabel: "Ander projecttype als",
      scopeLabel: "Wat de prijs bepaalt",
      ctaLabel: "Kies dit projecttype",
    },
    platform: {
      label: "Meer dan een website",
      title: "Meer nodig dan een website?",
      text: "Portalen, dashboards, accounts, workflows, koppelingen of volledig eigen software. Gebouwd rond je eigen proces: na een discovery vooraf krijg je een voorstel met scope, prijs en planning.",
      fromLabel: "Vanaf",
      highlightsLabel: "Wat erbij hoort",
      ctaLabel: "Bespreek je project",
      secondaryLabel: "Meer over webapplicaties",
    },
    model: {
      title: "Zo is de prijs opgebouwd",
      once: {
        label: "Eenmalig",
        title: "Bouw",
        text: "Eén vanafprijs per projecttype die de basis van dat type dekt. Uitbreidingen die bij het type horen, staan met prijs bij de details. Vraagt je project om meer dan het type biedt, dan hoort het bij een ander type.",
      },
      monthly: {
        label: "Per maand",
        title: "Technisch beheer",
        text: "Elk opgeleverd product draait onder technisch beheer: hosting en deployment binnen de afgesproken basis, SSL, updates en controle, zodat de omgeving online en actueel blijft. Het beheerniveau volgt uit het project en de techniek erachter.",
        outside: "Nieuwe functionaliteit, inhoudelijke wijzigingen en werk buiten de afgesproken scope worden apart geoffreerd.",
        external: "Betaalde diensten of infrastructuur van derden die het project nodig heeft, vallen buiten het standaardbeheer en worden apart doorberekend.",
      },
      note: "De offerte na de intake bepaalt de definitieve prijs en scope van je project.",
    },
    closing: {
      title: "Weet je nog niet welk type past?",
      plannerLabel: "Bepaal eerst je scope in de projectplanner",
      contactLabel: "of vraag advies",
    },
  },
  en: {
    metaTitle: "Pricing",
    metaDescription:
      "Pricing at YM Creations: a custom design for every website and a clear starting price per project type, from compact website to web application or platform.",
    hero: {
      label: "Pricing",
      title: "A website that fits your business. Not the other way round.",
      intro:
        "Every website is designed and built around your business. Choose the project type below that best matches what you need.",
    },
    principles: {
      title: "What holds for every website",
      items: [
        {
          title: "Custom design",
          text: "No template where only the logo and colours change. Structure, text and imagery follow your business.",
        },
        {
          title: "Clear starting price",
          text: "You see up front which price category your project falls into. The quote makes the amount exact.",
        },
        {
          title: "Built to grow with you",
          text: "Works on every phone, is technically sound and can be extended later without starting over.",
        },
      ],
    },
    overview: {
      label: "Project types",
      title: "What do you need?",
      fromLabel: "From",
      managementLabel: "Technical management",
      vatNote: "Starting prices, excluding VAT.",
      ctaLabel: "Choose this project type",
      detailsLabel: "What is included",
    },
    details: {
      label: "Details",
      title: "What each project type gets you.",
      onceFromLabel: "One-off from",
      monthlyLabel: "Technical management",
      scopeNote: "For a clearly scoped first version. Functionality and size determine the final price.",
      includedLabel: "Included",
      addOnsLabel: "Extensions for this type",
      boundaryLabel: "Another project type when",
      scopeLabel: "What sets the price",
      ctaLabel: "Choose this project type",
    },
    platform: {
      label: "More than a website",
      title: "Need more than a website?",
      text: "Portals, dashboards, accounts, workflows, integrations or fully custom software. Built around your own process: after a discovery up front you receive a proposal with scope, price and planning.",
      fromLabel: "From",
      highlightsLabel: "What comes with it",
      ctaLabel: "Discuss your project",
      secondaryLabel: "More about web applications",
    },
    model: {
      title: "How the price is built up",
      once: {
        label: "One-off",
        title: "Build",
        text: "One starting price per project type that covers the basis of that type. Extensions that belong to the type are listed with a price in the details. If your project asks for more than the type offers, it belongs to another type.",
      },
      monthly: {
        label: "Per month",
        title: "Technical management",
        text: "Every delivered product runs under technical management: hosting and deployment within the agreed basis, SSL, updates and checks, so the environment stays online and current. The management level follows from the project and the technology behind it.",
        outside: "New functionality, content changes and work outside the agreed scope are quoted separately.",
        external: "Paid third-party services or infrastructure the project needs fall outside standard management and are charged separately.",
      },
      note: "The quote after the intake sets the final price and scope of your project.",
    },
    closing: {
      title: "Not sure yet which type fits?",
      plannerLabel: "Define your scope first in the project planner",
      contactLabel: "or ask for advice",
    },
  },
};

export function getPricingPageContent(locale: Locale): PricingPageContent {
  return pricingPageContent[locale];
}

/**
 * Words around the temporary discount on development costs, shared by the
 * pricing page and the project planner. `{percent}` is filled in from the
 * stored setting, so changing the percentage in the admin needs no change
 * here; `{base}` is the formatted base amount.
 */
export type DevelopmentDiscountCopy = {
  /** "Tijdelijk 30% korting op de ontwikkelkosten" */
  note: string;
  /** Screen-reader label for the struck-through base amount. */
  originalLabel: string;
  /** "30% korting op €1.495", for the planner summary that is sent along with a request. */
  context: (base: string) => string;
};

const developmentDiscountTemplates: Record<Locale, { note: string; originalLabel: string; context: string }> = {
  nl: {
    note: "Tijdelijk {percent}% korting op de ontwikkelkosten",
    originalLabel: "Normaal",
    context: "{percent}% korting op {base}",
  },
  en: {
    note: "Temporarily {percent}% off development costs",
    originalLabel: "Normally",
    context: "{percent}% off {base}",
  },
};

export function getDevelopmentDiscountCopy(locale: Locale, percent: number): DevelopmentDiscountCopy {
  const templates = developmentDiscountTemplates[locale];
  const fill = (template: string) => template.replace("{percent}", String(percent));

  return {
    note: fill(templates.note),
    originalLabel: templates.originalLabel,
    context: (base) => fill(templates.context).replace("{base}", base),
  };
}
