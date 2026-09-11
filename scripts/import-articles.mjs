#!/usr/bin/env node
/**
 * Imports the written knowledge library into a Supabase seed migration.
 *
 *   node scripts/import-articles.mjs [source-dir] [--blocks <file>]
 *
 * The markdown files are the editorial source. They are not content the site
 * reads: the site reads `public.articles`, so this turns each file into one
 * row -- title, slug, excerpt, SEO fields, cover image, category, publication
 * date and the ProseMirror document the editor works with -- and writes a
 * migration that inserts them.
 *
 * Three things happen on the way:
 *
 * 1. Markdown becomes the article block model of lib/content/blog.ts, and
 *    then the editor document, using the same tiny inline syntax
 *    (`[label](href)`, `**bold**`, `*italic*`) that doc.ts parses back.
 * 2. Links are rewritten and added. The source files cross-reference each
 *    other as `./slug.md` and point at service URLs that do not exist on this
 *    site; both are corrected here, and the per-article `links` table below
 *    adds the semantic links between clusters.
 * 3. Every internal link is checked against the routes this site actually
 *    has. An unknown one fails the import rather than shipping a 404.
 *
 * Re-running is safe: the migration is keyed on slug and updates in place.
 */

import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const sourceDir = process.argv[2] ?? "/Users/mh/Desktop/YM Creations/articles";
const blocksOutIndex = process.argv.indexOf("--blocks");
const blocksOut = blocksOutIndex > -1 ? process.argv[blocksOutIndex + 1] : null;

/* ------------------------------------------------------------------ plan --
   The publication plan. Three articles a week on Monday, Wednesday and
   Friday, starting Monday 14 September 2026. The order is editorial, not
   alphabetical and not cluster by cluster: every week mixes three different
   clusters, and within a cluster the foundational article always precedes the
   deep dive that leans on it.
*/
const schedule = [
  ["website-of-webshop", "2026-09-14"],
  ["van-excel-naar-maatwerksoftware", "2026-09-16"],
  ["wat-is-een-3d-productconfigurator", "2026-09-18"],
  ["welke-bedrijfsprocessen-moet-je-automatiseren", "2026-09-21"],
  ["wat-kost-een-website-of-webshop", "2026-09-23"],
  ["technische-kwaliteit-website-webapp-beoordelen", "2026-09-25"],
  ["maatwerksoftware-of-standaardsoftware", "2026-09-28"],
  ["wanneer-is-een-3d-productconfigurator-zinvol", "2026-09-30"],
  ["zapier-make-of-maatwerk", "2026-10-02"],
  ["website-vernieuwen-optimaliseren-redesign-herbouwen-replatformen", "2026-10-05"],
  ["wat-kost-een-webapplicatie", "2026-10-07"],
  ["technische-schuld-software", "2026-10-09"],
  ["api-koppeling-laten-maken", "2026-10-12"],
  ["wat-kost-een-3d-productconfigurator", "2026-10-14"],
  ["core-web-vitals-websiteperformance", "2026-10-16"],
  ["klantportaal-laten-maken", "2026-10-19"],
  ["website-koppelen-aan-crm", "2026-10-21"],
  ["technisch-onderhoud-website-webapp-na-livegang", "2026-10-23"],
  ["hoe-werkt-een-3d-productconfigurator-technisch", "2026-10-26"],
  ["website-code-data-eigendom-vendor-lock-in", "2026-10-28"],
];

/** The cluster each source file declares, as the category the site stores. */
const categoryByCluster = {
  "3D-configurators": "configurators",
  "Webapplicaties, klantportalen & maatwerksoftware": "webapplicaties",
  "Automatisering & koppelingen": "automatisering",
  "Websites & webshops": "websites",
  "Digitale techniek & strategie": "techniek",
};

/* ----------------------------------------------------------------- links --
   Routes an internal link may point at. Anything else is a mistake, and the
   import says so instead of publishing it.
*/
const servicePaths = [
  "/nl/diensten/bedrijfswebsite",
  "/nl/diensten/webshop-laten-maken",
  "/nl/diensten/landingspagina",
  "/nl/diensten/webapplicatie-laten-maken",
  "/nl/diensten/3d-configurator",
  "/nl/diensten/koppelingen-automatisering",
  "/nl/diensten/redesign-optimalisatie",
  "/nl/diensten/performance",
];

const staticPaths = [
  "/nl",
  "/nl/diensten",
  "/nl/projecten",
  "/nl/tarieven",
  "/nl/projectplanner",
  "/nl/werkwijze",
  "/nl/contact",
  "/nl/blog",
];

/** Articles that were already live before this library was imported. */
const existingArticles = [
  "wat-kost-een-maatwerk-website-in-2026",
  "checklist-launch-ready-website-seo-performance",
  "webapplicatie-laten-maken-stappenplan",
  "inp-uitgelegd-hoe-maak-je-een-site-echt-responsief",
];

const knownPaths = new Set([
  ...servicePaths,
  ...staticPaths,
  ...existingArticles.map((slug) => `/nl/blog/${slug}`),
  ...schedule.map(([slug]) => `/nl/blog/${slug}`),
]);

/* ----------------------------------------------------------------- covers --
   Every article gets a cover image, drawn from its own subject (see
   scripts/make-article-covers.mjs). The alt text describes the drawing, not
   the article: a reader who cannot see it loses nothing from the argument.
*/
const covers = {
  "website-of-webshop":
    "Twee routes naast elkaar: een website die eindigt bij een aanvraag, en een webshop die doorloopt via checkout en betaling naar fulfilment.",
  "van-excel-naar-maatwerksoftware":
    "Een raster van spreadsheetcellen dat overgaat in losse, verbonden bedrijfsobjecten.",
  "wat-is-een-3d-productconfigurator":
    "Een blokkenreeks van productdefinitie naar keuze, regels en 3D-weergave, met de 3D-laag als laatste stap.",
  "welke-bedrijfsprocessen-moet-je-automatiseren":
    "Een matrix van waarde tegen complexiteit, met vier vakken waarin één vak is gemarkeerd als eerste kandidaat.",
  "wat-kost-een-website-of-webshop":
    "Gestapelde balken die scopeonderdelen voorstellen: van strategie en design tot migratie, SEO en onderhoud.",
  "technische-kwaliteit-website-webapp-beoordelen":
    "Een reeks meetstaven voor onderhoudbaarheid, architectuur, security, tests en herstelbaarheid.",
  "maatwerksoftware-of-standaardsoftware":
    "Vijf kolommen naast elkaar: SaaS, CMS, low-code, maatwerk en een hybride vorm die twee ervan combineert.",
  "wanneer-is-een-3d-productconfigurator-zinvol":
    "Vier assen die samenkomen in één punt: productcomplexiteit, visualisatiebehoefte, herhaalbaar saleswerk en formaliseerbare regels.",
  "zapier-make-of-maatwerk":
    "Een weegschaal tussen kant-en-klare workflowblokken en zelfgeschreven integratiecode.",
  "website-vernieuwen-optimaliseren-redesign-herbouwen-replatformen":
    "Vier ingrepen van klein naar groot: optimaliseren, redesignen, replatformen en volledig herbouwen.",
  "wat-kost-een-webapplicatie":
    "Rollen, workflows en integraties als drie assen van een raster dat snel voller wordt naarmate ze elkaar kruisen.",
  "technische-schuld-software":
    "Een lijn die vlak begint en steeds steiler omhoog loopt: de oplopende kosten van uitgestelde technische keuzes.",
  "api-koppeling-laten-maken":
    "Twee systemen met daartussen een keten van authenticatie, verwerking, monitoring en herstel.",
  "wat-kost-een-3d-productconfigurator":
    "Twee configurators die er aan de buitenkant gelijk uitzien, met daaronder een sterk verschillend aantal lagen.",
  "core-web-vitals-websiteperformance":
    "Drie meters naast elkaar voor laadtijd, interactierespons en visuele stabiliteit.",
  "klantportaal-laten-maken":
    "Een afgeschermde omgeving waarin projectstatus, documenten en aanvragen uit meerdere bronsystemen samenkomen.",
  "website-koppelen-aan-crm":
    "Een formulierinzending die via validatie en een lookup uitkomt bij contact, bedrijf en deal in een CRM.",
  "technisch-onderhoud-website-webapp-na-livegang":
    "Vier onderhoudslagen boven elkaar: beschikbaarheid, herstel, gezondheid en veranderbaarheid.",
  "hoe-werkt-een-3d-productconfigurator-technisch":
    "De lagen van een configurator onder elkaar: interface, configuratiestate, regels, prijs, renderer en backend.",
  "website-code-data-eigendom-vendor-lock-in":
    "Een sleutelring met labels voor code, data, domein, hosting, accounts en documentatie.",
};

