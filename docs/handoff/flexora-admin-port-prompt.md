# Startprompt voor de Flexora-sessie

Start de sessie zo:

```
cd /Users/mh/Websites/flexora-bouw
claude --add-dir /Users/mh/portfolio-site
```

Eerste bericht (plak integraal):

---

Ik wil de administratieve kern van mijn andere project, de YM Creations-admin in
/Users/mh/portfolio-site, overzetten naar deze Flexora-repo: klanten, projecten, offertes,
facturen, handmatige betalingen en de aanvragen-pipeline. Lees eerst, in deze volgorde:

1. /Users/mh/portfolio-site/docs/handoff/flexora-admin-port.md (de kaart van wat overgezet wordt, wat niet, en de beslispunten)
2. CLAUDE.md, AGENTS.md en docs/change-logbook.md in deze repo
3. De bronbestanden die het handoff-document noemt, in de YM-repo

Werk in plan mode tot ik akkoord geef. Lever in deze eerste ronde alleen fase 0 op:

- Een inventarisatie van wat Flexora nu heeft rond leads, contact_requests, configurator_submissions, quotes, invoices en de lead-lifecycle-outbox, met de echte tabel- en bestandsnamen.
- Voor de productiedatabase alleen lezen: hoeveel offertes en facturen zijn uitgegeven, en het hoogste factuurnummer. Niets wijzigen.
- Per beslispunt in paragraaf 4 van het handoff-document één concreet voorstel met de afweging, zodat ik per punt ja of nee kan zeggen.
- Een fasenplan volgens paragraaf 5, met per fase de migraties en bestanden die geraakt worden.

Randvoorwaarden:

- Niet aanraken: administratie (bonnetjes), configurators en prijzen, kennisbank, gebruikersbeheer, marketing-conversielevering.
- Niet overnemen: Mollie, incasso, abonnementen, klantportaal, refunds. Betalingen worden handmatig geregistreerd, met een tabelvorm waar Mollie later in past.
- Geld, nummering, tweefasige uitgifte en onveranderbaarheid na uitgifte komen één-op-één uit de YM-code, inclusief de tests; voeg daarvoor vitest aan deze repo toe.
- Viewer-rol blijft read-only op alles wat je toevoegt.
- Bestaande uitgegeven documenten en de factuurnummerreeks blijven intact.
- Elke fase apart: lint, build, tests, migratie pas na mijn akkoord, één regel in het logboek, en een korte rapportage.

Maak nog geen code- of databasewijzigingen in deze ronde, behalve een .mcp.json voor dit
Supabase-project als die nodig is om te lezen.

---
