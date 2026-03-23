import { type Locale } from "@/lib/content/site-content";

export type PricingPackageKey =
  | "starter"
  | "business"
  | "smart"
  | "webshop"
  | "platform";

type PricingAddOn = {
  label: string;
  price: string;
};

type PricingExample = {
  label: string;
  price: string;
};

export type PricingPackage = {
  key: PricingPackageKey;
  title: string;
  price: string;
  positioning: string;
  included: string[];
  addOns: PricingAddOn[];
  dependencyNotes?: string[];
  examples?: PricingExample[];
};

export type PricingPageContent = {
  metaTitle: string;
  metaDescription: string;
  hero: {
    eyebrow: string;
    title: string;
    description: string;
    primaryLabel: string;
    secondaryLabel: string;
  };
  intro: {
    title: string;
    text: string;
  };
  cards: {
    eyebrow: string;
    title: string;
    description: string;
  };
  whyPricesDiffer: {
    title: string;
    text: string;
  };
  howItWorks: {
    title: string;
    text: string;
    steps: string[];
  };
  packageRules: {
    title: string;
    description: string;
    items: Array<{
      title: string;
      allowedLabel: string;
      allowed: string[];
      upgradeLabel: string;
      upgrade: string;
    }>;
  };
  cta: {
    title: string;
    text: string;
    primaryLabel: string;
    secondaryLabel: string;
  };
  disclaimer: string;
  packages: PricingPackage[];
};