/* ------------------------------------------------------------- rewriting --
   Per-article edits. Each entry is [find, replace] and must match exactly
   once; a miss fails the import, so an edited source file cannot silently
   stop being linked.

   The rule behind the added links: an article links to a neighbour where the
   text already makes the connection, never as a list of "related reading"
   glued to the end. Links that point forward in the plan are allowed -- the
   renderer shows them as plain text until the target is live -- but most
   links point at articles that are already published on that date, so the
   library reads as finished from the first week on.
*/
/* --------------------------------------------------------- metadata --
   Snippet copy, where the frontmatter's own wording is not the best thing to
   put in a search result.

   The markdown files stay the editorial source; this only overrides
   `seo_title` and `meta_description`, which are not article text but the two
   lines a reader sees before deciding to click. Three reasons appear here:
   a description that runs past what a result shows and loses its point in
   the truncation, a title whose hook repeats the first clause of its own
   description, and a wording that is simply wrong -- "rebuild" among four
   Dutch terms, "portal" where the rest of the site writes "portaal",
   "website onderhoud" where Dutch writes one word.

   Nothing here changes the article, its excerpt, its slug or its date.
*/
const metadata = {
  "website-of-webshop": {
    metaDescription:
      "Website of webshop? Wanneer een bedrijfswebsite met aanvraagflow volstaat, wanneer een catalogus past en wanneer je echt een checkout nodig hebt.",
  },
  "van-excel-naar-maatwerksoftware": {
    seoTitle: "Wanneer vervang je Excel door maatwerksoftware? | YM Creations",
    metaDescription:
      "Wanneer is een spreadsheet nog prima en wanneer wordt het een procesprobleem? Herken het omslagpunt naar een koppeling of naar maatwerksoftware.",
  },
  "welke-bedrijfsprocessen-moet-je-automatiseren": {
    metaDescription:
      "Niet elk repetitief proces is een goede kandidaat. Beoordeel processtabiliteit, brondata, waarde en herstelpad \u2014 en wanneer je beter niet automatiseert.",
  },
  "technische-kwaliteit-website-webapp-beoordelen": {
    metaDescription:
      "Je kunt de code meestal niet zelf lezen. Toets een website of webapp dan op architectuur, security, tests, herstelbaarheid en overdraagbaarheid.",
  },
  "maatwerksoftware-of-standaardsoftware": {
    metaDescription:
      "SaaS, WordPress, low-code, maatwerk of hybride? Vergelijk op procesfit, snelheid, integraties en eigenaarschap \u2014 de beste oplossing is vaak kleiner.",
  },
  "wanneer-is-een-3d-productconfigurator-zinvol": {
    metaDescription:
      "Wanneer loont een 3D-productconfigurator? Toets productvariatie, visualisatiebehoefte, saleswerk en productregels \u2014 inclusief wanneer 2D beter past.",
  },
  "zapier-make-of-maatwerk": {
    metaDescription:
      "Zapier, Make of eigen code? Kies per proces op kritikaliteit, herstelbaarheid en beheerlast, niet op welke oplossing het professioneelst klinkt.",
  },
  "website-vernieuwen-optimaliseren-redesign-herbouwen-replatformen": {
    seoTitle: "Website vernieuwen: wat is de juiste ingreep? | YM Creations",
  },
  "wat-kost-een-webapplicatie": {
    metaDescription:
      "De prijs van een webapplicatie zit niet in het aantal schermen, maar in rollen, workflows, integraties en migratie. Zo bepaal je een scope die klopt.",
  },
  "technische-schuld-software": {
    seoTitle: "Technische schuld in software: wanneer wordt het duur? | YM Creations",
    metaDescription:
      "Technische schuld is niet hetzelfde als slechte code. Wanneer een snelle keuze verstandig is, wanneer de rente oploopt en hoe je het als ondernemer herkent.",
  },
  "api-koppeling-laten-maken": {
    metaDescription:
      "Een API-koppeling laten maken? Wat een integratie betrouwbaar maakt zit niet in de API-call, maar in eigenaarschap, retries, monitoring en herstel.",
  },
  "core-web-vitals-websiteperformance": {
    metaDescription:
      "Wat LCP, INP en CLS meten, hoe je ze meet en wanneer optimaliseren loont. Zonder de mythe dat een groene score vanzelf rankings of conversie oplevert.",
  },
  "klantportaal-laten-maken": {
    metaDescription:
      "Een klantportaal laten maken? Wanneer selfservice waarde toevoegt, welke data en koppelingen daarvoor nodig zijn, en wanneer een portaal te zwaar is.",
  },
  "technisch-onderhoud-website-webapp-na-livegang": {
    seoTitle: "Websiteonderhoud na livegang: wat moet er gebeuren? | YM Creations",
    metaDescription:
      "Onderhoud is meer dan updates installeren. Wat updates, backups, monitoring en herstel na livegang betekenen, en wie waarvoor verantwoordelijk is.",
  },
  "website-code-data-eigendom-vendor-lock-in": {
    metaDescription:
      "Betalen voor een website maakt je nog niet onafhankelijk. Wat je rond code, data, domein, accounts en overdracht regelt v\u00f3\u00f3r je begint.",
  },
};

