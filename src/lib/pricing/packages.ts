import type { Locale } from "@/lib/content/site-content";

/**
 * What a project type *is*, as opposed to what it costs.
 *
 * Every commercial amount — starting prices, monthly management, add-on
 * amounts — lives in Supabase and reaches the site as a `PricingCatalog`
 * (see `catalog.ts` and `source.ts`). This module deliberately holds none of
 * them, so there is exactly one live source of money and no way for a second
 * one to drift alongside it.
 *
 * What stays here is editorial: the fixed set of ids, the group names, what
 * each type includes and where its boundary lies. Those are words on a page,
 * not prices, and the admin does not edit them.
 */

export type PackageId = "starter" | "business" | "smart" | "webshop" | "platform";

export const packageIds: readonly PackageId[] = [
  "starter",
  "business",
  "smart",
  "webshop",
  "platform",
];

export function isPackageId(value: unknown): value is PackageId {
  return typeof value === "string" && (packageIds as readonly string[]).includes(value);
}

export type AddOnGroup =
  | "content"
  | "findability"
  | "conversion"
  | "management"
  | "integrations"
  | "app";

/** How a price is presented; the number itself comes from the catalog.
 *  plus: fixed extension; plus-from: size can differ; from: a project of its own. */
export type PriceMode = "plus" | "plus-from" | "from";

type LocalizedText = Record<Locale, string>;

export type PackageMetadata = {
  id: PackageId;
  /**
   * What sets this type apart, for the overview cards: three to five short
   * points a visitor can compare without opening anything. A subset of
   * `included`, worded for scanning; what every website gets (own design,
   * works on every device, technical basis for findability) is said once
   * above the cards and left out here.
   */
  highlights: Record<Locale, string[]>;
  included: Record<Locale, string[]>;
  /** When the project belongs to another type; for custom work: how the scope sets the price. */
  boundary: LocalizedText;
};

export const addOnGroupLabels: Record<AddOnGroup, LocalizedText> = {
  content: { nl: "Inhoud en taal", en: "Content and language" },
  findability: { nl: "Vindbaarheid", en: "Findability" },
  conversion: { nl: "Conversie en interactie", en: "Conversion and interaction" },
  management: { nl: "Beheer", en: "Management" },
  integrations: { nl: "Koppelingen", en: "Integrations" },
  app: { nl: "App", en: "App" },
};

/** A line under a group whose amounts need context the label cannot carry. */
export const addOnGroupNotes: Partial<Record<AddOnGroup, LocalizedText>> = {
  app: {
    nl: "Vanafprijzen voor een afgebakende eerste versie van de app. Functionaliteit en omvang bepalen de uiteindelijke prijs.",
    en: "Starting prices for a clearly scoped first version of the app. Functionality and size determine the final price.",
  },
};

