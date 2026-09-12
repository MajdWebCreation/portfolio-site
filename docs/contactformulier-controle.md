# Controle contactformulier ymcreations.com

Onderzoek en herstel uitgevoerd op 12 september 2026.

**Secties 1 tot en met 6 zijn de audit en beschrijven de situatie vóór het
herstel.** Dat onderzoek bestond uitsluitend uit lezen en gemockte lokale
controles. Sectie 7 en verder beschrijven het herstel dat daarna op verzoek van
de eigenaar is doorgevoerd: twee configuratiewaarden in Vercel Production plus
één redeployment. Er is in geen van beide fasen een echte e-mail verstuurd en
geen POST naar productie gedaan; websitecode, database en opgeslagen aanvragen
zijn ongewijzigd.

## 1. Onderzochte staat

| Wat | Waarde |
| --- | --- |
| Branch / commit | `main` @ `75d34e3` ("Versterk de commerciele NL-pagina's…", 11 sep 2026 22:41:52 CEST) |
| Werkboom | Schoon; alleen `.codex/` en `docs/` onstaged, zoals vooraf bekend |
| Vercel-project | `majdwebcreations-projects/portfolio-site` |
| Actieve productiedeployment | `dpl_9STsH6RddPZdbpdVUJj8bzTtAqn3`, aangemaakt 11 sep 2026 22:42:02 CEST, status Ready |
| Aliassen | `ymcreations.com`, `…-git-main-…vercel.app` — dit is dus de live main-deployment |
| Geïnstalleerde versies | Next 16.1.6, React 19.2.3, `resend` 6.9.4, `@supabase/supabase-js` ^2.109.0, vitest 4.1.11 |

Geen `CLAUDE.md`, `AGENTS.md` of `vercel.json` in de repo.

Relevante bronbestanden:

- `src/app/api/contact/route.ts` — het enige endpoint (`POST /api/contact`)
- `src/components/contact-form.tsx` — het contactformulier (NL + EN)
- `src/components/project-planner.tsx` — de planner, post naar hetzelfde endpoint
- `src/components/contact-block.tsx`, `src/app/[locale]/contact/page.tsx`
- `src/lib/contact/inquiry.ts`, `src/lib/contact/payload.ts`, `src/lib/supabase/public.ts`

## 2. De route van formulier naar verzending

Beide NL- en EN-contactpagina's renderen dezelfde `ContactForm` en posten naar
`/api/contact`. De project planner post naar hetzelfde endpoint met
`mode: "project_planner"`. Er is geen tweede aanvraagflow.

De route doet, in deze volgorde:

1. **Honeypot** — is het verborgen `website`-veld gevuld, dan meteen `200 {ok:true}` zonder opslag of mail.
2. **Validatie** — naam, e-mail, bericht (≥ 12 tekens); bij de planner ook projecttype, planning, content/branding, prioriteit en de zakelijke verklaring. Bij fouten `400` met vertaalde `fieldErrors`.
3. **Opslag** — `storeInquiry()` schrijft de aanvraag als `anon` in `inquiries`. Mislukt dat, dan `500` met een vertaalde melding en géén mail.
4. **Configuratiecontrole** — `CONTACT_TO_EMAIL`, `CONTACT_FROM_EMAIL` en `RESEND_API_KEY` worden hier pas gelezen. Ontbreekt er één, dan `500 {"error":"Missing mail configuration."}`.
5. **Mail 1** — notificatie naar `CONTACT_TO_EMAIL`, afzender `CONTACT_FROM_EMAIL`, `replyTo` het adres van de bezoeker.
6. **Mail 2** — bevestiging naar de bezoeker, zelfde afzender, in de taal van de bezoeker.
7. `200 {ok:true}`.

Er is geen rate limiting of andere misbruikbeperking behalve de honeypot.

## 3. Oorzaak en eerste falende stap

**De aanwijzing klopt.** `CONTACT_FROM_EMAIL` en `CONTACT_TO_EMAIL` bestaan niet
in het Vercel-project — in geen enkele omgeving. De guard op
`src/app/api/contact/route.ts:374` is daarmee de eerste falende stap.

Wat dat concreet betekent voor een bezoeker:

