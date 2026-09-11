import { getLocalizedPath } from "@/lib/content/routes";
import { serviceDefinitions, serviceKeys } from "@/lib/content/services";
import { type Locale } from "@/lib/content/site-content";

/**
 * Everything about the public Inzichten pages except the articles themselves.
 *
 * The articles live in Supabase (see `content/articles.ts`); this module holds
 * the words around them -- the overview copy, the category names, the date
 * format -- and the block model the article renderer takes.
 *
 * `articleExtras` is the one per-article thing that stayed here: the reading
 * time the author gave each of the four original articles, and the closing
 * call to action with its related service links. Those are navigation and
 * presentation, not article content, and the editor does not edit them; an
 * article written in the admin falls back to the defaults below.
 */

/**
 * The five subject clusters the knowledge library is organised in. A category
 * is a topic, not a search intent: an article about what a webshop costs sits
 * with the other websites-and-webshops articles rather than in a "costs" bin,
 * so a reader who arrives on one article finds its neighbours.
 */
export const blogCategories = [
  "websites",
  "webapplicaties",
  "configurators",
  "automatisering",
  "techniek",
] as const;

export type BlogCategory = (typeof blogCategories)[number];

export function isBlogCategory(value: string): value is BlogCategory {
  return (blogCategories as readonly string[]).includes(value);
}

/**
 * The blocks an article renders as. Paragraphs, two heading levels and lists
 * carry most of the text; quotes, code blocks and tables exist because the
 * articles use them for pull quotes, flow diagrams and comparison matrices,
 * and dropping those would change what the articles say.
 */
export type ArticleBlock =
  | { type: "paragraph"; content: string }
  | { type: "heading"; level: 2 | 3; content: string }
  | { type: "list"; items: string[]; ordered?: boolean }
  | { type: "quote"; content: string }
  | { type: "code"; content: string }
  | { type: "table"; head: string[]; rows: string[][] };

const categoryLabels: Record<Locale, Record<BlogCategory, string>> = {
  en: {
    websites: "Websites & webshops",
    webapplicaties: "Web applications & portals",
    configurators: "3D configurators",
    automatisering: "Automation & integrations",
    techniek: "Engineering & strategy",
  },
  nl: {
    websites: "Websites & webshops",
    webapplicaties: "Webapplicaties & portalen",
    configurators: "3D-configurators",
    automatisering: "Automatisering & koppelingen",
    techniek: "Techniek & strategie",
  },
};

export type ArticleExtras = {
  /** As the author stated it; a new article gets one computed from its length. */
  readingTime?: string;
  ctaText: string;
  ctaPrimaryLink: string;
  ctaSecondaryText?: string;
  ctaSecondaryLink?: string;
  relatedServices: string[];
};

