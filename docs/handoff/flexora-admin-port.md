# Handoff: YM-admin overzetten naar flexorabouw.nl

**Datum:** 18 oktober 2026
**Bron:** `/Users/mh/portfolio-site` (YM Creations, deze repo)
**Doel:** `/Users/mh/Websites/flexora-bouw` (Flexora Bouw)
**Voor:** de Claude Code-sessie die in de flexora-repo draait met deze repo als extra werkmap (`--add-dir`)

Dit document is een kaart, geen samenvatting. Lees de genoemde bronbestanden zelf;
alles wat hier staat is gecontroleerd op 18 oktober 2026 maar de code is leidend.

---

## 1. Opdracht in één alinea

Flexora krijgt hetzelfde administratieve hart als de YM-admin: **klanten → projecten →
offertes → facturen → betalingen**, plus de **aanvragen-pipeline** (contactformulier en
andere binnenkomende verzoeken met statusverloop en omzetting naar klant). Wat de
eigenaar aan de YM-admin waardeert: een project aanmaken, relevante gegevens invullen,
een offerte maken, een factuur maken, en dat alles automatisch voorinvult zodra je een
project kiest. Betalingen zijn bij Flexora voorlopig **volledig handmatig** (bankoverschrijving
registreren), maar met dezelfde tabelvorm, zodat Mollie er later in past.

**Niet overzetten:** Mollie (checkout, webhooks, betaallinks, incasso/mandaten,
prenotificaties, herinneringsautomaat), abonnementen en recurring services,
klantportaal en klantaccounts (portal_*, customer_requests "verzoeken", quote_decisions
via portaal), refunds. **Niet aanraken bij Flexora:** administratie (bonnetjes),
configurator-prijzen, kennisbank, gebruikersbeheer, marketing-conversielevering.

---

## 2. De bron: hoe de YM-admin in elkaar zit

### 2.1 Structuur

| Laag | Pad | Opmerking |
|---|---|---|
| Routes | `src/app/admin/(shell)/{aanvragen,klanten,projecten,offertes,facturen,betalingen}` | elk met `page.tsx`, `nieuw/page.tsx` en `[id]/page.tsx` waar van toepassing |
| Shell + IA | `src/app/admin/(shell)/layout.tsx`, `src/lib/admin/modules.ts`, `src/components/admin/{admin-shell,admin-sidebar,admin-mobile-nav,admin-page-header,admin-section,status-badge,filter-bar,form-field,save-controls,detail-list,empty-state}.tsx` | Flexora heeft een eigen shell; **de shell wordt niet overgenomen**, alleen de pagina-inhoud en de patronen |
| Toegang | `src/lib/admin/{auth,access,db,action-result,readers,format}.ts` | `requireAdminAccess()` op elke page, loader en server action; Flexora heeft hiervoor `requireAdmin()` / `requireAdminEditor()` in `src/lib/supabase/auth.ts` |
| Domeinen | `src/lib/admin/<domein>/{types,mapper,repository,actions,validation}.ts` | repositories zijn Supabase-queries onder de sessie van de admin (RLS doet de rest) |
| Componenten | `src/components/admin/{customers,projects,quotes,invoices,inquiries,payments,documents}/` | editors, lijsten, detailpanelen, PDF-paneel |
| Geld | `src/lib/money/{money,tax}.ts` | integer centen, hoeveelheden in honderdsten, btw één keer afgerond per tariefgroep, NL-opmaak "€ 1.495,00" met NBSP. **Integraal overnemen, inclusief tests.** Flexora heeft `src/lib/money.ts` en `src/lib/vat.ts`: vergelijk en kies één waarheid |
| Documenten | `src/lib/admin/documents/{types,numbering,company,validation,mapper,document-payload,view,send,email,payment-reference,invoice-mail}.ts` | gedeelde basis van offerte en factuur |
| PDF | `src/lib/admin/pdf/{theme,logo,document-layout,quote-pdf,invoice-pdf,credit-note-pdf,to-buffer}.tsx` | `@react-pdf/renderer` 4, server-side naar buffer bij uitgifte; Flexora heeft al eigen PDF's in `src/lib/quotes/pdf.ts` en `src/lib/invoices/pdf.ts` met Flexora-huisstijl: **de Flexora-opmaak behouden, de YM-datastructuur eronder** |
| Communicatie | `src/lib/admin/communications/{types,repository,send,provider,recipient,log,redact,links,view}.ts` | elke uitgaande mail wordt gelogd in `customer_communications` met provider-id; ontvanger wordt altijd uit de actuele klantrij gelezen |

