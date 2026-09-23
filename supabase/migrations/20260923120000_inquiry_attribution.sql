-- Where a request came from.
--
-- Five nullable columns on inquiries: the class of the source, the source
-- itself (a hostname or a UTM source), the medium, the campaign, and the
-- path of the first page of the visit. Together they answer "through which
-- channel did this request reach us" and nothing more: no full referrer, no
-- query string, no identifier of the visitor. The browser classifies
-- (lib/attribution/classify.ts) and the contact route checks the result
-- against the same rules before it is written; a value that does not fit
-- exactly is dropped as a whole, so every row here is either complete and
-- checked, or entirely null.
--
-- The check on traffic_class is the exact list the application knows. There
-- is deliberately no 'unknown': a request whose origin could not be
-- established simply has no origin, and null says that better than a label.
--
-- The visitor's insert grant grows by exactly these five columns; nothing
-- else changes about what anon may do. The policy repeats the shapes the
-- route enforces, as a last line behind it.

alter table public.inquiries
  add column traffic_class  text check (traffic_class in ('organic_search', 'ai_assistant', 'social', 'campaign', 'referral', 'internal', 'direct')),
  add column traffic_source text check (length(traffic_source) <= 100),
  add column traffic_medium text check (length(traffic_medium) <= 100),
  add column campaign       text check (length(campaign) <= 100),
  add column landing_path   text check (length(landing_path) <= 200 and landing_path like '/%' and landing_path not like '//%');

comment on column public.inquiries.traffic_class is 'How the visit that led to this request was classified; null when it could not be established.';
comment on column public.inquiries.traffic_source is 'Canonical hostname of the source (google.com, chatgpt.com) or the UTM source of a campaign.';
comment on column public.inquiries.landing_path is 'Path of the first page of the visit, without query string.';

-- The five columns arrive together or not at all.
alter table public.inquiries
  add constraint inquiries_attribution_shape check (
    (traffic_class is null and traffic_source is null and traffic_medium is null and campaign is null and landing_path is null)
    or (traffic_class is not null and landing_path is not null)
  );

grant insert (traffic_class, traffic_source, traffic_medium, campaign, landing_path)
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
    and length(btrim(message)) between 1 and 20000
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
  );

-- The dashboard groups requests by origin and by day.
create index inquiries_traffic_class_idx on public.inquiries (traffic_class) where traffic_class is not null;
