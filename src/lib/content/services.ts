import { businessInfo, type Locale } from "@/lib/content/site-content";
import { getLocalizedPath } from "@/lib/content/routes";
import type { ProjectId } from "@/lib/content/projects";

/**
 * Service architecture.
 *
 * Two groups: building a new digital product, or improving an environment that
 * already exists. New products are organised in four families that match the
 * homepage ("Wat we bouwen"); the websites family holds three routes, the
 * other families one each. Existing routes are kept for SEO.
 */
export const serviceKeys = [
  "business-websites",
  "ecommerce-development",
  "landing-pages",
  "web-app-development",
  "3d-configurators",
  "integrations-automation",
  "redesign-optimization",
  "performance-optimization",
] as const;

export type ServiceKey = (typeof serviceKeys)[number];

/**
 * package: a standardised build with a starting price on the pricing page.
 * custom: software that is scoped and quoted after an intake.
 * improve: work on an existing site or application, priced after an audit or
 * measurement.
 */
export type ServiceKind = "package" | "custom" | "improve";

export type ServiceGroup = "build" | "improve";

export type ServiceFamilyKey =
  | "websites"
  | "applications"
  | "configurators"
  | "integrations"
  | "existing";

type ServiceFaq = {
  question: string;
  answer: string;
};

type ServiceStep = {
  title: string;
  text: string;
};

export type ServicePart = {
  label: string;
  text: string;
};

type LocalizedServiceContent = {
  slug: string;
  navLabel: string;
  metaTitle: string;
  metaDescription: string;
  title: string;
  intro: string;
  /** One line for the services index. */
  summary: string;
  /** Situations in which this service fits. */
  fitTitle: string;
  fit: string[];
  /** What we build or change. */
  buildTitle: string;
  build: string[];
  /** Parts of the product; how they are shown depends on `partsLayout`. */
  partsTitle?: string;
  parts?: ServicePart[];
  /** What is not automatically included or depends on scope. */
  scopeTitle: string;
  scope: string[];
  /** The trajectory on the main lines, specific to this service. */
  approachTitle: string;
  approach: ServiceStep[];
  /** Shown instead of the pricing link for custom and improve services. */
  priceNote?: string;
  ctaTitle: string;
  ctaText: string;
  faqTitle: string;
  faqs: ServiceFaq[];
};

type ServiceDefinition = {
  key: ServiceKey;
  kind: ServiceKind;
  family: ServiceFamilyKey;
  /** Layout of `parts`: a stack of layers, or a left-to-right flow. */
  partsLayout?: "layers" | "flow";
  /** Live projects that show this kind of work. */
  proof: ProjectId[];
  locale: Record<Locale, LocalizedServiceContent>;
};