### 2.2 Domeinmodel (tabellen, in afhankelijkheidsvolgorde)

Migraties staan in `supabase/migrations/`. Overnemen betekent: **lezen, begrijpen, herschrijven
voor Flexora** (andere namen van policies, rollen met viewer, bestaande tabellen), niet kopiëren.

| # | Migratie (YM) | Wat | Overnemen? |
|---|---|---|---|
| 1 | `20260910163307_admin_auth_foundation` | `admin_profiles`, `private.is_admin()`, `private.set_updated_at()` | **Nee**, Flexora heeft dit al (met owner/admin/viewer en `private.is_admin_reader()`). Hergebruik Flexora's functies |
| 2 | `20260910174131_business_core` | `inquiries`, `leads`, `customers` + policies | `customers` **ja**. `inquiries`/`leads`: zie §4.5, Flexora heeft `leads` + `contact_requests` + `configurator_submissions` |
| 3 | `20260910192814_customer_source_unique` | unieke index op `customers.source_inquiry_id` / `source_lead_id` | **ja**, dit maakt "omzetten naar klant" idempotent |
| 4 | `20260912195703_projects` + `20260912200108_projects_quote_index` + `20260912201703_project_document_links` | `projects` (customer_id, name, status planned/active/on_hold/completed/cancelled, start_date, deadline, notes); `project_id` op quotes en invoices | **ja** |
| 5 | `20260910174310_documents` + `20260910174844_document_line_save` | `quotes`, `quote_lines`, `invoices`, `invoice_lines`; RPC's `save_quote_lines`/`save_invoice_lines` (regels in één transactie vervangen) | **ja**, zie §4.2/4.3 voor de botsing met Flexora's bestaande `quotes`/`invoices` |
| 6 | `20260910192759_document_numbering` | `document_counters` (per soort per jaar), `private.next_document_sequence` | **ja**, maar Flexora heeft al `invoice_number_sequences` met formaat `F2026-0001`: zie §4.3 |
| 7 | `20261011150000_quote_issuance` + `20261011150100_drop_assign_quote_number` | tweefasige uitgifte `begin_quote_issue` → PDF → `complete_quote_issue`; triggers die een bevroren offerte en haar regels onveranderbaar maken | **ja** |
| 8 | `20260919201342_invoice_finalization` + `20260919202406_invoice_document_required` + `20260913070659_issued_invoice_immutability` | zelfde tweefasige uitgifte voor facturen, `private.next_invoice_number`, bucket `invoice-documents`, triggers tegen wijziging na uitgifte | **ja** |
| 9 | `20260910192807_document_sending` + `20260914202516_customer_communications` | verzendvelden en de communicatielog | **ja** |
| 10 | `20260912205823_payments_and_recurring` | `customer_payment_providers`, `recurring_services`, `payments`, `recurring_activations` | **alleen `payments`** (regels 80-120 van dat bestand). Shape: invoice_id, customer_id, amount_cents, status open/pending/paid/failed/expired/canceled, source `mollie`/`manual_bank_transfer`, provider_payment_id (verplicht bij mollie), method, paid_at (verplicht bij paid), beschrijving. De samengestelde FK `(invoice_id, customer_id)` → `invoices(id, customer_id)` is bewust: factuur en betaling horen bij dezelfde klant |
| 11 | `20260913091429_invoice_payment_links` | Mollie-betaallinks | **nee** |
| 12 | `20260930193617_inquiry_lifecycle` | zes statussen, `inquiry_status_events` met waardesnapshots via trigger, view `inquiry_funnel` | **ja als patroon**, toegepast op Flexora's `leads` (zie §4.5) |
| 13 | `20261013090000_quote_decisions` | onveranderlijke beslissing op een offerte; `admin_record_quote_decision` | **alleen het admin-deel**: `quote_decisions`, de guards, `admin_record_quote_decision`. Niet `portal_*` en niet `quote_decision_notifications` |
| 14 | `20261010200000_credit_notes_and_refunds` | creditnota's YM-C met afgeleid saldo; refunds | **optioneel, latere fase**: creditnota's zonder refunds. Niet in de eerste oplevering |
| 15 | `20261014090000_service_role_invoice_numbering` | grant voor cron/portaal | **nee** |
| — | portal_*, customer_requests*, mandate_activations, recurring_*, debit_prenotifications, payment_reminders, subscription_start_claim, quote_decisions_retention_note, invoice_documents_no_member_read | portaal en Mollie | **nee** |