/* ------------------------------------------------------- service links --
   One contextual link per article to the service it belongs to, placed in the
   closing argument rather than pasted underneath it. The related-services
   navigation and the call to action on the article page already exist; this
   is the link inside the reasoning, where a reader who has just been
   convinced is actually looking.
*/
const serviceLinks = {
  "website-of-webshop": [
    [
      "De professionele keuze is de kleinste digitale oplossing die het commerciële proces betrouwbaar ondersteunt.",
      "De professionele keuze is de kleinste digitale oplossing die het commerciële proces betrouwbaar ondersteunt. Praktisch splitst dat zich bij ons in een [bedrijfswebsite](/nl/diensten/bedrijfswebsite) of een [webshop](/nl/diensten/webshop-laten-maken).",
    ],
  ],
  "van-excel-naar-maatwerksoftware": [
    [
      "Maatwerksoftware wordt interessant wanneer een bedrijf een **structureel, terugkerend en waardevol procesprobleem** heeft dat niet goed genoeg door die lichtere opties wordt opgelost.",
      "Maatwerksoftware wordt interessant wanneer een bedrijf een **structureel, terugkerend en waardevol procesprobleem** heeft dat niet goed genoeg door die lichtere opties wordt opgelost. Dat is het punt waarop een [maatwerk webapplicatie](/nl/diensten/webapplicatie-laten-maken) in beeld komt.",
    ],
  ],
  "wat-is-een-3d-productconfigurator": [
    [
      "Dat is het verschil tussen een interactieve 3D-demo en een digitaal product dat onderdeel kan worden van een serieus verkoopproces.",
      "Dat is het verschil tussen een interactieve 3D-demo en een digitaal product dat onderdeel kan worden van een serieus verkoopproces. Zo bouwen we een [3D-configurator](/nl/diensten/3d-configurator) ook op: eerst product- en prijsregels, daarna de weergave.",
    ],
  ],
  "welke-bedrijfsprocessen-moet-je-automatiseren": [
    [
      "Als meerdere systemen onderdeel van dat proces worden, verschuift de volgende vraag naar integratiearchitectuur: source of truth, synchronisatie, retries, idempotency en monitoring.",
      "Als meerdere systemen onderdeel van dat proces worden, verschuift de volgende vraag naar integratiearchitectuur: source of truth, synchronisatie, retries, idempotency en monitoring. Dat is het werk achter [koppelingen en automatisering](/nl/diensten/koppelingen-automatisering).",
    ],
  ],
  "wat-kost-een-website-of-webshop": [
    [
      "Als die scope duidelijk is, kun je offertes inhoudelijk vergelijken en krijgt de prijs pas echte betekenis.",
      "Als die scope duidelijk is, kun je offertes inhoudelijk vergelijken en krijgt de prijs pas echte betekenis. Wat er in een [bedrijfswebsite](/nl/diensten/bedrijfswebsite) of [webshop](/nl/diensten/webshop-laten-maken) zit, staat per dienst uitgeschreven.",
    ],
  ],
  "technische-kwaliteit-website-webapp-beoordelen": [
    [
      "De sterkste technische basis is een systeem dat past bij het huidige bedrijfsprobleem, voldoende ruimte laat voor realistische groei en zonder onnodige complexiteit beheersbaar blijft.",
      "De sterkste technische basis is een systeem dat past bij het huidige bedrijfsprobleem, voldoende ruimte laat voor realistische groei en zonder onnodige complexiteit beheersbaar blijft. Voor een site of applicatie die al draait, begint dat meestal bij [redesign en optimalisatie](/nl/diensten/redesign-optimalisatie).",
    ],
  ],
  "maatwerksoftware-of-standaardsoftware": [
    [
      "Pas wanneer het resterende proces bedrijfsspecifiek, structureel en waardevol genoeg is, wordt volledig maatwerk logisch.",
      "Pas wanneer het resterende proces bedrijfsspecifiek, structureel en waardevol genoeg is, wordt volledig maatwerk logisch. Dan gaat het over een [webapplicatie op maat](/nl/diensten/webapplicatie-laten-maken), meestal naast de systemen die al draaien.",
    ],
  ],
  "wanneer-is-een-3d-productconfigurator-zinvol": [
    [
      "Pas wanneer productlogica, visualisatie en bedrijfsproces echt samenkomen, wordt een 3D-productconfigurator een serieuze kandidaat.",
      "Pas wanneer productlogica, visualisatie en bedrijfsproces echt samenkomen, wordt een 3D-productconfigurator een serieuze kandidaat. Wat er dan gebouwd wordt, staat bij [3D-configurator](/nl/diensten/3d-configurator).",
    ],
  ],
  "zapier-make-of-maatwerk": [
    [
      "Dat levert een veel betere beslissing op dan een algemene voorkeur voor één toolcategorie.",
      "Dat levert een veel betere beslissing op dan een algemene voorkeur voor één toolcategorie. Het maatwerkdeel daarvan valt onder [koppelingen en automatisering](/nl/diensten/koppelingen-automatisering).",
    ],
  ],
  "website-vernieuwen-optimaliseren-redesign-herbouwen-replatformen": [
    [
      "Dat is uiteindelijk een betere basis voor een website-investering dan simpelweg besluiten dat de huidige site “oud” is.",
      "Dat is uiteindelijk een betere basis voor een website-investering dan simpelweg besluiten dat de huidige site “oud” is. Voor de kleinere ingrepen is er [redesign en optimalisatie](/nl/diensten/redesign-optimalisatie); voor een volledige herbouw een nieuwe [bedrijfswebsite](/nl/diensten/bedrijfswebsite).",
    ],
  ],
  "wat-kost-een-webapplicatie": [
    [
      "En pas na een realistische scope heeft een prijs betekenis.",
      "En pas na een realistische scope heeft een prijs betekenis. Hoe zo'n traject verloopt, staat bij [webapplicatie laten maken](/nl/diensten/webapplicatie-laten-maken).",
    ],
  ],
  "technische-schuld-software": [
    [
      "Dat is uiteindelijk de kern van technische schuld: snelheid vandaag is alleen waardevol als je er morgen niet disproportioneel voor hoeft te betalen.",
      "Dat is uiteindelijk de kern van technische schuld: snelheid vandaag is alleen waardevol als je er morgen niet disproportioneel voor hoeft te betalen. Bestaande code gericht opruimen hoort bij [redesign en optimalisatie](/nl/diensten/redesign-optimalisatie).",
    ],
  ],
  "api-koppeling-laten-maken": [
    [
      "Dat is uiteindelijk wat bepaalt of een integratie betrouwbaar genoeg is om onderdeel te worden van een serieus bedrijfsproces.",
      "Dat is uiteindelijk wat bepaalt of een integratie betrouwbaar genoeg is om onderdeel te worden van een serieus bedrijfsproces. Dat werk zit bij [koppelingen en automatisering](/nl/diensten/koppelingen-automatisering).",
    ],
  ],
  "wat-kost-een-3d-productconfigurator": [
    [
      "Dat is de scope die de ontwikkelkosten bepaalt.",
      "Dat is de scope die de ontwikkelkosten bepaalt. Welke stappen daar bij een [3D-configurator](/nl/diensten/3d-configurator) onder vallen, staat op de dienstpagina.",
    ],
  ],
  "core-web-vitals-websiteperformance": [
    [
      "Dat is het verschil tussen scoreoptimalisatie en daadwerkelijk betere software.",
      "Dat is het verschil tussen scoreoptimalisatie en daadwerkelijk betere software. Gericht meten en verbeteren is waar [performance optimalisatie](/nl/diensten/performance) over gaat.",
    ],
  ],
  "klantportaal-laten-maken": [
    [
      "Als daar een duidelijk antwoord op bestaat en de achterliggende data betrouwbaar is, kan een klantportaal een sterke digitale proceslaag worden.",
      "Als daar een duidelijk antwoord op bestaat en de achterliggende data betrouwbaar is, kan een klantportaal een sterke digitale proceslaag worden. Een portaal valt bij ons onder [webapplicatie laten maken](/nl/diensten/webapplicatie-laten-maken).",
    ],
  ],
  "website-koppelen-aan-crm": [
    [
      "> Welke informatie vertegenwoordigt deze aanvraag, waar hoort die thuis en wie is eigenaar van die data?",
      "> Welke informatie vertegenwoordigt deze aanvraag, waar hoort die thuis en wie is eigenaar van die data?\n\nHet bouwen en beheren daarvan valt onder [koppelingen en automatisering](/nl/diensten/koppelingen-automatisering).",
    ],
  ],
  "technisch-onderhoud-website-webapp-na-livegang": [
    [
      "Hij moet ook maanden en jaren later veilig gewijzigd, bewaakt en hersteld kunnen worden.",
      "Hij moet ook maanden en jaren later veilig gewijzigd, bewaakt en hersteld kunnen worden. Voor sites en applicaties die al draaien hoort dat bij [redesign en optimalisatie](/nl/diensten/redesign-optimalisatie).",
    ],
  ],
  "hoe-werkt-een-3d-productconfigurator-technisch": [
    [
      "Pas daarna komt de keuze hoe die waarheid het beste in 3D wordt weergegeven.",
      "Pas daarna komt de keuze hoe die waarheid het beste in 3D wordt weergegeven. Zo is een [3D-configurator](/nl/diensten/3d-configurator) bij ons ook opgebouwd.",
    ],
  ],
  "website-code-data-eigendom-vendor-lock-in": [
    [
      "Het is juist een teken dat de samenwerking professioneel is ingericht.",
      "Het is juist een teken dat de samenwerking professioneel is ingericht. Voor een [maatwerk webapplicatie](/nl/diensten/webapplicatie-laten-maken) of [bedrijfswebsite](/nl/diensten/bedrijfswebsite) hoort die afspraak bij de opdracht, niet bij het afscheid.",
    ],
  ],
};