- De aanvraag wordt **wel opgeslagen** in Supabase (stap 3 gaat vooraf aan de guard). De aanvragen staan dus in `/admin/aanvragen`.
- Direct daarna volgt `HTTP 500` met body `{"error":"Missing mail configuration."}`.
- Er wordt **geen enkele mail aangeboden aan Resend** — de `Resend`-client wordt niet eens geïnstantieerd.
- De bezoeker ziet letterlijk de onvertaalde Engelse tekst **"Missing mail configuration."** onder de verzendknop, ook op de Nederlandse pagina. De client toont de `error` uit de serverrespons ongewijzigd.

De bezoeker krijgt dus een foutmelding en gaat er redelijkerwijs van uit dat de
aanvraag niet is aangekomen, terwijl de rij wél is weggeschreven. Elke herhaalde
poging schrijft een extra rij: **dubbele aanvragen zonder enige mailnotificatie**.
Zolang niemand het admin-paneel opent, blijven binnengekomen aanvragen onopgemerkt.

## 4. Noodzakelijke configuratie

| Variabele | Productie (Vercel) | Preview | Development | Functie |
| --- | --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Aanwezig (encrypted) | Aanwezig | — | Opslag van de aanvraag |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Aanwezig (encrypted) | Aanwezig | — | Opslag van de aanvraag |
| `RESEND_API_KEY` | Aanwezig (encrypted) | Aanwezig | Aanwezig | Authenticatie bij Resend |
| `CONTACT_TO_EMAIL` | **Ontbreekt** | Ontbreekt | Ontbreekt | Ontvanger van de notificatie |
| `CONTACT_FROM_EMAIL` | **Ontbreekt** | Ontbreekt | Ontbreekt | Afzender van beide mails |

Er bestaat nergens een fallback of default voor deze twee waarden; `rg` vindt ze
alleen in `route.ts`, in `src/lib/admin/documents/email.ts` (offertes/facturen,
die dus dezelfde afzender delen en om dezelfde reden stilvallen) en in
`.env.example`.

**Beperking:** de Vercel CLI toont wel de huidige projectinstellingen, maar niet
de env-momentopname waarmee deployment `dpl_9STsH6…` is gebouwd. Omdat beide
variabelen echter in geen enkele omgeving bestaan en de wel aanwezige variabelen
180 respectievelijk 2 dagen oud zijn, kan geen enkele deployment ze ooit hebben
meegekregen. Dat de waarden aanwezig zijn in de lokale `.env.local` verklaart
waarom dit lokaal nooit opviel.

Resend zelf is in orde: `ymcreations.com` is **verified** met sending enabled
(regio eu-west-1). De afzender kan dus gewoon vanaf dat domein versturen.

## 5. Uitgevoerde controles

**Gemockte routetest** (tijdelijk vitest-bestand, na afloop verwijderd; `resend`
en de Supabase-client vóór module-initialisatie vervangen door stubs, synthetische
invoer, 10/10 geslaagd):

| Scenario | Uitkomst |
| --- | --- |
| Volledige config + geslaagde providerrespons | `200 {ok:true}`, 2 verzendingen, 1 opslag |
| **Config ontbreekt** | `500 {"error":"Missing mail configuration."}` — **1 opslag**, 0 verzendingen |
| Alleen `CONTACT_FROM_EMAIL` weg | Identiek `500` |
| Ongeldige invoer | `400` met `fieldErrors`, geen opslag, geen provideraanroep |
| Provider geeft `error`-veld terug | `500` met de providertekst, tweede mail wordt overgeslagen |
| Provider gooit een exception | `500 {"error":"Unexpected error."}` via de buitenste catch |
| Alleen de tweede mail mislukt | `500`, terwijl de notificatie al verstuurd is |
| Opslag mislukt | `500` vertaald, geen mail |
| Honeypot gevuld | `200 {ok:true}`, geen opslag, geen mail |
| Afzender/ontvanger | `from` = `CONTACT_FROM_EMAIL`, `to` = `CONTACT_TO_EMAIL`, `replyTo` = bezoeker; bevestiging naar de bezoeker |

Beide foutvormen van `resend` 6.9.4 worden dus correct afgehandeld: een
teruggegeven `result.error` én een geworpen exception.