### 2.3 Regels die niet mogen sneuvelen

1. **Geld is integer centen.** Hoeveelheid in honderdsten, btw per tariefgroep één keer afgerond, totalen afgeleid en nooit opgeslagen als waarheid naast de regels. `src/lib/money/money.test.ts` en `tax.test.ts` zijn de specificatie.
2. **Een document draagt een momentopname van de klant.** `CustomerSnapshot` (`documents/types.ts`) wordt bij aanmaken gekopieerd naar kolommen op quote/invoice (`documents/mapper.ts: snapshotToColumns`). Een klantwijziging achteraf verandert nooit een bestaand document.
3. **Voorlopig nummer tot uitgifte.** Concept = `OFF-CONCEPT-…` / `FAC-CONCEPT-…` (`documents/numbering.ts`). Het echte nummer komt uit een database-sequence per jaar, pas bij uitgifte, in één transactie met het bevriezen. Nooit een nummer "reserveren" in de UI.
4. **Uitgifte is tweefasig.** `begin_*` kent het nummer toe en markeert bezig, de server rendert de PDF en zet die in storage, `complete_*` bevriest. Zie `src/lib/admin/quotes/issue.ts`, `src/lib/admin/invoices/{finalize,issue}.ts`, en de integratietests `issuance.integration.test.ts` / `finalization.integration.test.ts`.
5. **Na uitgifte onveranderbaar, afgedwongen in de database.** Triggers weigeren UPDATE/DELETE op bevroren offertes en uitgegeven facturen en hun regels. De UI is niet de bewaker.
6. **Project vult voor.** Een nieuwe offerte of factuur vanaf een project neemt klant (snapshot), project_id en standaardgegevens over; vanaf een geaccepteerde offerte neemt een factuur de regels over. Zie `src/app/admin/(shell)/offertes/nieuw/page.tsx` → `QuoteBuilder` met `customers` en `projects`, en `src/lib/admin/quotes/actions.ts` (`projectId`, `snapshotToColumns`). Idem `facturen/nieuw`.
7. **Statussen zijn afgeleid waar dat kan.** Factuur: draft/issued/sent/paid/overdue/cancelled; "paid" volgt uit geregistreerde betalingen (`src/lib/payments/payment-actions.ts`, `settlement.ts`), "overdue" uit vervaldatum. Offerte: draft/sent/accepted/rejected/expired, met de beslissing als onveranderlijke rij.
8. **Elke uitgaande mail is een rij.** `customer_communications` met categorie, ontvanger, provider_message_id, en redactie van persoonsgegevens in logs (`communications/redact.ts`). Ontvanger altijd uit de actuele klantrij (`communications/recipient.ts`).
9. **Omzetten naar klant is idempotent.** `customers/conversion.ts`: unieke index op bron-id, 23505 wordt opgelost naar de bestaande klant. Alleen kopiëren wat de bron echt heeft; adres wordt door de admin aangevuld.
10. **Toegang op elke laag.** Pagina, loader én server action roepen de guard aan. Een guard alleen in de layout lekte eerder de RSC-payload.
11. **Bedrijfsgegevens op één plek.** `documents/company.ts` (naam, adres, KvK, btw-nummer, IBAN, tenaamstelling). Flexora heeft eigen gegevens: `src/lib/invoices/config.ts` en `src/lib/site.ts` bekijken.