const links = {
  "website-of-webshop": [
    [
      "Dan kan een productconfigurator onderdeel worden van het bestel- of offertetraject.",
      "Dan kan een [productconfigurator](/nl/blog/wat-is-een-3d-productconfigurator) onderdeel worden van het bestel- of offertetraject.",
    ],
    [
      "Dan verschuift de oplossing richting een klantportaal met commercefunctionaliteit.",
      "Dan verschuift de oplossing richting een [klantportaal](/nl/blog/klantportaal-laten-maken) met commercefunctionaliteit.",
    ],
    [
      "Daarom wordt technische SEO belangrijker.",
      "Daarom wordt technische SEO belangrijker. De [checklist voor een launch-ready website](/nl/blog/checklist-launch-ready-website-seo-performance) loopt de technische punten langs die daarbij horen.",
    ],
  ],
  "van-excel-naar-maatwerksoftware": [
    [
      "Een API-koppeling of workflowautomatisering kan het handmatige overdrachtswerk al grotendeels oplossen zonder een nieuwe applicatie te bouwen.",
      "Een [API-koppeling](/nl/blog/api-koppeling-laten-maken) of workflowautomatisering kan het handmatige overdrachtswerk al grotendeels oplossen zonder een nieuwe applicatie te bouwen.",
    ],
    [
      "Je behoudt dan gespecialiseerde standaardsoftware en lost alleen de ontbrekende overdracht op.",
      "Je behoudt dan gespecialiseerde standaardsoftware en lost alleen de ontbrekende overdracht op. Welke processen zich daarvoor lenen, staat in [welke bedrijfsprocessen je wel en niet moet automatiseren](/nl/blog/welke-bedrijfsprocessen-moet-je-automatiseren).",
    ],
    [
      "Schermontwerp komt pas nadat het proces voldoende begrepen is.",
      "Schermontwerp komt pas nadat het proces voldoende begrepen is. Het [stappenplan voor een webapplicatie](/nl/blog/webapplicatie-laten-maken-stappenplan) loopt die volgorde stap voor stap na.",
    ],
  ],
  "wat-is-een-3d-productconfigurator": [
    [
      "De precieze kosten- en prijsarchitectuur valt buiten de scope van dit artikel. Daarvoor is een afzonderlijke verdieping logischer.",
      "De precieze kosten- en prijsarchitectuur valt buiten de scope van dit artikel. Daarvoor is [wat een 3D-productconfigurator kost](/nl/blog/wat-kost-een-3d-productconfigurator) een logischer vertrekpunt.",
    ],
    [
      "Toch is 3D niet automatisch de beste keuze. Wanneer alleen een kleurvlak verandert of het product uit een paar vaste varianten bestaat, kan een 2D-oplossing duidelijker en eenvoudiger zijn.",
      "Toch is 3D niet automatisch de beste keuze. Wanneer alleen een kleurvlak verandert of het product uit een paar vaste varianten bestaat, kan een 2D-oplossing duidelijker en eenvoudiger zijn — of zelfs een gewone productpagina, zoals in [website of webshop?](/nl/blog/website-of-webshop) staat beschreven.",
    ],
    [
      "Bij uitgebreidere oplossingen komen daar bijvoorbeeld een backend, database, beheeromgeving, prijsberekening en koppelingen met CRM, ERP of offertesystemen bij.",
      "Bij uitgebreidere oplossingen komen daar bijvoorbeeld een backend, database, beheeromgeving, prijsberekening en [koppelingen met CRM, ERP of offertesystemen](/nl/blog/api-koppeling-laten-maken) bij.",
    ],
  ],
  "welke-bedrijfsprocessen-moet-je-automatiseren": [
    [
      "Dan kan automatisering interessant zijn, maar alleen nadat duidelijk is welke versie uiteindelijk leidend moet zijn.",
      "Dan kan automatisering interessant zijn, maar alleen nadat duidelijk is welke versie uiteindelijk leidend moet zijn. Wanneer een spreadsheet het proces volledig is gaan dragen, gaat het over [Excel vervangen door software](/nl/blog/van-excel-naar-maatwerksoftware).",
    ],
    [
      "De technische uitwerking hoort in een apart artikel over website–CRM-integraties.",
      "De technische uitwerking staat in [website koppelen aan CRM](/nl/blog/website-koppelen-aan-crm).",
    ],
  ],
  "wat-kost-een-website-of-webshop": [
    [
      "Dat maakt een webshop meestal complexer dan een gewone bedrijfswebsite.",
      "Dat maakt een webshop meestal complexer dan een gewone bedrijfswebsite. Of je die laag werkelijk nodig hebt, is een procesvraag: zie [website of webshop?](/nl/blog/website-of-webshop).",
    ],
    [
      "Twee offertes met dezelfde naam “bedrijfswebsite” kunnen dus totaal verschillende projecten beschrijven.",
      "Twee offertes met dezelfde naam “bedrijfswebsite” kunnen dus totaal verschillende projecten beschrijven. [Wat een maatwerk website kost](/nl/blog/wat-kost-een-maatwerk-website-in-2026) gaat dieper in op wat die scope voor een website zonder webshop betekent.",
    ],
    [
      "Als een bestaande website organisch verkeer heeft, is dit geen optionele afwerking.",
      "Als een bestaande website organisch verkeer heeft, is dit geen optionele afwerking. De [checklist voor een launch-ready website](/nl/blog/checklist-launch-ready-website-seo-performance) noemt de punten die hierbij horen.",
    ],
    [
      "Een eenvoudige statische website heeft andere uitdagingen dan een webshop met veel dynamische data en externe apps.",
      "Een eenvoudige statische website heeft andere uitdagingen dan een webshop met veel dynamische data en externe apps. [Core Web Vitals en websiteperformance](/nl/blog/core-web-vitals-websiteperformance) legt uit welke metingen daarbij zinvol zijn.",
    ],
    [
      "Een bidirectionele koppeling met meerdere statussen en uitzonderingen is veel zwaarder.",
      "Een bidirectionele koppeling met meerdere statussen en uitzonderingen is veel zwaarder; [wat een API-koppeling betrouwbaar maakt](/nl/blog/api-koppeling-laten-maken) laat zien waar die zwaarte vandaan komt.",
    ],
  ],
  "technische-kwaliteit-website-webapp-beoordelen": [
    [
      "Daarom moet technische kwaliteit ook worden beoordeeld op:",
      "Een spreadsheet die een bedrijfsproces is gaan dragen laat goed zien wat er dan misgaat; zie [van Excel en workarounds naar software](/nl/blog/van-excel-naar-maatwerksoftware).\n\nDaarom moet technische kwaliteit ook worden beoordeeld op:",
    ],
    [
      "Hoe hoger het risico, hoe meer technische discipline logisch wordt.",
      "Hoe hoger het risico, hoe meer technische discipline logisch wordt. Diezelfde afweging bepaalt een groot deel van de scope in [wat een website of webshop kost](/nl/blog/wat-kost-een-website-of-webshop).",
    ],
  ],
  "maatwerksoftware-of-standaardsoftware": [
    [
      "De relevante vraag is welke securitymaatregelen passen bij het risico.",
      "De relevante vraag is welke securitymaatregelen passen bij het risico; [hoe je technische kwaliteit beoordeelt](/nl/blog/technische-kwaliteit-website-webapp-beoordelen) geeft daar een kader voor.",
    ],
    [
      "Een goede standaardoplossing met slechte integratiemogelijkheden kan alsnog veel handwerk veroorzaken.",
      "Een goede standaardoplossing met slechte integratiemogelijkheden kan alsnog veel handwerk veroorzaken. Welk handwerk zich laat automatiseren, staat in [welke bedrijfsprocessen je moet automatiseren](/nl/blog/welke-bedrijfsprocessen-moet-je-automatiseren).",
    ],
    [
      "Lock-in verdwijnt dus niet.",
      "Lock-in verdwijnt dus niet. Wat je per onderdeel moet vastleggen, staat in [van wie je website, code, data en accounts zijn](/nl/blog/website-code-data-eigendom-vendor-lock-in).",
    ],
  ],
  "wanneer-is-een-3d-productconfigurator-zinvol": [
    [
      "De grootste waarde ontstaat dan niet alleen doordat de bezoeker iets in 3D ziet, maar doordat dezelfde configuratie niet op meerdere plekken opnieuw hoeft te worden geïnterpreteerd.",
      "De grootste waarde ontstaat dan niet alleen doordat de bezoeker iets in 3D ziet, maar doordat dezelfde configuratie niet op meerdere plekken opnieuw hoeft te worden geïnterpreteerd. Dat is dezelfde afweging als bij [andere bedrijfsprocessen die je wel of niet automatiseert](/nl/blog/welke-bedrijfsprocessen-moet-je-automatiseren).",
    ],
    [
      "Een normale productpagina of webshop kan dan effectiever zijn.",
      "Een normale productpagina of webshop kan dan effectiever zijn; [website of webshop?](/nl/blog/website-of-webshop) helpt die vorm te bepalen.",
    ],
  ],
  "zapier-make-of-maatwerk": [
    [
      "Dan schuift de oplossing richting een eigen bedrijfsapplicatie.",
      "Dan schuift de oplossing richting een eigen bedrijfsapplicatie, en wordt de vergelijking in [maatwerksoftware of standaardsoftware](/nl/blog/maatwerksoftware-of-standaardsoftware) relevanter dan de keuze tussen twee automatiseringsplatforms.",
    ],
    [
      "Dan wordt het belangrijk om zelf scherp te bepalen welke stap wat bezit.",
      "Dan wordt het belangrijk om zelf scherp te bepalen welke stap wat bezit. Het [stappenplan voor een webapplicatie](/nl/blog/webapplicatie-laten-maken-stappenplan) beschrijft hoe zo'n traject dan verloopt.",
    ],
  ],
  "website-vernieuwen-optimaliseren-redesign-herbouwen-replatformen": [
    [
      "Soms kan dat gericht worden opgelost.",
      "Soms kan dat gericht worden opgelost. [Core Web Vitals en websiteperformance](/nl/blog/core-web-vitals-websiteperformance) behandelt die oorzaken los van elkaar, en [INP uitgelegd](/nl/blog/inp-uitgelegd-hoe-maak-je-een-site-echt-responsief) gaat specifiek over interactierespons.",
    ],
    [
      "Google's migratierichtlijnen benadrukken planning, testen en monitoring.",
      "Google's migratierichtlijnen benadrukken planning, testen en monitoring. De [checklist voor een launch-ready website](/nl/blog/checklist-launch-ready-website-seo-performance) loopt de laatste controles voor livegang langs.",
    ],
    [
      "Daarna kun je per probleem de kleinste passende ingreep kiezen.",
      "Daarna kun je per probleem de kleinste passende ingreep kiezen. Wat die ingrepen aan scope betekenen, staat in [wat een website of webshop kost](/nl/blog/wat-kost-een-website-of-webshop).",
    ],
    [
      "Als vooral het CMS slecht aansluit op de organisatie, kan replatforming voldoende zijn.",
      "Als vooral het CMS slecht aansluit op de organisatie, kan replatforming voldoende zijn. [Hoe je de technische kwaliteit beoordeelt](/nl/blog/technische-kwaliteit-website-webapp-beoordelen) helpt om dat onderscheid met bewijs te onderbouwen.",
    ],
    [
      "Een frontend kan geen betrouwbare informatie tonen die intern niet bestaat.",
      "Een frontend kan geen betrouwbare informatie tonen die intern niet bestaat. Dat is precies de voorwaarde die [een klantportaal laten maken](/nl/blog/klantportaal-laten-maken) als eerste stelt.",
    ],
  ],
  "wat-kost-een-webapplicatie": [
    [
      "Iedere integratie heeft een eigen contract, failure modes en onderhoudslifecycle.",
      "Iedere integratie heeft een eigen contract, failure modes en onderhoudslifecycle; [wat een API-koppeling betrouwbaar maakt](/nl/blog/api-koppeling-laten-maken) werkt dat uit.",
    ],
    [
      "Daarna pas hoort schermontwerp dominant te worden.",
      "Daarna pas hoort schermontwerp dominant te worden. Het [stappenplan voor een webapplicatie](/nl/blog/webapplicatie-laten-maken-stappenplan) beschrijft die volgorde als project.",
    ],
    [
      "Een goede aanpak is risicogestuurd.",
      "Een goede aanpak is risicogestuurd; [hoe je technische kwaliteit beoordeelt](/nl/blog/technische-kwaliteit-website-webapp-beoordelen) geeft daar de maatstaven voor.",
    ],
    [
      "Beide moeten in de totale levenscyclus worden meegenomen.",
      "Beide moeten in de totale levenscyclus worden meegenomen. [Wat er na livegang gebeurt](/nl/blog/technisch-onderhoud-website-webapp-na-livegang) maakt dat beheerwerk concreet.",
    ],
  ],
  "technische-schuld-software": [
    [
      "Regelmatig onderhoud voorkomt dat één update later een groot migratieproject wordt.",
      "Regelmatig onderhoud voorkomt dat één update later een groot migratieproject wordt; [wat er na livegang gebeurt](/nl/blog/technisch-onderhoud-website-webapp-na-livegang) beschrijft hoe dat werk eruitziet.",
    ],
    [
      "Ook dan moet de beslissing gebaseerd zijn op analyse, niet frustratie.",
      "Ook dan moet de beslissing gebaseerd zijn op analyse, niet frustratie. Voor websites loopt diezelfde afweging via [optimaliseren, redesignen, herbouwen of replatformen](/nl/blog/website-vernieuwen-optimaliseren-redesign-herbouwen-replatformen).",
    ],
    [
      "De extra vijf dagen zijn feitelijk rentekosten van eerdere technische keuzes.",
      "De extra vijf dagen zijn feitelijk rentekosten van eerdere technische keuzes. Diezelfde factoren bepalen vooraf de scope in [wat een webapplicatie kost](/nl/blog/wat-kost-een-webapplicatie).",
    ],
    [
      "Een bedrijf merkt slechte technische kwaliteit meestal pas wanneer een wijziging urgent wordt.",
      "Een bedrijf merkt slechte technische kwaliteit meestal pas wanneer een wijziging urgent wordt. [Hoe je die kwaliteit eerder beoordeelt](/nl/blog/technische-kwaliteit-website-webapp-beoordelen) staat in een apart artikel.",
    ],
  ],
  "api-koppeling-laten-maken": [
    [
      "Daarom kan een koppeling tussen twee SaaS-systemen relatief eenvoudig zijn, terwijl een integratielaag tussen webshop, payment provider, ERP, CRM en boekhouding een volwaardig softwaresysteem wordt.",
      "Daarom kan een koppeling tussen twee SaaS-systemen relatief eenvoudig zijn, terwijl een integratielaag tussen webshop, payment provider, ERP, CRM en boekhouding een volwaardig softwaresysteem wordt — met de scopefactoren uit [wat een webapplicatie kost](/nl/blog/wat-kost-een-webapplicatie).",
    ],
    [
      "Dat onderscheid is belangrijk bij afspraken over support en doorontwikkeling.",
      "Dat onderscheid is belangrijk bij afspraken over support en doorontwikkeling; [wat er na livegang gebeurt](/nl/blog/technisch-onderhoud-website-webapp-na-livegang) gaat daar verder op in.",
    ],
  ],
  "wat-kost-een-3d-productconfigurator": [
    [
      "In beide gevallen ziet de gebruiker een product in 3D en kiest hij opties. Toch zijn dit technisch totaal verschillende projecten.",
      "In beide gevallen ziet de gebruiker een product in 3D en kiest hij opties. Toch zijn dit technisch totaal verschillende projecten. [Wat een 3D-productconfigurator precies is](/nl/blog/wat-is-een-3d-productconfigurator) beschrijft waarom de configuratielaag en niet het model de kern vormt.",
    ],
    [
      "Goede integraties vragen daarom niet alleen API-werk, maar ook duidelijke datacontracten en ownership.",
      "Goede integraties vragen daarom niet alleen API-werk, maar ook duidelijke datacontracten en ownership; [wat een API-koppeling betrouwbaar maakt](/nl/blog/api-koppeling-laten-maken) werkt die eisen uit.",
    ],
    [
      "De juiste balans hangt af van hoe vaak het bedrijf verwacht wijzigingen zelf te moeten uitvoeren.",
      "De juiste balans hangt af van hoe vaak het bedrijf verwacht wijzigingen zelf te moeten uitvoeren. [Wat er na livegang gebeurt](/nl/blog/technisch-onderhoud-website-webapp-na-livegang) beschrijft welk beheerwerk daarbij hoort.",
    ],
  ],
  "core-web-vitals-websiteperformance": [
    [
      "Voor de gebruiker voelt dat bijvoorbeeld als:",
      "[INP uitgelegd](/nl/blog/inp-uitgelegd-hoe-maak-je-een-site-echt-responsief) gaat dieper in op waar die vertraging vandaan komt.\n\nVoor de gebruiker voelt dat bijvoorbeeld als:",
    ],
    [
      "Daarom kan performance daar complexer zijn dan op een relatief statische bedrijfswebsite.",
      "Daarom kan performance daar complexer zijn dan op een relatief statische bedrijfswebsite; [website of webshop?](/nl/blog/website-of-webshop) laat zien hoeveel operationele laag daar onder zit.",
    ],
    [
      "Daarom is monitoring onderdeel van onderhoud.",
      "Daarom is monitoring onderdeel van [technisch onderhoud na livegang](/nl/blog/technisch-onderhoud-website-webapp-na-livegang), en hoort een laatste meting bij de [checklist voor een launch-ready website](/nl/blog/checklist-launch-ready-website-seo-performance).",
    ],
  ],
  "klantportaal-laten-maken": [
    [
      "Een klantportaal is dus vaak evenveel een integratieproject als een frontendproject.",
      "Een klantportaal is dus vaak evenveel een [integratieproject](/nl/blog/api-koppeling-laten-maken) als een frontendproject.",
    ],
    [
      "Een moderne website kan ook accounts bevatten, maar zodra persoonlijke processen dominant worden, spreek je praktisch steeds meer over een webapplicatie of portaal.",
      "Een moderne website kan ook accounts bevatten, maar zodra persoonlijke processen dominant worden, spreek je praktisch steeds meer over een webapplicatie of portaal. Voor de commerciële kant van dat onderscheid: [website of webshop?](/nl/blog/website-of-webshop).",
    ],
    [
      "Anders digitaliseer je vooral onzekerheid.",
      "Anders digitaliseer je vooral onzekerheid. [Van Excel en workarounds naar software](/nl/blog/van-excel-naar-maatwerksoftware) beschrijft hoe je dat interne probleem eerst zichtbaar maakt.",
    ],
  ],
  "website-koppelen-aan-crm": [
    [
      "De koppeling moet daarom eerst begrijpen **wat voor record de inzending vertegenwoordigt en of dat record al bestaat**.",
      "De koppeling moet daarom eerst begrijpen **wat voor record de inzending vertegenwoordigt en of dat record al bestaat**. Of dit proces überhaupt een goede automatiseringskandidaat is, staat in [welke bedrijfsprocessen je moet automatiseren](/nl/blog/welke-bedrijfsprocessen-moet-je-automatiseren).",
    ],
    [
      "Tweerichtingssynchronisatie is dus niet automatisch \"beter geïntegreerd\".",
      "Een [klantportaal](/nl/blog/klantportaal-laten-maken) is de meest voorkomende reden om dat te willen.\n\nTweerichtingssynchronisatie is dus niet automatisch \"beter geïntegreerd\".",
    ],
  ],
  "technisch-onderhoud-website-webapp-na-livegang": [
    [
      "Een API-koppeling is dus niet altijd een eenmalig project.",
      "Een [API-koppeling](/nl/blog/api-koppeling-laten-maken) is dus niet altijd een eenmalig project.",
    ],
    [
      "Stel deze vragen.",
      "Stel deze vragen. Ze horen bij het bredere kader uit [hoe je de technische kwaliteit van een website of webapp beoordeelt](/nl/blog/technische-kwaliteit-website-webapp-beoordelen).",
    ],
    [
      "Daarom is het nuttiger om onderhoud op activiteiten en risico’s te begroten dan op een willekeurig percentage van de bouwsom.",
      "Daarom is het nuttiger om onderhoud op activiteiten en risico’s te begroten dan op een willekeurig percentage van de bouwsom, net zoals bij [wat een website of webshop kost](/nl/blog/wat-kost-een-website-of-webshop).",
    ],
  ],
  "hoe-werkt-een-3d-productconfigurator-technisch": [
    [
      "Een goede integratiearchitectuur voorkomt daarom dat drie systemen elk hun eigen versie van dezelfde waarheid hebben.",
      "Een goede integratiearchitectuur voorkomt daarom dat drie systemen elk hun eigen versie van dezelfde waarheid hebben; [wat een API-koppeling betrouwbaar maakt](/nl/blog/api-koppeling-laten-maken) beschrijft hoe je dat afdwingt.",
    ],
    [
      "De 3D-weergave zelf blijft daarnaast visueel getest moeten worden, maar een renderer-screenshot alleen bewijst niet dat de productlogica klopt.",
      "De 3D-weergave zelf blijft daarnaast visueel getest moeten worden, maar een renderer-screenshot alleen bewijst niet dat de productlogica klopt. [Hoe je technische kwaliteit beoordeelt](/nl/blog/technische-kwaliteit-website-webapp-beoordelen) gaat verder in op testbaarheid als kwaliteitskenmerk.",
    ],
  ],
  "website-code-data-eigendom-vendor-lock-in": [
    [
      "Dit maakt migratie én dagelijks beheer betrouwbaarder.",
      "Dit maakt migratie én dagelijks beheer betrouwbaarder. [Van Excel en workarounds naar software](/nl/blog/van-excel-naar-maatwerksoftware) laat zien wat er gebeurt zolang die verdeling ontbreekt.",
    ],
    [
      "> Kan een competente nieuwe partij dit systeem veilig begrijpen, uitrollen en onderhouden?",
      "> Kan een competente nieuwe partij dit systeem veilig begrijpen, uitrollen en onderhouden?\n\nDat is dezelfde continuïteitstest als in [hoe je de technische kwaliteit van een website of webapp beoordeelt](/nl/blog/technische-kwaliteit-website-webapp-beoordelen).",
    ],
    [
      "De vraag is of de afhankelijkheid past bij het proces.",
      "De vraag is of de afhankelijkheid past bij het proces; [maatwerksoftware of standaardsoftware](/nl/blog/maatwerksoftware-of-standaardsoftware) vergelijkt die afhankelijkheid per oplossingsvorm.",
    ],
    /*
      The source heading reads as a note to the author rather than as
      published copy. Same content, stated as what a client can expect.
    */
    [
      "# Wat YM Creations onder overdraagbaarheid zou moeten verstaan",
      "# Wat je van een technische partner mag verwachten",
    ],
    [
      "Maar er hoort geen kunstmatige blokkade te zijn omdat essentiële assets ontbreken.",
      "Maar er hoort geen kunstmatige blokkade te zijn omdat essentiële assets ontbreken. Een deel daarvan is gewoon [technisch onderhoud](/nl/blog/technisch-onderhoud-website-webapp-na-livegang): actuele documentatie en bereikbare accounts blijven alleen bestaan als iemand ze bijhoudt.",
    ],
  ],
};

