export const locales = ["nl", "en"] as const;

export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "nl";

export function isValidLocale(value: string): value is Locale {
  return locales.includes(value as Locale);
}

export const businessInfo = {
  name: "YM Creations",
  legalName: "YM Creations",
  email: "contact@ymcreations.com",
  phone: "+31653400220",
  phoneDisplay: "+31 6 53 40 02 20",
  kvk: "96175354",
  websiteUrl: "https://ymcreations.com",
} as const;

/** The four project phases, shown in full on service pages and the werkwijze page. */
export const processSteps = {
  nl: [
    {
      number: "01",
      title: "Intake en scope",
      text: "We bespreken wat de website of applicatie moet doen, voor wie, en welke functies echt nodig zijn. Daaruit volgt een vaste scope met prijs en planning.",
    },
    {
      number: "02",
      title: "Ontwerp",
      text: "Paginaopbouw, teksten, beeld en interactie worden in de browser uitgewerkt. Je ziet vroeg hoe het wordt, ook op een telefoon.",
    },
    {
      number: "03",
      title: "Bouw",
      text: "Ontwikkeling in Next.js met eigen componenten: formulieren, e-mailflows, koppelingen, meertaligheid of beheer, afhankelijk van de scope.",
    },
    {
      number: "04",
      title: "Livegang en nazorg",
      text: "Domein, hosting, e-mail, analytics en technische SEO worden ingericht voordat de site live gaat. Daarna blijven we bereikbaar voor aanpassingen.",
    },
  ],
  en: [
    {
      number: "01",
      title: "Intake and scope",
      text: "We discuss what the website or application has to do, for whom, and which features are actually needed. That results in a fixed scope with price and planning.",
    },
    {
      number: "02",
      title: "Design",
      text: "Page structure, copy, imagery and interaction are worked out in the browser. You see early what it will become, on a phone as well.",
    },
    {
      number: "03",
      title: "Build",
      text: "Development in Next.js with custom components: forms, email flows, integrations, multilingual setup or admin, depending on the scope.",
    },
    {
      number: "04",
      title: "Launch and aftercare",
      text: "Domain, hosting, email, analytics and technical SEO are set up before the site goes live. After that we stay available for changes.",
    },
  ],
} as const;