const articleExtras: Record<string, ArticleExtras> = {
  "wat-kost-een-maatwerk-website-in-2026": {
    readingTime: "8 min",
    ctaText:
      "Wil je helder krijgen wat jouw website echt nodig heeft en waar de investering naartoe gaat? Dan is een korte intake vaak waardevoller dan een snelle prijsindicatie zonder context.",
    ctaPrimaryLink: "/nl/contact",
    ctaSecondaryText: "Bekijk de dienst Bedrijfswebsite",
    ctaSecondaryLink: "/nl/diensten/bedrijfswebsite",
    relatedServices: [
      "/nl/diensten/bedrijfswebsite",
      "/nl/diensten/landingspagina",
      "/nl/diensten/redesign-optimalisatie",
      "/nl/diensten/performance",
    ],
  },
  "checklist-launch-ready-website-seo-performance": {
    readingTime: "9 min",
    ctaText:
      "Wil je een nieuwe website of redesign live zetten zonder onnodige SEO- of performancefouten? Laat de laatste technische check dan niet aan toeval over.",
    ctaPrimaryLink: "/nl/contact",
    ctaSecondaryText: "Bekijk Redesign & optimalisatie",
    ctaSecondaryLink: "/nl/diensten/redesign-optimalisatie",
    relatedServices: [
      "/nl/diensten/redesign-optimalisatie",
      "/nl/diensten/performance",
      "/nl/diensten/bedrijfswebsite",
    ],
  },
  "webapplicatie-laten-maken-stappenplan": {
    readingTime: "9 min",
    ctaText:
      "Heb je een idee voor een portaal, dashboard of maatwerk tool en wil je eerst scherp krijgen wat haalbaar is als eerste versie? Dan begint een goed traject met scope, niet met losse features.",
    ctaPrimaryLink: "/nl/contact",
    ctaSecondaryText: "Bekijk Webapplicatie laten maken",
    ctaSecondaryLink: "/nl/diensten/webapplicatie-laten-maken",
    relatedServices: [
      "/nl/diensten/webapplicatie-laten-maken",
      "/nl/diensten/performance",
      "/nl/contact",
    ],
  },
  "inp-uitgelegd-hoe-maak-je-een-site-echt-responsief": {
    readingTime: "8 min",
    ctaText:
      "Wil je dat je website niet alleen strak oogt, maar ook direct en soepel aanvoelt zodra iemand ermee werkt? Dan is performance niet iets voor achteraf.",
    ctaPrimaryLink: "/nl/contact",
    ctaSecondaryText: "Bekijk Performance optimalisatie",
    ctaSecondaryLink: "/nl/diensten/performance",
    relatedServices: [
      "/nl/diensten/performance",
      "/nl/diensten/redesign-optimalisatie",
      "/nl/diensten/bedrijfswebsite",
    ],
  },
  "website-of-webshop": {
    ctaText:
      "Twijfel je tussen een website met aanvraagflow en een volledige webshop? Leg beide vormen naast het verkoopproces dat je nu al draait; dat maakt de keuze meestal sneller duidelijk dan een featurevergelijking.",
    ctaPrimaryLink: "/nl/contact",
    ctaSecondaryText: "Bekijk Webshop laten maken",
    ctaSecondaryLink: "/nl/diensten/webshop-laten-maken",
    relatedServices: [
      "/nl/diensten/bedrijfswebsite",
      "/nl/diensten/webshop-laten-maken",
      "/nl/diensten/webapplicatie-laten-maken",
    ],
  },
  "van-excel-naar-maatwerksoftware": {
    ctaText:
      "Draagt een spreadsheet inmiddels een deel van je proces? Dan helpt het om eerst te bepalen welk stuk een koppeling is en welk stuk echt nieuwe software vraagt.",
    ctaPrimaryLink: "/nl/contact",
    ctaSecondaryText: "Bekijk Webapplicatie laten maken",
    ctaSecondaryLink: "/nl/diensten/webapplicatie-laten-maken",
    relatedServices: [
      "/nl/diensten/webapplicatie-laten-maken",
      "/nl/diensten/koppelingen-automatisering",
    ],
  },
  "wat-is-een-3d-productconfigurator": {
    ctaText:
      "Wil je weten of jouw product zich laat vertalen naar keuzes, regels en een geldige configuratie? Dat is een productvraag, geen 3D-vraag, en meestal in een kort gesprek te toetsen.",
    ctaPrimaryLink: "/nl/contact",
    ctaSecondaryText: "Bekijk 3D-configurator",
    ctaSecondaryLink: "/nl/diensten/3d-configurator",
    relatedServices: [
      "/nl/diensten/3d-configurator",
      "/nl/diensten/webapplicatie-laten-maken",
    ],
  },
  "welke-bedrijfsprocessen-moet-je-automatiseren": {
    ctaText:
      "Wil je één proces doorlopen op stabiliteit, brondata en herstelpad voordat er iets gebouwd wordt? Dat is meestal de goedkoopste stap in een automatiseringstraject.",
    ctaPrimaryLink: "/nl/contact",
    ctaSecondaryText: "Bekijk Koppelingen & automatisering",
    ctaSecondaryLink: "/nl/diensten/koppelingen-automatisering",
    relatedServices: [
      "/nl/diensten/koppelingen-automatisering",
      "/nl/diensten/webapplicatie-laten-maken",
    ],
  },
  "wat-kost-een-website-of-webshop": {
    ctaText:
      "Wil je offertes eerlijk kunnen vergelijken? Zet eerst de scope op papier: welke templates, content, koppelingen en migratie er echt bij horen. Pas daarna zegt een bedrag iets.",
    ctaPrimaryLink: "/nl/contact",
    ctaSecondaryText: "Bekijk Bedrijfswebsite",
    ctaSecondaryLink: "/nl/diensten/bedrijfswebsite",
    relatedServices: [
      "/nl/diensten/bedrijfswebsite",
      "/nl/diensten/webshop-laten-maken",
      "/nl/diensten/landingspagina",
      "/nl/tarieven",
    ],
  },
  "technische-kwaliteit-website-webapp-beoordelen": {
    ctaText:
      "Wil je weten hoe je huidige site of applicatie ervoor staat voordat je opnieuw investeert? Een technische beoordeling levert een prioriteitenlijst op, geen rapportcijfer.",
    ctaPrimaryLink: "/nl/contact",
    ctaSecondaryText: "Bekijk Redesign & optimalisatie",
    ctaSecondaryLink: "/nl/diensten/redesign-optimalisatie",
    relatedServices: [
      "/nl/diensten/redesign-optimalisatie",
      "/nl/diensten/performance",
      "/nl/diensten/webapplicatie-laten-maken",
    ],
  },
  "maatwerksoftware-of-standaardsoftware": {
    ctaText:
      "Wil je de vijf oplossingsvormen naast je eigen proces leggen? Vaak blijkt dan dat maar een klein deel echt maatwerk hoeft te zijn.",
    ctaPrimaryLink: "/nl/contact",
    ctaSecondaryText: "Bekijk Webapplicatie laten maken",
    ctaSecondaryLink: "/nl/diensten/webapplicatie-laten-maken",
    relatedServices: [
      "/nl/diensten/webapplicatie-laten-maken",
      "/nl/diensten/koppelingen-automatisering",
    ],
  },
  "wanneer-is-een-3d-productconfigurator-zinvol": {
    ctaText:
      "Wil je de businesscase toetsen voordat je aan 3D begint? Begin bij het verkoopproces zoals het nu loopt en bij de vraag wat er ná het configureren gebeurt.",
    ctaPrimaryLink: "/nl/contact",
    ctaSecondaryText: "Bekijk 3D-configurator",
    ctaSecondaryLink: "/nl/diensten/3d-configurator",
    relatedServices: [
      "/nl/diensten/3d-configurator",
      "/nl/diensten/webshop-laten-maken",
      "/nl/diensten/koppelingen-automatisering",
    ],
  },
  "zapier-make-of-maatwerk": {
    ctaText:
      "Wil je per proces bepalen wat een platform kan dragen en waar eigen code nodig is? Dat is meestal een keuze per workflow, niet één keuze voor het hele bedrijf.",
    ctaPrimaryLink: "/nl/contact",
    ctaSecondaryText: "Bekijk Koppelingen & automatisering",
    ctaSecondaryLink: "/nl/diensten/koppelingen-automatisering",
    relatedServices: [
      "/nl/diensten/koppelingen-automatisering",
      "/nl/diensten/webapplicatie-laten-maken",
    ],
  },
  "website-vernieuwen-optimaliseren-redesign-herbouwen-replatformen": {
    ctaText:
      "Wil je eerst vaststellen wát er misgaat voordat je een nieuwe website laat bouwen? Een diagnose voorkomt dat je meer vervangt dan nodig is.",
    ctaPrimaryLink: "/nl/contact",
    ctaSecondaryText: "Bekijk Redesign & optimalisatie",
    ctaSecondaryLink: "/nl/diensten/redesign-optimalisatie",
    relatedServices: [
      "/nl/diensten/redesign-optimalisatie",
      "/nl/diensten/performance",
      "/nl/diensten/bedrijfswebsite",
    ],
  },
  "wat-kost-een-webapplicatie": {
    ctaText:
      "Wil je van een idee naar een scope waarop een prijs te baseren is? Rollen, workflows en integraties bepalen die scope sterker dan het aantal schermen.",
    ctaPrimaryLink: "/nl/contact",
    ctaSecondaryText: "Bekijk Webapplicatie laten maken",
    ctaSecondaryLink: "/nl/diensten/webapplicatie-laten-maken",
    relatedServices: [
      "/nl/diensten/webapplicatie-laten-maken",
      "/nl/diensten/koppelingen-automatisering",
      "/nl/tarieven",
    ],
  },
  "technische-schuld-software": {
    ctaText:
      "Merk je dat kleine wijzigingen steeds meer tijd kosten? Dan is het nuttig om eerst te benoemen welke schuld bewust is genomen en welke ongemerkt is ontstaan.",
    ctaPrimaryLink: "/nl/contact",
    ctaSecondaryText: "Bekijk Redesign & optimalisatie",
    ctaSecondaryLink: "/nl/diensten/redesign-optimalisatie",
    relatedServices: [
      "/nl/diensten/redesign-optimalisatie",
      "/nl/diensten/webapplicatie-laten-maken",
      "/nl/diensten/performance",
    ],
  },
  "api-koppeling-laten-maken": {
    ctaText:
      "Wil je een koppeling die ook werkt wanneer er iets misgaat? Retries, idempotency en herstel horen in de scope thuis, niet in de nazorg.",
    ctaPrimaryLink: "/nl/contact",
    ctaSecondaryText: "Bekijk Koppelingen & automatisering",
    ctaSecondaryLink: "/nl/diensten/koppelingen-automatisering",
    relatedServices: [
      "/nl/diensten/koppelingen-automatisering",
      "/nl/diensten/webapplicatie-laten-maken",
    ],
  },
  "wat-kost-een-3d-productconfigurator": {
    ctaText:
      "Wil je een raming die ergens op gebaseerd is? Die begint bij productregels, 3D-assets en het eindpunt van de flow, niet bij het aantal schermen.",
    ctaPrimaryLink: "/nl/contact",
    ctaSecondaryText: "Bekijk 3D-configurator",
    ctaSecondaryLink: "/nl/diensten/3d-configurator",
    relatedServices: [
      "/nl/diensten/3d-configurator",
      "/nl/diensten/koppelingen-automatisering",
      "/nl/tarieven",
    ],
  },
  "core-web-vitals-websiteperformance": {
    ctaText:
      "Wil je weten welke performanceproblemen je bezoekers echt raken? Dat begint bij meten op de pagina's die commercieel het zwaarst wegen.",
    ctaPrimaryLink: "/nl/contact",
    ctaSecondaryText: "Bekijk Performance optimalisatie",
    ctaSecondaryLink: "/nl/diensten/performance",
    relatedServices: [
      "/nl/diensten/performance",
      "/nl/diensten/redesign-optimalisatie",
      "/nl/diensten/bedrijfswebsite",
    ],
  },
  "klantportaal-laten-maken": {
    ctaText:
      "Wil je bepalen welke terugkerende klantvraag een portaal zou moeten oplossen? Begin bij de frictie en bij de data die er nu al betrouwbaar is.",
    ctaPrimaryLink: "/nl/contact",
    ctaSecondaryText: "Bekijk Webapplicatie laten maken",
    ctaSecondaryLink: "/nl/diensten/webapplicatie-laten-maken",
    relatedServices: [
      "/nl/diensten/webapplicatie-laten-maken",
      "/nl/diensten/koppelingen-automatisering",
    ],
  },
  "website-koppelen-aan-crm": {
    ctaText:
      "Wil je dat websiteaanvragen betrouwbaar in je CRM landen, zonder dubbele contacten? Dat vraagt vooral een duidelijke keuze over identiteit en eigenaarschap per veld.",
    ctaPrimaryLink: "/nl/contact",
    ctaSecondaryText: "Bekijk Koppelingen & automatisering",
    ctaSecondaryLink: "/nl/diensten/koppelingen-automatisering",
    relatedServices: [
      "/nl/diensten/koppelingen-automatisering",
      "/nl/diensten/bedrijfswebsite",
    ],
  },
  "technisch-onderhoud-website-webapp-na-livegang": {
    ctaText:
      "Wil je concreet maken wat er na livegang gebeurt? Updates, backups, monitoring en herstel horen in de afspraak te staan, niet in één regel \u201Conderhoud inbegrepen\u201D.",
    ctaPrimaryLink: "/nl/contact",
    ctaSecondaryText: "Bekijk Redesign & optimalisatie",
    ctaSecondaryLink: "/nl/diensten/redesign-optimalisatie",
    relatedServices: [
      "/nl/diensten/redesign-optimalisatie",
      "/nl/diensten/performance",
      "/nl/diensten/webapplicatie-laten-maken",
    ],
  },
  "hoe-werkt-een-3d-productconfigurator-technisch": {
    ctaText:
      "Wil je de architectuur van een configurator beoordelen voordat er gebouwd wordt? Begin bij het productmodel en bij de vraag welke data er ná de configuratie nodig is.",
    ctaPrimaryLink: "/nl/contact",
    ctaSecondaryText: "Bekijk 3D-configurator",
    ctaSecondaryLink: "/nl/diensten/3d-configurator",
    relatedServices: [
      "/nl/diensten/3d-configurator",
      "/nl/diensten/koppelingen-automatisering",
      "/nl/diensten/webapplicatie-laten-maken",
    ],
  },
  "website-code-data-eigendom-vendor-lock-in": {
    ctaText:
      "Wil je vooraf vastleggen wie waarover beschikt? Code, data, domein, accounts en documentatie horen bij de opdracht, niet pas bij het afscheid.",
    ctaPrimaryLink: "/nl/contact",
    ctaSecondaryText: "Bekijk de werkwijze",
    ctaSecondaryLink: "/nl/werkwijze",
    relatedServices: [
      "/nl/werkwijze",
      "/nl/diensten/webapplicatie-laten-maken",
      "/nl/diensten/bedrijfswebsite",
    ],
  },
};

