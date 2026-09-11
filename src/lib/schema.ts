import { businessInfo, type Locale } from "@/lib/content/site-content";

/**
 * The structured data the public site emits, as one connected graph.
 *
 * Every entity that is referred to more than once has a stable absolute `@id`,
 * so the company described on the home page and the company named as publisher
 * of an article are the same node rather than two look-alike copies. Pages
 * therefore reference `{ "@id": ... }` instead of repeating a second, slightly
 * different Organization.
 *
 * The company is one company. There is no Dutch organization and an English
 * one, and no second website: only the pages are language-bound, and they say
 * so with `inLanguage`.
 *
 * Nothing here is invented. The company facts come from `businessInfo`, and a
 * field we cannot back with a real value -- an address, a social profile, a
 * rating, opening hours -- is left out rather than filled in. There is no
 * search on this site, so there is no `SearchAction` either.
 */

const siteUrl = businessInfo.websiteUrl;

/** The company, referred to from every page that names a publisher or provider. */
export const organizationId = `${siteUrl}/#organization`;

/** The site as a whole; the pages below are parts of it. */
export const websiteId = `${siteUrl}/#website`;

const logoId = `${siteUrl}/#logo`;

/**
 * The brand mark, in the raster format Google Images handles and well over the
 * 112x112 minimum for an Organization logo. It is the same file the favicon
 * and the share image are drawn from, and it is opaque, so it stays legible on
 * the white background a logo is shown against.
 */
const logoAsset = {
  path: "/images/branding/ym-favicon-mark.png",
  width: 1024,
  height: 1024,
};

/**
 * The language tags mirror the ones the Open Graph metadata already declares,
 * so the page does not claim one language in two notations.
 */
const schemaLanguage: Record<Locale, string> = {
  nl: "nl-NL",
  en: "en-US",
};

function absolute(path: string) {
  return new URL(path, siteUrl).toString();
}

/** The page entity for a URL; pages on this site are identified this way. */
export function webPageId(url: string) {
  return `${url}#webpage`;
}

function breadcrumbId(url: string) {
  return `${url}#breadcrumb`;
}

type PageInput = {
  locale: Locale;
  name: string;
  description: string;
  url: string;
  /** Set when the page also emits `breadcrumbListSchema` for the same URL. */
  hasBreadcrumb?: boolean;
};

/** What every page entity shares: identity, language and the site it is on. */
function pageBase({ locale, name, description, url, hasBreadcrumb }: PageInput) {
  return {
    "@context": "https://schema.org",
    "@id": webPageId(url),
    name,
    description,
    url,
    inLanguage: schemaLanguage[locale],
    isPartOf: { "@id": websiteId },
    ...(hasBreadcrumb ? { breadcrumb: { "@id": breadcrumbId(url) } } : {}),
  };
}

/**
 * What a work described on a page shares. A work is not the page it is shown
 * on, so it keeps its own identifier and points back at the page instead of
 * replacing it.
 */
function workBase({ locale, name, description, url }: PageInput, fragment: string) {
  return {
    "@context": "https://schema.org",
    "@id": `${url}#${fragment}`,
    name,
    description,
    url,
    inLanguage: schemaLanguage[locale],
    isPartOf: { "@id": websiteId },
    mainEntityOfPage: { "@id": webPageId(url) },
  };
}

export function organizationSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": organizationId,
    name: businessInfo.name,
    legalName: businessInfo.legalName,
    url: `${siteUrl}/`,
    email: businessInfo.email,
    telephone: businessInfo.phone,
    identifier: businessInfo.kvk,
    logo: {
      "@type": "ImageObject",
      "@id": logoId,
      url: absolute(logoAsset.path),
      contentUrl: absolute(logoAsset.path),
      width: logoAsset.width,
      height: logoAsset.height,
      caption: businessInfo.name,
    },
    image: { "@id": logoId },
  };
}

export function websiteSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": websiteId,
    name: businessInfo.name,
    url: `${siteUrl}/`,
    inLanguage: [schemaLanguage.nl, schemaLanguage.en],
    publisher: { "@id": organizationId },
  };
}

export function webPageSchema(input: PageInput) {
  return { "@type": "WebPage" as const, ...pageBase(input) };
}

export function collectionPageSchema(input: PageInput) {
  return { "@type": "CollectionPage" as const, ...pageBase(input) };
}

/**
 * The article index: a Blog is a work rather than a page type, so it sits
 * next to the page entity instead of standing in for it.
 */
export function blogSchema(input: PageInput) {
  return {
    "@type": "Blog" as const,
    ...workBase(input, "blog"),
    publisher: { "@id": organizationId },
  };
}

/**
 * A service.
 *
 * A Service is not a creative work, so it carries neither `inLanguage` nor
 * `isPartOf` -- those belong to the page it is described on, which is where
 * they are set.
 */
export function serviceSchema(input: PageInput) {
  return {
    "@context": "https://schema.org",
    "@type": "Service" as const,
    "@id": `${input.url}#service`,
    name: input.name,
    description: input.description,
    url: input.url,
    mainEntityOfPage: { "@id": webPageId(input.url) },
    provider: { "@id": organizationId },
  };
}

/**
 * A case: the work itself, described on its own page. We built it, so the
 * company is its creator -- that is what the projects section of this site
 * documents, not an authorship claim borrowed from owning the domain.
 */
export function creativeWorkSchema(input: PageInput & { image?: string }) {
  return {
    "@type": "CreativeWork" as const,
    ...workBase(input, "case"),
    creator: { "@id": organizationId },
    ...(input.image ? { image: input.image } : {}),
  };
}

/**
 * An article.
 *
 * `author` is only set when the article record actually names one. Owning the
 * site does not establish who wrote a given piece, and the publisher is not
 * quietly promoted to author to fill the field.
 *
 * There is no `dateModified`: the only change timestamp on an article row is
 * touched in bulk by imports and edits, which makes it a record-keeping date
 * rather than an editorial one -- on most rows it even predates the article's
 * own publication date.
 */
export function blogPostingSchema(input: {
  locale: Locale;
  headline: string;
  description: string;
  url: string;
  datePublished?: string;
  authorName?: string;
  image?: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting" as const,
    "@id": `${input.url}#article`,
    headline: input.headline,
    description: input.description,
    url: input.url,
    inLanguage: schemaLanguage[input.locale],
    mainEntityOfPage: { "@id": webPageId(input.url) },
    isPartOf: { "@id": websiteId },
    ...(input.image ? { image: input.image } : {}),
    ...(input.datePublished ? { datePublished: input.datePublished } : {}),
    ...(input.authorName
      ? {
          author: {
            "@type": "Person",
            name: input.authorName,
          },
        }
      : {}),
    publisher: { "@id": organizationId },
  };
}

/**
 * The trail above the page, as the page itself renders it.
 *
 * The crumbs come from the same builder the visible navigation uses, so the
 * markup cannot drift from what a visitor sees. The last crumb is the current
 * page and carries its own URL, which is the page entity's URL.
 */
export function breadcrumbListSchema(input: {
  url: string;
  items: readonly { name: string; url: string }[];
}) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "@id": breadcrumbId(input.url),
    itemListElement: input.items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };
}
