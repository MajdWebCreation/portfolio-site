export const locales = ["en", "nl"] as const;

export type Locale = (typeof locales)[number];

export function isValidLocale(value: string): value is Locale {
  return locales.includes(value as Locale);
}

export const businessInfo = {
  name: "YM Creations",
  legalName: "YM Creations",
  email: "contact@ymcreations.com",
  phone: "+31 6 12345678",
  kvk: "96175354",
  websiteUrl: "https://ymcreations.com",
} as const;

export const processSteps = {
  en: [
    {
      number: "01",
      title: "Strategy",
      text: "We define what the website or platform needs to communicate, who it is for, and how it should support the business.",
    },
    {
      number: "02",
      title: "Design",
      text: "We shape the visual direction, structure, and user experience with clarity, hierarchy, and a premium feel in mind.",
    },
    {
      number: "03",
      title: "Development",
      text: "We build the site or application with performance, responsiveness, and polished interaction from the start.",
    },
    {
      number: "04",
      title: "Refinement",
      text: "We refine content flow, motion, and technical details until the full experience feels ready to launch.",
    },
  ],
  nl: [
    {
      number: "01",
      title: "Strategie",
      text: "We bepalen wat de website of applicatie moet communiceren, voor wie die bedoeld is en hoe die het bedrijf moet ondersteunen.",
    },
    {
      number: "02",
      title: "Design",
      text: "We vormen de visuele richting, structuur en gebruikerservaring met focus op helderheid, hiërarchie en een premium uitstraling.",
    },
    {
      number: "03",
      title: "Development",
      text: "We bouwen de site of applicatie met performance, responsiveness en verfijnde interactie vanaf het begin.",
    },
    {
      number: "04",
      title: "Verfijning",
      text: "We verfijnen contentflow, motion en technische details totdat de volledige ervaring klaar voelt om live te gaan.",
    },
  ],
} as const;

