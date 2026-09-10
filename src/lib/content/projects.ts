import type { Locale } from "@/lib/content/site-content";

export const projectIds = [
  "flexora-bouw",
  "taxi-de-polder",
  "dos-slotenmaker",
  "tolkencollectief",
  "ghiras-al-sham",
] as const;

export type ProjectId = (typeof projectIds)[number];

type ProjectImage = {
  src: string;
  width: number;
  height: number;
  alt: Record<Locale, string>;
};

export type Project = {
  id: ProjectId;
  name: string;
  url: string;
  domain: string;
  featured: boolean;
  sector: Record<Locale, string>;
  summary: Record<Locale, string>;
  built: Record<Locale, string[]>;
  image: ProjectImage;
  detailImage?: ProjectImage;
};

/**
 * Live production projects built by YM Creations. Screenshots are taken from
 * the live sites; every claim below is visible on the linked website.
 */
export const projects: Project[] = [
  {
    id: "flexora-bouw",
    name: "Flexora Bouw",
    url: "https://flexorabouw.nl",
    domain: "flexorabouw.nl",
    featured: true,
    sector: {
      nl: "Aanbouw en renovatie",
      en: "Extensions and renovation",
    },
    summary: {
      nl: "Bedrijfswebsite met een 3D-configurator waarin klanten hun aanbouw samenstellen: afmetingen, gevelbekleding, kozijnen, dak en binnenafwerking. De prijsindicatie beweegt direct mee en de samenstelling gaat als offerteaanvraag door naar Flexora.",
      en: "Company website with a 3D configurator in which customers compose their extension: dimensions, cladding, frames, roof and interior finish. The price indication updates instantly and the configuration is sent as a quote request.",
    },
    built: {
      nl: [
        "3D-configurator voor buiten- en binnenzijde",
        "Prijsopbouw inclusief btw die direct meebeweegt",
        "Offerteaanvraag vanuit de samenstelling",
        "Diensten, werkwijze en projecten met eigen fotografie",
        "Kennisbank met artikelen",
      ],
      en: [
        "3D configurator for exterior and interior",
        "Price build-up including VAT that updates instantly",
        "Quote request straight from the configuration",
        "Services, process and projects with own photography",
        "Knowledge base with articles",
      ],
    },
    image: {
      src: "/images/projects/flexora-configurator.jpg",
      width: 2000,
      height: 1250,
      alt: {
        nl: "De 3D-aanbouwconfigurator van Flexora Bouw met materiaalkeuzes en een prijsindicatie van € 43.400",
        en: "The Flexora Bouw 3D extension configurator with material choices and a price indication of € 43,400",
      },
    },
    detailImage: {
      src: "/images/projects/flexora-home.jpg",
      width: 2000,
      height: 1250,
      alt: {
        nl: "Homepage van Flexora Bouw met dienstenoverzicht en projectfoto's",
        en: "Flexora Bouw homepage with service overview and project photos",
      },
    },
  },
  {
    id: "taxi-de-polder",
    name: "Taxi De Polder",
    url: "https://taxidepolder.nl",
    domain: "taxidepolder.nl",
    featured: true,
    sector: {
      nl: "Taxivervoer, Schiphol",
      en: "Taxi service, Schiphol",
    },
    summary: {
      nl: "Website voor een taxibedrijf in Noord-Holland met vaste tarieven per bestemming en voertuigtype, en een reservering in vier stappen: rit, voertuig, gegevens, bevestiging. Bellen en WhatsApp staan op elke pagina bovenaan.",
      en: "Website for a taxi company in North Holland with fixed rates per destination and vehicle type, and a four-step booking: trip, vehicle, details, confirmation. Phone and WhatsApp are at the top of every page.",
    },
    built: {
      nl: [
        "Reserveringsflow in vier stappen",
        "Vaste tarieven per bestemming en voertuig",
        "Bel- en WhatsApp-knoppen op elke pagina",
        "Dienstenpagina's voor luchthaven, zakelijk en regio",
      ],
      en: [
        "Four-step booking flow",
        "Fixed rates per destination and vehicle",
        "Call and WhatsApp buttons on every page",
        "Service pages for airport, business and regional rides",
      ],
    },
    image: {
      src: "/images/projects/taxi-de-polder.jpg",
      width: 2000,
      height: 1250,
      alt: {
        nl: "Homepage van Taxi De Polder met reserveerknop en vaste tarieven",
        en: "Taxi De Polder homepage with booking button and fixed rates",
      },
    },
  },
  {
    id: "dos-slotenmaker",
    name: "D.O.S Slotenmaker",
    url: "https://deuropslot.nl",
    domain: "deuropslot.nl",
    featured: true,
    sector: {
      nl: "Slotenmaker, 24/7",
      en: "Locksmith, 24/7",
    },
    summary: {
      nl: "Site voor een 24-uursslotenmaker in Amsterdam en omgeving, opgezet rond snel contact: bellen of WhatsApp bovenaan elke pagina, zes dienstpagina's en een werkgebied met een aparte stadspagina voor lokale vindbaarheid.",
      en: "Site for a 24-hour locksmith in Amsterdam and surroundings, built around fast contact: call or WhatsApp at the top of every page, six service pages and a service area with a separate city page for local findability.",
    },
    built: {
      nl: [
        "Zes dienstpagina's",
        "Werkgebied en stadspagina",
        "Bel- en WhatsApp-knoppen op elke pagina",
        "Contactformulier met e-mailnotificatie",
      ],
      en: [
        "Six service pages",
        "Service area and city page",
        "Call and WhatsApp buttons on every page",
        "Contact form with email notification",
      ],
    },
    image: {
      src: "/images/projects/dos-slotenmaker.jpg",
      width: 2000,
      height: 1250,
      alt: {
        nl: "Homepage van D.O.S Slotenmaker met bel- en WhatsApp-knoppen",
        en: "D.O.S Slotenmaker homepage with call and WhatsApp buttons",
      },
    },
  },
  {
    id: "tolkencollectief",
    name: "Arabisch-Nederlands Tolkencollectief",
    url: "https://arabischnederlandstolken.nl",
    domain: "arabischnederlandstolken.nl",
    featured: false,
    sector: {
      nl: "Tolkdiensten",
      en: "Interpreting services",
    },
    summary: {
      nl: "Tweetalige website (Nederlands en Arabisch, rechts-naar-links) voor een tolkencollectief dat werkt voor gemeenten, zorg, advocatuur en IND. Met aanvraagformulier, FAQ en uitleg over beëdigde en spoedtolken.",
      en: "Bilingual website (Dutch and Arabic, right-to-left) for an interpreters' collective working for municipalities, healthcare, law firms and the immigration service. With request form, FAQ and information on sworn and urgent interpreters.",
    },
    built: {
      nl: [
        "Tweetalig NL/AR met eigen URL's en hreflang",
        "Rechts-naar-links layout voor het Arabisch",
        "Aanvraagformulier voor tolkverzoeken",
        "FAQ en teampagina",
      ],
      en: [
        "Bilingual NL/AR with separate URLs and hreflang",
        "Right-to-left layout for Arabic",
        "Request form for interpreting requests",
        "FAQ and team page",
      ],
    },
    image: {
      src: "/images/projects/tolkencollectief.jpg",
      width: 2000,
      height: 1250,
      alt: {
        nl: "Homepage van het Arabisch-Nederlands Tolkencollectief met taalwissel NL/AR",
        en: "Homepage of the Arabic-Dutch interpreters' collective with NL/AR language switch",
      },
    },
    detailImage: {
      src: "/images/projects/tolkencollectief-ar.jpg",
      width: 1600,
      height: 1000,
      alt: {
        nl: "Arabische, rechts-naar-links versie van de tolkenwebsite",
        en: "Arabic right-to-left version of the interpreters' website",
      },
    },
  },
  {
    id: "ghiras-al-sham",
    name: "Ghiras Al-Sham",
    url: "https://ghirasalsham.org",
    domain: "ghirasalsham.org",
    featured: false,
    sector: {
      nl: "Non-profit, onderwijs",
      en: "Non-profit, education",
    },
    summary: {
      nl: "Volledig Arabischtalige, rechts-naar-links website voor een non-profit die Koranonderwijs en jeugdprogramma's organiseert, met een overzicht van 32 locaties in vier regio's en de activiteiten per programma.",
      en: "Fully Arabic, right-to-left website for a non-profit organising Quran education and youth programmes, with an overview of 32 locations across four regions and the activities per programme.",
    },
    built: {
      nl: [
        "Arabisch, rechts-naar-links",
        "Locatieoverzicht per regio (32 locaties)",
        "Programma's en activiteiten",
      ],
      en: [
        "Arabic, right-to-left",
        "Location overview per region (32 locations)",
        "Programmes and activities",
      ],
    },
    image: {
      src: "/images/projects/ghiras-al-sham.jpg",
      width: 2000,
      height: 1250,
      alt: {
        nl: "Arabischtalige homepage van Ghiras Al-Sham",
        en: "Arabic homepage of Ghiras Al-Sham",
      },
    },
  },
];

export function getProjects() {
  return projects;
}

export function getFeaturedProjects() {
  return projects.filter((project) => project.featured);
}

export function getProjectById(id: ProjectId) {
  return projects.find((project) => project.id === id) ?? null;
}

export const projectsOverviewContent = {
  nl: {
    metaTitle: "Projecten",
    metaDescription:
      "Websites en webapplicaties die YM Creations bouwde en die nu live draaien: van 3D-configurator tot tweetalige site met Arabisch.",
    title: "Projecten",
    intro:
      "Vijf websites en applicaties die nu in productie draaien, elk met een link naar de live site. Uitgebreide casebeschrijvingen volgen; wat hieronder staat, is direct te controleren.",
    builtLabel: "Gebouwd",
    visitLabel: "Bekijk live",
  },
  en: {
    metaTitle: "Projects",
    metaDescription:
      "Websites and web applications built by YM Creations that are live today: from a 3D configurator to a bilingual site with Arabic.",
    title: "Projects",
    intro:
      "Five websites and applications currently in production, each linking to the live site. Detailed case studies will follow; everything below can be checked directly.",
    builtLabel: "Built",
    visitLabel: "View live",
  },
} as const;
