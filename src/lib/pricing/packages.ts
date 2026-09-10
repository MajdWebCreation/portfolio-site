import type { Locale } from "@/lib/content/site-content";

/**
 * Single source of truth for packages, starting prices and extensions.
 * The pricing page, the project planner and any package link read from
 * here. Amounts are numbers in euros; formatting happens in `format.ts`.
 * Later this module can be replaced by data from an admin/database while
 * keeping the same shape.
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

/** How a price is presented; the number itself stays in `amount`.
 *  plus: fixed extension; plus-from: size can differ; from: a project of its own. */
export type PriceMode = "plus" | "plus-from" | "from";

export type AddOnDefinition = {
  id: string;
  group: AddOnGroup;
  amount: number;
  mode: PriceMode;
};

type LocalizedText = Record<Locale, string>;

export type PackageDefinition = {
  id: PackageId;
  /** One-off starting price for the build, in euros. */
  startingPrice: number;
  /** Custom work: the starting price is a lower bound, shown with a plus. */
  scopeDriven: boolean;
  /** Minimum monthly price for technical management, in euros. Follows from the project type. */
  monthlyManagementFrom: number;
  name: LocalizedText;
  /** One short line next to the name in the selector: who the type is for. */
  tagline: LocalizedText;
  included: Record<Locale, string[]>;
  addOns: AddOnDefinition[];
  addOnLabels: Record<Locale, Record<string, string>>;
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

const packages: Record<PackageId, PackageDefinition> = {
  starter: {
    id: "starter",
    startingPrice: 695,
    scopeDriven: false,
    monthlyManagementFrom: 10,
    name: { nl: "Compacte website", en: "Compact website" },
    tagline: {
      nl: "Voor presentatie en contact",
      en: "For presentation and contact",
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
    addOns: [
      { id: "extra-page", group: "content", amount: 75, mode: "plus" },
      { id: "multilingual", group: "content", amount: 200, mode: "plus" },
      { id: "seo-plus", group: "findability", amount: 250, mode: "plus" },
      { id: "motion", group: "conversion", amount: 175, mode: "plus" },
    ],
    addOnLabels: {
      nl: {
        "extra-page": "Extra pagina",
        multilingual: "Tweede taal",
        "seo-plus": "Uitgebreidere zoekmachineoptimalisatie",
        motion: "Subtiele animatie en interactie",
      },
      en: {
        "extra-page": "Extra page",
        multilingual: "Second language",
        "seo-plus": "Extended search engine optimisation",
        motion: "Subtle animation and interaction",
      },
    },
    boundary: {
      nl: "Reserveringen, betalingen, een beheeromgeving, accounts of koppelingen passen niet in dit type. Dan wordt het een website met reserveringen of een maatwerkplatform.",
      en: "Bookings, payments, an admin environment, accounts or integrations do not fit this type. That becomes a website with bookings or a custom platform.",
    },
  },
  business: {
    id: "business",
    startingPrice: 1495,
    scopeDriven: false,
    monthlyManagementFrom: 25,
    name: { nl: "Bedrijfswebsite", en: "Business website" },
    tagline: {
      nl: "Voor meer pagina's en structuur",
      en: "For more pages and structure",
    },
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
    addOns: [
      { id: "extra-page", group: "content", amount: 75, mode: "plus" },
      { id: "seo-growth", group: "findability", amount: 350, mode: "plus" },
      { id: "email-flow", group: "conversion", amount: 200, mode: "plus" },
      { id: "content-admin", group: "management", amount: 450, mode: "plus-from" },
      { id: "light-api", group: "integrations", amount: 550, mode: "plus-from" },
    ],
    addOnLabels: {
      nl: {
        "extra-page": "Extra pagina",
        "seo-growth": "SEO op zoekintentie en pagina-opbouw",
        "email-flow": "Uitgebreidere e-mailflow na een aanvraag",
        "content-admin": "Eigen beheeromgeving voor content",
        "light-api": "Eenvoudige koppeling met een extern systeem",
      },
      en: {
        "extra-page": "Extra page",
        "seo-growth": "SEO on search intent and page structure",
        "email-flow": "Extended email flow after an enquiry",
        "content-admin": "Own admin environment for content",
        "light-api": "Simple connection to an external system",
      },
    },
    boundary: {
      nl: "Reserverings- of aanvraagflows, statusbeheer, dashboards of prijslogica horen bij een website met reserveringen.",
      en: "Booking or request flows, status management, dashboards or pricing logic belong to a website with bookings.",
    },
  },
  smart: {
    id: "smart",
    startingPrice: 2495,
    scopeDriven: false,
    monthlyManagementFrom: 35,
    name: { nl: "Website met reserveringen", en: "Website with bookings" },
    tagline: {
      nl: "Voor aanvragen en reserveringen",
      en: "For requests and bookings",
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
    addOns: [
      { id: "payments", group: "conversion", amount: 650, mode: "plus" },
      { id: "reminders", group: "conversion", amount: 250, mode: "plus" },
      { id: "expanded-admin", group: "management", amount: 950, mode: "plus-from" },
      { id: "maps-routes", group: "integrations", amount: 1250, mode: "plus-from" },
      { id: "crm-calendar", group: "integrations", amount: 650, mode: "plus-from" },
    ],
    addOnLabels: {
      nl: {
        payments: "Online betalingen",
        reminders: "Herinneringsmails en automatisering",
        "expanded-admin": "Uitgebreidere beheeromgeving",
        "maps-routes": "Kaarten, routes en prijs per kilometer",
        "crm-calendar": "Koppeling met CRM of agenda",
      },
      en: {
        payments: "Online payments",
        reminders: "Reminder emails and automation",
        "expanded-admin": "Extended admin environment",
        "maps-routes": "Maps, routes and price per kilometre",
        "crm-calendar": "Connection to CRM or calendar",
      },
    },
    boundary: {
      nl: "Meerdere gebruikersrollen, klantportalen of bredere workflows: dan wordt het een maatwerkplatform.",
      en: "Multiple user roles, client portals or broader workflows: then it becomes a custom platform.",
    },
  },
  webshop: {
    id: "webshop",
    startingPrice: 1995,
    scopeDriven: false,
    monthlyManagementFrom: 25,
    name: { nl: "Webshop", en: "Webshop" },
    tagline: {
      nl: "Voor online verkoop",
      en: "For selling online",
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
    addOns: [
      { id: "multilingual", group: "content", amount: 200, mode: "plus" },
      { id: "product-seo", group: "findability", amount: 450, mode: "plus" },
      { id: "filters-search", group: "conversion", amount: 450, mode: "plus" },
      { id: "subscriptions", group: "conversion", amount: 900, mode: "plus-from" },
      { id: "erp-crm", group: "integrations", amount: 750, mode: "plus-from" },
    ],
    addOnLabels: {
      nl: {
        multilingual: "Tweede taal",
        "product-seo": "SEO voor categorie- en productpagina's",
        "filters-search": "Uitgebreide filters en zoeken",
        subscriptions: "Abonnementen of lidmaatschappen",
        "erp-crm": "Koppeling met CRM, ERP of boekhouding",
      },
      en: {
        multilingual: "Second language",
        "product-seo": "SEO for category and product pages",
        "filters-search": "Extended filters and search",
        subscriptions: "Subscriptions or memberships",
        "erp-crm": "Connection to CRM, ERP or accounting",
      },
    },
    boundary: {
      nl: "Klantaccounts met eigen logica of workflows buiten bestellen en betalen horen bij een maatwerkplatform.",
      en: "Customer accounts with their own logic or workflows beyond ordering and paying belong to a custom platform.",
    },
  },
  platform: {
    id: "platform",
    startingPrice: 4995,
    scopeDriven: true,
    monthlyManagementFrom: 49,
    name: { nl: "Maatwerkplatform", en: "Custom platform" },
    tagline: {
      nl: "Voor portalen, workflows en maatwerk",
      en: "For portals, workflows and custom work",
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
    addOns: [
      { id: "extra-roles", group: "management", amount: 750, mode: "plus" },
      { id: "reporting", group: "management", amount: 750, mode: "plus-from" },
      { id: "notifications", group: "conversion", amount: 350, mode: "plus" },
      { id: "complex-api", group: "integrations", amount: 1500, mode: "plus-from" },
      { id: "mobile-app", group: "app", amount: 3500, mode: "plus-from" },
      { id: "full-app", group: "app", amount: 8500, mode: "from" },
    ],
    addOnLabels: {
      nl: {
        "extra-roles": "Extra gebruikersrollen",
        reporting: "Rapportages en inzichten",
        notifications: "Notificaties",
        "complex-api": "Complexe koppeling met externe systemen",
        "mobile-app": "Mobiele app als uitbreiding",
        "full-app": "Volledig app-traject",
      },
      en: {
        "extra-roles": "Extra user roles",
        reporting: "Reports and insights",
        notifications: "Notifications",
        "complex-api": "Complex connection to external systems",
        "mobile-app": "Mobile app as an extension",
        "full-app": "Full app project",
      },
    },
    boundary: {
      nl: "Workflows, rollen, koppelingen, configuratorlogica en infrastructuur bepalen het voorstel. Een app kan een eigen traject zijn als de scope daarom vraagt.",
      en: "Workflows, roles, integrations, configurator logic and infrastructure determine the proposal. An app can be a project of its own if the scope asks for it.",
    },
  },
};

export function getPackage(id: PackageId): PackageDefinition {
  return packages[id];
}

export function getPackages(): PackageDefinition[] {
  return packageIds.map((id) => packages[id]);
}

export function getPackageName(locale: Locale, id: PackageId): string {
  return packages[id].name[locale];
}

export function getStartingPrice(id: PackageId): number {
  return packages[id].startingPrice;
}

export function getMonthlyManagementFrom(id: PackageId): number {
  return packages[id].monthlyManagementFrom;
}

/** Amount and label of one extension, looked up by stable id. */
export function getAddOn(locale: Locale, packageId: PackageId, addOnId: string) {
  const pkg = packages[packageId];
  const addOn = pkg.addOns.find((item) => item.id === addOnId);

  if (!addOn) {
    throw new Error(`Unknown add-on "${addOnId}" for package "${packageId}"`);
  }

  return { ...addOn, label: pkg.addOnLabels[locale][addOnId] ?? addOnId };
}