export const siteContent = {
  en: {
    localeLabel: "EN",
    nav: {
      services: "Services",
      projects: "Projects",
      blog: "Insights",
      about: "Process",
      contact: "Contact",
      cta: "Start a project",
    },
    hero: {
      eyebrow: "Premium web design, development, and technical polish",
      title: "Premium websites and web applications.",
      description:
        "YM Creations designs and builds refined websites, landing pages, ecommerce experiences, and custom web tools for modern brands.",
      primaryCta: "Explore services",
      secondaryCta: "Contact us",
      cardEyebrow: "Experience-driven build system",
      cardText:
        "Structure, motion, responsiveness, and implementation quality designed to feel sharp from the first scroll.",
      blueprintLabel: "Live blueprint",
      servicePath: "/en/services",
      contactPath: "/en/contact",
    },
    homeServices: {
      eyebrow: "Services",
      title: "A focused service stack for premium digital work.",
      description:
        "From business websites to custom web tools, every project is shaped around clear communication, strong UX, and technical refinement.",
      allServicesLabel: "View all services",
    },
    projects: {
      eyebrow: "Projects",
      title: "From first concept to launch-ready execution.",
      description:
        "The work starts with direction, becomes structure, and ends as a polished digital product.",
      stages: ["Sketch", "Structure", "Interface", "Launch"],
      itemTitle: "Featured project concept",
      itemText:
        "A concept panel showing how a loose idea evolves into a structured, premium online presence.",
      conceptLabel: "Concept",
      progressLabel: "Progress",
      premiumBuildLabel: "Premium build",
      premiumBuildText:
        "Clear hierarchy, clean implementation, and the kind of polish that makes a site feel deliberate.",
      refinedDirectionLabel: "Refined direction",
      sideTexts: [
        "The first direction takes shape around goals, offer, and audience.",
        "The structure becomes clearer and more intentional.",
        "The interface gains rhythm, contrast, and visual precision.",
        "The final experience feels cohesive and ready to launch.",
      ],
      overviewLabel: "View projects overview",
      overviewPath: "/en/projects",
    },
    about: {
      eyebrow: "Process",
      title: "Design, development, and refinement in one clear workflow.",
      description:
        "YM Creations combines strategy, visual design, frontend craft, and technical polish into one streamlined process.",
    },
    contact: {
      eyebrow: "Start a project",
      title: "Ready for a website or web application that feels as sharp as your brand?",
      description:
        "Share what you want to build and we’ll reply with the next step. Company websites, landing pages, ecommerce builds, redesigns, and custom tools all start here.",
      primary: "Book a call",
      secondary: "Send an email",
      signal: "Open transmission",
      pagePath: "/en/contact",
    },
    footer: {
      description:
        "Premium web design and development for businesses that want a stronger online presence.",
      company: "Company",
      services: "Services",
      insights: "Insights",
      contact: "Contact",
      kvkLabel: "KVK",
    },
  },
  nl: {
    localeLabel: "NL",
    nav: {
      services: "Diensten",
      projects: "Projecten",
      blog: "Inzichten",
      about: "Proces",
      contact: "Contact",
      cta: "Start een project",
    },
    hero: {
      eyebrow: "Premium webdesign, development en technische afwerking",
      title: "Premium websites en webapplicaties.",
      description:
        "YM Creations ontwerpt en bouwt verfijnde websites, landingspagina’s, webshops en maatwerk webtools voor moderne merken.",
      primaryCta: "Bekijk diensten",
      secondaryCta: "Neem contact op",
      cardEyebrow: "Doordacht bouwsysteem",
      cardText:
        "Structuur, motion, responsiveness en implementatiekwaliteit die vanaf de eerste scroll sterk aanvoelen.",
      blueprintLabel: "Live ontwerp",
      servicePath: "/nl/diensten",
      contactPath: "/nl/contact",
    },
    homeServices: {
      eyebrow: "Diensten",
      title: "Een gerichte service stack voor premium digitaal werk.",
      description:
        "Van bedrijfswebsites tot maatwerk webtools: ieder project draait om heldere communicatie, sterke UX en technische verfijning.",
      allServicesLabel: "Bekijk alle diensten",
    },
    projects: {
      eyebrow: "Projecten",
      title: "Van eerste concept tot een resultaat dat klaar is om live te gaan.",
      description:
        "Het werk begint met richting, krijgt vorm in structuur en eindigt als een verfijnd digitaal product.",
      stages: ["Schets", "Structuur", "Interface", "Live"],
      itemTitle: "Uitgelicht projectconcept",
      itemText:
        "Een conceptpaneel dat laat zien hoe een eerste idee verandert in een sterke en verfijnde online presentatie.",
      conceptLabel: "Concept",
      progressLabel: "Voortgang",
      premiumBuildLabel: "Premium build",
      premiumBuildText:
        "Duidelijke hiërarchie, schone implementatie en een afwerking die bewust en hoogwaardig aanvoelt.",
      refinedDirectionLabel: "Verfijnde richting",
      sideTexts: [
        "De eerste richting ontstaat vanuit doel, aanbod en doelgroep.",
        "De structuur wordt helderder en bewuster opgebouwd.",
        "De interface krijgt ritme, contrast en visuele precisie.",
        "De eindervaring voelt samenhangend en klaar om live te gaan.",
      ],
      overviewLabel: "Bekijk projectenoverzicht",
      overviewPath: "/nl/projecten",
    },
    about: {
      eyebrow: "Proces",
      title: "Design, development en verfijning in één helder traject.",
      description:
        "YM Creations brengt strategie, visueel ontwerp, frontend vakwerk en technische afwerking samen in één gestroomlijnd proces.",
    },
    contact: {
      eyebrow: "Start een project",
      title: "Klaar voor een website of webapplicatie die net zo scherp voelt als jouw merk?",
      description:
        "Vertel wat je wilt laten bouwen en we reageren met de volgende stap. Bedrijfswebsites, landingspagina’s, webshops, redesigns en maatwerk tools beginnen hier.",
      primary: "Plan een gesprek",
      secondary: "Stuur een e-mail",
      signal: "Open verbinding",
      pagePath: "/nl/contact",
    },
    footer: {
      description:
        "Premium webdesign en development voor bedrijven die online sterker zichtbaar willen zijn.",
      company: "Bedrijf",
      services: "Diensten",
      insights: "Inzichten",
      contact: "Contact",
      kvkLabel: "KVK",
    },
  },
} as const;

export type SiteContent = (typeof siteContent)[Locale];
