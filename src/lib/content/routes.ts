import { type Locale } from "@/lib/content/site-content";

export type StaticRouteKey =
  | "home"
  | "services"
  | "pricing"
  | "projects"
  | "contact"
  | "blog";

const localizedStaticRoutes: Record<StaticRouteKey, Record<Locale, string>> = {
  home: {
    en: "/en",
    nl: "/nl",
  },
  services: {
    en: "/en/services",
    nl: "/nl/diensten",
  },
  pricing: {
    en: "/en/pricing",
    nl: "/nl/tarieven",
  },
  projects: {
    en: "/en/projects",
    nl: "/nl/projecten",
  },
  contact: {
    en: "/en/contact",
    nl: "/nl/contact",
  },
  blog: {
    en: "/en/blog",
    nl: "/nl/blog",
  },
};

const localizedServiceSlugs = [
  {
    en: "business-websites",
    nl: "bedrijfswebsite",
  },
  {
    en: "web-app-development",
    nl: "webapplicatie-laten-maken",
  },
  {
    en: "ecommerce-development",
    nl: "webshop-laten-maken",
  },
  {
    en: "landing-pages",
    nl: "landingspagina",
  },
  {
    en: "redesign-optimization",
    nl: "redesign-optimalisatie",
  },
  {
    en: "performance-optimization",
    nl: "performance",
  },
] as const;

export function getLocalizedPath(locale: Locale, route: StaticRouteKey) {
  return localizedStaticRoutes[route][locale];
}

export function getLocaleSwitcherPath(locale: Locale) {
  return locale === "en" ? "/nl" : "/en";
}

export function getRouteAlternates(route: StaticRouteKey) {
  return {
    languages: {
      en: localizedStaticRoutes[route].en,
      nl: localizedStaticRoutes[route].nl,
      "x-default": localizedStaticRoutes[route].en,
    },
  };
}

function normalizePathname(pathname: string) {
  if (!pathname || pathname === "/") {
    return localizedStaticRoutes.home.en;
  }

  return pathname.length > 1 && pathname.endsWith("/")
    ? pathname.slice(0, -1)
    : pathname;
}

export function getCounterpartPath(
  pathname: string,
  locale: Locale,
  targetLocale: Locale,
) {
  const normalizedPath = normalizePathname(pathname);

  if (locale === targetLocale) {
    return normalizedPath;
  }

  for (const route of Object.keys(localizedStaticRoutes) as StaticRouteKey[]) {
    if (normalizedPath === localizedStaticRoutes[route][locale]) {
      return localizedStaticRoutes[route][targetLocale];
    }
  }

  const servicesBase = localizedStaticRoutes.services[locale];
  if (normalizedPath.startsWith(`${servicesBase}/`)) {
    const slug = normalizedPath.slice(servicesBase.length + 1);
    const localizedService = localizedServiceSlugs.find(
      (service) => service[locale] === slug,
    );

    if (localizedService) {
      return `${localizedStaticRoutes.services[targetLocale]}/${localizedService[targetLocale]}`;
    }
  }

  return localizedStaticRoutes.home[targetLocale];
}
