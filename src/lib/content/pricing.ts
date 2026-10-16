import type { Locale } from "@/lib/content/site-content";
import type { ProductCategory } from "@/lib/pricing/categories";
import type { PackageId } from "@/lib/pricing/packages";

/**
 * Copy of the pricing page. Packages, amounts and extensions live in
 * `@/lib/pricing`; this file only holds the words around them.
 *
 * The page reads top to bottom as one line of thought: what the visitor
 * wants made (hero and the three categories, each with its cards, its
 * details and a route for what falls outside them), what is true of every
 * website (principles), how an amount is built up (model) and where to go
 * when the type is not clear yet (closing).
 */
export type PricingCategoryCopy = {
  /** Tab name: "Website", "Webshop", "Maatwerk". */
  name: string;
  /** One line that says who the category is for, in the tab and above the cards. */
  descriptor: string;
  /** A short paragraph above the cards, where the category needs explaining (custom work). */
  intro?: string;
  /**
   * A quiet route next to the cards for what falls outside them: one
   * sentence and one link. `contact` leads to the contact page, `custom`
   * to the custom-work tab on this page.
   */
  route?: { text: string; label: string; target: "contact" | "custom" };
};

export type PricingPageContent = {
  metaTitle: string;
  metaDescription: string;
  hero: {
    label: string;
    title: string;
    intro: string;
  };
  /** The first question on the page and the three answers to it. */
  categories: {
    title: string;
    /** Before the open tab's name under the tabs: "Je bekijkt". */
    viewingLabel: string;
    items: Record<ProductCategory, PricingCategoryCopy>;
  };
  /** Three short claims that hold for every website; said here and nowhere else on the page. */
  principles: {
    title: string;
    items: { title: string; text: string }[];
  };
  overview: {
    /** Above every starting amount, on the cards. */
    fromLabel: string;
    /** Before the monthly amount on a card: "Technisch beheer vanaf € 15 p/m". */
    managementLabel: string;
    vatNote: string;
    /** Jump to the type's full detail further down the panel. */
    detailsLabel: string;
  };
  /**
   * The action on every card and detail row: straight to the contact form
   * with the type filled in. Worded per type, so a website is requested and
   * a project is discussed; never a planner step.
   */
  requestLabels: Record<PackageId, string>;
  details: {
    label: string;
    title: string;
    onceFromLabel: string;
    monthlyLabel: string;
    /** Under a scope-driven amount: what the starting price covers. */
    scopeNote: string;
    includedLabel: string;
    /** Above the few lines the starting price deliberately leaves out. */
    notIncludedLabel: string;
    addOnsLabel: string;
    /** Above extensions the type offers without a listed amount. */
    onRequestLabel: string;
    boundaryLabel: string;
    scopeLabel: string;
  };
  /** The card of the web application type carries a second link to its service page. */
  platform: {
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
        "Kies eerst wat je wilt laten maken: een website, een webshop of maatwerk. Daarna zie je per type de vanafprijs en wat erbij hoort.",
    },
    categories: {
      title: "Wat wil je laten maken?",
      viewingLabel: "Je bekijkt",
      items: {
        website: {
          name: "Website",
          descriptor: "Zichtbaar zijn en aanvragen of contact krijgen.",
          route: {
            text: "Meer pagina's, een andere opzet of iets dat hier niet tussen staat?",
            label: "Bespreek je website",
            target: "contact",
          },
        },
        webshop: {
          name: "Webshop",
          descriptor: "Producten online verkopen, met winkelwagen, betalingen en bestellingen.",
          route: {
            text: "B2B-prijzen, klantaccounts met eigen logica of koppelingen met je systemen? Dat gaat verder dan een webshop.",
            label: "Bekijk maatwerk",
            target: "custom",
          },
        },
        custom: {
          name: "Maatwerk",
          descriptor: "De website of software voert een proces van je bedrijf uit.",
          intro:
            "Reserveringen met eigen regels, een klantportaal, een configurator, dashboards, workflows of koppelingen: dan is het geen gewone website of webshop meer. Hoe ver het gaat, bepaalt welk van deze twee typen past.",
          route: {
            text: "Een configurator, klantportaal of andere bedrijfssoftware nodig? Beschrijf kort je proces, dan hoor je welk type past.",
            label: "Bespreek je project",
            target: "contact",
          },
        },
      },
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
      fromLabel: "Vanaf",
      managementLabel: "Technisch beheer",
      vatNote: "Vanafprijzen, exclusief btw.",
      detailsLabel: "Wat is inbegrepen",
    },
    requestLabels: {
      starter: "Vraag deze website aan",
      business: "Vraag deze website aan",
      webshop: "Vraag deze webshop aan",
      smart: "Bespreek dit project",
      platform: "Bespreek dit project",
    },
    details: {
      label: "Details",
      title: "Wat je precies krijgt.",
      onceFromLabel: "Eenmalig vanaf",
      monthlyLabel: "Technisch beheer",
      scopeNote: "Voor een afgebakende eerste versie. Functionaliteit en omvang bepalen de uiteindelijke prijs.",
      includedLabel: "Inbegrepen",
      notIncludedLabel: "Bewust niet inbegrepen",
      addOnsLabel: "Uitbreidingen bij dit type",
      onRequestLabel: "Ook mogelijk, prijs op aanvraag",
      boundaryLabel: "Ander projecttype als",
      scopeLabel: "Wat de prijs bepaalt",
    },
    platform: {
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
        "First choose what you want made: a website, a webshop or custom work. Then you see the starting price and what comes with each type.",
    },
    categories: {
      title: "What do you want made?",
      viewingLabel: "You are viewing",
      items: {
        website: {
          name: "Website",
          descriptor: "Be found and receive enquiries or contact.",
          route: {
            text: "More pages, a different structure or something that is not listed here?",
            label: "Discuss your website",
            target: "contact",
          },
        },
        webshop: {
          name: "Webshop",
          descriptor: "Sell products online, with cart, payments and orders.",
          route: {
            text: "B2B pricing, customer accounts with their own logic or integrations with your systems? That goes beyond a webshop.",
            label: "See custom work",
            target: "custom",
          },
        },
        custom: {
          name: "Custom",
          descriptor: "The website or software runs a process of your business.",
          intro:
            "Bookings with their own rules, a client portal, a configurator, dashboards, workflows or integrations: then it is no longer a regular website or webshop. How far it goes decides which of these two types fits.",
          route: {
            text: "Need a configurator, a client portal or other business software? Describe your process briefly and you will hear which type fits.",
            label: "Discuss your project",
            target: "contact",
          },
        },
      },
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
      fromLabel: "From",
      managementLabel: "Technical management",
      vatNote: "Starting prices, excluding VAT.",
      detailsLabel: "What is included",
    },
    requestLabels: {
      starter: "Request this website",
      business: "Request this website",
      webshop: "Request this webshop",
      smart: "Discuss this project",
      platform: "Discuss this project",
    },
    details: {
      label: "Details",
      title: "What you get exactly.",
      onceFromLabel: "One-off from",
      monthlyLabel: "Technical management",
      scopeNote: "For a clearly scoped first version. Functionality and size determine the final price.",
      includedLabel: "Included",
      notIncludedLabel: "Deliberately not included",
      addOnsLabel: "Extensions for this type",
      onRequestLabel: "Also possible, price on request",
      boundaryLabel: "Another project type when",
      scopeLabel: "What sets the price",
    },
    platform: {
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
