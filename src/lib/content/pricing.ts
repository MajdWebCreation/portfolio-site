import type { Locale } from "@/lib/content/site-content";

/**
 * Copy of the pricing page. Packages, amounts and extensions live in
 * `@/lib/pricing`; this file only holds the words around them.
 */
export type PricingPageContent = {
  metaTitle: string;
  metaDescription: string;
  hero: {
    label: string;
    title: string;
    intro: string;
  };
  selector: {
    label: string;
    title: string;
    onceLabel: string;
    monthlyLabel: string;
    scopeTag: string;
    includedLabel: string;
    addOnsLabel: string;
    boundaryLabel: string;
    scopeLabel: string;
    ctaLabel: string;
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
      "Tarieven van YM Creations: een vanafprijs per projecttype, van compacte website tot maatwerkplatform, met uitbreidingen die bij dat type horen.",
    hero: {
      label: "Tarieven",
      title: "Een duidelijke basisprijs. Meer alleen als de scope erom vraagt.",
      intro:
        "Het type product bepaalt de prijs, niet een lijst losse functies.",
    },
    selector: {
      label: "Projecttypes",
      title: "Van compacte website tot maatwerkplatform.",
      onceLabel: "Eenmalig vanaf",
      monthlyLabel: "Technisch beheer",
      scopeTag: "Ondergrens",
      includedLabel: "Inbegrepen",
      addOnsLabel: "Uitbreidingen bij dit type",
      boundaryLabel: "Ander projecttype als",
      scopeLabel: "Maatwerk en scope",
      ctaLabel: "Bespreek dit pakket",
    },
    model: {
      title: "Zo is de prijs opgebouwd",
      once: {
        label: "Eenmalig",
        title: "Bouw",
        text: "Eén vanafprijs per projecttype die de basis van dat type dekt. Uitbreidingen horen bij een type; vraagt het product om meer, dan hoort het bij een ander type. Maatwerk wordt per project bepaald.",
      },
      monthly: {
        label: "Per maand",
        title: "Technisch beheer",
        text: "Elk opgeleverd product draait onder technisch beheer: hosting en deployment binnen de afgesproken basis, SSL, updates en controle, zodat de omgeving online en actueel blijft. Het beheerniveau volgt uit het project en de techniek erachter.",
        outside: "Nieuwe functionaliteit, inhoudelijke wijzigingen en werk buiten de afgesproken scope worden apart geoffreerd.",
        external: "Betaalde diensten of infrastructuur van derden die het project nodig heeft, vallen buiten het standaardbeheer en worden apart doorberekend.",
      },
      note: "Alle bedragen zijn vanafprijzen. Het voorstel na de intake is leidend.",
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
      "Pricing at YM Creations: one starting price per project type, from compact website to custom platform, with extensions that belong to that type.",
    hero: {
      label: "Pricing",
      title: "A clear base price. More only when the scope asks for it.",
      intro:
        "The type of product sets the price, not a list of separate features.",
    },
    selector: {
      label: "Project types",
      title: "From compact website to custom platform.",
      onceLabel: "One-off from",
      monthlyLabel: "Technical management",
      scopeTag: "Lower bound",
      includedLabel: "Included",
      addOnsLabel: "Extensions for this type",
      boundaryLabel: "Another project type when",
      scopeLabel: "Custom work and scope",
      ctaLabel: "Discuss this package",
    },
    model: {
      title: "How the price is built up",
      once: {
        label: "One-off",
        title: "Build",
        text: "One starting price per project type that covers the basis of that type. Extensions belong to a type; if the product asks for more, it belongs to another type. Custom work is defined per project.",
      },
      monthly: {
        label: "Per month",
        title: "Technical management",
        text: "Every delivered product runs under technical management: hosting and deployment within the agreed basis, SSL, updates and checks, so the environment stays online and current. The management level follows from the project and the technology behind it.",
        outside: "New functionality, content changes and work outside the agreed scope are quoted separately.",
        external: "Paid third-party services or infrastructure the project needs fall outside standard management and are charged separately.",
      },
      note: "All amounts are starting prices. The proposal after the intake is what counts.",
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
