# SEO fase 3 — structured data, breadcrumbs en performancearchitectuur

**Datum:** 11 september 2026 · **Basis:** `main` op `c501d08`, met de niet-gecommitte wijzigingen van fase 1 en 2A in de werkboom
**Aard van deze ronde:** lokale codewijzigingen. Geen databasewrites, geen commit, geen push, geen deploy, geen GSC-actie.

---

## 1. Beginsituatie

De werkboom trof ik aan zoals gerapporteerd: elf gewijzigde tracked bestanden, samen 628 toevoegingen, plus untracked `.codex/`, `docs/`, `src/components/prose-sections.tsx` en `src/lib/content/cases.test.ts`. Die stand is als diff weggeschreven vóór er iets veranderde, zodat mijn eigen wijzigingen er achteraf byte-voor-byte van te scheiden zijn (zie §7).

Er is geen `CLAUDE.md` en geen `AGENTS.md` in de repository; er zijn geen padgebonden instructiebestanden. Package manager is npm (`package-lock.json`), Next.js 16.1.6 met Turbopack, React 19.2.3, Vitest 4.1.11. Er zijn geen dependencies toegevoegd.

### Wat er al stond en behouden is

| Onderdeel | Aangetroffen | Oordeel |
|---|---|---|
| `buildMetadata` in `lib/seo.ts` | canonical, OG, Twitter, robots, hreflang via `alternates` | correct, ongewijzigd |
| `getRouteAlternates` / `getServiceAlternates` | nl/en/x-default per route | correct, ongewijzigd |
| `components/json-ld.tsx` | één `<script type="application/ld+json">`, accepteert object of array | correct, ongewijzigd |
| Publicatiefilter artikelen | RLS op `public.articles`; geen statusfilter in applicatiecode | correct, ongewijzigd |
| Case-afscherming | `dynamicParams = false`, geen Engelse case, geen verzonnen hreflang | correct, ongewijzigd |
| Sitemapselectie | geen `lastModified` op cases, wel `published_at` op artikelen | correct, ongewijzigd |

---

## 2. Structured data: van losse blokken naar één samenhangende graaf

### Het probleem dat er lag

`lib/schema.ts` had acht helpers die elk een los, zelfstandig object teruggaven. Geen enkele entiteit had een `@id`. Daardoor:

* `organizationSchema()` werd op **twee** pagina's uitgezonden (`/[locale]` en `/[locale]/contact`) als twee losse Organization-knopen zonder gedeelde identiteit;
* `serviceSchema()` bevatte een **ingebedde** provider-Organization met vier velden, en `blogPostingSchema()` een **derde**, andere ingebedde publisher-Organization met twee velden — drie verschillende beschrijvingen van hetzelfde bedrijf;
* niets verwees naar de WebSite, en niets zei in welke taal een pagina stond.

### Voor en na

**Service, vóór** — een tweede bedrijf, ingebed:

```json
{ "@context": "https://schema.org", "@type": "Service",
  "name": "Bedrijfswebsite", "url": "…/nl/diensten/bedrijfswebsite",
  "provider": { "@type": "Organization", "name": "YM Creations",
                "url": "https://ymcreations.com",
                "email": "contact@ymcreations.com", "telephone": "+31653400220" } }
```

**Service, na** — een verwijzing naar het ene bedrijf:

```json
{ "@context": "https://schema.org", "@type": "Service",
  "@id": "https://ymcreations.com/nl/diensten/bedrijfswebsite#service",
  "name": "Bedrijfswebsite", "url": "https://ymcreations.com/nl/diensten/bedrijfswebsite",
  "mainEntityOfPage": { "@id": "https://ymcreations.com/nl/diensten/bedrijfswebsite#webpage" },
  "provider": { "@id": "https://ymcreations.com/#organization" } }
```

**Organization, na** — één definitie, met het bestaande merkbeeld:

```json
{ "@context": "https://schema.org", "@type": "Organization",
  "@id": "https://ymcreations.com/#organization",
  "name": "YM Creations", "legalName": "YM Creations",
  "url": "https://ymcreations.com/", "email": "contact@ymcreations.com",
  "telephone": "+31653400220", "identifier": "96175354",
  "logo": { "@type": "ImageObject", "@id": "https://ymcreations.com/#logo",
            "url": "https://ymcreations.com/images/branding/ym-favicon-mark.png",
            "contentUrl": "https://ymcreations.com/images/branding/ym-favicon-mark.png",
            "width": 1024, "height": 1024, "caption": "YM Creations" },
  "image": { "@id": "https://ymcreations.com/#logo" } }
```

### De identifiers

| `@id` | Wat het is |
|---|---|
| `https://ymcreations.com/#organization` | het bedrijf — **taalonafhankelijk**, want NL en EN zijn niet twee ondernemingen |
| `https://ymcreations.com/#website` | de site als geheel, `inLanguage: ["nl-NL","en-US"]`, `publisher` → organization |
| `https://ymcreations.com/#logo` | het merkbeeld als `ImageObject`, hergebruikt via `image` |
| `<canonical>#webpage` | de pagina-entiteit, `inLanguage` per taal, `isPartOf` → website |
| `<canonical>#service` / `#case` / `#article` / `#blog` | het ding op die pagina, `mainEntityOfPage` → de pagina |
| `<canonical>#breadcrumb` | het kruimelpad van die pagina |

Taal zit waar taal hoort: op de **pagina**, niet op het bedrijf. Een Service kreeg bewust géén `inLanguage` en géén `isPartOf` — dat zijn CreativeWork-eigenschappen en een Service is geen creative work; de pagina eromheen draagt ze wel.

### Brongegevens en wat bewust ontbreekt

Alle bedrijfsgegevens komen uit de bestaande `businessInfo` in `lib/content/site-content.ts`: naam, legalName, e-mail, telefoon, KvK, website-URL. Er is niets bijverzonnen.