/** The closing block for an article that has no entry above. */
function defaultExtras(locale: Locale): ArticleExtras {
  return {
    ctaText:
      locale === "nl"
        ? "Wil je hier verder over praten? Een kort gesprek maakt meestal sneller duidelijk wat er nodig is dan een lange offerte."
        : "Want to talk this through? A short conversation usually makes the next step clearer than a long quote.",
    ctaPrimaryLink: getLocalizedPath(locale, "contact"),
    relatedServices: [],
  };
}

export function getArticleExtras(locale: Locale, slug: string): ArticleExtras {
  return articleExtras[slug] ?? defaultExtras(locale);
}

export const blogOverviewContent = {
  en: {
    metaTitle: "Insights",
    metaDescription:
      "Articles by YM Creations on websites and webshops, web applications and portals, 3D configurators, automation and integrations, and the engineering choices behind them.",
    title: "Insights",
    intro:
      "Articles on websites and webshops, web applications and portals, 3D configurators, automation and integrations, and the engineering and strategy questions that run underneath all four.",
    emptyState:
      "The articles are currently published in Dutch only.",
    emptyStateLinkLabel: "Read the Dutch articles",
    readLabel: "Read article",
  },
  nl: {
    metaTitle: "Inzichten",
    metaDescription:
      "Artikelen van YM Creations over websites en webshops, webapplicaties en portalen, 3D-configurators, automatisering en koppelingen, en de techniek eronder.",
    title: "Inzichten",
    intro:
      "Artikelen over websites en webshops, webapplicaties en portalen, 3D-configurators, automatisering en koppelingen, en over de techniek- en strategievragen die onder alle vier liggen.",
    emptyState: "",
    emptyStateLinkLabel: "",
    readLabel: "Lees artikel",
  },
} as const;