export const siteContent = {
  nl: {
    localeLabel: "NL",
    nav: {
      services: "Diensten",
      process: "Werkwijze",
      pricing: "Tarieven",
      projects: "Projecten",
      planner: "Projectplanner",
      blog: "Inzichten",
      contact: "Contact",
      cta: "Project bespreken",
      menuLabel: "Menu",
      closeLabel: "Sluiten",
      switchLocaleLabel: "English version",
    },
    hero: {
      title: "Digitale producten, gebouwd rond hoe jouw bedrijf werkt.",
      description:
        "Websites, webshops en maatwerksoftware met sterke techniek, heldere UX en ruimte om uit te breiden.",
      primaryCta: "Vertel over je project",
      secondaryCta: "Bekijk projecten",
      flow: {
        caption: "Van aanvraag tot bevestiging",
        layers: [
          {
            label: "Voorkant",
            title: "Wat je klant ziet en gebruikt",
            status: "Aanvraag verstuurd",
          },
          {
            label: "Beheer",
            title: "Waar jij alles beheert",
            status: "Zichtbaar in beheer",
          },
          {
            label: "Data",
            title: "Waar alles wordt opgeslagen",
            status: "Opgeslagen",
          },
          {
            label: "Koppelingen",
            title: "Wat automatisch wordt verstuurd en gedeeld",
            status: "Bevestiging verstuurd",
          },
        ],
        base: "Draait op eigen domein en hosting, in eigen code.",
      },
    },
    build: {
      title: "Wat we bouwen",
      description:
        "Van een compacte bedrijfswebsite tot een compleet systeem waar je klanten en je team dagelijks mee werken.",
      linkLabel: "Bekijk alle diensten",
      groups: [
        {
          key: "websites",
          title: "Websites en webshops",
          text: "Bedrijfswebsites, landingspagina's en webshops, ingericht op aanvragen en bestellingen.",
          short: "Voor presentatie, aanvragen en verkoop.",
          serviceKey: "business-websites",
          size: "xl",
        },
        {
          key: "applications",
          title: "Webapplicaties, portalen en apps",
          text: "Reserveringen, klantportalen, beheeromgevingen en apps met inlog en rollen.",
          short: "Software voor processen en gebruikers.",
          serviceKey: "web-app-development",
          size: "xl",
        },
        {
          key: "configurators",
          title: "3D-configurators",
          text: "Klanten stellen een product samen en zien direct de prijs.",
          short: "Producten interactief samenstellen.",
          serviceKey: "3d-configurators",
          size: "lg",
          emphasis: true,
        },
        {
          key: "integrations",
          title: "Koppelingen en automatisering",
          text: "Betalingen, e-mail en API's, zodat handwerk verdwijnt.",
          short: "Systemen slimmer laten samenwerken.",
          serviceKey: "integrations-automation",
          size: "lg",
        },
      ],
    },
    collaboration: {
      label: "Werkwijze",
      statements: [
        "Vaste scope en prijs vooraf.",
        "Tijdens de bouw kijk je mee in de browser.",
        "Na livegang blijven we bereikbaar.",
      ],
      linkLabel: "Zo verloopt een project, in vier stappen",
    },
    pointers: {
      projects: {
        label: "Projecten",
        title: "Bekijk wat er nu live draait",
        text: "Websites en applicaties die in gebruik zijn, elk met een link naar de site zelf.",
      },
      pricing: {
        label: "Tarieven",
        title: "Vanafprijzen per pakket, maatwerk op offerte",
        text: "Zo weet je vooraf waar je aan toe bent.",
      },
    },
    contactCta: {
      title: "Eén bericht is genoeg om te starten.",
      description:
        "Beschrijf kort wat je wilt laten bouwen. Je krijgt advies, een voorstel met scope en prijs, of eerst een gesprek.",
      primaryLabel: "Stuur een bericht",
      plannerLabel: "Liever eerst de scope bepalen? Gebruik de projectplanner",
      replyNote: "Reactie op werkdagen binnen 24 uur",
    },
    contact: {
      pagePath: "/nl/contact",
      directLabel: "Direct",
      replyNote: "Reactie op werkdagen binnen 24 uur.",
      plannerLabel: "Liever eerst de scope bepalen? Gebruik de projectplanner",
      businessNote:
        "YM Creations werkt voor zakelijke opdrachtgevers. Een bericht is vrijblijvend en nog geen opdracht.",
      termsLabel: "Algemene voorwaarden",
    },
    footer: {
      navigation: "Navigatie",
      contact: "Contact",
      kvkLabel: "KVK",
      rights: "Alle rechten voorbehouden.",
      legal: "Juridisch",
      terms: "Algemene voorwaarden",
    },
  },
  en: {
    localeLabel: "EN",
    nav: {
      services: "Services",
      process: "How we work",
      pricing: "Pricing",
      projects: "Projects",
      planner: "Project planner",
      blog: "Insights",
      contact: "Contact",
      cta: "Discuss a project",
      menuLabel: "Menu",
      closeLabel: "Close",
      switchLocaleLabel: "Nederlandse versie",
    },
    hero: {
      title: "Digital products, built around how your business works.",
      description:
        "Websites, webshops and custom software with strong engineering, clear UX and room to grow.",
      primaryCta: "Tell us about your project",
      secondaryCta: "View projects",
      flow: {
        caption: "From request to confirmation",
        layers: [
          {
            label: "Front end",
            title: "What your customer sees and uses",
            status: "Request sent",
          },
          {
            label: "Admin",
            title: "Where you manage everything",
            status: "Visible in admin",
          },
          {
            label: "Data",
            title: "Where everything is stored",
            status: "Saved",
          },
          {
            label: "Integrations",
            title: "What is sent and shared automatically",
            status: "Confirmation sent",
          },
        ],
        base: "Runs on your own domain and hosting, in custom code.",
      },
    },
    build: {
      title: "What we build",
      description:
        "From a compact company website to a complete system your customers and your team work with every day.",
      linkLabel: "View all services",
      groups: [
        {
          key: "websites",
          title: "Websites and webshops",
          text: "Company websites, landing pages and webshops, set up for enquiries and orders.",
          short: "For presentation, enquiries and sales.",
          serviceKey: "business-websites",
          size: "xl",
        },
        {
          key: "applications",
          title: "Web applications, portals and apps",
          text: "Bookings, client portals, admin environments and apps with login and roles.",
          short: "Software for processes and users.",
          serviceKey: "web-app-development",
          size: "xl",
        },
        {
          key: "configurators",
          title: "3D configurators",
          text: "Customers compose a product and see the price instantly.",
          short: "Compose products interactively.",
          serviceKey: "3d-configurators",
          size: "lg",
          emphasis: true,
        },
        {
          key: "integrations",
          title: "Integrations and automation",
          text: "Payments, email and APIs, so manual work disappears.",
          short: "Systems that work together.",
          serviceKey: "integrations-automation",
          size: "lg",
        },
      ],
    },
    collaboration: {
      label: "How we work",
      statements: [
        "Fixed scope and price up front.",
        "During the build you follow along in the browser.",
        "After launch we stay reachable.",
      ],
      linkLabel: "How a project runs, in four steps",
    },
    pointers: {
      projects: {
        label: "Projects",
        title: "See what is live right now",
        text: "Websites and applications in daily use, each linking to the site itself.",
      },
      pricing: {
        label: "Pricing",
        title: "Starting prices per package, custom work on quote",
        text: "So you know where you stand before we start.",
      },
    },
    contactCta: {
      title: "One message is enough to start.",
      description:
        "Briefly describe what you want built. You get advice, a proposal with scope and price, or a call first.",
      primaryLabel: "Send a message",
      plannerLabel: "Prefer to define the scope first? Use the project planner",
      replyNote: "Reply within 24 hours on working days",
    },
    contact: {
      pagePath: "/en/contact",
      directLabel: "Direct",
      replyNote: "Reply within 24 hours on working days.",
      plannerLabel: "Prefer to define the scope first? Use the project planner",
      businessNote:
        "YM Creations works for business clients. A message is non-binding and not yet an order.",
      termsLabel: "General terms (Dutch)",
    },
    footer: {
      navigation: "Navigation",
      contact: "Contact",
      kvkLabel: "KVK",
      rights: "All rights reserved.",
      legal: "Legal",
      terms: "General terms (Dutch)",
    },
  },
} as const;

export type SiteContent = (typeof siteContent)[Locale];
