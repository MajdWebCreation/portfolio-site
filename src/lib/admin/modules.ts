/**
 * Information architecture of the admin. Every module has its own route
 * under (shell). `status` stays so a future module can be listed before it
 * is built.
 */
export type AdminModuleKey =
  | "dashboard"
  | "articles"
  | "inquiries"
  | "leads"
  | "customers"
  | "pricing"
  | "quotes"
  | "invoices";

export type AdminModuleStatus = "available" | "planned";

export type AdminModule = {
  key: AdminModuleKey;
  /** URL segment under /admin; the dashboard lives on /admin itself. */
  slug: string | null;
  label: string;
  /** One line on what the module will hold. */
  description: string;
  status: AdminModuleStatus;
};

export const adminModules: readonly AdminModule[] = [
  {
    key: "dashboard",
    slug: null,
    label: "Dashboard",
    description: "Wat aandacht vraagt, in één overzicht.",
    status: "available",
  },
  {
    key: "articles",
    slug: "artikelen",
    label: "Artikelen",
    description: "Inzichten schrijven, bewerken en publiceren.",
    status: "available",
  },
  {
    key: "inquiries",
    slug: "aanvragen",
    label: "Aanvragen",
    description: "Berichten via het contactformulier en de projectplanner.",
    status: "available",
  },
  {
    key: "leads",
    slug: "leads",
    label: "Leads",
    description: "Eigen prospects en de opvolging daarvan.",
    status: "available",
  },
  {
    key: "customers",
    slug: "klanten",
    label: "Klanten",
    description: "Opdrachtgevers, contactpersonen en hun projecten.",
    status: "available",
  },
  {
    key: "pricing",
    slug: "prijzen",
    label: "Prijzen",
    description: "Pakketten, uitbreidingen en beheertarieven op één plek.",
    status: "available",
  },
  {
    key: "quotes",
    slug: "offertes",
    label: "Offertes",
    description: "Voorstellen opstellen, versturen en opvolgen.",
    status: "available",
  },
  {
    key: "invoices",
    slug: "facturen",
    label: "Facturen",
    description: "Facturen opstellen en de betaalstatus bijhouden.",
    status: "available",
  },
];

export const adminRoot = "/admin";
export const adminLoginPath = "/admin/login";

export function getAdminModulePath(module: Pick<AdminModule, "slug">): string {
  return module.slug ? `${adminRoot}/${module.slug}` : adminRoot;
}

export function getAdminModule(key: AdminModuleKey): AdminModule {
  const found = adminModules.find((module) => module.key === key);
  if (!found) {
    throw new Error(`Unknown admin module: ${key}`);
  }
  return found;
}

export function getAdminModuleBySlug(slug: string): AdminModule | undefined {
  return adminModules.find((module) => module.slug === slug);
}

export function isAdminPathActive(pathname: string, module: AdminModule): boolean {
  const path = getAdminModulePath(module);
  return module.slug
    ? pathname === path || pathname.startsWith(`${path}/`)
    : pathname === path;
}