### 2.4 Bekende valkuilen uit de YM-bouw

- `supabase db push` is hier onbruikbaar geweest door timestampverschillen; migraties zijn via de Supabase MCP toegepast en de lokale bestandsnaam wijkt dan af van de versie in `supabase_migrations`. Kies bij Flexora één methode en houd die aan.
- Sessie-id-prefixen en constanten die een client component ook gebruikt horen in een `types.ts`, niet in een `"use client"`-module (anders krijgt de server een client-reference proxy in plaats van de string).
- react-pdf: paginanummers via `render`-prop verdwijnen als de pagina `lineHeight` of `textTransform` heeft; laatste regel en totalen in één `wrap={false}` View.
- Turbopack serveert soms verouderde `globals.css`; newline toevoegen/verwijderen voordat je visueel beoordeelt.
- Database-tests (integratie met een lokale Supabase) draaiden alleen onder Node 22.

---

## 3. Het doel: wat Flexora nu heeft

Gecontroleerd op 18 oktober 2026, `git log` top: `79ba26f`.

| Onderdeel | Waar | Relevantie voor de port |
|---|---|---|
| Stack | Next 16.2.6 (gepind, `src/proxy.ts` i.p.v. middleware), React 19, Tailwind 4, `@supabase/ssr`, `@react-pdf/renderer` 4, `@tiptap/react` 3, Resend | gelijk aan YM, port is 1-op-1 qua techniek |
| Checks | `npm run lint`, `npm run build`. **Geen vitest.** | voeg vitest toe (YM: `vitest.config.mts`, `npm test`); de overgezette modules komen met tests die de regels uit §2.3 vastleggen |
| Repo-regels | `CLAUDE.md` (werkwijze, verificatie, Supabase-clients, "never touch production Supabase data unless explicitly instructed"), `AGENTS.md` (Next 16 docs in `node_modules/next/dist/docs/`), `docs/change-logbook.md` (verplicht bijhouden) | lezen vóór alles |
| Auth | `src/lib/supabase/auth.ts`: `requireAdmin()`, `requireAdminEditor()`; rollen owner/admin/viewer; `private.is_admin()` voor schrijven, `private.is_admin_reader()` voor lezen | **elke nieuwe tabel krijgt een schrijfpolicy op is_admin én een leespolicy op is_admin_reader**, anders ziet een viewer niets |
| Supabase-clients | `src/lib/supabase/{browser,server,admin,proxy}.ts`, env via `src/lib/env.ts` | gebruiken, geen eigen clients |
| Admin-shell | `src/app/admin/(protected)/layout.tsx`, `src/components/admin/admin-shell.tsx`, navigatie in `src/lib/admin/navigation.ts` (Dashboard, Aanvragen, Configurators, Offertes, Facturen, Administratie, Kennisbank, Gebruikers) | nieuwe tabs Klanten, Projecten, Betalingen hier toevoegen; `(focus)`-layout voor volle-breedte schermen bestaat al |
| Aanvragen | `leads` + `contact_requests` (`20261001090000_leads.sql`, `create_contact_lead` RPC, `20261015090000_billing_address_pending.sql`), `configurator_submissions` (onveranderlijk), `lead_lifecycle_outbox` + marketing conversion delivery + Google offline conversions (`2026100[2-5]*.sql`), UI `src/app/admin/(protected)/aanvragen/**`, `src/lib/admin/{leads,submissions,request-inbox}.ts`, `src/lib/leads/` | **lead-lifecycle en conversielevering hangen hieraan: niet vervangen, uitbreiden** |
| Offertes | `quotes` = één bewerkbaar jsonb-document per `configurator_submissions`-rij, referentie `FB-YYYY-XXXXXXXX`; `quote_revisions` (concept/definitive, snapshot jsonb); `quote_deliveries` per verzendpoging. Code `src/lib/quotes/{from-submission,initial-concept,lifecycle,release,repository,document,pdf,send,deliveries,validation}.ts`, UI `src/components/admin/quote-editor.tsx`, `quote-revisions.tsx`, `src/lib/admin/quote-workspace.ts`. Voorbeeld-PDF in `docs/offerte/voorbeeld-offerte.pdf` | ander model dan YM (document-blob vs regels); **de instap "offerte vanuit configuratoraanvraag met voorgevulde regels uit de prijssnapshot" is een kernfunctie en moet blijven** |
| Facturen | termijnfacturen (50/30/20) op een definitieve offerterevisie; `invoice_number_sequences` met `F2026-0001`; `invoices`, `invoice_revisions`, `invoice_deliveries`, RPC `create_invoice`. Code `src/lib/invoices/{instalments,release,repository,pdf,send,document,validation,config}.ts`, UI `invoice-editor.tsx`, `invoice-instalment-panel.tsx` | **nummerreeks moet doorlopen** (uitgegeven facturen zijn wettelijk vastgelegd); termijnen zijn een Flexora-behoefte die YM niet kent |
| Administratie | `receipts*`, `src/lib/administratie/**`, `(protected)/administratie`, `(focus)/administratie/overzicht` | **niet aanraken** |
| Overig | configurators + prijzen, kennisbank (blog), gebruikers | **niet aanraken** |
| Supabase-project | ref `hnwymvsetngulsfdtaxw` (uit `.env.local`); geen `.mcp.json` in de repo | voor migraties via MCP: `.mcp.json` aanmaken naar het voorbeeld in de YM-repo met deze ref |