/* --------------------------------------------------------------- parsing --*/

function parseFrontmatter(raw) {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n/);
  if (!match) throw new Error("no frontmatter");

  const meta = {};
  for (const line of match[1].split("\n")) {
    const field = line.match(/^([a-z_]+):\s*(.*)$/);
    // List values (secondary_keywords) are not used here; their items are
    // indented and simply skipped.
    if (field && field[2] !== "") meta[field[1]] = field[2].replace(/^"|"$/g, "");
  }

  return { meta, body: raw.slice(match[0].length) };
}

/** Inline text as the article block model spells it. */
function inline(text) {
  return (
    text
      // Inline code has no mark in the article model; the words carry it.
      .replace(/`([^`]+)`/g, "$1")
      .trim()
  );
}

/** A sources list item written as "Name: https://url" becomes a real link. */
function sourceLink(item) {
  const match = item.match(/^(.+?):\s+(https?:\/\/\S+)$/);
  return match ? `[${match[1]}](${match[2]})` : item;
}

/**
 * Markdown to article blocks.
 *
 * Headings collapse to the two levels the site renders: the files mix `#` and
 * `##` for sections of the same weight, so both become h2 and anything deeper
 * becomes h3. A line ending in two spaces is a hard break inside its
 * paragraph, which is how the sources set label-and-explanation pairs.
 */
function parseBlocks(body) {
  const lines = body.split("\n");
  const blocks = [];

  let paragraph = [];
  let list = null;
  let quote = [];
  let table = [];
  let titleSeen = false;

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    blocks.push({ type: "paragraph", content: inline(paragraph.join("")) });
    paragraph = [];
  };
  const flushList = () => {
    if (!list) return;
    blocks.push({ type: "list", items: list.items.map(inline), ...(list.ordered ? { ordered: true } : {}) });
    list = null;
  };
  const flushQuote = () => {
    if (quote.length === 0) return;
    blocks.push({ type: "quote", content: inline(quote.join("\n")) });
    quote = [];
  };
  const flushTable = () => {
    if (table.length === 0) return;
    const cells = (row) =>
      row
        .trim()
        .replace(/^\|/, "")
        .replace(/\|$/, "")
        .split("|")
        .map((value) => inline(value));
    const separator = table[1] && /^\s*\|[\s:|-]+\|\s*$/.test(table[1]);
    blocks.push({
      type: "table",
      head: separator ? cells(table[0]) : [],
      rows: (separator ? table.slice(2) : table).map(cells),
    });
    table = [];
  };
  const flushAll = () => {
    flushParagraph();
    flushList();
    flushQuote();
    flushTable();
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];

    if (line.startsWith("```")) {
      flushAll();
      const code = [];
      index += 1;
      while (index < lines.length && !lines[index].startsWith("```")) {
        code.push(lines[index]);
        index += 1;
      }
      blocks.push({ type: "code", content: code.join("\n") });
      continue;
    }

    if (line.trim() === "") {
      flushAll();
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      flushAll();
      if (heading[1].length === 1 && !titleSeen) {
        // The first h1 is the article title, which the page renders itself.
        titleSeen = true;
        continue;
      }
      blocks.push({ type: "heading", level: heading[1].length <= 2 ? 2 : 3, content: inline(heading[2]) });
      continue;
    }

    if (line.startsWith(">")) {
      flushParagraph();
      flushList();
      flushTable();
      quote.push(line.replace(/^>\s?/, ""));
      continue;
    }

    if (line.trim().startsWith("|")) {
      flushParagraph();
      flushList();
      flushQuote();
      table.push(line);
      continue;
    }

    const bullet = line.match(/^[-*]\s+(.*)$/);
    const ordered = line.match(/^\d+\.\s+(.*)$/);
    if (bullet || ordered) {
      flushParagraph();
      flushQuote();
      flushTable();
      const isOrdered = Boolean(ordered);
      if (!list || list.ordered !== isOrdered) {
        flushList();
        list = { ordered: isOrdered, items: [] };
      }
      list.items.push(sourceLink((bullet ?? ordered)[1].trim()));
      continue;
    }

    flushList();
    flushQuote();
    flushTable();
    // Two trailing spaces are a hard break; otherwise lines of one paragraph
    // join with a space.
    const hardBreak = /\s{2,}$/.test(line);
    if (paragraph.length > 0) paragraph.push(hardBreak ? "" : " ");
    paragraph.push(line.trim());
    if (hardBreak) paragraph.push("\n");
  }

  flushAll();
  return blocks;
}

