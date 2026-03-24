export const locales = ["en", "nl"] as const;

export type Locale = (typeof locales)[number];

export function isValidLocale(value: string): value is Locale {
  return locales.includes(value as Locale);
}

export const businessInfo = {
  name: "YM Creations",
  legalName: "YM Creations",
  email: "contact@ymcreations.com",
  phone: "+31653400220",
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
      pricing: "Pricing",
      projects: "Projects",
      blog: "Insights",
      about: "Process",
      contact: "Contact",
      cta: "Start a project",
    },
    hero: {
      eyebrow: "Websites, webshops, and custom digital products",
      title: "Clearer digital products for ambitious businesses.",
      description:
        "YM Creations helps businesses launch a clearer website, a stronger conversion flow, or a custom platform with the right level of scope from the start.",
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
      title: "Choose the service direction that fits the project.",
      description:
        "From business websites to smarter booking flows and custom platforms, the service stack is designed to help you move quickly to the right next step.",
      allServicesLabel: "View all services",
    },
    prototypeStory: {
      eyebrow: "Prototype story",
      title:
        "An idea starts quiet, becomes structure, and resolves into a sharper interface.",
      description:
        "This section slows the homepage down on purpose. Instead of showing everything at once, it reveals how a digital direction takes shape.",
      boardLabel: "Prototype",
      helperLabel: "Scroll to guide the reveal",
      ctaLabel: "Open project thinking",
      finalEyebrow: "Refined result",
      finalTitle:
        "A calmer interface with stronger hierarchy and clearer intent.",
      finalText:
        "Once the structure, rhythm, and messaging align, the final frame settles into a cleaner premium presentation.",
      interfaceChips: [
        "Wireframe rhythm",
        "Measured motion",
        "Sharper CTA",
      ],
      stages: [
        {
          label: "01 / Idea",
          title: "A quiet starting point",
          text: "The first frame stays intentionally sparse so the direction can emerge with more control.",
        },
        {
          label: "02 / Prototype",
          title: "Structure gets sketched in",
          text: "Wireframe blocks and page zones appear before the interface becomes fully articulated.",
        },
        {
          label: "03 / Interface",
          title: "The system gains rhythm",
          text: "Spacing, UI components, and messaging start to feel deliberate instead of temporary.",
        },
        {
          label: "04 / Refine",
          title: "The final state settles",
          text: "The result feels calmer, clearer, and more premium than dumping everything in at once.",
        },
      ],
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
      title: "Tell us what you want to build.",
      description:
        "Share the direction, scope, or business goal. We’ll reply with the clearest next step, whether that starts with advice, a scoped proposal, or the planner.",
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
      pricing: "Pricing",
      insights: "Insights",
      contact: "Contact",
      kvkLabel: "KVK",
      rights:
        "All website rights and brand content belong to YM Creations.",
    },
  },
  nl: {
    localeLabel: "NL",
    nav: {
      services: "Diensten",
      pricing: "Tarieven",
      projects: "Projecten",
      blog: "Inzichten",
      about: "Proces",
      contact: "Contact",
      cta: "Start een project",
    },
    hero: {
      eyebrow: "Websites, webshops en maatwerk digitale producten",
      title: "Duidelijkere digitale producten voor ambitieuze bedrijven.",
      description:
        "YM Creations helpt bedrijven aan een helderdere website, een sterkere conversieflow of een maatwerk platform met vanaf het begin het juiste scopeniveau.",
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
      title: "Kies de dienstrichting die bij het project past.",
      description:
        "Van bedrijfswebsites tot slimmere bookingflows en maatwerk platforms: de service stack helpt je snel naar de juiste volgende stap.",
      allServicesLabel: "Bekijk alle diensten",
    },
    prototypeStory: {
      eyebrow: "Prototype story",
      title:
        "Een idee begint rustig, krijgt structuur en landt uiteindelijk als een scherpere interface.",
      description:
        "Deze sectie vertraagt de homepage bewust. In plaats van alles tegelijk te tonen, laat ze zien hoe een digitale richting stap voor stap vorm krijgt.",
      boardLabel: "Prototype",
      helperLabel: "Scroll om de reveal te sturen",
      ctaLabel: "Bekijk projectdenken",
      finalEyebrow: "Verfijnd resultaat",
      finalTitle:
        "Een rustigere interface met sterkere hiërarchie en duidelijkere intentie.",
      finalText:
        "Zodra structuur, ritme en messaging samenvallen, zakt het eindbeeld in een schonere premium presentatie.",
      interfaceChips: [
        "Wireframe-ritme",
        "Beheerde motion",
        "Scherpere CTA",
      ],
      stages: [
        {
          label: "01 / Idee",
          title: "Een rustige start",
          text: "Het eerste frame blijft bewust spaarzaam zodat de richting gecontroleerd kan ontstaan.",
        },
        {
          label: "02 / Prototype",
          title: "De structuur wordt geschetst",
          text: "Wireframeblokken en paginazones verschijnen voordat de interface volledig wordt uitgewerkt.",
        },
        {
          label: "03 / Interface",
          title: "Het systeem krijgt ritme",
          text: "Spacing, UI-componenten en messaging gaan bewuster en minder tijdelijk aanvoelen.",
        },
        {
          label: "04 / Verfijnen",
          title: "De eindstaat landt",
          text: "Het resultaat voelt rustiger, helderder en premiumer dan alles ineens op het scherm zetten.",
        },
      ],
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
      title: "Vertel kort wat je wilt laten bouwen.",
      description:
        "Deel de richting, scope of businessdoel. Daarna krijg je de duidelijkste volgende stap terug, of dat nu advies, een voorstel of eerst de planner is.",
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
      pricing: "Tarieven",
      insights: "Inzichten",
      contact: "Contact",
      kvkLabel: "KVK",
      rights:
        "Alle rechten van deze website en merkcontent behoren toe aan YM Creations.",
    },
  },
} as const;

export type SiteContent = (typeof siteContent)[Locale];