---

## 4. Beslispunten die de sessie eerst met de eigenaar afstemt

Dit zijn de punten waar "gewoon overnemen" niet kan omdat Flexora al iets heeft. De sessie
inventariseert, stelt per punt een voorstel voor en wacht op akkoord **voordat er een migratie
wordt geschreven**.

### 4.1 Klanten (nieuw concept bij Flexora)
Flexora kent geen klant-entiteit; naam/adres leven op lead, contact_request en submission.
Voorstel: `customers` als bij YM, met bronkolommen `source_lead_id` (uniek) en optioneel
`source_submission_id`, en "omzetten naar klant" vanaf de aanvraagpagina. Factuuradres-
status "nog te bevestigen" (`billing_address_pending`) vertalen naar de klant: documenten
weigeren uitgifte zolang het adres ontbreekt (YM: `documents/validation.ts`).

### 4.2 Offertes: model en bestaande data
Twee modellen botsen. YM: `quotes` + `quote_lines` + klantsnapshot + project_id, tweefasige
uitgifte, bevroren na uitgifte, beslissing als rij. Flexora: één jsonb-document per
submission met revisies en deliveries.
Voorstel: **nieuw model naast het oude**, bestaande `quotes`/`quote_revisions` worden
read-only archief (hernoemen naar `legacy_quotes*` of ongemoeid laten met een duidelijke
lees-only pagina), nieuwe offertes gaan op het YM-model. De submission-instap blijft:
`from-submission.ts` wordt herschreven tot "maak regels uit de prijssnapshot" op het nieuwe
model. Revisies: YM heeft geen revisies maar maakt een nieuwe offerte die de vorige vervangt;
afstemmen of Flexora de revisie-weergave mist.
Referentieformaat: Flexora gebruikt `FB-YYYY-XXXXXXXX`; YM `YM-O-YYYY-000001`. Kies een
Flexora-prefix voor het definitieve offertenummer (`FB-O-2026-000001` of doorlopend op het
bestaande patroon) en houd concepten herkenbaar voorlopig.

