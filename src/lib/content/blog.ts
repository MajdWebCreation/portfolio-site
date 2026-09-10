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

export type BlogCategory =
  | "kosten"
  | "seo"
  | "webapplicaties"
  | "performance";

export type ArticleBlock =
  | { type: "paragraph"; content: string }
  | { type: "heading"; level: 2 | 3; content: string }
  | { type: "list"; items: string[] };

const categoryLabels: Record<Locale, Record<BlogCategory, string>> = {
  en: {
    kosten: "Costs",
    seo: "SEO",
    webapplicaties: "Web applications",
    performance: "Performance",
  },
  nl: {
    kosten: "Kosten",
    seo: "SEO",
    webapplicaties: "Webapplicaties",
    performance: "Performance",
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
      "Articles by YM Creations on website costs, launch checklists, web application projects and performance.",
    title: "Insights",
    intro:
      "Articles about what a website costs, what a launch checklist should contain, how a web application project runs and how to make a site respond fast.",
    emptyState:
      "The articles are currently published in Dutch only.",
    emptyStateLinkLabel: "Read the Dutch articles",
    readLabel: "Read article",
  },
  nl: {
    metaTitle: "Inzichten",
    metaDescription:
      "Artikelen van YM Creations over websitekosten, launch-checklists, webapplicatieprojecten en performance.",
    title: "Inzichten",
    intro:
      "Artikelen over wat een website kost, wat er in een launch-checklist hoort, hoe een webapplicatieproject verloopt en hoe je een site echt snel laat reageren.",
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
    },
    nl: {
      services: "Diensten",
      projects: "Projecten",
      contact: "Contact",
      blog: "Inzichten",
    },
  } as const;

  for (const route of ["services", "projects", "contact", "blog"] as const) {
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
