import {
  businessInfo,
  processSteps,
  type Locale,
} from "@/lib/content/site-content";
import { getLocalizedPath } from "@/lib/content/routes";

export const serviceKeys = [
  "business-websites",
  "web-app-development",
  "ecommerce-development",
  "landing-pages",
  "redesign-optimization",
  "performance-optimization",
] as const;

export type ServiceKey = (typeof serviceKeys)[number];

type ServiceFaq = {
  question: string;
  answer: string;
};

type LocalizedServiceContent = {
  slug: string;
  navLabel: string;
  metaTitle: string;
  metaDescription: string;
  title: string;
  intro: string;
  forWhoTitle: string;
  forWhoDescription: string;
  suitableFor: string[];
  useCasesTitle: string;
  useCases: string[];
  deliverablesTitle: string;
  deliverables: string[];
  ctaTitle: string;
  ctaText: string;
  faqTitle: string;
  faqs: ServiceFaq[];
};

type ServiceDefinition = {
  key: ServiceKey;
  icon: string;
  accent: string;
  locale: Record<Locale, LocalizedServiceContent>;
};

export const serviceDefinitions: Record<ServiceKey, ServiceDefinition> = {
  "business-websites": {
    key: "business-websites",
    icon: "01",
    accent: "from-cyan-300/18 via-cyan-400/8 to-transparent",
    locale: {
      en: {
        slug: "business-websites",
        navLabel: "Business websites",
        metaTitle: "Business Websites",
        metaDescription:
          "Custom business websites with premium design, clear structure, and polished development for brands that want a stronger online presence.",
        title: "Business websites designed to present your company with clarity and confidence.",
        intro:
          "For companies that need more than a placeholder site, YM Creations builds custom business websites that combine premium design, clear messaging, and polished frontend execution.",
        forWhoTitle: "For businesses that need a stronger first impression online",
        forWhoDescription:
          "This service fits companies that want a professional digital presence without relying on a generic template or fragmented messaging.",
        suitableFor: [
          "Service businesses that need a clear and premium company website",
          "Studios, consultants, and agencies that want stronger positioning",
          "Growing brands that need a site aligned with a more mature offer",
        ],
        useCasesTitle: "Common use cases",
        useCases: [
          "A new company website for a growing business",
          "A higher-end redesign of an outdated site",
          "A structured website that supports lead generation and credibility",
        ],
        deliverablesTitle: "What is typically included",
        deliverables: [
          "Custom page structure and interface direction",
          "Responsive frontend development",
          "Clear section hierarchy and conversion-focused content flow",
          "Performance-minded implementation and technical refinement",
        ],
        ctaTitle: "Need a business website that feels deliberate instead of disposable?",
        ctaText:
          "Let’s shape a site that reflects the quality of your business and gives visitors a clearer reason to trust you.",
        faqTitle: "Business website FAQ",
        faqs: [
          {
            question: "Do you work with custom designs or templates?",
            answer:
              "The focus is on custom design and development so the structure, style, and messaging can fit the business instead of forcing it into a generic layout.",
          },
          {
            question: "Can you redesign an existing company website?",
            answer:
              "Yes. Redesign work can improve structure, visual direction, responsiveness, and the overall quality of the user experience.",
          },
          {
            question: "Can this include multiple service pages?",
            answer:
              "Yes. A business website can be expanded into a broader page structure when the offer, audience, or search intent needs it.",
          },
        ],
      },
      nl: {
        slug: "bedrijfswebsite",
        navLabel: "Bedrijfswebsite",
        metaTitle: "Bedrijfswebsite Laten Maken",
        metaDescription:
          "Maatwerk bedrijfswebsites met premium design, heldere structuur en verfijnde development voor bedrijven die online sterker willen overkomen.",
        title: "Bedrijfswebsites die jouw bedrijf helder, professioneel en overtuigend presenteren.",
        intro:
          "Voor bedrijven die meer nodig hebben dan een eenvoudige placeholder bouwt YM Creations maatwerk bedrijfswebsites met premium design, heldere messaging en verfijnde frontend ontwikkeling.",
        forWhoTitle: "Voor bedrijven die online een sterkere eerste indruk nodig hebben",
        forWhoDescription:
          "Deze dienst past bij bedrijven die een professionele online presentatie willen zonder generieke templates of onduidelijke positionering.",
        suitableFor: [
          "Dienstverleners die een heldere en premium bedrijfswebsite nodig hebben",
          "Studio’s, consultants en agencies die sterker willen positioneren",
          "Groeiende merken die een website nodig hebben die past bij een volwassener aanbod",
        ],
        useCasesTitle: "Veelvoorkomende toepassingen",
        useCases: [
          "Een nieuwe bedrijfswebsite voor een groeiend bedrijf",
          "Een redesign van een verouderde website met hogere kwaliteit",
          "Een gestructureerde website die vertrouwen en leads ondersteunt",
        ],
        deliverablesTitle: "Wat meestal inbegrepen is",
        deliverables: [
          "Maatwerk paginastructuur en visuele richting",
          "Responsive frontend development",
          "Duidelijke hiërarchie en conversion-gerichte contentflow",
          "Performance-minded implementatie en technische verfijning",
        ],
        ctaTitle: "Een bedrijfswebsite nodig die bewust en hoogwaardig aanvoelt?",
        ctaText:
          "We kunnen een site vormgeven die de kwaliteit van je bedrijf beter laat zien en bezoekers sneller laat begrijpen waarom ze voor jou moeten kiezen.",
        faqTitle: "FAQ bedrijfswebsite",
        faqs: [
          {
            question: "Werk je met maatwerk design of templates?",
            answer:
              "De focus ligt op maatwerk design en development zodat structuur, stijl en inhoud echt bij het bedrijf kunnen passen.",
          },
          {
            question: "Kun je ook een bestaande bedrijfswebsite redesignen?",
            answer:
              "Ja. Een redesign kan structuur, uitstraling, responsiveness en de totale gebruikerservaring aanzienlijk verbeteren.",
          },
          {
            question: "Kan een bedrijfswebsite uit meerdere servicepagina’s bestaan?",
            answer:
              "Ja. De opzet kan worden uitgebreid wanneer het aanbod, de doelgroep of de zoekintentie daarom vraagt.",
          },
        ],
      },
    },
  },
  "web-app-development": {
    key: "web-app-development",
    icon: "02",
    accent: "from-sky-300/18 via-sky-400/8 to-transparent",
    locale: {
      en: {
        slug: "web-app-development",
        navLabel: "Web app development",
        metaTitle: "Web App Development",
        metaDescription:
          "Custom web application development for businesses that need streamlined workflows, internal tools, or tailored digital products.",
        title: "Custom web applications built around real workflows and real business needs.",
        intro:
          "When a standard website is not enough, YM Creations develops custom web applications and tailored web tools with a strong focus on usability, clarity, and technical quality.",
        forWhoTitle: "For teams that need more than static pages",
        forWhoDescription:
          "This service fits businesses that need a custom interface, internal tool, client portal, or workflow-specific product on the web.",
        suitableFor: [
          "Businesses with manual processes that need a more efficient digital workflow",
          "Teams that need a custom dashboard, portal, or internal tool",
          "Companies with a specific product idea that does not fit off-the-shelf software",
        ],
        useCasesTitle: "Common use cases",
        useCases: [
          "Internal tools for operations or project management",
          "Client-facing portals or account environments",
          "Custom interfaces for business-specific workflows",
        ],
        deliverablesTitle: "What is typically included",
        deliverables: [
          "Discovery around workflow and requirements",
          "Custom UI direction and frontend implementation",
          "Responsive interface structure for real usage scenarios",
          "Technical refinement focused on clarity and maintainability",
        ],
        ctaTitle: "Need a custom tool instead of forcing your workflow into generic software?",
        ctaText:
          "Share the workflow or product idea and we can determine whether a custom web application is the right direction.",
        faqTitle: "Web app development FAQ",
        faqs: [
          {
            question: "Do you build internal tools as well as client-facing apps?",
            answer:
              "Yes. The service can cover internal tools, portals, dashboards, and user-facing application interfaces depending on the project scope.",
          },
          {
            question: "Is this only for large companies?",
            answer:
              "No. Custom web applications can also make sense for smaller teams when the workflow is specific enough that generic tools become limiting.",
          },
          {
            question: "Can a web application project start small?",
            answer:
              "Yes. A project can begin with a focused first version and expand later if the product or workflow evolves.",
          },
        ],
      },
      nl: {
        slug: "webapplicatie-laten-maken",
        navLabel: "Webapplicatie laten maken",
        metaTitle: "Webapplicatie Laten Maken",
        metaDescription:
          "Maatwerk webapplicaties voor bedrijven die processen willen stroomlijnen of een specifieke digitale tool nodig hebben.",
        title: "Maatwerk webapplicaties gebouwd rondom echte processen en echte bedrijfsbehoeften.",
        intro:
          "Wanneer een standaard website niet genoeg is, ontwikkelt YM Creations maatwerk webapplicaties en webtools met focus op gebruiksgemak, helderheid en technische kwaliteit.",
        forWhoTitle: "Voor teams die meer nodig hebben dan statische pagina’s",
        forWhoDescription:
          "Deze dienst past bij bedrijven die een maatwerk interface, interne tool, klantportaal of workflow-specifiek digitaal product nodig hebben.",
        suitableFor: [
          "Bedrijven met handmatige processen die efficiënter digitaal moeten worden ingericht",
          "Teams die een dashboard, portaal of interne tool op maat nodig hebben",
          "Organisaties met een productidee dat niet past binnen standaardsoftware",
        ],
        useCasesTitle: "Veelvoorkomende toepassingen",
        useCases: [
          "Interne tools voor operations of projectbeheer",
          "Klantportalen of accountomgevingen",
          "Maatwerk interfaces voor bedrijfsspecifieke workflows",
        ],
        deliverablesTitle: "Wat meestal inbegrepen is",
        deliverables: [
          "Intake rond workflow en functionele eisen",
          "Maatwerk UI-richting en frontend implementatie",
          "Responsive interface-structuur voor echt gebruik",
          "Technische verfijning met focus op helderheid en onderhoudbaarheid",
        ],
        ctaTitle: "Een maatwerk tool nodig in plaats van je proces in generieke software te persen?",
        ctaText:
          "Vertel hoe het proces of product eruitziet, dan bepalen we samen of een maatwerk webapplicatie de juiste richting is.",
        faqTitle: "FAQ webapplicatie laten maken",
        faqs: [
          {
            question: "Bouw je zowel interne tools als klantgerichte applicaties?",
            answer:
              "Ja. Deze dienst kan interne tools, portalen, dashboards en klantgerichte interfaces omvatten, afhankelijk van de scope.",
          },
          {
            question: "Is dit alleen interessant voor grote bedrijven?",
            answer:
              "Nee. Ook kleinere teams kunnen baat hebben bij maatwerk wanneer standaardtools te beperkend worden.",
          },
          {
            question: "Kan een webapplicatieproject klein beginnen?",
            answer:
              "Ja. Een project kan starten met een gerichte eerste versie en later worden uitgebreid als het product of proces daarom vraagt.",
          },
        ],
      },
    },
  },
  "ecommerce-development": {
    key: "ecommerce-development",
    icon: "03",
    accent: "from-cyan-200/14 via-cyan-300/8 to-transparent",
    locale: {
      en: {
        slug: "ecommerce-development",
        navLabel: "Ecommerce development",
        metaTitle: "Ecommerce Development",
        metaDescription:
          "Premium ecommerce development for brands that want a polished storefront, stronger product presentation, and a cleaner buying experience.",
        title: "Ecommerce experiences that make products feel clearer, stronger, and easier to buy.",
        intro:
          "YM Creations designs and develops premium ecommerce experiences for brands that want more control over presentation, structure, and the overall shopping experience.",
        forWhoTitle: "For brands that care about presentation as much as conversion",
        forWhoDescription:
          "This service is for businesses that want a webshop or product-driven site with stronger visual direction, clearer structure, and a more refined customer journey.",
        suitableFor: [
          "Brands launching a new ecommerce presence",
          "Shops that want a more premium and better structured storefront",
          "Businesses that need a cleaner path from product discovery to action",
        ],
        useCasesTitle: "Common use cases",
        useCases: [
          "A new webshop with a stronger branded feel",
          "A redesign of a product-heavy ecommerce experience",
          "A focused storefront for a smaller but curated product range",
        ],
        deliverablesTitle: "What is typically included",
        deliverables: [
          "Storefront structure and product presentation direction",
          "Responsive interface design and development",
          "Clear content hierarchy around categories, products, and conversion points",
          "Technical polish for a smoother browsing experience",
        ],
        ctaTitle: "Need an ecommerce build that feels more considered than off-the-shelf?",
        ctaText:
          "We can shape a storefront that supports both product clarity and a stronger brand impression.",
        faqTitle: "Ecommerce development FAQ",
        faqs: [
          {
            question: "Do you only build large webshops?",
            answer:
              "No. Ecommerce work can suit both smaller curated product ranges and larger storefronts depending on what needs to be presented.",
          },
          {
            question: "Can you redesign an existing webshop?",
            answer:
              "Yes. Redesign work can improve layout, product presentation, navigation, and the overall quality of the storefront.",
          },
          {
            question: "Is the focus only on visuals?",
            answer:
              "No. The goal is to improve both the visual quality and the underlying structure of the shopping experience.",
          },
        ],
      },
      nl: {
        slug: "webshop-laten-maken",
        navLabel: "Webshop laten maken",
        metaTitle: "Webshop Laten Maken",
        metaDescription:
          "Premium webshop ontwikkeling voor merken die een sterkere productpresentatie en een verfijndere online winkelervaring willen.",
        title: "Webshops die producten helderder, sterker en overtuigender presenteren.",
        intro:
          "YM Creations ontwerpt en ontwikkelt premium ecommerce ervaringen voor merken die meer controle willen over presentatie, structuur en de totale shopervaring.",
        forWhoTitle: "Voor merken die presentatie net zo belangrijk vinden als conversie",
        forWhoDescription:
          "Deze dienst past bij bedrijven die een webshop of productgerichte site willen met sterkere visuele richting, heldere structuur en een verfijnd klanttraject.",
        suitableFor: [
          "Merken die een nieuwe ecommerce presence lanceren",
          "Webshops die een premium en beter gestructureerde storefront willen",
          "Bedrijven die een duidelijker pad van productontdekking naar actie nodig hebben",
        ],
        useCasesTitle: "Veelvoorkomende toepassingen",
        useCases: [
          "Een nieuwe webshop met een sterkere merkuitstraling",
          "Een redesign van een productrijke ecommerce omgeving",
          "Een gerichte storefront voor een kleiner maar zorgvuldig aanbod",
        ],
        deliverablesTitle: "Wat meestal inbegrepen is",
        deliverables: [
          "Storefront-structuur en richting voor productpresentatie",
          "Responsive interface design en development",
          "Duidelijke contenthiërarchie voor categorieën, producten en CTA’s",
          "Technische afwerking voor een soepelere shopervaring",
        ],
        ctaTitle: "Een webshop nodig die bewuster en sterker aanvoelt dan een standaard oplossing?",
        ctaText:
          "We kunnen een storefront ontwerpen die zowel producthelderheid als een sterkere merkindruk ondersteunt.",
        faqTitle: "FAQ webshop laten maken",
        faqs: [
          {
            question: "Bouw je alleen grote webshops?",
            answer:
              "Nee. Ecommerce kan zowel passen bij kleinere, gecureerde productlijnen als bij uitgebreidere storefronts.",
          },
          {
            question: "Kun je een bestaande webshop redesignen?",
            answer:
              "Ja. Een redesign kan layout, productpresentatie, navigatie en de algehele kwaliteit van de storefront verbeteren.",
          },
          {
            question: "Ligt de focus alleen op design?",
            answer:
              "Nee. Het doel is juist om zowel de visuele kwaliteit als de onderliggende structuur van de shopervaring te verbeteren.",
          },
        ],
      },
    },
  },
  "landing-pages": {
    key: "landing-pages",
    icon: "04",
    accent: "from-sky-200/14 via-sky-300/8 to-transparent",
    locale: {
      en: {
        slug: "landing-pages",
        navLabel: "Landing pages",
        metaTitle: "Landing Pages",
        metaDescription:
          "Custom landing pages for campaigns, offers, and launches with focused structure, stronger messaging, and premium frontend execution.",
        title: "Landing pages built to give one offer a sharper and more focused stage.",
        intro:
          "A strong landing page removes distraction, clarifies the offer, and gives visitors a cleaner path to action. YM Creations creates premium landing pages for launches, campaigns, and focused business offers.",
        forWhoTitle: "For offers that deserve more focus than a general website page",
        forWhoDescription:
          "This service fits businesses running a campaign, introducing a new offer, or needing a dedicated page with stronger intent and clearer conversion flow.",
        suitableFor: [
          "Specific services that need a dedicated destination page",
          "Campaigns, launches, or ad traffic that need a focused landing experience",
          "Businesses testing a sharper message around one offer",
        ],
        useCasesTitle: "Common use cases",
        useCases: [
          "A dedicated page for one premium service",
          "A launch page for a new offer or campaign",
          "A conversion-focused page separate from the main site structure",
        ],
        deliverablesTitle: "What is typically included",
        deliverables: [
          "Focused content hierarchy around one offer",
          "Custom visual direction and page layout",
          "Responsive frontend implementation",
          "Clear CTA positioning and cleaner user flow",
        ],
        ctaTitle: "Need one offer to land with more clarity?",
        ctaText:
          "A dedicated landing page can give an important service or launch the focus it needs without overloading the rest of the site.",
        faqTitle: "Landing page FAQ",
        faqs: [
          {
            question: "Can a landing page exist without a full website rebuild?",
            answer:
              "Yes. A landing page can be created as a focused page on its own when one offer needs a clearer presentation.",
          },
          {
            question: "Is this useful for paid campaigns?",
            answer:
              "Yes. A more focused page structure can support campaign traffic better than sending visitors to a broader homepage.",
          },
          {
            question: "Can a landing page still match the main brand site?",
            answer:
              "Yes. The page can be aligned with the broader brand and still stay more focused in structure and messaging.",
          },
        ],
      },
      nl: {
        slug: "landingspagina",
        navLabel: "Landingspagina",
        metaTitle: "Landingspagina Laten Maken",
        metaDescription:
          "Maatwerk landingspagina’s voor campagnes, launches en gerichte aanbiedingen met heldere structuur en verfijnde frontend uitvoering.",
        title: "Landingspagina’s die één aanbod een scherper en gerichter podium geven.",
        intro:
          "Een sterke landingspagina haalt afleiding weg, maakt het aanbod helderder en geeft bezoekers een duidelijker pad naar actie. YM Creations ontwerpt premium landingspagina’s voor launches, campagnes en gerichte proposities.",
        forWhoTitle: "Voor aanbiedingen die meer focus nodig hebben dan een algemene websitepagina",
        forWhoDescription:
          "Deze dienst past bij bedrijven die een campagne draaien, een nieuw aanbod introduceren of een aparte pagina nodig hebben met sterkere intentie en duidelijkere conversieflow.",
        suitableFor: [
          "Specifieke diensten die een aparte bestemmingspagina nodig hebben",
          "Campagnes, launches of advertentieverkeer met een gerichte landingsbeleving",
          "Bedrijven die een scherper verhaal rond één aanbod willen testen",
        ],
        useCasesTitle: "Veelvoorkomende toepassingen",
        useCases: [
          "Een aparte pagina voor één premium dienst",
          "Een launchpagina voor een nieuwe propositie of campagne",
          "Een conversiegerichte pagina buiten de hoofdstructuur van de site",
        ],
        deliverablesTitle: "Wat meestal inbegrepen is",
        deliverables: [
          "Gerichte contenthiërarchie rondom één aanbod",
          "Maatwerk visuele richting en paginalayout",
          "Responsive frontend implementatie",
          "Duidelijke CTA-positionering en schonere gebruikersflow",
        ],
        ctaTitle: "Moet één aanbod scherper landen?",
        ctaText:
          "Een aparte landingspagina kan een belangrijke dienst of launch de focus geven die nodig is, zonder de rest van de site te overbelasten.",
        faqTitle: "FAQ landingspagina",
        faqs: [
          {
            question: "Kan een landingspagina zonder volledige website redesign?",
            answer:
              "Ja. Een landingspagina kan los worden ontwikkeld wanneer één aanbod een gerichtere presentatie nodig heeft.",
          },
          {
            question: "Is dit geschikt voor betaalde campagnes?",
            answer:
              "Ja. Een meer gerichte paginastructuur past vaak beter bij campagnetraffic dan een brede homepage.",
          },
          {
            question: "Kan een landingspagina wel bij de rest van het merk passen?",
            answer:
              "Ja. De pagina kan aansluiten op de merkidentiteit en tegelijkertijd gerichter zijn in structuur en boodschap.",
          },
        ],
      },
    },
  },
  "redesign-optimization": {
    key: "redesign-optimization",
    icon: "05",
    accent: "from-cyan-300/12 via-white/6 to-transparent",
    locale: {
      en: {
        slug: "redesign-optimization",
        navLabel: "Redesign & optimization",
        metaTitle: "Website Redesign & Optimization",
        metaDescription:
          "Website redesign and optimization for businesses that need a sharper structure, stronger presentation, and a more refined digital experience.",
        title: "Website redesign and optimization for brands that have outgrown their current site.",
        intro:
          "A redesign is not only about making a site look newer. It is about improving how the business is presented, how pages are structured, and how the full experience performs for real visitors.",
        forWhoTitle: "For businesses with a site that no longer matches the quality of the company",
        forWhoDescription:
          "This service fits companies whose website feels outdated, unclear, visually inconsistent, or underwhelming compared to their current positioning.",
        suitableFor: [
          "Businesses with a site that feels dated or visually weak",
          "Teams that need clearer messaging and a stronger structure",
          "Brands ready for a more premium and credible online presence",
        ],
        useCasesTitle: "Common use cases",
        useCases: [
          "A visual redesign of an outdated website",
          "A structural improvement of confusing page flows",
          "A broader quality upgrade without changing the business offer itself",
        ],
        deliverablesTitle: "What is typically included",
        deliverables: [
          "Audit of the current website experience",
          "Updated structure and page hierarchy",
          "Refined visual direction and frontend rebuild where needed",
          "Cleaner interaction, responsiveness, and overall polish",
        ],
        ctaTitle: "Outgrown the current site?",
        ctaText:
          "A redesign can help the website catch up with the level your business already operates at.",
        faqTitle: "Redesign FAQ",
        faqs: [
          {
            question: "Can you improve an existing site without starting from zero?",
            answer:
              "Yes. Some projects need a full rebuild, while others benefit from a more targeted redesign and optimization approach.",
          },
          {
            question: "Is redesign only about visuals?",
            answer:
              "No. The work also covers structure, messaging flow, usability, responsiveness, and the overall quality of the experience.",
          },
          {
            question: "Can redesign work support better SEO structure?",
            answer:
              "Yes. A clearer page hierarchy and better internal structure can support a stronger SEO foundation when implemented correctly.",
          },
        ],
      },
      nl: {
        slug: "redesign-optimalisatie",
        navLabel: "Redesign & optimalisatie",
        metaTitle: "Website Redesign & Optimalisatie",
        metaDescription:
          "Website redesign en optimalisatie voor bedrijven die een sterkere structuur, scherpere presentatie en verfijndere online ervaring nodig hebben.",
        title: "Website redesign en optimalisatie voor merken die hun huidige site zijn ontgroeid.",
        intro:
          "Een redesign draait niet alleen om een nieuw uiterlijk. Het gaat ook om betere presentatie, helderdere structuur en een ervaring die beter presteert voor echte bezoekers.",
        forWhoTitle: "Voor bedrijven waarvan de website niet meer past bij hun huidige niveau",
        forWhoDescription:
          "Deze dienst past bij bedrijven waarvan de site verouderd, onduidelijk, visueel inconsistent of ondermaats voelt ten opzichte van hun huidige positionering.",
        suitableFor: [
          "Bedrijven met een site die gedateerd of visueel zwak aanvoelt",
          "Teams die helderdere messaging en een sterkere structuur nodig hebben",
          "Merken die klaar zijn voor een premium en geloofwaardigere online aanwezigheid",
        ],
        useCasesTitle: "Veelvoorkomende toepassingen",
        useCases: [
          "Een visuele redesign van een verouderde website",
          "Een structurele verbetering van onduidelijke paginaflows",
          "Een bredere kwaliteitsupgrade zonder het aanbod zelf te veranderen",
        ],
        deliverablesTitle: "Wat meestal inbegrepen is",
        deliverables: [
          "Audit van de huidige website-ervaring",
          "Bijgewerkte structuur en pagina-hiërarchie",
          "Verfijnde visuele richting en waar nodig een frontend rebuild",
          "Schonere interactie, responsiveness en algemene afwerking",
        ],
        ctaTitle: "Je huidige site ontgroeid?",
        ctaText:
          "Een redesign kan ervoor zorgen dat de website weer aansluit op het niveau waarop je bedrijf inmiddels opereert.",
        faqTitle: "FAQ redesign",
        faqs: [
          {
            question: "Kun je een bestaande site verbeteren zonder helemaal opnieuw te beginnen?",
            answer:
              "Ja. Sommige projecten vragen om een volledige rebuild, terwijl andere juist meer baat hebben bij gerichte redesign en optimalisatie.",
          },
          {
            question: "Gaat redesign alleen over visuele stijl?",
            answer:
              "Nee. Het werk gaat ook over structuur, contentflow, gebruiksgemak, responsiveness en de totale kwaliteit van de ervaring.",
          },
          {
            question: "Kan redesign ook helpen met SEO-structuur?",
            answer:
              "Ja. Een duidelijkere pagina-opbouw en betere interne structuur kunnen een sterkere SEO-basis ondersteunen.",
          },
        ],
      },
    },
  },
  "performance-optimization": {
    key: "performance-optimization",
    icon: "06",
    accent: "from-white/10 via-cyan-300/6 to-transparent",
    locale: {
      en: {
        slug: "performance-optimization",
        navLabel: "Performance optimization",
        metaTitle: "Performance Optimization",
        metaDescription:
          "Performance optimization for websites that need cleaner frontend execution, stronger responsiveness, and a more refined browsing experience.",
        title: "Performance optimization for websites that should feel faster, cleaner, and more polished.",
        intro:
          "Performance is part of the experience. YM Creations improves frontend execution, responsiveness, and technical polish so a website feels sharper in real use.",
        forWhoTitle: "For websites that already exist but feel heavier or rougher than they should",
        forWhoDescription:
          "This service fits businesses that want to improve site quality without necessarily rebuilding everything from scratch.",
        suitableFor: [
          "Sites with sluggish interaction or inconsistent responsiveness",
          "Brands that want a cleaner frontend feel before a larger redesign",
          "Businesses that need technical refinement on an existing web experience",
        ],
        useCasesTitle: "Common use cases",
        useCases: [
          "Improving frontend responsiveness and visual smoothness",
          "Reducing unnecessary friction in the browsing experience",
          "Refining the technical quality of an existing site",
        ],
        deliverablesTitle: "What is typically included",
        deliverables: [
          "Review of frontend performance and interface friction",
          "Targeted improvements in implementation quality",
          "Smoother responsive behavior and interaction details",
          "A cleaner experience aligned with the brand’s premium direction",
        ],
        ctaTitle: "Want the current site to feel more refined before rebuilding everything?",
        ctaText:
          "Performance and technical polish can often improve the experience meaningfully, even when the broader site stays in place.",
        faqTitle: "Performance optimization FAQ",
        faqs: [
          {
            question: "Is performance optimization only about speed scores?",
            answer:
              "No. The goal is a better real-world experience, which can include responsiveness, interaction quality, and cleaner frontend execution.",
          },
          {
            question: "Can this happen without a full redesign?",
            answer:
              "Yes. Some improvements can be made on the current site without rebuilding the entire visual system.",
          },
          {
            question: "Is this useful before a larger redesign?",
            answer:
              "Yes. It can be a practical intermediate step when the current site still needs to perform better in the short term.",
          },
        ],
      },
      nl: {
        slug: "performance",
        navLabel: "Performance optimalisatie",
        metaTitle: "Performance Optimalisatie",
        metaDescription:
          "Performance optimalisatie voor websites die schonere frontend uitvoering, betere responsiveness en een verfijndere gebruikerservaring nodig hebben.",
        title: "Performance optimalisatie voor websites die sneller, schoner en verfijnder moeten aanvoelen.",
        intro:
          "Performance is onderdeel van de ervaring. YM Creations verbetert frontend uitvoering, responsiveness en technische afwerking zodat een website in echt gebruik scherper aanvoelt.",
        forWhoTitle: "Voor websites die al bestaan maar zwaarder of ruwer aanvoelen dan nodig is",
        forWhoDescription:
          "Deze dienst past bij bedrijven die de kwaliteit van hun site willen verbeteren zonder direct alles opnieuw te laten bouwen.",
        suitableFor: [
          "Sites met trage interactie of inconsistente responsiveness",
          "Merken die eerst een schonere frontend ervaring willen vóór een grotere redesign",
          "Bedrijven die technische verfijning nodig hebben binnen een bestaande site",
        ],
        useCasesTitle: "Veelvoorkomende toepassingen",
        useCases: [
          "Verbeteren van frontend responsiveness en visuele vloeiendheid",
          "Verminderen van onnodige frictie in de browse-ervaring",
          "Verfijnen van de technische kwaliteit van een bestaande site",
        ],
        deliverablesTitle: "Wat meestal inbegrepen is",
        deliverables: [
          "Review van frontend performance en interface-frictie",
          "Gerichte verbeteringen in implementatiekwaliteit",
          "Soepele responsive gedragingen en interactiedetails",
          "Een schonere ervaring die past bij een premium merkuitstraling",
        ],
        ctaTitle: "Moet de huidige site verfijnder aanvoelen zonder direct alles opnieuw te bouwen?",
        ctaText:
          "Performance en technische polish kunnen de ervaring vaak al merkbaar verbeteren, ook als de rest van de site grotendeels blijft staan.",
        faqTitle: "FAQ performance optimalisatie",
        faqs: [
          {
            question: "Gaat performance optimalisatie alleen over snelheidsscores?",
            answer:
              "Nee. Het doel is vooral een betere ervaring in de praktijk, inclusief responsiveness, interactiekwaliteit en schonere frontend uitvoering.",
          },
          {
            question: "Kan dit zonder volledige redesign?",
            answer:
              "Ja. Sommige verbeteringen kunnen op de bestaande site worden doorgevoerd zonder het hele visuele systeem opnieuw op te bouwen.",
          },
          {
            question: "Is dit zinvol vóór een grotere redesign?",
            answer:
              "Ja. Het kan een praktische tussenstap zijn wanneer de huidige site op korte termijn beter moet functioneren.",
          },
        ],
      },
    },
  },
};

