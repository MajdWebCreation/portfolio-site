import { getLocalizedPath } from "@/lib/content/routes";
import { type Locale } from "@/lib/content/site-content";

export type PlannerPackageKey =
  | "starter"
  | "business"
  | "smart"
  | "webshop"
  | "platform";

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
  website: string;
};

export type PlannerSummary = {
  recommendedPackage: PlannerPackageKey;
  recommendedLabel: string;
  reason: string;
  startingPrice: number;
  range?: {
    min: number;
    max: number;
  };
  selectedFeatures: string[];
  selectedAddOns: string[];
  selectedAddOnTotal: number;
  disclaimer: string;
};

type PackageDefinition = {
  label: string;
  basePrice: number;
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
    projectTypes: Record<PlannerPackageKey, string>;
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
  website: "",
};

const packages: Record<Locale, Record<PlannerPackageKey, PackageDefinition>> = {
  en: {
    starter: { label: "Starter Website", basePrice: 695 },
    business: { label: "Business Website", basePrice: 1750 },
    smart: { label: "Smart Website / Booking", basePrice: 3250 },
    webshop: { label: "Webshop", basePrice: 2495 },
    platform: { label: "Custom Platform / Portal / SaaS", basePrice: 6500 },
  },
  nl: {
    starter: { label: "Starter Website", basePrice: 695 },
    business: { label: "Business Website", basePrice: 1750 },
    smart: { label: "Smart Website / Booking", basePrice: 3250 },
    webshop: { label: "Webshop", basePrice: 2495 },
    platform: { label: "Maatwerk Platform / Portaal / SaaS", basePrice: 6500 },
  },
};

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
      priceLabel: "Starting from",
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
      projectTypes: {
        starter: "Starter Website",
        business: "Business Website",
        smart: "Smart Website / Booking",
        webshop: "Webshop",
        platform: "Custom Platform / Portal / SaaS",
      },
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
      priceLabel: "Vanaf",
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
      projectTypes: {
        starter: "Starter Website",
        business: "Business Website",
        smart: "Smart Website / Booking",
        webshop: "Webshop",
        platform: "Maatwerk Platform / Portaal / SaaS",
      },
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

function getPackageLabel(locale: Locale, packageKey: PlannerPackageKey) {
  return packages[locale][packageKey].label;
}

function getBasePrice(packageKey: PlannerPackageKey) {
  return packages.en[packageKey].basePrice;
}

export function formatEuro(amount: number, locale: Locale) {
  return new Intl.NumberFormat(locale === "nl" ? "nl-NL" : "en-US", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function getPlannerPageContent(locale: Locale) {
  return plannerContent[locale];
}

export function buildPlannerSummary(state: PlannerState): PlannerSummary {
  const locale = state.locale;
  const selectedFeatures: string[] = [];
  const selectedAddOns: string[] = [];
  const reasons: string[] = [];
  let recommendedPackage = (state.projectType || "starter") as PlannerPackageKey;
  let addOnTotal = 0;
  let buffer = 0;

  const addAddon = (label: string, amount: number) => {
    selectedAddOns.push(label);
    addOnTotal += amount;
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
      addAddon(
        locale === "nl" ? "Meertalige setup" : "Multilingual setup",
        200,
      );
    }
    if (state.starterSeoBoost) {
      addAddon(locale === "nl" ? "SEO-boost" : "SEO boost", 250);
    }
    if (state.starterMotion) {
      addAddon(
        locale === "nl"
          ? "Premium animatie"
          : "Premium animation",
        175,
      );
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
      addAddon(locale === "nl" ? "SEO Growth" : "SEO Growth", 350);
    }
    if (state.businessAdvancedEmail) {
      addAddon(
        locale === "nl" ? "Geavanceerde e-mailflow" : "Advanced email flow",
        200,
      );
    }
    if (state.businessAdminLite) {
      addAddon(
        locale === "nl" ? "Admin-lite / content management" : "Admin-lite / content management",
        450,
      );
    }
    if (state.businessLightApi) {
      addAddon(
        locale === "nl" ? "Lichte API-integratie" : "Light API integration",
        550,
      );
    }
    if (state.pageCount === "12+") {
      addAddon(locale === "nl" ? "Extra pagina's" : "Extra pages", 75);
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
      addAddon(locale === "nl" ? "Payment integratie" : "Payment integration", 650);
    }
    if (state.smartMaps) {
      addAddon(
        locale === "nl" ? "Google Maps / Routes / km-pricing" : "Google Maps / Routes / km pricing",
        1250,
      );
    }
    if (state.smartCrm) {
      addAddon(
        locale === "nl" ? "CRM- of kalenderintegratie" : "CRM or calendar integration",
        650,
      );
    }
    if (state.smartExpandedAdmin) {
      addAddon(
        locale === "nl" ? "Uitgebreider admin panel" : "Expanded admin panel",
        950,
      );
    }
    if (state.smartReminderAutomation) {
      addAddon(
        locale === "nl" ? "Reminder e-mails / automatisering" : "Reminder emails / automation",
        250,
      );
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
      addAddon(locale === "nl" ? "Subscriptions / memberships" : "Subscriptions / memberships", 900);
    }
    if (state.webshopFilters) {
      addAddon(locale === "nl" ? "Geavanceerde filters / search" : "Advanced filters / search", 450);
    }
    if (state.webshopIntegrations) {
      addAddon(
        locale === "nl" ? "CRM / ERP / boekhoudintegratie" : "CRM / ERP / accounting integration",
        750,
      );
    }
    if (state.webshopMultilingual) {
      addAddon(locale === "nl" ? "Meertalige setup" : "Multilingual setup", 200);
    }
    if (state.webshopSeo) {
      addAddon(
        locale === "nl" ? "Geavanceerde SEO" : "Advanced SEO",
        450,
      );
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
      addAddon(locale === "nl" ? "Complexe API-integratie" : "Complex API integration", 1500);
    }
    if (state.customReporting) {
      addAddon(locale === "nl" ? "Reporting / analytics" : "Reporting / analytics", 750);
    }
    if (state.customNotifications) {
      addAddon(locale === "nl" ? "Notificatiesysteem" : "Notification system", 350);
    }
    if (state.customAppExpansion) {
      addAddon(locale === "nl" ? "Mobile app extension" : "Mobile app extension", 3500);
      buffer += 400;
    }
  }

  if (state.contentReady === "partly") buffer += 150;
  if (state.contentReady === "no") buffer += 300;
  if (state.brandingReady === "partly") buffer += 150;
  if (state.brandingReady === "no") buffer += 300;
  if (selectedAddOns.length > 2) buffer += 150;
  if (selectedAddOns.length > 4) buffer += 250;

  const startingPrice = getBasePrice(recommendedPackage) + addOnTotal;
  const rangeMax = buffer > 0 ? roundToFifty(startingPrice + buffer) : undefined;

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
    recommendedLabel: getPackageLabel(locale, recommendedPackage),
    reason,
    startingPrice,
    range:
      rangeMax && rangeMax > startingPrice
        ? {
            min: startingPrice,
            max: rangeMax,
          }
        : undefined,
    selectedFeatures,
    selectedAddOns,
    selectedAddOnTotal: addOnTotal,
    disclaimer: plannerContent[locale].summary.disclaimer,
  };
}
