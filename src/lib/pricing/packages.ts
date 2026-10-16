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
 *
 * The content follows the offer research of 15 October 2026
 * (docs/research/reports/Aanbodstructuur webstudio Nederland 2026.md,
 * sections 12, 13, 14 and 16): what is standard, what is a module, where a
 * type ends. The amounts in that research were not adopted; the page counts
 * stay the ones the current prices and the planner are built on.
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
type LocalizedList = Record<Locale, string[]>;

export type PackageMetadata = {
  id: PackageId;
  /**
   * Who the type is for, in one line under its name. Worded from the
   * research's "voor wie"; shown instead of the catalog tagline on the
   * pricing page, which keeps its tagline for the planner and the admin.
   */
  audience: LocalizedText;
  /**
   * What sets this type apart, for the overview cards: three to five short
   * points a visitor can compare without opening anything. A subset of
   * `included`, worded for scanning.
   */
  highlights: LocalizedList;
  /** Everything the starting price covers, in customer words. */
  included: LocalizedList;
  /**
   * What is deliberately not in the starting price (research section 16):
   * the few lines that keep the type's boundary honest, shown with the
   * details rather than on the card.
   */
  notIncluded: LocalizedList;
  /**
   * Extensions the research names for this type that have no amount in the
   * catalog yet. Shown as "on request", never with a price: a price is a
   * decision for the admin, not for this file.
   */
  onRequest: LocalizedList;
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

/**
 * Add-ons the catalog still holds but the pricing page no longer offers,
 * because the research puts what they add inside the type's standard scope.
 * Presentation only: the row, its amount and the admin are untouched, and
 * the planner still knows the add-on until a decision is made about the row.
 *
 *  - business / content-admin: managing projects, testimonials and sections
 *    yourself is part of the business website (research section 12/13).
 */
export const hiddenAddOns: Partial<Record<PackageId, readonly string[]>> = {
  business: ["content-admin"],
};

export function isAddOnShown(packageId: PackageId, addOnId: string): boolean {
  return !(hiddenAddOns[packageId] ?? []).includes(addOnId);
}

const packageMetadata: Record<PackageId, PackageMetadata> = {
  starter: {
    id: "starter",
    audience: {
      nl: "Voor één duidelijk aanbod: gevonden worden en gebeld, ge-appt of gemaild worden",
      en: "For one clear offer: being found and getting calls, messages or emails",
    },
    highlights: {
      nl: [
        "1 tot 5 pagina's in eigen ontwerp en eigen code",
        "Bellen, appen of een formulier: alle drie in één tik",
        "Technische SEO-basis, sitemap en check van je Google Bedrijfsprofiel",
        "Google Analytics en Search Console ingericht en van jou",
      ],
      en: [
        "1 to 5 pages in a custom design and custom code",
        "Call, message or a form: all three in one tap",
        "Technical SEO basis, sitemap and a check of your Google Business Profile",
        "Google Analytics and Search Console set up and yours",
      ],
    },
    included: {
      nl: [
        "1 tot 5 pagina's",
        "Eigen ontwerp en eigen code, geen template",
        "Mobiel-first, snelheid gemeten bij oplevering, HTTPS",
        "Technische SEO-basis: titels per pagina, sitemap en je bedrijfsgegevens machineleesbaar voor Google",
        "Klikbaar telefoonnummer, WhatsApp-knop en contactformulier met spambeveiliging en e-mailmelding",
        "Cookiemelding die klopt volgens de wet, of een cookieloze opzet zonder banner",
        "Google Analytics met meting van aanvragen en Search Console ingericht en aan jou overgedragen",
        "Check en koppeling van je Google Bedrijfsprofiel",
        "Reviews-blok",
        "1 feedbackronde en korte uitleg bij oplevering",
      ],
      en: [
        "1 to 5 pages",
        "Custom design and custom code, no template",
        "Mobile-first, speed measured at delivery, HTTPS",
        "Technical SEO basis: titles per page, sitemap and your business details machine-readable for Google",
        "Clickable phone number, WhatsApp button and contact form with spam protection and email notification",
        "Cookie notice that follows the law, or a cookieless setup without a banner",
        "Google Analytics with enquiry tracking and Search Console set up and handed over to you",
        "Check and link of your Google Business Profile",
        "Reviews block",
        "1 feedback round and a short walkthrough at delivery",
      ],
    },
    notIncluded: {
      nl: [
        "Beheeromgeving om zelf dagelijks te bewerken; wijzigingen gaan via ons",
        "Nieuws, cases of blog: dat is de Bedrijfswebsite",
        "Tweede taal en koppelingen met CRM of boekhouding, tenzij als uitbreiding",
        "Advertentiepixels zonder campagnes",
        "Onbeperkte revisies: één ronde is inbegrepen",
      ],
      en: [
        "An admin environment for daily editing; changes go through us",
        "News, cases or a blog: that is the business website",
        "A second language and CRM or accounting integrations, unless as an extension",
        "Advertising pixels without campaigns",
        "Unlimited revisions: one round is included",
      ],
    },
    onRequest: {
      nl: [
        "Campagnepagina voor een advertentie",
        "Reserveren via een koppeling met een planningstool",
        "Kanaal activeren: Google Ads-conversies, Meta of TikTok",
        "Teksten schrijven per pagina",
        "Volledige opzet van je Google Bedrijfsprofiel",
        "Overzetten van een bestaande site met doorverwijzingen",
      ],
      en: [
        "Campaign page for an advertisement",
        "Bookings through a link with a scheduling tool",
        "Channel activation: Google Ads conversions, Meta or TikTok",
        "Writing the text per page",
        "Full setup of your Google Business Profile",
        "Moving an existing site with redirects",
      ],
    },
    boundary: {
      nl: "Meer pagina's, nieuws of cases, of zelf bijwerken in een beheeromgeving: dan past de Bedrijfswebsite. Reserveren, betalen, inloggen of koppelingen met bedrijfssoftware horen bij maatwerk.",
      en: "More pages, news or cases, or updating things yourself in an admin environment: then the business website fits. Bookings, payments, logins or integrations with business software belong to custom work.",
    },
  },
  business: {
    id: "business",
    audience: {
      nl: "Voor meerdere diensten, cases en regio's: meer ingangen vanuit Google en meer vertrouwen",
      en: "For several services, cases and regions: more entry points from Google and more trust",
    },
    highlights: {
      nl: [
        "6 tot 12 pagina's, elk met een eigen zoekterm",
        "Cases, nieuws, team en FAQ zelf bijwerken in je beheeromgeving",
        "Zoekwoordonderzoek en titels en koppen per pagina",
        "Je Google-reviews live op de site",
      ],
      en: [
        "6 to 12 pages, each with its own search term",
        "Update cases, news, team and FAQ yourself in your admin environment",
        "Keyword research and titles and headings per page",
        "Your Google reviews live on the site",
      ],
    },
    included: {
      nl: [
        "6 tot 12 pagina's: een eigen pagina per dienst, specialisme of regio",
        "Alles van de Compacte website",
        "Zoekwoordonderzoek en per pagina ingerichte titels en koppen",
        "Formulieren, referenties, cases en call-to-actions",
        "Beheeromgeving: teksten, afbeeldingen, projecten of cases, nieuws of artikelen, team en FAQ zelf bijwerken",
        "Live koppeling met je Google-reviews",
        "2 feedbackrondes en instructie voor zelf beheren",
      ],
      en: [
        "6 to 12 pages: a page of its own per service, specialism or region",
        "Everything in the compact website",
        "Keyword research and titles and headings set up per page",
        "Forms, testimonials, cases and calls to action",
        "Admin environment: update text, images, projects or cases, news or articles, team and FAQ yourself",
        "Live link with your Google reviews",
        "2 feedback rounds and instructions for managing it yourself",
      ],
    },
    notIncluded: {
      nl: [
        "Doorlopende SEO, linkbuilding of garanties op posities",
        "Onbeperkt aantal pagina's: boven 12 wordt het maatwerk op scope",
        "Klantaccounts met eigen gegevens",
        "Koppelingen met ERP in twee richtingen",
      ],
      en: [
        "Ongoing SEO, link building or ranking guarantees",
        "Unlimited pages: above 12 it becomes custom work on scope",
        "Customer accounts with their own data",
        "Two-way ERP integrations",
      ],
    },
    onRequest: {
      nl: [
        "Tweede taal",
        "Productcatalogus zonder afrekenen: offerte aanvragen per product",
        "Nieuwsbrief-, CRM- of boekhoudkoppeling",
        "Reserveren via een koppeling met een planningstool",
        "Online betalen via een factuur- of aanbetalingslink",
        "Kanaal activeren: Google Ads-conversies, Meta of TikTok",
        "Toegankelijkheidsaudit (WCAG) met rapport",
        "Campagnepagina's",
      ],
      en: [
        "Second language",
        "Product catalogue without checkout: quote requests per product",
        "Newsletter, CRM or accounting integration",
        "Bookings through a link with a scheduling tool",
        "Online payment through an invoice or deposit link",
        "Channel activation: Google Ads conversions, Meta or TikTok",
        "Accessibility audit (WCAG) with report",
        "Campaign pages",
      ],
    },
    boundary: {
      nl: "Meer dan ongeveer 12 pagina's of eigen contenttypen buiten deze modules: dan maatwerk op scope. Inloggen met eigen gegevens of koppelingen in twee richtingen horen bij een webapplicatie.",
      en: "More than about 12 pages or content types of your own beyond these modules: then custom work on scope. Logins with own data or two-way integrations belong to a web application.",
    },
  },
  smart: {
    id: "smart",
    audience: {
      nl: "Voor reserveringen of aanvragen die niet in een standaardplanner passen",
      en: "For bookings or requests that do not fit a standard scheduling tool",
    },
    highlights: {
      nl: [
        "Basis van de Bedrijfswebsite",
        "Reserverings- of aanvraagflow naar jouw regels",
        "Beschikbaarheid en bevestiging per e-mail",
        "Beheeromgeving voor reserveringen of aanvragen",
      ],
      en: [
        "Basis of the business website",
        "Booking or request flow by your rules",
        "Availability and confirmation by email",
        "Admin environment for bookings or requests",
      ],
    },
    included: {
      nl: [
        "Basis van de Bedrijfswebsite: ontwerp, vindbaarheid, meting en contact",
        "Reserverings- of aanvraagflow naar jouw regels, in meerdere stappen waar nodig",
        "Beschikbaarheid waar van toepassing: data, tijden of capaciteit",
        "Bevestiging per e-mail voor klant en bedrijf",
        "Beheeromgeving voor reserveringen of aanvragen",
        "Opbouw gericht op aanvragen",
      ],
      en: [
        "Basis of the business website: design, findability, measurement and contact",
        "Booking or request flow by your rules, in several steps where needed",
        "Availability where applicable: dates, times or capacity",
        "Confirmation by email for customer and business",
        "Admin environment for bookings or requests",
        "Structure aimed at enquiries",
      ],
    },
    notIncluded: {
      nl: [
        "Online betalingen of aanbetalingen: uitbreiding",
        "Herinneringsmails en automatisering: uitbreiding",
        "Agenda- of CRM-koppeling: uitbreiding",
        "Gebruikersrollen en klantportalen: webapplicatie",
      ],
      en: [
        "Online payments or deposits: extension",
        "Reminder emails and automation: extension",
        "Calendar or CRM integration: extension",
        "User roles and client portals: web application",
      ],
    },
    onRequest: {
      nl: ["Sms-herinneringen", "Tweede taal", "Koppeling met kassa of boekhouding"],
      en: ["SMS reminders", "Second language", "Integration with POS or accounting"],
    },
    boundary: {
      nl: "Past een standaardplanner wél, dan is een koppeling op een gewone website genoeg. Meerdere gebruikersrollen, klantportalen, betalen op rekening of bredere workflows: dan wordt het een webapplicatie of platform.",
      en: "If a standard scheduling tool does fit, a link on a regular website is enough. Multiple user roles, client portals, invoice payment or broader workflows: then it becomes a web application or platform.",
    },
  },
  webshop: {
    id: "webshop",
    audience: {
      nl: "Voor het online verkopen van producten, van tientallen tot enkele honderden",
      en: "For selling products online, from dozens to a few hundred",
    },
    highlights: {
      nl: [
        "Productcatalogus met varianten en filters, winkelwagen en checkout",
        "iDEAL en kaartbetalingen via Mollie, verzend- en btw-instellingen",
        "Orderbevestiging en beheer van producten en bestellingen",
        "Tot 50 producten ingevoerd, aankopen gemeten in Google Analytics",
      ],
      en: [
        "Product catalogue with variants and filters, cart and checkout",
        "iDEAL and card payments via Mollie, shipping and VAT settings",
        "Order confirmation and management of products and orders",
        "Up to 50 products entered, purchases measured in Google Analytics",
      ],
    },
    included: {
      nl: [
        "Alles uit de basis van de Bedrijfswebsite: ontwerp, vindbaarheid, meting en contact",
        "Productcatalogus met varianten en filters",
        "Winkelwagen en checkout in eigen code, gericht op bestellen op mobiel",
        "iDEAL en kaartbetalingen via Mollie; transactiekosten rechtstreeks bij Mollie",
        "Verzendmethoden en btw-instellingen",
        "Orderbevestiging per e-mail en orderbeheer",
        "Juridische pagina's als structuur: voorwaarden, retouren, privacy",
        "Invoer van je eerste producten, tot 50",
        "Aankopen en winkelwagen gemeten in Google Analytics",
        "2 feedbackrondes",
      ],
      en: [
        "Everything in the basis of the business website: design, findability, measurement and contact",
        "Product catalogue with variants and filters",
        "Cart and checkout in custom code, aimed at ordering on mobile",
        "iDEAL and card payments via Mollie; transaction fees directly with Mollie",
        "Shipping methods and VAT settings",
        "Order confirmation by email and order management",
        "Legal pages as a structure: terms, returns, privacy",
        "Entry of your first products, up to 50",
        "Purchases and cart measured in Google Analytics",
        "2 feedback rounds",
      ],
    },
    notIncluded: {
      nl: [
        "B2B-prijzen per klantgroep en klantspecifieke condities",
        "Koppelingen met ERP, WMS of PIM",
        "Grote productimports: boven 50 producten als uitbreiding",
        "Productfotografie en productteksten",
      ],
      en: [
        "B2B pricing per customer group and customer-specific terms",
        "ERP, WMS or PIM integrations",
        "Large product imports: above 50 products as an extension",
        "Product photography and product copy",
      ],
    },
    onRequest: {
      nl: [
        "Achteraf betalen (Klarna of Riverty)",
        "Kortingscodes en verlaten-winkelwagen-mail",
        "Verzendkoppeling (Sendcloud, PostNL of DHL)",
        "Productimport per 100 producten",
        "Kanaal activeren met aankoop-events: Google Ads, Meta of TikTok",
        "Toegankelijkheidsaudit (WCAG) met rapport",
      ],
      en: [
        "Pay later (Klarna or Riverty)",
        "Discount codes and abandoned-cart email",
        "Shipping integration (Sendcloud, PostNL or DHL)",
        "Product import per 100 products",
        "Channel activation with purchase events: Google Ads, Meta or TikTok",
        "Accessibility audit (WCAG) with report",
      ],
    },
    boundary: {
      nl: "B2B-prijzen per klantgroep, klantlogin met eigen condities, betalen op rekening, koppelingen met ERP, WMS of PIM, een configurator in de shop of meer dan ongeveer 500 producten: dan is het maatwerk op scope.",
      en: "B2B pricing per customer group, customer login with own terms, invoice payment, ERP, WMS or PIM integrations, a configurator in the shop or more than about 500 products: then it is custom work on scope.",
    },
  },
  platform: {
    id: "platform",
    audience: {
      nl: "Voor een proces dat bestaande software niet dekt: portaal, intern systeem, configurator of platform",
      en: "For a process existing software does not cover: portal, internal system, configurator or platform",
    },
    highlights: {
      nl: [
        "Verkenning vooraf: scope, vaste prijs per blok en planning",
        "Een afgebakende eerste versie, daarna uitbreiden in blokken",
        "Inloggen, rollen, eigen gegevens en dashboards waar je proces erom vraagt",
        "Code en documentatie zijn van jou",
      ],
      en: [
        "Discovery up front: scope, fixed price per block and planning",
        "A clearly scoped first version, then extending in blocks",
        "Logins, roles, own data and dashboards where your process asks for them",
        "The code and documentation are yours",
      ],
    },
    included: {
      nl: [
        "Verkenning vooraf: scope, vaste prijs per blok en planning",
        "Een afgebakende eerste werkende versie",
        "De onderdelen die je proces vraagt: inloggen en accounts, gebruikersrollen, eigen gegevens, dashboards en beheerschermen, database, workflows",
        "Overdracht van code en documentatie",
        "Uitbreiden in afgebakende blokken, elk met een vaste prijs vooraf",
      ],
      en: [
        "Discovery up front: scope, fixed price per block and planning",
        "A clearly scoped first working version",
        "The parts your process asks for: login and accounts, user roles, own data, dashboards and admin screens, database, workflows",
        "Handover of code and documentation",
        "Extending in clearly scoped blocks, each with a fixed price up front",
      ],
    },
    notIncluded: {
      nl: [
        "Open scope zonder einde: elk blok wordt vooraf afgebakend",
        "Alle functies tegelijk in de eerste versie",
      ],
      en: [
        "Open-ended scope: every block is scoped up front",
        "Every feature at once in the first version",
      ],
    },
    onRequest: { nl: [], en: [] },
    boundary: {
      nl: "Rollen, workflows, koppelingen, configuratorlogica en infrastructuur bepalen de scope en daarmee de prijs. De vanafprijs dekt een afgebakende eerste versie, niet elke functie tegelijk. Een app kan een eigen traject zijn als de scope daarom vraagt.",
      en: "Roles, workflows, integrations, configurator logic and infrastructure determine the scope and with it the price. The starting price covers a clearly scoped first version, not every feature at once. An app can be a project of its own if the scope asks for it.",
    },
  },
};

export function getPackageMetadata(id: PackageId): PackageMetadata {
  return packageMetadata[id];
}