export type LocalizedService = ServiceDefinition & {
  slug: string;
  navLabel: string;
  metaTitle: string;
  metaDescription: string;
  title: string;
  intro: string;
  forWhoTitle: string;
  forWhoDescription: string;
  suitableFor: string[];
  useCasesTitle: string;
  useCases: string[];
  deliverablesTitle: string;
  deliverables: string[];
  ctaTitle: string;
  ctaText: string;
  faqTitle: string;
  faqs: ServiceFaq[];
  path: string;
  overviewPath: string;
  contactPath: string;
  process: (typeof processSteps)[Locale];
};

export function getServicesForLocale(locale: Locale): LocalizedService[] {
  return serviceKeys.map((key) => {
    const definition = serviceDefinitions[key];
    const localized = definition.locale[locale];

    return {
      ...definition,
      ...localized,
      path:
        locale === "en"
          ? `/en/services/${localized.slug}`
          : `/nl/diensten/${localized.slug}`,
      overviewPath: getLocalizedPath(locale, "services"),
      contactPath: getLocalizedPath(locale, "contact"),
      process: processSteps[locale],
    };
  });
}

export function getServiceBySlug(
  locale: Locale,
  slug: string,
): LocalizedService | null {
  return (
    getServicesForLocale(locale).find((service) => service.slug === slug) ?? null
  );
}

