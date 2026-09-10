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

const packageMetadata: Record<PackageId, PackageMetadata> = {
  starter: {
    id: "starter",
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
      nl: "Reserveringen, betalingen, een beheeromgeving, accounts of koppelingen passen niet in dit type. Dan wordt het een website met reserveringen of een maatwerkplatform.",
      en: "Bookings, payments, an admin environment, accounts or integrations do not fit this type. That becomes a website with bookings or a custom platform.",
    },
  },
  business: {
    id: "business",
    included: {
      nl: [
        "6 tot 12 pagina's",
        "Uitgebreidere contentstructuur",
        "Eigen ontwerp",
        "Formulieren",
        "Uitgebreidere technische SEO",
        "Referenties, cases en call-to-actions",
        "Eenvoudig contentbeheer",
      ],
      en: [
        "6 to 12 pages",
        "Broader content structure",
        "Custom design",
        "Forms",
        "Broader technical SEO",
        "Testimonials, cases and calls to action",
        "Simple content management",
      ],
    },
    boundary: {
      nl: "Reserverings- of aanvraagflows, statusbeheer, dashboards of prijslogica horen bij een website met reserveringen.",
      en: "Booking or request flows, status management, dashboards or pricing logic belong to a website with bookings.",
    },
  },
  smart: {
    id: "smart",
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
      nl: "Meerdere gebruikersrollen, klantportalen of bredere workflows: dan wordt het een maatwerkplatform.",
      en: "Multiple user roles, client portals or broader workflows: then it becomes a custom platform.",
    },
  },
  webshop: {
    id: "webshop",
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
      nl: "Klantaccounts met eigen logica of workflows buiten bestellen en betalen horen bij een maatwerkplatform.",
      en: "Customer accounts with their own logic or workflows beyond ordering and paying belong to a custom platform.",
    },
  },
  platform: {
    id: "platform",
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