export function getBlogOverviewPath(locale: Locale) {
  return getLocalizedPath(locale, "blog");
}

export function getArticlePath(locale: Locale, slug: string) {
  return `${getLocalizedPath(locale, "blog")}/${slug}`;
}

export function getBlogCategoryLabel(locale: Locale, category: BlogCategory) {
  return categoryLabels[locale][category];
}

export function getArticleDateLabel(locale: Locale, date: string) {
  return new Intl.DateTimeFormat(locale === "nl" ? "nl-NL" : "en-US", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(date));
}

export function getRelatedLinkLabel(locale: Locale, href: string) {
  if (href === getLocalizedPath(locale, "contact")) {
    return locale === "nl" ? "Contact" : "Contact";
  }

  const staticLabels = {
    en: {
      services: "Services",
      projects: "Projects",
      contact: "Contact",
      blog: "Insights",
      pricing: "Pricing",
      process: "How we work",
      projectPlanner: "Project planner",
    },
    nl: {
      services: "Diensten",
      projects: "Projecten",
      contact: "Contact",
      blog: "Inzichten",
      pricing: "Tarieven",
      process: "Werkwijze",
      projectPlanner: "Projectplanner",
    },
  } as const;

  for (const route of ["services", "projects", "contact", "blog", "pricing", "process", "projectPlanner"] as const) {
    if (href === getLocalizedPath(locale, route)) {
      return staticLabels[locale][route];
    }
  }

  const service = serviceKeys
    .map((key) => serviceDefinitions[key].locale[locale])
    .find(
      (localizedService) =>
        `${getLocalizedPath(locale, "services")}/${localizedService.slug}` === href,
    );

  return service?.navLabel ?? href;
}