export function getServiceAlternates(serviceKey: ServiceKey) {
  const definition = serviceDefinitions[serviceKey];

  return {
    languages: {
      en: `/en/services/${definition.locale.en.slug}`,
      nl: `/nl/diensten/${definition.locale.nl.slug}`,
      "x-default": `/en/services/${definition.locale.en.slug}`,
    },
  };
}

export const servicesOverviewContent = {
  en: {
    metaTitle: "Services",
    metaDescription:
      "Explore custom website, landing page, ecommerce, redesign, performance, and web app services by YM Creations.",
    title: "Services built for brands and businesses that need more than a standard website.",
    intro:
      "The service offering covers premium websites, landing pages, webshops, redesigns, performance work, and custom web applications. Each project is shaped around clarity, execution quality, and a refined user experience.",
    eyebrow: "Services overview",
    whyTitle: "What ties the service stack together",
    whyPoints: [
      "Custom structure instead of generic template thinking",
      "Strong attention to motion, interface rhythm, and technical polish",
      "A process built around clear communication and deliberate implementation",
    ],
  },
  nl: {
    metaTitle: "Diensten",
    metaDescription:
      "Bekijk maatwerk diensten voor websites, landingspagina’s, webshops, redesigns, performance en webapplicaties van YM Creations.",
    title: "Diensten voor merken en bedrijven die meer nodig hebben dan een standaard website.",
    intro:
      "Het aanbod bestaat uit premium websites, landingspagina’s, webshops, redesigns, performance werk en maatwerk webapplicaties. Ieder project wordt opgebouwd rond helderheid, uitvoeringskwaliteit en een verfijnde gebruikerservaring.",
    eyebrow: "Dienstenoverzicht",
    whyTitle: "Wat de service stack verbindt",
    whyPoints: [
      "Maatwerk structuur in plaats van generiek template-denken",
      "Sterke aandacht voor motion, interface-ritme en technische afwerking",
      "Een proces gebouwd rond heldere communicatie en bewuste implementatie",
    ],
  },
} as const;

export const serviceCollectionSchemaDescription = {
  en: `Custom services by ${businessInfo.name} including business websites, web applications, ecommerce development, landing pages, redesign, and performance optimization.`,
  nl: `Maatwerk diensten van ${businessInfo.name}, waaronder bedrijfswebsites, webapplicaties, ecommerce development, landingspagina’s, redesign en performance optimalisatie.`,
} as const;