export const serviceDefinitions: Record<ServiceKey, ServiceDefinition> = {
  "business-websites": {
    key: "business-websites",
    kind: "package",
    family: "websites",
    proof: ["taxi-de-polder", "dos-slotenmaker"],
    locale: {
      nl: {
        slug: "bedrijfswebsite",
        navLabel: "Bedrijfswebsite",
        metaTitle: "Bedrijfswebsite laten maken",
        metaDescription:
          "Een bedrijfswebsite op maat in eigen code: dienstenpagina's, contactflow met formulier, bellen en WhatsApp, en technische SEO vanaf de eerste versie.",
        title:
          "Een bedrijfswebsite die vertelt wat je doet en de weg naar contact kort houdt.",
        intro:
          "De structuur volgt uit wat je aanbiedt en hoe klanten contact opnemen. Gebouwd in eigen code, zodat de site snel blijft en meegroeit als je aanbod verandert.",
        summary: "Dienstenpagina's, contactflow en lokale vindbaarheid.",
        fitTitle: "Past wanneer",
        fit: [
          "De website is het eerste contactmoment met nieuwe klanten",
          "Je wilt lokaal gevonden worden op je diensten of werkgebied",
          "Je start een bedrijf of dienst en hebt nog geen site die klopt",
        ],
        buildTitle: "Wat we bouwen",
        build: [
          "Dienstenpagina's per specialisme",
          "Werkgebied- en stadspagina's",
          "Contactflow: formulier, bellen en WhatsApp, met bevestiging per e-mail",
          "Meertalige versie met een eigen URL per taal",
        ],
        partsTitle: "Inbegrepen",
        parts: [
          { label: "Ontwerp en paginastructuur op maat, mobiel eerst", text: "" },
          { label: "Ontwikkeling in Next.js met eigen componenten", text: "" },
          {
            label: "Technische SEO: metadata, sitemap, structured data en laadtijd",
            text: "",
          },
          { label: "Domein, hosting en e-mail ingericht bij livegang", text: "" },
        ],
        scopeTitle: "Afhankelijk van scope",
        scope: [
          "Teksten: we schrijven mee of scherpen aan, de inhoud komt van jou",
          "Fotografie en beeld",
          "Een beheeromgeving om zelf teksten aan te passen; bij weinig wijzigingen regelen we die voor je",
          "Advertenties en doorlopende SEO na livegang",
        ],
        approachTitle: "Zo verloopt het traject",
        approach: [
          {
            title: "Intake",
            text: "We nemen door welke pagina's nodig zijn, waar klanten op zoeken en welk materiaal er al is. Je krijgt een scope met vaste prijs en planning.",
          },
          {
            title: "Ontwerp in de browser",
            text: "Je ziet structuur en teksten vroeg op je eigen telefoon en laptop, en geeft feedback tot de opzet klopt.",
          },
          {
            title: "Bouw en livegang",
            text: "We bouwen, testen op telefoon en desktop en zetten de site live. Daarna blijven we bereikbaar voor aanpassingen.",
          },
        ],
        ctaTitle: "Een nieuwe bedrijfswebsite?",
        ctaText:
          "Stuur kort wat je doet en wat de site voor klanten moet doen. Je krijgt een voorstel met scope en prijs.",
        faqTitle: "Veelgestelde vragen",
        faqs: [
          {
            question: "Werken jullie met WordPress of een template?",
            answer:
              "Nee. We bouwen in eigen code met Next.js. Er is geen thema of plug-in om bij te houden; onderhoud beperkt zich tot de site zelf.",
          },
          {
            question: "Hoe lang duurt het?",
            answer:
              "Dat hangt vooral af van hoe snel teksten en beeld beschikbaar zijn. In de intake spreken we een planning af en die houden we aan.",
          },
          {
            question: "Kan de site later uitgebreid worden met een reservering of webshop?",
            answer:
              "Ja. De site is de basis; een reserveringsflow, webshop of beheeromgeving bouwen we daarop verder in dezelfde code.",
          },
        ],
      },
      en: {
        slug: "business-websites",
        navLabel: "Business website",
        metaTitle: "Business websites",
        metaDescription:
          "A custom business website in custom code: service pages, a contact flow with form, phone and WhatsApp, and technical SEO from the first version.",
        title:
          "A business website that explains what you do and keeps the way to contact short.",
        intro:
          "The structure follows from what you offer and how customers get in touch. Built in custom code, so the site stays fast and grows with your offer.",
        summary: "Service pages, contact flow and local findability.",
        fitTitle: "Fits when",
        fit: [
          "The website is the first point of contact with new customers",
          "You want to be found locally for your services or service area",
          "You are starting a business or service and do not have a site that fits yet",
        ],
        buildTitle: "What we build",
        build: [
          "Service pages per specialism",
          "Service area and city pages",
          "Contact flow: form, phone and WhatsApp, with email confirmation",
          "Multilingual version with its own URL per language",
        ],
        partsTitle: "Included",
        parts: [
          { label: "Custom design and page structure, mobile first", text: "" },
          { label: "Development in Next.js with custom components", text: "" },
          {
            label: "Technical SEO: metadata, sitemap, structured data and load time",
            text: "",
          },
          { label: "Domain, hosting and email set up at launch", text: "" },
        ],
        scopeTitle: "Depends on scope",
        scope: [
          "Copy: we co-write or sharpen it, the content comes from you",
          "Photography and imagery",
          "An admin area to edit copy yourself; with few changes we handle them for you",
          "Advertising and ongoing SEO after launch",
        ],
        approachTitle: "How the project runs",
        approach: [
          {
            title: "Intake",
            text: "We go through which pages are needed, what customers search for and which material already exists. You get a scope with a fixed price and schedule.",
          },
          {
            title: "Design in the browser",
            text: "You see structure and copy early on your own phone and laptop, and give feedback until the setup is right.",
          },
          {
            title: "Build and launch",
            text: "We build, test on phone and desktop and put the site live. After that we stay available for changes.",
          },
        ],
        ctaTitle: "A new business website?",
        ctaText:
          "Briefly describe what you do and what the site should do for customers. You get a proposal with scope and price.",
        faqTitle: "Frequently asked questions",
        faqs: [
          {
            question: "Do you work with WordPress or a template?",
            answer:
              "No. We build in custom code with Next.js. There is no theme or plugin to maintain; maintenance is limited to the site itself.",
          },
          {
            question: "How long does it take?",
            answer:
              "That mostly depends on how quickly copy and imagery are available. We agree on a schedule during the intake and stick to it.",
          },
          {
            question: "Can the site be extended later with a booking flow or webshop?",
            answer:
              "Yes. The site is the basis; a booking flow, webshop or admin area is built on top of it in the same code.",
          },
        ],
      },
    },
  },
  "ecommerce-development": {
    key: "ecommerce-development",
    kind: "package",
    family: "websites",
    proof: [],
    locale: {
      nl: {
        slug: "webshop-laten-maken",
        navLabel: "Webshop",
        metaTitle: "Webshop laten maken",
        metaDescription:
          "Een webshop op maat met productpagina's, winkelwagen, checkout met iDEAL en orderbeheer, gebouwd als één geheel met je website.",
        title: "Een webshop met producten, checkout en beheer als één geheel.",
        intro:
          "Voor bedrijven die online willen verkopen en shop en website als één geheel willen: dezelfde code, dezelfde huisstijl, één beheer. Zonder apart platform dat meer instellingen heeft dan je gebruikt.",
        summary: "Productpagina's, checkout, betalingen en orderbeheer.",
        fitTitle: "Past wanneer",
        fit: [
          "Je verkoopt producten naast je diensten en wilt dat op één site",
          "Je hebt een klein of gecureerd assortiment",
          "Je huidige shop is traag of vraagt meer onderhoud dan je wilt",
        ],
        buildTitle: "Wat we bouwen",
        build: [
          "Productpagina's met categorieën en filters",
          "Winkelwagen en checkout met betaalkoppeling",
          "Orderbevestigingen en verzendmails",
          "Meertalige shop met een eigen URL per taal",
        ],
        partsTitle: "Inbegrepen",
        parts: [
          { label: "Ontwerp en productpresentatie op maat, mobiel eerst", text: "" },
          { label: "Beheer van producten, prijzen en voorraad", text: "" },
          { label: "Technische SEO voor categorieën en producten", text: "" },
          { label: "Domein, hosting en e-mail ingericht bij livegang", text: "" },
        ],
        scopeTitle: "Afhankelijk van scope",
        scope: [
          "Verzend- en btw-regels buiten Nederland",
          "Koppeling met een boekhoud- of voorraadsysteem",
          "Import van producten en klanten uit een bestaande shop",
          "Abonnementen, kortingscodes en klantaccounts",
        ],
        approachTitle: "Zo verloopt het traject",
        approach: [
          {
            title: "Intake",
            text: "Wat je verkoopt, hoeveel producten, hoe je verzendt en welke betaalmethoden je klanten gebruiken. Daaruit volgt een scope met vaste prijs.",
          },
          {
            title: "Ontwerp en catalogus",
            text: "Productpresentatie en checkout werken we in de browser uit; ondertussen richt jij de catalogus in.",
          },
          {
            title: "Testen en livegang",
            text: "We testen betalingen en orderflow van begin tot eind, zetten de shop live en blijven bereikbaar.",
          },
        ],
        ctaTitle: "Een webshop laten bouwen?",
        ctaText:
          "Vertel wat je verkoopt en hoeveel producten het zijn. Dan weten we snel welke opzet past.",
        faqTitle: "Veelgestelde vragen",
        faqs: [
          {
            question: "Welke betaalmethoden zijn mogelijk?",
            answer:
              "iDEAL en de gangbare kaarten via een betaalprovider. Welke provider precies, stemmen we af op je bank en je klanten.",
          },
          {
            question: "Kan de shop onderdeel zijn van mijn bestaande website?",
            answer:
              "Ja, als die site door ons is gebouwd of herbouwd wordt. Bij een site op een ander platform bekijken we of een aparte shop op een subdomein beter past.",
          },
          {
            question: "Wat als het assortiment groeit?",
            answer:
              "Categorieën, filters en beheer zijn gebouwd om mee te groeien. Bij honderden producten bekijken we in de intake de structuur van de catalogus.",
          },
        ],
      },
      en: {
        slug: "ecommerce-development",
        navLabel: "Webshop",
        metaTitle: "Ecommerce development",
        metaDescription:
          "A custom webshop with product pages, cart, checkout with iDEAL and order management, built as one whole with your website.",
        title: "A webshop with products, checkout and management as one whole.",
        intro:
          "For businesses that want to sell online and want shop and website as one whole: the same code, the same identity, one admin. Without a separate platform that has more settings than you use.",
        summary: "Product pages, checkout, payments and order management.",
        fitTitle: "Fits when",
        fit: [
          "You sell products alongside your services and want both on one site",
          "You have a small or curated range",
          "Your current shop is slow or needs more maintenance than you want",
        ],
        buildTitle: "What we build",
        build: [
          "Product pages with categories and filters",
          "Cart and checkout with payment integration",
          "Order confirmations and shipping emails",
          "Multilingual shop with its own URL per language",
        ],
        partsTitle: "Included",
        parts: [
          { label: "Custom design and product presentation, mobile first", text: "" },
          { label: "Management of products, prices and stock", text: "" },
          { label: "Technical SEO for categories and products", text: "" },
          { label: "Domain, hosting and email set up at launch", text: "" },
        ],
        scopeTitle: "Depends on scope",
        scope: [
          "Shipping and VAT rules outside the Netherlands",
          "Integration with an accounting or stock system",
          "Import of products and customers from an existing shop",
          "Subscriptions, discount codes and customer accounts",
        ],
        approachTitle: "How the project runs",
        approach: [
          {
            title: "Intake",
            text: "What you sell, how many products, how you ship and which payment methods your customers use. That results in a scope with a fixed price.",
          },
          {
            title: "Design and catalogue",
            text: "We work out product presentation and checkout in the browser; meanwhile you set up the catalogue.",
          },
          {
            title: "Testing and launch",
            text: "We test payments and the order flow end to end, put the shop live and stay available.",
          },
        ],
        ctaTitle: "Having a webshop built?",
        ctaText:
          "Tell us what you sell and how many products there are. Then we quickly know which setup fits.",
        faqTitle: "Frequently asked questions",
        faqs: [
          {
            question: "Which payment methods are possible?",
            answer:
              "iDEAL and the common cards through a payment provider. Which provider exactly, we align with your bank and your customers.",
          },
          {
            question: "Can the shop be part of my existing website?",
            answer:
              "Yes, if that site was built by us or is being rebuilt. For a site on another platform we look at whether a separate shop on a subdomain fits better.",
          },
          {
            question: "What if the range grows?",
            answer:
              "Categories, filters and management are built to grow. With hundreds of products we look at the catalogue structure during the intake.",
          },
        ],
      },
    },
  },
  "landing-pages": {
    key: "landing-pages",
    kind: "package",
    family: "websites",
    proof: [],
    locale: {
      nl: {
        slug: "landingspagina",
        navLabel: "Landingspagina",
        metaTitle: "Landingspagina laten maken",
        metaDescription:
          "Een landingspagina voor één aanbod of campagne: opbouw gericht op één actie, formulier met e-mailnotificatie en meting in Google Analytics.",
        title: "Een landingspagina met één doel.",
        intro:
          "Voor een campagne, lancering of één specifieke dienst: één pagina zonder afleiding, waarop de bezoeker maar één ding hoeft te doen.",
        summary: "Eén pagina voor één aanbod of campagne.",
        fitTitle: "Past wanneer",
        fit: [
          "Je adverteert via Google of sociale media en wilt bezoekers op één pagina laten landen",
          "Je lanceert een nieuwe dienst of een nieuw product",
          "Eén dienst krijgt op je hoofdsite te weinig aandacht",
        ],
        buildTitle: "Wat we bouwen",
        build: [
          "Opbouw en teksten gericht op één actie",
          "Formulier met validatie en e-mailnotificatie",
          "Meting van aanvragen in Google Analytics",
          "Ontwerp in lijn met je huisstijl",
        ],
        partsTitle: "Inbegrepen",
        parts: [
          { label: "Snelle laadtijd, ook op mobiel", text: "" },
          { label: "Eigen domein of subdomein, ingericht bij livegang", text: "" },
          { label: "Indexering naar keuze: wel of niet vindbaar in Google", text: "" },
        ],
        scopeTitle: "Afhankelijk van scope",
        scope: [
          "Advertentiecampagne en budget",
          "A/B-varianten van de pagina",
          "Beeld en fotografie",
        ],
        approachTitle: "Zo verloopt het traject",
        approach: [
          {
            title: "Aanbod en doelgroep",
            text: "Je stuurt het aanbod en voor wie het is; wij stellen de opbouw en de volgorde van argumenten voor.",
          },
          {
            title: "Pagina en meting",
            text: "Ontwerp, tekst en formulier in de browser; je ziet de pagina op je telefoon voordat hij live gaat.",
          },
          {
            title: "Livegang",
            text: "We zetten de pagina live en controleren of aanvragen doorkomen in je campagnemeting.",
          },
        ],
        ctaTitle: "Een pagina voor een campagne of lancering?",
        ctaText: "Stuur het aanbod en de doelgroep door, dan stellen we de opbouw voor.",
        faqTitle: "Veelgestelde vragen",
        faqs: [
          {
            question: "Verzorgen jullie ook de advertenties?",
            answer:
              "Nee. Wij bouwen de pagina en richten de meting in. Adverteren doe je zelf of met een bureau; wij stemmen de pagina daarop af.",
          },
          {
            question: "Kan de pagina later onderdeel worden van een nieuwe site?",
            answer:
              "Ja. Opbouw en teksten nemen we mee als de hoofdsite later vernieuwd wordt.",
          },
          {
            question: "Hoe snel kan de pagina live?",
            answer:
              "Sneller dan een complete site, omdat de scope klein is. De doorlooptijd hangt vooral af van hoe snel het aanbod en het beeld vaststaan.",
          },
        ],
      },
      en: {
        slug: "landing-pages",
        navLabel: "Landing page",
        metaTitle: "Landing pages",
        metaDescription:
          "A landing page for one offer or campaign: structure aimed at one action, a form with email notification and measurement in Google Analytics.",
        title: "A landing page with one goal.",
        intro:
          "For a campaign, launch or one specific service: a single page without distraction, on which the visitor only has to do one thing.",
        summary: "One page for one offer or campaign.",
        fitTitle: "Fits when",
        fit: [
          "You advertise through Google or social media and want visitors to land on one page",
          "You are launching a new service or product",
          "One service gets too little attention on your main site",
        ],
        buildTitle: "What we build",
        build: [
          "Structure and copy aimed at one action",
          "Form with validation and email notification",
          "Tracking of requests in Google Analytics",
          "Design in line with your brand identity",
        ],
        partsTitle: "Included",
        parts: [
          { label: "Fast load times, on mobile as well", text: "" },
          { label: "Own domain or subdomain, set up at launch", text: "" },
          { label: "Indexing as you choose: findable in Google or not", text: "" },
        ],
        scopeTitle: "Depends on scope",
        scope: [
          "Ad campaign and budget",
          "A/B variants of the page",
          "Imagery and photography",
        ],
        approachTitle: "How the project runs",
        approach: [
          {
            title: "Offer and audience",
            text: "You send the offer and who it is for; we propose the structure and the order of arguments.",
          },
          {
            title: "Page and tracking",
            text: "Design, copy and form in the browser; you see the page on your phone before it goes live.",
          },
          {
            title: "Launch",
            text: "We put the page live and check that requests come through in your campaign tracking.",
          },
        ],
        ctaTitle: "A page for a campaign or launch?",
        ctaText: "Send over the offer and the audience, and we propose the structure.",
        faqTitle: "Frequently asked questions",
        faqs: [
          {
            question: "Do you run the ads as well?",
            answer:
              "No. We build the page and set up the tracking. You run the ads yourself or with an agency; we align the page with that.",
          },
          {
            question: "Can the page become part of a new site later?",
            answer:
              "Yes. We carry the structure and copy over when the main site is renewed later.",
          },
          {
            question: "How quickly can the page go live?",
            answer:
              "Faster than a complete site, because the scope is small. Lead time mostly depends on how quickly the offer and imagery are settled.",
          },
        ],
      },
    },
  },
  "web-app-development": {
    key: "web-app-development",
    kind: "custom",
    family: "applications",
    partsLayout: "layers",
    proof: ["taxi-de-polder"],
    locale: {
      nl: {
        slug: "webapplicatie-laten-maken",
        navLabel: "Webapplicatie",
        metaTitle: "Webapplicatie laten maken",
        metaDescription:
          "Maatwerk webapplicaties, portalen en apps: reserveringssystemen, klantportalen, dashboards en beheeromgevingen met inlog, rollen en koppelingen, gebouwd rond je eigen proces.",
        title: "Webapplicaties, portalen en apps rond je eigen proces.",
        intro:
          "Als een website niet genoeg is omdat er iets moet gebeuren, en standaardsoftware niet past op hoe je werkt. We bouwen de applicatie rond het proces zoals het nu loopt, en laten weg wat je niet gebruikt.",
        summary: "Reserveringen, portalen, dashboards en beheer.",
        fitTitle: "Past wanneer",
        fit: [
          "Een proces loopt via telefoon, e-mail of spreadsheets en klanten zouden het zelf moeten kunnen doen",
          "Aanvragen, reserveringen of planning moeten gestructureerd binnenkomen en te volgen zijn",
          "Een team of klant heeft een eigen omgeving nodig met inlog en eigen gegevens",
        ],
        buildTitle: "Wat we bouwen",
        build: [
          "Reserverings- en aanvraagsystemen met status en bevestigingen",
          "Klantportalen met inlog, documenten en eigen gegevens",
          "Interne portals, planning en dashboards voor een team",
          "Beheeromgevingen voor content, prijzen of aanvragen",
          "Apps op de telefoon als uitbreiding van een platform",
        ],
        partsTitle: "Waaruit een applicatie kan bestaan",
        parts: [
          {
            label: "Interface",
            text: "Wat klanten of collega's zien en gebruiken, op telefoon en desktop.",
          },
          {
            label: "Beheeromgeving",
            text: "Waar jij aanvragen, gegevens en instellingen beheert.",
          },
          {
            label: "Database",
            text: "Waar alles gestructureerd wordt opgeslagen en terug te vinden is.",
          },
          {
            label: "Inlog, rollen en rechten",
            text: "Wie wat mag zien en doen: klant, medewerker, beheerder.",
          },
          {
            label: "Bedrijfsregels",
            text: "Prijslogica, statussen, uitzonderingen en validatie, vastgelegd in code.",
          },
          {
            label: "E-mail en notificaties",
            text: "Bevestigingen, herinneringen en meldingen bij een statuswijziging.",
          },
          {
            label: "Betalingen en koppelingen",
            text: "Betaalprovider, agenda, boekhouding of een ander systeem dat je al gebruikt.",
          },
        ],
        scopeTitle: "Afhankelijk van scope",
        scope: [
          "Welke onderdelen in de eerste versie zitten en wat later volgt",
          "Koppelingen: alleen mogelijk als het andere systeem een API of export biedt",
          "Een app in de App Store of Play Store naast de webversie",
          "Migratie van bestaande gegevens",
        ],
        approachTitle: "Zo verloopt het traject",
        approach: [
          {
            title: "Intake: het proces op papier",
            text: "We lopen het huidige proces stap voor stap door: wie doet wat, welke regels gelden en waar het vastloopt. Daaruit volgt wat in een eerste versie hoort.",
          },
          {
            title: "Flow en ontwerp",
            text: "Elke stap uitgewerkt in de browser, voor klant én beheerder, zodat je vroeg ziet hoe het werkt op een telefoon.",
          },
          {
            title: "Bouw in delen",
            text: "De kern eerst: het deel dat het meeste handwerk wegneemt. Je test tussentijds met echte situaties.",
          },
          {
            title: "Livegang en uitbreiden",
            text: "Livegang op eigen domein en hosting, met documentatie. Uitbreidingen volgen zodra de basis in gebruik is.",
          },
        ],
        priceNote:
          "Prijs op basis van scope. Na de intake krijg je een voorstel met prijs en planning.",
        ctaTitle: "Een proces dat nu te veel handwerk kost?",
        ctaText:
          "Beschrijf hoe het nu gaat, van eerste contact tot afronding. Je hoort wat een eerste versie moet bevatten.",
        faqTitle: "Veelgestelde vragen",
        faqs: [
          {
            question: "Webapp of een app in de App Store?",
            answer:
              "Meestal begint het als webapp: die werkt op elke telefoon zonder installatie en is sneller uit te breiden. Een app in de stores is zinvol als je pushmeldingen, offline gebruik of functies van de telefoon nodig hebt.",
          },
          {
            question: "Wie beheert de applicatie na oplevering?",
            answer:
              "Jij, via de beheeromgeving. Voor onderhoud, hosting en uitbreidingen spreken we vooraf af wat vast is en wat per aanpassing gaat.",
          },
          {
            question: "Hoe lang duurt een eerste versie?",
            answer:
              "Dat hangt af van het aantal stappen, rollen en koppelingen. In de intake maken we een planning per onderdeel, zodat je weet wat wanneer bruikbaar is.",
          },
        ],
      },
      en: {
        slug: "web-app-development",
        navLabel: "Web application",
        metaTitle: "Web application development",
        metaDescription:
          "Custom web applications, portals and apps: booking systems, client portals, dashboards and admin environments with login, roles and integrations, built around your own process.",
        title: "Web applications, portals and apps around your own process.",
        intro:
          "When a website is not enough because something has to happen, and off-the-shelf software does not fit how you work. We build the application around the process as it runs today, and leave out what you do not use.",
        summary: "Bookings, portals, dashboards and admin.",
        fitTitle: "Fits when",
        fit: [
          "A process runs through phone, email or spreadsheets and customers should be able to do it themselves",
          "Requests, bookings or planning need to come in structured and be traceable",
          "A team or client needs its own environment with login and its own data",
        ],
        buildTitle: "What we build",
        build: [
          "Booking and request systems with status and confirmations",
          "Client portals with login, documents and their own data",
          "Internal portals, planning and dashboards for a team",
          "Admin environments for content, prices or requests",
          "Apps on the phone as an extension of a platform",
        ],
        partsTitle: "What an application can consist of",
        parts: [
          {
            label: "Interface",
            text: "What customers or colleagues see and use, on phone and desktop.",
          },
          {
            label: "Admin environment",
            text: "Where you manage requests, data and settings.",
          },
          {
            label: "Database",
            text: "Where everything is stored in a structured way and can be found again.",
          },
          {
            label: "Login, roles and permissions",
            text: "Who may see and do what: customer, employee, administrator.",
          },
          {
            label: "Business rules",
            text: "Pricing logic, statuses, exceptions and validation, captured in code.",
          },
          {
            label: "Email and notifications",
            text: "Confirmations, reminders and messages when a status changes.",
          },
          {
            label: "Payments and integrations",
            text: "Payment provider, calendar, accounting or another system you already use.",
          },
        ],
        scopeTitle: "Depends on scope",
        scope: [
          "Which parts are in the first version and what follows later",
          "Integrations: only possible if the other system offers an API or export",
          "An app in the App Store or Play Store next to the web version",
          "Migration of existing data",
        ],
        approachTitle: "How the project runs",
        approach: [
          {
            title: "Intake: the process on paper",
            text: "We walk through the current process step by step: who does what, which rules apply and where it gets stuck. That determines what belongs in a first version.",
          },
          {
            title: "Flow and design",
            text: "Every step worked out in the browser, for customer and administrator, so you see early how it works on a phone.",
          },
          {
            title: "Build in parts",
            text: "The core first: the part that removes the most manual work. You test in between with real situations.",
          },
          {
            title: "Launch and extend",
            text: "Launch on your own domain and hosting, with documentation. Extensions follow once the basis is in use.",
          },
        ],
        priceNote:
          "Priced on scope. After the intake you get a proposal with price and schedule.",
        ctaTitle: "A process that costs too much manual work?",
        ctaText:
          "Describe how it works today, from first contact to completion. You hear what a first version should contain.",
        faqTitle: "Frequently asked questions",
        faqs: [
          {
            question: "Web app or an app in the App Store?",
            answer:
              "It usually starts as a web app: it works on every phone without installation and is faster to extend. An app in the stores makes sense when you need push notifications, offline use or phone features.",
          },
          {
            question: "Who manages the application after delivery?",
            answer:
              "You do, through the admin environment. For maintenance, hosting and extensions we agree up front what is fixed and what is charged per change.",
          },
          {
            question: "How long does a first version take?",
            answer:
              "That depends on the number of steps, roles and integrations. During the intake we plan per part, so you know what is usable when.",
          },
        ],
      },
    },
  },
  "3d-configurators": {
    key: "3d-configurators",
    kind: "custom",
    family: "configurators",
    partsLayout: "flow",
    proof: ["flexora-bouw"],
    locale: {
      nl: {
        slug: "3d-configurator",
        navLabel: "3D-configurator",
        metaTitle: "3D-configurator laten maken",
        metaDescription:
          "Een 3D-productconfigurator op maat: opties en maten, live 3D-beeld, prijsberekening, aanvraag- of bestelflow en beheer van opties en prijzen. Gebouwd in eigen code, ook als onderdeel van je website.",
        title:
          "Een 3D-configurator waarin klanten hun product samenstellen en direct de prijs zien.",
        intro:
          "Voor producten met opties, maten en materialen waarvan de prijs afhangt van de samenstelling. De klant doet zelf wat nu een offerte op aanvraag is, binnen de grenzen die jij vastlegt.",
        summary: "Samenstellen, 3D-beeld, prijs en aanvraag.",
        fitTitle: "Past wanneer",
        fit: [
          "Elke variant vraagt nu een aparte prijsopgave",
          "Klanten willen vooraf zien hoe een samenstelling eruitziet en wat die kost",
          "Aanvragen komen onvolledig binnen en kosten navraag",
        ],
        buildTitle: "Wat we bouwen",
        build: [
          "Configurator als onderdeel van je website of als losse omgeving",
          "Prijsindicatie voor bezoekers, of exacte prijs met bestelling en betaling",
          "Opslag van configuraties, zodat klanten later verder kunnen",
          "Koppeling met je offerte- of ordersysteem",
        ],
        partsTitle: "Zo werkt de configurator",
        parts: [
          {
            label: "Opties en maten",
            text: "De klant kiest afmetingen, materialen en uitvoering; alleen combinaties die kunnen, zijn beschikbaar.",
          },
          {
            label: "3D-beeld",
            text: "Elke keuze is direct zichtbaar, ook op een telefoon.",
          },
          {
            label: "Prijsberekening",
            text: "De prijs beweegt mee, opgebouwd uit regels die jij bepaalt: per optie, per meter of per combinatie.",
          },
          {
            label: "Aanvraag of bestelling",
            text: "De samenstelling gaat compleet door als offerteaanvraag of order, met bevestiging per e-mail.",
          },
          {
            label: "Beheer",
            text: "Opties, prijzen en teksten pas je zelf aan, zonder ontwikkelaar.",
          },
        ],
        scopeTitle: "Afhankelijk van scope",
        scope: [
          "3D-modellen: gebaseerd op je bestaande tekeningen of nieuw gemaakt",
          "Prijsregels: eenvoudig per optie, of afhankelijk van maten en combinaties",
          "Betaling in de configurator, of aanvraag met offerte achteraf",
          "Koppeling met CRM, ERP of een ordersysteem",
          "Aantal producttypes in de eerste versie",
        ],
        approachTitle: "Zo verloopt het traject",
        approach: [
          {
            title: "Product en prijsregels",
            text: "We brengen in kaart welke keuzes de klant maakt, wat kan en niet kan, en hoe de prijs precies wordt opgebouwd.",
          },
          {
            title: "3D en interactie",
            text: "De modellen en de bediening werken we uit en testen we op telefoon en desktop, met echte maten en materialen.",
          },
          {
            title: "Flow en beheer",
            text: "Aanvraag- of bestelflow, e-mails en de beheeromgeving voor opties en prijzen.",
          },
          {
            title: "Livegang",
            text: "Op je eigen site en domein. Na livegang stemmen we regels bij op basis van echte aanvragen.",
          },
        ],
        priceNote:
          "Prijs op basis van scope: het aantal producttypes, de prijsregels en de koppelingen bepalen de omvang.",
        ctaTitle: "Een product dat klanten zelf willen samenstellen?",
        ctaText:
          "Stuur wat je verkoopt en welke keuzes een klant maakt. Je hoort wat een eerste versie moet bevatten.",
        faqTitle: "Veelgestelde vragen",
        faqs: [
          {
            question: "Hoe precies is de prijs?",
            answer:
              "Zo precies als de regels die je aanlevert. Je kunt starten met een prijsindicatie en overgaan op een exacte prijs zodra alle regels zijn vastgelegd.",
          },
          {
            question: "Kan de configurator in mijn bestaande website?",
            answer:
              "Ja, als die site door ons is gebouwd of herbouwd wordt. Bij een site op een ander platform draait de configurator op een eigen subdomein, in de huisstijl van de site.",
          },
          {
            question: "Kan ik later opties toevoegen?",
            answer:
              "Ja. Nieuwe opties en prijzen voeg je zelf toe in het beheer. Nieuwe producttypes of andere 3D-modellen zijn een uitbreiding.",
          },
        ],
      },
      en: {
        slug: "3d-configurator",
        navLabel: "3D configurator",
        metaTitle: "3D configurator development",
        metaDescription:
          "A custom 3D product configurator: options and dimensions, live 3D view, price calculation, request or order flow and management of options and prices. Built in custom code, also as part of your website.",
        title:
          "A 3D configurator in which customers compose their product and see the price instantly.",
        intro:
          "For products with options, dimensions and materials where the price depends on the composition. The customer does what is now a quote on request, within the limits you define.",
        summary: "Compose, 3D view, price and request.",
        fitTitle: "Fits when",
        fit: [
          "Every variant currently needs a separate quote",
          "Customers want to see in advance what a composition looks like and costs",
          "Requests come in incomplete and need follow-up questions",
        ],
        buildTitle: "What we build",
        build: [
          "Configurator as part of your website or as a standalone environment",
          "Price indication for visitors, or an exact price with order and payment",
          "Saved configurations, so customers can continue later",
          "Integration with your quoting or order system",
        ],
        partsTitle: "How the configurator works",
        parts: [
          {
            label: "Options and dimensions",
            text: "The customer chooses dimensions, materials and finish; only combinations that are possible are available.",
          },
          {
            label: "3D view",
            text: "Every choice is visible immediately, on a phone as well.",
          },
          {
            label: "Price calculation",
            text: "The price updates as they go, built from rules you define: per option, per metre or per combination.",
          },
          {
            label: "Request or order",
            text: "The composition is sent complete as a quote request or order, with email confirmation.",
          },
          {
            label: "Management",
            text: "You adjust options, prices and copy yourself, without a developer.",
          },
        ],
        scopeTitle: "Depends on scope",
        scope: [
          "3D models: based on your existing drawings or newly made",
          "Pricing rules: simple per option, or dependent on dimensions and combinations",
          "Payment inside the configurator, or a request with a quote afterwards",
          "Integration with CRM, ERP or an order system",
          "Number of product types in the first version",
        ],
        approachTitle: "How the project runs",
        approach: [
          {
            title: "Product and pricing rules",
            text: "We map which choices the customer makes, what is and is not possible, and exactly how the price is built up.",
          },
          {
            title: "3D and interaction",
            text: "We work out the models and the controls and test them on phone and desktop, with real dimensions and materials.",
          },
          {
            title: "Flow and management",
            text: "Request or order flow, emails and the admin environment for options and prices.",
          },
          {
            title: "Launch",
            text: "On your own site and domain. After launch we fine-tune rules based on real requests.",
          },
        ],
        priceNote:
          "Priced on scope: the number of product types, the pricing rules and the integrations determine the size.",
        ctaTitle: "A product customers want to compose themselves?",
        ctaText:
          "Send what you sell and which choices a customer makes. You hear what a first version should contain.",
        faqTitle: "Frequently asked questions",
        faqs: [
          {
            question: "How precise is the price?",
            answer:
              "As precise as the rules you supply. You can start with a price indication and move to an exact price once all rules are captured.",
          },
          {
            question: "Can the configurator go into my existing website?",
            answer:
              "Yes, if that site was built by us or is being rebuilt. For a site on another platform the configurator runs on its own subdomain, in the style of the site.",
          },
          {
            question: "Can I add options later?",
            answer:
              "Yes. You add new options and prices yourself in the admin. New product types or other 3D models are an extension.",
          },
        ],
      },
    },
  },
  "integrations-automation": {
    key: "integrations-automation",
    kind: "custom",
    family: "integrations",
    partsLayout: "layers",
    proof: [],
    locale: {
      nl: {
        slug: "koppelingen-automatisering",
        navLabel: "Koppelingen en automatisering",
        metaTitle: "Koppelingen en automatisering",
        metaDescription:
          "API-koppelingen en automatisering voor je website of applicatie: betalingen, e-mailflows, CRM en ERP, externe API's en interne systemen, zodat gegevens automatisch doorgaan.",
        title: "Koppelingen en automatisering tussen de systemen waar je mee werkt.",
        intro:
          "Een aanvraag die in je CRM belandt, een betaling die een bevestiging en een factuurregel oplevert, een order die in je planning verschijnt. We koppelen je website of applicatie aan de systemen die je al gebruikt en automatiseren de stappen daartussen.",
        summary: "Betalingen, e-mail, CRM/ERP en API's.",
        fitTitle: "Past wanneer",
        fit: [
          "Gegevens worden nu overgetypt van het ene systeem naar het andere",
          "Bevestigingen, herinneringen of facturen gaan handmatig de deur uit",
          "Een bestaand product moet aan iets nieuws gekoppeld worden",
        ],
        buildTitle: "Wat we bouwen",
        build: [
          "Betaalkoppelingen",
          "E-mailflows op basis van status: bevestigingen, herinneringen, notificaties",
          "Koppeling met CRM of ERP",
          "Uitwisseling met externe API's: agenda's, verzendpartijen, boekhouding",
          "Automatische taken op vaste momenten: exports, rapportages, controles",
        ],
        partsTitle: "Waar een koppeling uit bestaat",
        parts: [
          {
            label: "Verbinding",
            text: "Via de API of export van het andere systeem; we controleren vooraf wat die biedt.",
          },
          {
            label: "Vertaling van gegevens",
            text: "Velden en statussen van het ene systeem worden omgezet naar het andere, met validatie.",
          },
          {
            label: "Triggers",
            text: "Wat de koppeling in gang zet: een aanvraag, een betaling, een statuswijziging of een vast tijdstip.",
          },
          {
            label: "Foutafhandeling",
            text: "Wat er gebeurt als het andere systeem niet reageert: opnieuw proberen, melden, vastleggen.",
          },
          {
            label: "Inzicht",
            text: "Een logboek waarin je ziet wat er is verstuurd en wat is mislukt.",
          },
        ],
        scopeTitle: "Afhankelijk van scope",
        scope: [
          "Toegang en accounts bij externe partijen, die jij aanvraagt",
          "Koppeling in één richting of in beide richtingen",
          "Onderhoud als een externe API verandert",
        ],
        approachTitle: "Zo verloopt het traject",
        approach: [
          {
            title: "Inventarisatie",
            text: "Welke systemen, welke gegevens, welke richting, en wat de API van de andere kant toestaat. Daaruit volgt een scope met prijs.",
          },
          {
            title: "Bouw en test",
            text: "We bouwen de koppeling en testen met echte gegevens in een testomgeving, inclusief wat er mis kan gaan.",
          },
          {
            title: "Ingebruikname",
            text: "Livegang, controle op de eerste echte gegevens en overdracht van het logboek.",
          },
        ],
        priceNote:
          "Prijs op basis van scope: het aantal systemen en de richting van de uitwisseling bepalen de omvang.",
        ctaTitle: "Systemen die met elkaar moeten praten?",
        ctaText:
          "Noem welke systemen het zijn en welke gegevens erdoor moeten. Je hoort of het kan en wat het vraagt.",
        faqTitle: "Veelgestelde vragen",
        faqs: [
          {
            question: "Welke systemen kunnen jullie koppelen?",
            answer:
              "Alles met een bruikbare API of export. We noemen vooraf geen lijst van merken; in de inventarisatie bekijken we per systeem wat mogelijk is.",
          },
          {
            question: "Kan dit ook op een website die niet door jullie is gebouwd?",
            answer:
              "Vaak wel, afhankelijk van het platform. Bij een site die wij bouwden of herbouwen is het eenvoudiger, omdat we de code kennen.",
          },
          {
            question: "Is dit los af te nemen, zonder nieuwe website?",
            answer:
              "Ja. Een koppeling of automatisering is een eigen traject en kan naast een bestaande website of applicatie draaien.",
          },
        ],
      },
      en: {
        slug: "integrations-automation",
        navLabel: "Integrations and automation",
        metaTitle: "Integrations and automation",
        metaDescription:
          "API integrations and automation for your website or application: payments, email flows, CRM and ERP, external APIs and internal systems, so data moves on automatically.",
        title: "Integrations and automation between the systems you work with.",
        intro:
          "A request that lands in your CRM, a payment that produces a confirmation and an invoice line, an order that appears in your planning. We connect your website or application to the systems you already use and automate the steps in between.",
        summary: "Payments, email, CRM/ERP and APIs.",
        fitTitle: "Fits when",
        fit: [
          "Data is currently retyped from one system into another",
          "Confirmations, reminders or invoices go out by hand",
          "An existing product has to be connected to something new",
        ],
        buildTitle: "What we build",
        build: [
          "Payment integrations",
          "Email flows based on status: confirmations, reminders, notifications",
          "Integration with CRM or ERP",
          "Exchange with external APIs: calendars, carriers, accounting",
          "Automated tasks at fixed moments: exports, reports, checks",
        ],
        partsTitle: "What an integration consists of",
        parts: [
          {
            label: "Connection",
            text: "Through the API or export of the other system; we check up front what it offers.",
          },
          {
            label: "Data translation",
            text: "Fields and statuses of one system are converted to the other, with validation.",
          },
          {
            label: "Triggers",
            text: "What sets the integration in motion: a request, a payment, a status change or a fixed time.",
          },
          {
            label: "Error handling",
            text: "What happens when the other system does not respond: retry, notify, record.",
          },
          {
            label: "Insight",
            text: "A log in which you see what was sent and what failed.",
          },
        ],
        scopeTitle: "Depends on scope",
        scope: [
          "Access and accounts with external parties, which you request",
          "Integration in one direction or in both",
          "Maintenance when an external API changes",
        ],
        approachTitle: "How the project runs",
        approach: [
          {
            title: "Inventory",
            text: "Which systems, which data, which direction, and what the API on the other side allows. That results in a scope with a price.",
          },
          {
            title: "Build and test",
            text: "We build the integration and test it with real data in a test environment, including what can go wrong.",
          },
          {
            title: "Go-live",
            text: "Launch, a check on the first real data and handover of the log.",
          },
        ],
        priceNote:
          "Priced on scope: the number of systems and the direction of the exchange determine the size.",
        ctaTitle: "Systems that need to talk to each other?",
        ctaText:
          "Name the systems and the data that has to pass between them. You hear whether it is possible and what it takes.",
        faqTitle: "Frequently asked questions",
        faqs: [
          {
            question: "Which systems can you connect?",
            answer:
              "Anything with a usable API or export. We do not list brands up front; during the inventory we look per system at what is possible.",
          },
          {
            question: "Does this also work on a website you did not build?",
            answer:
              "Often, depending on the platform. On a site we built or are rebuilding it is simpler, because we know the code.",
          },
          {
            question: "Can I get this on its own, without a new website?",
            answer:
              "Yes. An integration or automation is its own project and can run alongside an existing website or application.",
          },
        ],
      },
    },
  },
  "redesign-optimization": {
    key: "redesign-optimization",
    kind: "improve",
    family: "existing",
    proof: [],
    locale: {
      nl: {
        slug: "redesign-optimalisatie",
        navLabel: "Redesign en herbouw",
        metaTitle: "Website redesign en herbouw",
        metaDescription:
          "Een bestaande website opnieuw opbouwen in eigen code: betere structuur, snellere techniek en behoud van URL's en vindbaarheid.",
        title: "Redesign en herbouw: je website weer op het niveau van je bedrijf.",
        intro:
          "Als de site niet meer past bij hoe het bedrijf nu werkt. Niet alles hoeft opnieuw: wat goed is blijft, wat achterloopt bouwen we opnieuw op.",
        summary: "Structuur, ontwerp en techniek opnieuw, met behoud van vindbaarheid.",
        fitTitle: "Past wanneer",
        fit: [
          "De site draait op een platform of pagebuilder dat traag of kwetsbaar is geworden",
          "Bezoekers en zoekmachines volgen de structuur niet meer",
          "Je hebt een nieuwe huisstijl of een nieuw aanbod",
        ],
        buildTitle: "Wat we doen",
        build: [
          "Volledige herbouw in eigen code",
          "Structuur en teksten herzien binnen de bestaande huisstijl",
          "Mobiele weergave verbeteren zonder het ontwerp los te laten",
          "Bestaande content en beeld overzetten",
        ],
        scopeTitle: "Afhankelijk van scope",
        scope: [
          "Nieuwe teksten en fotografie",
          "Uitbreidingen die de oude site niet had, zoals een reservering of webshop",
          "Overzetten van een blog met veel artikelen",
          "Migratie van een bestaand CMS naar een beheeromgeving",
        ],
        approachTitle: "Zo verloopt het traject",
        approach: [
          {
            title: "Audit",
            text: "We bekijken de huidige site op structuur, techniek en vindbaarheid en leggen vast wat de herbouw moet oplossen.",
          },
          {
            title: "Structuur en ontwerp",
            text: "Nieuwe paginastructuur en navigatie, uitgewerkt in de browser; teksten scherpen we aan waar nodig.",
          },
          {
            title: "Herbouw en overzetten",
            text: "Bouw in eigen code en migratie van content en beeld.",
          },
          {
            title: "Livegang en controle",
            text: "We zetten de site live en lossen op wat na livegang achterblijft.",
          },
        ],
        priceNote: "Prijs na de audit; die laat zien hoeveel opnieuw moet.",
        ctaTitle: "Je site ontgroeid?",
        ctaText:
          "Stuur de URL. Je krijgt een korte beoordeling van wat we zouden veranderen en wat je kunt behouden.",
        faqTitle: "Veelgestelde vragen",
        faqs: [
          {
            question: "Verlies ik mijn posities in Google?",
            answer:
              "Niet als het goed gebeurt. URL's blijven of krijgen een redirect, titels en beschrijvingen die werken blijven staan, en na livegang controleren we de indexering.",
          },
          {
            question: "Kan het in fasen?",
            answer:
              "Ja. Vaak beginnen we bij de pagina's met het meeste verkeer en werken we van daaruit verder.",
          },
          {
            question: "Kan ik mijn huidige huisstijl houden?",
            answer:
              "Ja. Een herbouw gaat over structuur en techniek; het ontwerp kan binnen de bestaande huisstijl blijven of tegelijk vernieuwd worden.",
          },
        ],
      },
      en: {
        slug: "redesign-optimization",
        navLabel: "Redesign and rebuild",
        metaTitle: "Website redesign and rebuild",
        metaDescription:
          "Rebuilding an existing website in custom code: better structure, faster technology and preserved URLs and rankings.",
        title: "Redesign and rebuild: your website back at the level of your business.",
        intro:
          "When the site no longer fits how the business works today. Not everything has to be redone: what is good stays, what lags behind we rebuild.",
        summary: "Structure, design and technology renewed, keeping findability.",
        fitTitle: "Fits when",
        fit: [
          "The site runs on a platform or page builder that has become slow or vulnerable",
          "Visitors and search engines no longer follow the structure",
          "You have a new brand identity or a new offer",
        ],
        buildTitle: "What we do",
        build: [
          "Full rebuild in custom code",
          "Revising structure and copy within the existing brand identity",
          "Improving the mobile display without letting go of the design",
          "Migrating existing content and imagery",
        ],
        scopeTitle: "Depends on scope",
        scope: [
          "New copy and photography",
          "Extensions the old site did not have, such as a booking flow or webshop",
          "Migrating a blog with many articles",
          "Migration from an existing CMS to an admin environment",
        ],
        approachTitle: "How the project runs",
        approach: [
          {
            title: "Audit",
            text: "We review the current site on structure, technology and findability and record what the rebuild has to solve.",
          },
          {
            title: "Structure and design",
            text: "New page structure and navigation, worked out in the browser; we sharpen copy where needed.",
          },
          {
            title: "Rebuild and migrate",
            text: "Build in custom code and migration of content and imagery.",
          },
          {
            title: "Launch and checks",
            text: "We put the site live and fix what remains after launch.",
          },
        ],
        priceNote: "Priced after the audit, which shows how much has to be redone.",
        ctaTitle: "Outgrown your site?",
        ctaText:
          "Send the URL. You get a short assessment of what we would change and what you can keep.",
        faqTitle: "Frequently asked questions",
        faqs: [
          {
            question: "Will I lose my Google rankings?",
            answer:
              "Not if it is done properly. URLs stay or get a redirect, titles and descriptions that work remain, and after launch we check indexing.",
          },
          {
            question: "Can it be done in phases?",
            answer:
              "Yes. We often start with the pages that get the most traffic and work outward from there.",
          },
          {
            question: "Can I keep my current brand identity?",
            answer:
              "Yes. A rebuild is about structure and technology; the design can stay within the existing identity or be renewed at the same time.",
          },
        ],
      },
    },
  },
  "performance-optimization": {
    key: "performance-optimization",
    kind: "improve",
    family: "existing",
    proof: [],
    locale: {
      nl: {
        slug: "performance",
        navLabel: "Performance en technische optimalisatie",
        metaTitle: "Website performance optimalisatie",
        metaDescription:
          "Laadtijd en Core Web Vitals van een bestaande website meetbaar verbeteren: meting, oorzaken, aanpassingen in code en beeld, hermeting.",
        title: "Performance: een website of applicatie die snel reageert.",
        intro:
          "Nieuwe sites die we bouwen zijn standaard snel. Dit traject is voor een bestaande site of applicatie die traag laadt of traag reageert, en waarvan niemand precies weet waarom.",
        summary: "Meten waar laadtijd weglekt en dat oplossen.",
        fitTitle: "Past wanneer",
        fit: [
          "Slechte Core Web Vitals in Search Console of PageSpeed Insights",
          "Grote afbeeldingen, veel scripts of zware plug-ins",
          "Een webapplicatie die traag reageert op invoer",
          "Een lay-out die verspringt tijdens het laden",
        ],
        buildTitle: "Wat we doen",
        build: [
          "Afbeeldingen en fonts optimaliseren en op het juiste moment laden",
          "Scripts van derden beperken of uitstellen",
          "Rendering en caching verbeteren aan de serverkant",
          "Trage onderdelen van een applicatie herschrijven",
        ],
        scopeTitle: "Afhankelijk van scope",
        scope: [
          "Hosting: wisselen als de huidige omgeving de oorzaak is",
          "Doorlopende monitoring na het traject",
        ],
        approachTitle: "Zo verloopt het traject",
        approach: [
          {
            title: "Meting",
            text: "LCP, INP en CLS op echte pagina's, op mobiel en desktop.",
          },
          {
            title: "Oorzaken en prioriteiten",
            text: "Je krijgt een rapport met wat de meeste tijd kost en welke aanpassing de grootste winst geeft.",
          },
          {
            title: "Aanpassingen",
            text: "In code, beeld en hosting, in overleg over wat we wel en niet aanraken.",
          },
          {
            title: "Hermeting",
            text: "Dezelfde meting opnieuw, zodat het verschil zichtbaar is.",
          },
        ],
        priceNote: "Prijs na de meting; het rapport bepaalt de omvang.",
        ctaTitle: "Weten waarom je site traag is?",
        ctaText:
          "Stuur de URL. We meten en laten zien welke aanpassing de grootste winst oplevert.",
        faqTitle: "Veelgestelde vragen",
        faqs: [
          {
            question: "Gaat het om scores of om echte snelheid?",
            answer:
              "Beide. Scores zijn een middel; het doel is dat bezoekers sneller kunnen doen waarvoor ze kwamen.",
          },
          {
            question: "Kan dit op een WordPress-site?",
            answer:
              "Deels. Beeld, caching en scripts kunnen we meestal verbeteren. Zit de oorzaak in het thema of in plug-ins, dan is een herbouw soms de betere route.",
          },
          {
            question: "Hoe snel is snel genoeg?",
            answer:
              "Google hanteert grenzen per meetwaarde, zoals een LCP onder 2,5 seconden. Die grenzen zijn de ondergrens; daarboven kijken we naar wat bezoekers merken.",
          },
        ],
      },
      en: {
        slug: "performance-optimization",
        navLabel: "Performance and technical optimisation",
        metaTitle: "Website performance optimisation",
        metaDescription:
          "Measurably improve load time and Core Web Vitals of an existing website: measurement, causes, changes in code and imagery, re-measurement.",
        title: "Performance: a website or application that responds fast.",
        intro:
          "New sites we build are fast by default. This track is for an existing site or application that loads or responds slowly, and where nobody knows exactly why.",
        summary: "Measure where load time leaks away and fix it.",
        fitTitle: "Fits when",
        fit: [
          "Poor Core Web Vitals in Search Console or PageSpeed Insights",
          "Large images, many scripts or heavy plugins",
          "A web application that responds slowly to input",
          "A layout that shifts while loading",
        ],
        buildTitle: "What we do",
        build: [
          "Optimising images and fonts and loading them at the right moment",
          "Limiting or deferring third-party scripts",
          "Improving rendering and caching on the server side",
          "Rewriting slow parts of an application",
        ],
        scopeTitle: "Depends on scope",
        scope: [
          "Hosting: switching if the current environment is the cause",
          "Ongoing monitoring after the track",
        ],
        approachTitle: "How the project runs",
        approach: [
          {
            title: "Measurement",
            text: "LCP, INP and CLS on real pages, on mobile and desktop.",
          },
          {
            title: "Causes and priorities",
            text: "You get a report with what costs the most time and which change gives the biggest gain.",
          },
          {
            title: "Changes",
            text: "In code, imagery and hosting, in consultation about what we do and do not touch.",
          },
          {
            title: "Re-measurement",
            text: "The same measurement again, so the difference is visible.",
          },
        ],
        priceNote: "Priced after the measurement; the report determines the size.",
        ctaTitle: "Want to know why your site is slow?",
        ctaText:
          "Send the URL. We measure and show which change delivers the biggest gain.",
        faqTitle: "Frequently asked questions",
        faqs: [
          {
            question: "Is this about scores or about real speed?",
            answer:
              "Both. Scores are a means; the goal is that visitors can do what they came for faster.",
          },
          {
            question: "Can this be done on a WordPress site?",
            answer:
              "Partly. Images, caching and scripts can usually be improved. If the cause is in the theme or plugins, a rebuild is sometimes the better route.",
          },
          {
            question: "How fast is fast enough?",
            answer:
              "Google sets thresholds per metric, such as an LCP under 2.5 seconds. Those thresholds are the floor; above that we look at what visitors notice.",
          },
        ],
      },
    },
  },
};