const pricingContent: Record<Locale, Omit<PricingPageContent, "packages">> = {
  en: {
    metaTitle: "Pricing",
    metaDescription:
      "Pricing for starter websites, business websites, booking flows, webshops, and custom platforms by YM Creations.",
    hero: {
      eyebrow: "Pricing",
      title: "Different digital products ask for different build depth.",
      description:
        "A starter site, a business website, a booking flow, a webshop, and a custom platform do not carry the same technical scope. YM Creations works with clear base packages and logical upgrades so the investment stays accessible, but still matches what actually needs to be built.",
      primaryLabel: "Discuss your project",
      secondaryLabel: "View packages",
    },
    intro: {
      title: "Premium, but still grounded in logic.",
      text:
        "The goal is not to sell \"just a website\". The goal is to shape the right digital product for the stage your business is in. Smaller websites stay deliberately accessible. More technical systems move into higher tiers where booking logic, payments, admin, dashboards, and integrations can be handled properly.",
    },
    cards: {
      eyebrow: "Base packages",
      title: "Choose the type of project first, then extend it in the right direction.",
      description:
        "Each package starts with a clear foundation. Add-ons stay limited to what belongs in that level. If the project becomes more technical, the next step stays explicit.",
    },
    whyPricesDiffer: {
      title: "Why do prices differ?",
      text:
        "Not every project is the same. A portfolio website with a contact form is much faster to build than a platform with reservations, admin features, API integrations, and user roles. That is why YM Creations works with base packages and logical upgrades that match the real complexity of the project.",
    },
    howItWorks: {
      title: "How does it work?",
      text:
        "First choose the type of website or platform you need. Then only add the features that fit that package. This keeps pricing transparent and makes it clear what you are paying for.",
      steps: [
        "Choose the level of project that fits the product you need.",
        "Add only the extensions that belong in that tier.",
        "If the functionality becomes more technical, the project moves up to the next package.",
      ],
    },
    packageRules: {
      title: "Add-ons stay logical. Platform features stay in platform projects.",
      description:
        "Not every feature belongs in every package. Keeping that boundary clear makes pricing cleaner and keeps the build scope honest.",
      items: [
        {
          title: "Starter Website",
          allowedLabel: "Fits this package",
          allowed: [
            "Extra pages, SEO boost, motion, multilingual setup",
          ],
          upgradeLabel: "Separate trajectory",
          upgrade:
            "Booking, payments, admin logic, user accounts, or heavy integrations belong in Smart Website or Custom Platform work.",
        },
        {
          title: "Business Website",
          allowedLabel: "Fits this package",
          allowed: [
            "SEO growth, admin-lite, stronger email flows, light API integration",
          ],
          upgradeLabel: "Separate trajectory",
          upgrade:
            "Booking flows, status management, dashboards, or pricing logic should move into Smart Website scope.",
        },
        {
          title: "Smart Website / Booking",
          allowedLabel: "Fits this package",
          allowed: [
            "Booking, payments, maps, CRM, reminders, expanded admin",
          ],
          upgradeLabel: "Separate trajectory",
          upgrade:
            "If the project needs multiple user roles, client dashboards, portal behavior, or broader platform logic, it should move into Custom Platform.",
        },
        {
          title: "Custom Platform / Portal / SaaS",
          allowedLabel: "Fits this package",
          allowed: [
            "Accounts, dashboards, permissions, workflows, app-oriented extensions",
          ],
          upgradeLabel: "Important boundary",
          upgrade:
            "Native app work is never treated as a simple lower-tier add-on. It belongs inside a custom product trajectory.",
        },
      ],
    },
    cta: {
      title: "Not sure whether you need Starter, Booking, or Platform?",
      text:
        "A short description is enough. We can usually tell quickly whether your idea fits a simpler website, a smarter conversion flow, or a more serious custom product trajectory.",
      primaryLabel: "Get a recommendation",
      secondaryLabel: "Explore services",
    },
    disclaimer:
      "Prices are starting points. Final scope depends on content depth, integrations, flows, admin requirements, multilingual setup, and whether the project starts from scratch or from an existing system.",
  },
  nl: {
    metaTitle: "Tarieven",
    metaDescription:
      "Tarieven voor starter websites, bedrijfswebsites, booking flows, webshops en maatwerk platforms van YM Creations.",
    hero: {
      eyebrow: "Tarieven",
      title: "Verschillende digitale producten vragen om verschillende bouwdiepte.",
      description:
        "Een startersite, een bedrijfswebsite, een booking flow, een webshop en een maatwerk platform hebben niet dezelfde technische scope. YM Creations werkt daarom met heldere basispakketten en logische upgrades, zodat de investering toegankelijk blijft maar wel past bij wat echt gebouwd moet worden.",
      primaryLabel: "Bespreek je project",
      secondaryLabel: "Bekijk pakketten",
    },
    intro: {
      title: "Premium, maar wel logisch opgebouwd.",
      text:
        "Het doel is niet om \"gewoon een website\" te verkopen. Het doel is om het juiste digitale product te bouwen voor de fase waarin een bedrijf zit. Kleinere websites blijven bewust toegankelijk. Meer technische systemen schuiven door naar hogere trajecten waarin booking-logica, betalingen, admin, dashboards en integraties goed kunnen worden uitgewerkt.",
    },
    cards: {
      eyebrow: "Basispakketten",
      title: "Kies eerst het type project en breid daarna alleen logisch uit.",
      description:
        "Elk pakket start met een duidelijke basis. Add-ons blijven beperkt tot wat binnen dat niveau past. Wordt een project technischer, dan blijft die volgende stap expliciet.",
    },
    whyPricesDiffer: {
      title: "Waarom verschillen prijzen?",
      text:
        "Niet ieder project is hetzelfde. Een portfolio website met een contactformulier is veel sneller te bouwen dan een platform met reserveringen, adminfunctionaliteit, API-integraties en gebruikersrollen. Daarom werkt YM Creations met basispakketten en logische upgrades die aansluiten op de echte complexiteit van het project.",
    },
    howItWorks: {
      title: "Hoe werkt het?",
      text:
        "Kies eerst het type website of platform dat je nodig hebt. Voeg daarna alleen de functies toe die binnen dat pakket passen. Zo blijft pricing transparant en is duidelijk waar je voor betaalt.",
      steps: [
        "Kies het projectniveau dat past bij het product dat je nodig hebt.",
        "Voeg alleen uitbreidingen toe die binnen dat niveau logisch zijn.",
        "Wordt de functionaliteit technischer, dan schuift het project door naar het volgende pakket.",
      ],
    },
    packageRules: {
      title: "Add-ons blijven logisch. Platformfuncties blijven platformwerk.",
      description:
        "Niet iedere functie hoort thuis in ieder pakket. Door die grens helder te houden blijft pricing rustiger en de scope eerlijker.",
      items: [
        {
          title: "Starter Website",
          allowedLabel: "Past binnen dit pakket",
          allowed: [
            "Extra pagina's, SEO-boost, motion, meertalige setup",
          ],
          upgradeLabel: "Apart traject",
          upgrade:
            "Booking, betalingen, admin-logica, gebruikersaccounts of zware integraties horen thuis onder Smart Website of Maatwerk Platform.",
        },
        {
          title: "Business Website",
          allowedLabel: "Past binnen dit pakket",
          allowed: [
            "SEO-groei, admin-lite, sterkere e-mailflows, lichte API-integratie",
          ],
          upgradeLabel: "Apart traject",
          upgrade:
            "Booking flows, statusbeheer, dashboards of prijslogica horen thuis binnen Smart Website-scope.",
        },
        {
          title: "Smart Website / Booking",
          allowedLabel: "Past binnen dit pakket",
          allowed: [
            "Booking, betalingen, maps, CRM, reminders, uitgebreidere admin",
          ],
          upgradeLabel: "Apart traject",
          upgrade:
            "Zijn meerdere gebruikersrollen, klantdashboards, portaalgedrag of bredere platformlogica nodig, dan hoort het project onder Maatwerk Platform.",
        },
        {
          title: "Maatwerk Platform / Portaal / SaaS",
          allowedLabel: "Past binnen dit pakket",
          allowed: [
            "Accounts, dashboards, rechten, workflows en app-achtige uitbreidingen",
          ],
          upgradeLabel: "Belangrijke grens",
          upgrade:
            "Native app-werk wordt nooit als simpele add-on onder een lager pakket geplaatst. Dat hoort binnen een maatwerk producttraject.",
        },
      ],
    },
    cta: {
      title: "Twijfel je tussen Starter, Booking of Platform?",
      text:
        "Een korte beschrijving is genoeg. We kunnen meestal snel aangeven of je idee past bij een simpelere website, een slimmere conversieflow of een serieuzer maatwerk producttraject.",
      primaryLabel: "Vraag om advies",
      secondaryLabel: "Bekijk diensten",
    },
    disclaimer:
      "Prijzen zijn vanaf-prijzen. De uiteindelijke scope hangt af van contentdiepte, integraties, flows, adminvereisten, meertaligheid en of het project vanaf nul wordt opgebouwd of doorbouwt op een bestaand systeem.",
  },
};

