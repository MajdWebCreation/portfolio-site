# Analytics — implementatiestand en handoff

**Stand:** 23 september 2026, werkboom op `main` @ `aae4609` plus niet-gecommitte wijzigingen (fase 0, 1, 2-GA4, 2.5, 3 en 4).
**Doel van dit document:** een nieuwe sessie kan verder zonder de chatgeschiedenis. §15 beschrijft fase 2.5/3/4; waar §6–§10 en §14 iets anders zeggen, geldt §15. Het ontwerp (A–M) staat in het onderzoeksrapport van 23 september 2026; dit document beschrijft alleen wat er nu in de repository staat en welke besluiten vastliggen.

## 1. Wat gebouwd is (fase 0, 1, 2-GA4)

| Fase | Inhoud | Status |
|---|---|---|
| 0 | Typed eventregister, runtime guard, alle CTA's op stabiele ids, view-events, funnel-events contact/planner, consent-default vóór `gtag('config')`, `web_vital` en UA-parameters verwijderd | klaar, geverifieerd in headless Chrome |
| 1 | Attributie in de browser (first touch), servervalidatie, vijf kolommen op `inquiries`, admin toont/filtert herkomst, privacyverklaring aangepast | klaar; migratie nog niet toegepast |
| 2 (GA4) | `analytics_facts` + `analytics_sync_runs`, Google-auth zonder dependency, GA4-adapter met negen rapporten, runner met dry-run, cron, `/admin/analytics` met alle blokken, "Vernieuw nu" | klaar; migratie, env vars en Google-account nog niet |
| 2.5 | Multi-provider fundament: config per provider, token per scope, plannen per rapport, status per provider | klaar (§15) |
| 3 | Search Console-adapter en dashboardblok | klaar (§15); env en Search Console-toegang nog niet |
| 4 | Bing Webmaster-adapter en dashboardblok | klaar (§15); env nog niet |
| 5 | Microsoft Clarity (eigen consentcategorie, versie 2) | **niet gebouwd**, eigenaarsbesluit vereist |

Niet gebouwd en buiten scope tot nader order: Clarity, sessieopnames, heatmaps, CSV-import van generatieve-AI-rapporten, eigen raw-event-opslag.

## 2. Typed analytics-events (fase 0)

- Register: `src/lib/analytics/events.ts`. Negentien events; `contact_submit` en `planner_complete` zijn `keyEvent: true`. `EventParams<N>` typeert per event; `traffic_class`/`traffic_source` zijn optioneel (`OptionalParamKey`).
- Guard: `src/lib/analytics/guard.ts` (`guardEvent`). Alleen geregistreerde events; onbekende parameters worden gedropt; waarden ≤100 tekens; shapes enum/token/int/hostname/fields; elk event met een waarde die op e-mail, telefoonnummer of vrije tekst lijkt wordt als geheel geweigerd (altijd, niet alleen in development).
- Tracker: `src/lib/analytics/track.ts`. `trackEvent(name, params)` en `trackUntypedEvent` (voor `data-track-*`). Voegt `locale` en `page_type` toe uit het pad (`page-type.ts`). Zonder toestemming: event weg, geen buffer. Na toestemming maar vóór gtag: in-memory wachtrij, geleegd door `flushPendingEvents` (aangeroepen via `onLoad`/`onReady` in `components/consent/analytics-scripts.tsx` en bij de eerstvolgende levering).
- Delegatie: `src/components/analytics-provider.tsx` leest `data-track-event` + `data-track-<param>` (`dataset.ts`), stuurt `outbound_click` voor externe `a[href]` met `data-track-link-context`. Roept ook `captureAttribution()` aan (zie §4).
- View-events: `src/components/page-events.tsx` (`ViewEvent` voor `service_view`/`article_view`, `PricingViewEvent` leest de hash). Eén keer per pad; vuurt alsnog wanneer toestemming later wordt gegeven.
- Identifiers: `service_id` = `ServiceKey` uit `lib/content/services.ts` (bijv. `business-websites`), `package_id`/`project_type` = `PackageId`, `nav_item` = `StaticRouteKey`, `cta_id` stabiel per plek (bijv. `home_hero_contact`), planner-keys de `*Key`-waarden van de planner. Nooit UI-tekst.
- Custom dimensions die in GA geregistreerd moeten zijn (29): locale, page_type, placement, cta_id, cta_target, nav_item, from_locale, to_locale, service_id, service_family, service_kind, package_id, preselected_package, article_slug, article_category, link_domain, link_context, form, error_kind, fields, entry, step_name, direction, project_type, recommended_package, timeline_key, priority_key, traffic_class, traffic_source. Custom metric: step_index.
- Tests: `src/lib/analytics/{guard,page-type,track}.test.ts`.

## 3. Consentgedrag (ongewijzigd fundament)

- `src/lib/consent/consent.ts` (cookie `ym_consent`, `CONSENT_VERSION = 1`, 182 dagen), `src/lib/consent/store.ts` (`hasAnalyticsConsent`, `hydrateConsent`, `decideConsent`).
- Zonder toestemming bestaat er geen GA-script, geen `dataLayer`, geen sessionStorage/localStorage, geen extra cookie. Intrekken zet `ga-disable-<id>` en verwijdert `_ga*`.
- `analytics-scripts.tsx` stuurt vóór `config`: `gtag('consent','default', { analytics_storage: granted, ad_storage/ad_user_data/ad_personalization: denied })`; `anonymize_ip` is verwijderd; `cookie_expires` 90 dagen, `cookie_update: false`.
- `consent_granted` event (placement banner|settings) wordt in `consent-dialog.tsx` gestuurd na een ja; daar wordt ook `syncAttributionStorage(analytics)` aangeroepen.