/* ---------- Families (index composition) ---------- */

type FamilyDetail =
  | { kind: "layers"; label: string; items: string[] }
  | { kind: "flow"; label: string; items: string[] }
  | { kind: "list"; label: string; items: string[] };

type LocalizedFamily = {
  title: string;
  text: string;
  detail?: FamilyDetail;
};

export type ServiceFamily = {
  key: Exclude<ServiceFamilyKey, "existing">;
  scale: "xl" | "lg";
  emphasis?: boolean;
  members: ServiceKey[];
  /** Members shown smaller inside the family. */
  minor?: ServiceKey[];
  locale: Record<Locale, LocalizedFamily>;
};

export const serviceFamilies: ServiceFamily[] = [
  {
    key: "websites",
    scale: "xl",
    members: ["business-websites", "ecommerce-development", "landing-pages"],
    minor: ["landing-pages"],
    locale: {
      nl: {
        title: "Websites en webshops",
        text: "Voor bedrijven die gevonden willen worden, aanvragen willen ontvangen of producten willen verkopen. Van één campagnepagina tot een complete site met shop.",
      },
      en: {
        title: "Websites and webshops",
        text: "For businesses that want to be found, receive enquiries or sell products. From one campaign page to a complete site with shop.",
      },
    },
  },
  {
    key: "applications",
    scale: "xl",
    members: ["web-app-development"],
    locale: {
      nl: {
        title: "Webapplicaties, portalen en apps",
        text: "Voor een proces dat nu via telefoon, e-mail of spreadsheets loopt: reserveringen, klantportalen, planning, dashboards en beheeromgevingen.",
        detail: {
          kind: "layers",
          label: "Bestaat, afhankelijk van de scope, uit",
          items: [
            "Interface",
            "Beheeromgeving",
            "Database",
            "Inlog en rollen",
            "Bedrijfsregels",
            "E-mail en notificaties",
            "Betalingen en koppelingen",
          ],
        },
      },
      en: {
        title: "Web applications, portals and apps",
        text: "For a process that currently runs through phone, email or spreadsheets: bookings, client portals, planning, dashboards and admin environments.",
        detail: {
          kind: "layers",
          label: "Consists, depending on scope, of",
          items: [
            "Interface",
            "Admin environment",
            "Database",
            "Login and roles",
            "Business rules",
            "Email and notifications",
            "Payments and integrations",
          ],
        },
      },
    },
  },
  {
    key: "configurators",
    scale: "lg",
    emphasis: true,
    members: ["3d-configurators"],
    locale: {
      nl: {
        title: "3D-configurators",
        text: "Voor producten met opties, maten en materialen waarvan de prijs afhangt van de samenstelling.",
        detail: {
          kind: "flow",
          label: "Van keuze tot aanvraag",
          items: ["Opties en maten", "3D-beeld", "Prijs", "Aanvraag of bestelling", "Beheer"],
        },
      },
      en: {
        title: "3D configurators",
        text: "For products with options, dimensions and materials where the price depends on the composition.",
        detail: {
          kind: "flow",
          label: "From choice to request",
          items: ["Options and dimensions", "3D view", "Price", "Request or order", "Management"],
        },
      },
    },
  },
  {
    key: "integrations",
    scale: "lg",
    members: ["integrations-automation"],
    locale: {
      nl: {
        title: "Koppelingen en automatisering",
        text: "Voor systemen die nu naast elkaar draaien. Gegevens gaan automatisch van het ene systeem naar het andere, zodat overtypen en handmatig doorsturen verdwijnen.",
        detail: {
          kind: "list",
          label: "Verbindt bijvoorbeeld",
          items: ["Betaalproviders", "E-mail", "CRM en ERP", "Externe API's", "Interne systemen"],
        },
      },
      en: {
        title: "Integrations and automation",
        text: "For systems that currently run side by side. Data moves automatically from one system to the other, so retyping and manual forwarding disappear.",
        detail: {
          kind: "list",
          label: "Connects, for example",
          items: ["Payment providers", "Email", "CRM and ERP", "External APIs", "Internal systems"],
        },
      },
    },
  },
];