const packageMetadata: Record<PackageId, PackageMetadata> = {
  starter: {
    id: "starter",
    highlights: {
      nl: ["1 tot 5 pagina's", "Contactformulier met e-mailmelding", "Technische basis voor vindbaarheid"],
      en: ["1 to 5 pages", "Contact form with email notification", "Technical basis for findability"],
    },
    included: {
      nl: [
        "1 tot 5 pagina's",
        "Eigen ontwerp, geen template",
        "Werkt op telefoon, tablet en desktop",
        "Contactformulier met e-mailmelding",
        "Technische basis voor vindbaarheid",
      ],
      en: [
        "1 to 5 pages",
        "Custom design, no template",
        "Works on phone, tablet and desktop",
        "Contact form with email notification",
        "Technical basis for findability",
      ],
    },
    boundary: {
      nl: "Reserveringen, betalingen, een beheeromgeving, accounts of koppelingen passen niet in dit type. Dan wordt het een website met reserveringen of een webapplicatie.",
      en: "Bookings, payments, an admin environment, accounts or integrations do not fit this type. That becomes a website with bookings or a web application.",
    },
  },
  business: {
    id: "business",
    highlights: {
      nl: [
        "6 tot 12 pagina's",
        "Formulieren, referenties en call-to-actions",
        "Uitgebreidere technische SEO",
        "Zelf teksten en afbeeldingen aanpassen",
      ],
      en: [
        "6 to 12 pages",
        "Forms, testimonials and calls to action",
        "Broader technical SEO",
        "Edit text and images yourself",
      ],
    },
    included: {
      nl: [
        "6 tot 12 pagina's",
        "Uitgebreidere contentstructuur",
        "Eigen ontwerp",
        "Formulieren",
        "Uitgebreidere technische SEO",
        "Referenties, cases en call-to-actions",
        "Beheeromgeving om bestaande teksten en afbeeldingen zelf aan te passen; nieuwe pagina's, secties, ontwerp of functies gaan via ons",
      ],
      en: [
        "6 to 12 pages",
        "Broader content structure",
        "Custom design",
        "Forms",
        "Broader technical SEO",
        "Testimonials, cases and calls to action",
        "Admin environment to edit existing text and images yourself; new pages, sections, design or functionality go through us",
      ],
    },
    boundary: {
      nl: "Reserverings- of aanvraagflows, statusbeheer, dashboards of prijslogica horen bij een website met reserveringen.",
      en: "Booking or request flows, status management, dashboards or pricing logic belong to a website with bookings.",
    },
  },
  smart: {
    id: "smart",
    highlights: {
      nl: [
        "Basis van de bedrijfswebsite",
        "Reserverings- of aanvraagflow",
        "Bevestigingsmails",
        "Beheeromgeving voor reserveringen of aanvragen",
      ],
      en: [
        "Basis of the business website",
        "Booking or request flow",
        "Confirmation emails",
        "Admin environment for bookings or requests",
      ],
    },
    included: {
      nl: [
        "Basis van de bedrijfswebsite",
        "Reserverings- of aanvraagflow",
        "Bevestigingsmails",
        "Beheeromgeving voor reserveringen of aanvragen",
        "Opbouw gericht op aanvragen",
      ],
      en: [
        "Basis of the business website",
        "Booking or request flow",
        "Confirmation emails",
        "Admin environment for bookings or requests",
        "Structure aimed at enquiries",
      ],
    },
    boundary: {
      nl: "Meerdere gebruikersrollen, klantportalen of bredere workflows: dan wordt het een webapplicatie of platform.",
      en: "Multiple user roles, client portals or broader workflows: then it becomes a web application or platform.",
    },
  },
  webshop: {
    id: "webshop",
    highlights: {
      nl: [
        "Productpagina's, winkelwagen en checkout",
        "Bestelmails",
        "Basisbeheer van producten en bestellingen",
        "Ontwerp gericht op bestellen op mobiel",
      ],
      en: [
        "Product pages, cart and checkout",
        "Order emails",
        "Basic management of products and orders",
        "Design aimed at ordering on mobile",
      ],
    },
    included: {
      nl: [
        "Productpagina's",
        "Winkelwagen en checkout",
        "Bestelmails",
        "Basisbeheer van producten en bestellingen",
        "Ontwerp gericht op bestellen op mobiel",
      ],
      en: [
        "Product pages",
        "Cart and checkout",
        "Order emails",
        "Basic management of products and orders",
        "Design aimed at ordering on mobile",
      ],
    },
    boundary: {
      nl: "Klantaccounts met eigen logica of workflows buiten bestellen en betalen horen bij een webapplicatie of platform.",
      en: "Customer accounts with their own logic or workflows beyond ordering and paying belong to a web application or platform.",
    },
  },
  platform: {
    id: "platform",
    highlights: {
      nl: [
        "Inloggen, accounts en gebruikersrollen",
        "Dashboard en beheeromgeving",
        "Eigen database",
        "Workflows rond jouw proces",
        "Discovery vooraf",
      ],
      en: [
        "Login, accounts and user roles",
        "Dashboard and admin environment",
        "Own database",
        "Workflows around your process",
        "Discovery up front",
      ],
    },
    included: {
      nl: [
        "Discovery vooraf",
        "Inloggen en accounts",
        "Dashboard",
        "Beheeromgeving",
        "Database",
        "Gebruikersrollen en rechten",
        "Maatwerkflows",
      ],
      en: [
        "Discovery up front",
        "Login and accounts",
        "Dashboard",
        "Admin environment",
        "Database",
        "User roles and permissions",
        "Custom flows",
      ],
    },
    boundary: {
      nl: "Workflows, rollen, koppelingen, configuratorlogica en infrastructuur bepalen het voorstel. Een app kan een eigen traject zijn als de scope daarom vraagt.",
      en: "Workflows, roles, integrations, configurator logic and infrastructure determine the proposal. An app can be a project of its own if the scope asks for it.",
    },
  },
};

export function getPackageMetadata(id: PackageId): PackageMetadata {
  return packageMetadata[id];
}
