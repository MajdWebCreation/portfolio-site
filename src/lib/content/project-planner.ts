import { getDevelopmentDiscountCopy } from "@/lib/content/pricing";
import { getLocalizedPath, legalRoutes } from "@/lib/content/routes";
import { type Locale } from "@/lib/content/site-content";
import {
  developmentPrice,
  formatEuro,
  formatMonthlyFrom,
  getAddOn,
  getMonthlyManagementFrom,
  getPackageName,
  getStartingPrice,
  packageIds,
  type PackageId,
  type PricingCatalog,
} from "@/lib/pricing";

export { formatEuro, formatMonthlyFrom };

/** Planner project types are the pricing packages. */
export type PlannerPackageKey = PackageId;

export type PlannerTimeline =
  | "asap"
  | "1-2-months"
  | "2-4-months"
  | "4-plus-months"
  | "";

export type PlannerReadiness = "yes" | "partly" | "no" | "";
export type PlannerYesNo = "yes" | "no" | "";

export type PlannerPriority =
  | "speed"
  | "design-quality"
  | "lead-generation"
  | "automation"
  | "selling-online"
  | "platform-functionality"
  | "";

export type PlannerPageCount = "1-5" | "6-12" | "12+" | "";
export type PlannerProductCount = "up-to-25" | "25-100" | "100+" | "";

export type PlannerState = {
  locale: Locale;
  projectType: PlannerPackageKey | "";
  pageCount: PlannerPageCount;
  multilingual: PlannerYesNo;
  brandingContentState: PlannerReadiness;
  starterSeoBoost: boolean;
  starterMotion: boolean;
  starterNeedBooking: boolean;
  starterNeedAdmin: boolean;
  starterNeedAccounts: boolean;
  starterNeedPayments: boolean;
  starterNeedApi: boolean;
  businessSeoGrowth: boolean;
  businessAdvancedEmail: boolean;
  businessAdminLite: boolean;
  businessLightApi: boolean;
  businessNeedBooking: boolean;
  businessNeedDashboard: boolean;
  businessNeedPricingLogic: boolean;
  businessNeedStatusHandling: boolean;
  smartBookingFlow: boolean;
  smartConfirmations: boolean;
  smartPayments: boolean;
  smartMaps: boolean;
  smartCrm: boolean;
  smartAdmin: boolean;
  smartExpandedAdmin: boolean;
  smartReminderAutomation: boolean;
  smartNeedRoles: boolean;
  smartNeedDashboards: boolean;
  smartNeedPlatformLogic: boolean;
  smartNeedWorkflows: boolean;
  webshopProducts: PlannerProductCount;
  webshopSubscriptions: boolean;
  webshopFilters: boolean;
  webshopIntegrations: boolean;
  webshopMultilingual: boolean;
  webshopSeo: boolean;
  webshopNeedAccountLogic: boolean;
  webshopNeedWorkflowLogic: boolean;
  customLogin: boolean;
  customDashboards: boolean;
  customRoles: boolean;
  customWorkflows: boolean;
  customApi: boolean;
  customReporting: boolean;
  customNotifications: boolean;
  customAppExpansion: boolean;
  launchTimeline: PlannerTimeline;
  contentReady: PlannerReadiness;
  brandingReady: PlannerReadiness;
  priority: PlannerPriority;
  name: string;
  email: string;
  company: string;
  phone: string;
  notes: string;
  /** The request is made on behalf of a business or in a professional capacity. */
  businessDeclaration: boolean;
  website: string;
};