/* ---------- Accessors ---------- */

export type LocalizedService = LocalizedServiceContent & {
  key: ServiceKey;
  kind: ServiceKind;
  group: ServiceGroup;
  family: ServiceFamilyKey;
  familyTitle: string;
  partsLayout?: "layers" | "flow";
  proof: ProjectId[];
  path: string;
  overviewPath: string;
  contactPath: string;
};

function familyTitle(locale: Locale, family: ServiceFamilyKey) {
  if (family === "existing") {
    return servicesOverviewContent[locale].improve.title;
  }

  return (
    serviceFamilies.find((item) => item.key === family)?.locale[locale].title ?? ""
  );
}

export function getServicesForLocale(locale: Locale): LocalizedService[] {
  return serviceKeys.map((key) => {
    const definition = serviceDefinitions[key];
    const localized = definition.locale[locale];

    return {
      ...localized,
      key: definition.key,
      kind: definition.kind,
      group: definition.kind === "improve" ? "improve" : "build",
      family: definition.family,
      familyTitle: familyTitle(locale, definition.family),
      partsLayout: definition.partsLayout,
      proof: definition.proof,
      path:
        locale === "en"
          ? `/en/services/${localized.slug}`
          : `/nl/diensten/${localized.slug}`,
      overviewPath: getLocalizedPath(locale, "services"),
      contactPath: getLocalizedPath(locale, "contact"),
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
      "x-default": `/nl/diensten/${definition.locale.nl.slug}`,
    },
  };
}

/* ---------- Services index ---------- */

export const servicesOverviewContent = {
  nl: {
    metaTitle: "Diensten: websites, webshops en maatwerk software",
    metaDescription:
      "Wat YM Creations bouwt: bedrijfswebsites, webshops, webapplicaties, portalen, apps, 3D-configurators en koppelingen, plus herbouw en optimalisatie van bestaande sites. Alles in eigen code.",
    label: "Diensten",
    title: "Van website tot maatwerksoftware.",
    intro: "Het aanbod staat hieronder per soort product, van compact naar uitgebreid.",
    build: {
      title: "Een nieuw digitaal product",
    },
    improve: {
      title: "Een bestaande omgeving verbeteren",
      text: "Snelheid en techniek zijn bij nieuw werk standaard op orde. Voor een site of applicatie die al draait, zijn er twee trajecten.",
    },
    pricing: {
      package: "Vanafprijs, zie tarieven",
      custom: "Op basis van scope",
      improve: {
        "redesign-optimization": "Prijs na audit",
        "performance-optimization": "Prijs na meting",
      } as Partial<Record<ServiceKey, string>>,
    },
    cta: {
      title: "Nog geen idee welk type product past?",
      text: "Beschrijf hoe het nu gaat en waar het vastloopt. Je hoort welk soort oplossing daarbij hoort, en of een eerste versie kleiner kan.",
      hintsLabel: "Handig om te noemen",
      hints: [
        "Wat je bedrijf doet en voor wie",
        "Wat klanten of collega's nu handmatig doen",
        "Welke systemen er al zijn",
      ],
      primaryLabel: "Stuur een bericht",
      secondaryLabel: "Of gebruik de projectplanner",
    },
  },
  en: {
    metaTitle: "Services: websites, webshops and custom software",
    metaDescription:
      "What YM Creations builds: business websites, webshops, web applications, portals, apps, 3D configurators and integrations, plus rebuilds and optimisation of existing sites. All in custom code.",
    label: "Services",
    title: "From website to custom software.",
    intro: "The offer is listed below per type of product, from compact to extensive.",
    build: {
      title: "A new digital product",
    },
    improve: {
      title: "Improving an existing environment",
      text: "Speed and technology are in order by default in new work. For a site or application that is already running, there are two tracks.",
    },
    pricing: {
      package: "Starting price, see pricing",
      custom: "Priced on scope",
      improve: {
        "redesign-optimization": "Priced after audit",
        "performance-optimization": "Priced after measurement",
      } as Partial<Record<ServiceKey, string>>,
    },
    cta: {
      title: "No idea yet which type of product fits?",
      text: "Describe how it works today and where it gets stuck. You hear which kind of solution belongs to that, and whether a first version can be smaller.",
      hintsLabel: "Useful to mention",
      hints: [
        "What your business does and for whom",
        "What customers or colleagues currently do by hand",
        "Which systems already exist",
      ],
      primaryLabel: "Send a message",
      secondaryLabel: "Or use the project planner",
    },
  },
} as const;

export const serviceCollectionSchemaDescription = {
  en: `Services by ${businessInfo.name}: business websites, webshops, landing pages, web applications, portals, apps, 3D configurators, integrations and automation, redesign and performance optimisation.`,
  nl: `Diensten van ${businessInfo.name}: bedrijfswebsites, webshops, landingspagina's, webapplicaties, portalen, apps, 3D-configurators, koppelingen en automatisering, redesign en performance optimalisatie.`,
} as const;