**Lokale dev-server**, bewust onschadelijk gemaakt (Supabase-URL naar een dood
adres, mailvariabelen leeg — met de eigen `@next/env`-loader van het project
geverifieerd dat deze overrides voorrang hebben op `.env.local`, dus geen echte
sleutel of database in het proces):

- `/nl/contact` en `/en/contact` renderen (200)
- Honeypot → `200 {ok:true}`; ongeldige invoer → `400` met veldfouten
- Geldige invoer → `500` "We konden je aanvraag niet opslaan." — dit bevestigt live dat de opslagstap vóór de mailguard draait

**Formulier in de browser met onderschepte `fetch`** (geen enkel verzoek verliet
de pagina), NL en EN:

| Gesimuleerde respons | NL | EN |
| --- | --- | --- |
| `500` missing config | "Missing mail configuration." — onvertaald, invoer blijft staan | idem |
| `200 {ok:true}` | "Bericht ontvangen…" + velden leeg | "Message received…" + velden leeg |
| Clientvalidatie | 0 verzoeken, drie veldfouten | 0 verzoeken, drie veldfouten |
| Providerfout | providertekst wordt rauw getoond | — |

De client toont succes dus uitsluitend bij een echte `2xx`, behoudt invoer bij
fouten en stuurt bij ongeldige invoer geen verzoek. Dat deel is in orde.

**Productie:** alleen `GET https://ymcreations.com/nl/contact` en `/en/contact`
(beide 200). Meer niet.

Belangrijk onderscheid: hiermee is aangetoond dat het formulier bereikbaar is,
dat de client een verzoek stuurt en dat de server invoer accepteert. Dat de
mailprovider een verzending accepteert en dat een mail daadwerkelijk aankomt, is
**niet** getest — dat vereist een echte verzending en viel buiten deze opdracht.

## 6. Minimale herstelactie (nog niet uitgevoerd)

Voeg de twee ontbrekende variabelen toe aan de productieomgeving van het
Vercel-project. Geen codewijziging nodig: de route, de guards en de
Resend-afhandeling zijn correct.

```
CONTACT_FROM_EMAIL=<afzender op ymcreations.com>
CONTACT_TO_EMAIL=<postvak dat aanvragen ontvangt>
```

- Zet ze op Production (en Preview, zodat previews niet hetzelfde stille gat houden).
- **Een nieuwe deployment is daarna nodig.** Vercel injecteert env-variabelen uit de momentopname van de deployment; de bestaande deployment ziet de nieuwe waarden niet. Een redeploy van `main` volstaat.
- `CONTACT_FROM_EMAIL` moet op het geverifieerde domein `ymcreations.com` liggen, in de vorm `Naam <adres@ymcreations.com>` of enkel het adres.
- Guards niet uitzetten en geen hardcoded noodadres toevoegen.

Twee dingen die hierna nog aandacht verdienen, maar geen onderdeel zijn van deze
herstelactie en de storing niet veroorzaken:

- De bezoeker krijgt serverfouten ongefilterd en onvertaald te zien ("Missing mail configuration."). Een generieke, vertaalde melding is hier passender.
- Mislukt alleen de bevestigingsmail, dan ziet de bezoeker een fout terwijl de notificatie al verstuurd én de rij al opgeslagen is — dat nodigt uit tot een dubbele aanvraag.

## 7. Uitgevoerd herstel — 12 september 2026

De eigenaar heeft de adressen bevestigd; de configuratie is doorgevoerd.

| | |
| --- | --- |
| `CONTACT_TO_EMAIL` | `contact@ymcreations.com` |
| `CONTACT_FROM_EMAIL` | `YM Creations <contact@ymcreations.com>` |
| Omgeving | Uitsluitend **Production** van `portfolio-site` (`prj_CHhDfdlNzeK3wkdHhX9gXLOQYH2d`) |
| Commit | `75d34e3` — lokaal en `origin/main` identiek, geen nieuwere release |
| Nieuwe deployment | `dpl_DMbDyCY2QovKyuQYQhQMkkZkWUbE` — `portfolio-site-ba6mbgvxy-majdwebcreations-projects.vercel.app` |
| Tijdstip | 12 sep 2026 19:04:58 CEST, status Ready na 57 s |
| Alias | `ymcreations.com` (plus de `-git-main-` alias) |

