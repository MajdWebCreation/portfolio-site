# Artikelmatrix en interne-linkanalyse

**Peildatum:** 11 september 2026, 21:32 CEST (19:32 UTC)
**Branch/commit:** `main` @ `c501d08`, met de ongecommitte wijzigingen van fase 1 en fase 2A in de werkboom
**Bron artikelinhoud:** live Supabase-tabel `public.articles`, read-only gelezen (24 records). Dit is een actuele databasecontrole, geen migratie-export.
**Bron publicatieregel:** `supabase/migrations/20260910184849_articles_public_read.sql` (RLS) en `src/components/article-rich-text.tsx` (renderer)
**Analyseronde — geen codewijziging, geen databasewrite.** Dit bestand is het enige nieuwe bestand.

---

## 1. Publicatieregel zoals die werkelijk geldt

`published_at` is een `date`-kolom zonder tijd of tijdzone. De RLS-policy geeft een rij vrij zodra:

```
status = 'published'
and published_at is not null
and published_at <= (now() at time zone 'utc')::date
```

Praktisch betekent dat: **een artikel wordt publiek op zijn datum om 00:00 UTC**, dus om 02:00 Nederlandse tijd in de zomertijd en 01:00 in de wintertijd. Alle 24 records staan op `status = 'published'`; het verschil tussen publiek en gepland zit uitsluitend in de datum. De blogroutes draaien op ISR met `revalidate = 3600`, dus de zichtbaarheid op de site loopt maximaal een uur achter op dat moment.

De renderer degradeert een link naar een `/nl/blog/`-pad dat nog niet publiek is tot platte tekst (`<span>`). Die bescherming geldt **alleen** voor artikelpaden. Een link naar een dienst-, project- of casepagina wordt altijd als link gerenderd, ook als die pagina niet bestaat.

**Stand op de peildatum:** 5 artikelen publiek, 19 gepland.

---

## 2. Artikelmatrix (24 records)

Cluster = `category`-waarde in de database. "Dienstlinks nu" = contextuele links in de lopende tekst naar `/nl/diensten/*`, genormaliseerd en ontdubbeld per artikel; navigatie, footer en het CTA-blok onder het artikel tellen niet mee.

### 2.1 Publiek op de peildatum (5)

| # | ID (kort) | Titel | Slug | Cluster | published_at | Primaire zoekvraag (uit inhoud) | Intentie | Commerciële doelpagina | Dienstlinks nu | Actie / prioriteit |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `43e257f4` | Wat kost een maatwerk website in 2026? | `wat-kost-een-maatwerk-website-in-2026` | websites | 2026-01-28 | Waarom lopen offertes voor een maatwerk website zo uiteen, en is maatwerk mijn investering waard? | Commercieel, oriëntatiefase | `/nl/diensten/bedrijfswebsite` | bedrijfswebsite, landingspagina, redesign-optimalisatie, performance | **P1** – doorverwijzing naar de nieuwe kostenanalyse ontbreekt |
| 2 | `d3848539` | Checklist: launch-ready website (SEO + performance) | `checklist-launch-ready-website-seo-performance` | websites | 2026-02-11 | Wat moet ik technisch en inhoudelijk controleren vóór een site live gaat? | Informatief, operationeel | `/nl/diensten/bedrijfswebsite` | bedrijfswebsite, redesign-optimalisatie, performance | **P1** – geen enkele doorverwijzing naar de bibliotheek |
| 3 | `690c251c` | Webapplicatie laten maken: stappenplan van idee naar live | `webapplicatie-laten-maken-stappenplan` | webapplicaties | 2026-02-25 | Hoe vertaal ik een idee naar een eerste versie van een webapplicatie? | Commercieel, onderzoek | `/nl/diensten/webapplicatie-laten-maken` | performance, webapplicatie-laten-maken | **P1** – enige publieke ingang naar de webapp-dienst, zonder vervolg |
| 4 | `2ca6165b` | INP uitgelegd: hoe maak je een site écht responsief? | `inp-uitgelegd-hoe-maak-je-een-site-echt-responsief` | websites | 2026-03-10 | Waarom voelt mijn site stroef, en wat meet INP precies? | Informatief, technisch | `/nl/diensten/performance` | performance, redesign-optimalisatie, bedrijfswebsite | **P2** – hub-artikel over Core Web Vitals volgt op 9 okt |
| 5 | `38fee484` | Website of webshop? Wanneer heb je welk type platform nodig? | `website-of-webshop` | websites | 2026-09-11 | Heb ik een bedrijfswebsite met aanvraagflow nodig of een echte webshop? | Commercieel, beslissend | `/nl/diensten/webshop-laten-maken` + `/nl/diensten/bedrijfswebsite` | bedrijfswebsite, webshop-laten-maken | **P1** – 3 van de 4 artikellinks zijn vandaag inert |

### 2.2 Gepland (19)