/* ------------------------------------------------- blocks to a document --
   The same mapping as docFromBlocks() in lib/admin/articles/doc.ts. The test
   in doc.test.ts guards the round trip, and scripts/check-import.test.ts
   checks this output against the real implementation.
*/
const inlinePattern = /(\*\*\[[^\]]+\]\([^)]+\)\*\*|\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\)|\*[^*\n]+\*)/g;

function inlineNodes(text) {
  const nodes = [];
  for (const part of text.split(inlinePattern)) {
    if (!part) continue;

    const boldLink = part.match(/^\*\*\[([^\]]+)\]\(([^)]+)\)\*\*$/);
    if (boldLink) {
      nodes.push({ type: "text", text: boldLink[1], marks: [{ type: "bold" }, { type: "link", attrs: { href: boldLink[2] } }] });
      continue;
    }
    const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (link) {
      nodes.push({ type: "text", text: link[1], marks: [{ type: "link", attrs: { href: link[2] } }] });
      continue;
    }
    const bold = part.match(/^\*\*([^*]+)\*\*$/);
    if (bold) {
      nodes.push({ type: "text", text: bold[1], marks: [{ type: "bold" }] });
      continue;
    }
    const italic = part.match(/^\*([^*\n]+)\*$/);
    if (italic) {
      nodes.push({ type: "text", text: italic[1], marks: [{ type: "italic" }] });
      continue;
    }
    part.split("\n").forEach((line, index) => {
      if (index > 0) nodes.push({ type: "hardBreak" });
      if (line) nodes.push({ type: "text", text: line });
    });
  }
  return nodes;
}