Twee punten die bij de uitvoering naar voren kwamen:

- **Afzenderopmaak.** De bevestigde waarde bereikte de opdracht zonder punthaken. De code geeft `CONTACT_FROM_EMAIL` ongewijzigd door aan het `from`-veld van Resend, en de geïnstalleerde SDK (6.9.4) schrijft daarvoor `"Your Name <sender@domain.com>"` voor; `.env.local` gebruikte al diezelfde vorm. De waarde is daarom opgeslagen als `YM Creations <contact@ymcreations.com>`. Zonder punthaken zou Resend het `from`-veld afkeuren.
- **Leesbaarheid.** Vercel maakt nieuwe Production-variabelen standaard *sensitive*, waardoor de waarde niet meer terug te lezen is. Omdat dit zakelijke adressen zijn en geen geheimen, zijn ze met `--no-sensitive` opgeslagen, zodat naam, waarde en scope controleerbaar blijven. De eerste schrijfpogingen via stdin landden als lege string; die zijn verwijderd en vervangen. Eindstand is byte-exact geverifieerd: lengte 23 en 38, geen quotes, newline of spaties.

Geen codewijziging nodig. `RESEND_API_KEY`, de Supabase-variabelen, Preview,
Development, DNS en de Resend-domeininstellingen zijn ongemoeid gelaten.

## 8. Wat hiermee wél en niet is aangetoond

Geverifieerd na de deployment:

- De nieuwe deployment is ná de configuratiewijziging aangemaakt (19:01 tegen 19:04:58) en is een echte nieuwe build, geen herkoppeling van een oude deployment.
- `GET` op `/nl/contact`, `/en/contact`, `/nl/diensten/bedrijfswebsite`, `/en/services/business-websites` en `/nl` — alle 200.
- Geen fouten in het runtime-logvenster.
- Lokale gemockte controle met exact de nu ingestelde waarden: de configuratieguard wordt gepasseerd, `200 {ok:true}`, met `from` = `YM Creations <contact@ymcreations.com>`, `to` = `contact@ymcreations.com` en `replyTo` = de bezoeker.

**Niet aangetoond:** dat Resend een verzending accepteert en dat een bericht in
de inbox aankomt. Dat vereist een echte inzending en is bewust niet gedaan. De
runtime-waarden van de draaiende functie zijn niet rechtstreeks uitleesbaar; het
bewijs is indirect, via de deploymentvolgorde en de projectconfiguratie.

## 9. Openstaande punten

**Bestaande aanvragen.** Tussen de storing en dit herstel zijn inzendingen wél
opgeslagen maar nooit gemaild. Beoordeel `/admin/aanvragen` op eerdere
inzendingen en mogelijke duplicaten van dezelfde afzender. Er is niets
opnieuw verstuurd, samengevoegd of verwijderd — dat is een keuze van de eigenaar.

**TODO's — structureel, niet opgelost door deze configuratiereparatie:**

1. **Bezoekersvriendelijke NL-/EN-foutmeldingen.** De route geeft serverfouten rauw door (`"Missing mail configuration."`, providerteksten), en de client toont die ongefilterd. Vervang dit door een generieke, vertaalde melding en houd de technische tekst in de logs.
2. **Gedrag bij gedeeltelijk geslaagde opslag/verzending.** Mislukt alleen de bevestigingsmail, dan krijgt de bezoeker `500` terwijl de rij is opgeslagen en de notificatie al verstuurd is. Bepaal welke stappen bepalend zijn voor het eindoordeel en rapporteer dat consistent.
3. **Duplicaatbescherming bij opnieuw proberen.** Er is geen idempotentie: elke herhaalde poging schrijft een nieuwe rij. Overweeg een idempotentiesleutel per inzending of ontdubbeling op e-mail plus tijdvenster.

## 10. Bevestiging

Er zijn geen echte berichten, bevestigingsmails, testmails, offertes, facturen
of reviewverzoeken verstuurd, en geen POST naar productie gedaan. Websitecode,
database, opgeslagen aanvragen en de artikelplanning zijn ongewijzigd. De
tijdelijke testbestanden zijn verwijderd; de werkboom staat op `75d34e3` met
uitsluitend `.codex/` en `docs/` onstaged, zoals bij aanvang.