| # | ID (kort) | Titel | Slug | Cluster | published_at | Primaire zoekvraag (uit inhoud) | Intentie | Commerciële doelpagina | Dienstlinks nu | Actie / prioriteit |
|---|---|---|---|---|---|---|---|---|---|---|
| 6 | `3b1f7560` | Van Excel en workarounds naar software | `van-excel-naar-maatwerksoftware` | webapplicaties | 2026-09-13 | Wanneer is mijn spreadsheetproces toe aan echte software? | Probleemherkenning → commercieel | `/nl/diensten/webapplicatie-laten-maken` | webapplicatie-laten-maken | Behouden |
| 7 | `57210deb` | Wat is een 3D-productconfigurator? | `wat-is-een-3d-productconfigurator` | configurators | 2026-09-15 | Wat is een productconfigurator en waarin verschilt hij van een 3D-viewer? | Informatief | `/nl/diensten/3d-configurator` | 3d-configurator | **P3** – casebewijs toevoegen na deploy |
| 8 | `7157ea3e` | Welke bedrijfsprocessen moet je automatiseren — en welke juist niet? | `welke-bedrijfsprocessen-moet-je-automatiseren` | automatisering | 2026-09-17 | Welke processen zijn geschikt om te automatiseren? | Informatief, strategisch | `/nl/diensten/koppelingen-automatisering` | koppelingen-automatisering | Behouden |
| 9 | `69b4a3f9` | Wat kost een website of webshop? | `wat-kost-een-website-of-webshop` | websites | 2026-09-19 | Waar komt het prijsverschil vandaan en hoe vergelijk ik offertes? | Commercieel, vergelijkend | `/nl/diensten/bedrijfswebsite` + `/nl/diensten/webshop-laten-maken` | bedrijfswebsite, webshop-laten-maken | Behouden |
| 10 | `1c608fbb` | Hoe beoordeel je de technische kwaliteit van een website of webapp? | `technische-kwaliteit-website-webapp-beoordelen` | techniek | 2026-09-21 | Hoe beoordeel ik technische kwaliteit zonder zelf developer te zijn? | Evaluatief | `/nl/diensten/redesign-optimalisatie` | redesign-optimalisatie | Behouden (optie: webapp-link) |
| 11 | `15992c74` | Maatwerksoftware of standaardsoftware? | `maatwerksoftware-of-standaardsoftware` | webapplicaties | 2026-09-23 | SaaS, WordPress, low-code of maatwerk — wat past bij mijn proces? | Commercieel, vergelijkend | `/nl/diensten/webapplicatie-laten-maken` | webapplicatie-laten-maken | Behouden |
| 12 | `fdca2138` | Wanneer is een 3D-productconfigurator zinvol voor je bedrijf? | `wanneer-is-een-3d-productconfigurator-zinvol` | configurators | 2026-09-25 | Loont een configurator voor mijn product en verkoopproces? | Commercieel, beslissend | `/nl/diensten/3d-configurator` | 3d-configurator | **P3** – casebewijs toevoegen na deploy |
| 13 | `13e14e1a` | Zapier, Make of maatwerk? | `zapier-make-of-maatwerk` | automatisering | 2026-09-27 | Kan een no-codeplatform dit dragen of moet het maatwerk zijn? | Commercieel, vergelijkend | `/nl/diensten/koppelingen-automatisering` | koppelingen-automatisering | Behouden |
| 14 | `4b3948fd` | Website vernieuwen: optimaliseren, redesignen, herbouwen of replatformen? | `website-vernieuwen-optimaliseren-redesign-herbouwen-replatformen` | websites | 2026-09-29 | Welke ingreep heeft mijn verouderde site nodig? | Commercieel, beslissend | `/nl/diensten/redesign-optimalisatie` + `/nl/diensten/bedrijfswebsite` | bedrijfswebsite, redesign-optimalisatie | Behouden |
| 15 | `11510563` | Wat kost een webapplicatie? | `wat-kost-een-webapplicatie` | webapplicaties | 2026-10-01 | Waar hangen de kosten van een webapplicatie werkelijk van af? | Commercieel | `/nl/diensten/webapplicatie-laten-maken` | webapplicatie-laten-maken | Behouden |
| 16 | `c95053d8` | Technische schuld in software | `technische-schuld-software` | techniek | 2026-10-03 | Waarom kosten kleine wijzigingen steeds meer tijd? | Informatief | `/nl/diensten/redesign-optimalisatie` | redesign-optimalisatie | Behouden |
| 17 | `7627cc8b` | API-koppeling laten maken | `api-koppeling-laten-maken` | automatisering | 2026-10-05 | Wat maakt een integratie betrouwbaar en onderhoudbaar? | Commercieel, onderzoek | `/nl/diensten/koppelingen-automatisering` | koppelingen-automatisering | Behouden (11 inkomende links: hub van het cluster) |
| 18 | `f648506c` | Wat kost een 3D-productconfigurator? | `wat-kost-een-3d-productconfigurator` | configurators | 2026-10-07 | Waar hangen de ontwikkelkosten van een configurator van af? | Commercieel | `/nl/diensten/3d-configurator` | 3d-configurator | Behouden (optie: case) |
| 19 | `b14b9881` | Core Web Vitals en websiteperformance | `core-web-vitals-websiteperformance` | websites | 2026-10-09 | Wat moet mijn bedrijf werkelijk met Core Web Vitals? | Informatief | `/nl/diensten/performance` | performance | Behouden |
| 20 | `7f437f17` | Klantportaal laten maken | `klantportaal-laten-maken` | webapplicaties | 2026-10-11 | Wanneer levert selfservice voor klanten echt waarde op? | Commercieel, beslissend | `/nl/diensten/webapplicatie-laten-maken` | webapplicatie-laten-maken | Behouden |
| 21 | `bd8882a6` | Website koppelen aan CRM | `website-koppelen-aan-crm` | automatisering | 2026-10-13 | Hoe komen formulierleads betrouwbaar in mijn CRM? | Commercieel, onderzoek | `/nl/diensten/koppelingen-automatisering` | koppelingen-automatisering | Behouden |
| 22 | `747ba7b4` | Wat gebeurt er na livegang? | `technisch-onderhoud-website-webapp-na-livegang` | techniek | 2026-10-15 | Wat houdt technisch onderhoud na oplevering in? | Informatief, nazorg | `/nl/diensten/redesign-optimalisatie` (zwak) | redesign-optimalisatie | Behouden |
| 23 | `7aa0b94a` | Hoe werkt een 3D-productconfigurator technisch? | `hoe-werkt-een-3d-productconfigurator-technisch` | configurators | 2026-10-17 | Hoe zit een configurator technisch in elkaar? | Technisch informatief | `/nl/diensten/3d-configurator` | 3d-configurator | Behouden — het voorbehoud in 5.4 is weerlegd, zie de correctie daar |
| 24 | `6b8c2178` | Van wie zijn je website, code, data en accounts? | `website-code-data-eigendom-vendor-lock-in` | techniek | 2026-10-19 | Ben ik eigenaar van wat ik heb laten bouwen? | Informatief, risico | `/nl/diensten/bedrijfswebsite` + `/nl/diensten/webapplicatie-laten-maken` | bedrijfswebsite, webapplicatie-laten-maken | Behouden |