| Veld | Status | Waarom |
|---|---|---|
| `logo` | **toegevoegd** | `/images/branding/ym-favicon-mark.png`, 1024×1024 PNG. Ik heb het bestand geïnspecteerd: een opaak vierkant met het witte YM-merk. Raster (Google's logo-eis noemt "een formaat dat Google Images ondersteunt"; SVG staat daar niet expliciet), ruim boven het minimum van 112×112, publiek bereikbaar en niet door robots geblokkeerd, en het blijft leesbaar op een witte achtergrond omdat het niet transparant is. Het is hetzelfde bestand waar de favicon en de OG-afbeelding uit getekend worden. `logo-black.svg` (620×430 wordmark) was het alternatief, maar SVG is voor dit veld niet bevestigd ondersteund. |
| `address` | **weggelaten** | geen adres in `businessInfo`; niets om het uit af te leiden |
| `sameAs` | **weggelaten** | geen geverifieerde socialprofielen bekend |
| `aggregateRating`, `review` | **weggelaten** | geen reviewgegevens; verzinnen zou onjuiste rich results opleveren |
| `openingHours`, keurmerken | **weggelaten** | geen bron |
| `potentialAction` / `SearchAction` | **weggelaten** | er is geen zoekfunctie op deze site (geen zoekroute in `src/app`) |

---

## 3. BlogPosting: wat wel en niet onderbouwd is

Gecontroleerd tegen de werkelijke databaseinhoud (alleen gelezen, niets geschreven).

**`author` — weggelaten, en dat is een bevinding, geen omissie.**
`public.articles.author` is `text NULL`. Een telling over alle 24 records: **alle 24 hebben `author = NULL`.** Er is geen tweede auteurstabel en geen `author_id`. Er is dus nergens redactioneel bewijs wie welk artikel schreef, en op de pagina staat ook geen zichtbare auteursvermelding (de header rendert die alleen `article.author ? …`, dus nooit). De code houdt `authorName` als optioneel veld: zodra een record wél een auteur noemt, verschijnt die zichtbaar én in het schema. Wat ik **niet** heb gedaan: de publisher automatisch tot auteur promoveren, of een persoon verzinnen. Eigendom van de site bewijst geen auteurschap. → **open punt, zie §10.**

**`datePublished` — uit `published_at`, ongewijzigd.**
`published_at` is een `date` (zonder tijd). Dat is de enige echte publicatiebron. `created_at` is een importdatum: voor de vier oudste artikelen ligt die op 2026-09-10, terwijl ze `published_at` 2026-01-28 t/m 2026-03-10 hebben — een importdatum als publicatiedatum presenteren zou onjuist zijn.

**`dateModified` — bewust weggelaten, met een genuanceerder argument dan eerst opgeschreven.**
`updated_at` is gecontroleerd voordat er een claim aan werd gehangen. De twintig nieuwe artikelen delen exact één timestamp (`2026-09-11 09:22:29+00`); de vier oude delen exact één andere (`2026-09-11 19:42:27+00`).

Die twee groepen betekenen niet hetzelfde, en de eerste versie van deze paragraaf gooide ze te snel op één hoop. Bij de **twintig** is de timestamp een bulkbewerking waar geen inhoudelijke wijziging per artikel uit af te leiden is. Bij de **vier** hoort hij bij de V1–V4-bewerking, en dat wás een echte inhoudswijziging: elk van die vier kreeg een slotalinea met een nieuwe interne link. Voor die vier zou een `dateModified` dus verdedigbaar zijn.

Toch blijft het veld weg, om twee redenen die niets met de vier te maken hebben. Ten eerste is `updated_at` over de dataset als geheel geen betrouwbaar redactioneel signaal — bij de negentien geplande artikelen ligt hij zelfs vóór hun eigen `published_at` (tot 2026-10-19), wat incoherente markup zou opleveren. Ten tweede is `dateModified` optioneel: een ontbrekend optioneel veld is geen defect dat gerepareerd moet worden. Het alternatief — een aparte redactionele wijzigingsdatum naast `updated_at` — is een timestamparchitectuur en een databaseveld, en dat viel buiten deze ronde. Er is dan ook geen algemene timestamprefactor doorgevoerd om dit ene veld te kunnen vullen.

**`image` — alleen een echte artikelafbeelding.**
Twintig artikelen hebben een cover (`/images/artikelen/*.webp`), de vier oudste niet. Die vier krijgen géén `image`; het logo is uitdrukkelijk niet als vervanging gebruikt. Er is geen cover voor de oude vier gemaakt. Een test bewaakt dat (`schema.test.ts`: "does not fall back to the logo when an article has no image").

**Verder toegevoegd:** `inLanguage` (`nl-NL`), `mainEntityOfPage` → de pagina-entiteit, `isPartOf` → de website, `publisher` → `{"@id": …#organization}` in plaats van een ingebedde kopie. `headline` was en blijft de artikeltitel.

---

## 4. Breadcrumbs

### Eén bron voor HTML en JSON-LD

`src/lib/content/breadcrumbs.ts` bouwt het pad; `src/components/breadcrumbs.tsx` rendert het en `breadcrumbListSchema` zet hetzelfde lijstje om in markup. Ze kunnen niet uiteenlopen, want het is dezelfde array.

| Pagina | Pad | Labels uit |
|---|---|---|
| Dienst (NL) | Home → Diensten → *Bedrijfswebsite* | `nav.services`, `service.navLabel` |
| Dienst (EN) | Home → Services → *Business website* | idem, Engelse zijde |
| Artikel | Home → Inzichten → *artikeltitel* | `nav.blog` ("Inzichten" / "Insights") |
| Case | Home → Projecten → *Flexora Bouw* | `nav.projects`, projectnaam |

De labels zijn de bestaande navigatielabels, niet nieuw verzonnen bewoordingen. Paden komen uit `getLocalizedPath` en `service.path` / `overviewPath`, dus een NL-pad bevat alleen NL-routes en andersom (een test bewaakt dat). Er is geen categorieniveau verzonnen — dat bestaat niet op deze site — en geen Engels casepad.

### Zichtbaar, en waar

De site had nog geen echte kruimelpaden. Wel stond er op dienst- en casepagina's een label dat er op leek: `"Diensten · Websites"` en `"Projecten · Bouw"` — geen links, en zonder weg terug naar Home. Dat label is **vervangen** door het echte kruimelpad op dezelfde plek, in dezelfde `label-mono`-stijl. Dat voorkomt dat "Diensten" twee keer boven elkaar komt te staan.

Daarbij verdween aanvankelijk de tweede helft van dat label: de dienstfamilie en de casesector. **Die is hersteld** (§11). De trail staat nu op zijn eigen regel en daaronder staat diezelfde context als korte, lichtere tekst — geen link, want "Websites en webshops" en "Aanbouw en renovatie" zijn groeperingen zonder eigen pagina:

```
HOME / DIENSTEN / BEDRIJFSWEBSITE      ← nav, met links
WEBSITES EN WEBSHOPS                   ← context, platte tekst
```

Op de artikelpagina staat het kruimelpad boven de header; de losse "Inzichten"-link die daar in de metadatakolom stond is weggehaald, omdat die nu de middelste kruimel is. Categorie, datum, leestijd blijven staan.

**Toegankelijkheid, gemeten in een echte browser (headless Chrome, 390 / 820 / 1440 px):**

| | dienst | case | artikel |
|---|---|---|---|
| horizontale overloop `<ol>` | nee | nee | nee |
| horizontale overloop pagina | nee | nee | nee |
| hoogte op 390 px | 16 px | 16 px | 52 px (titel wikkelt over 3 regels) |
| geneste anchors | nee (2 links, 2 sluittags) | nee | nee |
| aantal `<h1>` | 1 | 1 | 1 |
| toetsenbordfocus | bereikt eerste kruimel, globale `:focus-visible`-outline | idem | idem |

De regel wikkelt (`flex-wrap`) in plaats van te scrollen. De huidige pagina is geen link maar een `<span aria-current="page">`, de scheidingstekens zijn `aria-hidden`. Geen nieuwe clientcomponent: `Breadcrumbs` is een servercomponent, geen bibliotheek toegevoegd.

---

## 5. Performancearchitectuur (analyse, geen refactor)

### Meetmethode

Twee soorten getallen, uit elkaar gehouden:

* **Labmetingen.** Productiebuild (`next build`), geserveerd met `next start` op localhost, uitgelezen met headless Chrome via het Chrome DevTools Protocol. Bytes zijn `Network.loadingFinished.encodedDataLength` — werkelijke bytes over de lijn, dus ná compressie. Cache uit, viewport 1440×900, geen netwerk- of CPU-throttling.
* **Echte Core Web Vitals van bezoekers: niet beschikbaar.** De site stuurt web vitals naar GA (`AnalyticsProvider` → `useReportWebVitals`), maar er is in deze ronde geen velddata opgehaald. De LCP-getallen hieronder zijn labwaarden op localhost zonder throttling en zeggen **niets** over wat bezoekers ervaren.

### Server/client-grenzen

Van de 35 componentbestanden in `src/components` zijn er precies zes clientcomponenten op de publieke site: `analytics-provider`, `contact-form`, `locale-not-found`, `mobile-nav`, `pricing-selector` en `project-planner`. De rest — inclusief `ProseSections`, `ArticleRichText`, `HeroFlow`, alle sketch-componenten, `PageHeader`, `SiteShell` en de nieuwe `Breadcrumbs` — is servercomponent. De homepage, de diensttemplate, blogdetail en de case laden **geen** eigen clientcomponent; de enige globaal geladen clientcomponent is `AnalyticsProvider`, via het locale-layout.

**Er is geen 3D-code in deze repository.** Geen `three`, `@react-three`, `babylon` of vergelijkbare dependency in `package.json`, en geen `<canvas>` of WebGL-referentie in `src/`. De 3D-configurator is werk voor een klant dat elders draait; de dienstpagina en de case tonen er screenshots van. De aanwezigheid van een "3D"-onderwerp zegt dus niets over het bundlevolume, en dat is ook gemeten: `/nl/diensten/3d-configurator` laadt exact dezelfde JS-chunks als iedere andere dienstpagina.

### Gemeten per route (bytes over de lijn, na compressie)

| Route | Totaal | Script | Font | RSC-prefetch | Document | Afbeelding | CSS | LCP (lab) |
|---|---|---|---|---|---|---|---|---|
| `/nl` | 407,5 KB | 162,3 KB (14) | 86,9 KB (4) | 107,1 KB (49) | 12,0 KB | 0,8 KB | 14,8 KB | 72 ms |
| `/nl/diensten/bedrijfswebsite` | 372,5 KB | 162,3 KB (14) | 86,9 KB (4) | 90,5 KB (43) | 17,2 KB | 0,8 KB | 14,8 KB | 60 ms |
| `/nl/blog/website-of-webshop` | 374,7 KB | 171,4 KB (15) | 86,9 KB (4) | 68,0 KB (33) | 25,2 KB | 8,4 KB | 14,8 KB | 100 ms |
| `/nl/projecten/flexora-bouw` | 403,8 KB | 171,4 KB (15) | 86,9 KB (4) | 67,9 KB (33) | 11,9 KB | 50,9 KB | 14,8 KB | 64 ms |

Beelden vallen mee: de case serveert twee afbeeldingen voor 50,9 KB terwijl de bronbestanden 175–221 KB JPEG zijn — `next/image` doet zijn werk, en alles onder de vouw laadt lui.

### Bevinding 1 — de `latin-ext`-preload (doorgevoerd, zie §11)

> **Correctie op de eerste versie van deze paragraaf.** De twee Grotesk-bestanden waren hier aan de verkeerde subset gekoppeld, waardoor de besparing bijna twee keer te hoog werd geschat. De juiste toewijzing en de gemeten besparing staan hieronder; §11 beschrijft de doorgevoerde wijziging.

`src/app/fonts.ts` declareerde `Schibsted_Grotesk` met `subsets: ["latin", "latin-ext"]`. Dat levert twee Grotesk-bestanden op — **één per subset**, niet één per gewicht. Dat laatste komt doordat Grotesk variabel is: de vier gedeclareerde gewichten 400/500/600/700 delen per subset hetzelfde bestand, wat in de geserveerde stylesheet te zien is als acht `@font-face`-regels die naar twee bestanden wijzen. Variabiliteit verklaart dus waarom er niet acht bestanden zijn; het aantal van twee komt van de twee subsets.

| Bestand | Grootte (op de lijn) | `unicode-range` |
|---|---|---|
| `31a9145ccb84606d-…woff2` | **46,1 KB** | `U+0-00FF, U+131, U+152-153, U+2000-206F, U+20AC, …` → **latin** |
| `481eac7be1c268b7-…woff2` | **20,6 KB** | `U+100-2BA, U+1D00-1DBF, U+1E00-1E9F, U+2020, U+20A0-20AB, U+2113, U+2C60-2C7F, U+A720-A7FF, …` → **latin-ext** |

Het grootste bestand is dus de **latin**-subset, die de site wél nodig heeft. De latin-ext-subset is het kleinere van de twee. Beide waren gemarkeerd als preload (`-s.p.`) en werden daardoor op iedere pagina opgehaald: gemeten vier fontverzoeken en 86,9 KB per route, ongeacht welke tekens er op de pagina staan. Preload omzeilt namelijk de luie lading die `unicode-range` normaal oplevert.

De site gebruikt geen enkel teken uit de **volledige** latin-ext-range — niet alleen Latin Extended-A, maar ook Latin Extended-B, de fonetische uitbreidingen, Latin Extended Additional, de dagger, ℓ, de valutatekens en Latin Extended-C/D. Twee onafhankelijke controles, beide tegen de volledige range zoals die werkelijk wordt geserveerd:

* **150.130 zichtbare tekens** van alle 38 publieke URL's (NL én EN, alle templates, de case en de publieke artikelen), uit de DOM gelezen in een echte browser: **nul** tekens in de latin-ext-range;
* **alle 24 artikelrecords** in de database, inclusief de 19 nog geplande, over titel, excerpt, seo_title, meta_description én de volledige ProseMirror-`content`: **0 rijen**.

Nederlands en Engels hebben latin-ext niet nodig: `ë ï é ó ü à ç` vallen allemaal binnen `U+0-00FF` en zitten dus in de latin-subset. Het gewicht `700` staat ook in de declaratie en wordt nergens gebruikt — vetgedrukte tekst is overal expliciet `font-semibold` (600) — maar omdat Grotesk variabel is levert schrappen daarvan **geen** bytes op, en het blijft staan.

### Bevinding 2 — RSC-prefetch is de grootste verzoekenpost

De homepage doet **49** `?_rsc=`-verzoeken voor 107,1 KB; een dienstpagina 43 voor 90,5 KB. Dat is Next's standaard `<Link>`-prefetch: header, footer, gerelateerde diensten en alle navigatielinks halen hun RSC-payload op zodra ze in beeld komen. Elk payload is klein (~0,8 KB), maar het zijn tientallen verbindingen. Het is een bewuste afruil van het framework (snellere navigatie daarna), geen fout, en op een snelle verbinding onzichtbaar. Wel het noemen waard omdat het op de homepage meer verzoeken zijn dan alle andere resources samen. Een gerichte `prefetch={false}` op de footernavigatie zou het grootste deel wegnemen — te overwegen, niet urgent.

### Bevinding 3 — scripts van derden: één, en netjes ingeladen

Google Tag Manager/gtag laadt alleen wanneer `NEXT_PUBLIC_GA_MEASUREMENT_ID` gezet is, met `strategy="afterInteractive"`, dus niet renderblokkerend. Verder geen scripts van derden. Geen globaal geladen animatiebibliotheek: de entreebeweging (`.rise`) is een CSS-keyframe in `globals.css` en staat alleen op de hero.

---

## 6. Engels blog — bevinding en advies, niets gewijzigd

Gemeten stand van `/en/blog`:

* HTTP 200, `robots: index, follow`;
* canonical `https://ymcreations.com/en/blog`;
* hreflang `en` → zichzelf, `nl` → `/nl/blog`, `x-default` → `/nl/blog`;
* staat in de sitemap, met dezelfde drie alternates;
* rendert een echte lege staat: "The articles are currently published in Dutch only." met een link naar `/nl/blog` (`hrefLang="nl"`);
* er bestaan geen Engelse artikelroutes: `/en/blog/<slug>` geeft 404 (gecontroleerd).

**Advies, niet uitgevoerd.** De pagina is geen misleidende doorway: ze zegt precies wat er aan de hand is en wijst door. Maar ze heeft geen eigen inhoud en zal in die vorm niet ranken. Drie opties, in volgorde van mijn voorkeur:

1. **Laten staan zoals hij is.** Hij kost vrijwel niets, de hreflang-set is intern consistent en zodra er Engelse artikelen komen is er niets te herstellen.
2. `noindex` tot er Engelse artikelen zijn. Vermindert een dunne pagina in de index, maar breekt de symmetrie van de hreflang-set, want `/nl/blog` blijft naar een noindex-pagina wijzen.
3. Uit de sitemap halen. Zwakste optie: dat verbergt hem voor de sitemap maar niet voor de crawler, want header en footer linken er gewoon naartoe.

Wat ik **niet** heb gedaan: `noindex` gezet, de sitemapvermelding gewijzigd, taalverwijzingen aangepast of Engelse pagina's verwijderd. De nulmeting in GSC (5 klikken wereldwijd over vier weken) is te klein om hier een crawlbudgetargument op te bouwen.

---

## 7. Gewijzigde bestanden

Mijn diff is gescheiden van het al aanwezige werk door de begin-diff byte-voor-byte te vergelijken met de eind-diff.

**Ongewijzigd gebleven — fase 1 en 2A, byte-voor-byte identiek:**
`src/app/sitemap.ts`, `src/components/build-overview.tsx`, `src/components/project-row.tsx`, `src/lib/content/cases.ts`, `src/lib/content/projects.ts`, `src/lib/content/services.ts`, `src/lib/content/site-content.ts`, `src/lib/seo.ts`.

Dat betekent concreet: **geen enkele title, description, servicetekst of casetekst is aangeraakt.** Alle contentbestanden staan er nog precies zo bij.

**Nieuw in deze ronde:**

| Bestand | Regels | Wat |
|---|---|---|
| `src/lib/content/breadcrumbs.ts` | 68 | trailbouwers per paginasoort, per taal |
| `src/components/breadcrumbs.tsx` | 48 | de zichtbare navigatie (servercomponent) |
| `src/lib/schema.test.ts` | 197 | identiteit, verwijzingen, en het wegblijven van niet-onderbouwde velden |
| `src/lib/content/breadcrumbs.test.ts` | 81 | routes en taalgrenzen van de trails |
| `docs/seo-fase-3-techniek.md` | — | dit rapport |

**Gewijzigd in deze ronde:**

| Bestand | Wat |
|---|---|
| `src/lib/schema.ts` | herschreven tot één graaf: `@id`'s, logo, taal, verwijzingen, `breadcrumbListSchema` |
| `src/components/page-header.tsx` | optionele `breadcrumb`-slot op de plek van `label` |
| `src/app/[locale]/services/[slug]/page.tsx` | crumbs + BreadcrumbList; label vervangen door trail |
| `src/app/[locale]/projecten/[slug]/page.tsx` | idem; `image` op de CreativeWork uit de bestaande cover |
| `src/app/[locale]/blog/[slug]/page.tsx` | crumbs + BreadcrumbList; dubbele blog-link uit de metadatakolom |
| `src/app/[locale]/blog/page.tsx` | pagina-entiteit toegevoegd zodat de Blog-verwijzing oplost |
| 7 overige paginabestanden | alleen `locale` doorgeven aan de schemahelper (één regel per bestand) |
| `docs/seo-artikelmatrix-2026-09-11.md` | de twee gevraagde correcties (§9) |

---

## 8. Uitgevoerde controles

| Controle | Commando / methode | Uitkomst |
|---|---|---|
| Types | `npx tsc --noEmit` | schoon |
| Lint | `npx eslint` | schoon |
| Tests | `npm test` | 11 bestanden, 82 tests, alles groen |
| Build | `npm run build` | geslaagd, 59 pagina's geprerenderd |
| JSON-LD sitewide | alle 38 sitemap-URL's opgehaald en elk `ld+json`-blok geparseerd | 38 blokken, **0 parsefouten**, 160 getypeerde entiteiten, 87 unieke `@id`'s, **0 verwijzingen zonder definitie**, 0 placeholderwaarden |
| NL + EN homepage | handmatig geparseerd | Organization/WebSite identiek op beide, WebPage verschilt per taal |
| NL + EN dienst | handmatig geparseerd | correcte trail en taal per zijde |
| Artikel mét cover | `/nl/blog/website-of-webshop` | `image` aanwezig, `datePublished` 2026-09-11, geen `author`, geen `dateModified` |
| Artikel zónder cover | `/nl/blog/wat-kost-een-maatwerk-website-in-2026` | **geen** `image`, geen logo-terugval |
| NL-case | `/nl/projecten/flexora-bouw` | WebPage + CreativeWork + BreadcrumbList, `creator` → organization |
| Toekomstig artikel | `/nl/blog/van-excel-naar-maatwerksoftware` (`published_at` 2026-09-13) | **404**, en niet in de sitemap |
| Idem, verste record | `/nl/blog/website-code-data-eigendom-vendor-lock-in` (2026-10-19) | **404**, niet in de sitemap |
| Sitemapinhoud | geteld | precies 5 artikel-URL's — gelijk aan de 5 records met `published_at <= 2026-09-11` |
| Ontbrekende Engelse case | `/en/projects/flexora-bouw` | **404**, alleen de NL-case in de sitemap |
| Engelse artikelroute | `/en/blog/website-of-webshop` | **404** |
| Breadcrumbs responsive | headless Chrome op 390 / 820 / 1440 px | geen overloop, 1 `<h1>`, geen geneste anchors, focus werkt |
| Regressie fase 1 | beide homepage-titles, interne diensturls op de homepage | precies één merksuffix per title; webshop- en landingspagina-link aanwezig |
| Regressie fase 2A | projectoverzicht → case, 3D-dienst → case, case → dienst/projecten/contact | alle links intact |

**Wat deze controles níét zijn.**

> **Correctie.** Hier stond dat de Rich Results Test een publieke URL vereist. Dat klopt niet: de tool heeft naast de URL-modus ook een **Code-modus**, waarin je HTML plakt. Publicatie is daarvoor dus geen voorwaarde.

De Code-modus is alsnog geprobeerd, met opgeschoonde fragmenten: een minimaal HTML-document per paginasoort (publiek artikel, dienst, case) met alleen de JSON-LD van die pagina, een `<title>` en een `<h1>`. Geen credentials, geen privégegevens, geen inhoud van geplande artikelen, geen tunnel en niets gepubliceerd. De tool laadde, het CODE-tabblad opende, de code kwam in de editor (2.114 tekens) en de test werd gestart. Daarop antwoordde de tool:

> *Er is iets misgegaan — Log in en probeer het opnieuw.*

De Code-modus vereist in deze context dus een ingelogd Google-account. Inloggen valt buiten de opdracht, dus **externe validatie is niet uitgevoerd**, en dat is een tekortkoming van deze ronde, geen eigenschap van de markup.

Houd daarbij drie dingen uit elkaar. (1) **JSON-syntaxis**: lokaal geverifieerd, 38 blokken foutloos geparseerd. (2) **Schema.org-eigenschappen**: handmatig gecontroleerd tegen de types, en waar een eigenschap niet bij een type hoort is die weggelaten — zoals `inLanguage` en `isPartOf` bij `Service`. (3) **Door Google ondersteunde rich-resulttypen**: dat is een aparte vraag. `Organization`, `BreadcrumbList` en `Article`/`BlogPosting` zijn ondersteund; `WebPage`, `CollectionPage`, `Blog`, `Service` en `CreativeWork` leveren geen eigen rich result op. Dat maakt ze niet ongeldig — het zijn geldige schema.org-types die de graaf samenhang geven — en het is geen reden om er iets aan te veranderen. Er is ook geen fictieve auteur of afbeelding toegevoegd om optionele waarschuwingen te laten verdwijnen.

Een geslaagde build en HTTP 200 zeggen bovendien niets over indexatie of posities.

---

## 9. Correcties in `docs/seo-artikelmatrix-2026-09-11.md`

1. **Telfout.** De samenvattende telling stond al op vijf. De bijbehorende formulering in §9 stond nog op zes en is nu ook vijf: *"alle vijf doelen linken al terug"*. Gecontroleerd tegen de linktabellen van V1–V4: V1 → 1 doel, V2 → 1, V3 → **2**, V4 → 1, samen vijf doelen en vijf links. De "Reden"-velden bij V1 en V3 bevestigen dat die doelen al terugverwezen. Geen ander aantal in het document aangepast.

2. **§5.4 en V8c.** Bij beide staat nu dezelfde herkenbare correctienotitie: de volledige herlezing van artikel `7aa0b94a` heeft de generalisatieclaim weerlegd — het artikel scheidt productlogica al van de renderlaag en schrijft WebGL/Three.js niet universeel voor. Het artikel blijft ongewijzigd, er volgt geen redactionele correctie en **V8c vervalt**. De oorspronkelijke tekst blijft staan als historische context. De matrixregel bij record 23 en de slotparagraaf van §9 verwijzen nu naar die correctie in plaats van naar een openstaand voorbehoud. Geen ander voorstel is uitgevoerd.

---

## 10. Open besluiten

| Punt | Stand |
|---|---|
| **Auteurschap** | `author` is NULL op alle 24 records en er is geen zichtbare auteursvermelding. Het veld blijft leeg tot er een bron is. Wil je YM Creations als organisatie-auteur, dan is dat verdedigbaar — maar leg het dan eerst vast in de records, zodat zichtbaar en machineleesbaar hetzelfde zeggen. |
| **Artikelplanning** | Aangetroffen: één per twee dagen, 11 sep t/m 19 okt 2026. Niets gewijzigd. Vandaag zijn er 5 publiek. |
| **`latin-ext`-preload** | **Afgehandeld** in §11: 20,6 KB en één verzoek minder per koude pageload, glyphs blijven beschikbaar. |
| **Familie/sector in de kruimelregel** | **Afgehandeld** in §11: hersteld als contextregel onder de trail, in beide talen. |
| **Artikeltitel in de kruimel** | Op mobiel wikkelt een lange titel over drie regels, direct boven dezelfde `<h1>`. Correct en zonder overloop, maar een kort kruimellabel per artikel zou fraaier zijn — dat is nieuwe content en viel buiten deze ronde. |
| **Engels blog** | Zie §6. Niets gewijzigd. |
| **Deployment** | De code van fase 1, 2A en 3 staat nog steeds alleen lokaal. `/nl/projecten/flexora-bouw` gaf bij de laatste productiecontrole 404; een lokale build bewijst daar niets over. De artikelwijzigingen van fase 2C staan wél in de database. |
| **`lastModified` in de sitemap** | Cases hebben geen betrouwbare bron en krijgen er daarom geen. Ongewijzigd. |

---

## 11. Afronding: font-preload en contextlabels

Twee gerichte wijzigingen bovenop §1–§10, plus de correcties die hierboven al bij de betrokken paragrafen staan.

### 11.1 De exacte diff van deze ronde

Vier bestanden, samen één regel functionele verandering per onderwerp.

```diff
--- a/src/app/fonts.ts
+++ b/src/app/fonts.ts
 export const grotesk = Schibsted_Grotesk({
-  subsets: ["latin", "latin-ext"],
+  subsets: ["latin"],
   weight: ["400", "500", "600", "700"],
   variable: "--font-grotesk",
   display: "swap",
 });

--- a/src/app/[locale]/services/[slug]/page.tsx
+++ b/src/app/[locale]/services/[slug]/page.tsx
         <PageHeader
           breadcrumb={<Breadcrumbs locale={locale} items={crumbs} />}
+          label={service.familyTitle}
           title={service.title}

--- a/src/app/[locale]/projecten/[slug]/page.tsx
+++ b/src/app/[locale]/projecten/[slug]/page.tsx
         <PageHeader
           breadcrumb={<Breadcrumbs locale={locale} items={crumbs} />}
+          label={project?.sector[locale]}
           title={caseStudy.title}
```

`src/components/page-header.tsx` kreeg er een `HeaderLabels`-hulpfunctie bij die trail en context samen zet in plaats van de een de ander te laten vervangen. Alle overige bestanden uit de werkboom zijn deze ronde **byte-voor-byte ongewijzigd** (19 bestanden), gecontroleerd door de diff van vóór deze ronde te vergelijken met die van erna.

Niet aangeraakt: fontfamilie, gewichten, variabele assen, `display`, fallback en de CSS-variabelen `--font-grotesk` / `--font-mono`; geen fontbestand of `unicode-range` met de hand verwijderd; geen dependency gewijzigd; Link/RSC-prefetch ongemoeid.

### 11.2 Wat `subsets` werkelijk doet

De Next.js-documentatie bij de geïnstalleerde versie (16.1.6) zegt het expliciet: `subsets` is de lijst subsets *"you would like to be **preloaded**"*, en *"fonts specified via `subsets` will have a link preload tag injected into the head"*. Het is dus geen filter op glyphs of bestanden.

Dat is ook in de build te zien, en het bewijs lag al in de repository: **IBM Plex Mono** is altijd al met `subsets: ["latin"]` gedeclareerd en heeft toch vijf `@font-face`-bestanden — latin, latin-ext, vietnamees, cyrillisch en cyrillisch-ext. Alleen de twee latin-bestanden dragen de preload-markering `-s.p.`; de andere drie bestaan, worden geserveerd, en worden niet opgehaald tenzij een pagina er een teken uit nodig heeft.

Na de wijziging gedraagt Grotesk zich precies zo:

| | vóór | na |
|---|---|---|
| Grotesk `@font-face`-regels | 8 (4 gewichten × 2 subsets) | **8, ongewijzigd** |
| Grotesk-bestanden met `unicode-range` | 2 (latin, latin-ext) | **2, ongewijzigd** |
| latin-ext bestandsnaam | `481eac7…-s.**p.**9491d1be.woff2` | `481eac7…-s.9491d1be.woff2` |
| latin-ext bereikbaar | ja | **ja** — HTTP 200, 20.844 bytes |

De `.p.` verdwijnt: dat is precies de preload-markering, en verder verandert er niets.

**Bewezen met een tijdelijke tekstproef** (alleen in de browser, geen productcontent aangeraakt): op `/nl` worden drie fonts opgehaald en latin-ext niet. Daarna is via de console een alinea ingevoegd met tekens uit de volle breedte van de range — `ą ć ę ł ř ś ž Ǧ ȷ ẞ ḿ Ỳ † ℓ Ⱡ ꞗ` — in `var(--font-grotesk)`. Resultaat:

* de browser haalde `481eac7be1c268b7-s.9491d1be.woff2` alsnog op, als vierde fontverzoek;
* `document.fonts` toonde de latin-ext-faces geladen voor 400, 500 én 600;
* de alinea rende in `"Schibsted Grotesk"`, niet in de fallback.

De glyphs zijn dus niet verdwenen; ze worden opgehaald wanneer ze nodig zijn.

### 11.3 Meting vóór en na

Lokale productiebuild (`next build` + `next start`), headless Chrome via het DevTools Protocol, bytes als `encodedDataLength` (werkelijk over de lijn, na compressie), viewport 1440×900, geen throttling.

**Koude cache** — eerste bezoek:

| Route | vóór | na | verschil |
|---|---|---|---|
| `/nl` | 4 verzoeken, 86,9 KB | **3 verzoeken, 66,3 KB** | −1 verzoek, **−20,6 KB** |
| `/en/services/business-websites` | 4 verzoeken, 86,9 KB | **3 verzoeken, 66,3 KB** | −1 verzoek, **−20,6 KB** |
| `/nl/blog/website-of-webshop` | 4 verzoeken, 86,9 KB | **3 verzoeken, 66,3 KB** | −1 verzoek, **−20,6 KB** |

Het aantal `<link rel="preload" as="font">` in de `<head>` ging van 4 naar 3 op alle drie de routes. De paginatotalen zakten navenant: `/nl` van 407,4 naar 386,5 KB, de EN-dienst van 381,1 naar 360,2 KB, het artikel van 374,6 naar 353,7 KB.

**Warme cache** — herladen met cache aan: vóór én na 0,0 KB aan fontbytes. De fonts komen dan uit de cache en er valt niets te besparen.

Daarom, expliciet: **20,6 KB is geen besparing "bij iedere pageload".** Het is de besparing op een koude fontcache — het eerste bezoek van een bezoeker, en elk bezoek nadat de cache is verlopen of geleegd. Binnen één sessie, en bij herhaalbezoek met een geldige cache, is de winst nul. De eerder genoteerde 45,8 KB was bovendien fout; zie de correctie bij Bevinding 1.

De latin-ext-subset bleek niet direct nodig te zijn — nul treffers in 150.130 zichtbare tekens over 38 publieke pagina's en nul in alle 24 artikelrecords, beide getoetst tegen de volledige geserveerde range. Was dat anders geweest, dan was de wijziging niet doorgevoerd.

**Geen visuele regressie.** Het latin-bestand is hetzelfde bestand met dezelfde preload als vóór de wijziging. Gecontroleerd op `/nl`, `/en`, het publieke artikel en de case, na `document.fonts.ready`: de `<h1>` rendert in `"Schibsted Grotesk"` en de labels in `"IBM Plex Mono"` — de echte fonts, niet de fallback — en de cumulatieve layout shift is op alle vier **0,0000**.

### 11.4 De contextlabels, hersteld

De familie en de sector komen weer uit de bestaande content: `service.familyTitle` en `project.sector[locale]`. Geen nieuw label verzonnen, geen H1, title, description of hoofdtekst gewijzigd.

| Pagina | Trail (nav, links) | Context (platte tekst) |
|---|---|---|
| `/nl/diensten/bedrijfswebsite` | Home / Diensten / Bedrijfswebsite | Websites en webshops |
| `/en/services/business-websites` | Home / Services / Business website | Websites and webshops |
| `/nl/diensten/3d-configurator` | Home / Diensten / 3D-configurator | 3D-configurators |
| `/nl/projecten/flexora-bouw` | Home / Projecten / Flexora Bouw | Aanbouw en renovatie |

Gecontroleerd in een echte browser op 390, 820 en 1440 px, voor alle vier de pagina's hierboven — twaalf combinaties, alle met dezelfde uitkomst:

* geen horizontale overloop van de trail, van de contextregel of van de pagina;
* geen geneste anchors, en **nul** links in de contextregel: "Websites en webshops" en "Aanbouw en renovatie" zijn geen kruimels naar een categoriepagina die niet bestaat;
* de contextregel herhaalt nooit de tekst van een kruimel, dus er staat geen dubbele padtekst;
* precies één `<h1>` per pagina, toetsenbordfocus bereikt de eerste kruimel met de globale `:focus-visible`-outline;
* de context staat visueel een trap lager dan de trail: `#8b93a3` (`--color-faint`) tegen `#5d6677` (`--color-muted`) voor de kruimellinks.

Er is geen tweede navigatieregel bij gekomen: de trail is de enige `<nav>`, de context is een `<p>` daaronder.

### 11.5 Controles in deze ronde

| Controle | Uitkomst |
|---|---|
| `npx tsc --noEmit` | schoon |
| `npx eslint` | schoon |
| `npm test` | 11 bestanden, 82 tests groen |
| `npm run build` | geslaagd, 59 pagina's |
| JSON-LD over alle 38 sitemap-URL's | 38 blokken, 0 parsefouten, 160 entiteiten, 87 `@id`'s, 0 verwijzingen zonder definitie, 0 placeholders |
| Homepage-titles NL/EN | precies één merksuffix elk, ongewijzigd |
| `/nl/projecten/flexora-bouw` | 200; overzicht → case en 3D-dienst → case elk 1 link |
| `/en/projects/flexora-bouw` | 404 |
| Geplande artikelen (peildatum **2026-09-11**, eerstvolgende publicatie 2026-09-13) | route 404, niet in sitemap, niet in de listing |
| Artikel-URL's in de sitemap | 5 — gelijk aan de 5 records met `published_at <= current_date` |

De database is alleen gelezen. Er is niets geschreven, geen datum gewijzigd en geen artikel van planning veranderd.

---

## 12. Het lokale pakket, klaar voor publicatiebeoordeling

Nog niets gestaged, niets gecommit, geen git- of hostingmutatie uitgevoerd.

### 12.1 Wat hoort bij welke fase

**Fase 1 — commerciële inhoud van de vijf NL-diensten en de homepageverwijzingen**
`src/lib/content/services.ts`, `src/lib/content/site-content.ts`, `src/lib/seo.ts`, `src/components/build-overview.tsx`

**Fase 2A — de Flexora-case**
`src/lib/content/cases.ts`, `src/lib/content/projects.ts`, `src/components/project-row.tsx`, `src/app/sitemap.ts`, `src/app/[locale]/projecten/[slug]/page.tsx`, `src/app/[locale]/projects/page.tsx`, en nieuw: `src/components/prose-sections.tsx`, `src/lib/content/cases.test.ts`

**Fase 3 — structured data, breadcrumbs, contextlabels, font-preload**
`src/lib/schema.ts`, `src/components/page-header.tsx`, `src/app/fonts.ts`, `src/app/[locale]/services/[slug]/page.tsx`, `src/app/[locale]/blog/[slug]/page.tsx`, `src/app/[locale]/blog/page.tsx`, en `locale`-doorgifte in `algemene-voorwaarden`, `contact`, `how-we-work`, `page`, `pricing`, `project-planner`, `projects`, `services`. Nieuw: `src/components/breadcrumbs.tsx`, `src/lib/content/breadcrumbs.ts`, `src/lib/content/breadcrumbs.test.ts`, `src/lib/schema.test.ts`
Enkele bestanden dragen werk van meerdere fasen; `projecten/[slug]/page.tsx` en `services/[slug]/page.tsx` zijn in 2A én 3 aangeraakt.

**Documentatie:** `docs/seo-artikelmatrix-2026-09-11.md`, `docs/seo-fase-3-techniek.md`

### 12.2 Wat buiten een commit hoort

`.codex/` is untracked en heeft niets met deze fasen te maken — dat is lokale toolconfiguratie en hoort niet mee. Controleer ook of `docs/` in dit project bedoeld is om mee te gaan; de twee rapporten zijn intern werk, geen sitecontent. Verder staan er geen onbekende untracked bestanden in de werkboom. Er zijn deze ronde geen secrets aangeraakt of vastgelegd: `.env.local` valt onder de `.env*`-regel in `.gitignore`, is niet bij git bekend, en is alleen door de build gelezen.

### 12.3 Build- en deploymentvoorziening

Wat in de repository staat: npm (`package-lock.json`), Next.js 16.1.6 met Turbopack, en de scripts `build` (`next build`), `start` (`next start`), `lint` (`eslint`) en `test` (`vitest run`) in `package.json`. De remote is `github-work:MajdWebCreation/portfolio-site`, branch `main`.

Wat er **niet** in staat: geen `.github/workflows`, geen `vercel.json`, geen `.vercel`-map, geen Dockerfile, geen andere CI-configuratie. De repository bewijst dus zelf niet welke hostingvoorziening er draait. Vercel is de stack die voor dit project is opgegeven, wat erop wijst dat de deployment via de Vercel↔GitHub-integratie loopt — een push naar `main` bouwt en deployt dan automatisch. **Bevestig dat in het Vercel-dashboard voordat je pusht**, samen met de productiebranch en de omgevingsvariabelen: de publieke site leest Supabase als `anon`, dus de `NEXT_PUBLIC_*`-variabelen moeten daar ingesteld staan. Lokaal komen die uit `.env.local`, en dat bestand kan niet meeliften — `.gitignore` sluit `.env*` uit op `.env.example` na, en git kent het bestand niet.

### 12.4 Na publicatie te controleren

| URL | Waarop |
|---|---|
| `https://ymcreations.com/nl/projecten/flexora-bouw` | **eerst** — gaf bij de laatste productiecontrole 404; moet 200 worden |
| `https://ymcreations.com/nl/diensten/bedrijfswebsite` | breadcrumb + contextregel, JSON-LD-graaf |
| `https://ymcreations.com/en/services/business-websites` | Engelse trail en context |
| `https://ymcreations.com/nl/blog/website-of-webshop` | BlogPosting, cover, breadcrumb |
| `https://ymcreations.com/nl/blog/wat-kost-een-maatwerk-website-in-2026` | artikel zonder cover: geen `image`, geen logo-terugval |
| `https://ymcreations.com/nl` en `/en` | Organization, WebSite, logo bereikbaar |
| `https://ymcreations.com/images/branding/ym-favicon-mark.png` | 200, niet geblokkeerd |
| `https://ymcreations.com/sitemap.xml` | aantal artikel-URL's = aantal records met `published_at <= vandaag` |
| `https://ymcreations.com/en/projects/flexora-bouw` | moet 404 blijven |
| Rich Results Test, URL-modus | nu wél mogelijk; draai hem op de case, een dienst en een artikel |

### 12.5 Publicatieblokkades versus vervolgstappen

**Blokkades: geen.** Typecheck, lint, tests en build zijn groen, de schemagraaf is sluitend, geplande artikelen blijven afgeschermd en de fase 1/2A-content is intact.

**Geen blokkade, wel open:**

* **Auteurschap.** `author` is leeg op alle 24 records. Correcte, publiceerbare content hoeft daar niet op te wachten; `author` is een optioneel veld en verschijnt vanzelf zodra een record een auteur noemt.
* **Artikelplanning.** Oorspronkelijke voorkeur ma/wo/vr vanaf 14 september, aangetroffen elke twee dagen vanaf 11 september. Open besluit, niets gewijzigd, geen publiek artikel teruggezet.
* **Engels blog.** Zie §6: `/en/blog` geeft 200, is indexeerbaar, staat in de sitemap met hreflang `en`/`nl`/`x-default`, toont een eerlijke lege staat met een link naar `/nl/blog`, en heeft geen Engelse artikelroutes (`/en/blog/<slug>` geeft 404). **Aanbeveling: laten staan zoals hij is.** Hij kost vrijwel niets, de hreflang-set is intern consistent, en zodra er Engelse artikelen komen is er niets te herstellen. `noindex` zou de hreflang-symmetrie breken; uit de sitemap halen verbergt hem niet voor de crawler, want header en footer linken ernaartoe. Niets gewijzigd aan noindex, sitemap of taalbeleid.
* **Externe validatie.** Rich Results Test Code-modus vraagt om inloggen; na publicatie is de URL-modus de eenvoudigste weg.

**Status: lokaal gereed voor publicatiebeoordeling.** Niets van dit pakket staat live of is geïndexeerd; de artikelwijzigingen van fase 2C staan wél al in Supabase.