export type PlannerSummary = {
  recommendedPackage: PlannerPackageKey;
  recommendedLabel: string;
  reason: string;
  /** The one-time estimate shown: the base estimate, or the discounted one. */
  startingPrice: number;
  /**
   * The one-time estimate before the development discount, exactly as the
   * planner computes it without a campaign. Equal to `startingPrice` when
   * there is no discount.
   */
  baseStartingPrice: number;
  /** Minimum monthly technical management for the recommended package. Never discounted. */
  monthlyManagementFrom: number;
  range?: {
    min: number;
    max: number;
  };
  /** The range before the development discount; present whenever `range` is. */
  baseRange?: {
    min: number;
    max: number;
  };
  /** The development discount applied to the one-time estimate, or `null`. */
  discountPercent: number | null;
  selectedFeatures: string[];
  selectedAddOns: string[];
  selectedAddOnTotal: number;
  disclaimer: string;
};

type PlannerPageContent = {
  metaTitle: string;
  metaDescription: string;
  hero: {
    eyebrow: string;
    title: string;
    description: string;
  };
  stepLabels: string[];
  nextLabel: string;
  backLabel: string;
  submitLabel: string;
  submittingLabel: string;
  successMessage: string;
  errorMessage: string;
  summary: {
    eyebrow: string;
    title: string;
    recommendedLabel: string;
    priceLabel: string;
    monthlyLabel: string;
    rangeLabel: string;
    selectedFeaturesLabel: string;
    selectedAddOnsLabel: string;
    reasonLabel: string;
    disclaimer: string;
  };
  questions: {
    projectType: string;
    pageCount: string;
    multilingual: string;
    starterAddOns: string;
    starterUpgrade: string;
    businessAddOns: string;
    businessUpgrade: string;
    smartScope: string;
    smartUpgrade: string;
    webshopScope: string;
    webshopUpgrade: string;
    customScope: string;
    timeline: string;
    contentReady: string;
    brandingReady: string;
    priority: string;
    contactHeading: string;
    notes: string;
  };
  options: {
    yes: string;
    no: string;
    partly: string;
    pageCount: Record<Exclude<PlannerPageCount, "">, string>;
    productCount: Record<Exclude<PlannerProductCount, "">, string>;
    timeline: Record<Exclude<PlannerTimeline, "">, string>;
    priority: Record<Exclude<PlannerPriority, "">, string>;
  };
  fields: {
    name: string;
    email: string;
    company: string;
    phone: string;
    notes: string;
    businessDeclaration: string;
    /** A planner request is not an order; links to the terms. */
    requestNote: string;
    termsLabel: string;
    /** What happens with the details entered; links to the privacy statement. */
    privacyNote: string;
    privacyLabel: string;
    placeholders: {
      name: string;
      email: string;
      company: string;
      phone: string;
      notes: string;
    };
  };
  links: {
    pricing: string;
    contact: string;
    terms: string;
    privacy: string;
  };
};

export const initialPlannerState: PlannerState = {
  locale: "en",
  projectType: "",
  pageCount: "",
  multilingual: "",
  brandingContentState: "",
  starterSeoBoost: false,
  starterMotion: false,
  starterNeedBooking: false,
  starterNeedAdmin: false,
  starterNeedAccounts: false,
  starterNeedPayments: false,
  starterNeedApi: false,
  businessSeoGrowth: false,
  businessAdvancedEmail: false,
  businessAdminLite: false,
  businessLightApi: false,
  businessNeedBooking: false,
  businessNeedDashboard: false,
  businessNeedPricingLogic: false,
  businessNeedStatusHandling: false,
  smartBookingFlow: false,
  smartConfirmations: false,
  smartPayments: false,
  smartMaps: false,
  smartCrm: false,
  smartAdmin: false,
  smartExpandedAdmin: false,
  smartReminderAutomation: false,
  smartNeedRoles: false,
  smartNeedDashboards: false,
  smartNeedPlatformLogic: false,
  smartNeedWorkflows: false,
  webshopProducts: "",
  webshopSubscriptions: false,
  webshopFilters: false,
  webshopIntegrations: false,
  webshopMultilingual: false,
  webshopSeo: false,
  webshopNeedAccountLogic: false,
  webshopNeedWorkflowLogic: false,
  customLogin: false,
  customDashboards: false,
  customRoles: false,
  customWorkflows: false,
  customApi: false,
  customReporting: false,
  customNotifications: false,
  customAppExpansion: false,
  launchTimeline: "",
  contentReady: "",
  brandingReady: "",
  priority: "",
  name: "",
  email: "",
  company: "",
  phone: "",
  notes: "",
  businessDeclaration: false,
  website: "",
};

