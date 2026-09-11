-- Snippet copy for the library articles.
--
-- The seed in 20260911094500 took `seo_title` and `meta_description` straight
-- from the markdown frontmatter, where they were written as summaries rather
-- than as search results. Fourteen descriptions ran past what a result shows,
-- and lost their point in the truncation because they ended in a list of
-- subjects. Four titles were wrong on their own terms: "rebuild" stood among
-- four Dutch words, "website onderhoud" is one word in Dutch, and two hooks
-- repeated the opening clause of their own description instead of adding a
-- reason to click. "portal" became "portaal", as the rest of the site writes
-- it.
--
-- Only those two columns are touched. Nothing here changes an article's text,
-- excerpt, slug, category, publication date or cover, so no URL moves and the
-- publication plan does not shift. The matching values live in the `metadata`
-- table of scripts/import-articles.mjs, which is where the next import reads
-- them from.

update public.articles as a
   set seo_title = v.seo_title
  from (values
    ('van-excel-naar-maatwerksoftware',
     'Wanneer vervang je Excel door maatwerksoftware? | YM Creations'),
    ('website-vernieuwen-optimaliseren-redesign-herbouwen-replatformen',
     'Website vernieuwen: wat is de juiste ingreep? | YM Creations'),
    ('technische-schuld-software',
     'Technische schuld in software: wanneer wordt het duur? | YM Creations'),
    ('technisch-onderhoud-website-webapp-na-livegang',
     'Websiteonderhoud na livegang: wat moet er gebeuren? | YM Creations')
  ) as v(slug, seo_title)
 where a.slug = v.slug;

update public.articles as a
   set meta_description = v.meta_description
  from (values
    ('website-of-webshop',
     'Website of webshop? Wanneer een bedrijfswebsite met aanvraagflow volstaat, wanneer een catalogus past en wanneer je echt een checkout nodig hebt.'),
    ('van-excel-naar-maatwerksoftware',
     'Wanneer is een spreadsheet nog prima en wanneer wordt het een procesprobleem? Herken het omslagpunt naar een koppeling of naar maatwerksoftware.'),
    ('welke-bedrijfsprocessen-moet-je-automatiseren',
     'Niet elk repetitief proces is een goede kandidaat. Beoordeel processtabiliteit, brondata, waarde en herstelpad — en wanneer je beter niet automatiseert.'),
    ('technische-kwaliteit-website-webapp-beoordelen',
     'Je kunt de code meestal niet zelf lezen. Toets een website of webapp dan op architectuur, security, tests, herstelbaarheid en overdraagbaarheid.'),
    ('maatwerksoftware-of-standaardsoftware',
     'SaaS, WordPress, low-code, maatwerk of hybride? Vergelijk op procesfit, snelheid, integraties en eigenaarschap — de beste oplossing is vaak kleiner.'),
    ('wanneer-is-een-3d-productconfigurator-zinvol',
     'Wanneer loont een 3D-productconfigurator? Toets productvariatie, visualisatiebehoefte, saleswerk en productregels — inclusief wanneer 2D beter past.'),
    ('zapier-make-of-maatwerk',
     'Zapier, Make of eigen code? Kies per proces op kritikaliteit, herstelbaarheid en beheerlast, niet op welke oplossing het professioneelst klinkt.'),
    ('wat-kost-een-webapplicatie',
     'De prijs van een webapplicatie zit niet in het aantal schermen, maar in rollen, workflows, integraties en migratie. Zo bepaal je een scope die klopt.'),
    ('technische-schuld-software',
     'Technische schuld is niet hetzelfde als slechte code. Wanneer een snelle keuze verstandig is, wanneer de rente oploopt en hoe je het als ondernemer herkent.'),
    ('api-koppeling-laten-maken',
     'Een API-koppeling laten maken? Wat een integratie betrouwbaar maakt zit niet in de API-call, maar in eigenaarschap, retries, monitoring en herstel.'),
    ('core-web-vitals-websiteperformance',
     'Wat LCP, INP en CLS meten, hoe je ze meet en wanneer optimaliseren loont. Zonder de mythe dat een groene score vanzelf rankings of conversie oplevert.'),
    ('klantportaal-laten-maken',
     'Een klantportaal laten maken? Wanneer selfservice waarde toevoegt, welke data en koppelingen daarvoor nodig zijn, en wanneer een portaal te zwaar is.'),
    ('technisch-onderhoud-website-webapp-na-livegang',
     'Onderhoud is meer dan updates installeren. Wat updates, backups, monitoring en herstel na livegang betekenen, en wie waarvoor verantwoordelijk is.'),
    ('website-code-data-eigendom-vendor-lock-in',
     'Betalen voor een website maakt je nog niet onafhankelijk. Wat je rond code, data, domein, accounts en overdracht regelt vóór je begint.')
  ) as v(slug, meta_description)
 where a.slug = v.slug;