### 4.3 Facturen: nummerreeks en termijnen
- **Nummerreeks**: `invoice_number_sequences` levert `F2026-0001`. Controleer in productie
  (alleen lezen) hoeveel facturen zijn uitgegeven en met welk hoogste nummer. De nieuwe
  `next_invoice_number` moet **doorlopen** in hetzelfde formaat, of de eigenaar besluit
  expliciet tot een nieuw formaat vanaf een duidelijke datum. Nooit opnieuw bij 0001.
- **Termijnen**: "maak N facturen met percentages vanuit een geaccepteerde offerte" als
  actie op het nieuwe model (elke termijn een gewone factuur met eigen nummer en vervaldatum,
  met `quote_id` en een termijnlabel). YM's `facturen/nieuw` vanaf offerte is het startpunt.
- Bestaande `invoices`/`invoice_revisions`/`invoice_deliveries`: archief, zelfde aanpak als 4.2.
- Storage: YM bewaart de uitgegeven PDF in bucket `invoice-documents` (en offertes
  analoog). Controleer welke bucket Flexora al gebruikt (`submission_artifacts`) en kies.

### 4.4 Projecten (nieuw)
Een project per opdracht (aanbouw, dakkapel, renovatie) onder een klant, met status, start,
deadline, notities, en optioneel de bron-submission. Offertes en facturen krijgen `project_id`.
De klantenpagina toont projecten, de projectpagina toont offertes, facturen en betalingen.
Flexora-specifiek: projectadres (werkadres) naast factuuradres; `submission_project_address`
bestaat al op submissions.

### 4.5 Aanvragen-pipeline
YM: zes statussen new/contacted/qualified/quote_sent/won/lost, trigger schrijft
`inquiry_status_events` met waardesnapshots (`quoted_value_cents`, `won_value_cents`),
view `inquiry_funnel`, pipeline-paneel in de UI. Flexora: `leads` met eigen lifecycle,
een outbox die marketingconversies (Google offline conversions, Meta) aflevert.
Voorstel: de YM-statussen en de history-trigger **op `leads` leggen**, en de bestaande
outbox-triggers intact laten. Eerst `20261002090000_lead_lifecycle_outbox.sql` en
`src/lib/leads/` lezen: welke statusovergangen voeden de conversies, en hoe heten ze.
Pas daarna mappen. Het pipeline-paneel (`src/components/admin/inquiries/`) komt mee.

### 4.6 Betalingen, handmatig
`payments` zoals in §2.2 regel 10, zonder providerstabellen. Acties: betaling registreren
op een factuur (bedrag, datum, referentie/omschrijving), deels betaald laten zien, factuur
automatisch op paid zodra saldo nul is, handmatig op overdue/cancelled. Pagina
`betalingen` met openstaand, te laat, ontvangen per maand (`src/lib/payments/finance-overview.ts`
als voorbeeld, uitgekleed). Herinneringen: handmatig versturen via de communicatielaag,
geen cron. `source` blijft `manual_bank_transfer`; `mollie` blijft toegestaan in de check
zodat de latere integratie geen schemawijziging vraagt.

### 4.7 Rollen
Viewer moet alles kunnen lezen en niets kunnen wijzigen. Elke nieuwe tabel: twee policies.
Elke server action: `requireAdminEditor()`. Dit is een Flexora-regel die YM niet heeft.

---

## 5. Volgorde van bouwen