/**
 * The names of the project types, as the database holds them. Not part of
 * `plannerContent` below: that is a fixed block of copy, while these come
 * from the pricing catalog and are read per request.
 */
export function getProjectTypeOptions(
  catalog: PricingCatalog,
  locale: Locale,
): Record<PlannerPackageKey, string> {
  return Object.fromEntries(
    packageIds.map((id) => [id, getPackageName(catalog, locale, id)]),
  ) as Record<PlannerPackageKey, string>;
}

const plannerContent: Record<Locale, PlannerPageContent> = {
  en: {
    metaTitle: "Project Planner",
    metaDescription:
      "A guided project planner by YM Creations to define scope, get a package recommendation, and send a structured inquiry.",
    hero: {
      eyebrow: "Project Planner",
      title: "Shape the scope first. Send a clearer inquiry after.",
      description:
        "This guided intake helps you choose the right project type, understand the scope level, and send YM Creations a more structured project request.",
    },
    stepLabels: ["Project type", "Core scope", "Readiness", "Contact"],
    nextLabel: "Continue",
    backLabel: "Back",
    submitLabel: "Send planner inquiry",
    submittingLabel: "Sending...",
    successMessage:
      "Planner inquiry sent. We’ll review the scope and get back to you soon.",
    errorMessage:
      "Something went wrong. Try again or email contact@ymcreations.com directly.",
    summary: {
      eyebrow: "Live summary",
      title: "Project snapshot",
      recommendedLabel: "Recommended package",
      priceLabel: "One-off, starting from",
      monthlyLabel: "Technical management",
      rangeLabel: "Indicative range",
      selectedFeaturesLabel: "Selected scope",
      selectedAddOnsLabel: "Relevant add-ons",
      reasonLabel: "Why this fits",
      disclaimer:
        "Indicative starting price only. Final quote depends on scope and review.",
    },
    questions: {
      projectType: "What do you need?",
      pageCount: "How many pages do you expect?",
      multilingual: "Do you need multilingual support?",
      starterAddOns: "Which optional refinements matter?",
      starterUpgrade: "Would any more advanced functionality be essential?",
      businessAddOns: "Which extensions matter here?",
      businessUpgrade: "Would the site also need deeper process logic?",
      smartScope: "Which functionality matters most here?",
      smartUpgrade: "Would the project go beyond a smart website?",
      webshopScope: "What does the webshop need?",
      webshopUpgrade: "Would it go beyond ecommerce logic?",
      customScope: "Which platform capabilities matter?",
      timeline: "When do you want to launch?",
      contentReady: "Do you already have content?",
      brandingReady: "Do you already have branding?",
      priority: "What matters most?",
      contactHeading: "Where should we send the scoped response?",
      notes: "Extra context",
    },
    options: {
      yes: "Yes",
      no: "No",
      partly: "Partly",
      pageCount: {
        "1-5": "1-5 pages",
        "6-12": "6-12 pages",
        "12+": "12+ pages",
      },
      productCount: {
        "up-to-25": "Up to 25 products",
        "25-100": "25-100 products",
        "100+": "100+ products",
      },
      timeline: {
        asap: "As soon as possible",
        "1-2-months": "Within 1-2 months",
        "2-4-months": "Within 2-4 months",
        "4-plus-months": "4+ months",
      },
      priority: {
        speed: "Speed",
        "design-quality": "Design quality",
        "lead-generation": "Lead generation",
        automation: "Automation",
        "selling-online": "Selling online",
        "platform-functionality": "Platform functionality",
      },
    },
    fields: {
      name: "Name",
      email: "Email",
      company: "Company",
      phone: "Phone",
      notes: "Project notes",
      businessDeclaration:
        "I am making this request on behalf of a business or in the course of a profession or trade.",
      requestNote: "A planner request is non-binding and not yet an order.",
      termsLabel: "General terms (Dutch)",
      privacyNote: "We use your details only to answer your request. More in the",
      privacyLabel: "privacy statement.",
      placeholders: {
        name: "Your name",
        email: "you@company.com",
        company: "Company name",
        phone: "+31...",
        notes: "Anything else that would help us understand the scope?",
      },
    },
    links: {
      pricing: getLocalizedPath("en", "pricing"),
      contact: getLocalizedPath("en", "contact"),
      terms: legalRoutes.terms,
      privacy: getLocalizedPath("en", "privacy"),
    },
  },
  nl: {
    metaTitle: "Project Planner",
    metaDescription:
      "Een begeleide project planner van YM Creations om scope te bepalen, een pakketadvies te krijgen en een gestructureerde aanvraag te versturen.",
    hero: {
      eyebrow: "Project Planner",
      title: "Bepaal eerst de scope. Verstuur daarna een scherpere aanvraag.",
      description:
        "Deze begeleide intake helpt je het juiste projecttype kiezen, scopeverschillen beter te begrijpen en een gestructureerdere projectaanvraag naar YM Creations te sturen.",
    },
    stepLabels: ["Projecttype", "Scope", "Readiness", "Contact"],
    nextLabel: "Verder",
    backLabel: "Terug",
    submitLabel: "Verstuur planner-aanvraag",
    submittingLabel: "Versturen...",
    successMessage:
      "Planner-aanvraag verzonden. We bekijken de scope en reageren snel.",
    errorMessage:
      "Er ging iets mis. Probeer het opnieuw of mail direct naar contact@ymcreations.com.",
    summary: {
      eyebrow: "Live samenvatting",
      title: "Projectsnapshot",
      recommendedLabel: "Aanbevolen pakket",
      priceLabel: "Eenmalig, vanaf",
      monthlyLabel: "Technisch beheer",
      rangeLabel: "Indicatieve range",
      selectedFeaturesLabel: "Geselecteerde scope",
      selectedAddOnsLabel: "Relevante add-ons",
      reasonLabel: "Waarom dit past",
      disclaimer:
        "Indicatieve vanaf-prijs. Definitieve offerte hangt af van scope en review.",
    },
    questions: {
      projectType: "Wat heb je nodig?",
      pageCount: "Hoeveel pagina's verwacht je ongeveer?",
      multilingual: "Heb je meertalige ondersteuning nodig?",
      starterAddOns: "Welke extra verfijningen zijn relevant?",
      starterUpgrade: "Zou geavanceerdere functionaliteit essentieel zijn?",
      businessAddOns: "Welke uitbreidingen zijn hier relevant?",
      businessUpgrade: "Moet de site ook diepere proceslogica dragen?",
      smartScope: "Welke functionaliteit is hier het belangrijkst?",
      smartUpgrade: "Gaat dit verder dan een slimme website?",
      webshopScope: "Wat moet de webshop kunnen?",
      webshopUpgrade: "Gaat dit verder dan ecommerce-logica?",
      customScope: "Welke platformmogelijkheden zijn relevant?",
      timeline: "Wanneer wil je live gaan?",
      contentReady: "Heb je al content?",
      brandingReady: "Heb je al branding?",
      priority: "Wat is het belangrijkst?",
      contactHeading: "Waar mogen we de gestructureerde reactie naartoe sturen?",
      notes: "Extra context",
    },
    options: {
      yes: "Ja",
      no: "Nee",
      partly: "Deels",
      pageCount: {
        "1-5": "1-5 pagina's",
        "6-12": "6-12 pagina's",
        "12+": "12+ pagina's",
      },
      productCount: {
        "up-to-25": "Tot 25 producten",
        "25-100": "25-100 producten",
        "100+": "100+ producten",
      },
      timeline: {
        asap: "Zo snel mogelijk",
        "1-2-months": "Binnen 1-2 maanden",
        "2-4-months": "Binnen 2-4 maanden",
        "4-plus-months": "4+ maanden",
      },
      priority: {
        speed: "Snelheid",
        "design-quality": "Designkwaliteit",
        "lead-generation": "Leadgeneratie",
        automation: "Automatisering",
        "selling-online": "Online verkopen",
        "platform-functionality": "Platformfunctionaliteit",
      },
    },
    fields: {
      name: "Naam",
      email: "E-mail",
      company: "Bedrijf",
      phone: "Telefoon",
      notes: "Projectnotities",
      businessDeclaration:
        "Ik doe deze aanvraag namens een onderneming of in de uitoefening van beroep of bedrijf.",
      requestNote: "Een planner-aanvraag is vrijblijvend en nog geen opdracht.",
      termsLabel: "Algemene voorwaarden",
      privacyNote: "Je gegevens gebruiken we alleen om je aanvraag te beantwoorden. Meer daarover in de",
      privacyLabel: "privacyverklaring.",
      placeholders: {
        name: "Jouw naam",
        email: "jij@bedrijf.nl",
        company: "Bedrijfsnaam",
        phone: "+31...",
        notes: "Alles wat helpt om de scope beter te begrijpen.",
      },
    },
    links: {
      pricing: getLocalizedPath("nl", "pricing"),
      contact: getLocalizedPath("nl", "contact"),
      terms: legalRoutes.terms,
      privacy: getLocalizedPath("nl", "privacy"),
    },
  },
};

