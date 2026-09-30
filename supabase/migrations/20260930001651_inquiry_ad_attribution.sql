-- Paid search attribution on inquiries.
--
-- Five nullable columns next to the attribution of 20260923223958:
--
--   utm_term, utm_content  the two UTM values the first set left out; for a
--                          search ad utm_term is the keyword. Same cleaning
--                          and limits as campaign.
--   gclid, gbraid, wbraid  the click identifiers Google Ads appends to an
--                          ad's landing URL (auto-tagging). They identify one
--                          ad click, so the contact route writes them only
--                          when the request carries a yes to marketing; they
--                          are what Google Ads' offline conversion import
--                          matches on, should that ever be used.
--
-- All five are written only when there is a value, and are deleted with the
-- inquiry (lib/retention/policy.ts). The visitor's insert grant grows by
-- exactly these columns. The intake policy is recreated with every check it
-- had in production on 30 September 2026 (the websitecheck version), plus
-- the shapes of the new columns.
--
-- Additive: code that does not know these columns keeps working unchanged.
-- Apply BEFORE deploying the code that writes them. (That code falls back to
-- an insert without them if they are missing, and the admin inquiry pages
-- read them, so the admin needs this migration to load inquiries.)

alter table public.inquiries
  add column utm_term    text check (length(utm_term) <= 100),
  add column utm_content text check (length(utm_content) <= 100),
  add column gclid       text check (gclid ~ '^[A-Za-z0-9._-]+$' and length(gclid) between 8 and 256),
  add column gbraid      text check (gbraid ~ '^[A-Za-z0-9._-]+$' and length(gbraid) between 8 and 256),
  add column wbraid      text check (wbraid ~ '^[A-Za-z0-9._-]+$' and length(wbraid) between 8 and 256);

comment on column public.inquiries.utm_term is 'utm_term of the landing URL (for a search ad: the keyword), cleaned like campaign.';
comment on column public.inquiries.utm_content is 'utm_content of the landing URL (ad or link variant), cleaned like campaign.';
comment on column public.inquiries.gclid is 'Google Ads click id of the landing URL, only stored with marketing consent.';
comment on column public.inquiries.gbraid is 'Google Ads click id (iOS, app) of the landing URL, only stored with marketing consent.';
comment on column public.inquiries.wbraid is 'Google Ads click id (iOS, web) of the landing URL, only stored with marketing consent.';

-- The UTM extras belong to an attribution; they never exist without one.
alter table public.inquiries
  add constraint inquiries_utm_extras_need_attribution check (
    (utm_term is null and utm_content is null) or traffic_class is not null
  );

grant insert (utm_term, utm_content, gclid, gbraid, wbraid)
  on table public.inquiries to anon;

drop policy if exists inquiries_public_intake on public.inquiries;
create policy inquiries_public_intake
  on public.inquiries
  for insert
  to anon
  with check (
    status = 'new'
    and internal_note is null
    and length(btrim(name)) between 2 and 200
    and length(btrim(email)) <= 320
    and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    and length(btrim(message)) <= 20000
    and (origin = 'websitecheck' or length(btrim(message)) >= 1)
    and length(coalesce(company, '')) <= 200
    and length(coalesce(phone, '')) <= 60
    and (
      planner is null
      or (jsonb_typeof(planner) = 'object' and pg_column_size(planner) <= 65536)
    )
    and (traffic_source is null or traffic_source ~ '^[a-z0-9][a-z0-9._ -]*$')
    and (traffic_medium is null or traffic_medium ~ '^[a-z0-9][a-z0-9._ -]*$')
    and (campaign is null or campaign ~ '^[a-z0-9][a-z0-9._ -]*$')
    and (landing_path is null or landing_path ~ '^/[^[:space:][:cntrl:]<>"''`\\]*$')
    and (utm_term is null or utm_term ~ '^[a-z0-9][a-z0-9._ -]*$')
    and (utm_content is null or utm_content ~ '^[a-z0-9][a-z0-9._ -]*$')
  );