function cell(kind, text) {
  return {
    type: kind,
    attrs: { colspan: 1, rowspan: 1, colwidth: null },
    content: [{ type: "paragraph", content: inlineNodes(text) }],
  };
}

function docFromBlocks(blocks) {
  return {
    type: "doc",
    content: blocks.map((block) => {
      if (block.type === "heading") {
        return { type: "heading", attrs: { level: block.level }, content: inlineNodes(block.content) };
      }
      if (block.type === "list") {
        const items = block.items.map((item) => ({
          type: "listItem",
          content: [{ type: "paragraph", content: inlineNodes(item) }],
        }));
        return { type: block.ordered ? "orderedList" : "bulletList", content: items };
      }
      if (block.type === "quote") {
        return { type: "blockquote", content: [{ type: "paragraph", content: inlineNodes(block.content) }] };
      }
      if (block.type === "code") {
        return {
          type: "codeBlock",
          attrs: { language: null },
          content: block.content ? [{ type: "text", text: block.content }] : [],
        };
      }
      if (block.type === "table") {
        return {
          type: "table",
          content: [
            { type: "tableRow", content: block.head.map((text) => cell("tableHeader", text)) },
            ...block.rows.map((row) => ({ type: "tableRow", content: row.map((text) => cell("tableCell", text)) })),
          ],
        };
      }
      return { type: "paragraph", content: inlineNodes(block.content) };
    }),
  };
}