function roundToFifty(value: number) {
  return Math.ceil(value / 50) * 50;
}

function pushItem(items: string[], condition: boolean, value: string) {
  if (condition) {
    items.push(value);
  }
}

function getPackageLabel(
  catalog: PricingCatalog,
  locale: Locale,
  packageKey: PlannerPackageKey,
) {
  return getPackageName(catalog, locale, packageKey);
}

function getBasePrice(catalog: PricingCatalog, packageKey: PlannerPackageKey) {
  return getStartingPrice(catalog, packageKey);
}

export function getPlannerPageContent(locale: Locale) {
  return plannerContent[locale];
}

/**
 * The recommendation and its amounts. Every euro in here comes from the
 * catalog that is passed in -- the starting price of the recommended type
 * and the amounts of the selected add-ons -- while the rules that combine
 * them (which type is recommended, which buffers apply, rounding to fifty)
 * are unchanged and live only here.
 *
 * The development discount comes last: the whole one-time estimate, range
 * included, is built from base amounts first, and the discount is applied
 * once to its final minimum and maximum. Discounting each part and adding up
 * would drift by a euro per rounding. Technical management is recurring and
 * never passes through it.
 */
export function buildPlannerSummary(
  state: PlannerState,
  catalog: PricingCatalog,
): PlannerSummary {
  const locale = state.locale;
  const selectedFeatures: string[] = [];
  const selectedAddOns: string[] = [];
  const reasons: string[] = [];
  let recommendedPackage = (state.projectType || "starter") as PlannerPackageKey;
  let addOnTotal = 0;
  let buffer = 0;

  /* Extensions come from the pricing module, by stable id, for the chosen type. */
  const addAddon = (addOnId: string) => {
    if (!state.projectType) return;
    const addOn = getAddOn(catalog, locale, state.projectType, addOnId);
    selectedAddOns.push(addOn.label);
    addOnTotal += addOn.amount;
  };

  if (state.projectType === "starter") {
    if (state.pageCount === "6-12" || state.pageCount === "12+") {
      recommendedPackage = "business";
      reasons.push(
        locale === "nl"
          ? "meer pagina-omvang dan een startersite"
          : "more page scope than a starter build",
      );
    }

    pushItem(
      selectedFeatures,
      state.multilingual === "yes",
      locale === "nl" ? "meertalige ondersteuning" : "multilingual support",
    );
    pushItem(
      selectedFeatures,
      state.multilingual === "no",
      locale === "nl" ? "enkele taal" : "single language",
    );
    pushItem(
      selectedFeatures,
      state.pageCount !== "",
      locale === "nl"
        ? `${state.pageCount} pagina's`
        : `${state.pageCount} pages`,
    );

    if (state.multilingual === "yes") {
      addAddon("multilingual");
    }
    if (state.starterSeoBoost) {
      addAddon("seo-plus");
    }
    if (state.starterMotion) {
      addAddon("motion");
    }

    const smartTrigger =
      state.starterNeedBooking ||
      state.starterNeedAdmin ||
      state.starterNeedPayments;
    const customTrigger = state.starterNeedAccounts || state.starterNeedApi;

    if (customTrigger) {
      recommendedPackage = "platform";
      reasons.push(
        locale === "nl"
          ? "accounts of diepere integratielogica"
          : "accounts or deeper integration logic",
      );
    } else if (smartTrigger) {
      recommendedPackage = "smart";
      reasons.push(
        locale === "nl"
          ? "booking, betalingen of adminfunctionaliteit"
          : "booking, payments, or admin functionality",
      );
    }

    pushItem(
      selectedFeatures,
      state.starterNeedBooking,
      locale === "nl" ? "booking of reservering" : "booking or reservation",
    );
    pushItem(
      selectedFeatures,
      state.starterNeedAdmin,
      locale === "nl" ? "adminfunctionaliteit" : "admin functionality",
    );
    pushItem(
      selectedFeatures,
      state.starterNeedAccounts,
      locale === "nl" ? "login of accounts" : "login or accounts",
    );
    pushItem(
      selectedFeatures,
      state.starterNeedPayments,
      locale === "nl" ? "betalingen" : "payments",
    );
    pushItem(
      selectedFeatures,
      state.starterNeedApi,
      locale === "nl" ? "diepere API-logica" : "deeper API logic",
    );
  }

  if (state.projectType === "business") {
    pushItem(
      selectedFeatures,
      state.pageCount !== "",
      locale === "nl"
        ? `${state.pageCount} pagina's`
        : `${state.pageCount} pages`,
    );
    pushItem(
      selectedFeatures,
      state.multilingual === "yes",
      locale === "nl" ? "meertalige ondersteuning" : "multilingual support",
    );
    pushItem(
      selectedFeatures,
      state.multilingual === "no",
      locale === "nl" ? "enkele taal" : "single language",
    );

    if (state.businessSeoGrowth) {
      addAddon("seo-growth");
    }
    if (state.businessAdvancedEmail) {
      addAddon("email-flow");
    }
    if (state.businessAdminLite) {
      addAddon("content-admin");
    }
    if (state.businessLightApi) {
      addAddon("light-api");
    }
    if (state.pageCount === "12+") {
      addAddon("extra-page");
      buffer += 150;
    }

    const smartTrigger =
      state.businessNeedBooking ||
      state.businessNeedDashboard ||
      state.businessNeedPricingLogic ||
      state.businessNeedStatusHandling;

    if (smartTrigger) {
      recommendedPackage = "smart";
      reasons.push(
        locale === "nl"
          ? "booking of proceslogica in de scope"
          : "booking or process logic in scope",
      );
    }

    pushItem(
      selectedFeatures,
      state.businessNeedBooking,
      locale === "nl" ? "bookingflow" : "booking flow",
    );
    pushItem(
      selectedFeatures,
      state.businessNeedDashboard,
      locale === "nl" ? "dashboard of statusoverzicht" : "dashboard or status overview",
    );
    pushItem(
      selectedFeatures,
      state.businessNeedPricingLogic,
      locale === "nl" ? "prijslogica" : "pricing logic",
    );
    pushItem(
      selectedFeatures,
      state.businessNeedStatusHandling,
      locale === "nl" ? "statushandling" : "status handling",
    );
  }

  if (state.projectType === "smart") {
    pushItem(selectedFeatures, state.smartBookingFlow, locale === "nl" ? "bookingflow" : "booking flow");
    pushItem(selectedFeatures, state.smartConfirmations, locale === "nl" ? "bevestigingsmails" : "confirmation emails");
    pushItem(selectedFeatures, state.smartAdmin, locale === "nl" ? "basis adminomgeving" : "basic admin environment");

    if (state.smartPayments) {
      addAddon("payments");
    }
    if (state.smartMaps) {
      addAddon("maps-routes");
    }
    if (state.smartCrm) {
      addAddon("crm-calendar");
    }
    if (state.smartExpandedAdmin) {
      addAddon("expanded-admin");
    }
    if (state.smartReminderAutomation) {
      addAddon("reminders");
    }

    const customTrigger =
      state.smartNeedRoles ||
      state.smartNeedDashboards ||
      state.smartNeedPlatformLogic ||
      state.smartNeedWorkflows;

    if (customTrigger) {
      recommendedPackage = "platform";
      reasons.push(
        locale === "nl"
          ? "rollen, dashboards of bredere workflowlogica"
          : "roles, dashboards, or broader workflow logic",
      );
    }

    pushItem(selectedFeatures, state.smartNeedRoles, locale === "nl" ? "meerdere gebruikersrollen" : "multiple user roles");
    pushItem(selectedFeatures, state.smartNeedDashboards, locale === "nl" ? "dashboardsystemen" : "dashboard systems");
    pushItem(selectedFeatures, state.smartNeedPlatformLogic, locale === "nl" ? "platformlogica" : "platform logic");
    pushItem(selectedFeatures, state.smartNeedWorkflows, locale === "nl" ? "bredere workflows" : "broader workflows");
  }

  if (state.projectType === "webshop") {
    pushItem(
      selectedFeatures,
      state.webshopProducts !== "",
      locale === "nl"
        ? `ongeveer ${plannerContent.nl.options.productCount[state.webshopProducts as Exclude<PlannerProductCount, "">]}`
        : `about ${plannerContent.en.options.productCount[state.webshopProducts as Exclude<PlannerProductCount, "">]}`,
    );

    if (state.webshopSubscriptions) {
      addAddon("subscriptions");
    }
    if (state.webshopFilters) {
      addAddon("filters-search");
    }
    if (state.webshopIntegrations) {
      addAddon("erp-crm");
    }
    if (state.webshopMultilingual) {
      addAddon("multilingual");
    }
    if (state.webshopSeo) {
      addAddon("product-seo");
    }

    if (state.webshopNeedAccountLogic || state.webshopNeedWorkflowLogic) {
      recommendedPackage = "platform";
      reasons.push(
        locale === "nl"
          ? "account- of workflowlogica buiten standaard ecommerce"
          : "account or workflow logic beyond standard ecommerce",
      );
    }

    if (state.webshopProducts === "25-100") buffer += 200;
    if (state.webshopProducts === "100+") buffer += 400;
  }

  if (state.projectType === "platform") {
    pushItem(selectedFeatures, state.customLogin, locale === "nl" ? "login en accounts" : "login and accounts");
    pushItem(selectedFeatures, state.customDashboards, locale === "nl" ? "dashboards" : "dashboards");
    pushItem(selectedFeatures, state.customRoles, locale === "nl" ? "rollen en rechten" : "roles and permissions");
    pushItem(selectedFeatures, state.customWorkflows, locale === "nl" ? "adminworkflows" : "admin workflows");

    if (state.customApi) {
      addAddon("complex-api");
    }
    if (state.customReporting) {
      addAddon("reporting");
    }
    if (state.customNotifications) {
      addAddon("notifications");
    }
    if (state.customAppExpansion) {
      addAddon("mobile-app");
      buffer += 400;
    }
  }

  if (state.contentReady === "partly") buffer += 150;
  if (state.contentReady === "no") buffer += 300;
  if (state.brandingReady === "partly") buffer += 150;
  if (state.brandingReady === "no") buffer += 300;
  if (selectedAddOns.length > 2) buffer += 150;
  if (selectedAddOns.length > 4) buffer += 250;

  const baseStartingPrice = getBasePrice(catalog, recommendedPackage) + addOnTotal;
  const baseRangeMax = buffer > 0 ? roundToFifty(baseStartingPrice + buffer) : undefined;
  const baseRange =
    baseRangeMax && baseRangeMax > baseStartingPrice
      ? { min: baseStartingPrice, max: baseRangeMax }
      : undefined;

  const discount = catalog.developmentDiscount;
  const starting = developmentPrice(baseStartingPrice, discount);

  if (reasons.length === 0) {
    reasons.push(
      locale === "nl"
        ? "de gekozen scope en functionaliteit"
        : "the selected scope and functionality",
    );
  }

  const reason =
    locale === "nl"
      ? `Aanbevolen vanwege ${reasons.slice(0, 3).join(", ")}.`
      : `Recommended because of ${reasons.slice(0, 3).join(", ")}.`;

  return {
    recommendedPackage,
    recommendedLabel: getPackageLabel(catalog, locale, recommendedPackage),
    reason,
    startingPrice: starting.amount,
    baseStartingPrice,
    monthlyManagementFrom: getMonthlyManagementFrom(catalog, recommendedPackage),
    range: baseRange
      ? {
          min: starting.amount,
          max: developmentPrice(baseRange.max, discount).amount,
        }
      : undefined,
    baseRange,
    discountPercent: starting.percent,
    selectedFeatures,
    selectedAddOns,
    selectedAddOnTotal: addOnTotal,
    disclaimer: plannerContent[locale].summary.disclaimer,
  };
}