export function getPricingPageContent(locale: Locale): PricingPageContent {
  return {
    ...pricingContent[locale],
    packages:
      locale === "nl"
        ? [
            {
              key: "starter",
              title: "Starter Website",
              price: "vanaf €695",
              positioning:
                "Voor een stijlvolle online aanwezigheid zonder complexe functionaliteit.",
              included: [
                "1-5 pagina's",
                "Maatwerk uitstraling",
                "Responsive design",
                "Contactformulier",
                "E-mailnotificatie",
                "SEO-basis",
                "Lichte premium styling",
              ],
              addOns: [
                { label: "Extra pagina", price: "+ €75" },
                { label: "SEO-boost", price: "+ €250" },
                { label: "Extra motion / premium animatie", price: "+ €175" },
                { label: "Meertalige setup", price: "+ €200" },
              ],
            },
            {
              key: "business",
              title: "Business Website",
              price: "vanaf €1.750",
              positioning:
                "Voor bedrijven die meer structuur, meer pagina's en een sterkere digitale aanwezigheid nodig hebben.",
              included: [
                "6-12 pagina's",
                "Sterkere contentstructuur",
                "Maatwerk design",
                "Formulieren",
                "Sterkere SEO-basis",
                "Testimonials, cases en CTA-secties",
                "Contentbeheer-light",
              ],
              addOns: [
                { label: "SEO Growth", price: "+ €350" },
                { label: "Geavanceerdere e-mailflow", price: "+ €200" },
                { label: "Admin-lite / content management", price: "+ €450" },
                { label: "Lichte API-integratie", price: "+ €550" },
                { label: "Extra pagina", price: "+ €75" },
              ],
            },
            {
              key: "smart",
              title: "Smart Website / Booking",
              price: "vanaf €3.250",
              positioning:
                "Voor bedrijven die aanvragen, reserveringen, bevestigingen en licht beheer nodig hebben.",
              included: [
                "Sterke business website-basis",
                "Booking- of aanvraagflow",
                "Bevestigingsmails",
                "Beheer voor boekingen of aanvragen",
                "Basis admin-omgeving",
                "Conversiegerichte structuur",
              ],
              addOns: [
                { label: "Payment integratie", price: "+ €650" },
                {
                  label: "Google Maps / Routes / prijs per km",
                  price: "+ €1.250",
                },
                { label: "CRM- of kalenderintegratie", price: "+ €650" },
                { label: "Uitgebreider admin panel", price: "+ €950" },
                { label: "Reminder e-mails / automatisering", price: "+ €250" },
              ],
              dependencyNotes: [
                "Betalingen zijn alleen logisch binnen booking sites of webshops.",
                "Google Routes / Places / prijs-per-km hoort alleen bij booking- of platformwerk.",
                "Geavanceerde adminrollen horen alleen bij projecten waar admin al onderdeel van de scope is.",
              ],
              examples: [
                { label: "Taxi website basic", price: "vanaf €1.750" },
                { label: "Taxi website met booking flow", price: "vanaf €3.250" },
                {
                  label:
                    "Taxi website met Maps, routes, km-pricing, bevestigingen en admin",
                  price: "€4.750 - €6.500",
                },
              ],
            },
            {
              key: "webshop",
              title: "Webshop",
              price: "vanaf €2.495",
              positioning:
                "Voor bedrijven die professioneel online willen verkopen zonder de setup onnodig zwaar te maken.",
              included: [
                "Productpagina's",
                "Winkelwagen",
                "Checkout",
                "Ordermails",
                "Basisbeheer",
                "Mobiel geoptimaliseerd design",
              ],
              addOns: [
                { label: "Subscriptions / memberships", price: "+ €900" },
                { label: "Geavanceerde filters / search", price: "+ €450" },
                {
                  label: "CRM / ERP / boekhoudintegratie",
                  price: "+ €750",
                },
                { label: "Meertalige setup", price: "+ €200" },
                {
                  label: "Geavanceerde SEO voor categorieën / producten",
                  price: "+ €450",
                },
              ],
            },
            {
              key: "platform",
              title: "Maatwerk Platform / Portaal / SaaS",
              price: "vanaf €6.500",
              positioning:
                "Voor maatwerk workflowsystemen, portals, dashboards en SaaS-gerichte producten.",
              included: [
                "Discovery",
                "Login",
                "Dashboard",
                "Admin panel",
                "Databasefunctionaliteit",
                "Gebruikersrollen en rechten",
                "Maatwerk flows",
              ],
              addOns: [
                { label: "Extra gebruikersrollen", price: "+ €750" },
                { label: "Complexe API-integratie", price: "+ €1.500+" },
                { label: "Reporting / analytics", price: "+ €750" },
                { label: "Notificatiesysteem", price: "+ €350" },
                { label: "Mobile app extension", price: "vanaf + €3.500" },
                { label: "Volledig app-traject", price: "vanaf €8.500" },
              ],
              dependencyNotes: [
                "Login, rollen en dashboards horen altijd in dit pakket.",
                "Echte workflow-gedreven adminsystemen vallen meestal in deze categorie.",
                "Native app development verschijnt hier nooit als simpele add-on voor lagere pakketten.",
              ],
            },
          ]
        : [
            {
              key: "starter",
              title: "Starter Website",
              price: "from €695",
              positioning:
                "For a stylish online presence without complex functionality.",
              included: [
                "1-5 pages",
                "Custom visual direction",
                "Responsive design",
                "Contact form",
                "Email notification",
                "SEO foundation",
                "Light premium styling",
              ],
              addOns: [
                { label: "Extra page", price: "+ €75" },
                { label: "SEO boost", price: "+ €250" },
                { label: "Extra motion / premium animation", price: "+ €175" },
                { label: "Multilingual setup", price: "+ €200" },
              ],
            },
            {
              key: "business",
              title: "Business Website",
              price: "from €1,750",
              positioning:
                "For businesses that need more structure, more pages, and a stronger digital presence.",
              included: [
                "6-12 pages",
                "Stronger content structure",
                "Custom design",
                "Forms",
                "Stronger SEO foundation",
                "Testimonials, case sections, and CTA sections",
                "Light content management",
              ],
              addOns: [
                { label: "SEO Growth", price: "+ €350" },
                { label: "Advanced email flow", price: "+ €200" },
                { label: "Admin-lite / content management", price: "+ €450" },
                { label: "Light API integration", price: "+ €550" },
                { label: "Extra page", price: "+ €75" },
              ],
            },
            {
              key: "smart",
              title: "Smart Website / Booking",
              price: "from €3,250",
              positioning:
                "For businesses that need requests, reservations, confirmations, and light management.",
              included: [
                "Strong business website foundation",
                "Booking or request flow",
                "Confirmation emails",
                "Management for bookings or requests",
                "Basic admin environment",
                "Conversion-focused structure",
              ],
              addOns: [
                { label: "Payment integration", price: "+ €650" },
                {
                  label: "Google Maps / Routes / price per km",
                  price: "+ €1,250",
                },
                { label: "CRM or calendar integration", price: "+ €650" },
                { label: "Expanded admin panel", price: "+ €950" },
                { label: "Reminder emails / automation", price: "+ €250" },
              ],
              dependencyNotes: [
                "Payments are only a logical fit for booking sites or webshops.",
                "Google Routes / Places / price-per-km belongs in booking or platform work.",
                "Advanced admin roles only make sense if admin is already part of the scope.",
              ],
              examples: [
                { label: "Taxi website basic", price: "from €1,750" },
                { label: "Taxi website with booking flow", price: "from €3,250" },
                {
                  label:
                    "Taxi website with Maps, routes, km pricing, confirmations, and admin",
                  price: "€4,750 - €6,500",
                },
              ],
            },
            {
              key: "webshop",
              title: "Webshop",
              price: "from €2,495",
              positioning:
                "For businesses that want to sell online professionally without overcomplicating the setup.",
              included: [
                "Product pages",
                "Cart",
                "Checkout",
                "Order emails",
                "Basic management",
                "Mobile-optimized design",
              ],
              addOns: [
                { label: "Subscriptions / memberships", price: "+ €900" },
                { label: "Advanced filters / search", price: "+ €450" },
                {
                  label: "CRM / ERP / accounting integration",
                  price: "+ €750",
                },
                { label: "Multilingual setup", price: "+ €200" },
                {
                  label: "Advanced SEO for categories / products",
                  price: "+ €450",
                },
              ],
            },
            {
              key: "platform",
              title: "Custom Platform / Portal / SaaS",
              price: "from €6,500",
              positioning:
                "For custom workflow systems, portals, dashboards, and SaaS-oriented products.",
              included: [
                "Discovery",
                "Login",
                "Dashboard",
                "Admin panel",
                "Database functionality",
                "User roles and permissions",
                "Custom flows",
              ],
              addOns: [
                { label: "Extra user roles", price: "+ €750" },
                { label: "Complex API integration", price: "+ €1,500+" },
                { label: "Reporting / analytics", price: "+ €750" },
                { label: "Notification system", price: "+ €350" },
                { label: "Mobile app extension", price: "from + €3,500" },
                { label: "Full app trajectory", price: "from €8,500" },
              ],
              dependencyNotes: [
                "Login, roles, and dashboards always belong in this package.",
                "Real workflow-based admin systems usually belong here.",
                "Native app development should never appear as a simple lower-tier add-on.",
              ],
            },
          ],
  };
}