## 4. Attributie (fase 1)

Bestanden: `src/lib/attribution/{types,sources,classify,capture,event-params}.ts`, tests `classify.test.ts`, `capture.test.ts`.

**Traffic classes** (`types.ts`, exact): `organic_search`, `ai_assistant`, `social`, `campaign`, `referral`, `internal`, `direct`. Geen `unknown`; niet vaststelbaar = NULL.

**Classificatie** (`classifyAttribution`, in deze volgorde):
1. `utm_source` die een bekende AI-host is → `ai_assistant`, canonieke bron (bijv. `chatgpt.com`), medium = `utm_medium` of `ai-assistant`.
2. Andere `utm_source` → `campaign` met gesaneerde UTM-waarden.
3. Referrer-host in register → klasse van het register, medium `organic` / `ai-assistant` / `social`.
4. Referrer = eigen host → `internal`.
5. Andere referrer → `referral`, alleen hostnaam (zonder `www.`).
6. Niets of onleesbaar → `direct`.

**Bronregister** (`sources.ts`, enige plek met hostnamen): zoekmachines google.* (alle landen-TLD's, specifiekere host wint), bing.com, duckduckgo.com, ecosia.org, search.yahoo.com, startpage.com, search.brave.com, qwant.com; AI chatgpt.com (+chat.openai.com, openai.com), copilot.microsoft.com, perplexity.ai, claude.ai, gemini.google.com, grok.com, chat.deepseek.com, chat.mistral.ai, you.com; social linkedin.com (+lnkd.in), facebook.com (+fb.com, l./lm./m.facebook.com), instagram.com, x.com (+twitter.com, t.co), youtube.com (+youtu.be), reddit.com, threads.net, tiktok.com, pinterest.com. `aiSources` exporteert de AI-lijst voor het dashboard.

**Attributieobject**: `{ trafficClass, trafficSource (≤100), trafficMedium (≤100), campaign (≤100), landingPath (≤200, lokaal pad zonder query) }`. Nooit volledige referrer, query, IP, UA, identifier.

**Browser** (`capture.ts`): `captureAttribution()` één keer per paginaleven, roept eerst `hydrateConsent()` aan (nodig: het draait vóór de consentcomponenten mounten). Memory-only vóór toestemming; sessionStorage-sleutel `ym_attr` na toestemming (`syncAttributionStorage`); verwijderd bij intrekken. First touch: interne navigatie en eigen-host-referrer overschrijven nooit. Opgeslagen waarde wordt bij lezen opnieuw gevalideerd.

**Server**: `validateAttribution` in `classify.ts`; gebruikt in `src/app/api/contact/route.ts`. Allowlist klasse, hostnaam-vorm, klasse moet bij de bron uit het register passen, lengtes, veilige tekens, `landingPath` lokaal; anders volledige drop, aanvraag blijft geldig, waarde wordt nooit gelogd. Payload-type: `attribution?` in `src/lib/contact/payload.ts`; opslag in `src/lib/contact/inquiry.ts`.

**Events**: `event-params.ts` → `traffic_class`/`traffic_source` alleen op `contact_submit` en `planner_complete`, en alleen bij een externe bron (`direct`/`internal` niet).

**Database** (`supabase/migrations/20260923223958_inquiry_attribution.sql`, toegepast op productie op 24 september 2026; geschreven als 20260923120000): `inquiries.traffic_class` (CHECK op de zeven klassen), `traffic_source`, `traffic_medium`, `campaign`, `landing_path`; alle nullable; constraint `inquiries_attribution_shape` (alles null, of klasse én pad gevuld); anon-insert-grant uitgebreid met exact deze vijf kolommen; policy `inquiries_public_intake` opnieuw aangemaakt met vormchecks; index op `traffic_class`.

**Admin**: `src/lib/admin/inquiries/{types,mapper,repository}.ts` (`Inquiry.attribution?`), `src/components/admin/inquiries/inquiry-detail.tsx` (sectie "Herkomst van het bezoek"), `inquiries-list.tsx` (kolom en filters "Bezoek via" en "Bron").

**Privacy**: `src/lib/content/privacy.ts` heeft NL/EN een alinea over kanaal, landingspagina, doel, grondslag (gerechtvaardigd belang), wat niet wordt opgeslagen en gelijke bewaartermijn; `indexable: false` totdat de eigenaar de tekst bevestigt. `cookies.ts` ongewijzigd (geen nieuwe cookie).

## 5. Analytics-database (fase 2)

Migratie `supabase/migrations/20260923120100_analytics_facts.sql` (nog niet toegepast).

```
analytics_facts
  provider   text  CHECK in ('ga4','gsc','bing','clarity','site')
  report     text  CHECK ~ '^[a-z0-9_]+\.[a-z0-9_]+$'
  date       date
  dims       jsonb default '{}'  CHECK jsonb_typeof = 'object'
  dims_key   text  generated always as (md5(dims::text)) stored
  metrics    jsonb CHECK jsonb_typeof = 'object'
  synced_at  timestamptz default now()
  primary key (provider, report, date, dims_key)
  index (provider, report, date desc)

analytics_sync_runs
  id uuid pk, provider (zelfde CHECK), report text, started_at, finished_at,
  status CHECK in ('running','ok','failed') default 'running',
  rows_upserted int >= 0, error text <= 200
```

Besluit: geen jsonb direct in de sleutel (btree-groottelimiet, PostgREST `on_conflict` wil kolomnamen); `dims_key` is deterministisch omdat jsonb canoniek opslaat. RLS forced op beide tabellen; `select` voor `authenticated` met policy `private.is_admin()`; geen enkele schrijf-grant of -policy; schrijven uitsluitend via `paymentsAdminClient()` (`src/lib/payments/admin-client.ts`, secret key) in de cron/action.

`src/lib/supabase/database.types.ts` is met de hand bijgewerkt in het generatorformaat (kopnotitie zegt dat); regenereren na toepassen van beide migraties.

## 6. Provider-interface, runner, store

`src/lib/analytics-admin/types.ts`:
- `FactRow { provider, report, date (YYYY-MM-DD), dims: Record<string,string>, metrics: Record<string,number> }`
- `SyncWindow { start, end }` (inclusief)
- `ProviderAdapter { key: AnalyticsProvider; reports: readonly string[]; check?(report); fetch(report, window): Promise<FactRow[]> }`
- `ProviderError(kind, status?)` met kinds `not_configured | auth | quota | compatibility | http | network | invalid_response | unknown_report`; message = alleen kind + status.
- `FactsStore { upsert, startRun, finishRun, deleteOlderThan }`
- `safeErrorLabel(error)`: ProviderError → message; `FactsStoreError` → `store: …`; anders `unexpected`.

`src/lib/analytics-admin/runner.ts` (`runAnalyticsSync`): per provider per rapport: `check` → `fetch` → `dedupeFactRows` (canonieke sleutel op gesorteerde dims) → bij `apply` run registreren en upserten; fouten per rapport geïsoleerd; na een applied run met ≥1 succes `deleteOlderThan(retentionCutoffDate)` (26 maanden). `syncWindow(now, days=3)` = laatste 3 dagen inclusief vandaag (Amsterdam). `summaryLogFields` = alleen provider, rapport, status, rijen, ms, foutklasse. Runner kent geen Google.

`src/lib/analytics-admin/facts-store.ts` (`createFactsStore(db)`): upsert in batches van 500 met `onConflict: "provider,report,date,dims_key"`; runs insert/update; delete `date < cutoff`.

`src/lib/analytics-admin/sync.ts` (`executeAnalyticsSync`): één ingang voor cron en knop. `preflightAnalyticsSync` controleert Google-config en (bij schrijven) `SUPABASE_SECRET_KEY`. Schakelaar `ANALYTICS_SYNC_ENABLED === "true"` → applied, anders dry run met een store die bij elke aanroep gooit (`noStore`). Tokenbron wordt per proces gecached. **Fase 3/4 haken hier in: extra adapters aan `providers: [ga4, …]` toevoegen, plus hun eigen preflight.**

## 7. GA4-provider en Google-auth

`src/lib/analytics-admin/providers/ga4.ts` (`createGa4Adapter({ propertyId, token, fetch? })`), Analytics Data API v1beta `runReport` en `checkCompatibility`, paginering per 10.000. Datum `YYYYMMDD` → ISO; dimensiewaarden ≤300 tekens; `customEvent:x` → `x`. Rapporten en opgeslagen namen:

| report | dims (na `date`) | metrics |
|---|---|---|
| ga4.overview | — | sessions, total_users, new_users, engaged_sessions, engagement_rate, page_views, key_events |
| ga4.sources | channel (sessionDefaultChannelGroup), source_medium (sessionSourceMedium) | sessions, engaged_sessions, key_events |
| ga4.first_user_sources | first_user_source_medium | new_users, key_events |
| ga4.geo | country, region, city | sessions, key_events |
| ga4.devices | device (deviceCategory), browser | sessions |
| ga4.landing | landing_page (landingPage) | sessions, engaged_sessions, key_events |
| ga4.events | event_name, service_id, cta_id, cta_target, package_id, placement | event_count |
| ga4.funnel | event_name, step_name, project_type, direction | event_count |
| ga4.key_events_sources | event_name, traffic_class, traffic_source | event_count |

Foutmapping: 401/403 `auth`, 429 `quota`, 400 met "incompatib" `compatibility`, anders `http <status>`; netwerk `network`; onleesbare JSON `invalid_response`. Responsebody komt nooit in fout of log.

`src/lib/analytics-admin/google-auth.ts`: `readGoogleConfig(env)` (noemt ontbrekende variabelen, nooit waarden; property-id met of zonder `properties/`, e-mail moet op `.iam.gserviceaccount.com` eindigen, key als PEM / PEM met `\n` / base64), `signServiceAccountJwt` (RS256 via `node:crypto`, `aud` https://oauth2.googleapis.com/token, 1 uur), `createServiceAccountTokenSource` (wisselt bij <60 s resterend). Scope `https://www.googleapis.com/auth/analytics.readonly`. Geen `google-auth-library`. **Voor Search Console dezelfde module gebruiken met scope `https://www.googleapis.com/auth/webmasters.readonly`** (tokenbron per scope).

Tests: `providers/ga4.test.ts` (fixtures per rapport, paginering, foutklassen, compatibility), `google-auth.test.ts` (throwaway keypair, JWT geverifieerd met publieke sleutel), `runner.test.ts`.

## 8. Cron

`src/app/api/cron/analytics-sync/route.ts` (GET/POST, `force-dynamic`, `maxDuration 60`), auth via `isAuthorisedCronRequest` (`CRON_SECRET`), zonder secret 404. Zonder Google-config 503 `{ ok:false, reason, missing }`. Logregels: modus, venster, per rapport provider/status/rijen/ms/fout. `vercel.json`: `0 6 * * *` (bestaande crons 05:00 retention, 07:00 prenotifications, 08:00 reminders ongewijzigd). Test: `route.test.ts`.

## 9. /admin/analytics

- Module `analytics` (slug `analytics`, label "Analytics") in `src/lib/admin/modules.ts`.
- Pagina `src/app/admin/(shell)/analytics/page.tsx`: `requireAdminAccess()`, `?period=7|30|90` (default 30).
- Domein `src/lib/admin/analytics/`: `types.ts` (`AnalyticsDashboard`, `FactRecord`, `InquiryRecord`, `SyncRunRecord`, `SyncStatus`), `periods.ts` (periode eindigt gisteren Amsterdam, vorige periode direct ervoor), `page-types.ts` (labels, `serviceLabel`, plannerstappen), `queries.ts` (pure aggregaties, `buildDashboard`), `repository.ts` (`loadAnalyticsDashboard`: vier parallelle Supabase-reads via `adminDb()`: facts ga4 in venster, inquiries `received_at, origin, traffic_class, traffic_source`, laatste 60 sync-runs, bestaat-er-een-fact; geen provider-call), `actions.ts` (`refreshAnalytics`: `requireAdmin`, `rateLimit` 1 per 600 s per admin uit `src/lib/payments/rate-limit.ts`, zelfde `executeAnalyticsSync`, dry run als de schakelaar uit staat).
- UI `src/components/admin/analytics/`: `dashboard.tsx` (server; `AnalyticsDashboardView`, `PeriodSwitch`), `trend-line.tsx` (inline SVG), `refresh-button.tsx` (client, `useActionState`).
- Blokken: kerncijfers (sessies, gebruikers, betrokken sessies, betrokkenheid, paginaweergaven, key events, aanvragen, conversie = aanvragen ÷ sessies; huidig/vorig/delta) + trendlijn; herkomst (GA-kanalen naast aanvragen per klasse en bron, toelichting "Direct / onbekend"); AI-verwijzingen (GA "AI Assistant"-kanaal of bron in `aiSources`, samengevoegd met aanvragen); geografie top 15 met privacyhint; landingspagina's top 20 met page_type; diensten (views, CTA-klikken) en projecttypes (selecties, planner-CTA, planner_complete per project_type); CTA's (cta_id, cta_target, placement); plannerfunnel (start → vier stappen zonder `back` → complete, doorstroom, fouten per step_name); contactfunnel; synchronisatie (config, schakelaar, laatste succes/fout, per-rapport status, "GA4 niet gekoppeld: <envnaam>").
- Tests: `queries.test.ts`, `dashboard.test.tsx` (renderToStaticMarkup met fixture-facts, geen fetch).
- **Fase 3/4 voegen hier blokken "Google Search" en "Bing Search" toe: rapport-keys in `repository.ts` uitbreiden, aggregaties in `queries.ts`, tabellen in `dashboard.tsx`.**

## 10. Omgevingsvariabelen

Gedocumenteerd in `.env.example`:
- bestaand: `NEXT_PUBLIC_GA_MEASUREMENT_ID` (build-time, bepaalt of consent-UI en tag bestaan), `SUPABASE_SECRET_KEY`, `CRON_SECRET`, `RETENTION_ENABLED`
- nieuw, server-only: `GA4_PROPERTY_ID`, `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`, `ANALYTICS_SYNC_ENABLED`

Geen van de nieuwe waarden staat in Vercel. De Vercel MCP-koppeling toont het project (`prj_CHhDfdlNzeK3wkdHhX9gXLOQYH2d`, team `majdwebcreations-projects`) maar geeft 404 op projectdetails en env vars; productiewaarden zijn dus niet verifieerbaar vanuit een sessie.

## 11. Nog handmatig door de eigenaar

1. Migraties toepassen, in volgorde: ~~`20260923120000_inquiry_attribution.sql`~~ (toegepast 24 september 2026 als `20260923223958`), `20260923120100_analytics_facts.sql` (ook nog open uit een eerdere fase: `20260923080000_redact_activation_tokens.sql`). Daarna `database.types.ts` regenereren.
2. Vercel Production/Preview: de vier nieuwe variabelen; `ANALYTICS_SYNC_ENABLED=true` pas na een paar dry-runs.
3. Google Cloud: project, Analytics Data API aan, service account + sleutel, Viewer op de GA4-property. Voor fase 3 tevens Search Console API aan en het service account als gebruiker "Beperkt" op de Search Console-property (community-gedocumenteerd, bevestigen met een eerste aanroep).
4. GA4 UI: 29 custom dimensions + metric `step_index`, key events `contact_submit`/`planner_complete`, retentie 14 maanden, Google Signals uit, geen Ads, Enhanced Measurement history-changes aan en outbound/form uit, unwanted referral `mollie.com`, internal traffic.
5. Privacytekst bevestigen; `indexable` in `privacy.ts` terug op `true`.
6. Nog open uit fase privacy-2: WAF-limiet op `POST /api/contact`, CSP van report-only naar enforce.

## 12. Tests en build (23 september 2026)

- `npm run lint` schoon; `npx tsc --noEmit` schoon; `npm test` 88 bestanden, 1068 tests groen (17 skipped, 1 bestand skipped, ongewijzigd); `next build` groen, alle publieke routes SSG, `/admin/analytics` en `/api/cron/analytics-sync` dynamisch.
- Headless verificatie (puppeteer-core in de sessie-scratchpad, gtag.js gestubd, `/api/contact` gestubd): geen request/storage vóór toestemming; correcte events en parameters na toestemming; intrekken stopt alles; `/?utm_source=chatgpt.com` → aanvraag met `ai_assistant / chatgpt.com / landingPath /nl` en `planner_complete` met `traffic_*`; harde herlaad zonder toestemming verliest de bron (`internal`), met toestemming behoudt hem via sessionStorage, intrekken wist sessionStorage; geen PII in events. `/admin/analytics` zonder sessie → 307 naar `/admin/login`.

## 13. Bekende risico's en open punten

- Tot de custom dimensions in GA bestaan falen `ga4.events`, `ga4.funnel` en `ga4.key_events_sources` (`compatibility`/`http 400`); de zes andere rapporten syncen door.
- De Data API is alleen tegen fixtures getest; de eerste productie-dry-run is de echte controle.
- `analytics_facts.date` volgt de tijdzone van de GA-property; het dashboard rekent in Amsterdam-tijd.
- Hoe GA een bezoek met alleen `utm_source=chatgpt.com` (zonder medium) indeelt is niet gedocumenteerd; de eigen `traffic_class` is de waarheid voor aanvragen.
- Adblockers laden gtag.js niet; attributie op aanvragen werkt dan nog, de GA-cijfers niet.
- `docs/seo-fase-3-techniek.md` beschrijft nog Web Vitals naar GA; gedateerd rapport, bewust niet aangepast.

## 14. Aanknopingspunten voor fase 3 en 4

- Search Console (geverifieerd 23-09-2026): `POST https://www.googleapis.com/webmasters/v3/sites/{siteUrl}/searchAnalytics/query`, dims `date, query, page, country, device, searchAppearance`, `type` web, `rowLimit` ≤25.000 met `startRow`, `dataState` `all`|`final`, landen ISO-3166-1 alpha-3, datums Pacific time, ~16 maanden historie, 1.200 QPM per site. AI Overviews/AI Mode zitten in `web` zonder filter; het rapport "Search Generative AI performance" heeft geen API. `siteUrl` `sc-domain:ymcreations.com` bij een domeinproperty (propertytype nog te bevestigen). Geplande rapport-keys: `gsc.totals`, `gsc.queries`, `gsc.pages`, `gsc.query_page`, `gsc.countries`, `gsc.devices`, `gsc.appearance`. Env: `GSC_SITE_URL`; hergebruik service account.
- Bing (geverifieerd 23-09-2026): alleen JSON, `GET https://ssl.bing.com/webmaster/api.svc/json/<Methode>?apikey=…&siteUrl=…` (SOAP/POX uit sinds 31-08-2026); antwoorden `{"d": …}`, datums `/Date(ticks)/`, fouten HTTP 400 `{ErrorCode, Message}`; methoden `GetRankAndTrafficStats` (dagelijks, Web+Chat), `GetQueryStats`, `GetPageStats`, `GetPageQueryStats` (wekelijks), `GetCrawlStats` (6 maanden); geen land/apparaat, geen gepubliceerde rate limits, ~6 maanden historie; AI Performance-rapport zonder API. Env: `BING_WEBMASTER_API_KEY` (of OAuth `webmaster.read`), `BING_SITE_URL`.
- Beide: eigen adapter onder `src/lib/analytics-admin/providers/`, toevoegen aan `executeAnalyticsSync`, preflight per provider (ontbrekende variabele per naam), rapport-keys in `repository.ts`, aggregaties + blok in `queries.ts`/`dashboard.tsx`, fixtures-tests zonder echte API-calls, sync-status per provider in het dashboard.

## 15. Fase 2.5, 3 en 4 (23 september 2026)

**Fase 2.5 — multi-provider fundament**
- `analytics-admin/types.ts`: `ProviderAdapter` heeft nu `plan(report, {now, ignoreCadence}) → SyncPlan[]` en `fetch(report, plan)`; `SyncPlan = {phase: recent|final|snapshot, window}`. `ProviderEntry` = adapter óf `{configured:false, missing}`. `ProviderHealth` = `configured | not_configured | auth_failed | provider_error | ok`. `SyncSummary` heeft `providers[]` en per rapport `windows[]` (geen globaal `window` meer). Nieuwe foutklasse `empty_response`. `FactsStore.upsert(rows, syncedAt)` + `deleteStale({provider, report, dates, syncedAt})`.
- `schedule.ts`: `dateKeyIn(now, tz)`, `windowFrom`, `daysIn`, `Cadence` (`daily` / `weeklyOn(weekday, tz)`), `isDue`. `shiftDate` woont hier (runner her-exporteert).
- `runner.ts`: per provider; niet-geconfigureerd → `not_configured`, niets geprobeerd. Per rapport: plan (leeg = `skipped`, geen run-record) → startRun → check → fetch per plan → dedupe → upsert met één `syncedAt` → `deleteStale` voor de datums die dit antwoord bevatte → finishRun. Na een `auth`-fout vraagt de runner die provider niets meer en faalt de overige rapporten met dezelfde klasse. Dry run: geen upsert/deleteStale/run/retentie.
- `google-auth.ts`: `readServiceAccountConfig`, `readGa4Config`, `readGscConfig` (elk noemt alleen eigen + gedeelde ontbrekende variabelen); `readGoogleConfig` bestaat niet meer. `googleTokenSource(account, scopes)` cachet per `email + genormaliseerde scopes` (gesorteerd, ontdubbeld); `resetGoogleTokenSources()` voor tests.
- `sync.ts`: `providerEntries(env)`, `providerConfigStatus(env)` (voor het dashboard), `executeAnalyticsSync({now, ignoreCadence, env, fetch, store})`. Enige globale weigering: schrijven aan maar geen `SUPABASE_SECRET_KEY` → `{ok:false, reason:"store_not_configured"}` → cron 503. Een ontbrekende provider is een normale 200. De knop "Vernieuw nu" draait met `ignoreCadence: true`.
- `synced-providers.ts`: `["ga4","gsc","bing"]`; Clarity later = entry hier + adapter + label in `admin/analytics/providers.ts`.

**Fase 3 — Search Console** (`providers/gsc.ts`, env `GSC_SITE_URL`, scope `webmasters.readonly`)
- Endpoint `POST https://www.googleapis.com/webmasters/v3/sites/{siteUrl}/searchAnalytics/query`, `type: web`. `siteUrl` als `sc-domain:…` of URL-prefix met slash; beide geaccepteerd, geen aanname.
- Datums in Pacific-tijd. Plan per dagrapport: `final` = PT-vandaag −10 t/m −4 met `dataState: final`; `recent` = −3 t/m vandaag met `dataState: all`. Voorlopige rijen worden overschreven zodra de final-read die dag teruggeeft; dagen zonder antwoord blijven staan.
- Rapporten: `gsc.totals` (date), `gsc.queries` (query, per dag top 500, één request per dag), `gsc.pages`, `gsc.countries` (alpha-3 zoals geleverd), `gsc.devices`, `gsc.appearance` (dim `appearance`), `gsc.query_page` (query+page, wekelijks maandag, 28 settled dagen, opgeslagen op de einddatum met metric `window_days`). Metrics `clicks, impressions, ctr, position`.
- Totalen alleen uit `gsc.totals`; queryrijen nooit opgeteld tot totaal. AI Overviews/AI Mode zitten in `web`; geen API voor AI-rapport → dashboardkaart met link.

**Fase 4 — Bing** (`providers/bing.ts`, env `BING_WEBMASTER_API_KEY`, `BING_SITE_URL`)
- `GET https://ssl.bing.com/webmaster/api.svc/json/<Methode>?siteUrl&apikey`, `{"d": …}` (`d: null` = leeg), `/Date(ms±hhmm)/` → dag in eigen offset.
- `bing.traffic` (GetRankAndTrafficStats, dagelijks, 14 dagen bewaard; volgens Microsoft sinds 24-03-2023 alle verticals incl. Chat → label "Web + Chat"), `bing.queries` / `bing.pages` (GetQueryStats/GetPageStats, door Bing wekelijks bijgewerkt; wij maandag, 42 dagen; positie < 0 = niet gerapporteerd), `bing.crawl` (GetCrawlStats, alleen aanwezige numerieke velden). Geen land/apparaat.
- Fouten: 400 `ErrorCode` 3/6/14 → `auth 400`, 4/5 → `quota 400`, anders `http 400`; lege body `empty_response`. Key alleen in de request-URL, nooit in fout/log. `BingAuth` is een union (nu alleen `api_key`), OAuth later mogelijk.

**Dashboard**
- `admin/analytics/search-queries.ts`: `buildGoogleSearch`, `buildBingSearch`, `buildAcquisition`, `buildInsights`, `risersAndFallers`; CTR = klikken/impressies, positie impressie-gewogen. Drempels: stijgers/dalers ≥50 impressies en ≥3 klikken verschil, percentage vanaf 10 klikken basis; inzichten: lage CTR ≥200 impressies en < ½ site-CTR, Google-klikken ±25% vanaf 30, dienst ≥50 views en <2% CTA, bron ≥100 sessies zonder aanvraag.
- `branded.ts`: "ym creations"/"ymcreations" als hele woorden na normalisatie (NFKC, lowercase, `-._/` → spatie).
- `page-types.ts#describeSearchPage`: pad → page_type, service via `getServiceBySlug`, artikel-slug.
- `aggregate.ts` (sum/compare/daily), `DailyPoint` is nu `{date, value}`; `TrendLine` heeft `unit`.
- Repository leest facts van alle providers gepagineerd (1.000 per request, plafond 100.000, `sync.truncated`), runs en "heeft facts" per provider.
- UI: `search-sections.tsx` (Opvallend, Per bron naast elkaar, Google Search, Bing Search), `sync-status.tsx` (kaart per provider), `parts.tsx` (num/pct/Delta/Empty). Geen module-brede "GA4 niet gekoppeld" meer.

**Tests**: `runner.test.ts` (isolatie, auth-kortsluiting, skipped, plannen, dry run, voorlopig→final), `google-auth.test.ts` (config-scheiding, scope-cache), `sync.test.ts` (env→summary met nep-fetch), `providers/gsc.test.ts`, `providers/bing.test.ts`, `search-queries.test.ts`, `queries.test.ts`, `dashboard.test.tsx`, cron-route. Stand: 92 bestanden, 1168 tests groen (17 skipped); lint, tsc, build groen.

**Nog door de eigenaar**
1. Migraties (ongewijzigd, §11.1). Geen nieuwe migratie nodig voor 2.5/3/4.
2. Vercel: `GSC_SITE_URL`, `BING_WEBMASTER_API_KEY`, `BING_SITE_URL` naast de GA-variabelen.
3. Google Cloud: Search Console API aanzetten; service account als gebruiker (Beperkt) op de Search Console-property; propertytype bepaalt `GSC_SITE_URL`.
4. Bing Webmaster Tools: site geverifieerd, API-key aanmaken.
5. Eerste dry-runs lezen (cron-log toont per provider `health` en per rapport `windows`/`rows`/`error`), daarna pas `ANALYTICS_SYNC_ENABLED=true`.

**Risico's**
- Alleen tegen fixtures getest; eerste echte dry-run is de controle (met name GSC-permissies en Bing-positie-schaal).
- Geen historische backfill: GSC begint met ~11 dagen, Bing met 14 (traffic) / 42 dagen; 90-dagen-vergelijkingen vullen zich in de loop van maanden.
- Cron `maxDuration 60` en alles sequentieel (~30–40 requests, maandag meer); bij groei per provider splitsen.
- Dashboard leest facts zonder DB-aggregatie; bij veel GSC-queries (500/dag × 180 dagen) kan het plafond geraakt worden → dan een aggregatie-RPC of kleinere top-N.

## 16. Pre-production hardening (23 september 2026)

- **Queryfilter** `analytics-admin/query-filter.ts` (`sanitizeSearchQuery`), gebruikt in `gsc.ts` (gsc.queries, gsc.query_page) en `bing.ts` (bing.queries) vóór `dims.query`. Gedropt: leeg, control/format-tekens, > 200 tekens, e-mail, ≥ 9 cijfers in een telefoonachtige reeks (ook BSN/rekening/IBAN), volledige URL (`scheme://`, `www.`), JWT, bekende key-prefixen, woord ≥ 20 tekens met letters én cijfers, ≥ 32 hex. Gedropte rijen worden alleen geteld (`FetchResult.filtered` → `ReportRunResult.filtered` → cron-log), nooit gelogd.
- **Retentie** `analytics-admin/retention.ts`: `aggregate` 26 maanden, `query_text` 16 maanden (gsc.queries, gsc.query_page, bing.queries). `reportRetention` is getypeerd over alle report-keys: een nieuw rapport compileert niet zonder klasse; de runner weigert `dims.query` onder een niet-`query_text`-rapport. Cleanup in `runner.ts#applyRetention`, alleen na een applied run; `summary.retention` is nu een lijst per klasse.
- **Concurrency**: providers parallel, per provider max. 3 rapporten tegelijk (`mapWithLimit`, `REPORT_CONCURRENCY`); binnen een rapport blijven requests sequentieel. Rapporten die 45 s na de start nog niet begonnen zijn, falen als `deadline`. Tokenbron deelt één uitwisseling tussen gelijktijdige aanroepen.
- **Timeouts** `analytics-admin/http.ts#fetchWithTimeout`: 10 s per request inclusief body, `AbortSignal.timeout` plus race (werkt ook als fetch het signaal negeert) → `ProviderError("timeout")`. Gebruikt door GA4, GSC, Bing en de tokenuitwisseling.
- **Privacy** `privacy.ts` NL/EN: alinea "Vindbaarheid in zoekmachines" / "Visibility in search engines" en een bewaartermijnregel (16 maanden). `indexable` blijft false; `cookies.ts` ongewijzigd.

## 17. Production-readiness fix (23 september 2026)

- **Retentie onafhankelijk van de sync**: de algemene job `/api/cron/retention` (05:00, `RETENTION_ENABLED`, anders dry-run) verwijdert nu ook `analytics_facts`: `query_text` (gsc.queries, gsc.query_page, bing.queries) na 16 maanden, alles na 26. Doelen komen uit `analytics-admin/retention.ts#analyticsRetentionTargets`, dezelfde lijst die de sync als tweede lijn gebruikt. `RetentionStore.countAnalyticsFacts` / `deleteAnalyticsFacts` werken op datum + rapport met een database-count; er wordt geen fact-rij (dus geen dims) gelezen. Summary/log: `analyticsFacts: [{retentionClass, cutoff, selected}]`.
- **Requestconcurrency**: per provider één request-poort (`createRequestGate`, `PROVIDER_REQUEST_CONCURRENCY = 3`) over alle rapporten en dagen; `gsc.queries` vraagt dagen met `GSC_DAY_CONCURRENCY = 3` via die poort. Theoretisch maximum: 3 per provider, 9 totaal, plus ≤ 2 tokenuitwisselingen (één per Google-scope) = 11. Paginering (GA4, GSC) blijft sequentieel (afhankelijk van het vorige antwoord); Bing doet één request per rapport.
- **Deadline**: `RUN_DEADLINE_MS = 40 000`, één gedeelde `pastDeadline` voor runner (geen nieuw rapport) en poorten (geen nieuw request) → `deadline`. Laatste request eindigt uiterlijk ~50 s (10 s timeout).
- **Stale runs**: bij de start van een applied sync zet `FactsStore.failStaleRuns` runs die > 15 min op `running` staan op `failed`, `error = 'stale_run'`; telling in `summary.staleRunsRecovered`. Fouten hierbij stoppen de sync niet. Dry run raakt niets.

## 18. Fase 5 — Microsoft Clarity (23 september 2026)

**Consent**: `CONSENT_VERSION = 2`, cookie `2.a<0|1>.r<0|1>.<moment>` (`recordings` = gedragsopnames). Versie-1-waarden worden herkend (`storedConsentVersion`) maar gelden als geen keuze → opnieuw vragen. `decideConsent({analytics, recordings})`; categorieën onafhankelijk. Intrekken van opnames: `withdrawClarity()` (legacy `clarity('consent', false)`, alleen in `lib/clarity/client.ts`) + `_clck`/`_clsk` verlopen + `reloadRequired` → dialoog herlaadt. Dialoog toont alleen geconfigureerde categorieën; "Alles accepteren" = alleen die.

**Tag**: `components/consent/clarity-script.tsx`, alleen bij `NEXT_PUBLIC_CLARITY_PROJECT_ID` + `recordings` + `clarityAllowedOnPath` (niet `/admin`, `/<locale>/incasso/*`, `/<locale>/betaling/*`). Loader = Microsofts snippet + direct `consentv2 {ad_Storage: denied, analytics_Storage: granted}` in de wachtrij. Clientnavigatie naar een uitgesloten route na laden → reload. Geen identify, geen custom tags.

**Masking**: `data-clarity-mask="true"` op contactformulier-container, volledige planner, incasso- en betaalpagina's; nergens unmask (`lib/clarity/masking.test.ts`).

**CSP** (`lib/csp/policy.ts`, nog Report-Only): `https://*.clarity.ms` in script-src en connect-src; c.bing.com bewust niet (MUID-cookie-sync).

**Teksten**: privacy.ts (Clarity-sectie: doel, opnames/heatmaps/frustratiesignalen, alleen na aparte toestemming, masking, geen identificatie, Microsoft zelfstandig verwerkingsverantwoordelijke en volgens Terms eigen doeleinden incl. advertentieprofielen, link Microsoft Privacy Statement, Microsoft-retentie 30 d / 9 mnd, eigen 90 dagen; ontvangers, doorgifte, bewaartermijnen). cookies.ts: sectie + tabel `_clck`, `_clsk`, MUID/CLID/ANONCHK/MR/SM volgens Microsoft-docs, looptijden "door Microsoft bepaald" tot browserverificatie; `indexable: false`.

**Export**: `providers/clarity.ts`, `CLARITY_API_TOKEN`; `clarity.live` (URL) en `clarity.totals`, `numOfDays=3`, 2 requests per run, momentopname op UTC-dag. Numerieke velden van toegestane metrics als `<metric>_<field>`; alleen pad (geen query), uitgesloten routes en identifier-achtige segmenten gefilterd. Veldnamen buiten Traffic zijn niet door Microsoft gedocumenteerd → eerste echte antwoord controleren (`clarity-queries.ts` kandidaten).

**Retentie**: klasse `clarity_live` 90 dagen (`retention.ts`, nu `{months}`/`{days}`), via `/api/cron/retention` en de sync.

**Dashboard**: blok "Gedrag" (`clarity-section.tsx`): laatste momentopname, tegels, probleem-URL's, link naar clarity.microsoft.com (geen ongedocumenteerde deep link). Providerkaart toont "Tracking op de website" en "Export-API" apart.

**Verificatie**: headless (stub-tag, `scratchpad/verify-clarity.mjs` van die sessie) 37/37: geen clarity.ms vóór keuze / bij noodzakelijk / bij alleen statistieken; tag + collect + consentv2 bij opnames; intrekken → reload, 0 requests, cookies weg; GA en Clarity onafhankelijk; v1-cookie → opnieuw vragen; uitgesloten routes en admin 0 requests; masking in DOM.

**Open (eigenaar)**: Clarity-project, Masking = Strict, env vars, echte-tag-controle van cookies (namen, looptijd, domein, SameSite, third-party), test-opname op masking, eerste Data-Export-antwoord op veldnamen, juridische review van tekst (Terms 4.b: vermelding Microsoft Advertising), `cookieStatement.indexable` terug na review.