**Onderscheid oud/nieuw is structureel aantoonbaar.** De twintig nieuwe artikelen (#5 t/m #24) sluiten alle af met een H2 `Bronnen` en hebben een cover in `featured_image`; de vier oudere (#1 t/m #4) sluiten af met `Praktische conclusie`, hebben geen cover en geen enkele link naar een ander artikel. `created_at` is voor alle records 10 of 11 september 2026 en zegt dus niets over de herkomst — de `published_at` van #1 t/m #4 (jan–mrt) is teruggezet bij de import.

---

## 3. Clustermatrix

| Querycluster | Primaire doelpagina | Ondersteunende artikelen (werkelijk aanwezig) | Dekking nu publiek | Dekking na 19 okt | Kans / prioriteit |
|---|---|---|---|---|---|
| Website laten maken | `/nl/diensten/bedrijfswebsite` | #1, #2, #4, #5, #9, #14, #24 (7) | 4 van 7 | 7 | Sterkst gedekte cluster; vooral doorverwijzing repareren |
| Webshop laten maken | `/nl/diensten/webshop-laten-maken` | #5, #9 (2) | 1 van 2 | 2 | **Grootste gat.** Commercieel hoofddoel met de dunste ondersteuning |
| Webapp / klantportaal / maatwerksoftware | `/nl/diensten/webapplicatie-laten-maken` | #3, #6, #11, #15, #20, #24 (6) | 1 van 6 | 6 | Goed gevuld, maar nu vrijwel onzichtbaar |
| API's en automatisering | `/nl/diensten/koppelingen-automatisering` | #8, #13, #17, #21 (4) | **0 van 4** | 4 | Geen enkele publieke ingang tot 17 sep |
| 3D-configurator | `/nl/diensten/3d-configurator` | #7, #12, #18, #23 (4) | **0 van 4** | 4 | Geen enkele publieke ingang tot 15 sep; Flexora-case is hier het onderscheidende bewijs |
| *(buiten de vijf)* Redesign en herbouw | `/nl/diensten/redesign-optimalisatie` | #1, #2, #4, #10, #14, #16, #22 (7) | 3 van 7 | 7 | Krijgt evenveel ondersteuning als de website-cluster zonder in de doelmatrix te staan |
| *(buiten de vijf)* Performance | `/nl/diensten/performance` | #1, #2, #3, #4, #19 (5) | 4 van 5 | 5 | Nu het best gedekte doel — vooral omdat de oude artikelen ernaartoe wijzen |
| *(buiten de vijf)* Landingspagina | `/nl/diensten/landingspagina` | #1 (1) | 1 van 1 | 1 | Geen eigen artikel |

**Zelf een website maken vs. laten bouwen.** In de hele bibliotheek staat geen artikel dat de doe-het-zelfvraag behandelt (website bouwen met WordPress/Wix/Squarespace als eigen handeling). Het dichtst in de buurt komt #11, en dat vergelijkt WordPress uitdrukkelijk als *oplossingsvorm bij een leverancierskeuze*, niet als zelfbouwroute. Die scheiding is nu zuiver en het advies is die zo te houden: een zelfbouwartikel trekt ander publiek dan de vijf commerciële doelpagina's. De homepage blijft breed met "Digitale producten, gebouwd rond hoe jouw bedrijf werkt."

---

## 4. Interne links: gemeten stand

Alle tellingen komen uit een recursieve walk over de ProseMirror-boom, dus inclusief links in lijsten en tabellen. Interne hrefs zijn uitsluitend relatief (`/nl/...`); er zijn **0** absolute interne URL's, **0** trailing slashes, **0** fragmenten en **0** links naar `/en/`. Normalisatie was daarom niet nodig.

**211 linkmarks totaal:** 78 extern (alle in de `Bronnen`-lijst onderaan), 133 in lopende tekst. Van die 133 gaan er 36 naar een dienstpagina en 97 naar een ander artikel. **Nul links wijzen naar `/nl/projecten`, `/nl/tarieven`, `/nl/contact`, `/nl/werkwijze` of `/nl/projectplanner`.**

### 4.1 Unieke artikelen met een contextuele link per dienst

| Dienstpagina | Artikelen totaal | Waarvan nu publiek | Waarvan gepland |
|---|---|---|---|
| `/nl/diensten/redesign-optimalisatie` | 7 | 3 | 4 |
| `/nl/diensten/bedrijfswebsite` | 7 | 4 | 3 |
| `/nl/diensten/webapplicatie-laten-maken` | 6 | 1 | 5 |
| `/nl/diensten/performance` | 5 | 4 | 1 |
| `/nl/diensten/3d-configurator` | 4 | **0** | 4 |
| `/nl/diensten/koppelingen-automatisering` | 4 | **0** | 4 |
| `/nl/diensten/webshop-laten-maken` | 2 | 1 | 1 |
| `/nl/diensten/landingspagina` | 1 | 1 | 0 |

Dit zijn tellingen van aanwezige links, geen autoriteits- of rankingscore.

### 4.2 Twee structurele bevindingen

**a. De vier oudste artikelen zijn doodlopend.** #1 t/m #4 hebben samen **nul** uitgaande artikellinks. Zij zijn, samen met #5, het enige dat een crawler vandaag van de bibliotheek ziet, en zij leiden nergens heen binnen die bibliotheek. Omgekeerd krijgen ze samen 10 inkomende links — maar allemaal uit artikelen die nog moeten verschijnen.

**b. 34 van de 97 artikellinks zijn vooruitverwijzingen.** Zij wijzen naar een artikel dat later publiceert dan de bron. De renderer voorkomt de 404 en toont platte tekst, dus er breekt niets, maar de lezer ziet een niet-klikbare verwijzing en een crawler ziet geen link. De inertieduur loopt van 2 tot 32 dagen. Vandaag zijn er drie zichtbaar inert, alle drie in #5:

| Bron | Doel | Doel publiek op | Nu inert |
|---|---|---|---|
| `website-of-webshop` (blok 37) | `klantportaal-laten-maken` | 2026-10-11 | ja, nog 30 dagen |
| `website-of-webshop` (blok 38) | `wat-is-een-3d-productconfigurator` | 2026-09-15 | ja, nog 4 dagen |
| `website-of-webshop` (blok 47) | `website-vernieuwen-...-replatformen` | 2026-09-29 | ja, nog 18 dagen |

De interne linkstructuur van de bibliotheek is pas op **19 oktober 2026** volledig actief.

---

## 5. Inhoudelijke overlap — beoordeeld, geen samenvoegadvies

Er is **geen bewezen cannibalisatie**. De GSC-baseline bevat te weinig data (5 klikken, 60 vertoningen, 7 vertoningen op queryniveau) om rankingschade vast te stellen. Wat volgt is een inhoudelijke beoordeling van overlap als risico.

### 5.1 De twee kostenartikelen — verschillend, behouden

| | #1 `wat-kost-een-maatwerk-website-in-2026` | #9 `wat-kost-een-website-of-webshop` |
|---|---|---|
| Lezersvraag | Is maatwerk deze investering waard, en waarom verschillen offertes zo? | Waaruit bestaat de scope, en hoe vergelijk ik twee offertes eerlijk? |
| Beslisfase | Oriëntatie, vóór er offertes zijn | Vergelijking, met offertes op tafel |
| Doelgroep | Ondernemer die twijfelt tussen template en maatwerk | Inkoper/ondernemer die concrete voorstellen naast elkaar legt |
| Reikwijdte | Alleen website | Website **en** webshop, met een eigen sectie over waarom webshops sneller complex worden |
| Invalshoek | Positionering, ambitie, uitstraling ("positie innemen", "premium", "studio") | Scope-decompositie: CMS, e-commerce, integraties, migratie, SEO-migratie, meertaligheid, toegankelijkheid, privacy, performance, hosting, onderhoud, testen, samenwerking |
| Bewijsvoering | Geen bronnen, geen tabel | Scopevergelijkingstabel, offertechecklist, bronnenlijst, expliciete weigering om een gemiddelde marktprijs te noemen |
| Omvang | 7 H2, 30 alinea's | 13 H2, 32 alinea's |

**Conclusie: niet samenvoegen, geen canonical wijzigen.** Dit zijn twee verschillende vragen in twee verschillende fasen. #9 verwijst al terug naar #1 ("Wat een maatwerk website kost", blok 4). Wat ontbreekt is de omgekeerde richting: #1 is publiek en indexeerbaar en wijst nergens naar de completere analyse. Dat is voorstel **V1**.

### 5.2 Techniek, performance en redesign — zeven artikelen, zeven vragen

| Artikel | Onderscheidende lezersvraag | Overlaprisico |
|---|---|---|
| #2 checklist launch-ready | Wat check ik vóór livegang? | Laag — vóór livegang |
| #22 technisch onderhoud na livegang | Wat gebeurt er ná livegang? | Laag — complementair aan #2 |
| #4 INP uitgelegd | Waarom voelt interactie traag, en wat meet INP? | **Middel** t.o.v. #19 |
| #19 Core Web Vitals | Wat moet mijn bedrijf met deze meetwaarden? | **Middel** t.o.v. #4 |
| #10 technische kwaliteit beoordelen | Hoe beoordeel ik een bestaand product? | Laag |
| #16 technische schuld | Waarom worden wijzigingen steeds duurder? | Laag — #10 is diagnose, #16 is oorzaakverklaring |
| #14 website vernieuwen | Welke ingreep is nodig? | Laag |

Het enige echte overlappaar is **#4 en #19**: INP is een van de drie Core Web Vitals. De rolverdeling is verdedigbaar — #19 is het overzichtsartikel op bedrijfsniveau (labdata vs. field data, wat het wel en niet voor SEO betekent), #4 is de verdieping op één metriek met concrete verbeterrichtingen. #19 verwijst al naar #4. De omgekeerde richting ontbreekt; dat is voorstel **V4**. Samenvoegen wordt afgeraden: dan verdwijnt óf het bedrijfsperspectief óf de technische diepgang.

### 5.3 Overige overlap
`#6 van-excel` en `#11 maatwerksoftware-of-standaardsoftware` raken elkaar (wanneer maatwerk?), maar #6 vertrekt vanuit een herkenbaar probleem (spreadsheets) en #11 vanuit een leverancierskeuze tussen vijf oplossingsvormen. Ze linken al over en weer. Behouden.

### 5.4 Voorbehoud bij #23 en de Flexora-case
#23 `hoe-werkt-een-3d-productconfigurator-technisch` beschrijft de renderlaag consequent als realtime browser-3D: WebGL, Three.js, glTF/GLB, draw calls, LOD, KTX2. De Flexora-case documenteert juist een **niet-realtime** aanpak: gestapelde, vooraf gerenderde `.webp`-beeldlagen, zonder canvas of WebGL in de geserveerde pagina. Een caselink in de renderlaagsectie van #23 zou impliceren dat Flexora een Three.js-build is, wat het bewijs tegenspreekt. **Daarom geen caselink in #23**, tenzij het artikel eerst een alinea krijgt die de vooraf-gerenderde variant als geldige aanpak benoemt. Dat is redactioneel werk, geen linkwijziging, en staat hieronder als optioneel voorstel **V8**.

> **Correctie (fase 3, herlezing van het volledige record).** Het voorbehoud hierboven is **weerlegd**. Artikel #23 is integraal herlezen: het scheidt productlogica al van de renderlaag en schrijft WebGL/Three.js niet universeel voor. De generalisatieclaim waarop dit voorbehoud steunde, klopt niet. Het artikel blijft ongewijzigd behouden, er volgt geen redactionele correctie, en **V8c vervalt**. De tekst hierboven blijft staan als historische context, niet als uitvoeringsinstructie.


---

## 6. Concrete wijzigingsvoorstellen

Elk voorstel geeft record-ID, slug, het te herkennen oorspronkelijke fragment en de voorgestelde vervanging. De ProseMirror-structuur blijft intact: het gaat telkens om het toevoegen of uitbreiden van tekst binnen een bestaande `paragraph`-node, met een `link`-mark op de aangegeven ankertekst. Er wordt geen node toegevoegd of verwijderd, tenzij expliciet vermeld.

### P1 — noodzakelijk herstel

---

**V1. #1 `43e257f4` / `wat-kost-een-maatwerk-website-in-2026` — slotalinea (blok 42)**

*Oorspronkelijk:*
> Wil je eerst scherper krijgen of je project richting een bedrijfswebsite, een landingspagina, een redesign of een traject met performance-optimalisatie gaat? Dan is dat meestal de beste eerste stap vóór je bedragen gaat vergelijken.

*Voorgesteld:*
> Wil je eerst scherper krijgen of je project richting een bedrijfswebsite, een landingspagina, een redesign of een traject met performance-optimalisatie gaat? Dan is dat meestal de beste eerste stap vóór je bedragen gaat vergelijken. Gaat het juist om het vergelijken van concrete offertes, dan loopt **wat een website of webshop kost** de scopeonderdelen één voor één langs.

| | |
|---|---|
| Linkdoel | `/nl/blog/wat-kost-een-website-of-webshop` |
| Ankertekst | `wat een website of webshop kost` |
| Reden | #1 is publiek en indexeerbaar en heeft nul uitgaande artikellinks. #9 verwijst al terug; dit maakt het paar wederkerig en geeft de lezer in de oriëntatiefase de vervolgstap naar de vergelijkingsfase. |
| Afhankelijkheid | Link is inert tot **19 sep 2026**. Mag nu worden geschreven (renderer degradeert netjes), maar levert pas vanaf die datum een echte link op. |

---

**V2. #2 `d3848539` / `checklist-launch-ready-website-seo-performance` — slotalinea (blok 51)**

*Oorspronkelijk:*
> Wil je een site live zetten of een bestaande site kritisch nalopen op SEO, structuur en performance? Dan sluit een traject rond redesign & optimalisatie, performance of een nieuwe bedrijfswebsite daar logisch op aan.

*Voorgesteld:*
> Wil je een site live zetten of een bestaande site kritisch nalopen op SEO, structuur en performance? Dan sluit een traject rond redesign & optimalisatie, performance of een nieuwe bedrijfswebsite daar logisch op aan. Deze checklist stopt bij livegang; **wat er daarna aan technisch onderhoud bij komt kijken** is een eigen verhaal.

| | |
|---|---|
| Linkdoel | `/nl/blog/technisch-onderhoud-website-webapp-na-livegang` |
| Ankertekst | `wat er daarna aan technisch onderhoud bij komt kijken` |
| Reden | Sluit de logische keten pre-livegang → post-livegang. #2 is publiek, heeft nul uitgaande artikellinks en is het enige publieke artikel met een operationele lezer. |
| Afhankelijkheid | Inert tot **15 okt 2026**. |

---

**V3. #3 `690c251c` / `webapplicatie-laten-maken-stappenplan` — slotalinea (blok 51)**

*Oorspronkelijk:*
> Wil je een idee vertalen naar een eerste scope voor een webapplicatie? Of wil je eerst bepalen welke onderdelen in een eerste versie thuishoren en waar performance of latere uitbreiding een rol spelen? Dan is een goede intake meestal de slimste eerste stap.

*Voorgesteld:*
> Wil je een idee vertalen naar een eerste scope voor een webapplicatie? Of wil je eerst bepalen welke onderdelen in een eerste versie thuishoren en waar performance of latere uitbreiding een rol spelen? Dan is een goede intake meestal de slimste eerste stap. Speelt de vraag of het überhaupt maatwerk moet worden, begin dan bij **maatwerksoftware of standaardsoftware**; gaat het vooral om het budget, dan legt **wat een webapplicatie kost** uit welke factoren de scope bepalen.

| | |
|---|---|
| Linkdoel 1 | `/nl/blog/maatwerksoftware-of-standaardsoftware`, anker `maatwerksoftware of standaardsoftware` |
| Linkdoel 2 | `/nl/blog/wat-kost-een-webapplicatie`, anker `wat een webapplicatie kost` |
| Reden | #3 is vandaag de **enige** publieke ingang naar de webapp-dienst en heeft geen vervolg. Beide doelen linken al terug naar #3, dus dit maakt twee bestaande relaties wederkerig. |
| Afhankelijkheid | Inert tot resp. **23 sep** en **1 okt 2026**. |

---

**V4. #4 `2ca6165b` / `inp-uitgelegd-hoe-maak-je-een-site-echt-responsief` — slotalinea (blok 58)**

*Oorspronkelijk:*
> Wil je dat een site niet alleen mooier oogt, maar ook sneller, directer en verfijnder aanvoelt in gebruik? Dan ligt de logische volgende stap meestal bij performance optimalisatie, soms gecombineerd met redesign & optimalisatie of een sterkere basis voor een bedrijfswebsite.

*Voorgesteld:*
> Wil je dat een site niet alleen mooier oogt, maar ook sneller, directer en verfijnder aanvoelt in gebruik? Dan ligt de logische volgende stap meestal bij performance optimalisatie, soms gecombineerd met redesign & optimalisatie of een sterkere basis voor een bedrijfswebsite. INP is één van de drie Core Web Vitals; **wat je bedrijf met die meetwaarden moet** zet ze naast elkaar en laat zien waar ze wel en niet over gaan.

| | |
|---|---|
| Linkdoel | `/nl/blog/core-web-vitals-websiteperformance` |
| Ankertekst | `wat je bedrijf met die meetwaarden moet` |
| Reden | Maakt de hub/spoke-relatie uit 5.2 wederkerig en positioneert #4 expliciet als verdieping onder #19, wat het overlaprisico tussen beide verkleint. |
| Afhankelijkheid | Inert tot **9 okt 2026**. |

---

**V5. #5 `38fee484` / `website-of-webshop` — drie inerte verwijzingen**

Geen tekstwijziging voorgesteld. De drie vooruitverwijzingen (blokken 37, 38, 47) zijn inhoudelijk correct geplaatst en worden vanzelf klikbaar op 15 sep, 29 sep en 11 okt. **Advies: laten staan en niet herschrijven.** Het alternatief — de links nu verwijderen en later terugzetten — kost twee bewerkingen en levert alleen tijdens de tussenperiode iets op.

Wel te overwegen bij de uitvoering: als #5 in die periode aantoonbaar verkeer krijgt, is de enige inerte verwijzing met een lange looptijd die naar `klantportaal-laten-maken` (30 dagen). Die staat in een alinea over "wanneer je verder moet kijken dan een webshop" en kan desgewenst tijdelijk worden vervangen door een link naar `/nl/diensten/webapplicatie-laten-maken`, die wél bestaat. Dat is een keuze, geen defect.

---

### P2 — duidelijk ontbrekende vervolgstap

---

**V6. #9 `69b4a3f9` / `wat-kost-een-website-of-webshop` — webshopdekking versterken**

De webshop-cluster heeft maar twee ondersteunende artikelen. #9 en #5 zijn allebei al gelinkt aan `/nl/diensten/webshop-laten-maken`. Er is binnen de bestaande bibliotheek **geen** derde artikel dat die dienst zinvol kan ondersteunen zonder de inhoud te forceren.

**Advies: geen extra link forceren.** Dit is een contentgat, geen linkprobleem. Registreer het als kandidaat voor een latere contentronde en niet als wijziging in deze uitvoeringsronde.

---

**V7. #10 `1c608fbb` / `technische-kwaliteit-website-webapp-beoordelen` — tweede dienstdoel**

*Oorspronkelijk (blok 44, slotalinea van het artikel):* bevat al een link naar `redesign en optimalisatie`.

Het artikel behandelt uitdrukkelijk zowel websites als webapps (titel, excerpt, secties over tenantisolatie, autorisatie, datamodel). Alleen naar `redesign-optimalisatie` linken dekt de webapp-helft niet. Voorstel: in dezelfde slotalinea een tweede bestemming opnemen met ankertekst `een webapplicatie op maat`, doel `/nl/diensten/webapplicatie-laten-maken`.

| | |
|---|---|
| Reden | Het artikel heeft twee doelgroepen en één vervolgstap. |
| Prioriteit | Optioneel — verbetering, geen defect. |
| Afhankelijkheid | Geen; doel is publiek bereikbaar. |

---

### P3 — Flexora-case (afhankelijk van deploy)

De case `/nl/projecten/flexora-bouw` bestaat **alleen lokaal en ongecommit** en geeft in productie een **404** (geverifieerd op de peildatum). De renderer beschermt alleen artikelpaden, dus een databaselink naar deze case wordt meteen als echte link gerenderd en zou vandaag naar een 404 wijzen.

> **Harde volgorde-eis:** V8a en V8b mogen pas naar de database wanneer `https://ymcreations.com/nl/projecten/flexora-bouw` een 200 geeft.

Wat de case bewijst en dus in de tekst mag: keuzes voor afmetingen, gevelbekleding, kozijn, dak en binnenafwerking; een buitenzijde/binnenzijde-stap waarbij de eerdere keuzes behouden blijven; een afhankelijkheidsregel tussen opties; een meebewegende prijsindicatie inclusief btw met een prijsopbouw; en een offerteaanvraag vanuit de samenstelling. Wat er **niet** in mag: realtime WebGL, een vrij draaibaar model, of enige conversie- of omzetwinst.

---

**V8a. #7 `57210deb` / `wat-is-een-3d-productconfigurator` — blok 30**

*Oorspronkelijk:*
> Waar een configurator eindigt, verschilt eveneens per bedrijf. Hij kan blijven bij visualisatie, de configuratie opslaan, een lead of contactaanvraag opleveren, een offerteaanvraag genereren, een automatische offerte produceren, doorgaan naar checkout of een order aan een ander systeem doorgeven. Bij maatwerkproducten is een offerteaanvraag vaak logisch wanneer montage, locatie, inmeten of engineering nog beoordeeld moeten worden; […]

*Voorgesteld:* dezelfde alinea, met één zin toegevoegd na "beoordeeld moeten worden":
> […] beoordeeld moeten worden. De **aanbouwconfigurator van Flexora Bouw** eindigt om die reden bij een offerteaanvraag: de samenstelling met afmetingen, materialen en opties gaat compleet door, waarna de aannemer beoordeelt wat er op locatie nodig is.

| | |
|---|---|
| Linkdoel | `/nl/projecten/flexora-bouw` |
| Ankertekst | `aanbouwconfigurator van Flexora Bouw` |
| Reden | Deze alinea gaat over wáár de flow eindigt, niet over rendertechniek — het enige plaatsbewijs dat de case zonder voorbehoud levert. Geeft het artikel bovendien zijn eerste verwijzing naar echt eigen werk. |
| Afhankelijkheid | Case live **én** artikel publiek (15 sep 2026). |

---

**V8b. #12 `fdca2138` / `wanneer-is-een-3d-productconfigurator-zinvol` — blok 17**

*Oorspronkelijk:*
> […] En komen afmetingen, keuzes en relevante prijsinputs al gestructureerd binnen, dan kan een deel van het voorbereidende offertewerk afnemen — hoe groot dat effect is, hangt af van het huidige proces en van hoeveel menselijke beoordeling er nodig blijft.

*Voorgesteld:* dezelfde alinea, met één zin toegevoegd:
> […] hoeveel menselijke beoordeling er nodig blijft. Bij **Flexora Bouw** komt een aanvraag binnen met de afmetingen, de gevelbekleding, het kozijn en de dakopties die de klant zelf heeft gekozen, plus een prijsindicatie inclusief btw die met die samenstelling meebeweegt.

| | |
|---|---|
| Linkdoel | `/nl/projecten/flexora-bouw` |
| Ankertekst | `Flexora Bouw` |
| Reden | Het artikel stelt hier een claim over gestructureerde binnenkomst en houdt het effect expliciet open; de case illustreert precies de gestructureerde binnenkomst zonder een effect te beweren. |
| Afhankelijkheid | Case live **én** artikel publiek (25 sep 2026). |

---

**V8c (optioneel, redactioneel). #23 `7aa0b94a` / `hoe-werkt-een-3d-productconfigurator-technisch` — sectie "De renderlaag"**

Nieuwe alinea na blok 17, die vaststelt dat niet elke configurator realtime rendert: bij een beperkt aantal geldige combinaties kan een gestapelde set vooraf gerenderde beeldlagen hetzelfde communiceren zonder 3D-runtime in de browser, met andere afwegingen rond assetbeheer en het aantal te renderen combinaties. Pas met die alinea is een caselink hier inhoudelijk correct.

**Prioriteit: optioneel.** Dit is nieuwe prose, geen linkherstel, en hoort niet in een linkronde thuis. Wel de moeite waard omdat het artikel nu één architectuur presenteert als dé architectuur, terwijl het eigen opgeleverde werk een andere gebruikt.

> **Correctie (fase 3, herlezing van het volledige record).** Het voorbehoud hierboven is **weerlegd**. Artikel #23 is integraal herlezen: het scheidt productlogica al van de renderlaag en schrijft WebGL/Three.js niet universeel voor. De generalisatieclaim waarop dit voorbehoud steunde, klopt niet. Het artikel blijft ongewijzigd behouden, er volgt geen redactionele correctie, en **V8c vervalt**. De tekst hierboven blijft staan als historische context, niet als uitvoeringsinstructie.


---

### Expliciet behouden — geen wijziging voorgesteld

#6, #8, #9, #11, #13, #14, #15, #16, #17, #18, #19, #20, #21, #22, #24. Deze vijftien artikelen hebben een passende contextuele dienstlink in hun slotalinea, meerdere zinvolle artikelverwijzingen en een doelpagina die aansluit bij de lezersvraag. Er is geen aanleiding voor cosmetische variatie en geen standaard commerciële afsluiter toe te voegen.

---

## 7. Afhankelijkheden en wat niet is gecontroleerd

| Onderwerp | Status |
|---|---|
| Vijf NL-dienstbestemmingen | **Publiek bereikbaar geverifieerd** (alle 200 op de peildatum) |
| `/nl/projecten/flexora-bouw` | **Lokaal aanwezig, publiek 404.** Blokkeert V8a/V8b |
| Fase 1 en 2A | Lokaal en ongecommit; productie serveert nog de versie van vóór fase 1 (geverifieerd: oude H1 op `/nl/diensten/bedrijfswebsite`, homepagetitle zonder merksuffix) |
| Indexatie | **Niet gecontroleerd.** Een 200-respons zegt niets over indexatie; daarvoor is GSC nodig |
| Rankingkans per artikel | **Niet vast te stellen** met de huidige GSC-data |
| Cannibalisatie | **Niet aangetoond**; in 5.1–5.3 behandeld als risico, niet als feit |
| Zoekvolume per cluster | Niet onderzocht — valt buiten deze ronde |

---

## 8. Planning: aangetroffen versus voorkeur

**Aangetroffen in de database:** één artikel per twee dagen, van 11 september tot en met 19 oktober 2026 (20 artikelen). Vastgelegd door migratie `20260911113000_article_publish_schedule.sql`, die faalt als er geen exact twintig rijen zijn.

**Genoemde voorkeur:** maandag, woensdag en vrijdag vanaf 14 september 2026.

**Afwijking, concreet:** een interval van twee dagen schuift door de week heen en raakt alle zeven weekdagen. De werkelijke verdeling is 3× maandag, 3× dinsdag, 2× woensdag, 3× donderdag, 3× vrijdag, **3× zaterdag en 3× zondag**. Zes van de twintig artikelen verschijnen dus in het weekend, en het ritme begint drie dagen eerder dan de voorkeur. Bij een Ma/Wo/Vr-ritme vanaf 14 september zou de laatste publicatie rond 21 oktober vallen — vergelijkbaar in doorlooptijd, maar zonder weekendpublicaties.

**Geen datum gewijzigd.** Een migratie laat zien wat er is ingesteld, niet dat de voorkeur is herzien. Of het weekendritme acceptabel is, is een keuze van de eigenaar. Wordt besloten alsnog naar Ma/Wo/Vr te gaan, dan geldt: het reeds publieke artikel van 11 september blijft publiek en schuift niet terug naar de toekomst.

---

## 9. Voorstel voor de uitvoeringsronde

Eén afgebakende ronde: **V1 tot en met V4 doorvoeren** — vier slotalinea's in de vier oudste, publieke artikelen, samen vijf nieuwe interne links.

Waarom juist deze vier: het zijn de enige artikelen die vandaag voor een crawler bestaan, ze hebben samen nul uitgaande artikellinks, alle vijf doelen linken al terug (de relaties worden dus alleen wederkerig gemaakt, er wordt geen nieuw verband verzonnen), en er is geen enkele afhankelijkheid van een deploy. De links zijn inert tot hun doel publiceert en worden daarna vanzelf actief, zonder tweede bewerking.

Buiten die ronde: V7 als optionele meelift, V8a/V8b pas nadat fase 2A is gedeployd en de case een 200 geeft, V8c vervallen (weerlegd, zie de correctie bij 5.4), V5 en V6 bewust niet uitvoeren.