Elke fase: eigen branch of commit, lint + build + tests groen, migratie toegepast op het
Flexora-project, één regel in `docs/change-logbook.md`, korte rapportage aan de eigenaar.

| Fase | Inhoud | Klaar wanneer |
|---|---|---|
| 0 | Inventarisatie en beslispunten §4 beantwoord; vitest toegevoegd; `src/lib/money` overgenomen met tests; `.mcp.json` voor het Flexora-project | eigenaar heeft per beslispunt akkoord gegeven |
| 1 | `customers` + omzetten vanaf lead/contact_request/submission; klantenpagina's | klant aanmaken, bewerken, vanuit aanvraag omzetten (idempotent) |
| 2 | `projects` + koppeling aan klant; projectpagina's; tabs in navigatie | project aanmaken onder klant, lijst en detail |
| 3 | documentbasis: `document_counters`, numbering, company, communicatielog, PDF-laag met Flexora-opmaak | concept-PDF rendert met Flexora-huisstijl op YM-datastructuur |
| 4 | offertes op het nieuwe model: regels, snapshot, project-voorinvulling, submission-instap, uitgifte, bevriezen, verzenden, beslissing | offerte vanaf project én vanaf configuratoraanvraag; na uitgifte onveranderbaar (database-test) |
| 5 | facturen: vanaf offerte (incl. termijnen) en vanaf project, uitgifte met doorlopende nummerreeks, verzenden | nummerreeks loopt aantoonbaar door; uitgegeven factuur onveranderbaar |
| 6 | betalingen handmatig + overzicht; factuurstatus afgeleid | betaling registreren → factuur paid; deelbetaling zichtbaar |
| 7 | aanvragen-pipeline op `leads` met history en paneel, zonder de conversie-outbox te breken | statusovergang schrijft history; bestaande conversielevering ongewijzigd (test) |
| 8 | archiefweergave van oude offertes/facturen; opruimen; logboek | oude documenten blijven vindbaar en downloadbaar |
| later | creditnota's; Mollie | — |

---

## 6. Wat de sessie niet mag

- Productiedata van Flexora wijzigen zonder expliciete opdracht (CLAUDE.md). Migraties
  toepassen gebeurt pas na akkoord per fase. Lezen voor inventarisatie mag.
- Tabellen van administratie, configurators, kennisbank, gebruikers of de marketing-
  conversielevering wijzigen.
- Bestaande uitgegeven documenten (quote_revisions type definitive, invoice_revisions)
  verwijderen of hernummeren.
- Mollie-, portaal- of recurring-code overnemen "voor later".
- Twee waarheden voor geld laten bestaan (`src/lib/money.ts` naast `src/lib/money/`).

---

## 7. Snelle verwijzingen in de YM-repo

```
src/lib/admin/modules.ts                       informatie-architectuur
src/lib/admin/{auth,access,db,action-result}.ts toegang en actiepatroon
src/lib/money/                                  geld (overnemen)
src/lib/admin/documents/                        documentbasis (overnemen)
src/lib/admin/pdf/                              PDF-laag (structuur overnemen, opmaak Flexora)
src/lib/admin/customers/ + conversion.ts        klanten en omzetten
src/lib/admin/projects/                         projecten
src/lib/admin/quotes/ (issue, lifecycle, decisions, repository, actions)
src/lib/admin/invoices/ (finalize, issue, repository, actions)
src/lib/payments/{types,payment-actions,settlement,repository,mapper,finance-overview}.ts  alleen het handmatige deel
src/lib/admin/communications/                   maillog en verzenden
src/lib/admin/inquiries/ (handling, actions, types) + src/components/admin/inquiries/  pipeline
src/app/admin/(shell)/{klanten,projecten,offertes,facturen,betalingen,aanvragen}/  pagina's
src/components/admin/{customers,projects,quotes,invoices,payments,documents,inquiries}/
supabase/migrations/  zie tabel §2.2
```