/* ------------------------------------------------------------------ run --*/

function rewrite(slug, body) {
  let text = body;

  // The source files cross-reference each other as relative markdown files.
  text = text.replace(/\]\(\.\/([a-z0-9-]+)\.md\)/g, "](/nl/blog/$1)");

  /*
    The closing "Meer over X: [service]" line duplicates the related-services
    navigation and the call to action the article page already renders, and
    points at service URLs this site does not have. It goes; the links live in
    articleExtras, where the page reads them.
  */
  text = text.replace(/\n\nMeer over [^\n]*\(\/diensten\/[^\n]*\n/g, "\n");

  for (const [find, replaceWith] of [...(links[slug] ?? []), ...(serviceLinks[slug] ?? [])]) {
    const occurrences = text.split(find).length - 1;
    if (occurrences !== 1) {
      throw new Error(`${slug}: expected 1 match for ${JSON.stringify(find.slice(0, 60))}, found ${occurrences}`);
    }
    text = text.replace(find, replaceWith);
  }

  return text;
}

function checkLinks(slug, blocks) {
  const texts = [];
  for (const block of blocks) {
    if (block.type === "code") continue;
    if (block.type === "list") texts.push(...block.items);
    else if (block.type === "table") texts.push(...block.head, ...block.rows.flat());
    else texts.push(block.content);
  }

  for (const text of texts) {
    for (const match of text.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
      const href = match[1];
      if (/^https?:\/\//.test(href) || href.startsWith("mailto:")) continue;
      if (!knownPaths.has(href)) throw new Error(`${slug}: unknown internal link ${href}`);
    }
  }
}

const quote = (value) => `'${String(value).replace(/'/g, "''")}'`;

const files = readdirSync(sourceDir).filter((name) => name.endsWith(".md"));
const rows = [];
const blocksBySlug = {};

for (const [slug, date] of schedule) {
  const file = files.find((name) => name === `${slug}.md`);
  if (!file) throw new Error(`no source file for ${slug}`);

  const { meta, body } = parseFrontmatter(readFileSync(join(sourceDir, file), "utf8"));
  if (meta.slug !== slug) throw new Error(`${file}: frontmatter slug is ${meta.slug}`);

  const category = categoryByCluster[meta.cluster];
  if (!category) throw new Error(`${slug}: unknown cluster ${meta.cluster}`);

  const cover = covers[slug];
  if (!cover) throw new Error(`${slug}: no cover alt text`);

  const blocks = parseBlocks(rewrite(slug, body));
  checkLinks(slug, blocks);
  blocksBySlug[slug] = blocks;

  const snippet = metadata[slug] ?? {};

  rows.push({
    slug,
    title: meta.title,
    excerpt: meta.excerpt,
    content: JSON.stringify(docFromBlocks(blocks)),
    category,
    published_at: date,
    seo_title: snippet.seoTitle ?? meta.meta_title,
    meta_description: snippet.metaDescription ?? meta.meta_description,
    featured_image: JSON.stringify({ path: `/images/artikelen/${slug}.webp`, alt: cover }),
  });
}

const header = `-- The twenty-article knowledge library, with its publication plan.
--
-- Generated by scripts/import-articles.mjs from the markdown originals; not
-- retyped. Every row carries the article as the ProseMirror document the
-- editor works with, its SEO fields, its cluster and the date it goes live.
--
-- Publication is the database's job: the RLS policy on public.articles hands
-- out a row only once published_at has arrived, so these rows are published
-- and dated, three a week on Monday, Wednesday and Friday from 14 September
-- 2026, and each appears on the site, in the sitemap and in the overview on
-- its own date without anyone touching the admin.
--
-- Keyed on slug, so re-running updates the same twenty rows.

insert into public.articles
  (slug, title, excerpt, content, status, category, published_at, seo_title, meta_description, featured_image)
values
`;

const values = rows
  .map(
    (row) => `  (${quote(row.slug)},
   ${quote(row.title)},
   ${quote(row.excerpt)},
   ${quote(row.content)}::jsonb,
   'published',
   ${quote(row.category)},
   ${quote(row.published_at)}::date,
   ${quote(row.seo_title)},
   ${quote(row.meta_description)},
   ${quote(row.featured_image)}::jsonb)`,
  )
  .join(",\n");

const footer = `
on conflict (slug) do update set
  title            = excluded.title,
  excerpt          = excluded.excerpt,
  content          = excluded.content,
  status           = excluded.status,
  category         = excluded.category,
  published_at     = excluded.published_at,
  seo_title        = excluded.seo_title,
  meta_description = excluded.meta_description,
  featured_image   = excluded.featured_image;
`;

/*
  A migration that has been applied is history: the repository has to keep
  showing what actually ran. So this refuses to overwrite a file that exists.
  To import a new library, pass `--out supabase/migrations/<new>.sql`; to
  regenerate a seed that was never applied, delete it first.

  Editorial changes to articles that are already seeded belong in their own
  migration, not in this one -- see 20260911100500_article_metadata_polish.sql.
*/
const outIndex = process.argv.indexOf("--out");
const target =
  outIndex > -1 ? process.argv[outIndex + 1] : "supabase/migrations/20260911094500_articles_library_seed.sql";

if (existsSync(target)) {
  throw new Error(
    `${target} already exists and may already be applied; applied migrations are immutable. ` +
      `Pass --out <file> to write a new one.`,
  );
}

writeFileSync(target, header + values + footer);

if (blocksOut) {
  writeFileSync(blocksOut, JSON.stringify(blocksBySlug, null, 2));
}

const counts = rows.reduce((all, row) => ({ ...all, [row.category]: (all[row.category] ?? 0) + 1 }), {});
console.log(`${rows.length} articles -> ${target}`);
console.log(counts);