/**
 * The one-time estimate of a summary as text: what the summary shows, and
 * what is sent along with the request. While the development discount is
 * active, the sent text carries its context ("€1.047 (30% korting op
 * €1.495)"), so the stored inquiry and both emails say what the visitor saw.
 * That text is a record of the page, not a quote. Technical management is
 * not in here: it is recurring and formatted from its base amount.
 */
export type PlannerPriceText = {
  startingPrice: string;
  /** The base estimate, struck through beside the discounted one. */
  originalStartingPrice: string | null;
  range: string | null;
  originalRange: string | null;
  /** "Tijdelijk 30% korting op de ontwikkelkosten", or `null`. */
  discountNote: string | null;
  /** Screen-reader label for a struck-through base amount. */
  originalLabel: string | null;
  submittedStartingPrice: string;
  submittedRange: string | null;
};

export function formatPlannerPrices(summary: PlannerSummary, locale: Locale): PlannerPriceText {
  const euro = (amount: number) => formatEuro(amount, locale);
  const span = (range: { min: number; max: number } | undefined) =>
    range ? `${euro(range.min)} - ${euro(range.max)}` : null;

  const startingPrice = euro(summary.startingPrice);
  const range = span(summary.range);

  if (summary.discountPercent === null) {
    return {
      startingPrice,
      originalStartingPrice: null,
      range,
      originalRange: null,
      discountNote: null,
      originalLabel: null,
      submittedStartingPrice: startingPrice,
      submittedRange: range,
    };
  }

  const copy = getDevelopmentDiscountCopy(locale, summary.discountPercent);
  const originalStartingPrice = euro(summary.baseStartingPrice);
  const originalRange = span(summary.baseRange);

  return {
    startingPrice,
    originalStartingPrice,
    range,
    originalRange,
    discountNote: copy.note,
    originalLabel: copy.originalLabel,
    submittedStartingPrice: `${startingPrice} (${copy.context(originalStartingPrice)})`,
    submittedRange: range && originalRange ? `${range} (${copy.context(originalRange)})` : range,
  };
}
